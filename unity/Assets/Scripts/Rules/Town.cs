// 风铃小镇 (residents, gifts, quests, store), island progress (expansion, bridge), home decoration
// (systems/town.js, progress.js, house.js; T13, T14, T15, docs/11 ②).
using System;
using System.Collections.Generic;
using System.Linq;
using Lingmu.Core;

namespace Lingmu.Rules
{
    public static class Town
    {
        public static TownState Of(GameState s) => s.town ??= new TownState();
        static int Get(Dictionary<string, int> d, string k) => d.TryGetValue(k, out var v) ? v : 0;
        public static int FriendOf(GameState s, string npc) => Get(Of(s).friend, npc);
        static int AddFriend(GameState s, string npc, int n) { var t = Of(s); t.friend[npc] = Math.Max(0, Math.Min(100, FriendOf(s, npc) + n)); return t.friend[npc]; }
        public static int Hearts(int f) => f / 20;   // 0–5 hearts
        public static int WeekOf(int day) => (day - 1) / GameData.WeekDays + 1;

        public static int GiftsLeft(GameState s, string npc)
        {
            var gw = Of(s).giftWeek;
            return gw != null && gw.TryGetValue(npc, out var g) && g.week == WeekOf(s.day) ? Math.Max(0, GameData.GiftsPerWeek - g.n) : GameData.GiftsPerWeek;
        }

        public class HeartPresent { public int hearts; public Dictionary<string, int> items; public string line; public bool full; }

        // the first heart present (3 / 5 hearts) reached and not yet received; full = no room, try later
        public static HeartPresent ClaimHeartGift(GameState s, string npc)
        {
            var t = Of(s);
            t.heartGifts ??= new Dictionary<string, List<int>>();
            var got = t.heartGifts.TryGetValue(npc, out var g0) ? g0 : new List<int>();
            int h = Hearts(FriendOf(s, npc));
            var gifts = GameData.HeartGiftsOf(npc);
            var steps = gifts.Keys.OrderBy(k => k).Where(k => k <= h && !got.Contains(k)).ToList();
            if (steps.Count == 0) return null;
            int step = steps[0];
            var g = gifts[step];
            int slots = Crafting.BagSlots(s);
            var trial = s.inventory.Select(st => st.Clone()).ToList();
            if (!g.items.All(kv => Inventory.AddItem(trial, kv.Key, kv.Value, slots))) return new HeartPresent { full = true, hearts = step };
            foreach (var kv in g.items) Inventory.AddItem(s.inventory, kv.Key, kv.Value, slots);
            t.heartGifts[npc] = new List<int>(got) { step };
            return new HeartPresent { hearts = step, items = g.items, line = g.line };
        }

        public class TalkResult { public string line; public int gain; public HeartPresent present; }

        // one line of dialogue; the first chat of the day gives +1 friendship
        public static TalkResult Talk(GameState s, string npc)
        {
            var n = GameData.Npcs[npc]; var t = Of(s); int f = FriendOf(s, npc);
            var tier = f >= 60 ? "high" : f >= 30 ? "mid" : "low";
            var rng = new Mulberry32((long)s.day * 131 + npc.Length * 7);
            var lines = n.lines[tier];
            var line = lines[(int)Math.Floor(rng.Next() * lines.Count)];
            int gain = 0;
            if (!(t.talkDay.TryGetValue(npc, out var d) && d == s.day)) { t.talkDay[npc] = s.day; gain = GameData.TalkGain; AddFriend(s, npc, gain); Guide.Bump(s, "talk"); }
            var present = ClaimHeartGift(s, npc);
            return new TalkResult { line = present != null && !present.full ? present.line : line, gain = gain, present = present };
        }

        public static string GiftTaste(string npc, string itemId)
        {
            var n = GameData.Npcs[npc];
            return n.loves.Contains(itemId) ? "love" : n.likes.Contains(itemId) ? "like" : n.dislikes.Contains(itemId) ? "dislike" : "neutral";
        }

        public class GiftResult : Res { public string taste; public int gain; }

        // once per day and twice per week per resident; tools can't be given
        public static GiftResult Gift(GameState s, string npc, string itemId)
        {
            var t = Of(s);
            if (t.giftDay.TryGetValue(npc, out var gd) && gd == s.day) return new GiftResult { reason = "gifted" };
            if (GiftsLeft(s, npc) <= 0) return new GiftResult { reason = "week" };
            var def = GameData.Item(itemId);
            if (def == null || def.tool) return new GiftResult { reason = "not-giftable" };
            if (!Inventory.RemoveItem(s.inventory, itemId, 1)) return new GiftResult { reason = "none" };
            t.giftDay[npc] = s.day;
            int wk = WeekOf(s.day);
            t.giftWeek ??= new Dictionary<string, GiftWeek>();
            t.giftWeek[npc] = t.giftWeek.TryGetValue(npc, out var g) && g.week == wk ? new GiftWeek { week = wk, n = g.n + 1 } : new GiftWeek { week = wk, n = 1 };
            var taste = GiftTaste(npc, itemId);
            int before = FriendOf(s, npc);
            AddFriend(s, npc, GameData.GiftGain(taste));
            Guide.Bump(s, "gift");
            return new GiftResult { ok = true, taste = taste, gain = FriendOf(s, npc) - before };
        }

        // ---------- quests ----------
        public static string QuestState(GameState s, string id) => Of(s).quests.TryGetValue(id, out var v) ? v : null;
        static bool AfterDone(GameState s, QuestDef q) => q.after == null || QuestState(s, q.after) == "done";

        public static List<QuestDef> Offers(GameState s, string npc) => GameData.Quests.Where(q => q.npc == npc && QuestState(s, q.id) == null && AfterDone(s, q) && Hearts(FriendOf(s, npc)) >= (q.hearts ?? 0)).ToList();
        public static QuestDef HeartLocked(GameState s, string npc) => GameData.Quests.FirstOrDefault(q => q.npc == npc && QuestState(s, q.id) == null && AfterDone(s, q) && Hearts(FriendOf(s, npc)) < (q.hearts ?? 0));
        public static List<QuestDef> ActiveOf(GameState s, string npc) => GameData.Quests.Where(q => q.npc == npc && QuestState(s, q.id) == "active").ToList();

        public static Res Accept(GameState s, string id)
        {
            var q = GameData.Quest(id);
            if (q == null || QuestState(s, id) != null) return Res.No("taken");
            if (!AfterDone(s, q)) return Res.No("locked");
            if (Hearts(FriendOf(s, q.npc)) < (q.hearts ?? 0)) return Res.No("hearts");
            Of(s).quests[id] = "active";
            return Res.Ok();
        }

        public class MissingNeed { public string id, party; public int need, have; }

        // what is still missing to hand the quest in
        public static List<MissingNeed> Missing(GameState s, string id)
        {
            var q = GameData.Quest(id); var output = new List<MissingNeed>();
            foreach (var kv in q.need)
            {
                if (kv.Key == "party")
                {
                    var sp = (string)kv.Value;
                    if (!s.party.Any(u => s.Pet(u)?.species == sp)) output.Add(new MissingNeed { party = sp });
                    continue;
                }
                int n = (int)kv.Value, have = Inventory.CountOf(s.inventory, kv.Key);
                if (have < n) output.Add(new MissingNeed { id = kv.Key, need = n, have = have });
            }
            return output;
        }

        public class CompleteResult : Res { public QuestReward reward; }

        // takes the items, gives the reward — exactly once
        public static CompleteResult Complete(GameState s, string id)
        {
            var q = GameData.Quest(id);
            var st = QuestState(s, id);
            if (st != "active") return new CompleteResult { reason = st == "done" ? "done" : "not-active" };
            if (Missing(s, id).Count > 0) return new CompleteResult { reason = "missing" };
            var items = (q.reward.items ?? new Dictionary<string, int>()).ToList();
            int fresh = items.Count(kv => Inventory.CountOf(s.inventory, kv.Key) == 0);
            int freed = q.need.Count(kv => kv.Key != "party" && Inventory.CountOf(s.inventory, kv.Key) == (int)kv.Value);
            if (s.inventory.Count - freed + fresh > Crafting.BagSlots(s)) return new CompleteResult { reason = "full" };
            foreach (var kv in q.need) if (kv.Key != "party") Inventory.RemoveItem(s.inventory, kv.Key, (int)kv.Value);
            foreach (var kv in items) Inventory.AddItem(s.inventory, kv.Key, kv.Value, int.MaxValue);
            if (q.reward.clover != null) s.clover += q.reward.clover.Value;
            s.recipes ??= new List<string>();
            if (q.reward.recipe != null && !s.recipes.Contains(q.reward.recipe)) s.recipes = new List<string>(s.recipes) { q.reward.recipe };
            if (q.reward.friend != null) AddFriend(s, q.npc, q.reward.friend.Value);
            Of(s).quests[id] = "done";
            Guide.Bump(s, "quests");
            return new CompleteResult { ok = true, reward = q.reward };
        }

        // ---------- the general store: fixed stock + two skill books of the day ----------
        public static List<ShopEntry> Stock(GameState s)
        {
            var rng = new Mulberry32((long)s.seed * 17 + (long)s.day * 389);
            var books = GameData.ShopBooks.ToList();
            int i1 = (int)Math.Floor(rng.Next() * books.Count); var b1 = books[i1]; books.RemoveAt(i1);
            int i2 = (int)Math.Floor(rng.Next() * books.Count); var b2 = books[i2]; books.RemoveAt(i2);
            return GameData.Shop.Concat(new[] { b1, b2 }.Select(id => new ShopEntry { id = id, price = GameData.BookPrice })).ToList();
        }

        public static Farm.BuyResult Buy(GameState s, string itemId, int n = 1)
        {
            var entry = Stock(s).Find(x => x.id == itemId);
            if (entry == null) return new Farm.BuyResult { reason = "not-sold" };
            int cost = entry.price * n;
            if (s.clover < cost) return new Farm.BuyResult { reason = "clover" };
            if (!Inventory.AddItem(s.inventory, itemId, n, Crafting.BagSlots(s))) return new Farm.BuyResult { reason = "full" };
            s.clover -= cost;
            return new Farm.BuyResult { ok = true, cost = cost };
        }
    }

    public static class Progress
    {
        public class Cost { public int clover; public Dictionary<string, int> items; }
        // 【建议】 costs
        public static readonly Cost ExpandCost = new Cost { clover = 400, items = new Dictionary<string, int> { { "item_wood", 20 }, { "item_stone", 20 } } };
        public static readonly Cost BridgeCost = new Cost { clover = 200, items = new Dictionary<string, int> { { "item_wood", 50 }, { "item_stone", 30 }, { "item_cloth", 5 } } };

        public static WorldState Of(GameState s) => s.world ??= new WorldState();

        public class Need { public string id, name; public int need, have; }
        public static List<Need> MissingFor(GameState s, Cost cost)
        {
            var output = new List<Need>();
            if (s.clover < cost.clover) output.Add(new Need { id = "clover", name = "四叶草", need = cost.clover, have = s.clover });
            foreach (var kv in cost.items)
            {
                int have = Inventory.CountOf(s.inventory, kv.Key);
                if (have < kv.Value) output.Add(new Need { id = kv.Key, name = GameData.Item(kv.Key).name, need = kv.Value, have = have });
            }
            return output;
        }

        static void Pay(GameState s, Cost cost) { s.clover -= cost.clover; foreach (var kv in cost.items) Inventory.RemoveItem(s.inventory, kv.Key, kv.Value); }

        public class BuildResult : Res { public List<Need> missing; }

        public static BuildResult BuyExpansion(GameState s)
        {
            var w = Of(s);
            if (w.expanded) return new BuildResult { reason = "done" };
            if (s.player.area != "home") return new BuildResult { reason = "away" };
            var miss = MissingFor(s, ExpandCost);
            if (miss.Count > 0) return new BuildResult { reason = "missing", missing = miss };
            Pay(s, ExpandCost);
            w.expanded = true;
            Guide.Bump(s, "expand");
            return new BuildResult { ok = true };
        }

        // 阿栗 helps once his workshop quest is done
        public static BuildResult RepairBridge(GameState s)
        {
            var w = Of(s);
            if (w.bridge) return new BuildResult { reason = "done" };
            if (s.town == null || Town.QuestState(s, "ali_wood") != "done") return new BuildResult { reason = "ali" };
            var miss = MissingFor(s, BridgeCost);
            if (miss.Count > 0) return new BuildResult { reason = "missing", missing = miss };
            Pay(s, BridgeCost);
            w.bridge = true;
            Guide.Bump(s, "bridge");
            return new BuildResult { ok = true };
        }
    }

    // one room, a grid; place / move / rotate / put away furniture, no overlapping
    public static class House
    {
        public const int RoomW = 12, RoomH = 8;
        // cells that must stay free: the bed (top-left) and the path from the door (bottom middle)
        public static readonly (int x, int y)[] Reserved = { (0, 0), (1, 0), (0, 1), (1, 1), (5, 7), (6, 7), (5, 6), (6, 6) };

        public class Furn { public int w, h; public bool floor, light; }
        public static readonly Dictionary<string, Furn> Furniture = new Dictionary<string, Furn>
        {
            { "item_furn_chair", new Furn { w = 1, h = 1 } },
            { "item_furn_table", new Furn { w = 2, h = 1 } },
            { "item_furn_plant", new Furn { w = 1, h = 1 } },
            { "item_furn_rug", new Furn { w = 2, h = 2, floor = true } },
            { "item_furn_shelf", new Furn { w = 2, h = 1 } },
            { "item_furn_lamp", new Furn { w = 1, h = 1, light = true } },
            { "item_furn_chime", new Furn { w = 1, h = 1 } },
            { "item_furn_horse", new Furn { w = 1, h = 1 } },
            { "item_furn_petbed", new Furn { w = 2, h = 1 } },
        };
        public static bool IsFurniture(string id) => id != null && Furniture.ContainsKey(id);

        public static HouseState Of(GameState s) => s.house ??= new HouseState();
        public static (int w, int h) Footprint(string id, int rot) { var f = Furniture[id]; return rot != 0 ? (f.h, f.w) : (f.w, f.h); }
        static List<(int x, int y)> Cells(string id, int x, int y, int rot)
        {
            var (w, h) = Footprint(id, rot); var output = new List<(int, int)>();
            for (int dy = 0; dy < h; dy++) for (int dx = 0; dx < w; dx++) output.Add((x + dx, y + dy));
            return output;
        }

        // rugs only can't overlap other rugs; other pieces may stand on a rug. ignore = index of an item being moved
        public static Res CanPlace(GameState s, string id, int x, int y, int rot = 0, int ignore = -1)
        {
            var mine = Cells(id, x, y, rot);
            if (mine.Any(c => c.x < 0 || c.y < 0 || c.x >= RoomW || c.y >= RoomH)) return Res.No("outside");
            if (mine.Any(c => Reserved.Contains(c))) return Res.No("reserved");
            bool floor = Furniture[id].floor;
            var items = Of(s).items;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                if (i == ignore || Furniture[it.id].floor != floor) continue;
                var theirs = Cells(it.id, it.x, it.y, it.rot);
                if (mine.Any(m => theirs.Contains(m))) return Res.No("overlap");
            }
            return Res.Ok();
        }

        public class PlaceResult : Res { public int index; }
        public static PlaceResult Place(GameState s, string id, int x, int y, int rot = 0)
        {
            if (!IsFurniture(id)) return new PlaceResult { reason = "not-furniture" };
            if (Inventory.CountOf(s.inventory, id) < 1) return new PlaceResult { reason = "none" };
            var chk = CanPlace(s, id, x, y, rot);
            if (!chk.ok) return new PlaceResult { reason = chk.reason };
            Inventory.RemoveItem(s.inventory, id, 1);
            Of(s).items.Add(new HouseItem { id = id, x = x, y = y, rot = rot });
            Guide.Bump(s, "decorate");
            return new PlaceResult { ok = true, index = Of(s).items.Count - 1 };
        }

        static HouseItem At(GameState s, int index) => index >= 0 && index < Of(s).items.Count ? Of(s).items[index] : null;

        public static Res Move(GameState s, int index, int x, int y)
        {
            var it = At(s, index);
            if (it == null) return Res.No("unknown");
            var chk = CanPlace(s, it.id, x, y, it.rot, index);
            if (!chk.ok) return chk;
            it.x = x; it.y = y;
            return Res.Ok();
        }

        public static Res Rotate(GameState s, int index)
        {
            var it = At(s, index);
            if (it == null) return Res.No("unknown");
            int rot = it.rot != 0 ? 0 : 1;
            var chk = CanPlace(s, it.id, it.x, it.y, rot, index);
            if (!chk.ok) return chk;
            it.rot = rot;
            return Res.Ok();
        }

        public static Res PickUp(GameState s, int index)
        {
            var it = At(s, index);
            if (it == null) return Res.No("unknown");
            if (!Inventory.AddItem(s.inventory, it.id, 1, Crafting.BagSlots(s))) return Res.No("full");
            Of(s).items.RemoveAt(index);
            return Res.Ok();
        }

        // which placed item covers (x, y)? solid pieces win over rugs; -1 = none
        public static int ItemAt(GameState s, int x, int y)
        {
            var items = Of(s).items; int rug = -1;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                if (!Cells(it.id, it.x, it.y, it.rot).Contains((x, y))) continue;
                if (!Furniture[it.id].floor) return i;
                rug = i;
            }
            return rug;
        }

        public static List<(int x, int y)> SolidCells(GameState s) => Of(s).items.Where(it => !Furniture[it.id].floor).SelectMany(it => Cells(it.id, it.x, it.y, it.rot)).ToList();
    }
}
