// Daily settlement, night danger & light, camping, airship travel, fainting & the lost bag
// (systems/time.js runSettlement, night.js, camp.js, travel.js; docs/00 第 3 节, docs/06 第 2–5 节).
using System;
using System.Collections.Generic;
using System.Linq;
using Lingmu.Core;

namespace Lingmu.Rules
{
    public class SettlementReport { public int endedDay, day; public List<string> order = new List<string>(), lines = new List<string>(); }

    public static class Settlement
    {
        public class Step { public string id, name; public Func<GameState, bool, List<string>> run; }

        // order from docs/00 第 3 节: rest → shipping → crops → pet work → home resources → weather → (save, by the caller)
        public static readonly Step[] Steps =
        {
            new Step { id = "rest", name = "休息", run = (s, slept) =>
            {
                if (!slept) return new List<string> { "没睡觉，天亮了…生命没有恢复" };
                s.player.hp = s.player.hpMax;
                s.player.hunger = Math.Max(0, s.player.hunger - 20);
                foreach (var p in s.pets) p.hp = null;   // pets rest too
                Guide.Bump(s, "sleeps");
                return new List<string> { "睡了个好觉：生命回满，饱食 −20，伙伴们也恢复了精神" };
            } },
            new Step { id = "shipping", name = "出货结算", run = (s, _) => s.farm != null ? Farm.SettleShipping(s) : new List<string>() },
            new Step { id = "crops", name = "作物生长", run = (s, _) => s.farm != null ? Farm.GrowCrops(s) : new List<string>() },
            new Step { id = "petWork", name = "宠物打工", run = (s, _) => PetCare.RunPetWork(s) },
            new Step { id = "resources", name = "刷新家园资源", run = (s, _) => new List<string>() },
            new Step { id = "weather", name = "天气", run = (s, _) => new List<string>() },
        };

        // ends the current day and starts the next at 6:00
        public static SettlementReport Run(GameState s, bool slept = true, IEnumerable<Step> steps = null)
        {
            var r = new SettlementReport { endedDay = s.day };
            s.day = r.endedDay + 1;
            s.clock = GameTime.DayStart;
            foreach (var step in steps ?? Steps)
            {
                r.order.Add(step.id);
                var output = step.run(s, slept);
                if (output != null) r.lines.AddRange(output);
            }
            r.day = s.day;
            return r;
        }
    }

    public struct NightLight { public double x, y, r; public string kind; }

    // fog monsters and light (night.js). Positions in web px (1 tile = 48 px).
    public static class Night
    {
        public const double TilePx = 48;
        public const double LightCampfire = 4, LightTorch = 2, LightPetGlow = 1.5;
        public const int TorchMinutes = 3 * 60;
        public const int MonsterMax = 3;
        public const double MonsterSpeed = 38, AttackRange = 4 * TilePx, WarnRadius = 1.2 * TilePx, SpawnMin = 6 * TilePx, SpawnMax = 9 * TilePx, EdgeMargin = 10;
        public const int WarnMs = 1200, Damage = 15, AttackEveryMs = 4000;
        public const int FirstSpawn = GameTime.NightStart + 10;   // 20:10

        // absolute game minute, monotonic across days
        public static int AbsMinute(GameState s) => s.day * 1440 + s.clock;
        public static bool IsFoggy(int clock) => GameTime.PhaseAt(clock) == "night";
        // every 60 game minutes, every 30 after midnight
        public static int SpawnInterval(int clock) => clock >= 24 * 60 || clock < GameTime.DayStart ? 30 : 60;

        public static bool ShouldSpawn(int clock, int? lastSpawn, int count)
        {
            if (!IsFoggy(clock) || count >= MonsterMax) return false;
            if (lastSpawn == null) return clock >= FirstSpawn || clock < GameTime.DayStart;
            return clock - lastSpawn.Value >= SpawnInterval(clock);
        }

        public static bool TorchLit(GameState s) => (s.player.torchUntil ?? 0) > AbsMinute(s);
        public static int LightTorchNow(GameState s) { s.player.torchUntil = AbsMinute(s) + TorchMinutes; return s.player.torchUntil.Value; }
        public static bool PartyGlows(GameState s) => Explore.GlowTiles(s) > 0;

        // the biggest of torch / glowing pet (they don't add up)
        public static double PlayerLightTiles(GameState s)
        {
            double r = 0;
            if (TorchLit(s)) r = Math.Max(r, LightTorch);
            return Math.Max(r, Explore.GlowTiles(s));
        }

        public static List<NightLight> Lights(GameState s, double px, double py, IEnumerable<(double x, double y)> fires = null)
        {
            var output = (fires ?? Enumerable.Empty<(double, double)>()).Select(f => new NightLight { x = f.x, y = f.y, r = LightCampfire * TilePx, kind = "campfire" }).ToList();
            double pr = PlayerLightTiles(s);
            if (pr > 0) output.Add(new NightLight { x = px, y = py, r = pr * TilePx, kind = "player" });
            return output;
        }

        static double Hyp(double x, double y) => Math.Sqrt(x * x + y * y);
        public static NightLight? LitBy(List<NightLight> ls, double x, double y, double margin = 0)
        {
            foreach (var l in ls) if (Hyp(x - l.x, y - l.y) < l.r + margin) return l;
            return null;
        }

        public class Monster { public double x, y; public bool stopped, retreating; public double nextAttack; public Monster With(double nx, double ny, bool st, bool re) => new Monster { x = nx, y = ny, stopped = st, retreating = re, nextAttack = nextAttack }; }

        // monsters walk toward the player, stop at the edge of any light, back out if inside one
        public static Monster MonsterStep(Monster m, double px, double py, List<NightLight> ls, double dt, Func<double, double, bool> canStand = null)
        {
            var inside = LitBy(ls, m.x, m.y);
            double dx, dy;
            if (inside != null) { dx = m.x - inside.Value.x; dy = m.y - inside.Value.y; }
            else { dx = px - m.x; dy = py - m.y; }
            double len = Hyp(dx, dy); if (len == 0) len = 1;
            double step = MonsterSpeed * dt * (inside != null ? 1.5 : 1);
            double nx = m.x + dx / len * step, ny = m.y + dy / len * step;
            if (inside == null && (LitBy(ls, nx, ny, EdgeMargin) != null || Hyp(px - m.x, py - m.y) < 40)) return m.With(m.x, m.y, true, false);
            if (canStand != null && !canStand(nx, ny)) return m.With(m.x, m.y, true, inside != null);
            return m.With(nx, ny, false, inside != null);
        }

        public static bool CanAttack(Monster m, double px, double py, List<NightLight> ls, double now) => LitBy(ls, m.x, m.y) == null && now >= m.nextAttack && Hyp(px - m.x, py - m.y) <= AttackRange;
        public static bool WarningHits(double wx, double wy, double wr, double px, double py) => Hyp(px - wx, py - wy) <= wr;

        // in the fog (unlit), walkable, 6–9 tiles from the player
        public static (double x, double y)? PickSpawn(Func<double> rng, double px, double py, List<NightLight> ls, Func<double, double, bool> canStand, int tries = 40)
        {
            for (int i = 0; i < tries; i++)
            {
                double a = rng() * Math.PI * 2, d = SpawnMin + rng() * (SpawnMax - SpawnMin);
                double x = px + Math.Cos(a) * d, y = py + Math.Sin(a) * d;
                if (canStand(x, y) && LitBy(ls, x, y, EdgeMargin) == null) return (x, y);
            }
            return null;
        }
    }

    public static class Camp
    {
        public const int FireStartMin = 120, FirePerWood = 120;   // a new campfire burns 2 h; each wood adds 2 h

        public static List<Campfire> Fires(GameState s) => s.expedition?.fires ?? new List<Campfire>();
        public static int FireLeft(GameState s, Campfire f) => Math.Max(0, f.until - Night.AbsMinute(s));
        public static List<Campfire> Burning(GameState s) => Fires(s).Where(f => FireLeft(s, f) > 0).ToList();

        // absolute minute of the next 6:00
        public static int NextDawn(GameState s) => s.clock < GameTime.DayStart ? s.day * 1440 + GameTime.DayStart : s.day * 1440 + 30 * 60;

        public class FireResult : Res { public Campfire fire; public int left, wood; }

        public static FireResult PlaceCampfire(GameState s, int tx, int ty)
        {
            if (s.player.area != "expedition" || s.expedition == null) return new FireResult { reason = "home" };
            if (Fires(s).Any(f => f.tx == tx && f.ty == ty)) return new FireResult { reason = "occupied" };
            if (!Inventory.RemoveItem(s.inventory, "item_campfire", 1)) return new FireResult { reason = "none" };
            var fire = new Campfire { id = $"f{Fires(s).Count}", tx = tx, ty = ty, until = Night.AbsMinute(s) + FireStartMin };
            s.expedition.fires = new List<Campfire>(Fires(s)) { fire };
            return new FireResult { ok = true, fire = fire };
        }

        // +2 hours (a burnt-out fire is relit from now)
        public static FireResult AddWood(GameState s, string fireId)
        {
            var f = Fires(s).Find(x => x.id == fireId);
            if (f == null) return new FireResult { reason = "unknown" };
            if (!Inventory.RemoveItem(s.inventory, "item_wood", 1)) return new FireResult { reason = "no-wood" };
            f.until = Math.Max(f.until, Night.AbsMinute(s)) + FirePerWood;
            return new FireResult { ok = true, left = FireLeft(s, f) };
        }

        public static int WoodToDawn(GameState s, Campfire f) => Math.Max(0, (int)Math.Ceiling((NextDawn(s) - Math.Max(f.until, Night.AbsMinute(s))) / (double)FirePerWood));

        // needs a tent and a fire that lasts until 6:00
        public static FireResult CanCampSleep(GameState s, string fireId)
        {
            var f = Fires(s).Find(x => x.id == fireId);
            if (f == null) return new FireResult { reason = "unknown" };
            if (Inventory.CountOf(s.inventory, "item_tent") < 1) return new FireResult { reason = "no-tent" };
            int wood = WoodToDawn(s, f);
            if (wood > 0) return new FireResult { reason = "fuel", wood = wood };
            return new FireResult { ok = true };
        }

        // ---------- chests ----------
        static readonly (string id, int n)[] Extras = { ("item_crystal", 1), ("item_wood", 4), ("item_stone", 4), ("item_berry", 4), ("item_net_grass", 1) };
        static readonly string[] Books = { "item_book_bubble", "item_book_ember", "item_book_leafy", "item_book_twinkle", "item_book_shadow", "item_book_heal", "item_book_shell", "item_book_puff" };

        public class Loot { public Dictionary<string, int> items; public int clover; }

        // cloth 2–3 (the tent needs 4), two random extras, 20 clover; the thorn chest: cloth 3, crystal 2, 40 clover
        public static Loot ChestLoot(int islandSeed, string chestId, bool bonus = false)
        {
            var r = new Mulberry32((long)islandSeed * 53 + long.Parse(chestId.Substring(1)) * 977 + 11);
            var items = bonus ? new Dictionary<string, int> { { "item_cloth", 3 }, { "item_crystal", 2 } } : new Dictionary<string, int> { { "item_cloth", 2 + (int)Math.Floor(r.Next() * 2) } };
            var pool = Extras.ToList();
            for (int i = 0; i < 2; i++)
            {
                int k = (int)Math.Floor(r.Next() * pool.Count);
                var (id, n) = pool[k]; pool.RemoveAt(k);
                items[id] = (items.TryGetValue(id, out var v) ? v : 0) + n;
            }
            // growth drops: thorn chest always 1 evolution stone; normal chests 15% stone, 20% skill book
            if (bonus || r.Next() < 0.15) { var st = Crafting.EvoStones[(int)Math.Floor(r.Next() * Crafting.EvoStones.Length)]; items[st] = (items.TryGetValue(st, out var v) ? v : 0) + 1; }
            if (!bonus && r.Next() < 0.2) { var bk = Books[(int)Math.Floor(r.Next() * Books.Length)]; items[bk] = (items.TryGetValue(bk, out var v) ? v : 0) + 1; }
            return new Loot { items = items, clover = bonus ? 40 : 20 };
        }

        public class ChestResult : Res { public Loot loot; }
        public static ChestResult OpenChest(GameState s, string chestId, bool bonus = false)
        {
            var ch = s.expedition?.changes;
            if (ch == null || ch.chests.Contains(chestId)) return new ChestResult { reason = "opened" };
            var loot = ChestLoot(s.expedition.seed, chestId, bonus);
            if (!Crafting.Fits(s, loot.items)) return new ChestResult { reason = "full" };
            foreach (var kv in loot.items) Inventory.AddItem(s.inventory, kv.Key, kv.Value, Crafting.BagSlots(s));
            s.clover += loot.clover;
            ch.chests.Add(chestId);
            Guide.Bump(s, "chests");
            return new ChestResult { ok = true, loot = loot };
        }
    }

    public static class Travel
    {
        public const int TravelMin = 60, WakeClock = 8 * 60, ProtectDays = 3, BridgeMin = 10;

        // flight time: survival ticks still happen, the airship is safe
        public static int PassTime(GameState s, int minutes)
        {
            int start = s.clock;
            s.clock += minutes;
            int ticks = s.clock / GameTime.TickMin - start / GameTime.TickMin;
            for (int i = 0; i < ticks; i++) Survival.Tick(s.player, "home");
            return ticks;
        }

        // deterministic from the save so tests can predict it
        public static int NewIslandSeed(GameState s)
        {
            int trips = s.flags.trips ?? 0;
            return (int)Math.Floor(new Mulberry32((long)s.seed * 131 + (long)s.day * 977 + (long)trips * 7919).Next() * 2147483648.0);
        }

        public static int LostBagCount(GameState s) => s.expedition?.lostBag?.items?.Sum(st => st.count) ?? 0;

        static void Arrive(GameState s, string area, string at = null) { s.player.area = area; s.player.x = null; s.player.y = null; if (at != null) s.flags.arriveAt = at; }

        public class DepartResult : Res { public int seed; }
        // mode: new | last. Going to a new island abandons the last one together with its lost bag.
        public static DepartResult Depart(GameState s, string mode)
        {
            if (s.player.area != "home") return new DepartResult { reason = "not-home" };
            if (mode == "last" && s.expedition == null) return new DepartResult { reason = "no-last" };
            if (mode == "new") s.expedition = new ExpeditionState { seed = NewIslandSeed(s), biome = "mistwood", changes = new IslandChanges(), lostBag = null };
            s.flags.trips = (s.flags.trips ?? 0) + 1;
            Guide.Bump(s, "trips");
            PassTime(s, TravelMin);
            Arrive(s, "expedition");
            return new DepartResult { ok = true, seed = s.expedition.seed };
        }

        public static Res GoTown(GameState s) { if (s.player.area != "home") return Res.No("not-home"); PassTime(s, BridgeMin); Arrive(s, "town"); return Res.Ok(); }
        public static Res LeaveTown(GameState s) { if (s.player.area != "town") return Res.No("not-town"); PassTime(s, BridgeMin); Arrive(s, "home", "bridge"); return Res.Ok(); }
        public static Res EnterHouse(GameState s) { if (s.player.area != "home") return Res.No("not-home"); Arrive(s, "house"); return Res.Ok(); }
        public static Res LeaveHouse(GameState s) { if (s.player.area != "house") return Res.No("not-house"); Arrive(s, "home", "house"); return Res.Ok(); }

        public static Res ReturnHome(GameState s)
        {
            if (s.player.area != "expedition") return Res.No("not-away");
            PassTime(s, TravelMin);
            Arrive(s, "home", "dock");
            Guide.Bump(s, "returns");
            PetCare.BondFromTrip(s);
            return Res.Ok();
        }

        public class FaintResult { public SettlementReport report; public List<ItemStack> dropped, kept; public bool replaced, isProtected; }

        // ONE state change: tools stay, everything else goes into the lost bag at (x, y) (replacing an older one);
        // wake up at home next morning 8:00 with health 50 and fullness 50; pets rest too. Days 1–3: nothing drops.
        public static FaintResult Faint(GameState s, double x, double y)
        {
            var keep = new List<ItemStack>(); var drop = new List<ItemStack>();
            bool protectedDay = s.day <= ProtectDays;
            foreach (var st in s.inventory) ((GameData.Item(st.id)?.tool ?? false) || protectedDay ? keep : drop).Add(st.Clone());
            bool replaced = LostBagCount(s) > 0;
            s.inventory = keep;
            if (s.expedition != null) s.expedition.lostBag = drop.Count > 0 ? new LostBag { x = JsRound(x), y = JsRound(y), items = drop } : s.expedition.lostBag;
            var report = Settlement.Run(s, false);
            s.clock = WakeClock;
            s.player.hp = 50;
            s.player.hunger = 50;
            foreach (var p in s.pets) p.hp = null;
            Arrive(s, "home", "bed");
            return new FaintResult { report = report, dropped = drop, kept = keep, replaced = replaced && drop.Count > 0, isProtected = protectedDay };
        }

        public static double JsRound(double v) => Math.Floor(v + 0.5);   // Math.round in JS rounds .5 up

        // everything that fits goes back into the bag; the rest stays in the lost bag
        public static (List<ItemStack> took, List<ItemStack> left) PickUpLostBag(GameState s)
        {
            var bag = s.expedition?.lostBag;
            var took = new List<ItemStack>(); var left = new List<ItemStack>();
            if (bag == null) return (took, left);
            foreach (var st in bag.items) (Inventory.AddItem(s.inventory, st.id, st.count, Crafting.BagSlots(s)) ? took : left).Add(st);
            s.expedition.lostBag = left.Count > 0 ? new LostBag { x = bag.x, y = bag.y, items = left } : null;
            return (took, left);
        }
    }
}
