// Game time, day phases and the daily settlement (docs/06 第 0 节, docs/00 第 3 节).
// Pure module (no Phaser), tested by tools/logic-test.mjs.
//
// clock = minutes since 0:00 of the current day. It runs past 24:00 on
// expeditions (25:30 = 1:30 at night) until the player sleeps or 6:00 arrives.

export const DAY_START = 6 * 60;      // wake up at 6:00
export const DUSK_START = 18 * 60;
export const NIGHT_START = 20 * 60;
export const BEDTIME = 24 * 60;       // home island: forced sleep
export const DAWN_LIMIT = 30 * 60;    // 6:00 next morning: the day ends even without sleep
export const TICK_MIN = 10;           // game minutes per "tick" (survival steps use it)
export const REAL_MS_PER_DAY = 12 * 60 * 1000;                              // 6:00–24:00 ≈ 12 real minutes
export const MS_PER_GAME_MIN = REAL_MS_PER_DAY / (BEDTIME - DAY_START);     // ≈ 666.7 ms

export function phaseAt(clock) {
  const m = ((clock % 1440) + 1440) % 1440;
  if (m >= DAY_START && m < DUSK_START) return 'day';
  if (m >= DUSK_START && m < NIGHT_START) return 'dusk';
  return 'night';
}
export const PHASE_NAMES = { day: '白天', dusk: '黄昏', night: '夜晚' };

export function formatClock(clock) {
  const m = Math.floor(clock);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// World colour by time of day, drawn as a MULTIPLY layer (white = unchanged):
// keyframes [minute, rgb], linear in between. Warm at dusk, deep blue at night.
const TINT_KEYS = [
  [0, 0x5866a8],
  [4 * 60 + 30, 0x5866a8],
  [DAY_START, 0xe6dcea],      // already light at 6:00 (players start their day here)
  [6 * 60 + 40, 0xffffff],
  [17 * 60, 0xffffff],
  [DUSK_START, 0xffd2a8],
  [19 * 60, 0xd8a0b0],
  [NIGHT_START, 0x7a86c0],
  [22 * 60, 0x5866a8],
  [BEDTIME, 0x5866a8],
];
const lerp = (a, b, t) => a + (b - a) * t;
const lerpColor = (c1, c2, t) => {
  const r = Math.round(lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t));
  const g = Math.round(lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t));
  const b = Math.round(lerp(c1 & 255, c2 & 255, t));
  return (r << 16) | (g << 8) | b;
};
// Returns { color, dark } where dark = how much the picture is darkened (0 = none, 1 = black).
export function tintAt(clock) {
  const m = ((clock % 1440) + 1440) % 1440;
  let color = TINT_KEYS[0][1];
  for (let i = 0; i < TINT_KEYS.length - 1; i++) {
    const [m1, c1] = TINT_KEYS[i], [m2, c2] = TINT_KEYS[i + 1];
    if (m >= m1 && m <= m2) { color = lerpColor(c1, c2, m2 === m1 ? 0 : (m - m1) / (m2 - m1)); break; }
  }
  const mean = (((color >> 16) & 255) + ((color >> 8) & 255) + (color & 255)) / 765;
  return { color, dark: Math.round((1 - mean) * 1000) / 1000 };
}

// Advances time; owns no state except the sub-minute remainder.
// advance(state, realMs) mutates state.clock and returns the events crossed, in order:
//   { type: 'tick', clock }            every 10 game minutes
//   { type: 'phase', from, to, clock } day → dusk → night → day
//   { type: 'bedtime' }                home island reached 24:00 (clock stops there)
//   { type: 'dawn' }                   6:00 next morning reached without sleeping (clock stops)
export class GameClock {
  constructor({ msPerMin = MS_PER_GAME_MIN } = {}) {
    this.msPerMin = msPerMin;
    this.carry = 0;
    this.pauses = new Set();
    this.stopped = false; // set after bedtime/dawn until the settlement restarts the day
  }

  get paused() { return this.pauses.size > 0 || this.stopped; }
  pause(reason) { this.pauses.add(reason); }
  resume(reason) { this.pauses.delete(reason); }

  advance(state, realMs) {
    const events = [];
    if (this.paused || realMs <= 0) return events;
    this.carry += realMs;
    let mins = Math.floor(this.carry / this.msPerMin);
    this.carry -= mins * this.msPerMin;
    const limit = state.player?.area === 'home' ? BEDTIME : DAWN_LIMIT;
    while (mins-- > 0) {
      const before = state.clock;
      state.clock = before + 1;
      if (state.clock % TICK_MIN === 0) events.push({ type: 'tick', clock: state.clock });
      const p0 = phaseAt(before), p1 = phaseAt(state.clock);
      if (p0 !== p1) events.push({ type: 'phase', from: p0, to: p1, clock: state.clock });
      if (state.clock >= limit) {
        this.stopped = true;
        this.carry = 0;
        events.push({ type: limit === BEDTIME ? 'bedtime' : 'dawn' });
        break;
      }
    }
    return events;
  }

  // Called after the settlement: the new day starts running.
  restart() { this.stopped = false; this.carry = 0; }
}

import { bump } from './guide.js';
import { settleShipping, growCrops } from './farm.js';
import { runPetWork } from './petcare.js';

// ---------- daily settlement ----------
// Order from docs/00 第 3 节: shipping → crops → pet work → home resources →
// weather → (save, done by the caller). Each later system fills in its step;
// a step returns lines for the summary panel (or nothing).
export const SETTLEMENT_STEPS = [
  { id: 'rest', name: '休息', run: (s, ctx) => {
    if (!ctx.slept) return ['没睡觉，天亮了…生命没有恢复'];
    s.player.hp = s.player.hpMax;
    s.player.hunger = Math.max(0, s.player.hunger - 20);
    for (const p of s.pets ?? []) p.hp = null;   // pets rest too: full HP (null = full)
    if (s.flags) bump(s, 'sleeps');
    return ['睡了个好觉：生命回满，饱食 −20，伙伴们也恢复了精神'];
  } },
  { id: 'shipping', name: '出货结算', run: (s) => (s.farm ? settleShipping(s) : []) },   // T11
  { id: 'crops', name: '作物生长', run: (s) => (s.farm ? growCrops(s) : []) },             // T11
  { id: 'petWork', name: '宠物打工', run: (s) => (s.pets ? runPetWork(s) : []) },   // T12
  { id: 'resources', name: '刷新家园资源', run: () => [] },
  { id: 'weather', name: '天气', run: () => [] },
];

// Ends the current day and starts the next at 6:00. Returns a report:
// { endedDay, day, order: [step ids], lines: [text] }.
export function runSettlement(state, { slept = true, steps = SETTLEMENT_STEPS } = {}) {
  const endedDay = state.day;
  const order = [], lines = [];
  state.day = endedDay + 1;
  state.clock = DAY_START;
  for (const step of steps) {
    order.push(step.id);
    const out = step.run(state, { slept, endedDay });
    if (out?.length) lines.push(...out);
  }
  return { endedDay, day: state.day, order, lines };
}
