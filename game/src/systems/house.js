// Home decoration (T15; docs/00 R14 / S11, simple version): one room, a grid,
// place / move / rotate / put away furniture, no overlapping. Pure, no Phaser.
//
// state.house = { items: [{ id, x, y, rot }] }   (x, y = top-left cell; rot 0 | 1)
import { countOf, addItem, removeItem } from './inventory.js';
import { bagSlots } from './crafting.js';
import { bump } from './guide.js';

export const ROOM_W = 12, ROOM_H = 8;                 // floor cells
// cells that must stay free: the bed (top-left) and the path from the door (bottom middle)
export const RESERVED = [[0, 0], [1, 0], [0, 1], [1, 1], [5, 7], [6, 7], [5, 6], [6, 6]];

// 【建议】 footprints; rug is walkable decoration
export const FURNITURE = {
  item_furn_chair: { w: 1, h: 1 },
  item_furn_table: { w: 2, h: 1 },
  item_furn_plant: { w: 1, h: 1 },
  item_furn_rug: { w: 2, h: 2, floor: true },
  item_furn_shelf: { w: 2, h: 1 },
  item_furn_lamp: { w: 1, h: 1, light: true },
  // residents' 5-heart presents (docs/11 ②), not craftable
  item_furn_chime: { w: 1, h: 1 },
  item_furn_horse: { w: 1, h: 1 },
  item_furn_petbed: { w: 2, h: 1 },
};
export const isFurniture = (id) => !!FURNITURE[id];

export const houseOf = (state) => (state.house = state.house ?? { items: [] });
export function footprint(id, rot) {
  const f = FURNITURE[id];
  return rot ? { w: f.h, h: f.w } : { w: f.w, h: f.h };
}
const cells = (id, x, y, rot) => { const { w, h } = footprint(id, rot); const out = []; for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push([x + dx, y + dy]); return out; };

// Can furniture `id` go at (x, y, rot)? `ignore` = index of an item being moved.
// Rugs lie on the floor: they only can't overlap other rugs; other pieces may stand on a rug.
export function canPlace(state, id, x, y, rot = 0, ignore = -1) {
  const mine = cells(id, x, y, rot);
  if (mine.some(([cx, cy]) => cx < 0 || cy < 0 || cx >= ROOM_W || cy >= ROOM_H)) return { ok: false, reason: 'outside' };
  if (mine.some(([cx, cy]) => RESERVED.some(([rx, ry]) => rx === cx && ry === cy))) return { ok: false, reason: 'reserved' };
  const floor = !!FURNITURE[id].floor;
  for (const [i, it] of houseOf(state).items.entries()) {
    if (i === ignore || !!FURNITURE[it.id].floor !== floor) continue;
    const theirs = cells(it.id, it.x, it.y, it.rot);
    if (mine.some(([a, b]) => theirs.some(([c, d]) => a === c && b === d))) return { ok: false, reason: 'overlap' };
  }
  return { ok: true };
}

export function place(state, id, x, y, rot = 0) {
  if (!isFurniture(id)) return { ok: false, reason: 'not-furniture' };
  if (countOf(state.inventory, id) < 1) return { ok: false, reason: 'none' };
  const chk = canPlace(state, id, x, y, rot);
  if (!chk.ok) return chk;
  removeItem(state.inventory, id, 1);
  houseOf(state).items.push({ id, x, y, rot });
  bump(state, 'decorate');
  return { ok: true, index: houseOf(state).items.length - 1 };
}

export function move(state, index, x, y) {
  const it = houseOf(state).items[index];
  if (!it) return { ok: false, reason: 'unknown' };
  const chk = canPlace(state, it.id, x, y, it.rot, index);
  if (!chk.ok) return chk;
  it.x = x; it.y = y;
  return { ok: true };
}

export function rotate(state, index) {
  const it = houseOf(state).items[index];
  if (!it) return { ok: false, reason: 'unknown' };
  const rot = it.rot ? 0 : 1;
  const chk = canPlace(state, it.id, it.x, it.y, rot, index);
  if (!chk.ok) return chk;
  it.rot = rot;
  return { ok: true };
}

export function pickUp(state, index) {
  const items = houseOf(state).items, it = items[index];
  if (!it) return { ok: false, reason: 'unknown' };
  if (!addItem(state.inventory, it.id, 1, bagSlots(state))) return { ok: false, reason: 'full' };
  items.splice(index, 1);
  return { ok: true };
}

// Which placed item covers cell (x, y)? Solid pieces win over rugs.
export function itemAt(state, x, y) {
  const items = houseOf(state).items;
  let rug = -1;
  for (const [i, it] of items.entries()) {
    if (!cells(it.id, it.x, it.y, it.rot).some(([a, b]) => a === x && b === y)) continue;
    if (!FURNITURE[it.id].floor) return i;
    rug = i;
  }
  return rug;
}

// Solid cells (for walking in the room).
export function solidCells(state) {
  const out = [];
  for (const it of houseOf(state).items) if (!FURNITURE[it.id].floor) out.push(...cells(it.id, it.x, it.y, it.rot));
  return out;
}
