// New-player guide, one-time tips and daily tasks (systems/guide.js, systems/daily.js; T42, T44).
// Progress counters live in state.flags.stats and are bumped by the systems themselves.
using System;
using System.Collections.Generic;
using System.Linq;
using Lingmu.Core;

namespace Lingmu.Rules
{
    // shared result shape: ok, or a reason code the UI turns into text
    public class Res
    {
        public bool ok; public string reason;
        public static Res Ok() => new Res { ok = true };
        public static Res No(string reason) => new Res { reason = reason };
    }

    public static class Guide
    {
        // area + place: where the goal is done, for the arrow (Goals.cs); no area = done in a panel
        public class Goal { public string id, text, stat, altStat, area, place; public int n, altN; public Func<GameState, bool> check; }

        // day 1 (docs/20, GPT review 11-21): the first wild pet is caught from behind before anything else is asked of the
        // player; a battle is optional
        public static readonly Goal[] Goals =
        {
            new Goal { id = "depart", text = "去飞艇码头，坐飞艇出发", check = s => s.player.area == "expedition" || Stat(s, "trips") > 0, area = "home", place = "dock" },
            new Goal { id = "catch", text = "从背后悄悄靠近野生宠物，按「扔网」抓一只（第一网一定成功）", stat = "catches", n = 1, area = "expedition", place = "wild" },
            new Goal { id = "gather", text = "采集 3 次：走到树、石头、草丛旁按「采集」", stat = "gather", n = 3, area = "expedition", place = "gather" },
            new Goal { id = "axe", text = "点右上「制作」，做一把石斧（砍树一次得 3 木材）", check = s => Inventory.CountOf(s.inventory, "item_axe") > 0 },
            new Goal { id = "return", text = "20 点会起雾，天黑前坐飞艇回家", stat = "returns", n = 1, altStat = "campSleeps", altN = 1, area = "expedition", place = "airship" },
            new Goal { id = "sleep", text = "回帐篷睡觉。明早去风铃小镇看看", stat = "sleeps", n = 1, area = "home", place = "tent" },
        };

        public static Dictionary<string, int> Stats(GameState s) => s.flags.stats ??= new Dictionary<string, int>();
        public static int Stat(GameState s, string key) => Stats(s).TryGetValue(key, out var v) ? v : 0;
        public static void Bump(GameState s, string key, int n = 1) { var st = Stats(s); st[key] = (st.TryGetValue(key, out var v) ? v : 0) + n; }

        public static GuideState State(GameState s) => s.flags.guide ??= new GuideState { step = 0, @base = new Dictionary<string, int>(Stats(s)), off = false };

        public static Goal Current(GameState s) { var g = State(s); return g.off || g.step >= Goals.Length ? null : Goals[g.step]; }

        static bool Grew(GameState s, GuideState g, string key, int n) => Stat(s, key) - (g.@base.TryGetValue(key, out var b) ? b : 0) >= n;

        // advances the guide; returns the goal just completed (or null)
        public static Goal Check(GameState s)
        {
            var g = State(s);
            if (g.off || g.step >= Goals.Length) return null;
            var goal = Goals[g.step];
            bool done = goal.check != null ? goal.check(s) : Grew(s, g, goal.stat, goal.n) || (goal.altStat != null && Grew(s, g, goal.altStat, goal.altN));
            if (!done) return null;
            g.step += 1;
            g.@base = new Dictionary<string, int>(Stats(s));
            return goal;
        }

        public static bool Done(GameState s) => State(s).step >= Goals.Length;
        public static void SetOff(GameState s, bool off) => State(s).off = off;

        public class Tip { public string id, text; public Func<GameState, bool> when; }
        public static readonly Tip[] Tips =
        {
            new Tip { id = "night", when = s => s.player.area == "expedition" && (s.clock >= 20 * 60 || s.clock < 6 * 60), text = "起雾了！雾怪会在你脚下画红圈——看到就走开。站在营火或火把的光里最安全。" },
            new Tip { id = "hungry", when = s => s.player.hunger <= 30, text = "肚子饿了：打开背包，点食物再点「使用」就能吃。" },
            new Tip { id = "lowhp", when = s => s.player.area == "expedition" && s.player.hp <= 40, text = "生命不多了：吃烤鱼、蔬菜汤能回血；倒下会把背包里的东西掉在岛上。" },
        };

        // the tip text the first time its condition is true, otherwise null
        public static string NextTip(GameState s)
        {
            var seen = s.flags.tips ??= new Dictionary<string, bool>();
            var tip = Tips.FirstOrDefault(t => !(seen.TryGetValue(t.id, out var v) && v) && t.when(s));
            if (tip == null) return null;
            seen[tip.id] = true;
            return tip.text;
        }
    }

    public static class Daily
    {
        public const int TaskReward = 20, AllBonus = 30;
        public class PoolTask { public string id, stat, text; public int n, minDay; }
        public static readonly PoolTask[] Pool =
        {
            new PoolTask { id = "water", stat = "water", n = 4, text = "给作物浇水 4 次", minDay = 1 },
            new PoolTask { id = "feed", stat = "feed", n = 2, text = "喂宠物 2 次", minDay = 1 },
            new PoolTask { id = "pet", stat = "pet", n = 3, text = "摸摸宠物 3 次", minDay = 1 },
            new PoolTask { id = "gather", stat = "gather", n = 6, text = "在远征岛采集 6 次", minDay = 1 },
            new PoolTask { id = "plant", stat = "plant", n = 3, text = "在农田播种 3 次", minDay = 1 },
            new PoolTask { id = "craft", stat = "craft", n = 1, text = "制作 1 件东西", minDay = 1 },
            new PoolTask { id = "wins", stat = "wins", n = 1, text = "打赢 1 场宠物对战", minDay = 2 },
            new PoolTask { id = "chests", stat = "chests", n = 1, text = "打开 1 个宝箱", minDay = 2 },
            new PoolTask { id = "shipped", stat = "shipped", n = 60, text = "往出货箱放价值 60 的东西", minDay = 2 },
            new PoolTask { id = "harvest", stat = "harvest", n = 2, text = "收获作物 2 次", minDay = 4 },
            new PoolTask { id = "catches", stat = "catches", n = 1, text = "抓到 1 只宠物", minDay = 3 },
            new PoolTask { id = "talk", stat = "talk", n = 2, text = "和小镇居民聊天 2 次", minDay = 2 },
        };

        public static DailyState Ensure(GameState s)
        {
            if (s.daily != null && s.daily.day == s.day) return s.daily;
            var rng = new Mulberry32((long)s.seed * 31 + (long)s.day * 7877 + 5);
            var pool = Pool.Where(t => t.minDay <= s.day).ToList();
            var tasks = new List<DailyTask>();
            while (tasks.Count < 3 && pool.Count > 0)
            {
                int i = (int)Math.Floor(rng.Next() * pool.Count);
                var t = pool[i]; pool.RemoveAt(i);
                tasks.Add(new DailyTask { id = t.id, stat = t.stat, n = t.n, text = t.text, done = false });
            }
            return s.daily = new DailyState { day = s.day, tasks = tasks, @base = new Dictionary<string, int>(Guide.Stats(s)), bonus = false };
        }

        public static int Progress(GameState s, DailyTask t) => Math.Min(t.n, Guide.Stat(s, t.stat) - (s.daily.@base.TryGetValue(t.stat, out var b) ? b : 0));

        public class CheckResult { public List<DailyTask> done = new List<DailyTask>(); public bool bonus; public int bonusClover; public string bonusSeed; }

        // gives rewards for newly finished tasks
        public static CheckResult Check(GameState s)
        {
            var d = Ensure(s);
            var r = new CheckResult();
            foreach (var t in d.tasks)
            {
                if (t.done || Progress(s, t) < t.n) continue;
                t.done = true;
                s.clover += TaskReward;
                r.done.Add(t);
            }
            if (!d.bonus && d.tasks.Count > 0 && d.tasks.All(t => t.done))
            {
                d.bonus = true;
                s.clover += AllBonus;
                var seed = GameData.Crops[GameData.CropIds[(s.day * 3) % GameData.CropIds.Count]].seed;
                Inventory.AddItem(s.inventory, seed, 1, int.MaxValue);
                r.bonus = true; r.bonusClover = AllBonus; r.bonusSeed = seed;
            }
            return r;
        }
    }
}
