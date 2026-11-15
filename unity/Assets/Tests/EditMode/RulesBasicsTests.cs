// Checks ported 1:1 from the web version's tools/logic-test.mjs (sections: data integrity, element matchups,
// base stats & growth, damage, experience, catching, aptitude / shiny rolls, evolution, survival, inventory).
// Each test name keeps the Chinese case name of the original check, so the two lists can be compared.
using System;
using System.Collections.Generic;
using System.Linq;
using Lingmu.Core;
using Lingmu.Rules;
using NUnit.Framework;

public class RulesBasicsTests
{
    static PetInstance Pet(string id, int level = 1, int stars = 3, string nature = "gentle") => PetMath.CreatePet(id, level, null, stars, nature, false, "t");
    static Func<double> Rng(long seed) { var r = new Mulberry32(seed); return r.Next; }

    // ---------- data integrity ----------
    [Test] public void 数据完整()
    {
        Assert.AreEqual(6, GameData.Pets.Count, "宠物 6 种");
        Assert.IsTrue(GameData.Pets.All(p => GameData.Elements.Contains(p.element) && PetMath.StatNames.All(k => p.baseStats.Get(k) > 0)
            && p.skills.Count == 3 && p.skills.All(s => GameData.Skills.ContainsKey(s)) && GameData.Skills[p.evolution.skill].evolution), "每只宠物：属性有效、4 项基础值、3 个技能存在、进化技能存在");
        Assert.IsTrue(GameData.Skills.Values.All(s => s.element == null || s.element == Elements.Normal || GameData.Elements.Contains(s.element)), "技能属性都有效");
        Assert.IsTrue(GameData.Skills.Values.All(s => s.power > 0 || (s.effects?.Count ?? 0) > 0), "伤害技能有威力，状态技能有效果");
        Assert.AreEqual(13, GameData.NatureIds.Count, "性格 13 种");
        Assert.AreEqual(12, GameData.Natures.Values.Where(n => n.up != null).Select(n => n.up + n.down).Distinct().Count(), "12 种性格加减成组合各不相同");
        Assert.IsTrue(GameData.Starters.All(id => GameData.Species(id) != null), "开局三选一都在名单里");
    }

    // ---------- element matchups ----------
    [Test] public void 属性克制()
    {
        Assert.AreEqual(1.5, Elements.Multiplier("水", "火"), "水打火 ×1.5");
        Assert.AreEqual(0.67, Elements.Multiplier("火", "水"), "火打水 ×0.67");
        Assert.AreEqual(1.5, Elements.Multiplier("森", "水"), "森打水 ×1.5");
        Assert.AreEqual(1.5, Elements.Multiplier("光", "暗"), "光打暗 ×1.5");
        Assert.AreEqual(1.5, Elements.Multiplier("暗", "光"), "暗打光 ×1.5");
        Assert.AreEqual(1, Elements.Multiplier("光", "森"), "光打森 ×1");
        Assert.AreEqual(1, Elements.Multiplier(Elements.Normal, "火"), "普通技能 ×1");
    }

    // ---------- base stats & growth ----------
    [Test] public void 基础属性与成长()
    {
        var foxL1 = PetMath.CalcStats(Pet("fox"));
        Assert.IsTrue(foxL1.hp == 42 && foxL1.atk == 13 && foxL1.def == 10 && foxL1.spd == 12, "焰尾狐 Lv1 属性 = 表格基础值");
        Assert.AreEqual(24, PetMath.CalcStats(Pet("fox", 12)).atk, "P01 焰尾狐 Lv12 3 星温和未进化 攻击");
        var evo = Pet("fox", 12); PetMath.Evolve(evo);
        Assert.AreEqual(30, PetMath.CalcStats(evo).atk, "P02 进化后攻击");
        Assert.IsTrue(PetMath.BattleSkills(evo).Contains("foxlantern") && PetMath.DisplayName(evo) == "灯焰狐", "P02 进化后学会狐火灯笼，名字变灯焰狐");
        var evo5 = Pet("fox", 12, 5); PetMath.Evolve(evo5);
        var evo1 = Pet("fox", 12, 1); PetMath.Evolve(evo1);
        Assert.AreEqual(32, PetMath.CalcStats(evo5).atk, "P03 进化 5 星攻击");
        Assert.AreEqual(27, PetMath.CalcStats(evo1).atk, "P03 进化 1 星攻击");
        var brave = Pet("fox", 12, 3, "brave"); PetMath.Evolve(brave); brave.affection = 100;
        Assert.AreEqual(33, PetMath.CalcStats(brave).atk, "P04 进化 3 星勇敢 面板攻击");
        Assert.AreEqual(36, PetMath.CalcStats(brave, true).atk, "P04 好感 100 对战中攻击");
        Assert.AreEqual(1.05, PetMath.AffectionAttackMult(50), "好感 50 对战攻击 ×1.05");
        Assert.AreEqual(1, PetMath.AffectionAttackMult(49), "好感 49 无加成");
    }

    // ---------- damage ----------
    [Test] public void 伤害()
    {
        var fox1 = Pet("fox"); var acorn1 = Pet("acorn");
        Assert.AreEqual(30, PetMath.SkillDamage(fox1, acorn1, "ember"), "A01 焰尾狐小火苗打橡果刺猬 伤害");
        Assert.AreEqual(14, PetMath.SkillDamage(fox1, acorn1, "tackle"), "焰尾狐蹭蹭打橡果刺猬 伤害");
        Assert.AreEqual(0, PetMath.SkillDamage(fox1, acorn1, "heal"), "状态技能伤害为 0");
        var rolls = Enumerable.Range(0, 1000).Select(i => PetMath.DamageRoll(Rng(i + 1))).ToList();
        Assert.IsTrue(rolls.All(r => r >= 0.9 && r < 1.1), "伤害随机数在 0.9–1.1");
    }

    // ---------- experience ----------
    [Test] public void 经验()
    {
        var exp = Pet("fox");
        PetMath.GainExp(exp, PetMath.ExpForKO(2));
        Assert.IsTrue(exp.level == 1 && exp.exp == 16, "Lv1 击倒 Lv2 得 16 经验，不升级");
        PetMath.GainExp(exp, PetMath.ExpForKO(1));
        Assert.IsTrue(exp.level == 2 && exp.exp == 4, "再击倒 Lv1 → 升到 Lv2，余 4");
        var sk = Pet("acorn");
        Assert.IsTrue(sk.skills.Count == 2 && !sk.skills.Contains("shell"), "Lv1 会 2 个技能");
        PetMath.GainExp(sk, 20 + 40 + 60 + 80);
        Assert.IsTrue(sk.level == 5 && sk.skills.Contains("shell"), "升到 Lv5 学会第 3 个技能「刺球」");
        var cap = Pet("fox", 29); PetMath.GainExp(cap, 99999);
        Assert.IsTrue(cap.level == 30 && cap.exp == 0, "等级上限 30");
        var lv = Enumerable.Range(0, 300).Select(i => PetMath.WildLevel(6, Rng(i + 7))).ToList();
        Assert.IsTrue(lv.All(l => l >= 3 && l <= 5) && lv.Distinct().Count() == 3, "第 6 天野生宠物等级在 3–5");
        Assert.IsTrue(Enumerable.Range(0, 100).All(i => PetMath.WildLevel(0, Rng(i + 1)) >= 1), "第 0 天野生宠物等级最低 1");
    }

    // ---------- catching ----------
    [Test] public void 捕捉()
    {
        double b = GameData.Species("acorn").catchRate;
        Assert.AreEqual(0.15, PetMath.CatchRate(b, 46, 46), 0.001, "满血草编网 15%");
        Assert.AreEqual(0.3783, PetMath.CatchRate(b, 16, 46), 0.001, "剩 16 体力 37.8%");
        double bait = PetMath.BaitMultiplier("acorn", "item_carrot");
        Assert.AreEqual(1.5, bait, "萝卜是橡果刺猬的喜好食物 ×1.5");
        Assert.AreEqual(1.2, PetMath.BaitMultiplier("acorn", "item_berry"), "其他食物 ×1.2");
        double a04 = PetMath.CatchRate(b, 16, 46, 1, bait);
        Assert.AreEqual(0.5674, a04, 0.001, "剩 16 + 萝卜 56.7%");
        Assert.AreEqual(0.8511, PetMath.CatchRate(b, 16, 46, 1.5, bait), 0.001, "再换藤编网 85.1%");
        Assert.AreEqual(0.95, PetMath.CatchRate(b, 1, 46, 1.5, 1.5), "剩 1 + 藤编网 + 喜好 封顶 95%");
        Assert.IsTrue(PetMath.CatchSucceeds(a04, 0.50), "A04 随机数 0.50 → 成功");
        Assert.IsFalse(PetMath.CatchSucceeds(a04, 0.60), "A08 随机数 0.60 → 失败");
        Assert.AreEqual(0, PetMath.CatchRate(b, 0, 46, 1.5, 1.5), "A09 对方体力 0 不能捕捉");
        Assert.AreEqual(20, PetMath.AffectionOnCatch(true), "用了喜好诱饵捕捉好感 20");
    }

    // ---------- aptitude / shiny rolls ----------
    [Test] public void 资质与异色()
    {
        var rng = Rng(20261108); const int N = 10000; var cnt = new Dictionary<int, int> { { 1, 0 }, { 2, 0 }, { 3, 0 }, { 4, 0 }, { 5, 0 } };
        for (int i = 0; i < N; i++) cnt[PetMath.RollStars(rng)]++;
        var want = new Dictionary<int, double> { { 1, 30 }, { 2, 30 }, { 3, 25 }, { 4, 12 }, { 5, 3 } };
        Assert.IsTrue(want.All(kv => Math.Abs(cnt[kv.Key] / (double)N * 100 - kv.Value) <= 1), "P07 10000 次资质分布偏差 ≤ 1 个百分点");
        int shiny = 0; var r2 = Rng(99);
        for (int i = 0; i < 100000; i++) if (PetMath.RollShiny(r2)) shiny++;
        Assert.AreEqual(0.01, shiny / 100000.0, 0.002, "异色概率约 1%");
        var a = PetMath.CreatePet("pup", 1, Rng(5), uid: "x"); var c = PetMath.CreatePet("pup", 1, Rng(5), uid: "x");
        Assert.AreEqual(Newtonsoft.Json.JsonConvert.SerializeObject(a), Newtonsoft.Json.JsonConvert.SerializeObject(c), "同一种子创建的宠物完全相同");
    }

    // ---------- evolution conditions ----------
    [Test] public void 进化条件()
    {
        var p05 = Pet("fox", 12); p05.affection = 29;
        var r05 = PetMath.CanEvolve(p05, true);
        Assert.IsTrue(!r05.ok && string.Join(",", r05.missing) == "affection", "P05 好感 29 不能进化，提示缺好感");
        p05.affection = 30;
        Assert.IsTrue(PetMath.CanEvolve(p05, true).ok, "好感 30、等级 12、有石头 → 可以进化");
        var evo = Pet("fox", 12); PetMath.Evolve(evo);
        Assert.IsTrue(!PetMath.CanEvolve(evo, true).ok && PetMath.Evolve(evo) == false, "已进化的不能再进化");
    }

    // ---------- survival: health & fullness ----------
    static (GameState s, List<string> ev, int? firstEmpty, int? faintAt) Run(string area, int fromClock, int toClock, Action<PlayerState> setup = null)
    {
        var s = new GameState { day = 1, clock = fromClock, player = new PlayerState { area = area } };
        setup?.Invoke(s.player);
        var c = new GameClock(); var ev = new List<string>();
        int? firstEmpty = null, faintAt = null;
        while (s.clock < toClock && !c.Paused)
            foreach (var e in c.Advance(s, GameTime.MsPerGameMin))
            {
                if (e.type != "tick") continue;
                foreach (var x in Survival.Tick(s.player, area))
                {
                    ev.Add(x);
                    if (x == "empty" && firstEmpty == null) firstEmpty = s.clock;
                    if (x == "faint" && faintAt == null) faintAt = s.clock;
                }
            }
        return (s, ev, firstEmpty, faintAt);
    }

    [Test] public void 生存_饱食与生命()
    {
        Assert.IsTrue(GameData.Items.Values.All(it => !string.IsNullOrEmpty(it.icon) && !string.IsNullOrEmpty(it.desc) && !string.IsNullOrEmpty(it.name) && (it.food == null || it.food > 0)), "每种物品都有图标和描述；食物的饱食值为正");
        Assert.AreEqual(52, Run("home", 6 * 60, 18 * 60).s.player.hunger, "E03 6:00 饱食 100 不吃东西 → 18:00 饱食 52（每 15 分钟 −1）");
        Assert.AreEqual(1, Run("expedition", 6 * 60, 30 * 60).ev.Count(x => x == "hungry"), "饱食降到 20 时提醒一次");
        var allDay = Run("expedition", 6 * 60, 30 * 60);
        Assert.IsTrue(allDay.firstEmpty == null && allDay.s.player.hunger == 4, "6:00 满饱食一直不吃，一整个远征日都饿不空：剩 4");
        var ex = Run("expedition", 6 * 60, 30 * 60, p => p.hunger = 40);
        Assert.AreEqual("16:00", GameTime.Format(ex.firstEmpty.Value), "饱食 40 出门不吃：16:00 归零");
        Assert.AreEqual("21:40", GameTime.Format(ex.faintAt ?? 0), "之后每 10 分钟 −3 生命：21:40 倒下（远征）");
        Assert.AreEqual(0, ex.s.player.hp, "倒下时生命为 0");
        var e11 = Run("home", 6 * 60, 24 * 60, p => { p.hunger = 0; p.hp = 20; });
        Assert.IsTrue(e11.s.player.hp == 1 && !e11.ev.Contains("faint") && e11.ev.Count(x => x == "floor") == 1, "E11 家园饱食归零很久：生命停在 1，不会倒下，有提示");
        var fainted = new PlayerState { hp = 0, hunger = 0 };
        Assert.IsTrue(Survival.ApplyDamage(fainted, 15, "expedition").Count == 0 && fainted.hp == 0, "已经倒下后再受伤不重复触发");
        var hit = new PlayerState { hunger = 50 };
        int n = 0; while (!Survival.ApplyDamage(hit, 15, "expedition").Contains("faint")) n++;
        Assert.AreEqual(7, n + 1, "E07 规则：生命 100 被打 15 点，第 7 次倒下");
    }

    [Test] public void 生存_吃东西()
    {
        var st = SaveRules.NewGameState();
        st.player.hunger = 50; st.player.hp = 90;
        int berries = Inventory.CountOf(st.inventory, "item_berry");
        var r1 = Survival.Eat(st, "item_berry");
        Assert.IsTrue(r1.ok && st.player.hunger == 60 && Inventory.CountOf(st.inventory, "item_berry") == berries - 1, "吃浆果：饱食 +10，浆果 −1");
        var r2 = Survival.Eat(st, "item_fish_roast");
        Assert.IsTrue(r2.ok && st.player.hunger == 90 && st.player.hp == 100 && Inventory.CountOf(st.inventory, "item_fish_roast") == 0 && !st.inventory.Any(x => x.id == "item_fish_roast"), "吃烤鱼：饱食 +30、生命 +10，吃完格子消失");
        var r3 = Survival.Eat(st, "item_carrot");
        Assert.IsTrue(r3.ok && st.player.hunger == 100 && r3.hunger == 10, "饱食不会超过上限");
        var before = Newtonsoft.Json.JsonConvert.SerializeObject(st.inventory);
        var r4 = Survival.Eat(st, "item_berry");
        Assert.IsTrue(!r4.ok && r4.reason == "full" && Newtonsoft.Json.JsonConvert.SerializeObject(st.inventory) == before, "吃饱了再吃 → 拒绝，不消耗");
        Assert.AreEqual("none", Survival.Eat(st, "item_fish_roast").reason, "没有的食物不能吃");
        Assert.AreEqual("not-food", Survival.Eat(st, "item_net_grass").reason, "捕宠网不能吃");
    }

    [Test] public void 背包()
    {
        var inv = new List<ItemStack> { new ItemStack("item_berry", 2) };
        Assert.IsTrue(!Inventory.RemoveItem(inv, "item_berry", 3) && inv[0].count == 2, "物品不够时扣除失败且不改动");
        Inventory.AddItem(inv, "item_berry", 3);
        Assert.IsTrue(inv.Count == 1 && inv[0].count == 5, "同种物品叠加在一格");
        var full = Enumerable.Range(0, Inventory.BagSlots).Select(i => new ItemStack("x" + i, 1)).ToList();
        Assert.IsTrue(!Inventory.AddItem(full, "item_berry", 1) && full.Count == Inventory.BagSlots, "背包 20 格满了放不下新物品");
    }
}
