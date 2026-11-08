// Airship travel between the home dock and expedition islands (docs/06 第 5 节, T25),
// fainting on an expedition and the lost bag (docs/06 第 2 节, T23).
// Pure functions on the game state, no Phaser.
import { mulberry32 } from './rng.js';
import { emptyChanges } from './islandGen.js';
import { survivalTick } from './survival.js';
import { runSettlement, TICK_MIN } from './time.js';
import { ITEMS } from '../data/items.js';
import { addItem } from './inventory.js';
import { bagSlots } from './crafting.js';
import { bump } from './guide.js';

export const TRAVEL_MIN = 60;    // departure and return each take 1 game hour
export const WAKE_CLOCK = 8 * 60;

// Let game time pass outside the normal clock (flight). Survival ticks still
// happen; the airship is safe, so health never drops below 1 on the way.
export function passTime(state, minutes) {
  const start = state.clock;
  state.clock += minutes;
  const ticks = Math.floor(state.clock / TICK_MIN) - Math.floor(start / TICK_MIN);
  for (let i = 0; i < ticks; i++) survivalTick(state.player, 'home');
  return ticks;
}

// A fresh island seed: deterministic from the save so tests can predict it.
export function newIslandSeed(state) {
  const trips = state.flags.trips ?? 0;
  return Math.floor(mulberry32((state.seed * 131 + state.day * 977 + trips * 7919) >>> 0)() * 2 ** 31);
}

export const lostBagCount = (state) => (state.expedition?.lostBag?.items ?? []).reduce((n, s) => n + s.count, 0);

// mode: 'new' | 'last'. Returns { ok, reason? }. Going to a new island
// abandons the last island together with its lost bag (the UI warns first).
export function depart(state, mode) {
  if (state.player.area !== 'home') return { ok: false, reason: 'not-home' };
  if (mode === 'last' && !state.expedition) return { ok: false, reason: 'no-last' };
  if (mode === 'new') state.expedition = { seed: newIslandSeed(state), biome: 'mistwood', changes: emptyChanges(), lostBag: null };
  state.flags.trips = (state.flags.trips ?? 0) + 1;
  bump(state, 'trips');
  passTime(state, TRAVEL_MIN);
  state.player.area = 'expedition';
  state.player.x = null; state.player.y = null; // land at the airship
  return { ok: true, seed: state.expedition.seed };
}

export function returnHome(state) {
  if (state.player.area !== 'expedition') return { ok: false, reason: 'not-away' };
  passTime(state, TRAVEL_MIN);
  state.player.area = 'home';
  state.player.x = null; state.player.y = null;
  state.flags.arriveAt = 'dock';
  bump(state, 'returns');
  return { ok: true };
}

// Fainting on an expedition, as ONE state change (so a refresh during the
// animation can't duplicate or lose anything, E10):
// tools stay in the bag, everything else goes into the lost bag at (x, y)
// on this island (replacing an older lost bag); wake up at home the next
// morning at 8:00 with health 50 and fullness 50; pets rest too.
export function faint(state, { x, y }) {
  const keep = [], drop = [];
  for (const s of state.inventory) (ITEMS[s.id]?.tool ? keep : drop).push({ ...s });
  const replaced = lostBagCount(state) > 0;
  state.inventory = keep;
  if (state.expedition) state.expedition.lostBag = drop.length ? { x: Math.round(x), y: Math.round(y), items: drop } : (state.expedition.lostBag ?? null);
  const report = runSettlement(state, { slept: false });
  state.clock = WAKE_CLOCK;
  state.player.hp = 50;
  state.player.hunger = 50;
  for (const p of state.pets) p.hp = null;
  state.player.area = 'home';
  state.player.x = null; state.player.y = null;
  state.flags.arriveAt = 'bed';
  return { report, dropped: drop, kept: keep, replaced: replaced && drop.length > 0 };
}

// Picking up the lost bag: everything that fits goes back into the bag;
// what doesn't fit stays in the lost bag (docs/06 第 6 节). Returns { took, left }.
export function pickUpLostBag(state) {
  const bag = state.expedition?.lostBag;
  if (!bag) return { took: [], left: [] };
  const took = [], left = [];
  for (const s of bag.items) (addItem(state.inventory, s.id, s.count, bagSlots(state)) ? took : left).push(s);
  state.expedition.lostBag = left.length ? { ...bag, items: left } : null;
  return { took, left };
}
