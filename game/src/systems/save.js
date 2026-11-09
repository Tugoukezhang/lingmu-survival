// Save system (CLAUDE.md 技术约定; docs/06 第 5 节).
// - The whole game state is one plain JSON object (see newGameState).
// - Stored as "<checksum>|<json>" so truncated or edited saves are detected.
// - Every save first copies the previous *valid* save to the backup slot;
//   loading falls back to the backup when the main save is unreadable.
// - Version number + migrations; saves from a newer game version are kept
//   aside, never overwritten silently.
// - Saving can be blocked (battle, fainting animation) with block(reason).
// Pure module: storage is injected, so tools/logic-test.mjs runs it in Node.
import { PETS, PET_BY_ID } from '../data/pets.js';
import { ITEMS } from '../data/items.js';
import { createStarter } from './petMath.js';

export const SAVE_VERSION = 5;   // 2: farm (T11), 3: town (T13), 4: island progress (T14), 5: house (T15)
export const KEYS = { main: 'lingmu.save.main', backup: 'lingmu.save.backup', future: 'lingmu.save.future' };
export const PARTY_MAX = 3;

// ---------- state shape ----------
export function newGameState({ now = Date.now(), seed = 20261108 } = {}) {
  // Demo start until the starter choice exists: all six pets live on the home
  // island (as before), 冰蓝小狼 follows the player.
  const pets = PETS.map((p) => createStarter(p.id, { uid: `pet-${p.id}` }));
  return {
    version: SAVE_VERSION,
    createdAt: now,
    savedAt: now,
    seed,
    day: 1,
    clock: 6 * 60,
    clover: 120,
    player: { area: 'home', x: null, y: null, hp: 100, hpMax: 100, hunger: 100, hungerMax: 100 },
    inventory: [
      { id: 'item_net_grass', count: 3 },
      { id: 'item_net_vine', count: 1 },
      { id: 'item_campfire', count: 2 },
      { id: 'item_berry', count: 5 },
      { id: 'item_carrot', count: 2 },
      { id: 'item_fish_roast', count: 1 },
      { id: 'item_hoe', count: 1 },
      { id: 'item_can', count: 1 },
      { id: 'item_seed_carrot', count: 6 },
    ],
    farm: { plots: {}, shipping: [] },
    town: { friend: {}, talkDay: {}, giftDay: {}, quests: {} },
    recipes: [],
    world: { expanded: false, bridge: false },
    house: { items: [] },
    pets,
    party: ['pet-pup', 'pet-fox', 'pet-acorn'],
    expedition: null, // { seed, biome, changes: {...} } while on an expedition island (T05)
    flags: {},
  };
}

// Returns a list of problems; empty means the state is usable.
export function validate(s) {
  const err = [];
  const isInt = (v) => Number.isInteger(v);
  if (!s || typeof s !== 'object') return ['不是对象'];
  if (!isInt(s.version)) err.push('version');
  if (!isInt(s.day) || s.day < 1) err.push('day');
  if (!isInt(s.clock) || s.clock < 0 || s.clock > 30 * 60) err.push('clock'); // may run past 24:00 on expeditions
  if (!isInt(s.clover) || s.clover < 0) err.push('clover');
  const p = s.player;
  if (!p || typeof p !== 'object') err.push('player');
  else {
    for (const k of ['hp', 'hpMax', 'hunger', 'hungerMax']) if (typeof p[k] !== 'number' || p[k] < 0) err.push(`player.${k}`);
    if (p.torchUntil != null && !Number.isFinite(p.torchUntil)) err.push('player.torchUntil');
    if (p.hp > p.hpMax || p.hunger > p.hungerMax) err.push('player.上限');
    if ((p.x !== null && typeof p.x !== 'number') || (p.y !== null && typeof p.y !== 'number')) err.push('player.位置');
  }
  if (!Array.isArray(s.inventory) || !s.inventory.every((it) => ITEMS[it?.id] && isInt(it.count) && it.count > 0)) err.push('inventory');
  if (!Array.isArray(s.pets) || !s.pets.every((pet) => PET_BY_ID[pet?.species] && typeof pet.uid === 'string' && isInt(pet.level) && pet.level >= 1 && (pet.hp == null || (Number.isFinite(pet.hp) && pet.hp >= 0)))) err.push('pets');
  else if (new Set(s.pets.map((pet) => pet.uid)).size !== s.pets.length) err.push('pets.重复');
  const ex = s.expedition;
  if (ex != null && !(Number.isInteger(ex.seed) && ex.changes && ['collected', 'chests', 'pets'].every((k) => Array.isArray(ex.changes[k])))) err.push('expedition');
  if (ex?.changes?.thorns != null && !Array.isArray(ex.changes.thorns)) err.push('expedition.thorns');
  if (s.town != null && !(s.town.friend && s.town.quests && typeof s.town.quests === 'object' && Object.values(s.town.quests).every((v) => v === 'active' || v === 'done'))) err.push('town');
  if (s.recipes != null && !Array.isArray(s.recipes)) err.push('recipes');
  if (s.house != null && !(Array.isArray(s.house.items) && s.house.items.every((it) => ITEMS[it?.id] && isInt(it.x) && isInt(it.y) && (it.rot === 0 || it.rot === 1)))) err.push('house');
  if (s.world != null && !(typeof s.world.expanded === 'boolean' && typeof s.world.bridge === 'boolean')) err.push('world');
  if (s.crystals != null && !(typeof s.crystals === 'object' && Object.values(s.crystals).every((n) => isInt(n) && n >= 0))) err.push('crystals');
  if (s.daily != null && !(isInt(s.daily.day) && Array.isArray(s.daily.tasks) && s.daily.base && typeof s.daily.base === 'object')) err.push('daily');
  const fm = s.farm;
  if (fm != null && !(fm.plots && typeof fm.plots === 'object' && Array.isArray(fm.shipping) && fm.shipping.every((it) => ITEMS[it?.id] && isInt(it.count) && it.count > 0)
    && Object.values(fm.plots).every((p) => typeof p.tilled === 'boolean' && isInt(p.days) && p.days >= 0))) err.push('farm');
  if (s.storage != null && !(Array.isArray(s.storage) && s.storage.every((it) => ITEMS[it?.id] && isInt(it.count) && it.count > 0))) err.push('storage');
  if (ex?.fires != null && !(Array.isArray(ex.fires) && ex.fires.every((f) => typeof f.id === 'string' && isInt(f.tx) && isInt(f.ty) && Number.isFinite(f.until)))) err.push('expedition.fires');
  const lb = ex?.lostBag;
  if (lb != null && !(Number.isFinite(lb.x) && Number.isFinite(lb.y) && Array.isArray(lb.items) && lb.items.every((it) => ITEMS[it?.id] && isInt(it.count) && it.count > 0))) err.push('expedition.lostBag');
  if (p && p.area === 'expedition' && ex == null) err.push('player.area');
  if (p && !['home', 'expedition', 'town', 'house'].includes(p.area)) err.push('player.area');
  if (!Array.isArray(s.party) || s.party.length > PARTY_MAX || !s.party.every((uid) => s.pets?.some?.((pet) => pet.uid === uid))) err.push('party');
  return err;
}

// ---------- migrations ----------
// MIGRATIONS[n] turns a version-n save into version n+1. Add one entry per
// format change and bump SAVE_VERSION; never edit an old entry.
export const MIGRATIONS = {
  // 1 → 2 (T11 farming): empty farm, and the hoe, watering can and some carrot seeds
  1: (d) => {
    const inv = [...d.inventory];
    for (const [id, n] of [['item_hoe', 1], ['item_can', 1], ['item_seed_carrot', 6]]) if (!inv.some((s) => s.id === id)) inv.push({ id, count: n });
    return { ...d, inventory: inv, farm: { plots: {}, shipping: [] } };
  },
  // 2 → 3 (T13 town): friendship, quests and taught recipes start empty
  2: (d) => ({ ...d, town: { friend: {}, talkDay: {}, giftDay: {}, quests: {} }, recipes: [] }),
  // 3 → 4 (T14): home expansion and the town bridge, both not done yet
  3: (d) => ({ ...d, world: { expanded: false, bridge: false } }),
  // 4 → 5 (T15): an empty room in the cottage
  4: (d) => ({ ...d, house: { items: [] } }),
};

export function migrate(data, migrations = MIGRATIONS, target = SAVE_VERSION) {
  let d = data;
  while (d.version < target) {
    const step = migrations[d.version];
    if (!step) throw new Error(`没有从版本 ${d.version} 升级的方法`);
    d = { ...step(d), version: d.version + 1 };
  }
  return d;
}

// ---------- encoding ----------
// FNV-1a 32-bit: detects accidental damage and casual edits (not anti-cheat).
export function checksum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export const encode = (state) => { const json = JSON.stringify(state); return `${checksum(json)}|${json}`; };

// Returns { ok: true, state } or { ok: false, reason, future? }.
export function decode(raw, { migrations = MIGRATIONS, target = SAVE_VERSION } = {}) {
  if (raw == null) return { ok: false, reason: 'empty' };
  const bar = raw.indexOf('|');
  if (bar !== 8) return { ok: false, reason: 'format' };
  const sum = raw.slice(0, bar), json = raw.slice(bar + 1);
  if (checksum(json) !== sum) return { ok: false, reason: 'checksum' };
  let data;
  try { data = JSON.parse(json); } catch { return { ok: false, reason: 'json' }; }
  if (!Number.isInteger(data?.version)) return { ok: false, reason: 'version' };
  if (data.version > target) return { ok: false, reason: 'future', future: true };
  try { data = migrate(data, migrations, target); } catch (e) { return { ok: false, reason: 'migrate', detail: e.message }; }
  const problems = validate(data);
  if (problems.length) return { ok: false, reason: 'invalid', detail: problems.join(',') };
  return { ok: true, state: data };
}

// ---------- store ----------
export class SaveStore {
  constructor(storage, { now = () => Date.now(), migrations = MIGRATIONS, target = SAVE_VERSION } = {}) {
    this.storage = storage;
    this.now = now;
    this.opts = { migrations, target };
    this.blocks = new Set();
    this.lastError = null;
  }

  get blocked() { return this.blocks.size > 0; }
  block(reason) { this.blocks.add(reason); }
  unblock(reason) { this.blocks.delete(reason); }

  read(key) { try { return this.storage.getItem(key); } catch { return null; } }

  // Returns { state, source: 'main' | 'backup' | 'new', problem? }.
  // problem: why the main save was not used (for a toast), if it existed.
  load(makeNew = () => newGameState({ now: this.now() })) {
    const rawMain = this.read(KEYS.main);
    const main = decode(rawMain, this.opts);
    if (main.ok) return { state: main.state, source: 'main' };
    if (main.future) {
      // made by a newer game version: keep it aside, don't touch it
      try { this.storage.setItem(KEYS.future, rawMain); } catch { /* ignore */ }
    }
    const problem = rawMain == null ? null : main.reason;
    const backup = decode(this.read(KEYS.backup), this.opts);
    if (backup.ok) return { state: backup.state, source: 'backup', problem };
    return { state: makeNew(), source: 'new', problem };
  }

  // Returns true when written. Never throws (storage full, private mode...).
  save(state) {
    if (this.blocked) { this.lastError = 'blocked'; return false; }
    const problems = validate(state);
    if (problems.length) { this.lastError = `invalid: ${problems.join(',')}`; return false; }
    try {
      const prev = this.read(KEYS.main);
      if (prev != null && decode(prev, this.opts).ok) this.storage.setItem(KEYS.backup, prev);
      state.savedAt = this.now();
      this.storage.setItem(KEYS.main, encode(state));
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = e?.name || 'write-failed';
      return false;
    }
  }

  // Start over: removes main and backup (a future-version save is kept).
  wipe() {
    try { this.storage.removeItem(KEYS.main); this.storage.removeItem(KEYS.backup); } catch { /* ignore */ }
  }
}

// Minimal in-memory Storage for tests.
export class MemoryStorage {
  constructor() { this.map = new Map(); this.failWrites = false; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { if (this.failWrites) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
