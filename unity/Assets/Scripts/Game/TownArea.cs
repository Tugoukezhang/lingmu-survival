// 风铃小镇 (web scenes/play/town.js): an oval island 34×22 tiles, three houses with their residents in front,
// a fountain and four street lamps on the plaza, the rope bridge home on the east edge, the broken bridge north.
using System.Collections.Generic;
using Lingmu.Rules;
using Lingmu.World;
using UnityEngine;

namespace Lingmu.Game
{
    public class TownArea : Area
    {
        public override string Id => "town";
        public const int W = 34, H = 22;
        const float InteractRange = 70f / GameSession.PxPerMeter;

        public struct House { public string npc, model, sign; public int x, y, w, h, sx, sy; public float yaw; }
        public static readonly House[] Houses =
        {
            new House { npc = "granny", model = "bld_shop_granny", sign = "铃奶奶杂货铺", x = 7, y = 4, w = 5, h = 3, sx = 9, sy = 8, yaw = 90 },
            new House { npc = "ali", model = "bld_workshop", sign = "阿栗木工坊", x = 21, y = 4, w = 5, h = 3, sx = 23, sy = 8, yaw = 90 },
            new House { npc = "lumi", model = "bld_lab", sign = "露米宠物研究所", x = 14, y = 15, w = 5, h = 3, sx = 16, sy = 13, yaw = 270 },
        };

        public IslandWalkMap walk;
        readonly List<Spot> spots = new List<Spot>();
        Vector2Int bridgeTile, northTile;

        public static bool Land(int x, int y) { float cx = W / 2f, cy = H / 2f; return x >= 0 && y >= 0 && x < W && y < H && Mathf.Pow((x + 0.5f - cx) / 15.6f, 2) + Mathf.Pow((y + 0.5f - cy) / 9.6f, 2) < 1; }

        // the town's ground: an oval meadow, a paved plaza, paths to the bridges and to each house's door
        public static IslandShape Shape()
        {
            var (east, north) = Bridges();
            var plaza = new Vector2(W / 2f, H / 2f);
            var shape = new IslandShape { cols = W, rows = H, seed = 777, land = Land, meadow = plaza - new Vector2(0.5f, 0.5f) };
            shape.curves.Add((new Vector2(east.x + 0.5f, east.y + 0.5f), plaza, 0.04f, 1.0f));
            shape.curves.Add((plaza + new Vector2(-2.2f, 0), plaza + new Vector2(2.2f, 0), 0, -3.6f));
            shape.curves.Add((plaza, new Vector2(north.x + 0.5f, north.y + 0.5f), 0, 0.9f));
            foreach (var h in Houses) shape.curves.Add((plaza, new Vector2(h.sx + 0.5f, h.sy + 0.5f), 0.1f, 0.9f));
            return shape;
        }

        public static (Vector2Int east, Vector2Int north) Bridges()
        {
            int row = H / 2, ex = W - 1; while (!Land(ex, row)) ex--;
            int bx = W / 2, by = 0; while (!Land(bx, by)) by++;
            return (new Vector2Int(ex, row), new Vector2Int(bx, by));
        }

        void Awake()
        {
            (bridgeTile, northTile) = Bridges();
            spots.Add(new Spot { kind = "home", verb = "回家", label = "吊桥 · 回家园（10 分钟）", pos = HomeIslandLayout.TileToWorld(bridgeTile.x, bridgeTile.y) });
            foreach (var h in Houses)
            {
                var n = GameData.Npcs[h.npc];
                spots.Add(new Spot { kind = "npc", key = h.npc, verb = "聊天", label = $"{n.name} · {n.role}", pos = HomeIslandLayout.TileToWorld(h.sx, h.sy) });
            }
            spots.Add(new Spot { kind = "north", verb = "修桥", label = "断桥 · 需要修理", pos = HomeIslandLayout.TileToWorld(northTile.x, northTile.y) });
        }

        public override bool CanStand(Vector3 p) => !walk || walk.FootFits(p);
        public override Vector3 ArrivePoint(GameState s) => HomeIslandLayout.TileToWorld(bridgeTile.x - 1, bridgeTile.y);

        public override IEnumerable<Spot> MapSpots() => spots;

        public override Spot CurrentSpot(Vector3 p)
        {
            Spot best = null; float bestD = InteractRange;
            foreach (var s in spots)
            {
                float d = Vector2.Distance(new Vector2(p.x, p.z), new Vector2(s.pos.x, s.pos.z)) - (s.kind == "npc" ? 0.25f : 0);
                if (d < bestD) { bestD = d; best = s; }
            }
            if (best?.kind == "north" && (S.world?.bridge ?? false)) { best.verb = "过桥"; best.label = "星光岛之桥 · 修好了"; }
            return best;
        }

        public override string Act(Spot s)
        {
            switch (s.kind)
            {
                case "home": Session.GoTo("home"); return null;
                case "npc": return "talk:" + s.key;
                case "north": if (S.world?.bridge ?? false) { Session.Say("桥那头的星光岛还在建设中，以后开放"); return null; } return "repair";
            }
            return null;
        }
    }
}
