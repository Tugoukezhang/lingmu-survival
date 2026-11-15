// Checks ported 1:1 from the web version's tools/logic-test.mjs, part 2: night, camping, explore skills,
// new-player guide & protection, farming, pet care, daily tasks, growth, town, island progress, decoration,
// title page & starters, friendship pacing, field catching & faster battles.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Lingmu.Core;
using Lingmu.Rules;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

public class RulesSystemsTests2
{
    static GameState New() => SaveRules.NewGameState(1);
    static int H(int h, int m = 0) => h * 60 + m;
    static bool Valid(GameState s) => SaveCodec.Validate(s).Count == 0;
    static string Errs(GameState s) => string.Join(",", SaveCodec.Validate(s));

    [Test] public void 夜晚_雾怪与光()
    {
        var c = new Checks();
        c.Ok("起雾时间：19:59 没有、20:00 起雾、凌晨 5:59（29:59）还有、6:00 散去", !Night.IsFoggy(H(19, 59)) && Night.IsFoggy(H(20)) && Night.IsFoggy(H(29, 59)) && !Night.IsFoggy(H(6)));
        int? last = null; int count = 0; var spawns = new List<int>();
        for (int t = H(19); t <= H(30); t++) if (Night.ShouldSpawn(t, last, count)) { spawns.Add(Night.IsFoggy(t) ? t : -1); last = t; count++; if (count == 3) break; }
        c.Eq("刷怪节奏：20:10 第一只，之后每 60 分钟；最多 3 只", string.Join(",", spawns.Select(t => GameTime.Format(t))), "20:10,21:10,22:10");
        c.Ok("午夜后每 30 分钟刷一只", Night.ShouldSpawn(H(24, 30), H(24), 1) && !Night.ShouldSpawn(H(23, 30), H(23), 1));
        c.Ok("同时最多 3 只", !Night.ShouldSpawn(H(25), H(23), 3));

        var st = New(); st.day = 2; st.clock = H(21);
        st.party = new List<string> { "pet-pup", "pet-acorn" };
        c.Eq("队伍里没有发光宠物、没点火把：身边没有光", Night.PlayerLightTiles(st), 0.0);
        Night.LightTorchNow(st);
        bool a = Night.PlayerLightTiles(st) == 2; st.clock = H(23, 59); bool b1 = Night.TorchLit(st); st.clock = H(24); bool b2 = !Night.TorchLit(st);
        c.Ok("点亮火把：身边 2 格光，3 小时后熄灭", a && b1 && b2);
        st.clock = H(21); st.party = new List<string> { "pet-fox" };
        c.Ok("火把和发光宠物不叠加，取最大（2 格）", Night.PlayerLightTiles(st) == 2);
        st.player.torchUntil = 0;
        c.Eq("只有焰尾狐在队伍里：身边 1.5 格光", Night.PlayerLightTiles(st), 1.5);
        st.party = new List<string> { "pet-starbear" };
        c.Ok("星星熊仔也能照明", Night.PlayerLightTiles(st) == 1.5);
        var tq = New(); tq.day = 3; tq.clock = H(23); Night.LightTorchNow(tq); tq.clock = H(25, 59); bool lit = Night.TorchLit(tq); tq.day = 4; tq.clock = H(6);
        c.Ok("火把燃烧时间跨过午夜和结算也正确（按绝对时间算）", lit && !Night.TorchLit(tq));

        var ls = Night.Lights(New(), 1000, 1000, new[] { (1000.0, 1000.0) });
        double r = Night.LightCampfire * Night.TilePx;
        var m = new Night.Monster { x = 1000 + r + 200, y = 1000 };
        for (int i = 0; i < 400; i++) m = Night.MonsterStep(m, 1000, 1000, ls, 0.05);
        double d = Math.Sqrt((m.x - 1000) * (m.x - 1000) + (m.y - 1000) * (m.y - 1000));
        c.Ok("E06 玩家站在营火光圈里：雾怪停在光圈边缘，不进来", d >= r && d <= r + Night.EdgeMargin + 5 && m.stopped, $"距离 {d:F1}，光圈 {r}");
        var inside = new Night.Monster { x = 1050, y = 1000 };
        for (int i = 0; i < 20; i++) inside = Night.MonsterStep(inside, 1000, 1000, ls, 0.05);
        c.Ok("在光里的雾怪会往外退", Math.Sqrt((inside.x - 1000) * (inside.x - 1000) + (inside.y - 1000) * (inside.y - 1000)) > 50 && inside.retreating);
        c.Ok("站在光里的雾怪不能攻击，光外够近才攻击", !Night.CanAttack(new Night.Monster { x = 1050, y = 1000 }, 1000, 1000, ls, 0) && Night.CanAttack(new Night.Monster { x = 1000 + r + 20, y = 1000 }, 1000 + r - 100, 1000, ls, 0));
        var none = new List<Light>();
        c.Ok("攻击冷却 4 秒", !Night.CanAttack(new Night.Monster { nextAttack = 4000 }, 50, 0, none, 3999) && Night.CanAttack(new Night.Monster { nextAttack = 4000 }, 50, 0, none, 4000));
        c.Ok("预警圈：站在圈里被打中，走出 1.2 格就躲开", Night.WarningHits(0, 0, Night.WarnRadius, 50, 0) && !Night.WarningHits(0, 0, Night.WarnRadius, 58, 0));
        c.Near("1.2 秒内走出预警圈：玩家 1.2 秒能走 204 像素，圈半径 57.6", 170 * 1.2 - Night.WarnRadius, 146.4, 0.01);
        var hp = new PlayerState { hunger = 50 };
        int hits = 0; while (!Survival.ApplyDamage(hp, Night.Damage, "expedition").Contains("faint")) hits++;
        c.Eq("E07 夜晚不躲，被打 7 次倒下", hits + 1, 7);
        var rng = new Mulberry32(3);
        var sp = Night.PickSpawn(rng.Next, 1000, 1000, ls, (x, y) => true);
        c.Ok("雾怪只在光外出现", sp != null && Night.LitBy(ls, sp.Value.x, sp.Value.y) == null);
        var tv = New(); tv.player.torchUntil = 5000;
        c.Ok("火把时间存档合法", Valid(tv));
        c.Done();
    }

    [Test] public void 扎营()
    {
        var c = new Checks();
        GameState Mk() { var s = Checks.OnIsland(New(), 4242); s.day = 3; s.clock = 20 * 60; s.inventory = Checks.Inv(("item_wood", 4), ("item_stone", 4)); return s; }
        var s = Mk();
        c.Ok("做营火：木材 4 + 石头 4", Crafting.Craft(s, "campfire").ok && Checks.Count(s.inventory, "item_campfire") == 1 && Checks.Count(s.inventory, "item_wood") == 0);
        s.inventory.Add(new ItemStack("item_wood", 4));
        var pl = Camp.PlaceCampfire(s, 10, 10);
        c.Ok("20:00 点燃营火：能烧 2 小时（到 22:00）", pl.ok && Camp.FireLeft(s, pl.fire) == 120 && Checks.Count(s.inventory, "item_campfire") == 0);
        c.Eq("撑到 6:00 还要 4 根柴", Camp.WoodToDawn(s, pl.fire), 4);
        for (int i = 0; i < 4; i++) Camp.AddWood(s, pl.fire.id);
        c.Ok("8 份木材刚好撑过 20:00–6:00", Camp.FireLeft(s, pl.fire) == 10 * 60 && Camp.WoodToDawn(s, pl.fire) == 0 && Checks.Count(s.inventory, "item_wood") == 0);
        c.Ok("没有木材不能添柴", Camp.AddWood(s, pl.fire.id).reason == "no-wood");
        s.inventory.Add(new ItemStack("item_campfire", 1));
        c.Ok("同一格不能放两个营火", Camp.PlaceCampfire(s, 10, 10).reason == "occupied");
        s.clock = 25 * 60; c.Ok("午夜后营火还在烧（按绝对时间）", Camp.Burning(s).Count == 1 && Camp.FireLeft(s, pl.fire) == 300);
        s.clock = 30 * 60; c.Ok("6:00 燃料用完熄灭", Camp.Burning(s).Count == 0);
        s.inventory.Add(new ItemStack("item_wood", 1));
        Camp.AddWood(s, pl.fire.id);
        c.Ok("熄灭的营火添柴会重新点燃（从现在算 2 小时）", Camp.FireLeft(s, pl.fire) == 120);
        s = Mk(); s.inventory = Checks.Inv(("item_campfire", 1), ("item_wood", 2));
        var f2 = Camp.PlaceCampfire(s, 5, 5).fire;
        c.Ok("没有帐篷不能在野外睡", Camp.CanCampSleep(s, f2.id).reason == "no-tent");
        s.inventory.Add(new ItemStack("item_tent", 1));
        var c1 = Camp.CanCampSleep(s, f2.id);
        c.Ok("火撑不到天亮不能睡，并告诉差几根柴", !c1.ok && c1.reason == "fuel" && c1.wood == 4);
        s.clock = 26 * 60;
        Camp.AddWood(s, f2.id); Camp.AddWood(s, f2.id);
        c.Ok("凌晨 2:00 添 2 根柴就够撑到天亮，可以睡", Camp.CanCampSleep(s, f2.id).ok);
        s.player.hp = 30; s.player.hunger = 70; s.pets[0].hp = 3;
        Settlement.Run(s, true);
        c.Ok("帐篷睡醒：生命回满、饱食 −20、宠物恢复，还在远征岛上", s.player.hp == 100 && s.player.hunger == 50 && s.pets.All(x => x.hp == null) && s.player.area == "expedition" && s.clock == 360);
        c.Ok("营地存档合法", Valid(s), Errs(s));
        c.Ok("家园岛不能放营火", Camp.PlaceCampfire(New(), 1, 1).reason == "home");
        var ch = Mk(); ch.inventory = new List<ItemStack>();
        var loot = Camp.ChestLoot(4242, "c0");
        c.Ok("宝箱里有 2–3 块布，结果由种子决定", loot.items["item_cloth"] >= 2 && loot.items["item_cloth"] <= 3 && Checks.J(loot) == Checks.J(Camp.ChestLoot(4242, "c0")));
        int clover0 = ch.clover;
        var o = Camp.OpenChest(ch, "c0");
        c.Ok("打开宝箱：物品进背包、四叶草 +20、记入岛屿记录", o.ok && Checks.Count(ch.inventory, "item_cloth") == loot.items["item_cloth"] && ch.clover == clover0 + 20 && ch.expedition.changes.chests.Contains("c0"));
        c.Ok("同一个宝箱不能开两次", Camp.OpenChest(ch, "c0").reason == "opened");
        var full = Mk(); full.party = new List<string>(); full.inventory = Checks.Fill(20);
        c.Ok("背包满了打不开宝箱（宝箱留着）", Camp.OpenChest(full, "c1").reason == "full" && !full.expedition.changes.chests.Contains("c1"));
        var t1 = Mk(); t1.inventory = Checks.Inv(("item_cloth", 4), ("item_wood", 6));
        c.Ok("帐篷只能在家园做（远征中拒绝，材料不扣）", Crafting.Craft(t1, "tent").reason == "station" && Checks.Count(t1.inventory, "item_cloth") == 4);
        t1.player.area = "home";
        c.Ok("回家园可以做帐篷：布 4 + 木材 6", Crafting.Craft(t1, "tent").ok && Checks.Count(t1.inventory, "item_tent") == 1 && t1.inventory.Count == 1);
        var ft = Mk(); ft.day = 5; ft.inventory = Checks.Inv(("item_tent", 1), ("item_wood", 3));
        Travel.Faint(ft, 1, 1);
        c.Ok("倒下时帐篷保留", Checks.Count(ft.inventory, "item_tent") == 1);
        c.Done();
    }

    [Test] public void 宠物探索技能()
    {
        var c = new Checks();
        var st = New();
        void SetParty(params string[] ids) => st.party = ids.Select(id => $"pet-{id}").ToList();
        SetParty("acorn"); c.Ok("只有队伍里的宠物算：橡果刺猬在队 → 能开路，不能涉水", Explore.CanClear(st) && !Explore.CanWade(st));
        SetParty("shark"); c.Ok("航海鲨在队 → 能涉水", Explore.CanWade(st));
        SetParty("fox", "starbear"); c.Eq("焰尾狐 + 星星熊仔都在队：照明不叠加，仍是 1.5 格", Night.PlayerLightTiles(st), 1.5);
        st.Pet("pet-fox").affection = 100;
        c.Eq("好感 100：照明 2.5 格", Night.PlayerLightTiles(st), 2.5);
        SetParty("pup"); c.Eq("冰蓝小狼在队：背包 24 格", Crafting.BagSlots(st), 24);
        st.Pet("pet-pup").affection = 100;
        c.Eq("冰蓝小狼好感 100：背包 26 格", Crafting.BagSlots(st), 26);
        SetParty("acorn"); c.Eq("没有寻宝宠物：地图不显示宝箱", Explore.TreasureSense(st), 0);
        SetParty("shadecat"); c.Eq("月影狐猫在队：地图显示宝箱", Explore.TreasureSense(st), 1);
        st.Pet("pet-shadecat").affection = 100;
        c.Eq("月影狐猫好感 100：还显示稀有地点", Explore.TreasureSense(st), 2);
        int ponds = 0, bonus = 0, islets = 0; bool ok = true;
        for (int i = 1; i <= 60; i++)
        {
            var isl = IslandGen.Generate(i * 104729);
            if (isl.water.Any(row => row.Any(v => v))) ponds++;
            var b = isl.chests.FirstOrDefault(ch => ch.bonus);
            if (b != null) { bonus++; if (isl.thorns.Count != 8 || !isl.thorns.All(x => Math.Max(Math.Abs(x.tx - b.tx), Math.Abs(x.ty - b.ty)) == 1)) ok = false; }
            islets += isl.resources.Count(r => r.rare);
            if (isl.resources.Any(r => isl.water[r.ty][r.tx]) || isl.pets.Any(w => isl.water[w.ty][w.tx]) || isl.camps.Any(cp => isl.water[cp.ty][cp.tx])) ok = false;
        }
        c.Ok("60 座岛：都有浅水池塘和荆棘宝箱（8 丛荆棘围一圈），东西不会放在水里", ponds == 60 && bonus == 60 && ok, $"池塘 {ponds} 荆棘宝箱 {bonus}");
        c.Ok("大部分岛上有池塘小岛雾晶（稀有）", islets >= 40, $"小岛雾晶 {islets}");
        c.Ok("不需要任何宠物技能也能拿到所有普通内容（E02 的校验把水和荆棘当墙）", IslandGen.Validate(IslandGen.Generate(20261108)) == null);
        var s2 = Checks.OnIsland(New(), 20261108);
        s2.party = new List<string> { "pet-pup" };
        c.Ok("没有橡果刺猬清不了荆棘", Explore.ClearThorn(s2, "t0").reason == "need-clear");
        s2.party = new List<string> { "pet-acorn" };
        c.Ok("橡果刺猬在队：清掉荆棘并记入岛屿记录", Explore.ClearThorn(s2, "t0").ok && s2.expedition.changes.thorns.Contains("t0"));
        c.Ok("同一丛荆棘不能清两次", Explore.ClearThorn(s2, "t0").reason == "gone");
        var isl2 = IslandGen.ApplyChanges(IslandGen.Generate(20261108), s2.expedition.changes);
        c.Ok("回到岛上清掉的荆棘还是没有、格子不再挡路", !isl2.thorns.Any(x => x.id == "t0") && isl2.thorns.Count == 7);
        c.Ok("清掉荆棘后的存档合法", Valid(s2), Errs(s2));
        var nb = Camp.ChestLoot(5, "c0"); var bb = Camp.ChestLoot(5, "c2", true);
        c.Ok("秘密宝箱奖励更好：布 3 + 雾晶 ≥2、四叶草 40", bb.items["item_cloth"] >= 3 && bb.items["item_crystal"] >= 2 && bb.clover == 40 && nb.clover == 20);
        var s3 = New();
        s3.inventory = GameData.Items.Keys.Where(id => id != "item_bigbag").Take(17).Select(id => new ItemStack(id, 1)).Concat(Enumerable.Range(0, 6).Select(i => new ItemStack($"test{i}", 2))).ToList();
        int Total(List<ItemStack> inv) => inv.Sum(x => x.count);
        int before = Total(s3.inventory), stacks = s3.inventory.Count;
        var lv = Party.Leave(s3, "pet-pup");
        c.Ok("冰蓝小狼离队：背包变回 20 格，多出的放进家园仓库，一件不少", lv.ok && s3.inventory.Count == 20 && lv.moved.Count == stacks - 20 && Total(s3.inventory) + Total(s3.storage) == before, $"{stacks} 格 → 背包 {s3.inventory.Count} + 仓库 {s3.storage?.Count}");
        var ws = New(); ws.storage = Checks.Inv(("item_wood", 9));
        c.Ok("有仓库的存档合法", Valid(ws));
        s3.inventory = s3.inventory.Where(x => GameData.Item(x.id) != null).ToList(); s3.storage = s3.storage.Where(x => GameData.Item(x.id) != null).ToList();
        bool Keep(string id) => GameData.Item(id).tool || GameData.Item(id).food != null;
        int n = Explore.DepositAll(s3, Keep);
        c.Ok("全部存入：工具和食物留在身上", n > 0 && s3.inventory.All(x => Keep(x.id)));
        var w = Explore.WithdrawAll(s3, Crafting.BagSlots(s3));
        c.Ok("全部取回：放得下的拿回来，放不下的留在仓库", s3.inventory.Count <= 20 && w.took > 0 && (w.left == 0 || s3.inventory.Count == 20));
        c.Done();
    }

    [Test] public void 新手引导与保护()
    {
        var c = new Checks();
        var s = New();
        c.Ok("新档第一个目标：去码头出发", Guide.Current(s).id == "depart");
        Travel.Depart(s, "new");
        c.Ok("出发后 → 第二个目标：采集 3 次", Guide.Check(s)?.id == "depart" && Guide.Current(s).id == "gather");
        for (int i = 0; i < 2; i++) Crafting.GatherAt(s, $"g{i}", "grass");
        c.Ok("采集 2 次还不算完成", Guide.Check(s) == null);
        Crafting.GatherAt(s, "g9", "bush");
        c.Ok("采集第 3 次完成 → 目标：做石斧", Guide.Check(s)?.id == "gather" && Guide.Current(s).id == "axe");
        s.inventory.Add(new ItemStack("item_wood", 3)); s.inventory.Add(new ItemStack("item_stone", 2));
        Crafting.Craft(s, "axe");
        c.Ok("做出石斧 → 目标：打一场", Guide.Check(s)?.id == "axe" && Guide.Current(s).id == "battle");
        var b = Battle.Create(new List<PetInstance> { s.pets[0] }, new List<PetInstance> { Checks.Pet("acorn", "gw") }, s.inventory, Checks.Const(0.5));
        Battle.ResolveTurn(b, BattleAction.Flee()); Battle.Finish(s, b);
        c.Ok("溜走不算打了一场", Guide.Check(s) == null);
        var b2 = Battle.Create(new List<PetInstance> { s.pets[0] }, new List<PetInstance> { Checks.Pet("acorn", "gw2") }, s.inventory, Checks.Const(0.5));
        int g = 0; while (b2.over == null && g++ < 30) Battle.ResolveTurn(b2, b2.needSwitch ? BattleAction.Switch(0) : BattleAction.Skill("tackle"));
        Battle.Finish(s, b2);
        c.Ok("打完一场 → 目标：天黑前回家", Guide.Check(s)?.id == "battle" && Guide.Current(s).id == "return");
        Travel.ReturnHome(s);
        c.Ok("坐飞艇回家 → 目标：睡觉", Guide.Check(s)?.id == "return" && Guide.Current(s).id == "sleep");
        Settlement.Run(s, true);
        c.Ok("睡一觉 → 新手目标全部完成，不再显示", Guide.Check(s)?.id == "sleep" && Guide.Done(s) && Guide.Current(s) == null);
        c.Ok("引导进度存档合法", Valid(s));
        var cs = New(); cs.flags.guide = new GuideState { step = 4, @base = new Dictionary<string, int>(Guide.Stats(cs)), off = false };
        Guide.Bump(cs, "campSleeps");
        c.Ok("扎营过夜也算完成「天黑前回家」", Guide.Check(cs)?.id == "return");
        var o = New(); Guide.SetOff(o, true);
        bool noGoal = Guide.Current(o) == null; Travel.Depart(o, "new");
        c.Ok("关闭新手目标后不显示、也不推进", noGoal && Guide.Check(o) == null);
        var tp = New(); tp.player.hunger = 20;
        c.Ok("饿了的提示只出现一次", (Guide.NextTip(tp)?.Contains("吃") ?? false) && Guide.NextTip(tp) == null);

        GameState Mk(int day) { var st = Checks.OnIsland(New(), 3); st.day = day; st.inventory = Checks.Inv(("item_axe", 1), ("item_wood", 12)); return st; }
        var a = Mk(3); var ra = Travel.Faint(a, 1, 1);
        c.Ok("第 3 天倒下（新手保护）：东西全部留在身上，没有失物包", ra.isProtected && ra.dropped.Count == 0 && Checks.Count(a.inventory, "item_wood") == 12 && a.expedition.lostBag == null);
        c.Ok("保护期倒下照常第二天 8:00 醒来、生命 50", a.day == 4 && a.clock == 480 && a.player.hp == 50);
        var bq = Mk(4); Travel.Faint(bq, 1, 1);
        c.Ok("第 4 天起倒下恢复正常掉落", Checks.Count(bq.inventory, "item_wood") == 0 && bq.expedition.lostBag.items[0].count == 12);
        c.Done();
    }

    [Test] public void 种田与出货()
    {
        var c = new Checks();
        c.Ok("5 种作物的种子、果实都是已定义的物品，果实都有出货价", GameData.Crops.Values.All(cr => GameData.Item(cr.seed) != null && GameData.Item(cr.crop) != null && GameData.Price(cr.crop) > cr.seedPrice));
        c.Ok("5 种作物正好是 5 只宠物的喜好食物（向日葵、星光麦等）", new[] { "item_carrot", "item_strawberry", "item_sunflower", "item_starwheat", "item_pumpkin" }.All(id => GameData.Pets.Any(p => p.food == id)));
        var s = New();
        var k = Farm.PlotKey(30, 19);
        c.Eq("没开垦的地：动作是开垦", Farm.PlotAction(s, k), "till");
        c.Ok("没开垦不能播种", Farm.Plant(s, k, "item_seed_carrot").reason == "not-tilled");
        c.Ok("有锄头：开垦", Farm.Till(s, k).ok && Farm.PlotAction(s, k) == "plant");
        int seeds0 = Checks.Count(s.inventory, "item_seed_carrot");
        c.Ok("播种萝卜：种子 −1", Farm.Plant(s, k, "item_seed_carrot").ok && Checks.Count(s.inventory, "item_seed_carrot") == seeds0 - 1 && Farm.PlotAction(s, k) == "water");
        c.Ok("同一块地不能种两次", Farm.Plant(s, k, "item_seed_carrot").reason == "occupied");
        Farm.Water(s, k);
        c.Ok("浇过水后今天不能再浇", Farm.PlotAction(s, k) == "wait" && Farm.Water(s, k).reason == "watered");
        var r = Settlement.Run(s, true);
        c.Ok("第 1 天浇了水 → 长 1 天，结算里有提示", Farm.PlotOf(s, k).days == 1 && r.lines.Any(l => l.Contains("作物长大")));
        r = Settlement.Run(s, true);
        c.Ok("没浇水 → 不长，结算提示没浇水", Farm.PlotOf(s, k).days == 1 && r.lines.Any(l => l.Contains("没浇水")));
        Farm.Water(s, k); Settlement.Run(s, true);
        Farm.Water(s, k); r = Settlement.Run(s, true);
        c.Ok("萝卜浇满 3 天成熟（可以收获）", Farm.Ripe(Farm.PlotOf(s, k)) && Farm.PlotAction(s, k) == "harvest" && r.lines.Any(l => l.Contains("可以收获")));
        c.Ok("成熟后不用再浇水", Farm.Water(s, k).reason == "ripe");
        int c0 = Checks.Count(s.inventory, "item_carrot");
        c.Ok("收获：萝卜 +1，地还是开垦好的", Farm.Harvest(s, k).ok && Checks.Count(s.inventory, "item_carrot") == c0 + 1 && Farm.PlotAction(s, k) == "plant");
        int clover0 = s.clover;
        Farm.Ship(s, "item_carrot", 1);
        c.Ok("放进出货箱：明早结算价值 25", Farm.ShippingValue(s) == 25);
        c.Ok("工具不能出货", Farm.Ship(s, "item_hoe", 1).reason == "no-price");
        r = Settlement.Run(s, true);
        c.Ok("出货收入正确：第二天四叶草 +25，出货箱清空", s.clover == clover0 + 25 && Farm.Of(s).shipping.Count == 0 && r.lines.Any(l => l.Contains("+25")));
        c.Ok("结算顺序：出货在作物生长之前", r.order.IndexOf("shipping") < r.order.IndexOf("crops"));
        Farm.Ship(s, "item_berry", 1);
        c.Ok("从出货箱取回", Farm.Unship(s, "item_berry").ok && Farm.ShippingValue(s) == 0);
        int cl = s.clover;
        c.Ok("种子摊买南瓜种子：四叶草 −30", Farm.BuySeed(s, "pumpkin", 1).ok && s.clover == cl - 30 && Checks.Count(s.inventory, "item_seed_pumpkin") == 1);
        s.clover = 5;
        c.Ok("四叶草不够买不了", Farm.BuySeed(s, "pumpkin", 1).reason == "clover");
        var noTool = New(); noTool.inventory = new List<ItemStack>();
        bool noHoe = Farm.Till(noTool, k).reason == "no-hoe";
        noTool.farm.plots[k] = new FarmPlot { tilled = true, crop = "carrot", days = 0, watered = false };
        c.Ok("没有锄头不能开垦、没有水壶不能浇水", noHoe && Farm.Water(noTool, k).reason == "no-can");
        c.Ok("农田存档合法", Valid(s), Errs(s));
        var v1 = Checks.AsJson(New()); v1["version"] = 1; v1.Remove("farm");
        v1["inventory"] = new JArray(((JArray)v1["inventory"]).Where(x => !new[] { "item_hoe", "item_can", "item_seed_carrot" }.Contains((string)x["id"])));
        var mig = SaveCodec.Decode(Checks.Raw(v1));
        c.Ok("旧存档（版本 1）读入时自动迁移：加上农田、锄头、水壶、萝卜种子", mig.ok && mig.state.version == SaveRules.SaveVersion && mig.state.farm != null && new[] { "item_hoe", "item_can", "item_seed_carrot" }.All(id => mig.state.inventory.Any(x => x.id == id)), mig.reason ?? "");
        c.Done();
    }

    [Test] public void 照顾宠物与打工()
    {
        var c = new Checks();
        var s = New();
        s.inventory.Add(new ItemStack("item_carrot", 3)); s.inventory.Add(new ItemStack("item_sunflower", 2));
        var r = PetCare.Feed(s, "pet-acorn", "item_carrot");
        c.Ok("喂最爱的食物（橡果刺猬吃萝卜）：好感 +15", r.ok && r.favourite && s.Pet("pet-acorn").affection == 15);
        c.Ok("一天只能喂一次", PetCare.Feed(s, "pet-acorn", "item_carrot").reason == "fed");
        r = PetCare.Feed(s, "pet-fox", "item_carrot");
        c.Ok("喂其他食物：好感 +5", r.ok && !r.favourite && s.Pet("pet-fox").affection == 5);
        c.Ok("向日葵人不能吃，但能喂冰蓝小狼（最爱 +15）", GameData.Item("item_sunflower").food == null && PetCare.Feed(s, "pet-pup", "item_sunflower").gain == 15);
        c.Ok("工具不能喂", PetCare.Feed(s, "pet-shark", "item_hoe").reason == "not-food");
        c.Ok("摸摸 +2，一天一次", PetCare.PetPet(s, "pet-acorn").gain == 2 && PetCare.PetPet(s, "pet-acorn").reason == "petted");
        Settlement.Run(s, true);
        c.Ok("第二天可以再喂、再摸", PetCare.Feed(s, "pet-acorn", "item_carrot").ok && PetCare.PetPet(s, "pet-acorn").ok && s.Pet("pet-acorn").affection == 34);
        var a = s.Pet("pet-acorn"); a.affection = 99;
        s.day++; PetCare.PetPet(s, "pet-acorn"); s.day--;
        c.Eq("好感最高 100", a.affection, 100);
        c.Eq("打工产量公式：基础 4、好感 50 → 6", PetCare.WorkAmount(4, 50), 6);
        c.Eq("好感 100 → 翻倍", PetCare.WorkAmount(4, 100), 8);
        c.Ok("队伍里的宠物不能打工", PetCare.SetJob(s, "pet-pup", true).reason == "party");
        var w = New();
        w.party = new List<string> { "pet-acorn" };
        foreach (var id in new[] { "pet-pup", "pet-fox", "pet-shark", "pet-shadecat", "pet-starbear" }) PetCare.SetJob(w, id, true);
        w.Pet("pet-fox").affection = 50;
        w.farm.plots["1,1"] = new FarmPlot { tilled = true, crop = "carrot" };
        w.farm.plots["2,1"] = new FarmPlot { tilled = true, crop = "carrot" };
        int clover0 = w.clover;
        var rep = Settlement.Run(w, true);
        int Has(string id) => Checks.Count(w.storage, id);
        c.Ok("冰蓝小狼伐木：仓库木材 +4", Has("item_wood") == 4);
        c.Ok("焰尾狐挖矿（好感 50）：石头 +6、雾晶 +1", Has("item_stone") == 6 && Has("item_crystal") == 1);
        c.Ok("航海鲨钓鱼：鱼 +2", Has("item_fish") == 2);
        c.Ok("月影狐猫寻宝：四叶草 +10", w.clover == clover0 + 10);
        c.Ok("星星熊仔浇水：早上把地都浇了（作物生长之后浇，算新的一天）", w.farm.plots.Values.All(p => p.watered && p.days == 0));
        c.Ok("结算面板列出每只宠物带回的东西", rep.lines.Count(l => Regex.IsMatch(l, "(伐木|挖矿|钓鱼|寻宝|浇水)：")) == 5, string.Join(" / ", rep.lines));
        c.Ok("打工的宠物加入队伍后自动停止打工", Party.Join(w, "pet-pup").ok && w.Pet("pet-pup").job == false);
        var bnd = New(); bnd.party = new List<string> { "pet-fox" };
        for (int i = 0; i < 7; i++) PetCare.BondFromBattle(bnd);
        c.Eq("一起打赢对战每次 +1，一天最多 +5", bnd.Pet("pet-fox").affection, 5);
        PetCare.BondFromTrip(bnd); PetCare.BondFromTrip(bnd); PetCare.BondFromTrip(bnd);
        c.Eq("一起完成远征每次 +2，一天最多 +5", bnd.Pet("pet-fox").affection, 10);
        c.Ok("照顾记录存档合法", Valid(w) && Valid(s));
        c.Done();
    }

    [Test] public void 每日任务()
    {
        var c = new Checks();
        var s = New();
        var d1 = Daily.Ensure(s);
        c.Ok("每天 3 个不同的任务", d1.tasks.Count == 3 && d1.tasks.Select(x => x.id).Distinct().Count() == 3);
        var copy = s.Clone(); copy.daily = null;
        c.Ok("同一天同一存档任务固定（刷新也一样）", Checks.J(Daily.Ensure(copy).tasks) == Checks.J(d1.tasks));
        c.Ok("第 1 天不会出「收获」「抓宠物」（还做不到）", !d1.tasks.Any(x => x.id == "harvest" || x.id == "catches"));
        s.daily.tasks = new List<DailyTask>
        {
            new DailyTask { id = "pet", stat = "pet", n = 3, text = "摸摸宠物 3 次" }, new DailyTask { id = "feed", stat = "feed", n = 2, text = "喂宠物 2 次" }, new DailyTask { id = "craft", stat = "craft", n = 1, text = "制作 1 件东西" },
        };
        int c0 = s.clover;
        PetCare.PetPet(s, "pet-acorn"); PetCare.PetPet(s, "pet-fox");
        c.Ok("进度按今天的计数算（摸了 2 次 → 2/3），还没完成", Daily.Progress(s, s.daily.tasks[0]) == 2 && Daily.Check(s).done.Count == 0);
        PetCare.PetPet(s, "pet-pup");
        var r = Daily.Check(s);
        c.Ok("完成一个任务：自动发 20 四叶草", r.done.Count == 1 && s.clover == c0 + 20);
        c.Ok("同一个任务不会重复发奖", Daily.Check(s).done.Count == 0 && s.clover == c0 + 20);
        s.inventory.Add(new ItemStack("item_carrot", 2));
        PetCare.Feed(s, "pet-acorn", "item_carrot"); PetCare.Feed(s, "pet-fox", "item_carrot");
        s.inventory.Add(new ItemStack("item_wood", 2)); s.inventory.Add(new ItemStack("item_grass", 2));
        Crafting.Craft(s, "torch");
        int Seeds() => s.inventory.Where(x => GameData.Item(x.id).tag == "种子").Sum(x => x.count);
        int seedsBefore = Seeds();
        r = Daily.Check(s);
        c.Ok("三个都完成：再得 30 四叶草和一包种子", r.done.Count == 2 && r.bonus && r.bonusClover == 30 && s.clover == c0 + 20 * 3 + 30 && Seeds() == seedsBefore + 1);
        c.Ok("全勤奖只发一次", !Daily.Check(s).bonus);
        Settlement.Run(s, true);
        var d2 = Daily.Ensure(s);
        c.Ok("睡醒后任务刷新，进度从 0 开始", d2.day == s.day && d2.tasks.All(x => !x.done && Daily.Progress(s, x) == 0));
        c.Ok("每日任务存档合法", Valid(s), Errs(s));
        var known = new[] { "water", "feed", "pet", "gather", "plant", "craft", "wins", "chests", "shipped", "harvest", "catches", "talk" };
        c.Ok("任务池里的计数名都有系统在累加", Daily.Pool.All(x => known.Contains(x.stat)));
        c.Done();
    }

    [Test] public void 宠物养成()
    {
        var c = new Checks();
        var s = New();
        var fox = s.Pet("pet-fox");
        fox.level = 12; fox.affection = 29;
        s.inventory.Add(new ItemStack("item_evo_fire", 1));
        var r = Growth.TryEvolve(s, "pet-fox");
        c.Ok("P05 等级 12、好感 29、有火之石 → 不能进化，提示还差好感", !r.ok && string.Join(",", r.missing) == "affection");
        fox.affection = 30;
        s.inventory = s.inventory.Where(x => x.id != "item_evo_fire").ToList();
        c.Ok("没有进化石不能进化", string.Join(",", Growth.TryEvolve(s, "pet-fox").missing) == "stone");
        s.inventory.Add(new ItemStack("item_evo_fire", 1));
        r = Growth.TryEvolve(s, "pet-fox");
        c.Ok("P01→P02 进化：火之石 −1，攻击 24 → 30，名字变灯焰狐，学会狐火灯笼", r.ok && Checks.Count(s.inventory, "item_evo_fire") == 0 && PetMath.CalcStats(fox).atk == 30 && PetMath.DisplayName(fox) == "灯焰狐" && PetMath.BattleSkills(fox).Contains("foxlantern"));
        c.Ok("进化后等级、好感不变", fox.level == 12 && fox.affection == 30);
        c.Ok("已进化不能再进化", Growth.TryEvolve(s, "pet-fox").missing.Contains("evolved"));
        var a = s.Pet("pet-acorn"); a.stars = 1;
        var dup = a.Clone(); dup.uid = "dup-acorn"; dup.stars = 4; s.pets.Add(dup);
        s.pets.Remove(dup); bool onlyOne = Growth.ConvertToCrystal(s, "pet-acorn").reason == "only-one"; s.pets.Add(dup);
        c.Ok("只有一只时不能转结晶", onlyOne);
        r = Growth.ConvertToCrystal(s, "dup-acorn");
        c.Ok("重复的橡果刺猬（4 星）转成 4 个结晶，宠物移除", r.ok && r.gained == 4 && Growth.CrystalsOf(s, "acorn") == 4 && !s.pets.Any(p => p.uid == "dup-acorn"));
        s.crystals["acorn"] = 6;
        Growth.StarUp(s, "pet-acorn"); Growth.StarUp(s, "pet-acorn");
        c.Ok("P06 1 星 + 6 个结晶连升两次 → 3 星，结晶剩 0", a.stars == 3 && Growth.CrystalsOf(s, "acorn") == 0);
        c.Ok("结晶不够不能升星", Growth.StarUp(s, "pet-acorn").reason == "crystals");
        a.stars = 5; c.Ok("5 星封顶", Growth.StarUp(s, "pet-acorn").reason == "max");
        Growth.DexCatch(s, new PetInstance { species = "shark", shiny = true });
        c.Ok("图鉴分别记录普通色和异色", s.dex["shark"].shiny && !s.dex["shark"].caught);
        s.inventory.Add(new ItemStack("item_book_ember", 1)); s.inventory.Add(new ItemStack("item_book_bubble", 1)); s.inventory.Add(new ItemStack("item_book_heal", 1));
        c.Ok("P08 用火属性技能书给橡果刺猬（森） → 属性不符", Growth.LearnSkill(s, "pet-acorn", "item_book_ember", 0).reason == "element");
        c.Ok("状态技能书（治愈之歌）谁都能学", Growth.CanLearn(s, "pet-acorn", "item_book_heal").ok);
        c.Ok("已经会的技能不能再学", Growth.LearnSkill(s, "pet-shark", "item_book_bubble", 1).reason == "known");
        var shark = s.Pet("pet-shark");
        r = Growth.LearnSkill(s, "pet-shark", "item_book_heal", 0);
        c.Ok("学会：替换第 1 格，技能书 −1", r.ok && shark.skills[0] == "heal" && Checks.Count(s.inventory, "item_book_heal") == 0);
        c.Ok("进化技能那一格不能被替换（只能换前 3 格）", Growth.LearnSkill(s, "pet-fox", "item_book_ember", 3).reason != null && PetMath.BattleSkills(fox).Contains("foxlantern"));
        var f2 = New(); var fx = f2.Pet("pet-fox"); fx.affection = 100;
        c.Ok("P11 未进化的焰尾狐好感 100 → 化形不可用，提示先进化", Growth.FormCheck(f2, "pet-fox").missing.Contains("evolved"));
        fx.evolved = true;
        c.Ok("没有化形铃也不行", string.Join(",", Growth.FormCheck(f2, "pet-fox").missing) == "bell");
        c.Ok("只有焰尾狐能化形", string.Join(",", Growth.FormCheck(f2, "pet-pup").missing) == "species");
        f2.inventory.Add(new ItemStack("item_foxwick", 3));
        Town.Accept(f2, "lumi_wish");
        c.Ok("3 个狐火灯芯交给小镇的露米，换来化形铃（心愿任务）", Town.Complete(f2, "lumi_wish").ok && Checks.Count(f2.inventory, "item_fox_bell") == 1 && Checks.Count(f2.inventory, "item_foxwick") == 0);
        var before = Checks.J(PetMath.CalcStats(fx));
        c.Ok("学会化形：化形铃 −1，可以切换", Growth.UnlockForm(f2, "pet-fox").ok && fx.canTransform && Checks.Count(f2.inventory, "item_fox_bell") == 0);
        c.Ok("P10 切换成人形态：所有数值与切换前完全相同", Growth.ToggleForm(f2, "pet-fox").form == "human" && Checks.J(PetMath.CalcStats(fx)) == before);
        c.Ok("P10 化形状态存进存档", SaveCodec.Decode(SaveCodec.Encode(f2)).state.Pet("pet-fox").form == "human");
        c.Ok("没解锁不能切换", Growth.ToggleForm(New(), "pet-fox").reason == "locked");
        var lootB = Camp.ChestLoot(77, "c2", true);
        c.Ok("秘密宝箱必掉 1 块进化石", lootB.items.Keys.Any(k => Crafting.EvoStones.Contains(k)));
        int stones = 0, books = 0;
        for (int i = 0; i < 400; i++) { var L = Camp.ChestLoot(i, "c0"); if (L.items.Keys.Any(k => Crafting.EvoStones.Contains(k))) stones++; if (L.items.Keys.Any(k => GameData.Item(k).book != null)) books++; }
        c.Ok("普通宝箱约 15% 进化石、约 20% 技能书", stones > 30 && stones < 95 && books > 50 && books < 115, $"进化石 {stones}/400 技能书 {books}/400");
        c.Ok("养成后的存档合法", Valid(s) && Valid(f2), Errs(s));
        c.Done();
    }

    [Test] public void 风铃小镇()
    {
        var c = new Checks();
        var s = New();
        c.Ok("3 位居民、6 个任务，任务要的东西和奖励都是已定义的物品", GameData.Npcs.Count == 3 && GameData.Quests.Count == 6
            && GameData.Quests.All(q => q.need.Keys.All(k => k == "party" || GameData.Item(k) != null) && (q.reward.items ?? new Dictionary<string, int>()).Keys.All(k => GameData.Item(k) != null)));
        var a = Town.Talk(s, "granny");
        c.Ok("聊天：第一次 +1 好感，一天只加一次", a.gain == 1 && Town.Talk(s, "granny").gain == 0 && Town.FriendOf(s, "granny") == 1 && !string.IsNullOrEmpty(a.line));
        s.inventory.Add(new ItemStack("item_soup", 1)); s.inventory.Add(new ItemStack("item_stone", 1)); s.inventory.Add(new ItemStack("item_berry", 3));
        var r = Town.Gift(s, "granny", "item_soup");
        c.Ok("送最爱的东西（铃奶奶 ← 蔬菜汤）：+10", r.ok && r.taste == "love" && Town.FriendOf(s, "granny") == 11);
        c.Ok("同一位居民一天只能送一次", Town.Gift(s, "granny", "item_berry").reason == "gifted");
        bool neutral = Town.Gift(s, "ali", "item_berry").taste == "neutral"; s.day++;
        c.Ok("讨厌的东西会扣好感（阿栗 ← 草就会，铃奶奶 ← 石头）", neutral && Town.Gift(s, "granny", "item_stone").gain == -3);
        c.Ok("工具不能送", Town.Gift(s, "lumi", "item_hoe").reason == "not-giftable");
        c.Eq("一开始铃奶奶只给第一个任务（第二个要先完成第一个）", string.Join(",", Town.Offers(s, "granny").Select(q => q.id)), "granny_carrot");
        c.Ok("接任务", Town.Accept(s, "granny_carrot").ok && Town.QuestState(s, "granny_carrot") == "active" && Town.Offers(s, "granny").Count == 0);
        c.Ok("萝卜不够时列出还差多少", Town.Missing(s, "granny_carrot").FirstOrDefault()?.need == 5 && Town.Complete(s, "granny_carrot").reason == "missing");
        s.inventory.Add(new ItemStack("item_carrot", 6));
        int cl = s.clover, fr = Town.FriendOf(s, "granny"), car = Checks.Count(s.inventory, "item_carrot");
        var done = Town.Complete(s, "granny_carrot");
        c.Ok("交任务：扣 5 根萝卜、四叶草 +60、好感 +10", done.ok && Checks.Count(s.inventory, "item_carrot") == car - 5 && s.clover == cl + 60 && Town.FriendOf(s, "granny") == fr + 10);
        c.Ok("任务不会重复领奖", Town.Complete(s, "granny_carrot").reason == "done" && s.clover == cl + 60);
        c.Ok("完成第一个任务后，第二个要 2 颗心才开放（docs/11 ②）", Town.FriendOf(s, "granny") < 40 && Town.Offers(s, "granny").Count == 0 && Town.HeartLocked(s, "granny")?.id == "granny_fish" && Town.Accept(s, "granny_fish").reason == "hearts");
        s.town.friend["granny"] = 40;
        c.Ok("到 2 颗心：解锁下一个任务", string.Join(",", Town.Offers(s, "granny").Select(q => q.id)) == "granny_fish" && Town.HeartLocked(s, "granny") == null);
        s.player.area = "home"; s.inventory.Add(new ItemStack("item_carrot", 2)); s.inventory.Add(new ItemStack("item_pumpkin", 1)); s.inventory.Add(new ItemStack("item_fish", 3));
        c.Ok("没学会之前做不了蔬菜汤", Crafting.Craft(s, "soup").reason == "locked");
        Town.Accept(s, "granny_fish"); Town.Complete(s, "granny_fish");
        c.Ok("铃奶奶教会蔬菜汤后可以在家园做", s.recipes.Contains("soup") && Crafting.Craft(s, "soup").ok && Checks.Count(s.inventory, "item_soup") == 1);
        s.party = new List<string> { "pet-pup" };
        Town.Accept(s, "lumi_shadecat");
        c.Ok("「带月影狐猫来」：队伍里没有就交不了", Town.Missing(s, "lumi_shadecat").FirstOrDefault()?.party == "shadecat");
        s.party = new List<string> { "pet-shadecat" };
        c.Ok("带上月影狐猫就能交，得到暗影弹技能书", Town.Complete(s, "lumi_shadecat").ok && Checks.Count(s.inventory, "item_book_shadow") == 1);
        var bag = New(); bag.party = new List<string>(); bag.recipes = new List<string> { "bigbag" }; bag.inventory = Checks.Inv(("item_cloth", 6), ("item_crystal", 2));
        c.Ok("做出大背包：背包 20 → 28 格", Crafting.BagSlots(bag) == 20 && Crafting.Craft(bag, "bigbag").ok && Crafting.BagSlots(bag) == 28);
        var st0 = Town.Stock(s);
        c.Ok("杂货铺：种子、布、烤鱼等 + 每天 2 本轮换的技能书", st0.Count(x => GameData.Item(x.id).book != null) == 2 && st0.Any(x => x.id == "item_cloth"));
        c.Ok("同一天商品固定", Checks.J(Town.Stock(s)) == Checks.J(st0));
        s.clover = 100;
        c.Ok("买布：四叶草 −30", Town.Buy(s, "item_cloth").ok && s.clover == 70 && Town.Buy(s, "item_evo_fire").reason == "not-sold");
        c.Ok("进化石不卖（只能远征获得）", !st0.Any(x => Crafting.EvoStones.Contains(x.id)));
        var tv = New(); tv.clock = 9 * 60;
        c.Ok("过吊桥去小镇：10 分钟", Travel.GoTown(tv).ok && tv.player.area == "town" && tv.clock == 9 * 60 + 10);
        c.Ok("从小镇回家园：10 分钟，出现在吊桥边", Travel.LeaveTown(tv).ok && tv.player.area == "home" && tv.flags.arriveAt == "bridge");
        var bt = new GameState { day = 1, clock = 23 * 60 + 50, player = new PlayerState { area = "town" } };
        c.Ok("在小镇待到 24:00 也会睡着（小镇是安全区）", new GameClock().Advance(bt, 11 * GameTime.MsPerGameMin).Any(e => e.type == "bedtime"));
        var townSave = New(); townSave.player.area = "town";
        c.Ok("小镇存档合法", Valid(s) && Valid(townSave), Errs(s));
        var v2 = Checks.AsJson(New()); v2["version"] = 2; v2.Remove("town"); v2.Remove("recipes");
        var m2 = SaveCodec.Decode(Checks.Raw(v2));
        c.Ok("旧存档（版本 2）自动迁移：补上小镇和配方记录", m2.ok && m2.state.town != null && m2.state.recipes != null);
        c.Done();
    }

    [Test] public void 扩建与修桥_布置小屋()
    {
        var c = new Checks();
        var s = New();
        c.Eq("扩建：四叶草和材料不够 → 列出还差什么", string.Join(",", Progress.BuyExpansion(s).missing.Select(m => m.id)), "clover,item_wood,item_stone");
        s.clover = 500; s.inventory.Add(new ItemStack("item_wood", 30)); s.inventory.Add(new ItemStack("item_stone", 20));
        var r = Progress.BuyExpansion(s);
        c.Ok("扩建：扣 400 四叶草、木材 20、石头 20，状态记下", r.ok && s.clover == 100 && Checks.Count(s.inventory, "item_wood") == 10 && Checks.Count(s.inventory, "item_stone") == 0 && s.world.expanded);
        c.Ok("扩建只能买一次，材料只扣一次", Progress.BuyExpansion(s).reason == "done" && s.clover == 100);
        var away = New(); away.player.area = "town"; away.clover = 999;
        c.Ok("不在家园不能买地", Progress.BuyExpansion(away).reason == "away");
        var b = New(); b.clover = 300; b.inventory.Add(new ItemStack("item_wood", 50)); b.inventory.Add(new ItemStack("item_stone", 30)); b.inventory.Add(new ItemStack("item_cloth", 5));
        c.Ok("修桥要先完成阿栗的「工坊的木料」", Progress.RepairBridge(b).reason == "ali" && !b.world.bridge);
        b.town.quests["ali_wood"] = "done";
        r = Progress.RepairBridge(b);
        c.Ok("修桥：扣 200 四叶草、木材 50、石头 30、布 5，桥修好", r.ok && b.clover == 100 && Checks.Count(b.inventory, "item_wood") == 0 && Checks.Count(b.inventory, "item_cloth") == 0 && b.world.bridge);
        c.Ok("桥只修一次", Progress.RepairBridge(b).reason == "done" && b.clover == 100);
        c.Ok("扩建和修桥的状态存档后还在", SaveCodec.Decode(SaveCodec.Encode(b)).state.world.bridge);
        var v3 = Checks.AsJson(New()); v3["version"] = 3; v3.Remove("world");
        var m3 = SaveCodec.Decode(Checks.Raw(v3));
        c.Ok("旧存档（版本 3）自动迁移：补上扩建 / 修桥状态", m3.ok && m3.state.world != null && !m3.state.world.expanded && m3.state.version == SaveRules.SaveVersion);

        c.Ok("6 件家具都能在家园工作台做", new[] { "chair", "table", "plant", "rug", "shelf", "lamp" }.All(k => GameData.Recipes.Any(rc => rc.@out == $"item_furn_{k}" && rc.station == "workbench") && GameData.Item($"item_furn_{k}") != null));
        var h = New();
        h.inventory.AddRange(Checks.Inv(("item_furn_table", 2), ("item_furn_chair", 1), ("item_furn_rug", 1), ("item_furn_lamp", 1)));
        var pr = House.Place(h, "item_furn_table", 4, 3);
        c.Ok("摆木桌（2×1）：背包 −1，记进房间", pr.ok && Checks.Count(h.inventory, "item_furn_table") == 1 && House.Of(h).items.Count == 1);
        c.Ok("不能和别的家具重叠", House.Place(h, "item_furn_chair", 5, 3).reason == "overlap");
        c.Ok("床和门口不能放", House.Place(h, "item_furn_chair", 1, 1).reason == "reserved" && House.Place(h, "item_furn_chair", 5, 7).reason == "reserved");
        c.Ok("超出房间放不下", House.Place(h, "item_furn_table", 11, 2).reason == "outside");
        c.Ok("地毯可以铺在家具下面（家具放在地毯上）", House.Place(h, "item_furn_rug", 4, 3).ok && House.Place(h, "item_furn_chair", 5, 4).ok);
        c.Ok("地毯不挡路，家具挡路", !House.SolidCells(h).Contains((4, 4)) && House.SolidCells(h).Contains((5, 4)));
        int tbl = House.Of(h).items.FindIndex(it => it.id == "item_furn_table");
        c.Ok("旋转木桌：2×1 → 1×2", House.Rotate(h, tbl).ok && House.Footprint("item_furn_table", House.Of(h).items[tbl].rot).h == 2);
        var x = New(); x.inventory.AddRange(Checks.Inv(("item_furn_table", 1), ("item_furn_chair", 1))); House.Place(x, "item_furn_table", 3, 3); House.Place(x, "item_furn_chair", 3, 4);
        c.Ok("旋转后会撞到别的东西就不让转", House.Rotate(x, 0).reason == "overlap");
        c.Ok("移动到空位", House.Move(h, tbl, 8, 2).ok && House.Of(h).items[tbl].x == 8);
        c.Ok("移动到有东西的地方不行", House.Move(h, tbl, 5, 4).reason == "overlap");
        int n0 = House.Of(h).items.Count;
        c.Ok("收回：回到背包", House.PickUp(h, tbl).ok && House.Of(h).items.Count == n0 - 1 && Checks.Count(h.inventory, "item_furn_table") == 2);
        c.Ok("点格子能找到上面的家具（家具优先于地毯）", House.Of(h).items[House.ItemAt(h, 5, 4)].id == "item_furn_chair" && House.Of(h).items[House.ItemAt(h, 4, 4)].id == "item_furn_rug");
        c.Ok("布置存档合法、读回来一样", Valid(h) && Checks.J(SaveCodec.Decode(SaveCodec.Encode(h)).state.house) == Checks.J(h.house), Errs(h));
        var v4 = Checks.AsJson(New()); v4["version"] = 4; v4.Remove("house");
        c.Ok("旧存档（版本 4）自动迁移：补上空房间", SaveCodec.Decode(Checks.Raw(v4)).state?.house?.items.Count == 0);
        var tv = New();
        bool enter = Travel.EnterHouse(tv).ok && tv.player.area == "house" && tv.clock == 360;
        c.Ok("进屋 / 出门不花时间，出门站在小屋门口", enter && Travel.LeaveHouse(tv).ok && tv.flags.arriveAt == "house");
        c.Done();
    }

    [Test] public void 开局选宠物()
    {
        var c = new Checks();
        c.Eq("开局三选一：橡果刺猬 / 航海鲨 / 焰尾狐（docs/02 第 2 节）", string.Join(",", GameData.Starters), "acorn,shark,fox");
        c.Ok("三只开局宠物的探索技能、打工都不一样（各有用处）", GameData.Starters.Select(id => GameData.Species(id).explore).Distinct().Count() == 3 && GameData.Starters.Select(id => GameData.Species(id).work).Distinct().Count() == 3);
        bool ok = GameData.Starters.All(id =>
        {
            var st = SaveRules.NewGameState(1, starter: id);
            return st.pets.Count == 1 && st.pets[0].species == id && st.pets[0].level == SaveRules.StarterLevel && string.Join(",", st.party) == $"pet-{id}" && st.flags.starter == id && Valid(st);
        });
        c.Ok($"选了谁就只带谁：1 只宠物、{SaveRules.StarterLevel} 级、在队伍里、存档合法", ok);
        var s = SaveRules.NewGameState(1, starter: "shark");
        c.Ok("开局存档读回来一样", Checks.J(SaveCodec.Decode(SaveCodec.Encode(s)).state.pets) == Checks.J(s.pets));
        bool threw = false; try { SaveRules.NewGameState(1, starter: "shadecat"); } catch { threw = true; }
        c.Ok("名单外的宠物不能当开局宠物", threw);
        c.Ok("不选宠物 = 演示开局（6 只，自动检查用）", New().pets.Count == GameData.Pets.Count && New().pets.All(x => x.level == 1));
        var pool = GameData.Pets.Select(x => x.id).ToList();
        double WinRate(string st, string foeId, int day)
        {
            int win = 0;
            for (int i = 0; i < 100; i++)
            {
                var r = new Mulberry32((long)i * 7919 + 13); Func<double> rng = r.Next;
                var me = PetMath.CreateStarter(st, SaveRules.StarterLevel, "me");
                var foe = Battle.MakeWildGroup(foeId, PetMath.WildLevel(day, rng), i, 0, day, pool);
                var b = Battle.Create(new List<PetInstance> { me }, foe, new List<ItemStack>(), rng);
                for (int k = 0; k < 60 && b.over == null; k++)
                {
                    var m = b.me.mons[b.me.active]; var f = b.foe.mons[b.foe.active];
                    var best = m.skills.Where(id => m.uses[id] > 0).Select((id, j) => (id, j, d: Battle.ExpectedDamage(m, f, id))).OrderByDescending(t => t.d).ThenBy(t => t.j).First().id;
                    Battle.ResolveTurn(b, BattleAction.Skill(best));
                }
                if (b.over == "win") win++;
            }
            return win / 100.0;
        }
        var weakTo = new Dictionary<string, string> { { "acorn", "火" }, { "shark", "森" }, { "fox", "水" } };
        var counter = new Dictionary<string, string> { { "acorn", "fox" }, { "shark", "acorn" }, { "fox", "shark" } };
        var rows = GameData.Starters.Select(st => GameData.Pets.Where(x => x.element != weakTo[st]).Select(x => WinRate(st, x.id, 1)).ToList()).ToList();
        c.Ok("只有开局宠物：第 1 天打不克制自己的野生宠物，每种胜率都 ≥ 80%", rows.All(r => r.All(w => w >= 0.8)), Checks.J(rows));
        var hard = GameData.Starters.Select(st => WinRate(st, counter[st], 1)).ToList();
        c.Ok("碰到克制自己的属性仍然吃力（胜率 < 50%，属性相克有意义）", hard.All(w => w < 0.5), Checks.J(hard));
        c.Done();
    }

    [Test] public void 好感节奏与心意礼物()
    {
        var c = new Checks();
        var s = New();
        s.inventory.Add(new ItemStack("item_berry", 9));
        Town.GiftResult G() => Town.Gift(s, "ali", "item_berry");
        c.Ok("第 1 天送礼成功，同一天不能再送", G().ok && G().reason == "gifted" && Town.GiftsLeft(s, "ali") == 1);
        s.day = 2;
        c.Ok("第 2 天还能送（本周第 2 次）", G().ok && Town.GiftsLeft(s, "ali") == 0);
        s.day = 3;
        c.Ok("第 3 天：本周已经送满 2 次，不能再送", G().reason == "week");
        c.Ok("别的居民不受影响", Town.Gift(s, "lumi", "item_berry").ok);
        s.day = 8;
        c.Ok("第 8 天进入新的一周，又能送 2 次", Town.GiftsLeft(s, "ali") == 2 && G().ok);
        var h = New();
        h.town.friend["granny"] = 59;
        int seeds = Checks.Count(h.inventory, "item_seed_pumpkin");
        var t1 = Town.Talk(h, "granny");
        c.Ok("聊天到 60（3 颗心）：铃奶奶送南瓜种子 ×5，台词换成送礼的话", t1.present?.hearts == 3 && Checks.Count(h.inventory, "item_seed_pumpkin") == seeds + 5 && t1.line.Contains("南瓜"));
        h.day = 2;
        c.Ok("3 颗心礼物只送一次", Town.Talk(h, "granny").present == null && Checks.Count(h.inventory, "item_seed_pumpkin") == seeds + 5);
        h.town.friend["granny"] = 100;
        var p5 = Town.ClaimHeartGift(h, "granny");
        c.Ok("5 颗心：送专属家具「小镇风铃」，之后没有了", p5?.hearts == 5 && Checks.Count(h.inventory, "item_furn_chime") == 1 && Town.ClaimHeartGift(h, "granny") == null);
        var jump = New(); jump.town.friend["ali"] = 100;
        var j1 = Town.ClaimHeartGift(jump, "ali"); var j2 = Town.ClaimHeartGift(jump, "ali");
        c.Ok("一下子从 0 到 5 颗心：两份礼物按顺序都能拿到（书架、小木马）", j1?.hearts == 3 && j2?.hearts == 5 && Checks.Count(jump.inventory, "item_furn_shelf") == 1 && Checks.Count(jump.inventory, "item_furn_horse") == 1);
        var full = New(); full.town.friend["lumi"] = 60;
        var keys = GameData.Items.Keys.ToList();
        full.inventory = Enumerable.Range(0, Crafting.BagSlots(full)).Select(i => new ItemStack(keys[i], 1)).Where(x => x.id != "item_book_heal").ToList();
        while (full.inventory.Count < Crafting.BagSlots(full)) full.inventory.Add(new ItemStack("item_wood", 1));
        c.Ok("背包满了：礼物先不给，下次再给（不会丢）", Town.ClaimHeartGift(full, "lumi")?.full == true && !(full.town.heartGifts != null && full.town.heartGifts.TryGetValue("lumi", out var got) && got.Contains(3)));
        c.Ok("3 份专属家具都能摆进小屋", new[] { "item_furn_chime", "item_furn_horse", "item_furn_petbed" }.All(id => House.IsFurniture(id) && GameData.Item(id)?.tag == "家具") && House.Footprint("item_furn_petbed", 0).w == 2);
        c.Ok("带送礼周记录的存档合法、读回一样", Valid(s) && Checks.J(SaveCodec.Decode(SaveCodec.Encode(s)).state.town) == Checks.J(s.town));
        c.Done();
    }

    [Test] public void 野外扔网_偷袭_快速战斗()
    {
        var c = new Checks();
        c.Ok("每种宠物都有性格（胆小 / 好斗）", GameData.Pets.All(x => Stealth.Temper.TryGetValue(x.id, out var t) && (t == "shy" || t == "bold")));
        double R0 = Stealth.Radius;
        c.Ok("朝向判定：正前方 0°、正后方 180°", Math.Abs(Stealth.AngleFromFacing(1, 0, 10, 0)) < 1e-9 && Math.Abs(Stealth.AngleFromFacing(1, 0, -10, 0) - Math.PI) < 1e-9);
        double front = Stealth.NoticeStep(0, R0 / 2, 0, 1), back = Stealth.NoticeStep(0, R0 / 2, Math.PI, 1);
        c.Ok("发现条演算：半径一半处站在正前方 1 秒 = 0.6 × 1.5 = 0.9；正后方 0.12 × 1.5 = 0.18", Math.Abs(front - 0.9) < 1e-9 && Math.Abs(back - 0.18) < 1e-9, $"{front} {back}");
        double sneakBack = Stealth.NoticeStep(0, R0 / 2, Math.PI, 1, true, true, true);
        c.Ok("从背后悄悄走、躲在草丛边、夜里：涨得很慢（0.18 × 0.45 × 0.5 × 0.7 ≈ 0.028 / 秒）", Math.Abs(sneakBack - 0.18 * 0.45 * 0.5 * 0.7) < 1e-9);
        c.Ok("离开范围后发现条慢慢回落", Stealth.NoticeStep(0.5, R0 + 1, 0, 1) == 0.2 && Stealth.NoticeStep(0.1, R0 + 1, 0, 1) == 0);
        c.Ok("满了算「发现你了」；没满时从背后算「背后」", Stealth.StealthOf(1, Math.PI) == "seen" && Stealth.StealthOf(0.5, Math.PI) == "back" && Stealth.StealthOf(0.5, 0.3) == "unaware");
        double rBack = Stealth.FieldCatchRate("acorn", "item_net_grass", "back"), rSeen = Stealth.FieldCatchRate("acorn", "item_net_grass", "seen"), rVine = Stealth.FieldCatchRate("acorn", "item_net_vine", "back");
        c.Ok("野外扔网成功率（满血）：橡果刺猬草编网 被发现 15%、背后 37.5%、藤编网背后 56.25%", Math.Abs(rSeen - 0.15) < 1e-9 && Math.Abs(rBack - 0.375) < 1e-9 && Math.Abs(rVine - 0.5625) < 1e-9);
        c.Ok("先用草编网，只有藤编网时用藤编网", Stealth.PickNet(Checks.Inv(("item_net_vine", 1), ("item_net_grass", 2))) == "item_net_grass" && Stealth.PickNet(Checks.Inv(("item_net_vine", 1))) == "item_net_vine" && Stealth.PickNet(new List<ItemStack>()) == null);
        var s = SaveRules.NewGameState(1, starter: "fox");
        s.expedition = new ExpeditionState { seed = 7 };
        var wild = PetMath.CreatePet("acorn", 2, new Mulberry32(5).Next, uid: "wild-3-0");
        s.inventory = s.inventory.Where(x => !x.id.StartsWith("item_net")).ToList();
        c.Ok("没有网不能扔", Battle.FieldCatch(s, wild, "item_net_grass", "back", 0, "w3").reason == "no-net");
        s.inventory.Add(new ItemStack("item_net_grass", 2));
        var miss = Battle.FieldCatch(s, wild, "item_net_grass", "back", 0.99, "w3");
        c.Ok("扔失败：网用掉 1 张，宠物没抓到、岛上记录不变", miss.ok && !miss.caught && Checks.Count(s.inventory, "item_net_grass") == 1 && s.pets.Count == 1 && s.expedition.changes.pets.Count == 0);
        int lead0 = s.pets[0].level, exp0 = s.pets[0].exp;
        var hit = Battle.FieldCatch(s, wild, "item_net_grass", "back", 0, "w3");
        c.Ok("扔中：抓到橡果刺猬，进队伍、进图鉴，岛上记下这只", hit.caught && s.pets.Count == 2 && s.party.Count == 2 && (s.dex?["acorn"].caught ?? false) && s.expedition.changes.pets.Contains("w3") && hit.summary.caught.joined && !hit.summary.caught.duplicate);
        c.Ok("野外抓到也给领队经验（8 × 对方等级）", hit.summary.exp[0].amount == 16 && (s.pets[0].exp != exp0 || s.pets[0].level != lead0));
        c.Ok("统计：抓到 +1、背后抓到 +1（图鉴调查要用）", Guide.Stat(s, "catches") == 1 && Guide.Stat(s, "backCatches") == 1 && Guide.Stat(s, "throws") == 2, Checks.J(s.flags.stats));
        var gs = SaveRules.NewGameState(1, starter: "fox"); gs.flags.guide = new GuideState { step = 3, @base = new Dictionary<string, int> { { "battles", 0 }, { "catches", 0 } } }; gs.flags.stats = new Dictionary<string, int> { { "catches", 1 } };
        c.Ok("新手目标「打一场」：野外抓到一只也算完成", Guide.Check(gs)?.id == "battle");
        var half = Checks.Const(0.5);
        var amb = Battle.Create(new List<PetInstance> { Checks.Pet("fox", "me") }, new List<PetInstance> { Checks.Pet("shark", "w") }, new List<ItemStack>(), half, true);
        var e1 = Battle.ResolveTurn(amb, BattleAction.Skill("tackle")).events; var e2 = Battle.ResolveTurn(amb, BattleAction.Skill("tackle")).events;
        c.Ok("偷袭：第 1 回合对方吓了一跳不能行动，第 2 回合正常", !e1.Any(e => e.t == "use" && e.side == "foe") && e1.Any(e => e.t == "surprised") && e2.Any(e => e.t == "use" && e.side == "foe"));
        var ab = Battle.Create(new List<PetInstance> { Checks.Pet("fox", "me") }, new List<PetInstance> { Checks.Pet("acorn", "w") }, new List<ItemStack>(), half);
        c.Eq("自动战斗选预计伤害最高的技能（焰尾狐打橡果刺猬 → 小火苗）", Battle.AutoAction(ab).skill, "ember");
        ab.needSwitch = true;
        var m0 = ab.me.mons[0];
        ab.me.mons.Add(new Mon { uid = "b", species = m0.species, name = m0.name, element = m0.element, level = m0.level, stats = m0.stats, maxHp = m0.maxHp, hp = 10, skills = m0.skills, uses = m0.uses, affection = m0.affection, src = m0.src });
        m0.hp = 0;
        c.Ok("自动战斗：倒下后换上下一只还能打的", Battle.AutoAction(ab).type == "switch" && Battle.AutoAction(ab).index == 1);
        BattleState Strong(int lv) => Battle.Create(new List<PetInstance> { Checks.Pet("fox", "me", 10) }, new List<PetInstance> { Checks.Pet("acorn", "w", lv) }, new List<ItemStack>(), half);
        c.Ok($"「一键结算」：野生宠物都比领队低 {Battle.QuickGap} 级以上才出现（Lv10 对 Lv7 有、对 Lv8 没有）", Battle.CanQuickResolve(Strong(7)) && !Battle.CanQuickResolve(Strong(8)));
        var qb = Strong(3); Battle.QuickResolve(qb);
        c.Ok("一键结算直接打完：赢了，有经验和四叶草", qb.over == "win" && qb.exp.Values.First() > 0 && qb.clover > 0);
        c.Done();
    }
}
