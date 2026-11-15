// Inventory, survival and game time, ported 1:1 from the web version
// (systems/inventory.js, systems/survival.js, systems/time.js GameClock; docs/06 第 0–1 节).
using System;
using System.Collections.Generic;
using System.Linq;

namespace Lingmu.Rules
{
    public static class Inventory
    {
        public const int BagSlots = 20;   // docs/02 第 9 节: 20 slots (+4 with 冰蓝小狼, 28 with the big bag)

        public static int CountOf(List<ItemStack> inv, string id) => inv.Where(s => s.id == id).Sum(s => s.count);

        // adds n items (one stack per item id); false when a new stack would not fit
        public static bool AddItem(List<ItemStack> inv, string id, int n = 1, int slots = BagSlots)
        {
            if (n <= 0) return true;
            var s = inv.FirstOrDefault(x => x.id == id);
            if (s != null) { s.count += n; return true; }
            if (inv.Count >= slots) return false;
            inv.Add(new ItemStack(id, n));
            return true;
        }

        // removes n items; false (and nothing changed) when there are not enough
        public static bool RemoveItem(List<ItemStack> inv, string id, int n = 1)
        {
            if (CountOf(inv, id) < n) return false;
            int left = n;
            for (int i = 0; i < inv.Count && left > 0; i++)
            {
                if (inv[i].id != id) continue;
                int take = Math.Min(left, inv[i].count);
                inv[i].count -= take; left -= take;
                if (inv[i].count <= 0) { inv.RemoveAt(i); i--; }
            }
            return true;
        }
    }

    public static class Survival
    {
        public const int HungerEveryMin = 15, TickMinutes = 10, StarveDamage = 3, HungryAt = 20;

        public static bool IsSafeArea(string area) => area == "home" || area == "town" || area == "house";

        // One 10-minute tick. Events: hungry, empty, starving, floor (stopped at 1 in a safe area), faint.
        public static List<string> Tick(PlayerState p, string area)
        {
            var ev = new List<string>();
            if (p.hunger > 0)
            {
                p.hungerAcc = (p.hungerAcc ?? 0) + TickMinutes;
                if (p.hungerAcc < HungerEveryMin) return ev;
                p.hungerAcc -= HungerEveryMin;
                p.hunger = Math.Max(0, p.hunger - 1);
                if (p.hunger == HungryAt) ev.Add("hungry");
                if (p.hunger == 0) ev.Add("empty");
                return ev;
            }
            ev.Add("starving");
            return ApplyDamage(p, StarveDamage, area, ev);
        }

        // fog monsters and hunger both go through here
        public static List<string> ApplyDamage(PlayerState p, int n, string area, List<string> ev = null)
        {
            ev ??= new List<string>();
            if (p.hp <= 0) return ev;
            bool safe = IsSafeArea(area);
            int before = p.hp;
            p.hp = Math.Max(safe ? 1 : 0, p.hp - n);
            if (safe && p.hp == 1 && before > 1) ev.Add("floor");
            if (!safe && p.hp == 0) ev.Add("faint");
            return ev;
        }

        public struct EatResult { public bool ok; public string reason; public int hunger, hp; }

        public static EatResult Eat(GameState s, string itemId)
        {
            var def = GameData.Item(itemId);
            var p = s.player;
            if (def?.food == null) return new EatResult { reason = "not-food" };
            if (Inventory.CountOf(s.inventory, itemId) < 1) return new EatResult { reason = "none" };
            if (p.hunger >= p.hungerMax && (def.heal == null || p.hp >= p.hpMax)) return new EatResult { reason = "full" };
            Inventory.RemoveItem(s.inventory, itemId, 1);
            int h0 = p.hunger, hp0 = p.hp;
            p.hunger = Math.Min(p.hungerMax, p.hunger + def.food.Value);
            if (def.heal != null) p.hp = Math.Min(p.hpMax, p.hp + def.heal.Value);
            return new EatResult { ok = true, hunger = p.hunger - h0, hp = p.hp - hp0 };
        }
    }

    public struct ClockEvent { public string type, from, to; public int clock; }

    // game time (systems/time.js): clock = minutes since 0:00 of the current day; runs past 24:00 on expeditions
    public static class GameTime
    {
        public const int DayStart = 6 * 60, DuskStart = 18 * 60, NightStart = 20 * 60, Bedtime = 24 * 60, DawnLimit = 30 * 60, TickMin = 10;
        public const double RealMsPerDay = 12 * 60 * 1000;
        public const double MsPerGameMin = RealMsPerDay / (Bedtime - DayStart);   // ≈ 666.7 ms

        public static string PhaseAt(int clock)
        {
            int m = ((clock % 1440) + 1440) % 1440;
            if (m >= DayStart && m < DuskStart) return "day";
            if (m >= DuskStart && m < NightStart) return "dusk";
            return "night";
        }

        public static string Format(double clock)
        {
            int m = (int)Math.Floor(clock);
            return $"{(m / 60) % 24:00}:{m % 60:00}";
        }
    }

    public class GameClock
    {
        readonly double msPerMin;
        double carry;
        readonly HashSet<string> pauses = new HashSet<string>();
        bool stopped;                                   // after bedtime / dawn until the settlement restarts the day

        public GameClock(double msPerMin = GameTime.MsPerGameMin) { this.msPerMin = msPerMin; }
        public bool Paused => pauses.Count > 0 || stopped;
        public void Pause(string reason) => pauses.Add(reason);
        public void Resume(string reason) => pauses.Remove(reason);
        public void Restart() { stopped = false; carry = 0; }

        // events crossed, in order: tick (every 10 game minutes), phase, bedtime (home), dawn (expedition)
        public List<ClockEvent> Advance(GameState s, double realMs)
        {
            var events = new List<ClockEvent>();
            if (Paused || realMs <= 0) return events;
            carry += realMs;
            int mins = (int)Math.Floor(carry / msPerMin);
            carry -= mins * msPerMin;
            int limit = s.player?.area == "expedition" ? GameTime.DawnLimit : GameTime.Bedtime;
            while (mins-- > 0)
            {
                int before = s.clock;
                s.clock = before + 1;
                if (s.clock % GameTime.TickMin == 0) events.Add(new ClockEvent { type = "tick", clock = s.clock });
                string p0 = GameTime.PhaseAt(before), p1 = GameTime.PhaseAt(s.clock);
                if (p0 != p1) events.Add(new ClockEvent { type = "phase", from = p0, to = p1, clock = s.clock });
                if (s.clock >= limit)
                {
                    stopped = true; carry = 0;
                    events.Add(new ClockEvent { type = limit == GameTime.Bedtime ? "bedtime" : "dawn" });
                    break;
                }
            }
            return events;
        }
    }

    public static class SaveRules
    {
        public const int SaveVersion = 5, PartyMax = 3, StarterLevel = 4;

        // starter = one of the starters (title page) → a real new game with just that pet; none = demo start with all six
        public static GameState NewGameState(long now = 0, int seed = 20261108, string starter = null)
        {
            if (starter != null && !GameData.Starters.Contains(starter)) throw new ArgumentException("unknown starter " + starter);
            var pets = starter != null
                ? new List<PetInstance> { PetMath.CreateStarter(starter, StarterLevel, "pet-" + starter) }
                : GameData.Pets.Select(p => PetMath.CreateStarter(p.id, 1, "pet-" + p.id)).ToList();
            if (now == 0) now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            return new GameState
            {
                version = SaveVersion, createdAt = now, savedAt = now, seed = seed, day = 1, clock = 6 * 60, clover = 120,
                player = new PlayerState(),
                inventory = new List<ItemStack>
                {
                    new ItemStack("item_net_grass", 3), new ItemStack("item_net_vine", 1), new ItemStack("item_campfire", 2),
                    new ItemStack("item_berry", 5), new ItemStack("item_carrot", 2), new ItemStack("item_fish_roast", 1),
                    new ItemStack("item_hoe", 1), new ItemStack("item_can", 1), new ItemStack("item_seed_carrot", 6),
                },
                farm = Newtonsoft.Json.Linq.JObject.Parse("{\"plots\":{},\"shipping\":[]}"),
                town = Newtonsoft.Json.Linq.JObject.Parse("{\"friend\":{},\"talkDay\":{},\"giftDay\":{},\"quests\":{}}"),
                recipes = new List<string>(),
                world = Newtonsoft.Json.Linq.JObject.Parse("{\"expanded\":false,\"bridge\":false}"),
                house = Newtonsoft.Json.Linq.JObject.Parse("{\"items\":[]}"),
                pets = pets,
                party = starter != null ? new List<string> { "pet-" + starter } : new List<string> { "pet-pup", "pet-fox", "pet-acorn" },
                expedition = null,
                flags = starter != null ? new Flags { starter = starter } : new Flags(),
            };
        }
    }
}
