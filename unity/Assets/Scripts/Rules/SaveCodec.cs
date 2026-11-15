// Save checks, version upgrades, checksum and the main / backup store (systems/save.js; CLAUDE.md 存档约定).
// Saves are JSON with an 8-hex FNV-1a checksum in front: "1a2b3c4d|{...}".
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace Lingmu.Rules
{
    public interface ISaveStorage { string Get(string key); void Set(string key, string value); void Remove(string key); }

    // in-memory storage for tests; FailWrites simulates a full disk
    public class MemoryStorage : ISaveStorage
    {
        public readonly Dictionary<string, string> map = new Dictionary<string, string>();
        public bool FailWrites;
        public string Get(string k) => map.TryGetValue(k, out var v) ? v : null;
        public void Set(string k, string v) { if (FailWrites) throw new System.IO.IOException("full"); map[k] = v; }
        public void Remove(string k) => map.Remove(k);
    }

    public static class SaveCodec
    {
        public const string KeyMain = "lingmu.save.main", KeyBackup = "lingmu.save.backup", KeyFuture = "lingmu.save.future";
        static readonly string[] Areas = { "home", "expedition", "town", "house" };

        static bool ItemOk(ItemStack it) => it != null && it.id != null && GameData.Item(it.id) != null && it.count > 0;

        // a list of problems; empty means the state is usable
        public static List<string> Validate(GameState s)
        {
            var err = new List<string>();
            if (s == null) return new List<string> { "不是对象" };
            if (s.day < 1) err.Add("day");
            if (s.clock < 0 || s.clock > 30 * 60) err.Add("clock");   // may run past 24:00 on expeditions
            if (s.clover < 0) err.Add("clover");
            var p = s.player;
            if (p == null) err.Add("player");
            else
            {
                if (p.hp < 0) err.Add("player.hp"); if (p.hpMax < 0) err.Add("player.hpMax");
                if (p.hunger < 0) err.Add("player.hunger"); if (p.hungerMax < 0) err.Add("player.hungerMax");
                if (p.hp > p.hpMax || p.hunger > p.hungerMax) err.Add("player.上限");
                if ((p.x != null && !IsFinite(p.x.Value)) || (p.y != null && !IsFinite(p.y.Value))) err.Add("player.位置");
            }
            if (s.inventory == null || !s.inventory.All(ItemOk)) err.Add("inventory");
            if (s.pets == null || !s.pets.All(pet => pet != null && GameData.Pets.Any(d => d.id == pet.species) && pet.uid != null && pet.level >= 1 && (pet.hp == null || pet.hp >= 0))) err.Add("pets");
            else if (s.pets.Select(pet => pet.uid).Distinct().Count() != s.pets.Count) err.Add("pets.重复");
            var ex = s.expedition;
            if (ex != null && !(ex.changes != null && ex.changes.collected != null && ex.changes.chests != null && ex.changes.pets != null)) err.Add("expedition");
            if (s.town != null && !(s.town.friend != null && s.town.quests != null && s.town.quests.Values.All(v => v == "active" || v == "done"))) err.Add("town");
            if (s.house != null && !(s.house.items != null && s.house.items.All(it => it != null && GameData.Item(it.id) != null && (it.rot == 0 || it.rot == 1)))) err.Add("house");
            if (s.crystals != null && !s.crystals.Values.All(n => n >= 0)) err.Add("crystals");
            if (s.daily != null && !(s.daily.tasks != null && s.daily.@base != null)) err.Add("daily");
            var fm = s.farm;
            if (fm != null && !(fm.plots != null && fm.shipping != null && fm.shipping.All(ItemOk) && fm.plots.Values.All(pl => pl != null && pl.days >= 0))) err.Add("farm");
            if (s.storage != null && !s.storage.All(ItemOk)) err.Add("storage");
            if (ex?.fires != null && !ex.fires.All(f => f != null && f.id != null)) err.Add("expedition.fires");
            var lb = ex?.lostBag;
            if (lb != null && !(IsFinite(lb.x) && IsFinite(lb.y) && lb.items != null && lb.items.All(ItemOk))) err.Add("expedition.lostBag");
            if (p != null && p.area == "expedition" && ex == null) err.Add("player.area");
            if (p != null && !Areas.Contains(p.area)) err.Add("player.area");
            if (s.party == null || s.party.Count > SaveRules.PartyMax || !s.party.All(uid => s.pets != null && s.pets.Any(pet => pet?.uid == uid))) err.Add("party");
            return err;
        }

        static bool IsFinite(double v) => !double.IsNaN(v) && !double.IsInfinity(v);

        // ---------- migrations ----------
        // Migrations[n] turns a version-n save into version n+1. Add one entry per format change and bump
        // SaveRules.SaveVersion; never edit an old entry.
        public static readonly Dictionary<int, Func<JObject, JObject>> Migrations = new Dictionary<int, Func<JObject, JObject>>
        {
            // 1 → 2 (T11 farming): empty farm, and the hoe, watering can and some carrot seeds
            { 1, d => {
                var inv = (JArray)(d["inventory"] ?? new JArray());
                foreach (var (id, n) in new[] { ("item_hoe", 1), ("item_can", 1), ("item_seed_carrot", 6) })
                    if (!inv.Any(s => (string)s["id"] == id)) inv.Add(new JObject { ["id"] = id, ["count"] = n });
                d["inventory"] = inv; d["farm"] = JObject.Parse("{\"plots\":{},\"shipping\":[]}"); return d; } },
            // 2 → 3 (T13 town): friendship, quests and taught recipes start empty
            { 2, d => { d["town"] = JObject.Parse("{\"friend\":{},\"talkDay\":{},\"giftDay\":{},\"quests\":{}}"); d["recipes"] = new JArray(); return d; } },
            // 3 → 4 (T14): home expansion and the town bridge, both not done yet
            { 3, d => { d["world"] = JObject.Parse("{\"expanded\":false,\"bridge\":false}"); return d; } },
            // 4 → 5 (T15): an empty room in the cottage
            { 4, d => { d["house"] = JObject.Parse("{\"items\":[]}"); return d; } },
        };

        public static JObject Migrate(JObject data, Dictionary<int, Func<JObject, JObject>> migrations = null, int target = SaveRules.SaveVersion)
        {
            migrations ??= Migrations;
            var d = (JObject)data.DeepClone();
            while ((int)d["version"] < target)
            {
                int v = (int)d["version"];
                if (!migrations.TryGetValue(v, out var step)) throw new InvalidOperationException($"没有从版本 {v} 升级的方法");
                d = step(d);
                d["version"] = v + 1;
            }
            return d;
        }

        // ---------- encoding ----------
        // FNV-1a 32-bit over UTF-16 code units: detects accidental damage and casual edits (not anti-cheat)
        public static string Checksum(string str)
        {
            uint h = 0x811c9dc5;
            foreach (char c in str) { h ^= c; h = unchecked(h * 0x01000193); }
            return h.ToString("x8");
        }
        public static string Encode(GameState s) { var json = s.ToJson(); return $"{Checksum(json)}|{json}"; }

        public class Decoded { public bool ok, future; public string reason, detail; public GameState state; }

        public static Decoded Decode(string raw, Dictionary<int, Func<JObject, JObject>> migrations = null, int target = SaveRules.SaveVersion)
        {
            if (raw == null) return new Decoded { reason = "empty" };
            int bar = raw.IndexOf('|');
            if (bar != 8) return new Decoded { reason = "format" };
            string sum = raw.Substring(0, bar), json = raw.Substring(bar + 1);
            if (Checksum(json) != sum) return new Decoded { reason = "checksum" };
            JObject data;
            try { data = JObject.Parse(json); } catch { return new Decoded { reason = "json" }; }
            if (data["version"]?.Type != JTokenType.Integer) return new Decoded { reason = "version" };
            if ((int)data["version"] > target) return new Decoded { reason = "future", future = true };
            try { data = Migrate(data, migrations, target); } catch (Exception e) { return new Decoded { reason = "migrate", detail = e.Message }; }
            GameState state;
            try { state = data.ToObject<GameState>(); } catch (Exception e) { return new Decoded { reason = "invalid", detail = e.Message }; }
            var problems = Validate(state);
            if (problems.Count > 0) return new Decoded { reason = "invalid", detail = string.Join(",", problems) };
            return new Decoded { ok = true, state = state };
        }
    }

    public class SaveStore
    {
        readonly ISaveStorage storage;
        readonly Func<long> now;
        readonly Dictionary<int, Func<JObject, JObject>> migrations;
        readonly int target;
        readonly HashSet<string> blocks = new HashSet<string>();
        public string lastError;

        public SaveStore(ISaveStorage storage, Func<long> now = null, Dictionary<int, Func<JObject, JObject>> migrations = null, int target = SaveRules.SaveVersion)
        {
            this.storage = storage;
            this.now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            this.migrations = migrations ?? SaveCodec.Migrations;
            this.target = target;
        }

        public bool Blocked => blocks.Count > 0;
        public void Block(string reason) => blocks.Add(reason);
        public void Unblock(string reason) => blocks.Remove(reason);

        string Read(string key) { try { return storage.Get(key); } catch { return null; } }

        public class Loaded { public GameState state; public string source, problem; }   // source: main | backup | new

        public Loaded Load(Func<GameState> makeNew = null)
        {
            makeNew ??= () => SaveRules.NewGameState(now());
            var rawMain = Read(SaveCodec.KeyMain);
            var main = SaveCodec.Decode(rawMain, migrations, target);
            if (main.ok) return new Loaded { state = main.state, source = "main" };
            if (main.future) { try { storage.Set(SaveCodec.KeyFuture, rawMain); } catch { } }   // made by a newer version: keep it aside
            var problem = rawMain == null ? null : main.reason;
            var backup = SaveCodec.Decode(Read(SaveCodec.KeyBackup), migrations, target);
            if (backup.ok) return new Loaded { state = backup.state, source = "backup", problem = problem };
            return new Loaded { state = makeNew(), source = "new", problem = problem };
        }

        // true when written; never throws
        public bool Save(GameState s)
        {
            if (Blocked) { lastError = "blocked"; return false; }
            var problems = SaveCodec.Validate(s);
            if (problems.Count > 0) { lastError = "invalid: " + string.Join(",", problems); return false; }
            try
            {
                var prev = Read(SaveCodec.KeyMain);
                if (prev != null && SaveCodec.Decode(prev, migrations, target).ok) storage.Set(SaveCodec.KeyBackup, prev);
                s.savedAt = now();
                storage.Set(SaveCodec.KeyMain, SaveCodec.Encode(s));
                lastError = null;
                return true;
            }
            catch (Exception e) { lastError = e.GetType().Name; return false; }
        }

        // start over: removes main and backup (a future-version save is kept)
        public void Wipe() { try { storage.Remove(SaveCodec.KeyMain); storage.Remove(SaveCodec.KeyBackup); } catch { } }
    }
}
