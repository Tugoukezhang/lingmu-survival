// The home island: the tent (sleep), farm plots, shipping box, seed stand, storage, the dock (expeditions),
// the cottage door and the rope bridge to 风铃小镇. Positions come from the same layout as the web version.
using System.Collections.Generic;
using System.Linq;
using Lingmu.Rules;
using Lingmu.World;
using UnityEngine;

namespace Lingmu.Game
{
    public class HomeArea : Area
    {
        public override string Id => "home";
        const float InteractRange = 70f / GameSession.PxPerMeter;   // web INTERACT_RANGE

        public IslandWalkMap walk;
        public HomeIslandLayout Layout { get; private set; }
        readonly List<Spot> spots = new List<Spot>();

        void Awake()
        {
            Layout = HomeIslandLayout.Generate();
            var L = Layout;
            void Add(string kind, string verb, string label, float tx, float ty) => spots.Add(new Spot { kind = kind, verb = verb, label = label, pos = HomeIslandLayout.TileToWorld(tx, ty) });
            Add("tent", "睡觉", "帐篷 · 点互动睡觉", L.Tent.x, L.Tent.y);
            Add("ship", "出货", "出货箱 · 放进去的东西明早换成四叶草", L.ShipBox.x, L.ShipBox.y);
            Add("seeds", "买种子", "种子摊 · 买种子", L.SeedStand.x, L.SeedStand.y);
            Add("storage", "仓库", "仓库 · 点互动打开", L.Storage.x, L.Storage.y);
            Add("dock", "出发", "飞艇码头 · 坐飞艇去远征岛", L.DockTile.x, L.DockTile.y + 0.5f);
            Add("door", "进屋", "小屋 · 进屋", L.CottageRect.x + L.CottageRect.w / 2f - 0.5f, L.CottageRect.y + L.CottageRect.h);
            Add("bridge", "过桥", "吊桥 · 去风铃小镇（10 分钟）", L.BridgeTile.x, L.BridgeTile.y + 0.5f);
            Add("campfire", "制作", "营火 · 家园的营火一直烧着，可以在这儿制作", L.Campfire.x, L.Campfire.y);
            Add("expand", "扩建", "扩建用地 · 买下变成第二块农田", L.ExpandRect.x + L.ExpandRect.w / 2f - 0.5f, L.ExpandRect.y + L.ExpandRect.h);
        }

        bool lotBlocked;
        void Start() { if (walk && !(S.world?.expanded ?? false)) { walk.Block(Layout.ExpandRect); lotBlocked = true; } }
        void Update()
        {
            if (!lotBlocked || !(S.world?.expanded ?? false)) return;
            var r = Layout.ExpandRect;
            for (int y = r.y; y < r.y + r.h; y++) for (int x = r.x; x < r.x + r.w; x++) walk.Unblock(x, y);
            lotBlocked = false;
        }

        public override bool CanStand(Vector3 p) => !walk || walk.FootFits(p);

        // web createPlayer: by the dock after a trip, at the bridge from town, at the door from the house, else by the tent
        public override Vector3 ArrivePoint(GameState s)
        {
            var L = Layout;
            return s.flags.arriveAt switch
            {
                "dock" => HomeIslandLayout.TileToWorld(L.DockTile.x, L.DockTile.y - 0.6f),
                "bridge" => HomeIslandLayout.TileToWorld(L.BridgeTile.x - 0.8f, L.BridgeTile.y + 0.2f),
                "house" => HomeIslandLayout.TileToWorld(L.CottageRect.x + L.CottageRect.w / 2f - 0.5f, L.CottageRect.y + L.CottageRect.h + 0.6f),
                _ => HomeIslandLayout.TileToWorld(L.Tent.x, L.Tent.y + 1.2f),
            };
        }

        // the field, plus the second field once the expansion is bought (web farm.js)
        public bool IsPlot(int tx, int ty)
        {
            bool In(TileRect r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h;
            return In(Layout.FarmRect) || ((S.world?.expanded ?? false) && In(Layout.ExpandRect));
        }

        public override IEnumerable<Spot> MapSpots() => spots;

        // the arrow: "plot" or "plot:<action>" finds the nearest plot that needs it (the middle of the field if none does)
        public override Vector3? FindPlace(string place, Vector3 from)
        {
            if (!place.StartsWith("plot")) return base.FindPlace(place, from);
            string want = place.Length > 5 ? place.Substring(5) : null;
            Vector3? best = null; float bd = float.MaxValue;
            void Scan(TileRect r)
            {
                for (int y = r.y; y < r.y + r.h; y++)
                    for (int x = r.x; x < r.x + r.w; x++)
                    {
                        var act = Farm.PlotAction(S, Farm.PlotKey(x, y));
                        if (want != null && act != want && !(want == "plant" && act == "till")) continue;
                        var w = HomeIslandLayout.TileToWorld(x, y); float d = (w - from).sqrMagnitude;
                        if (d < bd) { bd = d; best = w; }
                    }
            }
            Scan(Layout.FarmRect);
            if (S.world?.expanded ?? false) Scan(Layout.ExpandRect);
            var f = Layout.FarmRect;
            return best ?? HomeIslandLayout.TileToWorld(f.x + f.w / 2f, f.y + f.h / 2f);
        }

        public override Spot CurrentSpot(Vector3 p)
        {
            // a farm plot under your feet beats the box next to it
            int tx = Mathf.FloorToInt(p.x / HomeIslandLayout.TileSize), ty = Mathf.FloorToInt(-p.z / HomeIslandLayout.TileSize);
            if (IsPlot(tx, ty))
            {
                var key = Farm.PlotKey(tx, ty);
                var plot = Farm.PlotOf(S, key);
                string crop = plot.crop != null ? GameData.Crops[plot.crop].name : null;
                var (verb, label) = Farm.PlotAction(S, key) switch
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
                if (s.kind == "expand" && (S.world?.expanded ?? false)) continue;
                float d = Vector2.Distance(new Vector2(p.x, p.z), new Vector2(s.pos.x, s.pos.z));
                if (d < bestD) { bestD = d; best = s; }
            }
            return best;
        }

        public override string Act(Spot s)
        {
            switch (s.kind)
            {
                case "tent": Session.EndDay(true); return null;
                case "plot": FarmAt(s.key); return null;
                case "ship": return "ship";
                case "seeds": return "seeds";
                case "storage": return "storage";
                case "campfire": return "craft";
                case "dock": return "dock";
                case "expand": return "expand";
                case "door": Session.GoTo("house"); return null;
                case "bridge": Session.GoTo("town"); return null;
            }
            return null;
        }

        void FarmAt(string key)
        {
            var g = Session;
            switch (Farm.PlotAction(S, key))
            {
                case "till": { var r = Farm.Till(S, key); g.Say(r.ok ? "开垦好了，可以播种" : "要有锄头才能开垦"); break; }
                case "plant":
                {
                    var seed = S.inventory.Select(x => x.id).FirstOrDefault(id => GameData.CropBySeed(id) != null);
                    if (seed == null) { g.Say("背包里没有种子：去种子摊买"); break; }
                    var r = Farm.Plant(S, key, seed);
                    if (r.ok) g.Say($"种下了{GameData.Crops[r.crop].name}，记得每天浇水");
                    break;
                }
                case "water": { var r = Farm.Water(S, key); g.Say(r.ok ? "浇好水了" : "要有水壶才能浇水"); break; }
                case "harvest": { var r = Farm.Harvest(S, key); g.Say(r.ok ? $"收获了{GameData.Item(r.item).name}！" : "背包满了"); if (r.ok) { var xy = key.Split(','); g.Gained(r.item, HomeIslandLayout.TileToWorld(int.Parse(xy[0]), int.Parse(xy[1]))); } break; }
                default: g.Say("今天浇过水了，睡一觉它就会长"); break;
            }
        }
    }
}
