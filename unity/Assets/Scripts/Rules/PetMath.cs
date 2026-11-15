// Elements and pet formulas, ported 1:1 from the web version (data/elements.js, systems/petMath.js;
// docs/02 第 1/2/5/6 节, docs/07 第 2–6 节). Randomness always comes from an injected rng() in [0, 1).
using System;
using System.Collections.Generic;
using System.Linq;

namespace Lingmu.Rules
{
    public static class Elements
    {
        public const string Normal = "普通";
        static readonly Dictionary<string, string> Beats = new Dictionary<string, string> { { "水", "火" }, { "火", "森" }, { "森", "水" } };

        // 水克火、火克森、森克水 (×1.5, reverse ×0.67); 光 and 暗 hit each other ×1.5.
        public static double Multiplier(string attack, string defend)
        {
            if (string.IsNullOrEmpty(attack) || attack == Normal || string.IsNullOrEmpty(defend)) return 1;
            if (Beats.TryGetValue(attack, out var b) && b == defend) return 1.5;
            if (Beats.TryGetValue(defend, out var d) && d == attack) return 0.67;
            if ((attack == "光" && defend == "暗") || (attack == "暗" && defend == "光")) return 1.5;
            return 1;
        }
    }

    public struct StatBlock { public int hp, atk, def, spd; }

    public static class PetMath
    {
        public const int MaxLevel = 30, Skill3Level = 5, RegularSlots = 3, EvolveLevel = 12, EvolveAffection = 30;
        public const double EvolveBaseMult = 1.25, BaseGrowth = 0.08, ShinyChance = 0.01, CatchCap = 0.95;
        public static readonly Dictionary<int, double> StarFactor = new Dictionary<int, double> { { 1, 0.8 }, { 2, 0.9 }, { 3, 1.0 }, { 4, 1.1 }, { 5, 1.2 } };
        public static readonly (int stars, double p)[] StarOdds = { (1, 0.30), (2, 0.30), (3, 0.25), (4, 0.12), (5, 0.03) };
        public static readonly string[] StatNames = { "hp", "atk", "def", "spd" };

        // floor that ignores float noise like 12.999999999 (all formulas round down)
        public static int IFloor(double x) => (int)Math.Floor(x + 1e-9);

        // ---------- rolls ----------
        public static int RollStars(Func<double> rng)
        {
            double r = rng();
            foreach (var (stars, p) in StarOdds) { if (r < p) return stars; r -= p; }
            return 5;
        }
        public static string RollNature(Func<double> rng) => GameData.NatureIds[(int)Math.Floor(rng() * GameData.NatureIds.Count)];
        public static bool RollShiny(Func<double> rng) => rng() < ShinyChance;

        // ---------- pet instances ----------
        static int uidCounter;
        static readonly Random fallback = new Random();

        public static PetInstance CreatePet(string speciesId, int level = 1, Func<double> rng = null, int? stars = null, string nature = null, bool? shiny = null, string uid = null)
        {
            rng ??= () => fallback.NextDouble();
            var sp = GameData.Species(speciesId);
            int lv = Math.Max(1, Math.Min(MaxLevel, level));
            return new PetInstance
            {
                uid = uid ?? $"p{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds():x}{uidCounter++:x}",
                species = sp.id,
                level = lv,
                exp = 0,
                stars = stars ?? RollStars(rng),
                nature = nature ?? RollNature(rng),
                shiny = shiny ?? RollShiny(rng),
                evolved = false,
                affection = 0,
                skills = sp.skills.Take(level >= Skill3Level ? 3 : 2).ToList(),
                form = "animal",
                canTransform = false,
            };
        }

        // starter pets: fixed 3 stars, 温和, not shiny
        public static PetInstance CreateStarter(string speciesId, int level = 1, string uid = null) => CreatePet(speciesId, level, null, 3, "gentle", false, uid);

        public static List<string> BattleSkills(PetInstance pet)
        {
            var list = new List<string>(pet.skills);
            if (pet.evolved) list.Add(GameData.Species(pet.species).evolution.skill);
            return list;
        }

        public static string DisplayName(PetInstance pet) { var sp = GameData.Species(pet.species); return pet.evolved ? sp.evolution.name : sp.name; }

        // ---------- stats ----------
        // base (×1.25 if evolved) → growth by level and stars → nature → (battle) affection
        public static StatBlock CalcStats(PetInstance pet, bool inBattle = false)
        {
            var sp = GameData.Species(pet.species);
            double rate = BaseGrowth * StarFactor[pet.stars];
            GameData.Natures.TryGetValue(pet.nature ?? "gentle", out var nat);
            nat ??= GameData.Natures["gentle"];
            int Calc(string k)
            {
                int b = sp.baseStats.Get(k);
                if (pet.evolved) b = IFloor(b * EvolveBaseMult);
                int v = IFloor(b * (1 + rate * (pet.level - 1)));
                if (nat.up == k) v = IFloor(v * 1.1);
                if (nat.down == k) v = IFloor(v * 0.9);
                return v;
            }
            var s = new StatBlock { hp = Calc("hp"), atk = Calc("atk"), def = Calc("def"), spd = Calc("spd") };
            if (inBattle) s.atk = IFloor(s.atk * AffectionAttackMult(pet.affection));
            return s;
        }

        public static double AffectionAttackMult(int aff) => aff >= 100 ? 1.10 : aff >= 50 ? 1.05 : 1;

        // ---------- experience ----------
        public static int ExpToNext(int level) => 20 * level;
        public static int ExpForKO(int enemyLevel) => 8 * enemyLevel;

        // adds exp, levels up as many times as needed; returns the number of levels gained
        public static int GainExp(PetInstance pet, int amount)
        {
            if (pet.level >= MaxLevel) { pet.exp = 0; return 0; }
            pet.exp += amount;
            int before = pet.level, gained = 0;
            while (pet.level < MaxLevel && pet.exp >= ExpToNext(pet.level)) { pet.exp -= ExpToNext(pet.level); pet.level++; gained++; }
            if (pet.level >= MaxLevel) pet.exp = 0;
            if (before < Skill3Level && pet.level >= Skill3Level)
            {
                var third = GameData.Species(pet.species).skills[2];
                if (!pet.skills.Contains(third) && pet.skills.Count < RegularSlots) pet.skills.Add(third);
            }
            return gained;
        }

        // wild level: 1 + floor(day / 2), random −1..+1, at least 1
        public static int WildLevel(int day, Func<double> rng) => Math.Max(1, 1 + day / 2 + (int)Math.Floor(rng() * 3) - 1);

        // ---------- battle ----------
        public static double DamageRoll(Func<double> rng) => 0.9 + rng() * 0.2;
        // damage = floor(power × atk ÷ def × 0.4 × matchup × rand(0.9–1.1)) + 1
        public static int CalcDamage(int power, double atk, double def, double mult = 1, double rand = 1) => power == 0 ? 0 : IFloor(power * atk / def * 0.4 * mult * rand) + 1;

        public static int SkillDamage(PetInstance attacker, PetInstance defender, string skillId, double rand = 1, int? atk = null, int? def = null)
        {
            var s = GameData.Skill(skillId);
            int a = atk ?? CalcStats(attacker, true).atk, d = def ?? CalcStats(defender, true).def;
            return CalcDamage(s.power, a, d, Elements.Multiplier(s.element, GameData.Species(defender.species).element), rand);
        }

        // ---------- catching ----------
        // rate = base × (1 − 0.7 × hp ÷ maxHp) × net × bait, capped at 95%; 0 when fainted
        public static double CatchRate(double baseRate, int hp, int maxHp, double netMult = 1, double baitMult = 1)
            => hp <= 0 ? 0 : Math.Min(CatchCap, baseRate * (1 - 0.7 * hp / (double)maxHp) * netMult * baitMult);
        public static double BaitMultiplier(string speciesId, string foodId) => string.IsNullOrEmpty(foodId) ? 1 : GameData.Species(speciesId).food == foodId ? 1.5 : 1.2;
        public static bool CatchSucceeds(double rate, double roll) => roll < rate;
        public static int AffectionOnCatch(bool usedFavouriteBait) => usedFavouriteBait ? 20 : 10;

        // ---------- evolution ----------
        public static (bool ok, List<string> missing) CanEvolve(PetInstance pet, bool hasStone)
        {
            var missing = new List<string>();
            if (pet.evolved) missing.Add("evolved");
            if (pet.level < EvolveLevel) missing.Add("level");
            if (pet.affection < EvolveAffection) missing.Add("affection");
            if (!hasStone) missing.Add("stone");
            return (missing.Count == 0, missing);
        }
        public static bool Evolve(PetInstance pet) { if (pet.evolved) return false; pet.evolved = true; return true; }
    }
}
