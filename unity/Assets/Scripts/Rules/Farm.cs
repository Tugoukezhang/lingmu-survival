// Farming & shipping, pet care & work, pet growth
// (systems/farm.js, systems/petcare.js, systems/growth.js; T11, T12, T27–T29, T39; docs/07).
using System;
using System.Collections.Generic;
using System.Linq;
using Lingmu.Core;

namespace Lingmu.Rules
{
    public static class Farm
    {
        public const int FarmW = 6, FarmH = 4;   // field size in tiles

        public static FarmState Of(GameState s) => s.farm ??= new FarmState();
        public static string PlotKey(int tx, int ty) => $"{tx},{ty}";
        public static FarmPlot PlotOf(GameState s, string key) => Of(s).plots.TryGetValue(key, out var p) ? p : new FarmPlot();
        static void SetPlot(GameState s, string key, FarmPlot p) => Of(s).plots[key] = p;

        public static bool Ripe(FarmPlot p) => p.crop != null && p.days >= GameData.Crops[p.crop].days;

        // what the action button would do: till | plant | water | harvest | wait
        public static string PlotAction(GameState s, string key)
        {
            var p = PlotOf(s, key);
            if (!p.tilled) return "till";
            if (p.crop == null) return "plant";
            if (Ripe(p)) return "harvest";
            return p.watered ? "wait" : "water";
        }

        public static Res Till(GameState s, string key)
        {
            if (Inventory.CountOf(s.inventory, "item_hoe") < 1) return Res.No("no-hoe");
            var p = PlotOf(s, key);
            if (p.tilled) return Res.No("tilled");
            var n = p.Clone(); n.tilled = true; SetPlot(s, key, n);
            return Res.Ok();
        }

        public class PlantResult : Res { public string crop; }
        public static PlantResult Plant(GameState s, string key, string seedId)
        {
            var p = PlotOf(s, key);
            var crop = GameData.CropBySeed(seedId);
            if (!p.tilled) return new PlantResult { reason = "not-tilled" };
            if (p.crop != null) return new PlantResult { reason = "occupied" };
            if (crop == null) return new PlantResult { reason = "not-seed" };
            if (!Inventory.RemoveItem(s.inventory, seedId, 1)) return new PlantResult { reason = "no-seed" };
            SetPlot(s, key, new FarmPlot { tilled = p.tilled, crop = crop.id, days = 0, watered = false });
            Guide.Bump(s, "plant");
            return new PlantResult { ok = true, crop = crop.id };
        }

        public static Res Water(GameState s, string key)
        {
            if (Inventory.CountOf(s.inventory, "item_can") < 1) return Res.No("no-can");
            var p = PlotOf(s, key);
            if (p.crop == null) return Res.No("empty");
            if (p.watered) return Res.No("watered");
            if (Ripe(p)) return Res.No("ripe");
            var n = p.Clone(); n.watered = true; SetPlot(s, key, n);
            Guide.Bump(s, "water");
            return Res.Ok();
        }

        public class HarvestResult : Res { public string item; }
        public static HarvestResult Harvest(GameState s, string key)
        {
            var p = PlotOf(s, key);
            if (!Ripe(p)) return new HarvestResult { reason = "not-ripe" };
            var item = GameData.Crops[p.crop].crop;
            if (!Inventory.AddItem(s.inventory, item, 1, Crafting.BagSlots(s))) return new HarvestResult { reason = "full" };
            SetPlot(s, key, new FarmPlot { tilled = true, crop = null, days = 0, watered = false });   // soil stays tilled
            Guide.Bump(s, "harvest");
            return new HarvestResult { ok = true, item = item };
        }

        public class BuyResult : Res { public int cost; }
        public static BuyResult BuySeed(GameState s, string cropId, int n = 1)
        {
            var c = GameData.Crops[cropId];
            int cost = c.seedPrice * n;
            if (s.clover < cost) return new BuyResult { reason = "clover" };
            if (!Inventory.AddItem(s.inventory, c.seed, n, Crafting.BagSlots(s))) return new BuyResult { reason = "full" };
            s.clover -= cost;
            return new BuyResult { ok = true, cost = cost };
        }

        // ---------- shipping box ----------
        public static int? PriceOf(string id) => GameData.Price(id);

        public static Res Ship(GameState s, string id, int n = 1)
        {
            if (PriceOf(id) == null) return Res.No("no-price");
            if (!Inventory.RemoveItem(s.inventory, id, n)) return Res.No("none");
            Inventory.AddItem(Of(s).shipping, id, n, int.MaxValue);
            Guide.Bump(s, "shipped", (PriceOf(id) ?? 0) * n);
            return Res.Ok();
        }

        public static Res Unship(GameState s, string id)
        {
            var box = Of(s).shipping; var st = box.Find(x => x.id == id);
            if (st == null) return Res.No("none");
            if (!Inventory.AddItem(s.inventory, id, st.count, Crafting.BagSlots(s))) return Res.No("full");
            Of(s).shipping = box.Where(x => x != st).ToList();
            return Res.Ok();
        }

        public static int ShippingValue(GameState s) => Of(s).shipping.Sum(st => (PriceOf(st.id) ?? 0) * st.count);

        // ---------- daily settlement steps ----------
        public static List<string> SettleShipping(GameState s)
        {
            int value = ShippingValue(s);
            if (value == 0) return new List<string>();
            int n = Of(s).shipping.Sum(st => st.count);
            s.clover += value;
            Of(s).shipping = new List<ItemStack>();
            Guide.Bump(s, "shippedValue", value);
            return new List<string> { $"出货 {n} 件：四叶草 +{value}" };
        }

        public static List<string> GrowCrops(GameState s)
        {
            int grew = 0, ripened = 0, dry = 0;
            foreach (var p in Of(s).plots.Values)
            {
                if (p.crop == null || Ripe(p)) continue;
                if (p.watered) { p.days += 1; grew++; if (Ripe(p)) ripened++; } else dry++;
                p.watered = false;
            }
            var lines = new List<string>();
            if (grew > 0) lines.Add($"作物长大了（{grew} 块地）" + (ripened > 0 ? $"，{ripened} 块可以收获了" : ""));
            if (dry > 0) lines.Add($"{dry} 块地昨天没浇水，没有长");
            return lines;
        }
    }

    public static class PetCare
    {
        public const int AffectionMax = 100, FeedFav = 15, FeedOther = 5, PetGain = 2, BondBattle = 1, BondTrip = 2, BondDailyCap = 5;

        // work at home 【建议】: amount = floor(base × (1 + affection / 100))
        public class WorkDef { public string name; public (string id, int n)[] @out; public (string id, int n)? bonusAt50; public int plots, clover; public double seedChance; }
        public static readonly Dictionary<string, WorkDef> Work = new Dictionary<string, WorkDef>
        {
            { "gather", new WorkDef { name = "采集", @out = new[] { ("item_berry", 3), ("item_grass", 2) } } },
            { "fish", new WorkDef { name = "钓鱼", @out = new[] { ("item_fish", 2) } } },
            { "chop", new WorkDef { name = "伐木", @out = new[] { ("item_wood", 4) } } },
            { "mine", new WorkDef { name = "挖矿", @out = new[] { ("item_stone", 4) }, bonusAt50 = ("item_crystal", 1) } },
            { "water", new WorkDef { name = "浇水", plots = 4 } },
            { "treasure", new WorkDef { name = "寻宝", clover = 10, seedChance = 0.3 } },
        };
        public static int WorkAmount(int baseN, int affection) => (int)Math.Floor(baseN * (1 + affection / 100.0));

        static int AddAffection(PetInstance pet, int n) { int before = pet.affection; pet.affection = Math.Min(AffectionMax, before + n); return pet.affection - before; }

        // anything edible, plus every crop (sunflower, starwheat… are pets' favourites)
        public static bool IsPetFood(string id) => GameData.Item(id)?.food != null || GameData.Crops.Values.Any(c => c.crop == id);

        public class FeedResult : Res { public int gain, exp, ups; public bool favourite; }
        public static FeedResult Feed(GameState s, string uid, string foodId)
        {
            var pet = s.Pet(uid);
            if (pet == null) return new FeedResult { reason = "unknown" };
            if (pet.fedDay == s.day) return new FeedResult { reason = "fed" };
            if (!IsPetFood(foodId)) return new FeedResult { reason = "not-food" };
            if (!Inventory.RemoveItem(s.inventory, foodId, 1)) return new FeedResult { reason = "none" };
            bool fav = GameData.Species(pet.species).food == foodId;
            pet.fedDay = s.day;
            int gain = AddAffection(pet, fav ? FeedFav : FeedOther);
            int exp = PetMath.CareExp(pet.level), ups = PetMath.GainExp(pet, exp);
            Guide.Bump(s, "feed");
            return new FeedResult { ok = true, gain = gain, favourite = fav, exp = exp, ups = ups };
        }

        public static FeedResult PetPet(GameState s, string uid)
        {
            var pet = s.Pet(uid);
            if (pet == null) return new FeedResult { reason = "unknown" };
            if (pet.pettedDay == s.day) return new FeedResult { reason = "petted" };
            pet.pettedDay = s.day;
            int gain = AddAffection(pet, PetGain);
            Guide.Bump(s, "pet");
            return new FeedResult { ok = true, gain = gain };
        }

        // win a battle together +1, finish a trip together +2, each ≤ +5 per day
        static void Bond(GameState s, string kind, int n)
        {
            foreach (var uid in s.party)
            {
                var pet = s.Pet(uid);
                if (pet == null) continue;
                if (pet.bond == null || pet.bond.day != s.day) pet.bond = new BondState { day = s.day };
                int have = kind == "battle" ? pet.bond.battle : pet.bond.trip;
                int add = Math.Min(n, BondDailyCap - have);
                if (add > 0)
                {
                    if (kind == "battle") pet.bond.battle += add; else pet.bond.trip += add;
                    AddAffection(pet, add);
                }
            }
        }
        public static void BondFromBattle(GameState s) => Bond(s, "battle", BondBattle);
        public static void BondFromTrip(GameState s) => Bond(s, "trip", BondTrip);

        public static Res SetJob(GameState s, string uid, bool on)
        {
            var pet = s.Pet(uid);
            if (pet == null) return Res.No("unknown");
            if (on && s.party.Contains(uid)) return Res.No("party");
            if (on && s.player.area != "home") return Res.No("away");
            pet.job = on;
            return Res.Ok();
        }

        public static List<PetInstance> Workers(GameState s) => s.pets.Where(p => p.job && !s.party.Contains(p.uid)).ToList();

        // settlement step 宠物打工: outputs go to the home storage; 浇水 waters the farm for the new day
        public static List<string> RunPetWork(GameState s)
        {
            var lines = new List<string>();
            s.storage ??= new List<ItemStack>();
            var ws = Workers(s);
            for (int i = 0; i < ws.Count; i++)
            {
                var pet = ws[i];
                var sp = GameData.Species(pet.species);
                if (sp.work == null || !Work.TryGetValue(sp.work, out var w)) continue;
                int aff = pet.affection; var got = new List<string>();
                foreach (var (id, b) in w.@out ?? new (string, int)[0]) { int n = WorkAmount(b, aff); Inventory.AddItem(s.storage, id, n, int.MaxValue); got.Add($"{GameData.Item(id).name} ×{n}"); }
                if (w.bonusAt50 != null && aff >= 50) { var (bid, bn) = w.bonusAt50.Value; Inventory.AddItem(s.storage, bid, bn, int.MaxValue); got.Add($"{GameData.Item(bid).name} ×{bn}"); }
                if (w.clover > 0) { int n = WorkAmount(w.clover, aff); s.clover += n; got.Add($"四叶草 ×{n}"); }
                if (w.seedChance > 0)
                {
                    var rng = new Mulberry32((long)s.day * 7919 + i * 131 + 17);
                    if (rng.Next() < w.seedChance)
                    {
                        var ids = GameData.CropIds;
                        var seed = GameData.Crops[ids[(int)Math.Floor(rng.Next() * ids.Count)]].seed;
                        Inventory.AddItem(s.storage, seed, 1, int.MaxValue); got.Add($"{GameData.Item(seed).name} ×1");
                    }
                }
                if (w.plots > 0)
                {
                    int want = WorkAmount(w.plots, aff), n = 0;
                    foreach (var p in Farm.Of(s).plots.Values) { if (n >= want) break; if (p.crop != null && !p.watered && !Farm.Ripe(p)) { p.watered = true; n++; } }
                    got.Add(n > 0 ? $"浇了 {n} 块地" : "没有要浇的地");
                }
                int exp = PetMath.CareExp(pet.level), ups = PetMath.GainExp(pet, exp);
                got.Insert(0, ups > 0 ? $"经验 +{exp}，升到 Lv.{pet.level}" : $"经验 +{exp}");
                lines.Add($"{sp.name}{w.name}：{string.Join("、", got)}");
            }
            if (lines.Count > 0 && lines.Any(l => !l.EndsWith("没有要浇的地"))) lines.Add("（打工带回的东西放在家园仓库）");
            return lines;
        }

        public static (bool fed, bool petted) CaredToday(GameState s, PetInstance pet) => (pet.fedDay == s.day, pet.pettedDay == s.day);
        public static List<ItemStack> FoodsInBag(GameState s) => s.inventory.Where(st => IsPetFood(st.id)).ToList();
    }

    public static class Growth
    {
        public class CheckResult : Res { public List<string> missing = new List<string>(); public bool unlocked; public int gained, stars, need, have; public string form; }

        // ---------- evolution (docs/07 第 3 节) ----------
        public static CheckResult EvolveCheck(GameState s, string uid)
        {
            var pet = s.Pet(uid);
            var stone = GameData.Species(pet.species).evolution.stone;
            var (ok, missing) = PetMath.CanEvolve(pet, Inventory.CountOf(s.inventory, stone) > 0);
            return new CheckResult { ok = ok, missing = missing };
        }

        public static CheckResult TryEvolve(GameState s, string uid)
        {
            var pet = s.Pet(uid);
            if (pet == null) return new CheckResult { missing = new List<string> { "unknown" } };
            var chk = EvolveCheck(s, uid);
            if (!chk.ok) return chk;
            Inventory.RemoveItem(s.inventory, GameData.Species(pet.species).evolution.stone, 1);
            PetMath.Evolve(pet);
            pet.hp = null;   // evolving refreshes the pet
            Guide.Bump(s, "evolve");
            return new CheckResult { ok = true };
        }

        // ---------- crystals, stars, dex (docs/07 第 5、8 节) ----------
        public static int CrystalsOf(GameState s, string sp) => s.crystals != null && s.crystals.TryGetValue(sp, out var n) ? n : 0;
        public static int StarCost(int stars) => stars * 2;   // n★ → n+1★ costs 2n crystals (1→5 total 20)

        // a duplicate becomes crystals (= its stars); only when you already have one of that species
        public static CheckResult ConvertToCrystal(GameState s, string uid)
        {
            var pet = s.Pet(uid);
            if (pet == null) return new CheckResult { reason = "unknown" };
            if (!s.pets.Any(p => p.species == pet.species && p.uid != uid)) return new CheckResult { reason = "only-one" };
            s.pets = s.pets.Where(p => p.uid != uid).ToList();
            s.party = s.party.Where(u => u != uid).ToList();
            s.crystals ??= new Dictionary<string, int>();
            s.crystals[pet.species] = CrystalsOf(s, pet.species) + pet.stars;
            return new CheckResult { ok = true, gained = pet.stars };
        }

        public static CheckResult StarUp(GameState s, string uid)
        {
            var pet = s.Pet(uid);
            if (pet == null) return new CheckResult { reason = "unknown" };
            if (pet.stars >= 5) return new CheckResult { reason = "max" };
            int need = StarCost(pet.stars);
            if (CrystalsOf(s, pet.species) < need) return new CheckResult { reason = "crystals", need = need, have = CrystalsOf(s, pet.species) };
            s.crystals[pet.species] -= need;
            pet.stars += 1;
            Guide.Bump(s, "starUp");
            return new CheckResult { ok = true, stars = pet.stars };
        }

        static DexEntry Dex(GameState s, string sp) { s.dex ??= new Dictionary<string, DexEntry>(); if (!s.dex.TryGetValue(sp, out var e)) s.dex[sp] = e = new DexEntry(); return e; }
        public static void DexSee(GameState s, string sp) => Dex(s, sp).seen = true;
        public static void DexCatch(GameState s, PetInstance inst) { var e = Dex(s, inst.species); e.seen = true; if (inst.shiny) e.shiny = true; else e.caught = true; }
        public static int DexCount(GameState s) => GameData.Pets.Count(p => (s.dex != null && s.dex.TryGetValue(p.id, out var e) && (e.caught || e.shiny)) || s.pets.Any(x => x.species == p.id));

        // ---------- skill books (docs/07 第 4 节) ----------
        public static string BookSkill(string bookId) => GameData.Item(bookId)?.book;

        // the book's element must be the pet's element, normal, or none (status skill)
        public static CheckResult CanLearn(GameState s, string uid, string bookId)
        {
            var pet = s.Pet(uid); var skillId = BookSkill(bookId);
            if (pet == null || skillId == null) return new CheckResult { reason = "unknown" };
            var el = GameData.Skill(skillId).element;
            if (!string.IsNullOrEmpty(el) && el != Elements.Normal && el != GameData.Species(pet.species).element) return new CheckResult { reason = "element" };
            if (pet.skills.Contains(skillId)) return new CheckResult { reason = "known" };
            return new CheckResult { ok = true };
        }

        // replaces regular slot 0..2 (the evolution skill has its own slot)
        public static CheckResult LearnSkill(GameState s, string uid, string bookId, int slot)
        {
            var chk = CanLearn(s, uid, bookId);
            if (!chk.ok) return chk;
            if (!(slot >= 0 && slot < PetMath.RegularSlots)) return new CheckResult { reason = "slot" };
            if (Inventory.CountOf(s.inventory, bookId) < 1) return new CheckResult { reason = "none" };
            var pet = s.Pet(uid);
            Inventory.RemoveItem(s.inventory, bookId, 1);
            if (slot < pet.skills.Count) pet.skills[slot] = BookSkill(bookId); else pet.skills.Add(BookSkill(bookId));
            Guide.Bump(s, "learn");
            return new CheckResult { ok = true };
        }

        // ---------- human form (docs/07 第 10 节; first version: 焰尾狐 only) ----------
        public static CheckResult FormCheck(GameState s, string uid)
        {
            var pet = s.Pet(uid);
            var missing = new List<string>();
            if (string.IsNullOrEmpty(GameData.Species(pet.species).humanForm)) return new CheckResult { missing = new List<string> { "species" } };
            if (pet.canTransform) return new CheckResult { ok = true, unlocked = true };
            if (!pet.evolved) missing.Add("evolved");
            if (pet.affection < 100) missing.Add("affection");
            if (Inventory.CountOf(s.inventory, "item_fox_bell") < 1) missing.Add("bell");
            return new CheckResult { ok = missing.Count == 0, missing = missing };
        }

        public static CheckResult UnlockForm(GameState s, string uid)
        {
            var chk = FormCheck(s, uid);
            if (!chk.ok || chk.unlocked) return chk;
            Inventory.RemoveItem(s.inventory, "item_fox_bell", 1);
            s.Pet(uid).canTransform = true;
            return new CheckResult { ok = true };
        }

        // animal ⇄ human; stats never change
        public static CheckResult ToggleForm(GameState s, string uid)
        {
            var pet = s.Pet(uid);
            if (pet == null || !pet.canTransform) return new CheckResult { reason = "locked" };
            pet.form = pet.form == "human" ? "animal" : "human";
            return new CheckResult { ok = true, form = pet.form };
        }
    }
}
