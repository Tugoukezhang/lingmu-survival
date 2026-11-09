// Sneaking up on wild pets and throwing a net in the field (T45; docs/11 ③,
// docs/参考资料/拆解/阿尔宙斯.md). Pure functions, no Phaser.
//
// Each wild pet has a notice meter 0–1. It fills while the player is close and
// visible, faster in front of the pet and when the player is near; sneaking
// (small joystick push or standing still), standing by grass / bushes and the
// night fog slow it down. At 1 the pet has noticed the player: shy pets run
// away, bold ones charge (touching = battle). A net thrown at a pet that has
// not noticed you works better, from behind even more.
import { species } from '../data/pets.js';
import { ITEMS } from '../data/items.js';
import { catchRate, CATCH_CAP } from './petMath.js';

// 【建议】 temperament per species
export const TEMPER = { acorn: 'shy', shark: 'bold', pup: 'shy', fox: 'bold', starbear: 'shy', shadecat: 'shy' };
export const temperOf = (speciesId) => TEMPER[speciesId] ?? 'shy';

// 【建议】 numbers (px; 1 tile = 48 px)
export const NOTICE = {
  radius: 168,          // 3.5 tiles: farther than this the meter only drains
  front: 0.6,           // per second, player inside the front cone (< 60°)
  side: 0.3,            // 60°–120°
  back: 0.12,           // behind (> 120°)
  sneak: 0.45,          // × while sneaking
  cover: 0.5,           // × next to grass / a bush
  night: 0.7,           // × in the night fog
  decay: 0.3,           // per second, out of range
  look: 0.5,            // from this meter value the pet turns to face the player
};
export const FRONT_ANGLE = Math.PI / 3, BACK_ANGLE = (Math.PI * 2) / 3;
export const THROW_RANGE = 120;      // 2.5 tiles
export const COVER_RANGE = 34;       // px from a grass tuft / bush
export const SNEAK_PUSH = 0.6;       // joystick push below this = sneaking
export const STEALTH_MULT = { seen: 1, unaware: 1.5, back: 2.5 };
export const STEALTH_NAMES = { seen: '发现你了', unaware: '没发现你', back: '背后' };

// Angle (0..π) between the way the pet faces and the direction from the pet to the player.
export function angleFromFacing(face, dx, dy) {
  const fl = Math.hypot(face.x, face.y) || 1, dl = Math.hypot(dx, dy) || 1;
  const cos = (face.x * dx + face.y * dy) / (fl * dl);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

// One update of the notice meter. Returns the new value (0–1).
export function noticeStep(meter, { dist, angle, sneaking = false, covered = false, dark = false, dt }) {
  if (dist > NOTICE.radius) return Math.max(0, meter - NOTICE.decay * dt);
  let rate = angle < FRONT_ANGLE ? NOTICE.front : angle <= BACK_ANGLE ? NOTICE.side : NOTICE.back;
  rate *= 1 + (NOTICE.radius - dist) / NOTICE.radius;     // ×1 at the edge … ×2 right next to it
  if (sneaking) rate *= NOTICE.sneak;
  if (covered) rate *= NOTICE.cover;
  if (dark) rate *= NOTICE.night;
  return Math.min(1, meter + rate * dt);
}

export const stealthOf = (meter, angle) => (meter >= 1 ? 'seen' : angle > BACK_ANGLE ? 'back' : 'unaware');

// Field catch chance: the pet is at full health, so only the net and stealth help.
export function fieldCatchRate(speciesId, netId, stealth) {
  const base = catchRate({ base: species(speciesId).catchRate, hp: 1, maxHp: 1, netMult: ITEMS[netId]?.netMult ?? 0 });
  return Math.min(CATCH_CAP, base * (STEALTH_MULT[stealth] ?? 1));
}

// Which net to throw: the plain grass net first (cheap), the vine net when that is all you have.
export const pickNet = (inventory) => ['item_net_grass', 'item_net_vine'].find((id) => inventory.some((s) => s.id === id && s.count > 0)) ?? null;
