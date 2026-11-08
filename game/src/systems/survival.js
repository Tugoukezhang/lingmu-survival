// Survival stats: health and fullness (docs/06 第 1 节 / 第 6 节接口, S16).
// Pure functions on state.player, no Phaser. Fainting itself (lost bag,
// waking up at home) is T23; here we only report it.
import { ITEMS } from '../data/items.js';
import { countOf, removeItem } from './inventory.js';

export const HUNGER_PER_TICK = 1;   // every 10 game minutes
export const STARVE_DAMAGE = 3;     // per tick once fullness is 0
export const HUNGRY_AT = 20;        // warn when fullness drops to this

// Home island and town are safe: health never goes below 1 there.
export const isSafeArea = (area) => area === 'home' || area === 'town';

// One 10-minute tick. Mutates player; returns a list of events:
// 'hungry' (fullness reached 20), 'empty' (fullness reached 0),
// 'starving' (lost health to hunger), 'floor' (stopped at 1 in a safe area),
// 'faint' (health reached 0 on an expedition).
export function survivalTick(player, area) {
  const ev = [];
  if (player.hunger > 0) {
    player.hunger = Math.max(0, player.hunger - HUNGER_PER_TICK);
    if (player.hunger === HUNGRY_AT) ev.push('hungry');
    if (player.hunger === 0) ev.push('empty');
    return ev;
  }
  // already empty at the start of this tick → lose health
  return applyDamage(player, STARVE_DAMAGE, area, ev.concat('starving'));
}

// takeDamage(n): fog monsters (T21) and hunger both go through here.
export function applyDamage(player, n, area, ev = []) {
  if (player.hp <= 0) return ev;            // already fainted: ignore
  const safe = isSafeArea(area);
  const before = player.hp;
  player.hp = Math.max(safe ? 1 : 0, player.hp - n);
  if (safe && player.hp === 1 && before > 1) ev.push('floor');
  if (!safe && player.hp === 0) ev.push('faint');
  return ev;
}

// Eat one food item from the inventory.
// Returns { ok, reason?, hunger, hp } — reason: 'not-food' | 'none' | 'full'.
export function eat(state, itemId) {
  const def = ITEMS[itemId];
  const p = state.player;
  if (!def?.food) return { ok: false, reason: 'not-food' };
  if (countOf(state.inventory, itemId) < 1) return { ok: false, reason: 'none' };
  if (p.hunger >= p.hungerMax && (!def.heal || p.hp >= p.hpMax)) return { ok: false, reason: 'full' };
  removeItem(state.inventory, itemId, 1);
  const h0 = p.hunger, hp0 = p.hp;
  p.hunger = Math.min(p.hungerMax, p.hunger + def.food);
  if (def.heal) p.hp = Math.min(p.hpMax, p.hp + def.heal);
  return { ok: true, hunger: p.hunger - h0, hp: p.hp - hp0 };
}
