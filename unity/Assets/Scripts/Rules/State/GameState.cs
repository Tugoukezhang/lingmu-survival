// The whole game state, one object, saved as JSON (web version: game/src/systems/save.js newGameState).
// Field names follow the web save so the two stay comparable. Unknown fields are kept ([JsonExtensionData])
// instead of being lost.
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Lingmu.Rules
{
    public class ItemStack
    {
        public string id; public int count;
        public ItemStack() { }
        public ItemStack(string id, int count) { this.id = id; this.count = count; }
        public ItemStack Clone() => new ItemStack(id, count);
    }

    public class PlayerState
    {
        public string area = "home";
        public double? x, y;                      // null = arrive at the default spot
        public int hp = 100, hpMax = 100, hunger = 100, hungerMax = 100;
        public int? hungerAcc;                    // minutes towards the next −1 fullness
        public int? torchUntil;                   // absolute game minute
        [JsonExtensionData] public IDictionary<string, JToken> extra;
    }

    public class BondState { public int day, battle, trip; }

    public class PetInstance
    {
        public string uid, species, nature = "gentle", form = "animal";
        public int level = 1, exp, stars = 3, affection;
        public bool shiny, evolved, canTransform;
        public List<string> skills = new List<string>();
        public Dictionary<string, string> cosmetics = new Dictionary<string, string>();
        public int? hp;                           // null = full
        public bool job;                          // working at home
        public int? fedDay, pettedDay;
        public BondState bond;
        [JsonExtensionData] public IDictionary<string, JToken> extra;
        public PetInstance Clone() => JsonConvert.DeserializeObject<PetInstance>(JsonConvert.SerializeObject(this));
    }

    public class GuideState { public int step; public Dictionary<string, int> @base = new Dictionary<string, int>(); public bool off; }

    public class Flags
    {
        public Dictionary<string, int> stats;
        public GuideState guide;
        public Dictionary<string, bool> tips;
        public string starter, arriveAt;
        public int? trips;
        [JsonExtensionData] public IDictionary<string, JToken> extra;
    }

    public class FarmPlot
    {
        public bool tilled; public string crop; public int days; public bool watered;
        public FarmPlot Clone() => (FarmPlot)MemberwiseClone();
    }
    public class FarmState { public Dictionary<string, FarmPlot> plots = new Dictionary<string, FarmPlot>(); public List<ItemStack> shipping = new List<ItemStack>(); }

    public class GiftWeek { public int week, n; }
    public class TownState
    {
        public Dictionary<string, int> friend = new Dictionary<string, int>(), talkDay = new Dictionary<string, int>(), giftDay = new Dictionary<string, int>();
        public Dictionary<string, string> quests = new Dictionary<string, string>();   // id → active | done
        public Dictionary<string, GiftWeek> giftWeek;
        public Dictionary<string, List<int>> heartGifts;
    }

    public class WorldState { public bool expanded, bridge; }
    public class HouseItem { public string id; public int x, y, rot; }
    public class HouseState { public List<HouseItem> items = new List<HouseItem>(); }

    public class IslandChanges
    {
        public List<string> collected = new List<string>(), chests = new List<string>(), pets = new List<string>(), thorns = new List<string>();
    }
    public class Campfire { public string id; public int tx, ty, until; }
    public class LostBag { public double x, y; public List<ItemStack> items = new List<ItemStack>(); }
    public class ExpeditionState
    {
        public int seed; public string biome = "mistwood";
        public IslandChanges changes = new IslandChanges();
        public LostBag lostBag;
        public List<Campfire> fires;
        [JsonExtensionData] public IDictionary<string, JToken> extra;
    }

    public class DexEntry { public bool seen, caught, shiny; }
    public class DailyTask { public string id, stat, text; public int n; public bool done; }
    public class DailyState { public int day; public List<DailyTask> tasks = new List<DailyTask>(); public Dictionary<string, int> @base = new Dictionary<string, int>(); public bool bonus; }

    public class GameState
    {
        public int version;
        public long createdAt, savedAt;
        public int seed, day = 1, clock = 6 * 60, clover = 120;
        public PlayerState player = new PlayerState();
        public List<ItemStack> inventory = new List<ItemStack>();
        public List<ItemStack> storage;                                // home storage (pet work, overflow)
        public FarmState farm;
        public TownState town;
        public WorldState world;
        public HouseState house;
        public ExpeditionState expedition;
        public List<string> recipes = new List<string>();
        public List<PetInstance> pets = new List<PetInstance>();
        public List<string> party = new List<string>();
        public Dictionary<string, int> crystals;
        public Dictionary<string, DexEntry> dex;
        public DailyState daily;
        public Flags flags = new Flags();
        [JsonExtensionData] public IDictionary<string, JToken> extra;

        public PetInstance Pet(string uid) => pets.Find(p => p.uid == uid);

        static readonly JsonSerializerSettings Json = new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore };
        public string ToJson() => JsonConvert.SerializeObject(this, Formatting.None, Json);
        public static GameState FromJson(string json) => JsonConvert.DeserializeObject<GameState>(json);
        public GameState Clone() => FromJson(ToJson());
    }
}
