// Pet explore skills (docs/02 第 9 节, docs/07 第 7 节, T24). Only pets in
// the party count. Affection 100 boosts some skills.
// Pure functions on the game state, no Phaser.
import { species } from '../data/pets.js';
import { addItem } from './inventory.js';

export const SKILL_NAMES = { light: '照明', carry: '驮运', clear: '开路', wade: '涉水', treasure: '寻宝' };
export const SKILL_HELP = {
  light: '夜里身边常亮 1.5 格（好感 100：2.5 格）',
  carry: '背包 +4 格（好感 100：+6 格）',
  clear: '能清除荆棘丛（找到被围住的宝箱）',
  wade: '能走过浅水（到池塘小岛上采雾晶）',
  treasure: '地图上显示宝箱（好感 100：还显示稀有地点）',
};

const partyPets = (state) => state.party.map((uid) => state.pets.find((p) => p.uid === uid)).filter(Boolean);

// { has, boosted } for one explore skill.
export function partySkill(state, skill) {
  const pets = partyPets(state).filter((p) => species(p.species).explore === skill);
  return { has: pets.length > 0, boosted: pets.some((p) => (p.affection ?? 0) >= 100) };
}

export const canWade = (state) => partySkill(state, 'wade').has;
export const canClear = (state) => partySkill(state, 'clear').has;

// Map knowledge: 0 = nothing, 1 = chests, 2 = chests + rare spots.
export function treasureSense(state) {
  const s = partySkill(state, 'treasure');
  return s.has ? (s.boosted ? 2 : 1) : 0;
}

export const carryBonus = (state) => { const s = partySkill(state, 'carry'); return s.has ? (s.boosted ? 6 : 4) : 0; };
export const glowTiles = (state) => { const s = partySkill(state, 'light'); return s.has ? (s.boosted ? 2.5 : 1.5) : 0; };

// Clearing a thorn bush on the current island (records it). Returns { ok } or { ok: false, reason }.
export function clearThorn(state, thornId) {
  const ch = state.expedition?.changes;
  if (!ch) return { ok: false, reason: 'no-island' };
  if (!canClear(state)) return { ok: false, reason: 'need-clear' };
  ch.thorns = ch.thorns ?? [];
  if (ch.thorns.includes(thornId)) return { ok: false, reason: 'gone' };
  ch.thorns.push(thornId);
  return { ok: true };
}

// ---------- home storage ("驮运离队物品不丢") ----------
// When the bag gets smaller (冰蓝小狼 leaves the party), the extra stacks
// go to the home storage instead of being lost. Returns the stacks moved.
export function settleOverflow(state, slots) {
  state.storage = state.storage ?? [];
  const moved = [];
  while (state.inventory.length > slots) {
    const s = state.inventory.pop();
    addItem(state.storage, s.id, s.count, Infinity);
    moved.unshift(s);
  }
  return moved;
}

// Storage panel actions (home only).
export function depositAll(state, keep = (id) => false) {
  state.storage = state.storage ?? [];
  const stay = [];
  for (const s of state.inventory) { if (keep(s.id)) stay.push(s); else addItem(state.storage, s.id, s.count, Infinity); }
  const n = state.inventory.length - stay.length;
  state.inventory = stay;
  return n;
}

export function withdrawAll(state, slots) {
  state.storage = state.storage ?? [];
  const left = [];
  let n = 0;
  for (const s of state.storage) { if (addItem(state.inventory, s.id, s.count, slots)) n++; else left.push(s); }
  state.storage = left;
  return { took: n, left: left.length };
}
