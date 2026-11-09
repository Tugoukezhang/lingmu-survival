// Camping on expedition islands (docs/06 第 3–4 节, T22): placing campfires,
// fuel, sleeping in the tent, and opening chests (the tent's cloth comes from them).
// Pure functions on the game state, no Phaser.
import { mulberry32 } from './rng.js';
import { countOf, addItem, removeItem } from './inventory.js';
import { bagSlots, fits } from './crafting.js';
import { absMinute } from './night.js';
import { DAY_START } from './time.js';

export const FIRE_START_MIN = 120;   // a new campfire burns 2 game hours
export const FIRE_PER_WOOD = 120;    // each wood adds 2 hours

export const fires = (state) => state.expedition?.fires ?? [];
export const fireLeft = (state, f) => Math.max(0, f.until - absMinute(state));   // minutes of fuel left
export const burning = (state) => fires(state).filter((f) => fireLeft(state, f) > 0);

// Absolute minute of the next 6:00 (end of the night).
export function nextDawn(state) {
  return state.clock < DAY_START ? state.day * 1440 + DAY_START : state.day * 1440 + 30 * 60;
}

// Place a campfire from the bag on tile (tx, ty). Returns { ok, fire } or { ok: false, reason }.
export function placeCampfire(state, tx, ty) {
  if (state.player.area !== 'expedition' || !state.expedition) return { ok: false, reason: 'home' };
  if (fires(state).some((f) => f.tx === tx && f.ty === ty)) return { ok: false, reason: 'occupied' };
  if (!removeItem(state.inventory, 'item_campfire', 1)) return { ok: false, reason: 'none' };
  const fire = { id: `f${fires(state).length}`, tx, ty, until: absMinute(state) + FIRE_START_MIN };
  state.expedition.fires = [...fires(state), fire];
  return { ok: true, fire };
}

// Add one wood: +2 hours (a burnt-out fire is relit from now).
export function addWood(state, fireId) {
  const f = fires(state).find((x) => x.id === fireId);
  if (!f) return { ok: false, reason: 'unknown' };
  if (!removeItem(state.inventory, 'item_wood', 1)) return { ok: false, reason: 'no-wood' };
  f.until = Math.max(f.until, absMinute(state)) + FIRE_PER_WOOD;
  return { ok: true, left: fireLeft(state, f) };
}

// Wood still needed for this fire to last until dawn.
export const woodToDawn = (state, f) => Math.max(0, Math.ceil((nextDawn(state) - Math.max(f.until, absMinute(state))) / FIRE_PER_WOOD));

// Sleeping in the tent next to a fire 【建议】: needs a tent and a fire that lasts until 6:00.
// Returns { ok } or { ok: false, reason: 'no-tent' | 'fuel', wood }.
export function canCampSleep(state, fireId) {
  const f = fires(state).find((x) => x.id === fireId);
  if (!f) return { ok: false, reason: 'unknown' };
  if (countOf(state.inventory, 'item_tent') < 1) return { ok: false, reason: 'no-tent' };
  const wood = woodToDawn(state, f);
  if (wood > 0) return { ok: false, reason: 'fuel', wood };
  return { ok: true };
}

// ---------- chests ----------
// Loot 【建议】: cloth 2–3 (the tent needs 4), two random extras, 20 clover.
const EXTRAS = [['item_crystal', 1], ['item_wood', 4], ['item_stone', 4], ['item_berry', 4], ['item_net_grass', 1]];
// The thorn-guarded chest (开路) is richer: cloth 3, crystal 2 on top, 40 clover.
export function chestLoot(islandSeed, chestId, bonus = false) {
  const rng = mulberry32((islandSeed * 53 + Number(chestId.slice(1)) * 977 + 11) >>> 0);
  const items = bonus ? { item_cloth: 3, item_crystal: 2 } : { item_cloth: 2 + Math.floor(rng() * 2) };
  const pool = [...EXTRAS];
  for (let i = 0; i < 2; i++) {
    const [id, n] = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    items[id] = (items[id] ?? 0) + n;
  }
  // growth drops (M3) 【建议】: thorn chest always 1 evolution stone; normal chests 15% stone, 20% skill book
  const STONES = ['item_evo_forest', 'item_evo_water', 'item_evo_fire', 'item_evo_light', 'item_evo_dark'];
  const BOOKS = ['item_book_bubble', 'item_book_ember', 'item_book_leafy', 'item_book_twinkle', 'item_book_shadow', 'item_book_heal', 'item_book_shell', 'item_book_puff'];
  if (bonus || rng() < 0.15) { const s = STONES[Math.floor(rng() * STONES.length)]; items[s] = (items[s] ?? 0) + 1; }
  if (!bonus && rng() < 0.2) { const b = BOOKS[Math.floor(rng() * BOOKS.length)]; items[b] = (items[b] ?? 0) + 1; }
  return { items, clover: bonus ? 40 : 20 };
}

// Open a chest on the current island. Returns { ok, loot } or { ok: false, reason: 'opened' | 'full' }.
export function openChest(state, chestId, { bonus = false } = {}) {
  const ch = state.expedition?.changes;
  if (!ch || ch.chests.includes(chestId)) return { ok: false, reason: 'opened' };
  const loot = chestLoot(state.expedition.seed, chestId, bonus);
  if (!fits(state, loot.items)) return { ok: false, reason: 'full' };
  for (const [id, n] of Object.entries(loot.items)) addItem(state.inventory, id, n, bagSlots(state));
  state.clover += loot.clover;
  ch.chests.push(chestId);
  if (state.flags) { state.flags.stats = state.flags.stats ?? {}; state.flags.stats.chests = (state.flags.stats.chests ?? 0) + 1; }
  return { ok: true, loot };
}
