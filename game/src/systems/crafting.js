// Gathering on expedition islands and field crafting (docs/06 第 3 节, T19).
// Pure functions on the game state, no Phaser.
import { RECIPE_BY_ID } from '../data/recipes.js';
import { countOf, addItem, removeItem, BAG_SLOTS } from './inventory.js';
import { carryBonus } from './explore.js';
import { bump } from './guide.js';

// Bag size: 20, +4 while a 驮运 pet (冰蓝小狼) is in the party, +6 at affection 100 (docs/02 第 9 节, 07 第 7 节).
export const bagSlots = (state) => BAG_SLOTS + carryBonus(state);

// Would all these stacks fit? (existing stacks always fit; new ones need a free slot)
export function fits(state, gains) {
  const fresh = Object.keys(gains).filter((id) => countOf(state.inventory, id) === 0).length;
  return state.inventory.length + fresh <= bagSlots(state);
}

// What each resource gives 【建议】: by hand a little, with the right tool more;
// 雾晶 needs the pickaxe (otherwise the axe needs wood that needs the axe…).
export const GATHER = {
  tree: { name: '树', hand: { item_wood: 1 }, tool: 'item_axe', withTool: { item_wood: 3 } },
  rock: { name: '石头', hand: { item_stone: 1 }, tool: 'item_pickaxe', withTool: { item_stone: 3 } },
  bush: { name: '浆果丛', hand: { item_berry: 2 } },
  grass: { name: '草丛', hand: { item_grass: 2 } },
  crystal: { name: '雾晶', hand: null, tool: 'item_pickaxe', withTool: { item_crystal: 1 } },
};

// What gathering this resource would give right now: { gains, usedTool } or { need: toolId }.
export function gatherPreview(state, type) {
  const g = GATHER[type];
  const hasTool = g.tool && countOf(state.inventory, g.tool) > 0;
  if (hasTool) return { gains: g.withTool, usedTool: g.tool };
  if (!g.hand) return { need: g.tool };
  return { gains: g.hand, usedTool: null };
}

// Gather one resource on the current expedition island.
// Returns { ok, gains } or { ok: false, reason: 'need-tool' | 'full' | 'gone' }.
export function gather(state, resource) {
  const changes = state.expedition?.changes;
  if (!changes || changes.collected.includes(resource.id)) return { ok: false, reason: 'gone' };
  const pv = gatherPreview(state, resource.type);
  if (pv.need) return { ok: false, reason: 'need-tool', tool: pv.need };
  if (!fits(state, pv.gains)) return { ok: false, reason: 'full' };
  for (const [id, n] of Object.entries(pv.gains)) addItem(state.inventory, id, n, Infinity);
  changes.collected.push(resource.id);
  bump(state, 'gather');
  return { ok: true, gains: pv.gains, usedTool: pv.usedTool };
}

// { ok, missing: [{ id, need, have }] }
export function canCraft(state, recipeId) {
  const r = RECIPE_BY_ID[recipeId];
  const missing = Object.entries(r.cost)
    .map(([id, need]) => ({ id, need, have: countOf(state.inventory, id) }))
    .filter((m) => m.have < m.need);
  return { ok: missing.length === 0, missing };
}

// Workbench recipes can only be made at home (the home workbench) 【建议】.
export const stationOk = (state, recipeId) => RECIPE_BY_ID[recipeId].station !== 'workbench' || state.player.area === 'home';

// Crafting is all-or-nothing: materials are only taken when the result fits.
// Returns { ok } or { ok: false, reason: 'missing' | 'full' | 'station', missing? }.
export function craft(state, recipeId) {
  const r = RECIPE_BY_ID[recipeId];
  if (!stationOk(state, recipeId)) return { ok: false, reason: 'station' };
  const check = canCraft(state, recipeId);
  if (!check.ok) return { ok: false, reason: 'missing', missing: check.missing };
  // the result needs a slot unless a material stack empties or the item is already stacked
  const after = state.inventory.filter((s) => !(r.cost[s.id] && s.count === r.cost[s.id]));
  const needsSlot = !after.some((s) => s.id === r.out);
  if (needsSlot && after.length + 1 > bagSlots(state)) return { ok: false, reason: 'full' };
  for (const [id, n] of Object.entries(r.cost)) removeItem(state.inventory, id, n);
  addItem(state.inventory, r.out, r.n, Infinity);
  bump(state, 'craft');
  return { ok: true };
}
