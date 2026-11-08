// Airship travel between the home dock and expedition islands (docs/06 第 5 节, T25),
// plus the interim "fainted on an expedition" recovery (full rules with the
// lost bag are T23). Pure functions on the game state, no Phaser.
import { mulberry32 } from './rng.js';
import { emptyChanges } from './islandGen.js';
import { survivalTick } from './survival.js';
import { runSettlement, TICK_MIN } from './time.js';

export const TRAVEL_MIN = 60;    // departure and return each take 1 game hour

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

// mode: 'new' | 'last'. Returns { ok, reason? }.
export function depart(state, mode) {
  if (state.player.area !== 'home') return { ok: false, reason: 'not-home' };
  if (mode === 'last' && !state.expedition) return { ok: false, reason: 'no-last' };
  if (mode === 'new') state.expedition = { seed: newIslandSeed(state), biome: 'mistwood', changes: emptyChanges() };
  state.flags.trips = (state.flags.trips ?? 0) + 1;
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
  return { ok: true };
}

// Interim faint handling (docs/06 第 2 节 without the lost bag yet):
// wake up at home the next morning at 8:00 with health 50 and fullness 50.
export function recoverFromFaint(state) {
  const report = runSettlement(state, { slept: false });
  state.clock = 8 * 60;
  state.player.hp = 50;
  state.player.hunger = 50;
  state.player.area = 'home';
  state.player.x = null; state.player.y = null;
  state.flags.arriveAt = 'bed';
  return report;
}
