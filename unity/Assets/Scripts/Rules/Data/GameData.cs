// The game's data tables (items, pets, skills, natures, …), read from Resources/Data/*.json.
// Those files are copied from the web version by tools/unity/export_data.mjs, so both versions use the same numbers.
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Lingmu.Rules
{
    public class Stats { public int hp, atk, def, spd; public int Get(string k) => k switch { "hp" => hp, "atk" => atk, "def" => def, "spd" => spd, _ => throw new ArgumentException(k) }; }

    public class ItemDef
    {
        public string id, name, tag, icon, desc, quip, book;
        public double? netMult;
        public int? food, heal;
        public bool tool;
        [JsonExtensionData] public IDictionary<string, JToken> extra;
    }

    public class EvolutionDef { public string name, skill, stone; }

    public class PetDef
    {
        public string id, name, element, humanForm, food, work, explore;
        [JsonProperty("base")] public Stats baseStats;
        public List<string> skills;
        public double catchRate;
        public EvolutionDef evolution;
    }

    public class EffectDef { public string type, target, stat; public double pct, mult; public int turns; }

    public class SkillDef
    {
        public string id, name, element;
        public int power;
        public int? uses;                 // null = unlimited
        public List<EffectDef> effects;
        public bool evolution;
    }

    public class NatureDef { public string id, name, up, down; }

    public class RecipeDef { public string id, @out, station, unlock; public int n; public Dictionary<string, int> cost; }
    public class CropDef { public string id, name, seed, crop, color; public int days, seedPrice; }
    public class NpcDef
    {
        public string id, name, role; public bool shop;
        public List<string> loves, likes, dislikes;
        public Dictionary<string, List<string>> lines;
    }
    public class HeartGift { public Dictionary<string, int> items; public string line; }
    public class QuestReward { public int? clover, friend; public string recipe; public Dictionary<string, int> items; }
    public class QuestDef
    {
        public string id, npc, after, title, ask, thanks;
        public int? hearts;
        public Dictionary<string, JToken> need;       // item id → count, or "party" → species id
        public QuestReward reward;
    }
    public class ShopEntry { public string id; public int price; }

    public static class GameData
    {
        static bool loaded;
        static Dictionary<string, ItemDef> items;
        static List<PetDef> pets;
        static Dictionary<string, PetDef> petById;
        static Dictionary<string, SkillDef> skills;
        static Dictionary<string, NatureDef> natures;
        static List<string> natureIds, starters, elements;
        static Dictionary<string, JObject> raw = new Dictionary<string, JObject>();
        static List<RecipeDef> recipes;
        static Dictionary<string, CropDef> crops;
        static List<string> cropIds, npcIds, shopBooks;
        static Dictionary<string, int> prices, giftGain;
        static Dictionary<string, NpcDef> npcs;
        static Dictionary<string, Dictionary<int, HeartGift>> heartGifts;
        static List<QuestDef> quests;
        static List<ShopEntry> shop;

        public static IReadOnlyList<RecipeDef> Recipes { get { Load(); return recipes; } }
        public static RecipeDef Recipe(string id) { Load(); return recipes.Find(r => r.id == id) ?? throw new ArgumentException("unknown recipe: " + id); }
        public static IReadOnlyDictionary<string, CropDef> Crops { get { Load(); return crops; } }
        public static IReadOnlyList<string> CropIds { get { Load(); return cropIds; } }
        public static CropDef CropBySeed(string seedId) { Load(); return cropIds.Select(id => crops[id]).FirstOrDefault(c => c.seed == seedId); }
        public static int? Price(string itemId) { Load(); return prices.TryGetValue(itemId, out var p) ? p : (int?)null; }
        public static IReadOnlyDictionary<string, NpcDef> Npcs { get { Load(); return npcs; } }
        public static IReadOnlyList<string> NpcIds { get { Load(); return npcIds; } }
        public static int GiftGain(string taste) { Load(); return giftGain[taste]; }
        static int talkGain, giftsPerWeek, weekDays, bookPrice;
        public static int TalkGain { get { Load(); return talkGain; } }
        public static int GiftsPerWeek { get { Load(); return giftsPerWeek; } }
        public static int WeekDays { get { Load(); return weekDays; } }
        public static int BookPrice { get { Load(); return bookPrice; } }
        public static IReadOnlyDictionary<int, HeartGift> HeartGiftsOf(string npc) { Load(); return heartGifts.TryGetValue(npc, out var g) ? g : new Dictionary<int, HeartGift>(); }
        public static IReadOnlyList<QuestDef> Quests { get { Load(); return quests; } }
        public static QuestDef Quest(string id) { Load(); return quests.Find(q => q.id == id); }
        public static IReadOnlyList<ShopEntry> Shop { get { Load(); return shop; } }
        public static IReadOnlyList<string> ShopBooks { get { Load(); return shopBooks; } }

        public static IReadOnlyDictionary<string, ItemDef> Items { get { Load(); return items; } }
        public static IReadOnlyList<PetDef> Pets { get { Load(); return pets; } }
        public static IReadOnlyDictionary<string, SkillDef> Skills { get { Load(); return skills; } }
        public static IReadOnlyDictionary<string, NatureDef> Natures { get { Load(); return natures; } }
        public static IReadOnlyList<string> NatureIds { get { Load(); return natureIds; } }
        public static IReadOnlyList<string> Starters { get { Load(); return starters; } }
        public static IReadOnlyList<string> Elements { get { Load(); return elements; } }

        // the whole file as JSON (for checks and tools)
        public static JObject Raw(string table) { Load(); return raw[table]; }

        public static PetDef Species(string id) { Load(); return petById.TryGetValue(id, out var p) ? p : throw new ArgumentException("unknown pet species: " + id); }
        public static SkillDef Skill(string id) { Load(); return skills.TryGetValue(id, out var s) ? s : throw new ArgumentException("unknown skill: " + id); }
        public static ItemDef Item(string id) { Load(); return items.TryGetValue(id, out var i) ? i : null; }

        static JObject Read(string table)
        {
            var ta = Resources.Load<TextAsset>("Data/" + table);
            if (!ta) throw new InvalidOperationException("missing data table Resources/Data/" + table + ".json");
            return raw[table] = JObject.Parse(ta.text);
        }

        static void Load()
        {
            if (loaded) return;
            loaded = true;
            items = Read("items")["ITEMS"].ToObject<Dictionary<string, ItemDef>>();
            foreach (var kv in items) kv.Value.id = kv.Key;
            var p = Read("pets");
            pets = p["PETS"].ToObject<List<PetDef>>();
            petById = pets.ToDictionary(x => x.id);
            starters = p["STARTERS"].ToObject<List<string>>();
            skills = Read("skills")["SKILLS"].ToObject<Dictionary<string, SkillDef>>();
            foreach (var kv in skills) kv.Value.id = kv.Key;
            var n = Read("natures");
            natures = n["NATURES"].ToObject<Dictionary<string, NatureDef>>();
            foreach (var kv in natures) kv.Value.id = kv.Key;
            natureIds = n["NATURE_IDS"].ToObject<List<string>>();
            elements = Read("elements")["ELEMENTS"].ToObject<List<string>>();
            recipes = Read("recipes")["RECIPES"].ToObject<List<RecipeDef>>();
            var c = Read("crops");
            crops = c["CROPS"].ToObject<Dictionary<string, CropDef>>();
            foreach (var kv in crops) kv.Value.id = kv.Key;
            cropIds = c["CROP_IDS"].ToObject<List<string>>();
            prices = c["PRICES"].ToObject<Dictionary<string, int>>();
            var npc = Read("npcs");
            npcs = npc["NPCS"].ToObject<Dictionary<string, NpcDef>>();
            foreach (var kv in npcs) kv.Value.id = kv.Key;
            npcIds = npc["NPC_IDS"].ToObject<List<string>>();
            giftGain = npc["GIFT"].ToObject<Dictionary<string, int>>();
            heartGifts = npc["HEART_GIFTS"].ToObject<Dictionary<string, Dictionary<int, HeartGift>>>();
            talkGain = (int)npc["TALK_GAIN"]; giftsPerWeek = (int)npc["GIFTS_PER_WEEK"]; weekDays = (int)npc["WEEK_DAYS"];
            var q = Read("quests");
            quests = q["QUESTS"].ToObject<List<QuestDef>>();
            shop = q["SHOP"].ToObject<List<ShopEntry>>();
            shopBooks = q["SHOP_BOOKS"].ToObject<List<string>>();
            bookPrice = (int)q["BOOK_PRICE"];
        }
    }
}
