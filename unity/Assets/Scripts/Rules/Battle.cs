// Turn-based 3v3 pet battle and sneaking / field catching
// (systems/battle.js, systems/stealth.js; docs/02 第 4–6 节, docs/07 第 7 节, T06, T07, T45).
// The battle works on copies of the pets; only Finish() writes results back to the game state (one commit).
// ResolveTurn() returns a list of events the battle scene plays back.
using System;
using System.Collections.Generic;
using System.Linq;
using Lingmu.Core;

namespace Lingmu.Rules
{
    public class Buff { public string stat; public double mult; public int turns; }

    public class Mon
    {
        public string uid, species, name, element, form;
        public int level, maxHp, hp, affection;
        public StatBlock stats;
        public List<string> skills;
        public Dictionary<string, int> uses;        // int.MaxValue = unlimited
        public List<Buff> buffs = new List<Buff>();
        public bool bondUsed;
        public PetInstance src;                     // original instance (needed to keep a caught wild pet)
        public int Stat(string k) => k switch { "hp" => stats.hp, "atk" => stats.atk, "def" => stats.def, "spd" => stats.spd, _ => throw new ArgumentException(k) };
    }

    public class BattleSide { public List<Mon> mons; public int active; }

    public class BattleEvent
    {
        public string t, side, name, skill, skillName, eff, stat, result, item, itemName;
        public int amount, hp, maxHp, index;
        public bool up, favourite;
        public double rate;
    }

    public class BattleAction
    {
        public string type, skill, item; public int index;
        public static BattleAction Skill(string id) => new BattleAction { type = "skill", skill = id };
        public static BattleAction Switch(int i) => new BattleAction { type = "switch", index = i };
        public static BattleAction Snack(string id) => new BattleAction { type = "snack", item = id };
        public static BattleAction Catch(string id) => new BattleAction { type = "catch", item = id };
        public static BattleAction Flee() => new BattleAction { type = "flee" };
    }

    public class BattleState
    {
        public Func<double> rng;
        public int turn;
        public bool ambush, needSwitch;
        public BattleSide me, foe;
        public List<ItemStack> inventory;                                  // copy; the real one changes on finish
        public Dictionary<string, int> used = new Dictionary<string, int>();   // item → count used in this battle
        public Dictionary<string, double> bait = new Dictionary<string, double>();   // foe uid → best bait multiplier
        public Dictionary<string, int> exp = new Dictionary<string, int>();   // my uid → exp earned
        public int clover;
        public List<string> defeated = new List<string>();
        public string caughtUid; public bool caughtFavourite;
        public string over;                                                // win | lose | flee | caught
        public BattleSide Side(string side) => side == "me" ? me : foe;
    }

    public class TurnResult { public bool ok; public string reason; public List<BattleEvent> events; }

    public class CaughtInfo { public string uid, name; public bool joined, shiny, duplicate; public int affection, stars; }
    public class BattleSummary
    {
        public string result; public int clover;
        public List<(string name, int amount)> exp = new List<(string, int)>();
        public List<(string name, int level)> levelUps = new List<(string, int)>();
        public CaughtInfo caught;
    }

    public static class Battle
    {
        public const int CloverPerLevel = 3;   // 【建议】 clover per KO = 3 × enemy level
        public const int QuickGap = 3;         // 「一键结算」 when every wild pet is ≥ 3 levels below your leader

        // days 1–4 → 1, 5–9 → 2, 10+ → 3
        public static int WildGroupSize(int day) => day >= 10 ? 3 : day >= 5 ? 2 : 1;

        // the touched wild pet leads; companions are rolled from the island seed
        public static List<PetInstance> MakeWildGroup(string lead, int level, int islandSeed, int wildIndex, int day, IReadOnlyList<string> pool)
        {
            var r = new Mulberry32((long)islandSeed * 97 + (long)wildIndex * 131 + (long)day * 7);
            Func<double> rng = r.Next;
            var group = new List<PetInstance> { PetMath.CreatePet(lead, level, rng, uid: $"wild-{wildIndex}-0") };
            for (int i = 1; i < WildGroupSize(day); i++)
            {
                var sp = pool[(int)Math.Floor(rng() * pool.Count)];
                group.Add(PetMath.CreatePet(sp, PetMath.WildLevel(day, rng), rng, uid: $"wild-{wildIndex}-{i}"));
            }
            return group;
        }

        static Mon MakeMon(PetInstance inst)
        {
            var stats = PetMath.CalcStats(inst, true);
            var skills = PetMath.BattleSkills(inst);
            return new Mon
            {
                uid = inst.uid, species = inst.species, name = PetMath.DisplayName(inst), element = GameData.Species(inst.species).element, level = inst.level,
                stats = stats, maxHp = stats.hp, hp = inst.hp == null ? stats.hp : Math.Min(inst.hp.Value, stats.hp),
                skills = skills, uses = skills.Distinct().ToDictionary(id => id, id => GameData.Skill(id).uses ?? int.MaxValue),
                affection = inst.affection, form = inst.form, src = inst,
            };
        }

        // ambush: the player walked into a pet that had not noticed them → it does not act on turn 1
        public static BattleState Create(List<PetInstance> party, List<PetInstance> enemies, List<ItemStack> inventory, Func<double> rng = null, bool ambush = false)
        {
            var mine = party.Select(MakeMon).ToList();
            var rnd = new Random();
            return new BattleState
            {
                rng = rng ?? rnd.NextDouble, turn = 0, ambush = ambush,
                me = new BattleSide { mons = mine, active = mine.FindIndex(m => m.hp > 0) },
                foe = new BattleSide { mons = enemies.Select(MakeMon).ToList(), active = 0 },
                inventory = inventory.Select(st => st.Clone()).ToList(),
            };
        }

        public static bool CanStart(IEnumerable<PetInstance> party) => party.Any(p => p.hp == null || p.hp > 0);
        public static Mon Active(BattleState b, string side) { var s = b.Side(side); return s.mons[s.active]; }
        static string Other(string side) => side == "me" ? "foe" : "me";
        static List<Mon> Alive(BattleState b, string side) => b.Side(side).mons.Where(m => m.hp > 0).ToList();

        public static double StatWithBuffs(Mon m, string stat) => m.buffs.Where(x => x.stat == stat).Aggregate((double)m.Stat(stat), (v, x) => v * x.mult);

        // damage preview without randomness (also used by the enemy AI)
        public static int ExpectedDamage(Mon attacker, Mon defender, string skillId)
        {
            var s = GameData.Skill(skillId);
            if (s.power == 0) return 0;
            return PetMath.CalcDamage(s.power, StatWithBuffs(attacker, "atk"), StatWithBuffs(defender, "def"), Elements.Multiplier(s.element, defender.element));
        }

        static bool HasHeal(SkillDef s) => s.effects != null && s.effects.Any(e => e.type == "heal");

        // enemy AI (docs/02 第 4 节: prefers super-effective skills)
        public static string ChooseEnemySkill(BattleState b)
        {
            Mon me = Active(b, "foe"), them = Active(b, "me");
            var usable = me.skills.Where(id => me.uses[id] > 0).ToList();
            var heal = usable.FirstOrDefault(id => HasHeal(GameData.Skill(id)));
            if (heal != null && me.hp < me.maxHp * 0.4) return heal;
            var status = usable.Where(id => GameData.Skill(id).power == 0 && !HasHeal(GameData.Skill(id))).ToList();
            var fresh = status.Where(id => !GameData.Skill(id).effects.Any(e => (e.target == "self" ? me : them).buffs.Any(x => x.stat == e.stat))).ToList();
            if (fresh.Count > 0 && b.rng() < 0.2) return fresh[0];
            var attacks = usable.Where(id => GameData.Skill(id).power > 0).ToList();
            if (attacks.Count == 0) return usable.FirstOrDefault() ?? "tackle";
            return attacks.Aggregate(attacks[0], (best, id) => ExpectedDamage(me, them, id) > ExpectedDamage(me, them, best) ? id : best);
        }

        static void UseSkill(BattleState b, string side, string skillId, List<BattleEvent> ev)
        {
            Mon user = Active(b, side), target = Active(b, Other(side));
            var s = GameData.Skill(skillId);
            if (user.uses[skillId] != int.MaxValue) user.uses[skillId] -= 1;
            ev.Add(new BattleEvent { t = "use", side = side, name = user.name, skill = skillId, skillName = s.name });
            if (s.power > 0)
            {
                double mult = Elements.Multiplier(s.element, target.element);
                int dmg = PetMath.CalcDamage(s.power, StatWithBuffs(user, "atk"), StatWithBuffs(target, "def"), mult, PetMath.DamageRoll(b.rng));
                bool bond = false;
                if (dmg >= target.hp && target.hp > 1 && target.affection >= 100 && !target.bondUsed) { dmg = target.hp - 1; target.bondUsed = true; bond = true; }
                target.hp = Math.Max(0, target.hp - dmg);
                ev.Add(new BattleEvent { t = "damage", side = Other(side), amount = dmg, hp = target.hp, maxHp = target.maxHp, eff = mult > 1 ? "super" : mult < 1 ? "weak" : null });
                if (bond) ev.Add(new BattleEvent { t = "bond", side = Other(side), name = target.name });
            }
            foreach (var e in s.effects ?? new List<EffectDef>())
            {
                if (e.type == "heal")
                {
                    int before = user.hp;
                    user.hp = Math.Min(user.maxHp, user.hp + (int)Math.Floor(user.maxHp * e.pct));
                    ev.Add(new BattleEvent { t = "heal", side = side, amount = user.hp - before, hp = user.hp, maxHp = user.maxHp });
                }
                else if (e.type == "stat")
                {
                    var who = e.target == "self" ? user : target;
                    who.buffs = who.buffs.Where(x => x.stat != e.stat).ToList();   // refresh instead of stacking
                    who.buffs.Add(new Buff { stat = e.stat, mult = e.mult, turns = e.turns });
                    ev.Add(new BattleEvent { t = "stat", side = e.target == "self" ? side : Other(side), stat = e.stat, up = e.mult > 1, name = who.name });
                }
            }
            if (target.hp <= 0) OnFaint(b, Other(side), ev);
        }

        static void AddExp(BattleState b, string uid, int n) => b.exp[uid] = (b.exp.TryGetValue(uid, out var v) ? v : 0) + n;

        static void OnFaint(BattleState b, string side, List<BattleEvent> ev)
        {
            var mon = Active(b, side);
            ev.Add(new BattleEvent { t = "faint", side = side, name = mon.name });
            if (side == "foe")
            {
                int lvl = mon.level; var killer = Active(b, "me");
                b.defeated.Add(mon.uid);
                AddExp(b, killer.uid, PetMath.ExpForKO(lvl));
                b.clover += CloverPerLevel * lvl;
                ev.Add(new BattleEvent { t = "exp", name = killer.name, amount = PetMath.ExpForKO(lvl) });
                int next = b.foe.mons.FindIndex(m => m.hp > 0);
                if (next < 0) { b.over = "win"; ev.Add(new BattleEvent { t = "end", result = "win" }); return; }
                b.foe.active = next;
                ev.Add(new BattleEvent { t = "send", side = "foe", index = next, name = b.foe.mons[next].name });
            }
            else
            {
                if (Alive(b, "me").Count == 0) { b.over = "lose"; ev.Add(new BattleEvent { t = "end", result = "lose" }); return; }
                b.needSwitch = true;
                ev.Add(new BattleEvent { t = "need-switch" });
            }
        }

        static TurnResult No(string reason) => new TurnResult { ok = false, reason = reason };

        // returns ok false (with a reason) when the action is not allowed; nothing changes then
        public static TurnResult ResolveTurn(BattleState b, BattleAction a)
        {
            if (b.over != null) return No("over");
            var me = Active(b, "me");
            if (b.needSwitch)
            {
                if (a.type != "switch") return No("must-switch");
                var target = a.index >= 0 && a.index < b.me.mons.Count ? b.me.mons[a.index] : null;
                if (target == null || target.hp <= 0) return No("bad-switch");
                b.me.active = a.index; b.needSwitch = false;
                return new TurnResult { ok = true, events = new List<BattleEvent> { new BattleEvent { t = "send", side = "me", index = a.index, name = target.name } } };   // free switch after a faint
            }
            if (a.type == "skill" && !(me.skills.Contains(a.skill) && me.uses[a.skill] > 0)) return No("no-uses");
            if (a.type == "switch")
            {
                var target = a.index >= 0 && a.index < b.me.mons.Count ? b.me.mons[a.index] : null;
                if (target == null || target.hp <= 0 || a.index == b.me.active) return No("bad-switch");
            }
            if (a.type == "snack" && (GameData.Item(a.item)?.food == null || Inventory.CountOf(b.inventory, a.item) < 1)) return No("no-item");
            if (a.type == "catch")
            {
                if (GameData.Item(a.item)?.netMult == null || Inventory.CountOf(b.inventory, a.item) < 1) return No("no-net");
                if (Active(b, "foe").hp <= 0) return No("fainted");
            }

            var ev = new List<BattleEvent>();
            b.turn += 1;
            var enemySkill = ChooseEnemySkill(b);
            // 1. non-skill actions always go first
            if (a.type == "flee") { b.over = "flee"; ev.Add(new BattleEvent { t = "flee" }); ev.Add(new BattleEvent { t = "end", result = "flee" }); return new TurnResult { ok = true, events = ev }; }
            if (a.type == "switch")
            {
                b.me.active = a.index;
                ev.Add(new BattleEvent { t = "send", side = "me", index = a.index, name = Active(b, "me").name });
            }
            if (a.type == "snack")
            {
                Inventory.RemoveItem(b.inventory, a.item, 1);
                b.used[a.item] = (b.used.TryGetValue(a.item, out var u) ? u : 0) + 1;
                var foe = Active(b, "foe");
                double mult = PetMath.BaitMultiplier(foe.species, a.item);
                b.bait[foe.uid] = Math.Max(b.bait.TryGetValue(foe.uid, out var bm) ? bm : 1, mult);
                ev.Add(new BattleEvent { t = "snack", item = a.item, itemName = GameData.Item(a.item).name, name = foe.name, favourite = mult == 1.5 });
            }
            if (a.type == "catch")
            {
                // one net per throw, success or not; a failed throw is the player's action
                Inventory.RemoveItem(b.inventory, a.item, 1);
                b.used[a.item] = (b.used.TryGetValue(a.item, out var u) ? u : 0) + 1;
                var foe = Active(b, "foe");
                double rate = CatchChance(b, a.item);
                double roll = b.rng();
                ev.Add(new BattleEvent { t = "throw", item = a.item, itemName = GameData.Item(a.item).name, name = foe.name, rate = rate });
                if (PetMath.CatchSucceeds(rate, roll))
                {
                    b.caughtUid = foe.uid; b.caughtFavourite = (b.bait.TryGetValue(foe.uid, out var bm) ? bm : 1) == 1.5;
                    var killer = Active(b, "me");
                    AddExp(b, killer.uid, PetMath.ExpForKO(foe.level));
                    b.over = "caught";
                    ev.Add(new BattleEvent { t = "caught", name = foe.name });
                    ev.Add(new BattleEvent { t = "exp", name = killer.name, amount = PetMath.ExpForKO(foe.level) });
                    ev.Add(new BattleEvent { t = "end", result = "caught" });
                    return new TurnResult { ok = true, events = ev };
                }
                ev.Add(new BattleEvent { t = "escape", name = foe.name });
            }
            // 2. skills by speed (ties: the player first)
            var order = new List<(string side, string id)>();
            if (a.type == "skill") order.Add(("me", a.skill));
            bool foeSkips = b.ambush && b.turn == 1;
            bool foeFirst = a.type == "skill" && StatWithBuffs(Active(b, "foe"), "spd") > StatWithBuffs(me, "spd");
            if (foeFirst) order.Insert(0, ("foe", enemySkill)); else order.Add(("foe", enemySkill));
            foreach (var (side, id) in order)
            {
                if (b.over != null || b.needSwitch) break;
                var user = Active(b, side);
                if (user.hp <= 0) continue;
                // an enemy sent in this turn (after a faint) doesn't act until next turn
                if (side == "foe" && ev.Any(e => e.t == "send" && e.side == "foe")) continue;
                if (side == "foe" && foeSkips) { ev.Add(new BattleEvent { t = "surprised", name = user.name }); continue; }
                UseSkill(b, side, id, ev);
            }
            // 3. buffs tick down at the end of the turn
            foreach (var side in new[] { b.me, b.foe })
                foreach (var m in side.mons)
                {
                    foreach (var x in m.buffs) x.turns -= 1;
                    m.buffs = m.buffs.Where(x => x.turns > 0).ToList();
                }
            return new TurnResult { ok = true, events = ev };
        }

        // current catch chance against the active foe with this net (shown in the UI)
        public static double CatchChance(BattleState b, string netId)
        {
            var foe = Active(b, "foe");
            return PetMath.CatchRate(GameData.Species(foe.species).catchRate, foe.hp, foe.maxHp, GameData.Item(netId).netMult ?? 0, b.bait.TryGetValue(foe.uid, out var bm) ? bm : 1);
        }

        // one commit at the end (docs/02 第 4 节 5–6)
        public static BattleSummary Finish(GameState s, BattleState b, string wildId = null)
        {
            var summary = new BattleSummary { result = b.over, clover = b.clover };
            if (b.over != "flee") Guide.Bump(s, "battles");
            if (b.over == "caught") Guide.Bump(s, "catches");
            if (b.over == "win" || b.over == "caught") { Guide.Bump(s, "wins"); PetCare.BondFromBattle(s); }
            foreach (var m in b.me.mons)
            {
                var inst = s.Pet(m.uid);
                if (inst == null) continue;
                inst.hp = m.hp >= m.maxHp ? (int?)null : m.hp;
                int gained = b.exp.TryGetValue(m.uid, out var g) ? g : 0;
                if (gained > 0)
                {
                    int ups = PetMath.GainExp(inst, gained);
                    summary.exp.Add((m.name, gained));
                    if (ups > 0) summary.levelUps.Add((m.name, inst.level));
                }
            }
            foreach (var kv in b.used) Inventory.RemoveItem(s.inventory, kv.Key, kv.Value);
            s.clover += b.clover;
            if (b.over == "caught" && b.caughtUid != null)
            {
                var mon = b.foe.mons.Find(m => m.uid == b.caughtUid);
                summary.caught = AddCaughtPet(s, mon.src, mon.name, mon.hp >= mon.maxHp ? (int?)null : mon.hp, b.caughtFavourite);
            }
            if ((b.over == "win" || b.over == "caught") && wildId != null && s.expedition != null && !s.expedition.changes.pets.Contains(wildId)) s.expedition.changes.pets.Add(wildId);
            return summary;
        }

        // a caught wild pet joins the player: new uid, dex, party if there is room
        public static CaughtInfo AddCaughtPet(GameState s, PetInstance src, string name = null, int? hp = null, bool favourite = false)
        {
            int n = s.pets.Count; string uid;
            do uid = $"pet-{src.species}-{ToBase36(n++)}"; while (s.pets.Any(p => p.uid == uid));
            var inst = src.Clone();
            inst.uid = uid; inst.hp = hp; inst.affection = PetMath.AffectionOnCatch(favourite);
            s.pets.Add(inst);
            bool duplicate = s.pets.Any(p => p.species == src.species && p.uid != uid);
            Growth.DexCatch(s, inst);
            bool joined = s.party.Count < SaveRules.PartyMax;
            if (joined) s.party.Add(uid);
            return new CaughtInfo { uid = uid, name = name ?? PetMath.DisplayName(inst), joined = joined, affection = inst.affection, stars = inst.stars, shiny = inst.shiny, duplicate = duplicate };
        }

        public static string ToBase36(int n)
        {
            const string digits = "0123456789abcdefghijklmnopqrstuvwxyz";
            if (n == 0) return "0";
            var sb = new System.Text.StringBuilder();
            while (n > 0) { sb.Insert(0, digits[n % 36]); n /= 36; }
            return sb.ToString();
        }

        // ---------- field catch (T45): throw a net without a battle ----------
        public class FieldCatchResult : Res { public bool caught; public double rate; public BattleSummary summary; }

        // stealth: seen | unaware | back. One net is used whether it works or not; the leader gets the catch exp.
        public static FieldCatchResult FieldCatch(GameState s, PetInstance wild, string netId, string stealth, double roll, string wildId = null)
        {
            if (GameData.Item(netId)?.netMult == null || Inventory.CountOf(s.inventory, netId) < 1) return new FieldCatchResult { reason = "no-net" };
            Inventory.RemoveItem(s.inventory, netId, 1);
            Growth.DexSee(s, wild.species);
            Guide.Bump(s, "throws");
            double rate = Stealth.FieldCatchRate(wild.species, netId, stealth);
            if (!PetMath.CatchSucceeds(rate, roll)) return new FieldCatchResult { ok = true, caught = false, rate = rate };
            Guide.Bump(s, "catches");
            Guide.Bump(s, "fieldCatches");
            if (stealth == "back") Guide.Bump(s, "backCatches");
            var summary = new BattleSummary { result = "caught" };
            var lead = s.party.Count > 0 ? s.Pet(s.party[0]) : null;
            if (lead != null)
            {
                int amount = PetMath.ExpForKO(wild.level);
                int ups = PetMath.GainExp(lead, amount);
                summary.exp.Add((PetMath.DisplayName(lead), amount));
                if (ups > 0) summary.levelUps.Add((PetMath.DisplayName(lead), lead.level));
            }
            summary.caught = AddCaughtPet(s, wild, null, null, false);
            if (wildId != null && s.expedition != null && !s.expedition.changes.pets.Contains(wildId)) s.expedition.changes.pets.Add(wildId);
            return new FieldCatchResult { ok = true, caught = true, rate = rate, summary = summary };
        }

        // ---------- faster battles (T45; docs/12 第 9 节) ----------
        // 「自动」: next healthy pet after a faint, otherwise the skill with the most expected damage
        public static BattleAction AutoAction(BattleState b)
        {
            if (b.needSwitch) return BattleAction.Switch(b.me.mons.FindIndex(m => m.hp > 0));
            Mon me = Active(b, "me"), foe = Active(b, "foe");
            var usable = me.skills.Where(id => me.uses[id] > 0).ToList();
            // stable sort by expected damage, highest first (same as the JS sort)
            var best = usable.Select((id, i) => (id, i, dmg: ExpectedDamage(me, foe, id))).OrderByDescending(x => x.dmg).ThenBy(x => x.i).FirstOrDefault();
            return BattleAction.Skill(best.id ?? "tackle");
        }

        public static bool CanQuickResolve(BattleState b)
        {
            var lead = b.me.active >= 0 && b.me.active < b.me.mons.Count ? b.me.mons[b.me.active] : null;
            return lead != null && b.over == null && b.foe.mons.All(m => m.level <= lead.level - QuickGap);
        }

        // plays the whole battle with AutoAction, no animation; returns the number of turns
        public static int QuickResolve(BattleState b, int maxTurns = 200)
        {
            int n = 0;
            while (b.over == null && n < maxTurns) { if (!ResolveTurn(b, AutoAction(b)).ok) break; n++; }
            return n;
        }
    }

    // sneaking up on wild pets (stealth.js). Distances in web px (1 tile = 48 px) so the numbers match the docs.
    public static class Stealth
    {
        public static readonly Dictionary<string, string> Temper = new Dictionary<string, string> { { "acorn", "shy" }, { "shark", "bold" }, { "pup", "shy" }, { "fox", "bold" }, { "starbear", "shy" }, { "shadecat", "shy" } };
        public static string TemperOf(string sp) => Temper.TryGetValue(sp, out var t) ? t : "shy";

        public const double Radius = 168, Front = 0.6, Side = 0.3, Back = 0.12, Sneak = 0.45, Cover = 0.5, Night = 0.7, Decay = 0.3, Look = 0.5;
        public const double FrontAngle = Math.PI / 3, BackAngle = Math.PI * 2 / 3;
        public const double ThrowRange = 120, CoverRange = 34, SneakPush = 0.6;
        public static readonly Dictionary<string, double> StealthMult = new Dictionary<string, double> { { "seen", 1 }, { "unaware", 1.5 }, { "back", 2.5 } };
        public static readonly Dictionary<string, string> StealthNames = new Dictionary<string, string> { { "seen", "发现你了" }, { "unaware", "没发现你" }, { "back", "背后" } };

        // angle (0..π) between where the pet faces and the direction from the pet to the player
        public static double AngleFromFacing(double fx, double fy, double dx, double dy)
        {
            double fl = Math.Sqrt(fx * fx + fy * fy), dl = Math.Sqrt(dx * dx + dy * dy);
            if (fl == 0) fl = 1; if (dl == 0) dl = 1;
            double cos = (fx * dx + fy * dy) / (fl * dl);
            return Math.Acos(Math.Max(-1, Math.Min(1, cos)));
        }

        // one update of the notice meter (0–1)
        public static double NoticeStep(double meter, double dist, double angle, double dt, bool sneaking = false, bool covered = false, bool dark = false)
        {
            if (dist > Radius) return Math.Max(0, meter - Decay * dt);
            double rate = angle < FrontAngle ? Front : angle <= BackAngle ? Side : Back;
            rate *= 1 + (Radius - dist) / Radius;     // ×1 at the edge … ×2 right next to it
            if (sneaking) rate *= Sneak;
            if (covered) rate *= Cover;
            if (dark) rate *= Night;
            return Math.Min(1, meter + rate * dt);
        }

        public static string StealthOf(double meter, double angle) => meter >= 1 ? "seen" : angle > BackAngle ? "back" : "unaware";

        // the pet is at full health, so only the net and stealth help
        public static double FieldCatchRate(string speciesId, string netId, string stealth)
        {
            double b = PetMath.CatchRate(GameData.Species(speciesId).catchRate, 1, 1, GameData.Item(netId)?.netMult ?? 0);
            return Math.Min(PetMath.CatchCap, b * (StealthMult.TryGetValue(stealth, out var m) ? m : 1));
        }

        public static string PickNet(List<ItemStack> inv) => new[] { "item_net_grass", "item_net_vine" }.FirstOrDefault(id => inv.Any(st => st.id == id && st.count > 0));
    }
}
