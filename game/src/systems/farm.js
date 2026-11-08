// Farming and shipping on the home island (T11; docs/00 第 3 节 settlement order).
// Pure functions on the game state, no Phaser.
//
// state.farm = {
//   plots: { "tx,ty": { tilled, crop, days, watered } },   // crop = crop id or null
//   shipping: [{ id, count }],                             // sold at the next settlement
// }
import { CROPS, cropBySeed, PRICES } from '../data/crops.js';
import { countOf, addItem, removeItem } from './inventory.js';
import { bagSlots } from './crafting.js';
import { bump } from './guide.js';

export const FARM_W = 6, FARM_H = 4;    // field size in tiles (placed next to the home spawn)

export const farmOf = (state) => (state.farm = state.farm ?? { plots: {}, shipping: [] });
export const plotKey = (tx, ty) => `${tx},${ty}`;
export const plotOf = (state, key) => farmOf(state).plots[key] ?? { tilled: false, crop: null, days: 0, watered: false };
const setPlot = (state, key, p) => { farmOf(state).plots[key] = p; };

export const ripe = (p) => !!p.crop && p.days >= CROPS[p.crop].days;

// What the action button would do on this plot: 'till' | 'plant' | 'water' | 'harvest' | 'wait'.
export function plotAction(state, key) {
  const p = plotOf(state, key);
  if (!p.tilled) return 'till';
  if (!p.crop) return 'plant';
  if (ripe(p)) return 'harvest';
  return p.watered ? 'wait' : 'water';
}

export function till(state, key) {
  if (countOf(state.inventory, 'item_hoe') < 1) return { ok: false, reason: 'no-hoe' };
  const p = plotOf(state, key);
  if (p.tilled) return { ok: false, reason: 'tilled' };
  setPlot(state, key, { ...p, tilled: true });
  return { ok: true };
}

export function plant(state, key, seedId) {
  const p = plotOf(state, key);
  const crop = cropBySeed(seedId);
  if (!p.tilled) return { ok: false, reason: 'not-tilled' };
  if (p.crop) return { ok: false, reason: 'occupied' };
  if (!crop) return { ok: false, reason: 'not-seed' };
  if (!removeItem(state.inventory, seedId, 1)) return { ok: false, reason: 'no-seed' };
  setPlot(state, key, { ...p, crop, days: 0, watered: false });
  bump(state, 'plant');
  return { ok: true, crop };
}

export function water(state, key) {
  if (countOf(state.inventory, 'item_can') < 1) return { ok: false, reason: 'no-can' };
  const p = plotOf(state, key);
  if (!p.crop) return { ok: false, reason: 'empty' };
  if (p.watered) return { ok: false, reason: 'watered' };
  if (ripe(p)) return { ok: false, reason: 'ripe' };
  setPlot(state, key, { ...p, watered: true });
  bump(state, 'water');
  return { ok: true };
}

export function harvest(state, key) {
  const p = plotOf(state, key);
  if (!ripe(p)) return { ok: false, reason: 'not-ripe' };
  const item = CROPS[p.crop].crop;
  if (!addItem(state.inventory, item, 1, bagSlots(state))) return { ok: false, reason: 'full' };
  setPlot(state, key, { tilled: true, crop: null, days: 0, watered: false });   // soil stays tilled
  bump(state, 'harvest');
  return { ok: true, item };
}

// ---------- seeds (interim seed stand at home; moves to the town shop in T13) ----------
export function buySeed(state, cropId, n = 1) {
  const c = CROPS[cropId];
  const cost = c.seedPrice * n;
  if (state.clover < cost) return { ok: false, reason: 'clover' };
  if (!addItem(state.inventory, c.seed, n, bagSlots(state))) return { ok: false, reason: 'full' };
  state.clover -= cost;
  return { ok: true, cost };
}

// ---------- shipping box ----------
export const priceOf = (id) => PRICES[id] ?? null;

export function ship(state, id, n = 1) {
  if (priceOf(id) == null) return { ok: false, reason: 'no-price' };
  if (!removeItem(state.inventory, id, n)) return { ok: false, reason: 'none' };
  addItem(farmOf(state).shipping, id, n, Infinity);
  bump(state, 'shipped', (priceOf(id) ?? 0) * n);
  return { ok: true };
}

export function unship(state, id) {
  const box = farmOf(state).shipping, s = box.find((x) => x.id === id);
  if (!s) return { ok: false, reason: 'none' };
  if (!addItem(state.inventory, id, s.count, bagSlots(state))) return { ok: false, reason: 'full' };
  farmOf(state).shipping = box.filter((x) => x !== s);
  return { ok: true };
}

export const shippingValue = (state) => farmOf(state).shipping.reduce((sum, s) => sum + (priceOf(s.id) ?? 0) * s.count, 0);

// ---------- daily settlement steps ----------
export function settleShipping(state) {
  const value = shippingValue(state);
  if (!value) return [];
  const n = farmOf(state).shipping.reduce((k, s) => k + s.count, 0);
  state.clover += value;
  farmOf(state).shipping = [];
  bump(state, 'shippedValue', value);
  return [`出货 ${n} 件：四叶草 +${value}`];
}

export function growCrops(state) {
  let grew = 0, ripened = 0, dry = 0;
  for (const p of Object.values(farmOf(state).plots)) {
    if (!p.crop || ripe(p)) continue;
    if (p.watered) { p.days += 1; grew++; if (ripe(p)) ripened++; } else dry++;
    p.watered = false;
  }
  const lines = [];
  if (grew) lines.push(`作物长大了（${grew} 块地）${ripened ? `，${ripened} 块可以收获了` : ''}`);
  if (dry) lines.push(`${dry} 块地昨天没浇水，没有长`);
  return lines;
}
