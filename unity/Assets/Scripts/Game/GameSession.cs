// Runs the game rules (Lingmu.Rules) inside a scene: loads / saves the game, moves the clock, applies survival,
// ends the day at bedtime, and offers the actions the UI calls (sleep, farm, eat, craft, buy, ship, storage).
// Everything that changes the game state goes through here, so the UI only draws and calls.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Lingmu.Rules;
using Lingmu.World;
using UnityEngine;

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

    public class Spot { public string kind, verb, label, key; public Vector3 pos; }

    public class GameSession : MonoBehaviour
    {
        public static GameSession I { get; private set; }
        public const float PxPerMeter = 48f;            // web saves positions in px (1 tile = 48 px = 1 m)
        const float InteractRange = 70f / PxPerMeter;   // web INTERACT_RANGE

        public Transform player;
        public Light sun;
        public float timeScale = 1;                     // > 1 for testing day / night
        public bool demoStart;                          // no save yet: start with all six pets instead of the fox
        public static string SaveDirOverride;           // tests: keep their saves away from the real one

        public GameState S { get; private set; }
        public readonly GameClock Clock = new GameClock();
        public event Action Changed;                    // something the HUD shows changed
        public event Action<string> Toast;
        public event Action<SettlementReport> DayEnded;
        public string LoadProblem { get; private set; }

        SaveStore store;
        HomeIslandLayout L;
        readonly List<Spot> spots = new List<Spot>();
        Color sunColor; float sunIntensity; Color ambient;
        int ticksSinceSave;

        void Awake()
        {
            I = this;
            store = new SaveStore(new FileSaveStorage(SaveDirOverride ?? System.IO.Path.Combine(Application.persistentDataPath, "save")));
            var loaded = store.Load(() => demoStart ? SaveRules.NewGameState() : SaveRules.NewGameState(starter: "fox"));
            S = loaded.state;
            LoadProblem = loaded.problem;
            // only the home island exists in Unity so far: an expedition / town / house save wakes up at home
            if (S.player.area != "home") { S.player.area = "home"; S.player.x = null; S.player.y = null; }
            L = HomeIslandLayout.Generate();
            BuildSpots();
            if (sun) { sunColor = sun.color; sunIntensity = sun.intensity; }
            ambient = RenderSettings.ambientSkyColor;
        }

        void Start()
        {
            if (player && S.player.x != null && S.player.y != null)
                player.position = new Vector3((float)S.player.x.Value / PxPerMeter, player.position.y, -(float)S.player.y.Value / PxPerMeter);
            if (LoadProblem != null) Say("存档读取有问题，已用备份或新存档继续");
            ApplyLight();
            Changed?.Invoke();
        }

        void BuildSpots()
        {
            void Add(string kind, string verb, string label, float tx, float ty) => spots.Add(new Spot { kind = kind, verb = verb, label = label, pos = HomeIslandLayout.TileToWorld(tx, ty) });
            Add("tent", "睡觉", "帐篷 · 点互动睡觉", L.Tent.x, L.Tent.y);
            Add("ship", "出货", "出货箱 · 放进去的东西明早换成四叶草", L.ShipBox.x, L.ShipBox.y);
            Add("seeds", "买种子", "种子摊 · 买种子", L.SeedStand.x, L.SeedStand.y);
            Add("storage", "仓库", "仓库 · 点互动打开", L.Storage.x, L.Storage.y);
            Add("dock", "出发", "飞艇码头 · 坐飞艇去远征岛", L.DockTile.x, L.DockTile.y + 0.5f);
            Add("door", "进屋", "小屋 · 进屋", L.CottageRect.x + L.CottageRect.w / 2f - 0.5f, L.CottageRect.y + L.CottageRect.h);
            Add("campfire", "营火", "营火 · 家园的营火一直烧着", L.Campfire.x, L.Campfire.y);
        }

        // ---------- the clock ----------
        void Update()
        {
            foreach (var e in Clock.Advance(S, Time.deltaTime * 1000 * timeScale))
            {
                if (e.type == "tick") OnTick();
                else if (e.type == "phase") { ApplyLight(); if (e.to == "dusk") Say("黄昏了，天快黑了"); else if (e.to == "night") Say("天黑了，早点回帐篷睡觉吧"); }
                else if (e.type == "bedtime") { Say("到 24 点了，你困得在帐篷里睡着了"); EndDay(true); }
            }
        }

        void OnTick()
        {
            foreach (var ev in Survival.Tick(S.player, S.player.area))
                Say(ev switch { "hungry" => "肚子饿了：打开背包吃点东西", "empty" => "饿坏了！再不吃东西会掉生命", "floor" => "饿得没力气了（在家园不会倒下）", _ => null });
            ApplyLight();
            AfterAction();
            if (++ticksSinceSave >= 6) Save();      // every game hour
        }

        void ApplyLight()
        {
            var (rgb, dark) = GameTime.TintAt(S.clock);
            var tint = new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);
            if (sun) { sun.color = sunColor * tint; sun.intensity = sunIntensity * (1 - (float)dark * 0.75f); }
            RenderSettings.ambientSkyColor = ambient * Color.Lerp(tint, Color.white, 0.3f);
        }

        // after anything that may finish a guide goal, a daily task or show a tip
        void AfterAction()
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

        void Say(string text) { if (!string.IsNullOrEmpty(text)) Toast?.Invoke(text); }

        public void Save()
        {
            ticksSinceSave = 0;
            if (player) { S.player.x = Math.Round(player.position.x * PxPerMeter); S.player.y = Math.Round(-player.position.z * PxPerMeter); }
            if (!store.Save(S)) Debug.LogWarning("[Lingmu] save failed: " + store.lastError);
        }

        void OnApplicationPause(bool paused) { if (paused) Save(); }
        void OnApplicationQuit() => Save();

        // ---------- panels pause the clock (web: menus stop time) ----------
        public void PauseFor(string reason) => Clock.Pause(reason);
        public void ResumeFor(string reason) => Clock.Resume(reason);

        // ---------- what the action button would do here ----------
        public Spot CurrentSpot()
        {
            if (!player) return null;
            var p = player.position;
            // a farm plot under your feet beats the box next to it
            int tx = Mathf.FloorToInt(p.x / HomeIslandLayout.TileSize), ty = Mathf.FloorToInt(-p.z / HomeIslandLayout.TileSize);
            var f = L.FarmRect;
            if (tx >= f.x && tx < f.x + f.w && ty >= f.y && ty < f.y + f.h)
            {
                var key = Farm.PlotKey(tx, ty);
                var act = Farm.PlotAction(S, key);
                var plot = Farm.PlotOf(S, key);
                string crop = plot.crop != null ? GameData.Crops[plot.crop].name : null;
                var (verb, label) = act switch
                {
                    "till" => ("开垦", "农田 · 用锄头开垦"),
                    "plant" => ("播种", "农田 · 播种（用背包里的种子）"),
                    "water" => ("浇水", $"{crop} · 第 {plot.days}/{GameData.Crops[plot.crop].days} 天，今天还没浇水"),
                    "harvest" => ("收获", $"{crop} · 成熟了！"),
                    _ => ("等待", $"{crop} · 今天浇过水了，明天再长"),
                };
                return new Spot { kind = "plot", verb = verb, label = label, key = key, pos = HomeIslandLayout.TileToWorld(tx, ty) };
            }
            Spot best = null; float bestD = InteractRange;
            foreach (var s in spots)
            {
                float d = Vector2.Distance(new Vector2(p.x, p.z), new Vector2(s.pos.x, s.pos.z));
                if (d < bestD) { bestD = d; best = s; }
            }
            return best;
        }

        public IReadOnlyList<Spot> Spots => spots;
        public HomeIslandLayout Layout => L;

        // ---------- actions ----------
        // returns the name of a panel the UI should open (bag, seeds, ship, storage, craft), or null
        public string Act(Spot s)
        {
            if (s == null) return null;
            switch (s.kind)
            {
                case "tent": EndDay(true); return null;
                case "plot": FarmAt(s.key); return null;
                case "ship": return "ship";
                case "seeds": return "seeds";
                case "storage": return "storage";
                case "campfire": return "craft";
                case "dock": Say("远征岛还在搬进 Unity，下一步就做"); return null;
                case "door": Say("小屋内部还在搬进 Unity，下一步就做"); return null;
            }
            return null;
        }

        void FarmAt(string key)
        {
            switch (Farm.PlotAction(S, key))
            {
                case "till": { var r = Farm.Till(S, key); Say(r.ok ? "开垦好了，可以播种" : "要有锄头才能开垦"); break; }
                case "plant":
                {
                    var seed = S.inventory.Select(x => x.id).FirstOrDefault(id => GameData.CropBySeed(id) != null);
                    if (seed == null) { Say("背包里没有种子：去种子摊买"); break; }
                    var r = Farm.Plant(S, key, seed);
                    if (r.ok) Say($"种下了{GameData.Crops[r.crop].name}，记得每天浇水");
                    break;
                }
                case "water": { var r = Farm.Water(S, key); Say(r.ok ? "浇好水了" : "要有水壶才能浇水"); break; }
                case "harvest": { var r = Farm.Harvest(S, key); Say(r.ok ? $"收获了{GameData.Item(r.item).name}！" : "背包满了"); break; }
                default: Say("今天浇过水了，睡一觉它就会长"); break;
            }
            AfterAction();
        }

        public void EndDay(bool slept)
        {
            if (player) S.player.x = S.player.y = null;
            var report = Settlement.Run(S, slept);
            Clock.Pause("report");
            Save();
            AfterAction();
            DayEnded?.Invoke(report);
        }

        // the report panel was closed: wake up next to the tent and let the new day run
        public void StartNewDay()
        {
            if (player)
            {
                player.position = HomeIslandLayout.TileToWorld(L.Tent.x, L.Tent.y + 1.2f);
            }
            Clock.Restart();
            Clock.Resume("report");
            Changed?.Invoke();
        }

        public bool Eat(string itemId)
        {
            var r = Survival.Eat(S, itemId);
            Say(r.ok ? $"吃了{GameData.Item(itemId).name}：饱食 +{r.hunger}" + (r.hp > 0 ? $"，生命 +{r.hp}" : "")
                : r.reason == "full" ? "吃不下了" : r.reason == "not-food" ? "这个不能吃" : "没有了");
            AfterAction();
            return r.ok;
        }

        public bool Craft(string recipeId)
        {
            var r = Crafting.Craft(S, recipeId);
            var name = GameData.Item(GameData.Recipe(recipeId).@out).name;
            Say(r.ok ? $"做好了：{name}" : r.reason switch { "missing" => "材料不够", "full" => "背包满了", "station" => "要在家园的工作台做", "locked" => "还没学会这个做法", _ => "做不了" });
            AfterAction();
            return r.ok;
        }

        public bool BuySeed(string cropId)
        {
            var r = Farm.BuySeed(S, cropId);
            Say(r.ok ? $"买了 1 包{GameData.Item(GameData.Crops[cropId].seed).name}（四叶草 −{r.cost}）" : r.reason == "clover" ? "四叶草不够" : "背包满了");
            AfterAction();
            return r.ok;
        }

        public bool Ship(string itemId)
        {
            var r = Farm.Ship(S, itemId, 1);
            Say(r.ok ? $"放进出货箱：{GameData.Item(itemId).name}（明早 +{Farm.PriceOf(itemId)}）" : "这个不能出货");
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

        public void WithdrawAll()
        {
            var (took, left) = Explore.WithdrawAll(S, Crafting.BagSlots(S));
            Say(took > 0 ? $"取回 {took} 格" + (left > 0 ? $"，还有 {left} 格放不下" : "") : "仓库是空的，或者背包满了");
            AfterAction();
        }
    }
}
