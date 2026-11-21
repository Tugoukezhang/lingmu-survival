// An expedition island (biome 雾林), made at runtime from the save's island seed with the same generator as the web
// version, minus what the player already took. Gathering, chests, thorns (开路), wading (涉水), wild pets (notice,
// net throw, battles), the airship home, campfires and the tent, the night: fog monsters, warning circles, light.
// web: scenes/play/expedition.js, night.js, actors.js.
using System.Collections.Generic;
using System.Linq;
using Lingmu.Core;
using Lingmu.Rules;
using Lingmu.World;
using UnityEngine;

namespace Lingmu.Game
{
    public class ExpeditionArea : Area
    {
        public override string Id => "expedition";
        const float InteractRange = 70f / GameSession.PxPerMeter;
        static float Px(float m) => m * GameSession.PxPerMeter;

        public IslandMap Island { get; private set; }
        public Transform Player => Session.player;
        public IslandWalkMap walk;
        Transform props;
        readonly Dictionary<string, GameObject> things = new Dictionary<string, GameObject>();   // resource / chest / thorn id → object
        readonly List<WildPet> wild = new List<WildPet>();
        readonly Dictionary<string, (GameObject go, Light light)> fireViews = new Dictionary<string, (GameObject, Light)>();
        GameObject lostBagView;
        Light playerLight;
        bool wading;

        // ---------- building the island ----------
        void Awake()
        {
            var s = GameSession.I.S;
            var ex = s.expedition ?? (s.expedition = new ExpeditionState { seed = Travel.NewIslandSeed(s) });
            Island = IslandGen.ApplyChanges(IslandGen.Generate(ex.seed), ex.changes);
            var isl = Island;

            var shape = new IslandShape { cols = isl.cols, rows = isl.rows, seed = isl.seed, land = (x, y) => In(x, y) && isl.walk[y][x], water = (x, y) => In(x, y) && isl.water[y][x] };
            var landing = new Vector2(isl.landing.tx + 0.5f, isl.landing.ty + 0.5f);
            shape.curves.Add((landing + new Vector2(-0.9f, 0.4f), landing + new Vector2(0.9f, 0.4f), 0, -1.4f));
            foreach (var c in isl.camps) shape.curves.Add((landing, new Vector2(c.tx + 0.5f, c.ty + 0.5f), (c.tx % 3 - 1) * 0.08f, 0.7f));
            var ground = new GameObject("Island"); ground.SetActive(false);
            ground.AddComponent<IslandTerrain>().shape = shape;
            ground.SetActive(true);

            walk = ground.AddComponent<IslandWalkMap>();
            walk.Init(isl.cols, isl.rows, (x, y) => isl.walk[y][x]);
            props = new GameObject("Props").transform;
            BuildProps();
            RefreshBlocking();
            var grass = ground.AddComponent<GrassField>(); grass.seed = isl.seed; grass.flowersPerTile = 0.12f;   // wild meadow
            var mover = FindAnyObjectByType<Player.PlayerMover>(); if (mover) mover.map = walk;
        }

        bool In(int x, int y) => x >= 0 && y >= 0 && x < Island.cols && y < Island.rows;
        static Vector3 W(float tx, float ty) => HomeIslandLayout.TileToWorld(tx, ty);

        static int Hash(string id, int seed) { unchecked { int h = seed * 31; foreach (char ch in id) h = h * 131 + ch; return h & 0x7fffffff; } }

        void BuildProps()
        {
            var isl = Island;
            foreach (var r in isl.resources)
            {
                var at = W(r.tx, r.ty);
                int h = Hash(r.id, isl.seed);
                GameObject g = r.type switch
                {
                    "tree" => ModelLibrary.Place(h % 3 == 0 ? "pine" : "tree", props, at, (h % 3 == 0 ? 3.4f : 2.8f) * (0.85f + h % 30 / 100f), true, h % 360),
                    "bush" => ModelLibrary.Place("bush", props, at, 0.95f, true, h % 360),
                    "grass" => ModelLibrary.Place("shrub", props, at, 0.55f, true, h % 360),
                    "rock" => StoneKit.Rock(props, at, h, 0.85f + h % 25 / 100f),
                    _ => StoneKit.Crystal(props, at, h, r.rare),
                };
                things[r.id] = g;
            }
            foreach (var c in isl.chests) things[c.id] = ModelLibrary.Place("chest", props, W(c.tx, c.ty), c.bonus ? 1.05f : 0.85f, false, 90);
            foreach (var t in isl.thorns) things[t.id] = ModelLibrary.Place("thorn", props, W(t.tx, t.ty), 0.95f, true, Hash(t.id, isl.seed) % 360);
            ModelLibrary.Place("airship", props, W(isl.airship.tx, isl.airship.ty + 1.8f) + Vector3.down * 1.6f, 3.0f, false, 90);   // floats just off the south edge, below the landing
            for (int i = 0; i < isl.pets.Count; i++)
            {
                var w = isl.pets[i];
                int lv = PetMath.WildLevel(S.day, new Mulberry32((long)isl.seed * 31 + i).Next);
                var go = new GameObject("wild " + w.id);
                var pet = go.AddComponent<WildPet>();
                pet.Init(this, w.id, w.species, lv, W(w.tx, w.ty));
                wild.Add(pet);
            }
            foreach (var f in Camp.Fires(S)) AddFireView(f);
            RefreshLostBag();
            var pl = new GameObject("player light"); playerLight = pl.AddComponent<Light>(); playerLight.type = LightType.Point; playerLight.color = new Color(1f, 0.8f, 0.55f); playerLight.shadows = LightShadows.None;
        }

        // things that block the way: blocking resources, chests, thorns; water unless a 航海鲨 is in the party
        void RefreshBlocking()
        {
            var isl = Island;
            wading = Explore.CanWade(S);
            for (int y = 0; y < isl.rows; y++) for (int x = 0; x < isl.cols; x++) walk.Unblock(x, y);
            var blocked = IslandGen.BlockedGrid(isl);
            for (int y = 0; y < isl.rows; y++) for (int x = 0; x < isl.cols; x++)
                if (blocked[y][x] || (!wading && isl.water[y][x])) walk.Block(x, y);
        }

        public bool Walkable(Vector3 p) => walk.FootFits(p);
        public override bool CanStand(Vector3 p) => walk.FootFits(p);
        public override Vector3 ArrivePoint(GameState s) => W(Island.landing.tx, Island.landing.ty);

        public bool PlayerCovered()
        {
            var p = Player.position;
            return Island.resources.Any(r => (r.type == "grass" || r.type == "bush") && Px(Vector2.Distance(new Vector2(p.x, p.z), new Vector2(W(r.tx, r.ty).x, W(r.tx, r.ty).z))) < Stealth.CoverRange);
        }

        // ---------- what the action button does here ----------
        static readonly Dictionary<string, string> GatherVerb = new Dictionary<string, string> { { "tree", "砍树" }, { "rock", "敲石头" }, { "bush", "摘浆果" }, { "grass", "割草" }, { "crystal", "挖雾晶" } };

        public override IEnumerable<Spot> MapSpots()
        {
            var isl = Island;
            yield return new Spot { kind = "airship", pos = W(isl.airship.tx, isl.airship.ty) };
            if (S.expedition.lostBag != null) { var lb = S.expedition.lostBag; yield return new Spot { kind = "lostbag", pos = new Vector3((float)lb.x / GameSession.PxPerMeter, 0, -(float)lb.y / GameSession.PxPerMeter) }; }
            foreach (var f in Camp.Fires(S)) yield return new Spot { kind = "fire", pos = W(f.tx, f.ty) };
            if (Explore.TreasureSense(S) >= 1) foreach (var c in isl.chests) yield return new Spot { kind = "chest", pos = W(c.tx, c.ty) };
            foreach (var t in isl.thorns) yield return new Spot { kind = "thorn", pos = W(t.tx, t.ty) };
        }

        public override Spot CurrentSpot(Vector3 p)
        {
            var spots = new List<(Spot s, float d)>();
            var p2 = new Vector2(p.x, p.z);
            float D(Vector3 w) => Vector2.Distance(p2, new Vector2(w.x, w.z));
            var isl = Island;
            var ship = W(isl.airship.tx, isl.airship.ty);
            spots.Add((new Spot { kind = "airship", verb = "回家", label = "飞艇 · 坐飞艇回家（1 小时）", pos = ship }, D(ship) - 0.6f));
            if (S.expedition.lostBag != null)
            {
                var lb = S.expedition.lostBag; var at = new Vector3((float)lb.x / GameSession.PxPerMeter, 0, -(float)lb.y / GameSession.PxPerMeter);
                spots.Add((new Spot { kind = "lostbag", verb = "捡回", label = $"失物包 · {Travel.LostBagCount(S)} 件东西", pos = at }, D(at)));
            }
            foreach (var f in Camp.Fires(S))
            {
                int left = Camp.FireLeft(S, f);
                spots.Add((new Spot { kind = "fire", verb = "营地", key = f.id, label = left > 0 ? $"营火 · 还能烧 {left / 60}:{left % 60:00}" : "营火 · 已熄灭（可以添柴）", pos = W(f.tx, f.ty) }, D(W(f.tx, f.ty))));
            }
            foreach (var c in isl.chests) spots.Add((new Spot { kind = "chest", verb = "打开", key = c.id, label = c.bonus ? "秘密宝箱 · 点互动打开" : "宝箱 · 点互动打开", data = c, pos = W(c.tx, c.ty) }, D(W(c.tx, c.ty)) - 0.6f));
            foreach (var t in isl.thorns) spots.Add((new Spot { kind = "thorn", verb = "开路", key = t.id, label = Explore.CanClear(S) ? "荆棘丛 · 让橡果刺猬开路" : "荆棘丛 · 要橡果刺猬才能开路", pos = W(t.tx, t.ty) }, D(W(t.tx, t.ty))));
            Spot best = null; float bestD = InteractRange;
            foreach (var (s, d) in spots) if (d < bestD) { bestD = d; best = s; }
            if (best != null) return best;
            // a wild pet in throwing range (T45)
            WildPet near = null; float nd = float.MaxValue;
            foreach (var w in wild) { var look = w.StealthTo(p); if (look.dist <= Stealth.ThrowRange && look.dist < nd) { nd = look.dist; near = w; } }
            if (near != null)
            {
                var look = near.StealthTo(p);
                var net = Stealth.PickNet(S.inventory);
                var name = GameData.Species(near.species).name;
                string label = net == null ? $"{name} Lv.{near.level} · 没有捕宠网了" : $"{name} Lv.{near.level} · {Stealth.StealthNames[look.stealth]} · 成功率 {Mathf.RoundToInt((float)Rules.Battle.FieldRate(S, near.species, net, look.stealth) * 100)}%";
                return new Spot { kind = "throw", verb = "扔网", label = label, data = near, pos = near.transform.position };
            }
            // the nearest resource
            float rd = InteractRange; IslandThing res = null;
            foreach (var r in isl.resources) { var d = D(W(r.tx, r.ty)) - (IslandGen.Blocking[r.type] ? 0.45f : 0); if (d < rd) { rd = d; res = r; } }
            if (res != null)
            {
                var pv = Crafting.Preview(S, res.type);
                var g = Crafting.Gather[res.type];
                string label = pv.need != null ? $"{g.name} · 要{GameData.Item(pv.need).name}" : $"{g.name} · " + string.Join("、", pv.gains.Select(kv => $"{GameData.Item(kv.Key).name} ×{kv.Value}"));
                return new Spot { kind = "gather", verb = GatherVerb[res.type], key = res.id, label = label, data = res, pos = W(res.tx, res.ty) };
            }
            return null;
        }

        // the arrow (docs/20 第三节 1): the nearest thing of a kind (a resource, a wild pet, an unopened chest) or the airship
        public override Vector3? FindPlace(string place, Vector3 from)
        {
            var isl = Island;
            Vector3? Nearest(IEnumerable<Vector3> ps) { Vector3? best = null; float bd = float.MaxValue; foreach (var q in ps) { float d = (q - from).sqrMagnitude; if (d < bd) { bd = d; best = q; } } return best; }
            switch (place)
            {
                case "airship": return W(isl.airship.tx, isl.airship.ty);
                case "gather": return Nearest(isl.resources.Select(r => W(r.tx, r.ty)));
                case "wild": return Nearest(wild.Where(w => w).Select(w => w.transform.position));
                case "chest": return Nearest(isl.chests.Select(c => W(c.tx, c.ty)));
                case "lostbag": { var lb = S.expedition.lostBag; return lb == null ? (Vector3?)null : new Vector3((float)lb.x / GameSession.PxPerMeter, 0, -(float)lb.y / GameSession.PxPerMeter); }
            }
            return null;
        }

        public string CampFireId { get; private set; }

        public override string Act(Spot s)
        {
            var g = Session;
            switch (s.kind)
            {
                case "airship": if (Travel.LostBagCount(S) > 0) return "leave"; g.GoTo("home"); return null;   // a confirm first when the lost bag is still out
                case "gather": Gather((IslandThing)s.data); return null;
                case "chest": OpenChest((IslandThing)s.data); return null;
                case "thorn":
                {
                    var r = Explore.ClearThorn(S, s.key);
                    if (!r.ok) { g.Say(r.reason == "need-clear" ? "要橡果刺猬在队伍里才能开路" : "已经清掉了"); return null; }
                    Island = IslandGen.ApplyChanges(Island, S.expedition.changes); Remove(s.key); RefreshBlocking();
                    g.Say("橡果刺猬把荆棘清开了");
                    return null;
                }
                case "lostbag":
                {
                    var (took, left) = Travel.PickUpLostBag(S);
                    g.Say(took.Count > 0 ? $"捡回了 {took.Sum(x => x.count)} 件东西" + (left.Count > 0 ? "，还有一些放不下" : "") : "背包满了");
                    RefreshLostBag();
                    g.Save();
                    return null;
                }
                case "fire": CampFireId = s.key; return "camp";
                case "throw": ThrowNet((WildPet)s.data); return null;
            }
            return null;
        }

        void Remove(string id) { if (things.TryGetValue(id, out var go)) { Destroy(go); things.Remove(id); } }

        void Gather(IslandThing r)
        {
            var res = Crafting.GatherAt(S, r.id, r.type);
            var g = Session;
            if (!res.ok) { g.Say(res.reason switch { "need-tool" => $"要{GameData.Item(res.tool).name}才行", "full" => "背包满了", _ => "已经没有了" }); return; }
            g.Say("得到 " + string.Join("、", res.gains.Select(kv => $"{GameData.Item(kv.Key).name} ×{kv.Value}")));
            foreach (var kv in res.gains) g.Gained(kv.Key, W(r.tx, r.ty));
            Island = IslandGen.ApplyChanges(Island, S.expedition.changes);
            Remove(r.id);
            RefreshBlocking();
        }

        void OpenChest(IslandThing c)
        {
            var r = Camp.OpenChest(S, c.id, c.bonus);
            var g = Session;
            if (!r.ok) { g.Say(r.reason == "full" ? "背包满了，先腾出位置再开" : "已经打开过了"); return; }
            g.Say("宝箱里有：" + string.Join("、", r.loot.items.Select(kv => $"{GameData.Item(kv.Key).name} ×{kv.Value}")) + $"，四叶草 +{r.loot.clover}");
            foreach (var kv in r.loot.items) g.Gained(kv.Key, W(c.tx, c.ty));
            Island = IslandGen.ApplyChanges(Island, S.expedition.changes);
            if (things.TryGetValue(c.id, out var old)) { var at = old.transform.position; var rot = old.transform.rotation; Destroy(old); things[c.id] = ModelLibrary.Place("chest_open", props, at, c.bonus ? 1.05f : 0.85f, false, 90); }
            RefreshBlocking();
            g.Save();
        }

        // ---------- wild pets ----------
        List<PetInstance> WildGroup(WildPet w) => Rules.Battle.MakeWildGroup(w.species, w.level, Island.seed, int.Parse(w.id.Substring(1)), S.day, GameData.Pets.Select(x => x.id).ToList());

        public bool Encounter(WildPet w, bool ambush) => Session.StartBattle(WildGroup(w), w.id, ambush);

        public override void OnBattleEnded(string wildId, string result)
        {
            var w = wild.Find(x => x.id == wildId);
            if (w == null) return;
            if (result == "win" || result == "caught") { wild.Remove(w); Destroy(w.gameObject); Island = IslandGen.ApplyChanges(Island, S.expedition.changes); }
            else { w.AfterBattle(result); if (result == "lose") Session.Say("伙伴们玩累了，野生宠物跑开了"); }
            RefreshBlocking();   // a 航海鲨 may have joined
        }

        void ThrowNet(WildPet w)
        {
            var g = Session;
            var net = Stealth.PickNet(S.inventory);
            if (net == null) { g.Say("没有捕宠网了，在「制作」里用草编一张"); return; }
            var look = w.StealthTo(Player.position);
            var inst = WildGroup(w)[0];
            var r = Rules.Battle.FieldCatch(S, inst, net, look.stealth, Random.value, w.id);
            if (!r.ok) return;
            var name = GameData.Species(w.species).name;
            if (r.caught)
            {
                var c = r.summary.caught;
                g.Say($"抓到了{name}！" + (c.joined ? "它加入了队伍" : "它去家园等你了") + (c.duplicate ? "（重复的可以在伙伴面板里转成结晶）" : ""));
                wild.Remove(w); Destroy(w.gameObject);
                Island = IslandGen.ApplyChanges(Island, S.expedition.changes);
                RefreshBlocking();
                g.Save();
            }
            else { g.Say($"{name}挣脱了网！（成功率 {Mathf.RoundToInt((float)r.rate * 100)}%）"); w.Noticed(); }
        }

        // ---------- camp ----------
        public void PlaceCampfireNear()
        {
            var g = Session;
            var p = Player.position;
            int ptx = Mathf.FloorToInt(p.x), pty = Mathf.FloorToInt(-p.z);
            var fwd = Player.GetComponent<Player.PlayerMover>()?.Facing ?? Vector3.forward;
            int fx = Mathf.RoundToInt(fwd.x), fy = Mathf.RoundToInt(-fwd.z);
            var cands = new[] { (fx, fy), (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1), (2, 0), (-2, 0), (0, 2), (0, -2) };
            foreach (var (dx, dy) in cands)
            {
                if (dx == 0 && dy == 0) continue;
                int tx = ptx + dx, ty = pty + dy;
                var c = W(tx, ty);
                bool overFeet = Mathf.Abs(p.x - c.x) < 0.5f + 0.25f && Mathf.Abs(p.z - c.z) < 0.5f + 0.17f;
                if (!walk.IsFree(tx, ty) || overFeet) continue;
                var r = Camp.PlaceCampfire(S, tx, ty);
                if (!r.ok) { g.Say("这里放不下营火"); return; }
                AddFireView(r.fire);
                g.Save();
                g.Say("营火点起来了：能烧 2 小时，靠近按「互动」可以添柴");
                return;
            }
            g.Say("附近没有空地放营火");
        }

        void AddFireView(Campfire f)
        {
            var go = ModelLibrary.Place("campfire", props, W(f.tx, f.ty), 0.9f, false, 0);
            var l = new GameObject("fire light").AddComponent<Light>();
            l.transform.SetParent(go.transform, false); l.transform.position = W(f.tx, f.ty) + Vector3.up * 0.8f;
            l.type = LightType.Point; l.color = new Color(1f, 0.66f, 0.35f); l.range = (float)Night.LightCampfire * 1.6f; l.intensity = 2.2f; l.shadows = LightShadows.None;
            fireViews[f.id] = (go, l);
            var b = ModelLibrary.Bounds(go);
            var fx = new GameObject("fire").AddComponent<FxEmitter>(); fx.transform.SetParent(go.transform, true);
            fx.transform.position = new Vector3(b.center.x, b.min.y + 0.22f * b.size.y, b.center.z);
            fx.kind = "fire"; fx.size = 0.55f * b.size.y; fx.addLight = false;
            walk.Block(f.tx, f.ty);
        }

        public void AddWood(string fireId)
        {
            var r = Camp.AddWood(S, fireId);
            var g = Session;
            if (!r.ok) { g.Say("背包里没有木材了"); return; }
            var f = Camp.Fires(S).Find(x => x.id == fireId);
            int wood = Camp.WoodToDawn(S, f);
            g.Say($"添了一根柴：还能烧 {r.left / 60} 小时 {r.left % 60} 分" + (wood > 0 ? $"，撑到天亮还差 {wood} 根" : "，够烧到天亮了"));
            g.Save(); g.AfterAction();
        }

        public void CampSleep(string fireId)
        {
            var r = Camp.CanCampSleep(S, fireId);
            if (!r.ok) { Session.Say(r.reason == "no-tent" ? "要有帐篷才能在野外睡觉" : $"火撑不到天亮，还差 {r.wood} 根柴"); return; }
            Guide.Bump(S, "campSleeps");
            Session.EndDay(true);
        }

        void RefreshLostBag()
        {
            if (lostBagView) Destroy(lostBagView);
            var lb = S.expedition?.lostBag;
            if (lb == null) return;
            lostBagView = Placeholder.Sack(props, new Vector3((float)lb.x / GameSession.PxPerMeter, 0, -(float)lb.y / GameSession.PxPerMeter));
        }

        // ---------- night ----------
        readonly List<(Night.Monster m, GameObject go)> monsters = new List<(Night.Monster, GameObject)>();
        readonly List<(Vector3 at, float landAt, GameObject go)> warnings = new List<(Vector3, float, GameObject)>();
        readonly List<GameObject> wicks = new List<GameObject>();
        int? lastSpawn; int wicksNight = -1;

        List<NightLight> Lights()
        {
            var fires = Camp.Burning(S).Select(f => ((double)Px(W(f.tx, f.ty).x), (double)Px(-W(f.tx, f.ty).z)));
            var p = Player.position;
            return Night.Lights(S, Px(p.x), Px(-p.z), fires);
        }

        void Update()
        {
            var g = Session;
            if (g == null || !Player) return;
            // the player's own light (torch / glowing pet) and the campfires burning down
            float pr = (float)Night.PlayerLightTiles(S);
            bool dark = GameTime.TintAt(S.clock).dark > 0.05;
            playerLight.enabled = pr > 0 && dark;
            playerLight.transform.position = Player.position + Vector3.up * 1.2f;
            playerLight.range = pr * 1.7f; playerLight.intensity = 1.6f;
            foreach (var f in Camp.Fires(S)) if (fireViews.TryGetValue(f.id, out var v)) { bool lit = Camp.FireLeft(S, f) > 0; v.light.enabled = lit; }   // FxEmitter flickers it and stops the flames while it's off
            if (Explore.CanWade(S) != wading) RefreshBlocking();
            UpdateNight();
        }

        void UpdateNight()
        {
            var g = Session;
            bool foggy = Night.IsFoggy(S.clock);
            RenderSettings.fogEndDistance = Mathf.Lerp(RenderSettings.fogEndDistance, foggy ? 26 : 170, Time.deltaTime);
            RenderSettings.fogStartDistance = Mathf.Lerp(RenderSettings.fogStartDistance, foggy ? 6 : 45, Time.deltaTime);
            if (!foggy) { if (monsters.Count > 0 || warnings.Count > 0 || wicks.Count > 0) Dissolve(); lastSpawn = null; return; }
            if (g.Clock.Paused) return;
            UpdateWicks();
            var ls = Lights();
            var p = Player.position; double ppx = Px(p.x), ppy = Px(-p.z);
            System.Func<double, double, bool> canStand = (x, y) => { int tx = (int)System.Math.Floor(x / 48), ty = (int)System.Math.Floor(y / 48); return walk.IsLand(tx, ty); };
            if (Night.ShouldSpawn(S.clock, lastSpawn, monsters.Count))
            {
                lastSpawn = S.clock;
                var at = Night.PickSpawn(() => Random.value, ppx, ppy, ls, canStand);
                if (at != null)
                {
                    var m = new Night.Monster { x = at.Value.x, y = at.Value.y, nextAttack = Time.time * 1000 + 2000 };
                    monsters.Add((m, Placeholder.FogMonster(transform)));
                    if (monsters.Count == 1) g.Say("雾里有什么东西在靠近……");
                }
            }
            float dt = Mathf.Min(Time.deltaTime, 0.05f), now = Time.time * 1000;
            for (int i = 0; i < monsters.Count; i++)
            {
                var (m, go) = monsters[i];
                var n = Night.MonsterStep(m, ppx, ppy, ls, dt, canStand);
                n.nextAttack = m.nextAttack;
                if (Night.CanAttack(n, ppx, ppy, ls, now))
                {
                    n.nextAttack = now + Night.AttackEveryMs;
                    warnings.Add((new Vector3(p.x, 0.03f, p.z), now + Night.WarnMs, Placeholder.Warning(transform, new Vector3(p.x, 0.03f, p.z), (float)Night.WarnRadius / 48f)));
                }
                monsters[i] = (n, go);
                go.transform.position = new Vector3((float)n.x / 48f, 0.9f + Mathf.Sin(Time.time * 3 + i) * 0.12f, -(float)n.y / 48f);
                go.transform.LookAt(new Vector3(p.x, go.transform.position.y, p.z));
            }
            for (int i = warnings.Count - 1; i >= 0; i--)
            {
                var (at, landAt, go) = warnings[i];
                float k = Mathf.Clamp01(1 - (landAt - now) / Night.WarnMs);
                Placeholder.SetWarning(go, k);
                if (now < landAt) continue;
                Destroy(go); warnings.RemoveAt(i);
                if (!Night.WarningHits(Px(at.x), Px(-at.z), Night.WarnRadius, ppx, ppy)) continue;
                var ev = Survival.ApplyDamage(S.player, Night.Damage, "expedition");
                g.Say($"被雾怪打中了！生命 −{Night.Damage}");
                g.AfterAction();
                if (ev.Contains("faint")) { g.Faint(); return; }
            }
        }

        // 狐火灯芯: two glowing wicks on the island each night (the 化形 quest needs 3)
        void UpdateWicks()
        {
            if (wicksNight != S.day)
            {
                wicksNight = S.day;
                var rng = new Mulberry32((long)Island.seed * 13 + (long)S.day * 101);
                for (int i = 0, tries = 0; i < 2 && tries < 60; tries++)
                {
                    int tx = (int)System.Math.Floor(rng.Next() * Island.cols), ty = (int)System.Math.Floor(rng.Next() * Island.rows);
                    if (!walk.IsFree(tx, ty)) continue;
                    var at = W(tx, ty);
                    if (Vector3.Distance(at, Player.position) < 4) continue;
                    wicks.Add(Placeholder.Wick(transform, at));
                    i++;
                }
            }
            for (int i = wicks.Count - 1; i >= 0; i--)
            {
                var wk = wicks[i];
                wk.transform.position = new Vector3(wk.transform.position.x, 0.6f + Mathf.Sin(Time.time * 2 + i) * 0.1f, wk.transform.position.z);
                if (Px(Vector2.Distance(new Vector2(wk.transform.position.x, wk.transform.position.z), new Vector2(Player.position.x, Player.position.z))) > 34) continue;
                if (!Inventory.AddItem(S.inventory, "item_foxwick", 1, Crafting.BagSlots(S))) { Session.Say("背包满了，捡不了狐火灯芯"); continue; }
                Session.Gained("item_foxwick", wk.transform.position);
                Destroy(wk); wicks.RemoveAt(i);
                Session.Say($"捡到了狐火灯芯（{Inventory.CountOf(S.inventory, "item_foxwick")}/3）");
                Session.AfterAction();
            }
        }

        void Dissolve()
        {
            foreach (var (_, go) in monsters) Destroy(go);
            foreach (var (_, _, go) in warnings) Destroy(go);
            foreach (var w in wicks) Destroy(w);
            monsters.Clear(); warnings.Clear(); wicks.Clear();
        }

        public override void OnDayEnded() { Dissolve(); lastSpawn = null; }
    }
}
