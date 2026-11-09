// Island progress (T14; docs/00 R13 / S12): buying the home expansion and
// repairing the broken bridge in town. Pure functions, no Phaser.
// state.world = { expanded: bool, bridge: bool }
import { ITEMS } from '../data/items.js';
import { countOf, removeItem } from './inventory.js';
import { bump } from './guide.js';

// 【建议】 costs
export const EXPAND_COST = { clover: 400, items: { item_wood: 20, item_stone: 20 } };
export const BRIDGE_COST = { clover: 200, items: { item_wood: 50, item_stone: 30, item_cloth: 5 } };

export const worldOf = (state) => (state.world = state.world ?? { expanded: false, bridge: false });

// [{ id: 'clover' | itemId, name, need, have }] still missing
export function missingFor(state, cost) {
  const out = [];
  if (state.clover < cost.clover) out.push({ id: 'clover', name: '四叶草', need: cost.clover, have: state.clover });
  for (const [id, n] of Object.entries(cost.items)) {
    const have = countOf(state.inventory, id);
    if (have < n) out.push({ id, name: ITEMS[id].name, need: n, have });
  }
  return out;
}

function pay(state, cost) {
  state.clover -= cost.clover;
  for (const [id, n] of Object.entries(cost.items)) removeItem(state.inventory, id, n);
}

export function buyExpansion(state) {
  const w = worldOf(state);
  if (w.expanded) return { ok: false, reason: 'done' };
  if (state.player.area !== 'home') return { ok: false, reason: 'away' };
  const miss = missingFor(state, EXPAND_COST);
  if (miss.length) return { ok: false, reason: 'missing', missing: miss };
  pay(state, EXPAND_COST);
  w.expanded = true;
  bump(state, 'expand');
  return { ok: true };
}

// The bridge: 阿栗 helps once his workshop quest is done (他才信任你).
export function repairBridge(state) {
  const w = worldOf(state);
  if (w.bridge) return { ok: false, reason: 'done' };
  if (state.town?.quests?.ali_wood !== 'done') return { ok: false, reason: 'ali' };
  const miss = missingFor(state, BRIDGE_COST);
  if (miss.length) return { ok: false, reason: 'missing', missing: miss };
  pay(state, BRIDGE_COST);
  w.bridge = true;
  bump(state, 'bridge');
  return { ok: true };
}
