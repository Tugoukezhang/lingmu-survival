// The whole game state, one object, saved as JSON (web version: game/src/systems/save.js newGameState).
// Field names follow the web save so the two stay comparable. Fields of systems not yet ported are kept as they are
// ([JsonExtensionData]) instead of being lost.
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
    }

    public class PlayerState
    {
        public string area = "home";
        public double? x, y;
        public int hp = 100, hpMax = 100, hunger = 100, hungerMax = 100;
        public int? hungerAcc;                    // minutes towards the next −1 fullness
        public double? torchUntil;
        [JsonExtensionData] public IDictionary<string, JToken> extra;
    }

    public class PetInstance
    {
        public string uid, species, nature = "gentle", form = "animal";
        public int level = 1, exp, stars = 3, affection;
        public bool shiny, evolved, canTransform;
        public List<string> skills = new List<string>();
        public Dictionary<string, string> cosmetics = new Dictionary<string, string>();
        public int? hp;                           // null = full
        [JsonExtensionData] public IDictionary<string, JToken> extra;
    }

    public class GuideState { public int step; public Dictionary<string, int> @base = new Dictionary<string, int>(); public bool off; }

    public class Flags
    {
        public Dictionary<string, int> stats;
        public GuideState guide;
        public Dictionary<string, bool> tips;
        public string starter;
        [JsonExtensionData] public IDictionary<string, JToken> extra;
    }

    public class GameState
    {
        public int version;
        public long createdAt, savedAt;
        public int seed, day = 1, clock = 6 * 60, clover = 120;
        public PlayerState player = new PlayerState();
        public List<ItemStack> inventory = new List<ItemStack>();
        public JObject farm, town, world, house, expedition;          // typed when their systems arrive
        public List<string> recipes = new List<string>();
        public List<PetInstance> pets = new List<PetInstance>();
        public List<string> party = new List<string>();
        public Flags flags = new Flags();
        [JsonExtensionData] public IDictionary<string, JToken> extra;

        public string ToJson() => JsonConvert.SerializeObject(this, Formatting.None, new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore });
        public static GameState FromJson(string json) => JsonConvert.DeserializeObject<GameState>(json);
    }
}
