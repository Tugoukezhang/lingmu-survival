// Checks ported 1:1 from the web version's tools/logic-test.mjs, part 1: save, time & settlement,
// island generation, airship travel, gathering & crafting, battle, catching & party, fainting & lost bag.
// Each section is one test; every check inside keeps its Chinese name, and all failures of a section are listed.
using System;
using System.Collections.Generic;
using System.Linq;
using Lingmu.Core;
using Lingmu.Rules;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

public class Checks
{
    readonly List<string> fails = new List<string>();
    public int count;
    public void Ok(string name, bool ok, string detail = "") { count++; if (!ok) fails.Add(name + (detail != "" ? "  — " + detail : "")); }
    public void Eq<T>(string name, T got, T want) => Ok(name, Equals(got, want), $"得到 {got}，应为 {want}");
    public void Near(string name, double got, double want, double tol = 0.001) => Ok(name, Math.Abs(got - want) <= tol, $"得到 {got:F4}，应为 {want}");
    public void Done() => Assert.IsEmpty(fails, $"{fails.Count}/{count} 项不通过：\n" + string.Join("\n", fails));

    public static string J(object o) => JsonConvert.SerializeObject(o);
    public static PetInstance Pet(string id, string tag = "x", int level = 1, int stars = 3, string nature = "gentle") => PetMath.CreatePet(id, level, null, stars, nature, false, $"{id}-{tag}");
    public static Func<double> Const(double v) => () => v;
    public static List<ItemStack> Inv(params (string id, int n)[] items) => items.Select(x => new ItemStack(x.id, x.n)).ToList();
    public static List<ItemStack> Fill(int n, string prefix = "f") => Enumerable.Range(0, n).Select(i => new ItemStack($"{prefix}{i}", 1)).ToList();
    public static int Count(List<ItemStack> inv, string id) => Inventory.CountOf(inv, id);
    public static GameState OnIsland(GameState s, int seed) { s.expedition = new ExpeditionState { seed = seed }; s.player.area = "expedition"; return s; }
    // raw save text for any JSON (used to fake old versions)
    public static string Raw(JObject o) { var json = o.ToString(Formatting.None); return $"{SaveCodec.Checksum(json)}|{json}"; }
    public static JObject AsJson(GameState s) => JObject.Parse(s.ToJson());
}

public class RulesSystemsTests
{
    static GameState New() => SaveRules.NewGameState(1);

    [Test] public void 存档()
    {
        var c = new Checks();
        var mem = new MemoryStorage();
        long clock = 1000;
        var store = new SaveStore(mem, () => clock);
        var fresh = store.Load();
        c.Ok("没有存档时开新档", fresh.source == "new" && fresh.problem == null && SaveCodec.Validate(fresh.state).Count == 0, string.Join(",", SaveCodec.Validate(fresh.state)));
        var st = fresh.state;
        c.Eq("新档版本号", st.version, SaveRules.SaveVersion);
        c.Ok("新档：6 只宠物，队伍 3 只（冰蓝小狼领头），背包 9 种物品（含食物、锄头、水壶、萝卜种子）", st.pets.Count == 6 && st.party.Count == 3 && st.party[0] == "pet-pup" && st.inventory.Count == 9);
        var pj = (JObject)Checks.AsJson(st)["pets"][0];
        c.Ok("存档里不存属性值（永远现算）", !pj.ContainsKey("stats") && !pj.ContainsKey("atk"));

        st.clover = 345; st.day = 3; st.player.x = 500; st.player.y = 420;
        PetMath.GainExp(st.pets[0], 20);
        c.Ok("第一次存档成功", store.Save(st));
        c.Ok("第一次存档时没有旧档，不产生备份", mem.Get(SaveCodec.KeyBackup) == null);
        var back = store.Load();
        c.Ok("读回来和存进去的一样", back.source == "main" && back.state.ToJson() == st.ToJson());
        c.Ok("读回来的宠物属性一致", Checks.J(PetMath.CalcStats(back.state.pets[0])) == Checks.J(PetMath.CalcStats(st.pets[0])));

        clock = 2000; st.clover = 400;
        store.Save(st);
        c.Ok("第二次存档后，备份是上一份（四叶草 345）", SaveCodec.Decode(mem.Get(SaveCodec.KeyBackup)).state?.clover == 345);

        var good = mem.Get(SaveCodec.KeyMain);
        var cases = new Dictionary<string, string> { { "截断", good.Substring(0, good.Length - 20) }, { "篡改四叶草", good.Replace("\"clover\":400", "\"clover\":99999") }, { "乱码", "abc{{{" }, { "空字符串", "" } };
        foreach (var kv in cases)
        {
            mem.Set(SaveCodec.KeyMain, kv.Value);
            var r = store.Load();
            c.Ok($"主存档{kv.Key} → 读备份", r.source == "backup" && r.state.clover == 345 && r.problem != null, $"{r.source} {r.problem}");
        }
        var broken = st.Clone(); broken.clover = -5;
        mem.Set(SaveCodec.KeyMain, SaveCodec.Encode(broken));
        var rb = store.Load();
        c.Ok("内容不合法（四叶草为负）→ 读备份", rb.source == "backup" && rb.problem == "invalid", $"{rb.source} {rb.problem}");
        c.Ok("不合法的状态拒绝写入", store.Save(broken) == false && store.lastError.StartsWith("invalid"));

        mem.Set(SaveCodec.KeyMain, "x"); mem.Set(SaveCodec.KeyBackup, "y");
        var rn = store.Load();
        c.Ok("主存档和备份都坏 → 开新档并提示", rn.source == "new" && rn.problem != null);

        mem.Set(SaveCodec.KeyMain, good); store.Save(st);
        mem.Set(SaveCodec.KeyMain, "garbage");
        st.clover = 500; store.Save(st);
        c.Ok("主存档坏时再存档，不会用坏档覆盖备份", SaveCodec.Decode(mem.Get(SaveCodec.KeyBackup)).state?.clover == 400);

        store.Block("battle");
        st.clover = 600;
        c.Ok("对战中不存档", store.Save(st) == false && store.lastError == "blocked");
        store.Unblock("battle");
        c.Ok("对战结束后恢复存档", store.Save(st) && store.Load().state.clover == 600);

        mem.FailWrites = true;
        bool threw = false, ok = true;
        try { ok = store.Save(st); } catch { threw = true; }
        c.Ok("存储写满时不报错、返回失败", !threw && ok == false && store.lastError != null);
        mem.FailWrites = false;

        var future = Checks.AsJson(st); future["version"] = SaveRules.SaveVersion + 1;
        var futureRaw = Checks.Raw(future);
        mem.Set(SaveCodec.KeyMain, futureRaw);
        var rf = store.Load();
        c.Ok("更新版本的存档 → 另外保留，不读取", rf.problem == "future" && mem.Get(SaveCodec.KeyFuture) == futureRaw);

        var v0 = Checks.AsJson(SaveRules.NewGameState(1)); v0["version"] = 0; v0["coins"] = 77; v0.Remove("clover");
        var migrations = new Dictionary<int, Func<JObject, JObject>> { { 0, d => { d["clover"] = d["coins"]; d.Remove("coins"); return d; } } };
        var rm = SaveCodec.Decode(Checks.Raw(v0), migrations, 1);
        c.Ok("旧版本存档按迁移函数升级（coins → clover）", rm.ok && rm.state.version == 1 && rm.state.clover == 77, rm.reason ?? "");
        var rmiss = SaveCodec.Decode(Checks.Raw(v0), new Dictionary<int, Func<JObject, JObject>>(), 1);
        c.Ok("缺少迁移函数 → 读取失败而不是读出错数据", !rmiss.ok && rmiss.reason == "migrate");

        store.Wipe();
        c.Ok("重新开始会清掉主存档和备份", mem.Get(SaveCodec.KeyMain) == null && mem.Get(SaveCodec.KeyBackup) == null);
        c.Done();
    }

    [Test] public void 时间_昼夜_结算()
    {
        var c = new Checks();
        c.Near("1 游戏分钟 ≈ 0.67 现实秒", GameTime.MsPerGameMin / 1000, 0.667, 0.001);
        c.Near("6:00–24:00 = 现实 12 分钟", (GameTime.Bedtime - GameTime.DayStart) * GameTime.MsPerGameMin / 60000, 12, 1e-9);
        c.Near("一跳（10 游戏分钟）≈ 6.7 现实秒", GameTime.TickMin * GameTime.MsPerGameMin / 1000, 6.67, 0.01);
        string Ph(int h, int m = 0) => GameTime.PhaseAt(h * 60 + m);
        c.Ok("昼夜阶段边界：5:59 夜 / 6:00 昼 / 17:59 昼 / 18:00 黄昏 / 19:59 黄昏 / 20:00 夜 / 25:00 夜",
            Ph(5, 59) == "night" && Ph(6) == "day" && Ph(17, 59) == "day" && Ph(18) == "dusk" && Ph(19, 59) == "dusk" && Ph(20) == "night" && Ph(25) == "night");
        c.Eq("时钟显示 25:30 → 01:30", GameTime.Format(25 * 60 + 30), "01:30");
        c.Eq("白天不调色", GameTime.TintAt(12 * 60).dark, 0.0);
        c.Ok("黄昏开始变暗、夜里最暗", GameTime.TintAt(19 * 60).dark > 0.2 && GameTime.TintAt(23 * 60).dark > 0.5 && GameTime.TintAt(23 * 60).dark == GameTime.TintAt(25 * 60).dark);
        c.Ok("调色随时间连续变化（每分钟变化 ≤ 0.01）", Enumerable.Range(0, 1440).All(m => Math.Abs(GameTime.TintAt(m + 1).dark - GameTime.TintAt(m).dark) <= 0.01));

        GameState Home() => new GameState { day = 1, clock = 6 * 60, player = new PlayerState { area = "home", hp = 40, hpMax = 100, hunger = 50, hungerMax = 100 } };
        double Ms(double min) => min * GameTime.MsPerGameMin;
        var s = Home(); var clk = new GameClock();
        var ev = clk.Advance(s, Ms(60));
        c.Ok("走 60 游戏分钟 → 时钟 7:00，6 跳", s.clock == 7 * 60 && ev.Count(e => e.type == "tick") == 6, $"{s.clock} {ev.Count}");
        clk.Advance(s, Ms(0.4)); clk.Advance(s, Ms(0.4)); clk.Advance(s, Ms(0.4));
        c.Eq("不足 1 分钟的零头会累计（3 × 0.4 分钟 = 1 分钟）", s.clock, 7 * 60 + 1);
        clk.Pause("menu");
        clk.Advance(s, Ms(120));
        c.Eq("打开菜单时时间暂停", s.clock, 7 * 60 + 1);
        clk.Resume("menu");
        s.clock = 17 * 60 + 55;
        ev = clk.Advance(s, Ms(10 * 60));
        var phases = string.Join(",", ev.Where(e => e.type == "phase").Select(e => $"{e.to}@{GameTime.Format(e.clock)}"));
        c.Ok("家园：18:00 黄昏、20:00 夜晚，24:00 强制睡觉并停住", phases == "dusk@18:00,night@20:00" && ev.Last().type == "bedtime" && s.clock == GameTime.Bedtime && clk.Paused, phases);
        clk.Advance(s, Ms(60));
        c.Eq("强制睡觉后时钟不再走", s.clock, GameTime.Bedtime);

        var ex = Home(); ex.clock = 23 * 60; ex.player.area = "expedition"; var c2 = new GameClock();
        ev = c2.Advance(ex, Ms(2 * 60));
        c.Ok("远征：过了 24:00 不强制睡觉，继续到 1:00", ex.clock == 25 * 60 && !ev.Any(e => e.type == "bedtime"));
        ev = c2.Advance(ex, Ms(10 * 60));
        c.Ok("远征：熬到 6:00 天亮 → 结束这一天", ev.Any(e => e.type == "phase" && e.to == "day") && ev.Last().type == "dawn" && ex.clock == GameTime.DawnLimit);

        s = Home(); s.clock = GameTime.Bedtime;
        var r = Settlement.Run(s, true);
        c.Ok("结算顺序：休息 → 出货 → 作物 → 宠物打工 → 家园资源 → 天气", string.Join(",", r.order) == "rest,shipping,crops,petWork,resources,weather");
        c.Ok("睡觉后：第 2 天 6:00，生命回满，饱食 −20", s.day == 2 && s.clock == 360 && s.player.hp == 100 && s.player.hunger == 30);
        var hungry = Home(); hungry.player.hunger = 12; Settlement.Run(hungry, true);
        c.Eq("饱食不会降到 0 以下", hungry.player.hunger, 0);
        var noSleep = Home(); Settlement.Run(noSleep, false);
        c.Ok("没睡觉天亮：进入新的一天但生命不恢复", noSleep.day == 2 && noSleep.player.hp == 40);

        var g = Home(); var gc = new GameClock(); var log = new List<string>();
        for (int d = 0; d < 3; d++)
        {
            int guard = 0;
            while (!gc.Paused && guard++ < 2000)
                foreach (var e in gc.Advance(g, Ms(30))) if (e.type != "tick") log.Add($"{g.day}:{(e.type == "phase" ? e.to : e.type)}");
            var rr = Settlement.Run(g, true); log.Add($"→{rr.day}");
            gc.Restart();
        }
        c.Eq("连续推进 3 天，事件顺序正确", string.Join(" ", log), "1:dusk 1:night 1:bedtime →2 2:dusk 2:night 2:bedtime →3 3:dusk 3:night 3:bedtime →4");
        var v = New(); v.day = g.day; v.clock = g.clock;
        c.Ok("3 天后存档仍合法", SaveCodec.Validate(v).Count == 0);
        var late = New(); late.clock = 25 * 60 + 30;
        c.Ok("远征凌晨的时钟（25:30）存档合法", SaveCodec.Validate(late).Count == 0);
        c.Done();
    }

    [Test] public void 远征岛生成()
    {
        var c = new Checks();
        c.Ok("E01 同一种子生成两次，两座岛完全一样", Checks.J(IslandGen.Generate(20261108)) == Checks.J(IslandGen.Generate(20261108)));
        c.Ok("不同种子生成不同的岛", Checks.J(IslandGen.Generate(1)) != Checks.J(IslandGen.Generate(2)));
        var bad = new List<string>(); int fallback = 0, minArea = int.MaxValue;
        var counts = new Dictionary<string, int> { { "tree", 0 }, { "rock", 0 }, { "bush", 0 }, { "grass", 0 }, { "crystal", 0 } };
        for (int i = 1; i <= 100; i++)
        {
            var isl = IslandGen.Generate(i * 7919);
            var why = IslandGen.Validate(isl);
            if (why != null) bad.Add($"{i}:{why}");
            if (isl.fallback) fallback++;
            minArea = Math.Min(minArea, isl.area);
            int normal = isl.chests.Count(ch => !ch.bonus);
            if (isl.pets.Count < 4 || isl.pets.Count > 6 || normal < 1 || normal > 2 || isl.camps.Count < 1 || isl.camps.Count > 2) bad.Add($"{i}:数量");
            foreach (var res in isl.resources) counts[res.type]++;
        }
        c.Ok("E02 连续 100 个种子：资源、宝箱、宠物、营地都能从着陆点走到；数量在规定范围", bad.Count == 0, string.Join(" ", bad.Take(3)));
        c.Ok("100 座岛可行走面积都 ≥ 600 格", minArea >= IslandGen.MinArea, $"最小 {minArea}");
        c.Ok("100 座岛都不需要兜底岛", fallback == 0, $"兜底 {fallback}");
        c.Ok("五种资源都会出现", counts.Values.All(n => n > 0), Checks.J(counts));
        var island = IslandGen.Generate(20261108);
        c.Ok("着陆点在岛上、飞艇在岛外", island.walk[island.landing.ty][island.landing.tx] && !island.walk[island.airship.ty][island.airship.tx]);
        var blocked = IslandGen.BlockedGrid(island);
        c.Ok("着陆点周围没有挡路的东西", new[] { -1, 0, 1 }.All(dy => new[] { -1, 0, 1 }.All(dx => !blocked[island.landing.ty + dy][island.landing.tx + dx])));
        int far = island.chests.Min(ch => Math.Abs(ch.tx - island.landing.tx) + Math.Abs(ch.ty - island.landing.ty));
        c.Ok("宝箱离着陆点远（直线格数 ≥ 12）", far >= 12, $"最近 {far}");

        var taken = island.resources.Take(3).Select(r => r.id).ToList();
        var st = New();
        st.expedition = new ExpeditionState { seed = 20261108, changes = new IslandChanges { collected = taken, chests = new List<string> { island.chests[0].id }, pets = new List<string> { island.pets[0].id } } };
        st.player.area = "expedition";
        var mem = new MemoryStorage(); var store = new SaveStore(mem);
        store.Save(st);
        var back = store.Load().state;
        var again = IslandGen.ApplyChanges(IslandGen.Generate(back.expedition.seed), back.expedition.changes);
        c.Ok("E05 采集过的资源回来时仍然是空的（存档 → 读档 → 重新生成）", taken.All(id => !again.resources.Any(r => r.id == id)) && again.resources.Count == island.resources.Count - 3);
        c.Ok("打开过的宝箱、捕捉过的宠物不再出现", again.chests.Count == island.chests.Count - 1 && again.pets.Count == island.pets.Count - 1);
        c.Ok("没动过的资源位置不变", Checks.J(again.resources) == Checks.J(island.resources.Skip(3).ToList()));
        c.Ok("采集后格子不再挡路", !IslandGen.BlockedGrid(again)[island.resources[0].ty][island.resources[0].tx] || island.resources[0].type == "grass");
        var noIsland = New(); noIsland.player.area = "expedition";
        c.Ok("存档：在远征岛上但没有岛屿记录 → 不合法", SaveCodec.Validate(noIsland).Contains("player.area"));
        c.Done();
    }

    [Test] public void 飞艇出行()
    {
        var c = new Checks();
        var st = New();
        st.clock = 9 * 60; st.player.hunger = 80;
        c.Ok("没去过别的岛时不能选「回到上次的岛」", Travel.Depart(st, "last").reason == "no-last" && st.player.area == "home");
        int seedA = Travel.NewIslandSeed(st);
        var r = Travel.Depart(st, "new");
        c.Ok("出发去新岛：耗时 1 小时、路上饱食 −4、到远征岛着陆点", r.ok && st.clock == 10 * 60 && st.player.hunger == 76 && st.player.area == "expedition" && st.player.x == null && st.expedition.seed == seedA, $"{GameTime.Format(st.clock)} 饱食 {st.player.hunger}");
        c.Ok("出发后存档合法", SaveCodec.Validate(st).Count == 0, string.Join(",", SaveCodec.Validate(st)));
        c.Ok("在远征岛上不能再出发", Travel.Depart(st, "new").reason == "not-home");
        st.expedition.changes.collected.AddRange(new[] { "r0", "r1" });
        var h = Travel.ReturnHome(st);
        c.Ok("坐飞艇回家：耗时 1 小时、回到家园码头", h.ok && st.clock == 11 * 60 && st.player.area == "home" && st.flags.arriveAt == "dock");
        int seedLast = st.expedition.seed;
        Travel.Depart(st, "last");
        c.Ok("回到上次的岛：种子不变、采集记录还在", st.expedition.seed == seedLast && string.Join(",", st.expedition.changes.collected) == "r0,r1");
        Travel.ReturnHome(st);
        Travel.Depart(st, "new");
        c.Ok("再选新岛：换了新种子、变化记录清空", st.expedition.seed != seedLast && st.expedition.changes.collected.Count == 0);
        GameState Seeded() => new GameState { seed = 5, day = 3, flags = new Flags { trips = 2 } };
        c.Ok("新岛种子由存档决定（同样的存档得到同样的种子）", Travel.NewIslandSeed(Seeded()) == Travel.NewIslandSeed(Seeded()));
        var s2 = new GameState { clock = 6 * 60 + 5, player = new PlayerState() };
        c.Eq("6:05 起飞 1 小时 → 经过 6 跳（6:10…7:00）", Travel.PassTime(s2, 60), 6);
        var s3 = new GameState { clock = 6 * 60, player = new PlayerState { hp = 2, hunger = 0 } };
        Travel.PassTime(s3, 60);
        c.Ok("飞艇上是安全的：饿着也不会倒下（生命最低 1）", s3.player.hp == 1);
        var f = Checks.OnIsland(New(), 1);
        f.player.hp = 0; f.player.hunger = 0; f.day = 4; f.clock = 26 * 60;
        Travel.Faint(f, 100, 100);
        c.Ok("远征中倒下（临时规则）：第二天 8:00 在家醒来，生命 50、饱食 50", f.day == 5 && f.clock == 8 * 60 && f.player.hp == 50 && f.player.hunger == 50 && f.player.area == "home" && f.flags.arriveAt == "bed");
        c.Ok("倒下后存档合法", SaveCodec.Validate(f).Count == 0);
        c.Done();
    }

    [Test] public void 采集与制作()
    {
        var c = new Checks();
        c.Ok("配方的材料和产出都是已定义的物品", GameData.Recipes.All(r => GameData.Item(r.@out) != null && r.cost.Keys.All(id => GameData.Item(id) != null)));
        var costs = string.Join(";", GameData.Recipes.Where(r => !r.id.StartsWith("furn_")).Select(r => r.id + ":" + string.Join(",", r.cost.Select(kv => $"{kv.Key}={kv.Value}"))));
        c.Eq("配方数值与文档一致（石斧 木3石2、石镐 木3石3、火把 木2草2、营火 木4石4、草编网 草3木2、藤编网 布1草3雾晶1）", costs,
            "axe:item_wood=3,item_stone=2;pickaxe:item_wood=3,item_stone=3;torch:item_wood=2,item_grass=2;campfire:item_wood=4,item_stone=4;net_grass:item_grass=3,item_wood=2;net_vine:item_cloth=1,item_grass=3,item_crystal=1;tent:item_cloth=4,item_wood=6;soup:item_carrot=2,item_pumpkin=1;bigbag:item_cloth=6,item_crystal=2");
        c.Eq("只有斧、镐、锄头、水壶、帐篷、大背包算工具（倒下时保留），网是消耗品", string.Join(",", GameData.Items.Where(kv => kv.Value.tool).Select(kv => kv.Key).OrderBy(k => k, StringComparer.Ordinal)), "item_axe,item_bigbag,item_can,item_hoe,item_pickaxe,item_tent");

        GameState Mk(List<ItemStack> inv) { var s = Checks.OnIsland(New(), 1); s.inventory = inv; return s; }
        var st = Mk(new List<ItemStack>());
        var r = Crafting.GatherAt(st, "r1", "tree");
        c.Ok("徒手砍树得 1 木材，记入采集记录", r.ok && Checks.Count(st.inventory, "item_wood") == 1 && st.expedition.changes.collected.Contains("r1"));
        c.Ok("同一个资源不能采两次", Crafting.GatherAt(st, "r1", "tree").reason == "gone" && Checks.Count(st.inventory, "item_wood") == 1);
        Inventory.AddItem(st.inventory, "item_axe", 1);
        Crafting.GatherAt(st, "r2", "tree");
        c.Eq("有石斧砍树得 3 木材", Checks.Count(st.inventory, "item_wood"), 4);
        r = Crafting.GatherAt(st, "r3", "crystal");
        c.Ok("没有石镐敲不了雾晶，也不记入采集", !r.ok && r.reason == "need-tool" && r.tool == "item_pickaxe" && !st.expedition.changes.collected.Contains("r3"));
        Crafting.GatherAt(st, "r4", "bush"); Crafting.GatherAt(st, "r5", "grass");
        c.Ok("浆果丛得 2 浆果、草丛得 2 草", Checks.Count(st.inventory, "item_berry") == 2 && Checks.Count(st.inventory, "item_grass") == 2);

        var full = Mk(new List<ItemStack> { new ItemStack("item_wood", 1) }.Concat(Checks.Fill(19)).ToList());
        full.party = new List<string>();
        var before = Checks.J(full.inventory);
        r = Crafting.GatherAt(full, "r9", "rock");
        c.Ok("背包 20 格满了：采不到新物品，资源留在原地", !r.ok && r.reason == "full" && Checks.J(full.inventory) == before && !full.expedition.changes.collected.Contains("r9"));
        c.Ok("背包满了但已有同种物品 → 可以继续叠加", Crafting.GatherAt(full, "r10", "tree").ok && Checks.Count(full.inventory, "item_wood") == 2);
        var pupState = New();
        c.Eq("冰蓝小狼在队伍里：背包 24 格", Crafting.BagSlots(pupState), 24);
        pupState.party = new List<string> { "pet-fox" };
        c.Eq("冰蓝小狼不在队伍里：背包 20 格", Crafting.BagSlots(pupState), 20);

        var e04 = Mk(Checks.Inv(("item_wood", 4), ("item_stone", 4)));
        var first = Crafting.Craft(e04, "campfire"); var second = Crafting.Craft(e04, "campfire");
        c.Ok("E04 材料刚好够营火，连点两次：只做出 1 个，材料只扣 1 次", first.ok && !second.ok && second.reason == "missing" && Checks.Count(e04.inventory, "item_campfire") == 1 && Checks.Count(e04.inventory, "item_wood") == 0 && Checks.Count(e04.inventory, "item_stone") == 0);
        c.Ok("材料用完的格子会消失", e04.inventory.Count == 1);
        var miss = Crafting.CanCraft(Mk(Checks.Inv(("item_wood", 1))), "axe");
        c.Ok("材料不够时列出缺什么（木材差 2、石头差 2）", !miss.ok && string.Join(",", miss.missing.Select(m => $"{m.id}:{m.need - m.have}")) == "item_wood:2,item_stone:2");
        var fb = Mk(Checks.Inv(("item_wood", 10), ("item_stone", 10)).Concat(Checks.Fill(18)).ToList());
        fb.party = new List<string>();
        var fbBefore = Checks.J(fb.inventory);
        var rf = Crafting.Craft(fb, "axe");
        c.Ok("背包满且没有空出格子 → 不能制作，材料不扣", !rf.ok && rf.reason == "full" && Checks.J(fb.inventory) == fbBefore);
        var fe = Mk(Checks.Inv(("item_wood", 3), ("item_stone", 5)).Concat(Checks.Fill(18)).ToList());
        fe.party = new List<string>();
        c.Ok("背包满但材料用完空出一格 → 可以制作", Crafting.Craft(fe, "axe").ok && Checks.Count(fe.inventory, "item_axe") == 1);
        c.Done();
    }

    [Test] public void 回合制对战()
    {
        var c = new Checks();
        var half = Checks.Const(0.5);
        var b = Battle.Create(new List<PetInstance> { Checks.Pet("fox", "me") }, new List<PetInstance> { Checks.Pet("acorn", "w") }, new List<ItemStack>(), half);
        var r = Battle.ResolveTurn(b, BattleAction.Skill("ember"));
        var dmg = r.events.FirstOrDefault(e => e.t == "damage" && e.side == "foe");
        c.Ok("A01 对战中焰尾狐用小火苗打橡果刺猬：伤害 30、提示效果拔群", dmg?.amount == 30 && dmg.eff == "super");
        c.Ok("速度快的先出手（焰尾狐 12 > 橡果刺猬 9）", r.events.FindIndex(e => e.t == "use" && e.side == "me") < r.events.FindIndex(e => e.t == "use" && e.side == "foe"));
        var slow = Battle.Create(new List<PetInstance> { Checks.Pet("starbear", "me") }, new List<PetInstance> { Checks.Pet("shadecat", "w") }, new List<ItemStack>(), half);
        var rs = Battle.ResolveTurn(slow, BattleAction.Skill("tackle"));
        c.Ok("对方更快时对方先出手（月影狐猫 14 > 星星熊仔 5）", rs.events[0].t == "use" && rs.events[0].side == "foe");
        Battle.ResolveTurn(b, BattleAction.Skill("ember"));
        c.Ok("两发小火苗打倒橡果刺猬 → 胜利，得 8 经验、3 四叶草", b.over == "win" && b.exp["fox-me"] == 8 && b.clover == 3);
        c.Ok("结束后不能再出招", Battle.ResolveTurn(b, BattleAction.Skill("ember")).ok == false);

        var st = Checks.OnIsland(New(), 9);
        var party = st.party.Select(st.Pet).ToList();
        b = Battle.Create(party, new List<PetInstance> { Checks.Pet("acorn", "e", 2) }, st.inventory, half);
        var snapshot = st.ToJson();
        Battle.ResolveTurn(b, BattleAction.Snack("item_carrot"));
        c.Ok("对战过程中不改动真实存档（只改副本）", st.ToJson() == snapshot);
        c.Ok("喂喜好食物（萝卜）给橡果刺猬：诱饵 ×1.5 记下，零食算一次行动", b.bait["acorn-e"] == 1.5 && b.turn == 1);
        Battle.ResolveTurn(b, BattleAction.Snack("item_berry"));
        c.Ok("诱饵取最高，不会被普通食物覆盖", b.bait["acorn-e"] == 1.5);
        c.Ok("没有的零食不能喂", Battle.ResolveTurn(b, BattleAction.Snack("item_soup")).ok == false);
        int guard = 0;
        while (b.over == null && guard++ < 50)
        {
            if (b.needSwitch) Battle.ResolveTurn(b, BattleAction.Switch(b.me.mons.FindIndex(m => m.hp > 0)));
            else Battle.ResolveTurn(b, BattleAction.Skill("tackle"));
        }
        int carrots0 = Checks.Count(st.inventory, "item_carrot"), clover0 = st.clover;
        var sum = Battle.Finish(st, b, "w3");
        c.Ok("结束时一次提交：用掉的零食从背包扣掉、四叶草增加", Checks.Count(st.inventory, "item_carrot") == carrots0 - 1 && st.clover == clover0 + b.clover && sum.result == b.over);
        c.Ok("打赢后野生宠物记入岛屿记录，不会再出现", b.over != "win" || st.expedition.changes.pets.Contains("w3"));
        c.Ok("受伤的宠物体力带出对战（下次对战接着用）", st.pets.Any(x => x.hp != null) || b.me.mons.All(m => m.hp == m.maxHp));

        var weak = new List<PetInstance> { Checks.Pet("starbear", "a"), Checks.Pet("pup", "b") };
        var st2 = New(); var inv0 = Checks.J(st2.inventory); var pl0 = Checks.J(st2.player);
        st2.pets.AddRange(weak);
        b = Battle.Create(weak, new List<PetInstance> { Checks.Pet("shadecat", "boss", 12) }, st2.inventory, half);
        guard = 0; bool freeSwitch = true;
        while (b.over == null && guard++ < 60)
        {
            if (b.needSwitch) { var rr = Battle.ResolveTurn(b, BattleAction.Switch(b.me.mons.FindIndex(m => m.hp > 0))); freeSwitch &= rr.events.Count == 1 && rr.events[0].t == "send"; }
            else Battle.ResolveTurn(b, BattleAction.Skill("tackle"));
        }
        c.Ok("倒下后换上下一只是免费的（对方不行动）", freeSwitch);
        Battle.Finish(st2, b, "w0");
        c.Ok("A02 我方全部倒下 → 失败；背包、玩家生命和饱食都不变", b.over == "lose" && Checks.J(st2.inventory) == inv0 && Checks.J(st2.player) == pl0);
        c.Ok("A06 队伍全部体力为 0 → 不能进入对战", !Battle.CanStart(weak) && Battle.CanStart(st2.pets.Take(1)));
        var downPup = Checks.Pet("pup", "z"); downPup.hp = 0;
        var bb0 = Battle.Create(new List<PetInstance> { Checks.Pet("fox", "q"), downPup }, new List<PetInstance> { Checks.Pet("acorn", "y") }, new List<ItemStack>(), half);
        c.Ok("倒下的宠物不能被换上场", Battle.ResolveTurn(bb0, BattleAction.Switch(1)).ok == false);

        var st3 = New(); st3.expedition = new ExpeditionState { seed = 9 };
        b = Battle.Create(new List<PetInstance> { st3.pets[0] }, new List<PetInstance> { Checks.Pet("acorn", "f") }, new List<ItemStack>(), half);
        var rf = Battle.ResolveTurn(b, BattleAction.Flee());
        Battle.Finish(st3, b, "w1");
        c.Ok("A05 溜走：总能成功，对方不出手，野生宠物保留", rf.events.All(e => e.t != "use") && b.over == "flee" && !st3.expedition.changes.pets.Contains("w1"));

        b = Battle.Create(new List<PetInstance> { Checks.Pet("fox", "u") }, new List<PetInstance> { Checks.Pet("starbear", "v", 20) }, new List<ItemStack>(), half);
        for (int i = 0; i < 3; i++) Battle.ResolveTurn(b, BattleAction.Skill("blaze"));
        c.Ok("火焰尾每场 3 次，用完不能再用", Battle.ResolveTurn(b, BattleAction.Skill("blaze")).reason == "no-uses" || b.over != null);
        var bb = Battle.Create(new List<PetInstance> { Checks.Pet("acorn", "s", 5) }, new List<PetInstance> { Checks.Pet("fox", "t") }, new List<ItemStack>(), half);
        Battle.ResolveTurn(bb, BattleAction.Skill("shell"));
        var me = Battle.Active(bb, "me");
        c.Ok("刺球：防御 ×1.5，持续 3 回合（回合结束时倒数）", me.buffs.Count == 1 && me.buffs[0].mult == 1.5 && me.buffs[0].turns == 2);
        Battle.ResolveTurn(bb, BattleAction.Skill("shell"));
        c.Ok("同一种加成重复使用是刷新而不是叠加", Battle.Active(bb, "me").buffs.Count == 1 && Battle.Active(bb, "me").buffs[0].turns == 2);
        var ai = Battle.Create(new List<PetInstance> { Checks.Pet("fox", "ai") }, new List<PetInstance> { Checks.Pet("shark", "ai2", 5) }, new List<ItemStack>(), Checks.Const(0.9));
        c.Eq("敌方优先用克制技能（航海鲨对焰尾狐用大浪）", Battle.ChooseEnemySkill(ai), "splash");
        var bondPet = Checks.Pet("pup", "bond"); bondPet.affection = 100;
        var bd = Battle.Create(new List<PetInstance> { bondPet }, new List<PetInstance> { Checks.Pet("fox", "big", 30) }, new List<ItemStack>(), half);
        var r1 = Battle.ResolveTurn(bd, BattleAction.Skill("tackle"));
        c.Ok("P09 好感 100：第一次致命伤害保留 1 体力", Battle.Active(bd, "me").hp == 1 && r1.events.Any(e => e.t == "bond"), $"hp {Battle.Active(bd, "me").hp}");
        Battle.ResolveTurn(bd, BattleAction.Skill("tackle"));
        c.Ok("P09 同一场第二次致命伤害正常倒下", bd.over == "lose");
        c.Eq("野生宠物组：第 1–4 天 1 只、第 5–9 天 2 只、第 10 天起 3 只", string.Join(",", new[] { 1, 4, 5, 9, 10, 20 }.Select(Battle.WildGroupSize)), "1,1,2,2,3,3");
        var pool = GameData.Pets.Select(x => x.id).ToList();
        var g1 = Battle.MakeWildGroup("acorn", 3, 77, 2, 12, pool); var g2 = Battle.MakeWildGroup("acorn", 3, 77, 2, 12, pool);
        c.Ok("野生宠物组由种子决定，领头的是碰到的那只", g1.Count == 3 && g1[0].species == "acorn" && g1[0].level == 3 && Checks.J(g1) == Checks.J(g2));
        var sl = New(); sl.pets[0].hp = 3; Settlement.Run(sl, true);
        c.Ok("睡一觉后宠物体力回满", sl.pets.All(x => x.hp == null));
        c.Done();
    }

    [Test] public void 捕捉与队伍()
    {
        var c = new Checks();
        (GameState st, BattleState b) Setup()
        {
            var st = Checks.OnIsland(New(), 5);
            var party = st.party.Select(st.Pet).ToList();
            var b = Battle.Create(party, new List<PetInstance> { Checks.Pet("acorn", "wild") }, st.inventory, Checks.Const(0.5));
            Battle.Active(b, "foe").hp = 16;
            Battle.ResolveTurn(b, BattleAction.Snack("item_carrot"));
            Battle.Active(b, "foe").hp = 16;
            return (st, b);
        }
        var (st, b) = Setup();
        c.Near("捕捉面板显示的成功率：剩 16 体力 + 萝卜 + 草编网 = 56.7%", Battle.CatchChance(b, "item_net_grass"), 0.5674);
        int nets0 = Checks.Count(st.inventory, "item_net_grass"), carrots0 = Checks.Count(st.inventory, "item_carrot"), pets0 = st.pets.Count;
        b.rng = Checks.Const(0.50);
        var r = Battle.ResolveTurn(b, BattleAction.Catch("item_net_grass"));
        c.Ok("A04 随机数 0.50 < 56.7% → 捕捉成功，对战立即结束", r.ok && b.over == "caught" && r.events.Any(e => e.t == "caught") && !r.events.Any(e => e.t == "use" && e.side == "foe"));
        var sum = Battle.Finish(st, b, "w2");
        var got = st.pets.Last();
        c.Ok("A04 捕捉后：好感 20、网 −1、萝卜 −1，宠物进入家园（队伍满 3 只）", got.affection == 20 && Checks.Count(st.inventory, "item_net_grass") == nets0 - 1 && Checks.Count(st.inventory, "item_carrot") == carrots0 - 1 && st.pets.Count == pets0 + 1 && !st.party.Contains(got.uid) && sum.caught.joined == false);
        c.Ok("捕捉到的宠物保留种类、等级、资质、性格，体力带出（16）", got.species == "acorn" && got.level == 1 && got.stars == 3 && got.nature == "gentle" && got.hp == 16);
        c.Ok("捕捉到的宠物有新的唯一编号，存档合法", got.uid != "acorn-wild" && st.pets.Select(x => x.uid).Distinct().Count() == st.pets.Count && SaveCodec.Validate(st).Count == 0, string.Join(",", SaveCodec.Validate(st)));
        c.Ok("被捕捉的野生宠物记入岛屿记录", st.expedition.changes.pets.Contains("w2"));
        c.Ok("捕捉成功出战宠物也得经验（按对方等级 8）", sum.exp.Any(x => x.amount == 8));
        (st, b) = Setup();
        int n1 = Checks.Count(b.inventory, "item_net_grass");
        b.rng = Checks.Const(0.60);
        r = Battle.ResolveTurn(b, BattleAction.Catch("item_net_grass"));
        c.Ok("A08 随机数 0.60 → 失败：网 −1，对方照常行动", r.ok && b.over == null && Checks.Count(b.inventory, "item_net_grass") == n1 - 1 && r.events.Any(e => e.t == "escape") && r.events.Any(e => e.t == "use" && e.side == "foe"));
        (st, b) = Setup();
        Battle.Active(b, "foe").hp = 0;
        c.Ok("A09 对方体力 0 → 不能捕捉", Battle.ResolveTurn(b, BattleAction.Catch("item_net_grass")).reason == "fainted");
        (st, b) = Setup();
        b.inventory = b.inventory.Where(x => GameData.Item(x.id).netMult == null).ToList();
        c.Ok("没有网不能捕捉", Battle.ResolveTurn(b, BattleAction.Catch("item_net_grass")).reason == "no-net");
        (st, b) = Setup();
        st.party = new List<string> { "pet-pup" };
        b.rng = Checks.Const(0.01);
        Battle.ResolveTurn(b, BattleAction.Catch("item_net_vine"));
        sum = Battle.Finish(st, b, "w3");
        c.Ok("队伍不满 3 只 → 抓到的宠物直接进队伍", sum.caught.joined && st.party.Count == 2 && st.party[1] == sum.caught.uid);

        var ps = New();
        c.Ok("队伍满 3 只时不能再加入", Party.Join(ps, "pet-shark").reason == "full");
        c.Ok("离开队伍后可以加入别的伙伴", Party.Leave(ps, "pet-acorn").ok && Party.Join(ps, "pet-shark").ok && string.Join(",", ps.party) == "pet-pup,pet-fox,pet-shark");
        c.Ok("设为领头：排到第一", Party.SetLead(ps, "pet-shark").ok && ps.party[0] == "pet-shark" && ps.party.Count == 3);
        Party.Leave(ps, "pet-fox"); Party.Leave(ps, "pet-pup");
        c.Ok("队伍里至少留 1 只", Party.Leave(ps, "pet-shark").reason == "last" && ps.party.Count == 1);
        Checks.OnIsland(ps, 1);
        c.Ok("远征中不能从家里叫伙伴、也不能让伙伴回家", Party.Join(ps, "pet-fox").reason == "away");
        ps.player.area = "home"; Party.Join(ps, "pet-fox"); ps.player.area = "expedition";
        c.Ok("远征中可以调整领头", Party.SetLead(ps, ps.party[0]).ok);
        c.Done();
    }

    [Test] public void 倒下与失物包()
    {
        var c = new Checks();
        GameState Mk()
        {
            var s = Checks.OnIsland(New(), 3);
            s.inventory = Checks.Inv(("item_axe", 1), ("item_wood", 12), ("item_berry", 5), ("item_crystal", 1));
            s.day = 5; s.clock = 23 * 60;
            return s;
        }
        var s = Mk();
        Travel.Faint(s, 640, 512);
        var lb = s.expedition.lostBag;
        c.Ok("E08 倒下：保留石斧；失物包 = 木材 ×12、浆果 ×5、雾晶 ×1（在倒下的位置）", string.Join(",", s.inventory.Select(x => x.id)) == "item_axe"
            && lb.x == 640 && lb.y == 512 && string.Join(",", lb.items.Select(x => $"{x.id}x{x.count}")) == "item_woodx12,item_berryx5,item_crystalx1");
        c.Ok("倒下后：第二天 8:00 在家醒来，生命 50、饱食 50，宠物恢复", s.day == 6 && s.clock == 480 && s.player.hp == 50 && s.player.hunger == 50 && s.player.area == "home" && s.pets.All(p => p.hp == null));
        c.Ok("倒下后的存档合法", SaveCodec.Validate(s).Count == 0, string.Join(",", SaveCodec.Validate(s)));
        var mem = new MemoryStorage(); var store = new SaveStore(mem);
        store.Save(s);
        var back = store.Load().state;
        c.Ok("E10 倒下结果一次写进存档：读回来只有一个失物包，物品不多不少", back.expedition.lostBag.items.Sum(x => x.count) == 18 && back.inventory.Count == 1);
        Travel.Depart(s, "last");
        var p = Travel.PickUpLostBag(s);
        c.Ok("E08 回到原岛捡失物包：木材 ×12、浆果 ×5、雾晶 ×1 全部回到背包，失物包消失", p.left.Count == 0 && Checks.Count(s.inventory, "item_wood") == 12 && Checks.Count(s.inventory, "item_berry") == 5 && Checks.Count(s.inventory, "item_crystal") == 1 && s.expedition.lostBag == null);
        c.Ok("已经捡过的失物包不会再给东西", Travel.PickUpLostBag(s).took.Count == 0 && Checks.Count(s.inventory, "item_wood") == 12);
        s = Mk(); Travel.Faint(s, 1, 1);
        Travel.Depart(s, "last");
        s.inventory.Add(new ItemStack("item_stone", 7));
        var r2 = Travel.Faint(s, 2, 2);
        c.Ok("还没捡回又倒下：新失物包替换旧的（旧的丢失）", r2.replaced && string.Join(",", s.expedition.lostBag.items.Select(x => x.id)) == "item_stone" && s.expedition.lostBag.x == 2);
        Travel.Depart(s, "new");
        c.Ok("E09 去新的浮岛：旧岛和失物包一起消失", s.expedition.lostBag == null && s.expedition.changes.collected.Count == 0);
        s = Mk(); Travel.Faint(s, 5, 5); Travel.Depart(s, "last");
        var r3 = Travel.Faint(s, 9, 9);
        c.Ok("身上只有工具时倒下：不产生新失物包，旧失物包还在原处", r3.dropped.Count == 0 && s.expedition.lostBag.x == 5);
        s = Mk(); Travel.Faint(s, 5, 5); Travel.Depart(s, "last");
        s.party = new List<string>();
        var excluded = new[] { "item_wood", "item_berry", "item_crystal", "item_axe", "item_bigbag" };
        var others = GameData.Items.Keys.Where(k => !excluded.Contains(k)).ToList();
        while (s.inventory.Count < 19) s.inventory.Add(new ItemStack(others[s.inventory.Count], 1));
        var p2 = Travel.PickUpLostBag(s);
        c.Ok("背包只剩 1 格：能放的先拿，放不下的留在失物包里", p2.took.Count == 1 && p2.left.Count == 2 && s.expedition.lostBag.items.Count == 2);
        var badBag = New(); badBag.expedition = new ExpeditionState { seed = 1, lostBag = new LostBag { x = double.NaN, y = 1 } };
        c.Ok("失物包坐标不合法的存档会被拒绝", SaveCodec.Validate(badBag).Contains("expedition.lostBag"));
        c.Done();
    }
}
