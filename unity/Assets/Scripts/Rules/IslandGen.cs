// Expedition island generator, biome 雾林 (systems/islandGen.js; docs/06 第 5 节, S17).
// Pure and deterministic: the same seed always gives the same island as the web version (checked by tests).
// The save stores only the seed + a change record; the island is regenerated each visit.
using System;
using System.Collections.Generic;
using System.Linq;
using Lingmu.Core;

namespace Lingmu.Rules
{
    public class IslandThing
    {
        public string id, type, species, kind;   // type: resource kind; species: wild pet; kind: rare spot (chest | crystal)
        public int tx, ty;
        public bool bonus, rare;
    }

    public class IslandMap
    {
        public int seed, requestedSeed, attempts, cols, rows, area;
        public bool fallback;
        public string biome = "mistwood";
        public bool[][] walk, water;
        public (int tx, int ty) landing, airship;
        public List<IslandThing> camps, chests, resources, pets, thorns, rare;
        public IslandMap ShallowCopy() => (IslandMap)MemberwiseClone();
    }

    public static class IslandGen
    {
        public const int W = 40, H = 30, MinArea = 600, MaxAttempts = 10;
        public static readonly (string type, int w)[] ResourceWeights = { ("tree", 35), ("rock", 25), ("bush", 15), ("grass", 15), ("crystal", 10) };
        public static readonly Dictionary<string, bool> Blocking = new Dictionary<string, bool> { { "tree", true }, { "rock", true }, { "bush", true }, { "crystal", true }, { "grass", false } };
        static readonly (int dx, int dy)[] Dirs4 = { (1, 0), (-1, 0), (0, 1), (0, -1) };

        static T[][] Grid<T>(T v) { var g = new T[H][]; for (int y = 0; y < H; y++) { g[y] = new T[W]; for (int x = 0; x < W; x++) g[y][x] = v; } return g; }
        static bool Inside(int x, int y) => x >= 0 && y >= 0 && x < W && y < H;
        static int Key(int x, int y) => y * W + x;
        static double Sq(double v) => v * v;
        static int JsRound(double v) => (int)Math.Floor(v + 0.5);

        static int[][] Bfs(Func<int, int, bool> passable, int sx, int sy)
        {
            var dist = Grid(-1);
            if (!passable(sx, sy)) return dist;
            var q = new List<(int, int)> { (sx, sy) }; dist[sy][sx] = 0;
            for (int i = 0; i < q.Count; i++)
            {
                var (x, y) = q[i];
                foreach (var (dx, dy) in Dirs4)
                {
                    int nx = x + dx, ny = y + dy;
                    if (Inside(nx, ny) && dist[ny][nx] < 0 && passable(nx, ny)) { dist[ny][nx] = dist[y][x] + 1; q.Add((nx, ny)); }
                }
            }
            return dist;
        }

        static string PickWeighted(Func<double> rand, (string v, int w)[] table)
        {
            int total = table.Sum(t => t.w);
            double r = rand() * total;
            foreach (var (v, w) in table) { if (r < w) return v; r -= w; }
            return table[table.Length - 1].v;
        }

        static T Pick<T>(Func<double> rand, IList<T> list) => list[(int)Math.Floor(rand() * list.Count)];

        // cells blocked by remaining entities (blocking resources, chests, thorns); water is separate
        public static bool[][] BlockedGrid(IslandMap island)
        {
            var b = Grid(false);
            foreach (var r in island.resources) if (Blocking[r.type]) b[r.ty][r.tx] = true;
            foreach (var c in island.chests) b[c.ty][c.tx] = true;
            foreach (var t in island.thorns ?? new List<IslandThing>()) b[t.ty][t.tx] = true;
            return b;
        }

        static (IslandMap island, string why) Attempt(int seed, bool plain)
        {
            var rng = new Mulberry32(seed); Func<double> rand = rng.Next;
            var noise = new ValueNoise2D((long)seed + 101, 5);
            double amp = plain ? 0 : 0.8;
            double cx = W / 2.0, cy = H / 2.0;
            double rx = 16.5 + rand() * 2, ry = 12.4 + rand() * 1;

            // 1. outline: noisy ellipse, a 1-cell sky border, keep the largest connected piece
            var walk = Grid(false);
            for (int y = 1; y < H - 1; y++)
                for (int x = 1; x < W - 1; x++)
                {
                    double d = Sq((x + 0.5 - cx) / rx) + Sq((y + 0.5 - cy) / ry);
                    walk[y][x] = d + (noise.Sample(x, y) - 0.5) * amp < 1;
                }
            var seen = new HashSet<int>();
            var best = new List<(int x, int y)>();
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    if (!walk[y][x] || seen.Contains(Key(x, y))) continue;
                    var w0 = walk;
                    var d = Bfs((a, b) => w0[b][a], x, y);
                    var cells = new List<(int, int)>();
                    for (int yy = 0; yy < H; yy++) for (int xx = 0; xx < W; xx++) if (d[yy][xx] >= 0) { cells.Add((xx, yy)); seen.Add(Key(xx, yy)); }
                    if (cells.Count > best.Count) best = cells;
                }
            walk = Grid(false);
            foreach (var (x, y) in best) walk[y][x] = true;
            int area = best.Count;
            if (area < MinArea) return (null, $"area {area}");
            bool IsWalk(int x, int y) => Inside(x, y) && walk[y][x];

            // 2. landing: a south-edge cell with solid ground above it; the airship floats just below
            var edges = best.Where(c => !IsWalk(c.x, c.y + 1) && IsWalk(c.x, c.y - 1) && IsWalk(c.x, c.y - 2) && IsWalk(c.x - 1, c.y) && IsWalk(c.x + 1, c.y) && c.y > cy).ToList();
            if (edges.Count == 0) edges = best.Where(c => !IsWalk(c.x, c.y + 1)).ToList();
            var (lx, ly) = Pick(rand, edges);
            var landing = (tx: lx, ty: ly - 1);
            var airship = (tx: lx, ty: ly + 1);
            var dist = Bfs(IsWalk, landing.tx, landing.ty);
            int maxDist = dist.SelectMany(r => r).Max();

            var reserved = new HashSet<int>();
            void Reserve(int x, int y, int r = 0) { for (int dy = -r; dy <= r; dy++) for (int dx = -r; dx <= r; dx++) reserved.Add(Key(x + dx, y + dy)); }
            Reserve(landing.tx, landing.ty, 2);
            Reserve(lx, ly, 1);
            bool Free(int x, int y) => IsWalk(x, y) && !reserved.Contains(Key(x, y));
            bool Far(List<IslandThing> list, int x, int y, int gap) => list.All(o => Math.Abs(o.tx - x) + Math.Abs(o.ty - y) >= gap);

            // 2b. shallow ponds: 1–2 inland, most with a tiny islet holding a rare crystal (涉水)
            var water = Grid(false);
            var islets = new List<(int tx, int ty)>();
            int pondCount = rand() < 0.35 ? 2 : 1;
            var plus = new[] { (0, 0), (1, 0), (-1, 0), (0, 1), (0, -1) };
            for (int p = 0, tries = 0; p < pondCount && tries < 60; tries++)
            {
                var (px, py) = Pick(rand, best);
                if (dist[py][px] < 7) continue;
                double small = tries > 30 ? 0.62 : 1;
                double prx = (2.6 + rand() * 1.4) * small, pry = (1.9 + rand() * 1.0) * small;
                var cells = new List<(int x, int y)>();
                bool ok = true;
                for (int y = py - 4; y <= py + 4 && ok; y++)
                    for (int x = px - 5; x <= px + 5; x++)
                    {
                        if (Sq((x - px) / prx) + Sq((y - py) / pry) > 1) continue;
                        if (!plus.All(o => IsWalk(x + o.Item1, y + o.Item2)) || reserved.Contains(Key(x, y)) || water[y][x]) { ok = false; break; }
                        cells.Add((x, y));
                    }
                if (!ok || cells.Count < 5) continue;
                foreach (var (x, y) in cells) water[y][x] = true;
                foreach (var (x, y) in cells) Reserve(x, y, 1);
                if (cells.Count >= 9 && rand() < 0.7) { water[py][px] = false; islets.Add((px, py)); }
                p++;
            }

            // 2c. thorn-guarded chest (开路): a far 5×5 free spot, chest in the middle, thorns all around
            (int tx, int ty)? bonus = null;
            var span = new[] { -2, -1, 0, 1, 2 };
            var bonusCells = best.Where(c => dist[c.y][c.x] >= maxDist * 0.5 && span.All(dy => span.All(dx => Free(c.x + dx, c.y + dy) && !water[c.y + dy][c.x + dx]))).ToList();
            if (bonusCells.Count > 0) { var (x, y) = Pick(rand, bonusCells); bonus = (x, y); Reserve(x, y, 2); }
            var thorns = new List<IslandThing>();
            if (bonus != null) for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) if (dx != 0 || dy != 0) thorns.Add(new IslandThing { id = $"t{thorns.Count}", tx = bonus.Value.tx + dx, ty = bonus.Value.ty + dy });

            // 3. camps: 3×3 open clearings, not too close to the landing
            var camps = new List<IslandThing>();
            int campCount = 1 + (int)Math.Floor(rand() * 2);
            var span1 = new[] { -1, 0, 1 };
            var campCells = best.Where(c => dist[c.y][c.x] >= 8 && span1.All(dy => span1.All(dx => Free(c.x + dx, c.y + dy)))).ToList();
            for (int i = 0; i < 40 && camps.Count < campCount && campCells.Count > 0; i++)
            {
                var (x, y) = Pick(rand, campCells);
                if (Far(camps, x, y, 8)) { camps.Add(new IslandThing { id = $"k{camps.Count}", tx = x, ty = y }); Reserve(x, y, 1); }
            }

            // 4. chests: in the farthest part of the island
            var chests = new List<IslandThing>();
            int chestCount = 1 + (int)Math.Floor(rand() * 2);
            var chestCells = best.Where(c => dist[c.y][c.x] >= maxDist * 0.75 && Free(c.x, c.y)).ToList();
            for (int i = 0; i < 40 && chests.Count < chestCount && chestCells.Count > 0; i++)
            {
                var (x, y) = Pick(rand, chestCells);
                if (Far(chests, x, y, 5)) { chests.Add(new IslandThing { id = $"c{chests.Count}", tx = x, ty = y }); Reserve(x, y, 1); }
            }
            if (bonus != null) chests.Add(new IslandThing { id = $"c{chests.Count}", tx = bonus.Value.tx, ty = bonus.Value.ty, bonus = true });

            // 5. resource clusters by weight
            var resources = new List<IslandThing>();
            var taken = new HashSet<int>();
            int clusterCount = 16 + (int)Math.Floor(rand() * 5);
            for (int c = 0; c < clusterCount; c++)
            {
                var type = PickWeighted(rand, ResourceWeights);
                (int x, int y)? center = null;
                for (int t = 0; t < 30 && center == null; t++)
                {
                    var (x, y) = Pick(rand, best);
                    if (Free(x, y) && dist[y][x] >= 3 && !taken.Contains(Key(x, y))) center = (x, y);
                }
                if (center == null) continue;
                int size = type == "tree" ? 3 + (int)Math.Floor(rand() * 4) : 2 + (int)Math.Floor(rand() * 3);
                for (int n = 0, tries = 0; n < size && tries < 20; tries++)
                {
                    int x = center.Value.x + JsRound((rand() - 0.5) * 4), y = center.Value.y + JsRound((rand() - 0.5) * 4);
                    if (!Free(x, y) || taken.Contains(Key(x, y))) continue;
                    taken.Add(Key(x, y));
                    resources.Add(new IslandThing { id = $"r{resources.Count}", type = type, tx = x, ty = y });
                    n++;
                }
            }
            foreach (var (tx, ty) in islets) resources.Add(new IslandThing { id = $"r{resources.Count}", type = "crystal", tx = tx, ty = ty, rare = true });

            // 6. wild pets: 4–6, away from the landing, not on top of each other
            var pets = new List<IslandThing>();
            int petCount = 4 + (int)Math.Floor(rand() * 3);
            for (int t = 0; t < 200 && pets.Count < petCount; t++)
            {
                var (x, y) = Pick(rand, best);
                if (!Free(x, y) || taken.Contains(Key(x, y)) || dist[y][x] < 6 || !Far(pets, x, y, 4)) continue;
                pets.Add(new IslandThing { id = $"w{pets.Count}", species = Pick(rand, GameData.Pets.ToList()).id, tx = x, ty = y });
            }

            // rare spots (shown by a 100-affection 月影狐猫): the thorn chest and islet crystals
            var rare = chests.Where(c => c.bonus).Select(c => new IslandThing { kind = "chest", id = c.id, tx = c.tx, ty = c.ty })
                .Concat(resources.Where(r => r.rare).Select(r => new IslandThing { kind = "crystal", id = r.id, tx = r.tx, ty = r.ty })).ToList();
            var island = new IslandMap
            {
                seed = seed, cols = W, rows = H, walk = walk, water = water, area = area, landing = landing, airship = airship,
                camps = camps, chests = chests, resources = resources, pets = pets, thorns = thorns, rare = rare,
            };
            var problem = Validate(island);
            return problem != null ? (null, problem) : (island, null);
        }

        // Everything must be reachable from the landing (blocking things count when a neighbour is).
        // Without pet skills water and thorns block; the thorn chest must be reachable once thorns are cleared,
        // islet crystals once you can wade. Returns null when fine.
        public static string Validate(IslandMap island)
        {
            var blocked = BlockedGrid(island);
            var walk = island.walk; var water = island.water ?? Grid(false);
            var dist = Bfs((x, y) => walk[y][x] && !water[y][x] && !blocked[y][x], island.landing.tx, island.landing.ty);
            bool Reach(int x, int y) => Inside(x, y) && dist[y][x] >= 0;
            bool Touch(int x, int y) => Dirs4.Any(d => Reach(x + d.dx, y + d.dy));
            var wadeDist = Bfs((x, y) => walk[y][x] && !blocked[y][x], island.landing.tx, island.landing.ty);
            bool TouchWading(int x, int y) => Dirs4.Any(d => Inside(x + d.dx, y + d.dy) && wadeDist[y + d.dy][x + d.dx] >= 0);
            if (!Reach(island.landing.tx, island.landing.ty)) return "landing blocked";
            if (island.camps.Count < 1) return "no camp";
            if (island.chests.Count < 1) return "no chest";
            if (island.pets.Count < 4) return "too few pets";
            foreach (var c in island.camps) if (!Reach(c.tx, c.ty)) return $"camp {c.id} unreachable";
            foreach (var p in island.pets) if (!Reach(p.tx, p.ty)) return $"pet {p.id} unreachable";
            foreach (var c in island.chests)
            {
                if (c.bonus) { if (!(island.thorns ?? new List<IslandThing>()).Any(t => t.tx != c.tx && Touch(t.tx, t.ty))) return $"thorn chest {c.id} unreachable"; }
                else if (!Touch(c.tx, c.ty)) return $"chest {c.id} unreachable";
            }
            foreach (var r in island.resources)
            {
                if (r.rare) { if (!TouchWading(r.tx, r.ty)) return $"islet {r.id} unreachable"; continue; }
                if (!(Blocking[r.type] ? Touch(r.tx, r.ty) : Reach(r.tx, r.ty))) return $"resource {r.id} unreachable";
            }
            return null;
        }

        // tries seed, seed+1, … up to 10 times; then a plain fallback island
        public static IslandMap Generate(int requestedSeed)
        {
            for (int i = 0; i < MaxAttempts; i++)
            {
                var (island, _) = Attempt(requestedSeed + i, false);
                if (island != null) { island.requestedSeed = requestedSeed; island.attempts = i + 1; island.fallback = false; return island; }
            }
            for (int i = 0; i < 50; i++)
            {
                var (island, _) = Attempt(requestedSeed + i, true);
                if (island != null) { island.requestedSeed = requestedSeed; island.attempts = MaxAttempts; island.fallback = true; return island; }
            }
            throw new InvalidOperationException($"island generation failed for seed {requestedSeed}");
        }

        // removes what the player already took (collected spots stay empty)
        public static IslandMap ApplyChanges(IslandMap island, IslandChanges changes = null)
        {
            changes ??= new IslandChanges();
            List<IslandThing> Gone(List<IslandThing> list, List<string> ids) => list.Where(o => !(ids ?? new List<string>()).Contains(o.id)).ToList();
            var c = island.ShallowCopy();
            c.resources = Gone(island.resources, changes.collected);
            c.chests = Gone(island.chests, changes.chests);
            c.pets = Gone(island.pets, changes.pets);
            c.thorns = Gone(island.thorns ?? new List<IslandThing>(), changes.thorns);
            return c;
        }
    }
}
