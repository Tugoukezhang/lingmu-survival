// Gathering, field crafting, pet explore skills, the home storage and the party
// (systems/crafting.js, systems/explore.js, systems/party.js; docs/06 第 3 节, docs/02 第 6/9 节).
using System;
using System.Collections.Generic;
using System.Linq;

namespace Lingmu.Rules
{
    public static class Explore
    {
        public static readonly Dictionary<string, string> SkillNames = new Dictionary<string, string> { { "light", "照明" }, { "carry", "驮运" }, { "clear", "开路" }, { "wade", "涉水" }, { "treasure", "寻宝" } };

        static IEnumerable<PetInstance> PartyPets(GameState s) => s.party.Select(s.Pet).Where(p => p != null);

        public static (bool has, bool boosted) PartySkill(GameState s, string skill)
        {
            var pets = PartyPets(s).Where(p => GameData.Species(p.species).explore == skill).ToList();
            return (pets.Count > 0, pets.Any(p => p.affection >= 100));
        }

        public static bool CanWade(GameState s) => PartySkill(s, "wade").has;
        public static bool CanClear(GameState s) => PartySkill(s, "clear").has;
        // 0 = nothing, 1 = chests, 2 = chests + rare spots
        public static int TreasureSense(GameState s) { var k = PartySkill(s, "treasure"); return k.has ? (k.boosted ? 2 : 1) : 0; }
        public static int CarryBonus(GameState s) { var k = PartySkill(s, "carry"); return k.has ? (k.boosted ? 6 : 4) : 0; }
        public static double GlowTiles(GameState s) { var k = PartySkill(s, "light"); return k.has ? (k.boosted ? 2.5 : 1.5) : 0; }

        public static Res ClearThorn(GameState s, string thornId)
        {
            var ch = s.expedition?.changes;
            if (ch == null) return Res.No("no-island");
            if (!CanClear(s)) return Res.No("need-clear");
            ch.thorns ??= new List<string>();
            if (ch.thorns.Contains(thornId)) return Res.No("gone");
            ch.thorns.Add(thornId);
            return Res.Ok();
        }

        // the bag got smaller (驮运 pet left): extra stacks go to the home storage, never lost
        public static List<ItemStack> SettleOverflow(GameState s, int slots)
        {
            s.storage ??= new List<ItemStack>();
            var moved = new List<ItemStack>();
            while (s.inventory.Count > slots)
            {
                var st = s.inventory[s.inventory.Count - 1]; s.inventory.RemoveAt(s.inventory.Count - 1);
                Inventory.AddItem(s.storage, st.id, st.count, int.MaxValue);
                moved.Insert(0, st);
            }
            return moved;
        }

        public static int DepositAll(GameState s, Func<string, bool> keep = null)
        {
            s.storage ??= new List<ItemStack>();
            var stay = new List<ItemStack>();
            foreach (var st in s.inventory) { if (keep != null && keep(st.id)) stay.Add(st); else Inventory.AddItem(s.storage, st.id, st.count, int.MaxValue); }
            int n = s.inventory.Count - stay.Count;
            s.inventory = stay;
            return n;
        }

        public static (int took, int left) WithdrawAll(GameState s, int slots)
        {
            s.storage ??= new List<ItemStack>();
            var left = new List<ItemStack>();
            int n = 0;
            foreach (var st in s.storage) { if (Inventory.AddItem(s.inventory, st.id, st.count, slots)) n++; else left.Add(st); }
            s.storage = left;
            return (n, left.Count);
        }
    }

    public static class Crafting
    {
        // 20, +4 with a 驮运 pet in the party (+6 at affection 100), +8 with the big bag
        public static int BagSlots(GameState s) => Inventory.BagSlots + Explore.CarryBonus(s) + (Inventory.CountOf(s.inventory, "item_bigbag") > 0 ? 8 : 0);

        // would all these stacks fit? (existing stacks always fit; new ones need a free slot)
        public static bool Fits(GameState s, IDictionary<string, int> gains)
        {
            int fresh = gains.Keys.Count(id => Inventory.CountOf(s.inventory, id) == 0);
            return s.inventory.Count + fresh <= BagSlots(s);
        }

        public class GatherDef { public string name, tool; public Dictionary<string, int> hand, withTool; }
        public static readonly Dictionary<string, GatherDef> Gather = new Dictionary<string, GatherDef>
        {
            { "tree", new GatherDef { name = "树", hand = new Dictionary<string, int> { { "item_wood", 1 } }, tool = "item_axe", withTool = new Dictionary<string, int> { { "item_wood", 3 } } } },
            { "rock", new GatherDef { name = "石头", hand = new Dictionary<string, int> { { "item_stone", 1 } }, tool = "item_pickaxe", withTool = new Dictionary<string, int> { { "item_stone", 3 } } } },
            { "bush", new GatherDef { name = "浆果丛", hand = new Dictionary<string, int> { { "item_berry", 2 } } } },
            { "grass", new GatherDef { name = "草丛", hand = new Dictionary<string, int> { { "item_grass", 2 } } } },
            { "crystal", new GatherDef { name = "雾晶", hand = null, tool = "item_pickaxe", withTool = new Dictionary<string, int> { { "item_crystal", 1 } } } },
        };

        public class GatherResult : Res { public Dictionary<string, int> gains; public string usedTool, tool; }

        // what gathering this resource would give right now (need != null: a tool is required)
        public static (Dictionary<string, int> gains, string usedTool, string need) Preview(GameState s, string type)
        {
            var g = Gather[type];
            bool hasTool = g.tool != null && Inventory.CountOf(s.inventory, g.tool) > 0;
            if (hasTool) return (g.withTool, g.tool, null);
            if (g.hand == null) return (null, null, g.tool);
            return (g.hand, null, null);
        }

        public static readonly string[] EvoStones = { "item_evo_forest", "item_evo_water", "item_evo_fire", "item_evo_light", "item_evo_dark" };

        public static GatherResult GatherAt(GameState s, string resourceId, string type)
        {
            var changes = s.expedition?.changes;
            if (changes == null || changes.collected.Contains(resourceId)) return new GatherResult { reason = "gone" };
            var pv = Preview(s, type);
            if (pv.need != null) return new GatherResult { reason = "need-tool", tool = pv.need };
            var gains = new Dictionary<string, int>(pv.gains);
            // crystals mined with the pickaxe: 10% evolution stone (docs/07 第 3 节)
            if (type == "crystal" && pv.usedTool != null)
            {
                long h = unchecked((uint)((long)s.expedition.seed * 31 + long.Parse(resourceId.Substring(1)) * 7919)) % 1000;
                if (h < 100) gains[EvoStones[h % 5]] = 1;
            }
            if (!Fits(s, gains)) return new GatherResult { reason = "full" };
            foreach (var kv in gains) Inventory.AddItem(s.inventory, kv.Key, kv.Value, int.MaxValue);
            changes.collected.Add(resourceId);
            Guide.Bump(s, "gather");
            return new GatherResult { ok = true, gains = gains, usedTool = pv.usedTool };
        }

        public class Missing { public string id; public int need, have; }
        public class CraftResult : Res { public List<Missing> missing; }

        public static CraftResult CanCraft(GameState s, string recipeId)
        {
            var r = GameData.Recipe(recipeId);
            var missing = r.cost.Select(kv => new Missing { id = kv.Key, need = kv.Value, have = Inventory.CountOf(s.inventory, kv.Key) }).Where(m => m.have < m.need).ToList();
            return new CraftResult { ok = missing.Count == 0, missing = missing };
        }

        // workbench recipes only at home; recipes taught by residents need unlocking first
        public static bool StationOk(GameState s, string recipeId) => GameData.Recipe(recipeId).station != "workbench" || s.player.area == "home";
        public static bool Unlocked(GameState s, string recipeId) { var u = GameData.Recipe(recipeId).unlock; return u == null || (s.recipes ?? new List<string>()).Contains(u); }

        // all-or-nothing: materials are only taken when the result fits
        public static CraftResult Craft(GameState s, string recipeId)
        {
            var r = GameData.Recipe(recipeId);
            if (!Unlocked(s, recipeId)) return new CraftResult { reason = "locked" };
            if (!StationOk(s, recipeId)) return new CraftResult { reason = "station" };
            var check = CanCraft(s, recipeId);
            if (!check.ok) return new CraftResult { reason = "missing", missing = check.missing };
            var after = s.inventory.Where(st => !(r.cost.TryGetValue(st.id, out var c) && st.count == c)).ToList();
            bool needsSlot = !after.Any(st => st.id == r.@out);
            if (needsSlot && after.Count + 1 > BagSlots(s)) return new CraftResult { reason = "full" };
            foreach (var kv in r.cost) Inventory.RemoveItem(s.inventory, kv.Key, kv.Value);
            Inventory.AddItem(s.inventory, r.@out, r.n, int.MaxValue);
            Guide.Bump(s, "craft");
            return new CraftResult { ok = true };
        }
    }

    // party management (party.js): max 3; on an expedition only the order can change
    public static class Party
    {
        public static bool InParty(GameState s, string uid) => s.party.Contains(uid);
        static bool Away(GameState s) => s.player.area != "home";

        public static Res Join(GameState s, string uid)
        {
            if (s.Pet(uid) == null) return Res.No("unknown");
            if (InParty(s, uid)) return Res.No("in-party");
            if (Away(s)) return Res.No("away");
            if (s.party.Count >= SaveRules.PartyMax) return Res.No("full");
            s.party.Add(uid);
            s.Pet(uid).job = false;   // party members don't work at home
            return Res.Ok();
        }

        public class LeaveResult : Res { public List<ItemStack> moved; }
        public static LeaveResult Leave(GameState s, string uid)
        {
            if (!InParty(s, uid)) return new LeaveResult { reason = "not-in-party" };
            if (Away(s)) return new LeaveResult { reason = "away" };
            if (s.party.Count <= 1) return new LeaveResult { reason = "last" };
            s.party = s.party.Where(u => u != uid).ToList();
            return new LeaveResult { ok = true, moved = Explore.SettleOverflow(s, Crafting.BagSlots(s)) };
        }

        public static Res SetLead(GameState s, string uid)
        {
            if (!InParty(s, uid)) return Res.No("not-in-party");
            s.party = new[] { uid }.Concat(s.party.Where(u => u != uid)).ToList();
            return Res.Ok();
        }
    }
}
