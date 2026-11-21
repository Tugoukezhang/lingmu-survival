// What to do next and where (docs/20 第三节 1): one goal per line (新手 / 主线 / 小镇 / 研究 / 每日), the first one is what
// the goal note shows unless the player picked another. Each goal names an area and a place in it; the scene's Area turns
// the place into a position for the arrow, and Exit() says which way out leads towards another area.
using System.Collections.Generic;
using System.Linq;

namespace Lingmu.Rules
{
    public class GoalView
    {
        public string id, line, text, area, place;   // area null = no place (done in a panel); place = a spot kind, "kind:key" for one thing
        public int have = -1, need;                   // progress for counted goals, -1 = none
    }

    public static class Goals
    {
        public static readonly Dictionary<string, string> LineNames = new Dictionary<string, string>
        {
            { "guide", "新手" }, { "main", "主线" }, { "town", "小镇" }, { "research", "研究" }, { "daily", "每日" },
        };

        // where each daily task is done (the stat it counts)
        static readonly Dictionary<string, (string area, string place)> DailyPlace = new Dictionary<string, (string, string)>
        {
            { "water", ("home", "plot:water") }, { "plant", ("home", "plot:plant") }, { "harvest", ("home", "plot:harvest") },
            { "shipped", ("home", "ship") }, { "gather", ("expedition", "gather") }, { "wins", ("expedition", "wild") },
            { "catches", ("expedition", "wild") }, { "chests", ("expedition", "chest") }, { "talk", ("town", "npc") },
        };

        public static List<GoalView> All(GameState s)
        {
            var list = new List<GoalView>();
            var g = Guide.Current(s);
            if (g != null) list.Add(new GoalView { id = "guide:" + g.id, line = "guide", text = g.text, area = g.area, place = g.place });
            else
            {
                var main = Main(s);
                if (main != null) list.Add(main);
            }
            var town = TownGoal(s);
            if (town != null) list.Add(town);
            var daily = DailyGoal(s);
            if (daily != null) list.Add(daily);
            return list;
        }

        // the goal the note shows: the one the player picked if it is still there, else the first
        public static GoalView Pick(GameState s, string chosenId)
        {
            var all = All(s);
            return all.FirstOrDefault(x => x.id == chosenId) ?? all.FirstOrDefault();
        }

        // the main story line (A 线). Until the story chapters arrive (docs/20 第 5 批) it only sends you to the town once.
        static GoalView Main(GameState s)
        {
            if (Guide.Stat(s, "talk") < 1) return new GoalView { id = "main:town", line = "main", text = "过吊桥去风铃小镇，和居民打个招呼", area = "town", place = "npc:granny" };
            return null;
        }

        // a resident's request you can hand in now, else a new one waiting
        static GoalView TownGoal(GameState s)
        {
            if (Guide.Stat(s, "talk") < 1) return null;
            foreach (var q in GameData.Quests.Where(q => Town.QuestState(s, q.id) == "active"))
                if (Town.Missing(s, q.id).Count == 0)
                    return new GoalView { id = "town:" + q.id, line = "town", text = $"把「{q.title}」要的东西交给{GameData.Npcs[q.npc].name}", area = "town", place = "npc:" + q.npc };
            foreach (var npc in GameData.NpcIds)
            {
                var offer = Town.Offers(s, npc).FirstOrDefault();
                if (offer != null) return new GoalView { id = "town:offer:" + offer.id, line = "town", text = $"{GameData.Npcs[npc].name}有新的委托", area = "town", place = "npc:" + npc };
            }
            return null;
        }

        // the first unfinished daily task that has a place
        static GoalView DailyGoal(GameState s)
        {
            var d = Daily.Ensure(s);
            foreach (var t in d.tasks)
            {
                if (t.done) continue;
                DailyPlace.TryGetValue(t.stat, out var at);
                return new GoalView { id = "daily:" + t.id, line = "daily", text = t.text, area = at.area, place = at.place, have = Daily.Progress(s, t), need = t.n };
            }
            return null;
        }

        // the spot kind in `from` that leads towards `to` (home is the hub: the bridge to town, the door to the cottage,
        // the dock to the expedition island)
        public static string Exit(string from, string to)
        {
            if (from == to || to == null) return null;
            return from switch
            {
                "home" => to switch { "town" => "bridge", "house" => "door", "expedition" => "dock", _ => null },
                "town" => "home",
                "house" => "door",
                "expedition" => "airship",
                _ => null,
            };
        }

        public static string AreaName(string area) => area switch { "home" => "家园", "town" => "风铃小镇", "house" => "小屋", "expedition" => "远征岛", _ => "" };
    }
}
