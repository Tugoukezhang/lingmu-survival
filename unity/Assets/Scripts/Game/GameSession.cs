// Runs the game rules (Lingmu.Rules) inside a scene: keeps the one game state across scenes, loads / saves it, moves the
// clock, applies survival, ends the day, switches areas (scenes), runs battles. What is special about a place
// (home farm, expedition resources, town residents, the room) lives in that scene's Area component.
// Everything that changes the game state goes through here or an Area, so the UI only draws and calls.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Lingmu.Rules;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Lingmu.Game
{
    // save files in the app's private folder: one file per key, written through a temp file so a crash can't half-write
    public class FileSaveStorage : ISaveStorage
    {
        readonly string dir;
        public FileSaveStorage(string dir) { this.dir = dir; Directory.CreateDirectory(dir); }
        string PathOf(string key) => System.IO.Path.Combine(dir, key + ".txt");
        public string Get(string key) => File.Exists(PathOf(key)) ? File.ReadAllText(PathOf(key)) : null;
        public void Set(string key, string value) { var tmp = PathOf(key) + ".tmp"; File.WriteAllText(tmp, value); if (File.Exists(PathOf(key))) File.Delete(PathOf(key)); File.Move(tmp, PathOf(key)); }
        public void Remove(string key) { if (File.Exists(PathOf(key))) File.Delete(PathOf(key)); }
    }

    public class Spot { public string kind, verb, label, key; public Vector3 pos; public object data; }

    // one per scene: what can be done where, and what the place does every 10 game minutes
    public abstract class Area : MonoBehaviour
    {
        public abstract string Id { get; }                                  // home | expedition | town | house
        public abstract Vector3 ArrivePoint(GameState s);                   // where the player appears when not restoring a position
        public virtual bool CanStand(Vector3 p) => true;
        public virtual Spot CurrentSpot(Vector3 p) => null;
        public virtual string Act(Spot s) => null;                          // returns a panel for the UI to open, or null
        public virtual void OnTick() { }
        public virtual void OnDayEnded() { }
        public virtual void OnBattleEnded(string wildId, string result) { }
        public virtual System.Collections.Generic.IEnumerable<Spot> MapSpots() => System.Array.Empty<Spot>();   // marks on the map panel
        // where a goal's place is in this scene (Rules/Goals.cs): a spot kind, or "kind:key" for one thing; null = not here
        public virtual Vector3? FindPlace(string place, Vector3 from)
        {
            int c = place.IndexOf(':');
            string kind = c < 0 ? place : place.Substring(0, c), key = c < 0 ? null : place.Substring(c + 1);
            Vector3? best = null; float bd = float.MaxValue;
            foreach (var s in MapSpots())
            {
                if (s.kind != kind || (key != null && s.key != key)) continue;
                float d = (s.pos - from).sqrMagnitude;
                if (d < bd) { bd = d; best = s.pos; }
            }
            return best;
        }
        protected GameSession Session => GameSession.I;
        protected GameState S => GameSession.I.S;
    }

    public class GameSession : MonoBehaviour
    {
        public static GameSession I { get; private set; }
        public const float PxPerMeter = 48f;                 // web saves positions in px (1 tile = 48 px = 1 m)
        public static readonly Dictionary<string, string> Scenes = new Dictionary<string, string> { { "home", "HomeIsland" }, { "expedition", "Expedition" }, { "town", "Town" }, { "house", "House" } };

        public Transform player;
        public Light sun;
        public float timeScale = 1;                          // > 1 for testing day / night
        public bool indoor;                                  // the room: warm lamplight instead of the night blue

        public static string SaveDirOverride;                // tests: keep their saves away from the real one
        static GameState shared;                             // survives scene changes
        static SaveStore store;
        static string storeDir;
        public static SettlementReport PendingReport;        // to show after a scene change (fainting)
        public static string PendingToast;

        public GameState S { get; private set; }
        public Area Area { get; private set; }
        public readonly GameClock Clock = new GameClock();
        public event Action Changed;                         // something the HUD shows changed
        public event Action<string> Toast;
        public event Action<SettlementReport> DayEnded;
        public event Action<BattleState> BattleStarted;
        public event Action<BattleSummary> BattleFinished;
        public event Action<string, Vector3> ItemGained;     // an item picked up here: its icon flies into the bag button
        public void Gained(string itemId, Vector3 at) => ItemGained?.Invoke(itemId, at);
        public string LoadProblem { get; private set; }
        public BattleState Battle { get; private set; }
        string battleWild;

        Color sunColor; float sunIntensity; Color ambient, equator, groundAmb, fogColor; Material sky; float skyExposure;
        int ticksSinceSave;
        bool leaving;

        static string Dir => SaveDirOverride ?? System.IO.Path.Combine(Application.persistentDataPath, "save");
        public static SaveStore Store
        {
            get
            {
                if (store == null || storeDir != Dir) { store = new SaveStore(new FileSaveStorage(Dir)); storeDir = Dir; shared = null; }
                return store;
            }
        }

        public static bool HasSave => Store.Load(() => null).source != "new";
        public static void UseState(GameState s) { var _ = Store; shared = s; }   // the title page starts a new game with this
        public static void ForgetState() { shared = null; }                       // tests

        void Awake()
        {
            I = this;
            Area = FindAnyObjectByType<Area>();
            var st = Store;
            if (shared == null)
            {
                var loaded = st.Load(() => SaveRules.NewGameState(starter: "fox"));
                shared = loaded.state;
                LoadProblem = loaded.problem;
            }
            S = shared;
            if (Area != null && S.player.area != Area.Id)
            {
                // opened this scene directly (editor / tests): pretend we arrived here
                if (Area.Id == "expedition" && S.expedition == null) S.expedition = new ExpeditionState { seed = Travel.NewIslandSeed(S) };
                S.player.area = Area.Id; S.player.x = S.player.y = null;
            }
            if (sun) { sunColor = sun.color; sunIntensity = sun.intensity; }
            ambient = RenderSettings.ambientSkyColor; equator = RenderSettings.ambientEquatorColor; groundAmb = RenderSettings.ambientGroundColor; fogColor = RenderSettings.fogColor;
            if (RenderSettings.skybox) { sky = new Material(RenderSettings.skybox); RenderSettings.skybox = sky; skyExposure = sky.HasProperty("_Exposure") ? sky.GetFloat("_Exposure") : 1; }   // a copy: never change the saved asset
            SwapHero();
        }

        // round 2 (docs/21): the hero remade on the Tripo website replaces the model the scene was built with, at the same
        // height, so the scenes don't have to be rebuilt. PlayerMover picks up the new model's animator in its Start.
        public const float HeroHeight = 1.35f;
        void SwapHero()
        {
            if (!player) return;
            var mover = player.GetComponent<Player.PlayerMover>();
            var e = World.ModelLibrary.Get ? World.ModelLibrary.Get.Find("hero") : null;
            if (!mover || !mover.model || e == null || !e.model) return;
            var old = mover.model;
            var g = World.ModelLibrary.Place("hero", player, player.position, HeroHeight, true, 0);
            g.transform.localPosition = new Vector3(0, g.transform.localPosition.y, 0);
            mover.model = g.transform;
            Destroy(old.gameObject);
        }

        void Start()
        {
            if (player && Area != null)
            {
                var at = Area.ArrivePoint(S);
                if (S.player.x != null && S.player.y != null)
                {
                    var saved = new Vector3((float)S.player.x.Value / PxPerMeter, at.y, -(float)S.player.y.Value / PxPerMeter);
                    if (Area.CanStand(saved)) at = saved;
                }
                player.position = new Vector3(at.x, player.position.y, at.z);
                S.flags.arriveAt = null;
            }
            if (LoadProblem != null) Say("存档读取有问题，已用备份或新存档继续");
            if (PendingToast != null) { Say(PendingToast); PendingToast = null; }
            ApplyLight();
            World.Foliage.ApplyScene();   // the scene's trees and bushes sway in the wind
            if (player && !indoor) { var fx = new GameObject("motes").AddComponent<World.FxEmitter>(); fx.kind = "motes"; fx.transform.SetParent(player, false); }
            AfterAction();   // arriving may finish a goal (the trip out, the walk to town) before anything else happens
            if (PendingReport != null) { var r = PendingReport; PendingReport = null; Clock.Pause("report"); DayEnded?.Invoke(r); }
        }

        // ---------- the clock ----------
        void Update()
        {
            if (leaving) return;
            foreach (var e in Clock.Advance(S, Time.deltaTime * 1000 * timeScale))
            {
                if (e.type == "tick") OnTick();
                else if (e.type == "phase") OnPhase(e.to);
                else if (e.type == "bedtime") { Say("太晚了……你困得睡着了"); EndDay(true); }
                else if (e.type == "dawn") { Say("天亮了，你一夜没睡"); EndDay(false); }
                if (leaving) break;
            }
        }

        void OnPhase(string to)
        {
            ApplyLight();
            bool away = S.player.area == "expedition";
            Say(to switch
            {
                "dusk" => away ? "天黑了：20 点起雾。在岛上过夜大约要 8 份木材（营火 4 + 添柴 4），或者坐飞艇回家" : "天色暗下来了",
                "night" => away ? "入夜了，小心雾怪" : "夜深了，早点去睡吧",
                "day" => "天亮了",
                _ => null,
            });
        }

        void OnTick()
        {
            foreach (var ev in Survival.Tick(S.player, S.player.area))
            {
                Say(ev switch { "hungry" => "肚子有点饿了，记得吃东西", "empty" => "饿坏了！生命会慢慢减少，快吃点东西", "floor" => "快去吃点东西！再饿下去就走不动了", _ => null });
                if (ev == "faint") { Faint(); return; }
            }
            Area?.OnTick();
            ApplyLight();
            AfterAction();
            if (++ticksSinceSave >= 6) Save();      // every game hour
        }

        // the world colour by time of day (web tintAt): the sun, the sky, the ambient light and the fog all follow it
        public void ApplyLight()
        {
            var (rgb, dark) = GameTime.TintAt(S.clock);
            var tint = new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);
            float d = (float)dark;
            if (indoor && d > 0) { tint = Color.Lerp(tint, new Color(1f, 0.89f, 0.73f), 0.65f); d *= 0.4f; }
            float k = Mathf.Clamp01(d * 1.35f);                 // 0 day … 1 deep night
            if (sun) { sun.color = sunColor * tint; sun.intensity = sunIntensity * Mathf.Lerp(1, 0.12f, k); }
            var amb = Color.Lerp(tint, Color.white, 0.2f) * Mathf.Lerp(1, 0.38f, k);
            RenderSettings.ambientSkyColor = ambient * amb; RenderSettings.ambientEquatorColor = equator * amb; RenderSettings.ambientGroundColor = groundAmb * amb;
            RenderSettings.fogColor = Color.Lerp(fogColor * tint, new Color(0.16f, 0.19f, 0.32f), k * 0.85f);
            if (sky)
            {
                sky.SetFloat("_Exposure", skyExposure * Mathf.Lerp(1, 0.2f, k));
                if (sky.HasProperty("_SkyTint")) sky.SetColor("_SkyTint", Color.Lerp(new Color(0.55f, 0.72f, 0.95f), new Color(0.2f, 0.25f, 0.5f), k));   // procedural sky
                if (sky.HasProperty("_Tint"))                                                                                                            // the panorama
                {
                    var warm = Color.Lerp(new Color(0.5f, 0.5f, 0.5f), new Color(0.5f, 0.5f, 0.5f) * tint, 0.7f);
                    sky.SetColor("_Tint", Color.Lerp(warm, new Color(0.22f, 0.26f, 0.45f), k));
                }
            }
        }

        // after anything that may finish a guide goal, a daily task or show a tip
        public void AfterAction()
        {
            var goal = Guide.Check(S);
            if (goal != null) Say("完成目标：" + goal.text.Split('，', '：')[0]);
            var tip = Guide.NextTip(S);
            if (tip != null) Say(tip);
            var d = Daily.Check(S);
            foreach (var t in d.done) Say($"每日任务完成：{t.text}（四叶草 +{Daily.TaskReward}）");
            if (d.bonus) Say($"今天的任务全部完成！四叶草 +{d.bonusClover}，还有一包{GameData.Item(d.bonusSeed).name}");
            Changed?.Invoke();
        }

        static void Sfx(string name) => Lingmu.UI.GameAudio.Play(name);
        public void Say(string text) { if (!string.IsNullOrEmpty(text)) Toast?.Invoke(text); }

        public void Save()
        {
            ticksSinceSave = 0;
            if (player && !leaving) { S.player.x = Math.Round(player.position.x * PxPerMeter); S.player.y = Math.Round(-player.position.z * PxPerMeter); }
            if (!Store.Save(S)) Debug.LogWarning("[Lingmu] save failed: " + Store.lastError);
        }

        void OnApplicationPause(bool paused) { if (paused && Battle == null) Save(); }
        void OnApplicationQuit() { if (Battle == null && !leaving) Save(); }

        // ---------- panels pause the clock (web: menus stop time) ----------
        public void PauseFor(string reason) => Clock.Pause(reason);
        public void ResumeFor(string reason) => Clock.Resume(reason);

        public Spot CurrentSpot() => player && Area != null && Battle == null ? Area.CurrentSpot(player.position) : null;

        public string Act(Spot s)
        {
            if (s == null || Area == null) return null;
            Lingmu.UI.GameAudio.Verb(s.verb);
            var panel = Area.Act(s);
            if (!leaving) AfterAction();
            return panel;
        }

        // ---------- the end of a day ----------
        public void EndDay(bool slept)
        {
            var report = Settlement.Run(S, slept);
            Clock.Pause("report");
            Area?.OnDayEnded();
            if (player) S.player.x = S.player.y = null;
            Save();
            AfterAction();
            DayEnded?.Invoke(report);
        }

        // the report panel was closed: the new day starts running
        public void StartNewDay()
        {
            if (player && Area != null) { var at = Area.ArrivePoint(S); player.position = new Vector3(at.x, player.position.y, at.z); }
            Clock.Restart();
            Clock.Resume("report");
            ApplyLight();
            Changed?.Invoke();
        }

        // fainting on an expedition: one state change, then wake up at home (docs/06 第 2 节)
        public void Faint()
        {
            if (leaving) return;
            double px = player ? player.position.x * PxPerMeter : 0, py = player ? -player.position.z * PxPerMeter : 0;
            var r = Travel.Faint(S, px, py);
            PendingReport = r.report;
            PendingToast = r.isProtected ? "你晕倒了……新手保护期，东西都还在身上" : r.dropped.Count > 0 ? $"你晕倒了……背包里的 {r.dropped.Count} 样东西掉在了岛上，回去还能捡回来" : "你晕倒了……";
            Store.Unblock("battle");
            Store.Save(S);
            LoadArea("home");
        }

        // ---------- going somewhere ----------
        public void LoadArea(string area)
        {
            leaving = true;
            Clock.Pause("travel");
            SceneManager.LoadScene(Scenes[area]);
        }

        // rules first (time passes, records), then save, then the other scene
        public void GoTo(string where, string mode = "new")
        {
            Res r = where switch
            {
                "expedition" => Travel.Depart(S, mode),
                "home" when S.player.area == "expedition" => Travel.ReturnHome(S),
                "home" when S.player.area == "town" => Travel.LeaveTown(S),
                "home" when S.player.area == "house" => Travel.LeaveHouse(S),
                "town" => Travel.GoTown(S),
                "house" => Travel.EnterHouse(S),
                _ => Res.No("where"),
            };
            if (!r.ok) { Say("现在去不了"); return; }
            S.player.x = S.player.y = null;
            Store.Save(S);
            LoadArea(where);
        }

        // ---------- battles (docs/02 第 4 节): time stops, no saving until the one commit at the end ----------
        public bool StartBattle(List<PetInstance> enemies, string wildId, bool ambush)
        {
            if (Battle != null) return false;
            var party = S.party.Select(S.Pet).Where(p => p != null).ToList();
            if (!Rules.Battle.CanStart(party)) { Say("伙伴们累了，回家休息吧"); return false; }
            foreach (var e in enemies) Growth.DexSee(S, e.species);
            Battle = Rules.Battle.Create(party, enemies, S.inventory, null, ambush);
            battleWild = wildId;
            Clock.Pause("battle");
            Store.Block("battle");
            PlayerMoverEnabled(false);
            BattleStarted?.Invoke(Battle);
            return true;
        }

        public BattleSummary FinishBattle()
        {
            var b = Battle;
            if (b == null) return null;
            var summary = Rules.Battle.Finish(S, b, battleWild);
            Battle = null;
            Store.Unblock("battle");
            Clock.Resume("battle");
            PlayerMoverEnabled(true);
            Area?.OnBattleEnded(battleWild, summary.result);
            Save();
            AfterAction();
            BattleFinished?.Invoke(summary);
            return summary;
        }

        void PlayerMoverEnabled(bool on)
        {
            var m = player ? player.GetComponent<Player.PlayerMover>() : null;
            if (m) m.enabled = on;
            Player.PlayerMover.Stick = Vector2.zero;
        }

        // ---------- bag actions ----------
        public bool Eat(string itemId)
        {
            var r = Survival.Eat(S, itemId);
            if (r.ok) Sfx("eat");
            Say(r.ok ? $"吃了{GameData.Item(itemId).name}：饱食 +{r.hunger}" + (r.hp > 0 ? $"，生命 +{r.hp}" : "")
                : r.reason == "full" ? "已经吃饱了" : r.reason == "not-food" ? "这个不能吃" : "没有了");
            AfterAction();
            return r.ok;
        }

        // the 使用 button in the bag (web ui/panels.js)
        public void Use(string itemId)
        {
            var def = GameData.Item(itemId);
            if (def == null) return;
            if (def.food != null) { Eat(itemId); return; }
            switch (itemId)
            {
                case "item_torch":
                    if (!Inventory.RemoveItem(S.inventory, "item_torch", 1)) return;
                    Night.LightTorchNow(S);
                    Say("点亮了火把：身边 2 格有光，能烧 3 小时");
                    break;
                case "item_campfire":
                    if (Area is ExpeditionArea ex) ex.PlaceCampfireNear(); else Say("家园很安全，不需要营火");
                    break;
                case "item_fox_bell": Say("在伙伴面板选焰尾狐，到「养成」页点「学会化形」"); break;
                case "item_tent": Say("在点着的营火旁按「互动」，就能用帐篷睡觉"); break;
                default:
                    if (def.netMult != null) Say("靠近野生宠物按「扔网」，或者在对战中使用");
                    else if (def.book != null) Say("在伙伴面板的「技能」页给宠物学");
                    else if (House.IsFurniture(itemId)) Say("进小屋后可以摆放家具");
                    else Say("这个不能直接使用");
                    break;
            }
            AfterAction();
        }

        public bool Craft(string recipeId)
        {
            var r = Crafting.Craft(S, recipeId);
            var name = GameData.Item(GameData.Recipe(recipeId).@out).name;
            if (r.ok) Sfx("craft");
            Say(r.ok ? $"做好了：{name}" : r.reason switch { "missing" => "材料不够", "full" => "背包满了", "station" => "要在家园的工作台做", "locked" => "还没学会这个做法", _ => "做不了" });
            AfterAction();
            return r.ok;
        }

        // 制作 N 个 (the crafting panel's stepper): makes up to n, one message at the end
        public int CraftMany(string recipeId, int n)
        {
            var rec = GameData.Recipe(recipeId);
            int made = 0; string reason = null;
            for (int i = 0; i < n; i++) { var r = Crafting.Craft(S, recipeId); if (!r.ok) { reason = r.reason; break; } made++; }
            if (made > 0) Sfx("craft");
            Say(made > 0 ? $"做好了：{GameData.Item(rec.@out).name} ×{made * Math.Max(1, rec.n)}" + (made < n ? (reason == "full" ? "（背包满了）" : "（材料不够了）") : "")
                : reason switch { "missing" => "材料不够", "full" => "背包满了", "station" => "要在家园的工作台做", "locked" => "还没学会这个做法", _ => "做不了" });
            AfterAction();
            return made;
        }

        public bool BuySeed(string cropId, int n = 1)
        {
            var r = Farm.BuySeed(S, cropId, n);
            if (r.ok) Sfx("coin");
            Say(r.ok ? $"买了 {n} 包{GameData.Item(GameData.Crops[cropId].seed).name}（四叶草 −{r.cost}）" : r.reason == "clover" ? "四叶草不够" : "背包满了");
            AfterAction();
            return r.ok;
        }

        // the general store (风铃小镇杂货铺)
        public bool Buy(string itemId, int n = 1)
        {
            var r = Town.Buy(S, itemId, n);
            if (r.ok) Sfx("coin");
            Say(r.ok ? $"买了{GameData.Item(itemId).name} ×{n}（四叶草 −{r.cost}）" : r.reason == "clover" ? "四叶草不够" : r.reason == "full" ? "背包满了" : "今天没有卖这个");
            AfterAction();
            return r.ok;
        }

        public bool Ship(string itemId, int n = 1)
        {
            var r = Farm.Ship(S, itemId, n);
            if (r.ok) Sfx("coin");
            Say(r.ok ? $"放进出货箱：{GameData.Item(itemId).name} ×{n}（明早 +{Farm.PriceOf(itemId) * n}）" : "这个不能出货");
            AfterAction();
            return r.ok;
        }

        public bool Unship(string itemId) { var r = Farm.Unship(S, itemId); if (!r.ok) Say("背包满了"); AfterAction(); return r.ok; }

        public void DepositAll()
        {
            int n = Explore.DepositAll(S, id => (GameData.Item(id)?.tool ?? false) || GameData.Item(id)?.food != null);
            Say(n > 0 ? $"存进仓库 {n} 格（工具和食物留在身上）" : "没有要存的东西");
            AfterAction();
        }

        public void Deposit(string itemId)
        {
            var r = Explore.Deposit(S, itemId);
            if (r.ok) Sfx("pick");
            AfterAction();
        }

        public void Withdraw(string itemId)
        {
            var r = Explore.Withdraw(S, itemId, Crafting.BagSlots(S));
            if (r.ok) Sfx("pick"); else if (r.reason == "full") Say("背包满了");
            AfterAction();
        }

        public void WithdrawAll()
        {
            var (took, left) = Explore.WithdrawAll(S, Crafting.BagSlots(S));
            Say(took > 0 ? $"取回 {took} 格" + (left > 0 ? $"，还有 {left} 格放不下" : "") : "仓库是空的，或者背包满了");
            AfterAction();
        }

        // ---------- pets (party panel) ----------
        public void Feed(string uid, string food)
        {
            var r = PetCare.Feed(S, uid, food);
            if (r.ok) Sfx(r.ups > 0 ? "levelup" : "eat");
            Say(r.ok ? (r.favourite ? $"最爱吃的！好感 +{r.gain}" : $"好感 +{r.gain}") + $"，经验 +{r.exp}" + (r.ups > 0 ? $"，升到 Lv.{S.Pet(uid).level}！" : "") : r.reason switch { "fed" => "今天已经喂过了", "not-food" => "这个不能喂", _ => "没有了" });
            AfterAction();
        }
        public void PetPet(string uid) { var r = PetCare.PetPet(S, uid); if (r.ok) Sfx("happy"); Say(r.ok ? $"摸摸～好感 +{r.gain}" : "今天已经摸过了"); AfterAction(); }
        public void JoinParty(string uid) { var r = Party.Join(S, uid); Say(r.ok ? "加入了队伍" : r.reason switch { "full" => "队伍最多 3 只", "away" => "出门在外，换不了伙伴", _ => "加入不了" }); AfterAction(); }
        public void LeaveParty(string uid) { var r = Party.Leave(S, uid); Say(r.ok ? "回家休息了" + (r.moved?.Count > 0 ? $"（背包变小，{r.moved.Count} 格放进了仓库）" : "") : r.reason switch { "last" => "队伍里至少留 1 只", "away" => "出门在外，换不了伙伴", _ => "做不到" }); AfterAction(); }
        public void SetLead(string uid) { Party.SetLead(S, uid); AfterAction(); }
        public void SetJob(string uid, bool on) { var r = PetCare.SetJob(S, uid, on); if (!r.ok) Say(r.reason == "party" ? "队伍里的伙伴不能打工" : "要在家园才能安排打工"); AfterAction(); }
        public void LearnSkill(string uid, string bookId, int slot)
        {
            var pet = S.Pet(uid); string old = slot < pet.skills.Count ? GameData.Skill(pet.skills[slot]).name : null;
            var r = Growth.LearnSkill(S, uid, bookId, slot);
            if (r.ok) Sfx("sparkle");
            var learned = GameData.Skill(Growth.BookSkill(bookId)).name;
            Say(r.ok ? (old != null ? $"忘掉了「{old}」，学会了「{learned}」！" : $"学会了「{learned}」！") : r.reason switch { "element" => "属性不合，学不了", "known" => "已经会这个技能了", "none" => "没有这本技能书了", _ => "学不了" });
            AfterAction();
        }

        public void UnlockForm(string uid)
        {
            var r = Growth.UnlockForm(S, uid);
            if (r.ok) Sfx("sparkle");
            Say(r.ok ? "叮铃——学会化形了！" : "还不能化形：" + string.Join("、", r.missing.Select(m => m switch { "evolved" => "要先进化", "affection" => "好感要 100", "bell" => "要化形铃", _ => m })));
            AfterAction();
        }

        public void ToggleForm(string uid)
        {
            var r = Growth.ToggleForm(S, uid);
            if (r.ok) Sfx("sparkle");
            if (r.ok) Say(r.form == "human" ? "变成了人形！" : "变回了原形");
            AfterAction();
        }

        public void Evolve(string uid)
        {
            var r = Growth.TryEvolve(S, uid);
            if (r.ok) Sfx("evolve");
            Say(r.ok ? $"进化成了{PetMath.DisplayName(S.Pet(uid))}！" : "还不能进化：" + string.Join("、", r.missing.Select(m => m switch { "level" => $"要 {PetMath.EvolveLevel} 级", "affection" => $"好感要 {PetMath.EvolveAffection}", "stone" => "要进化石", "evolved" => "已经进化过了", _ => m })));
            AfterAction();
        }
    }
}
