// Exact parity with the web version: the reference file Data/parity_ref.json is written by
// tools/unity/export_parity.mjs from the web rule code. Each case is one text line; the C# port must build
// exactly the same line (islands, auto-played battles, chest loot, gathering drops, daily tasks, shop stock,
// resident lines, pet work, island seeds).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Lingmu.Core;
using Lingmu.Rules;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using UnityEngine;

public class RulesParityTests
{
    static JObject refData;
    static JObject Ref => refData ??= JObject.Parse(File.ReadAllText(Path.Combine(Application.dataPath, "Tests/EditMode/Data/parity_ref.json")));

    static string B(bool v) => v ? "true" : "false";
    static string Grid(bool[][] g) => string.Join("/", g.Select(row => string.Concat(row.Select(v => v ? '1' : '0'))));
    static string Things(List<IslandThing> list, Func<IslandThing, string> f) => string.Join(";", list.Select(f));

    static string IslandLine(IslandMap i) => string.Join("|", new[]
    {
        i.seed.ToString(), i.requestedSeed.ToString(), i.attempts.ToString(), B(i.fallback), i.area.ToString(),
        $"L{i.landing.tx},{i.landing.ty}", $"A{i.airship.tx},{i.airship.ty}", Grid(i.walk), Grid(i.water),
        Things(i.camps, c => $"{c.id}@{c.tx},{c.ty}"),
        Things(i.chests, c => $"{c.id}@{c.tx},{c.ty}{(c.bonus ? "b" : "")}"),
        Things(i.resources, r => $"{r.id}:{r.type}@{r.tx},{r.ty}{(r.rare ? "r" : "")}"),
        Things(i.pets, p => $"{p.id}:{p.species}@{p.tx},{p.ty}"),
        Things(i.thorns, t => $"{t.id}@{t.tx},{t.ty}"),
        Things(i.rare, r => $"{r.kind}:{r.id}@{r.tx},{r.ty}"),
    });

    static void EachCase(string table, Action<JToken> check)
    {
        var fails = new List<string>();
        foreach (var c in Ref[table]) { try { check(c); } catch (AssertionException e) { fails.Add(e.Message.Trim()); } }
        Assert.IsEmpty(fails, $"{table}: {fails.Count} 个不一致\n" + string.Join("\n", fails.Take(3)));
    }

    static void Same(string want, string got, string label)
    {
        if (want == got) return;
        int k = 0; while (k < want.Length && k < got.Length && want[k] == got[k]) k++;
        Assert.Fail($"{label}: 从第 {k} 个字符开始不同\n  网页: …{want.Substring(Math.Max(0, k - 40), Math.Min(120, want.Length - Math.Max(0, k - 40)))}\n  Unity: …{got.Substring(Math.Max(0, k - 40), Math.Min(120, got.Length - Math.Max(0, k - 40)))}");
    }

    [Test] public void 岛屿生成与网页版完全一致() => EachCase("islands", c => Same((string)c["line"], IslandLine(IslandGen.Generate((int)c["seed"])), $"种子 {c["seed"]}"));

    // ---------- battles ----------
    static string Num(int? v) => v?.ToString() ?? "";
    static string EvLine(BattleEvent e)
    {
        bool hasAmount = e.t == "damage" || e.t == "heal" || e.t == "exp", hasHp = e.t == "damage" || e.t == "heal";
        return string.Join(":", e.t, e.side ?? "", hasAmount ? e.amount.ToString() : "", hasHp ? e.hp.ToString() : "", e.eff ?? "", e.skill ?? "",
            e.t == "send" ? e.index.ToString() : "", e.result ?? "", e.t == "throw" ? e.rate.ToString("F6", System.Globalization.CultureInfo.InvariantCulture) : "");
    }
    static string PetLine(PetInstance p) => string.Join(":", p.uid, p.species, p.level, p.exp, p.hp?.ToString() ?? "full", p.affection, p.stars, p.nature, B(p.shiny), string.Join("+", p.skills));
    static string Obj(IEnumerable<KeyValuePair<string, int>> d) => "{" + string.Join(",", d.Select(kv => $"\"{kv.Key}\":{kv.Value}")) + "}";

    [Test] public void 自动对战与网页版完全一致()
    {
        var pool = GameData.Pets.Select(p => p.id).ToList();
        EachCase("battles", c =>
        {
            int i = (int)c["i"];
            var r = new Mulberry32((long)i * 7919 + 13); Func<double> rng = r.Next;
            var starter = GameData.Starters[i % 3]; int day = 1 + i % 12;
            var st = SaveRules.NewGameState(1, starter: starter);
            st.pets[0].level = 3 + i % 9;
            st.expedition = new ExpeditionState { seed = i }; st.player.area = "expedition";
            var foes = Battle.MakeWildGroup(pool[i % 6], PetMath.WildLevel(day, rng), i * 31, i % 5, day, pool);
            Same((string)c["foes"], string.Join(" ", foes.Select(PetLine)), $"对战 {i} 野生宠物");
            var b = Battle.Create(new List<PetInstance> { st.pets[0] }, foes, st.inventory, rng, i % 7 == 0);
            var log = new List<string>();
            for (int k = 0; k < 80 && b.over == null; k++)
            {
                var a = Battle.AutoAction(b);
                if (k == 1 && i % 3 == 0) a = BattleAction.Snack("item_carrot");
                if (k == 2 && i % 4 == 0) a = BattleAction.Catch("item_net_grass");
                var res = Battle.ResolveTurn(b, a);
                log.Add(res.ok ? string.Join(" ", res.events.Select(EvLine)) : $"x:{res.reason}");
            }
            Same((string)c["log"], string.Join(" | ", log), $"对战 {i} 过程");
            var sum = Battle.Finish(st, b, $"w{i}");
            var end = string.Join("|", b.over, b.clover, Obj(b.exp), string.Join(",", sum.exp.Select(x => $"{x.name}+{x.amount}")),
                string.Join(",", sum.levelUps.Select(x => $"{x.name}>{x.level}")), sum.caught != null ? $"{sum.caught.uid}:{B(sum.caught.joined)}:{sum.caught.affection}" : "-");
            Same((string)c["end"], end, $"对战 {i} 结果");
            var state = string.Join("|", st.clover, string.Join(" ", st.pets.Select(PetLine)), string.Join(",", st.inventory.Select(x => $"{x.id}x{x.count}")),
                string.Join(",", st.party), string.Join(",", st.expedition.changes.pets), Obj(st.flags.stats));
            Same((string)c["state"], state, $"对战 {i} 存档");
        });
    }

    // ---------- loot, drops, daily, shop, talk, work, seeds ----------
    static string Items(IEnumerable<KeyValuePair<string, int>> d) => string.Join(",", d.Select(kv => $"{kv.Key}x{kv.Value}"));

    [Test] public void 宝箱掉落与网页版完全一致() => EachCase("chests", c =>
    {
        var l = Camp.ChestLoot((int)c["seed"], (string)c["id"], (bool)c["bonus"]);
        Same((string)c["line"], $"{Items(l.items)}|{l.clover}", $"宝箱 {c["seed"]}/{c["id"]}");
    });

    [Test] public void 雾晶掉落与网页版完全一致() => EachCase("gathers", c =>
    {
        var st = SaveRules.NewGameState(1);
        st.expedition = new ExpeditionState { seed = (int)c["seed"] }; st.player.area = "expedition";
        st.inventory = new List<ItemStack> { new ItemStack("item_pickaxe", 1) };
        Same((string)c["line"], Items(Crafting.GatherAt(st, (string)c["id"], "crystal").gains), $"雾晶 {c["seed"]}");
    });

    static GameState Day(int seed, int day) { var s = SaveRules.NewGameState(1, seed); s.day = day; return s; }

    [Test] public void 每日任务与网页版完全一致() => EachCase("daily", c => Same((string)c["line"], string.Join(",", Daily.Ensure(Day((int)c["seed"], (int)c["day"])).tasks.Select(t => t.id)), $"每日任务 {c["seed"]}/{c["day"]}"));

    [Test] public void 杂货铺商品与网页版完全一致() => EachCase("stock", c => Same((string)c["line"], string.Join(",", Town.Stock(Day((int)c["seed"], (int)c["day"])).Select(x => $"{x.id}@{x.price}")), $"杂货铺 {c["seed"]}/{c["day"]}"));

    [Test] public void 居民台词与网页版完全一致() => EachCase("talks", c => Same((string)c["line"], Town.Talk(Day((int)c["seed"], (int)c["day"]), (string)c["npc"]).line, $"台词 {c["npc"]} {c["seed"]}/{c["day"]}"));

    [Test] public void 新岛种子与网页版完全一致() => EachCase("seeds", c =>
    {
        var s = new GameState { seed = (int)c["seed"], day = (int)c["day"], flags = new Flags { trips = (int)c["trips"] } };
        Assert.AreEqual((int)c["value"], Travel.NewIslandSeed(s), $"新岛种子 {c["seed"]}/{c["day"]}/{c["trips"]}");
    });

    [Test] public void 宠物打工与网页版完全一致() => EachCase("work", c =>
    {
        int day = (int)c["day"];
        var st = SaveRules.NewGameState(1);
        st.day = day; st.party = new List<string> { "pet-acorn" };
        foreach (var id in new[] { "pet-pup", "pet-fox", "pet-shark", "pet-shadecat", "pet-starbear" }) PetCare.SetJob(st, id, true);
        for (int k = 0; k < st.pets.Count; k++) st.pets[k].affection = (day * 13 + k * 29) % 101;
        st.farm.plots["1,1"] = new FarmPlot { tilled = true, crop = "carrot", days = 0, watered = false };
        st.farm.plots["2,1"] = new FarmPlot { tilled = true, crop = "pumpkin", days = 1, watered = day % 2 == 0 };
        var lines = PetCare.RunPetWork(st);
        var got = string.Join("|", string.Join(" / ", lines), st.clover, Items(st.storage.Select(x => new KeyValuePair<string, int>(x.id, x.count))), string.Join(",", st.farm.plots.Values.Select(p => B(p.watered))));
        Same((string)c["line"], got, $"打工 第 {day} 天");
    });
}
