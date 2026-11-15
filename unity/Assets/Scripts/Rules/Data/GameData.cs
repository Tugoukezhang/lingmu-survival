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

        public static IReadOnlyDictionary<string, ItemDef> Items { get { Load(); return items; } }
        public static IReadOnlyList<PetDef> Pets { get { Load(); return pets; } }
        public static IReadOnlyDictionary<string, SkillDef> Skills { get { Load(); return skills; } }
        public static IReadOnlyDictionary<string, NatureDef> Natures { get { Load(); return natures; } }
        public static IReadOnlyList<string> NatureIds { get { Load(); return natureIds; } }
        public static IReadOnlyList<string> Starters { get { Load(); return starters; } }
        public static IReadOnlyList<string> Elements { get { Load(); return elements; } }

        // a table not yet typed (recipes, crops, npcs, quests): the whole file as JSON
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
            foreach (var t in new[] { "recipes", "crops", "npcs", "quests" }) Read(t);
        }
    }
}
