// Pet growth (M3: T27 evolution, T28 stars/crystals/shiny/dex, T29 skill books,
// T39 human form). Rules from docs/07; numbers in petMath.js. Pure, no Phaser.
import { species, PETS } from '../data/pets.js';
import { SKILLS } from '../data/skills.js';
import { ITEMS } from '../data/items.js';
import { countOf, removeItem } from './inventory.js';
import { canEvolve, evolve as markEvolved, REGULAR_SLOTS } from './petMath.js';
import { bump } from './guide.js';

const petBy = (state, uid) => state.pets.find((p) => p.uid === uid);

// ---------- T27 evolution (docs/07 第 3 节) ----------
// Returns { ok } or { ok: false, missing: ['level' | 'affection' | 'stone' | 'evolved'] }.
export function evolveCheck(state, uid) {
  const pet = petBy(state, uid);
  const stone = species(pet.species).evolution.stone;
  return canEvolve(pet, { hasStone: countOf(state.inventory, stone) > 0 });
}

export function tryEvolve(state, uid) {
  const pet = petBy(state, uid);
  if (!pet) return { ok: false, missing: ['unknown'] };
  const chk = evolveCheck(state, uid);
  if (!chk.ok) return chk;
  removeItem(state.inventory, species(pet.species).evolution.stone, 1);
  markEvolved(pet);
  pet.hp = null;   // evolving refreshes the pet
  bump(state, 'evolve');
  return { ok: true };
}

export const EVO_STONES = ['item_evo_forest', 'item_evo_water', 'item_evo_fire', 'item_evo_light', 'item_evo_dark'];

// ---------- T28 crystals, stars, dex (docs/07 第 5、8 节) ----------
export const crystalsOf = (state, sp) => state.crystals?.[sp] ?? 0;
export const starCost = (stars) => stars * 2;     // n★ → n+1★ costs 2n crystals (1→5 total 20)

// Turn a newly caught duplicate into crystals (= its stars). Removes the pet.
export function convertToCrystal(state, uid) {
  const pet = petBy(state, uid);
  if (!pet) return { ok: false, reason: 'unknown' };
  const others = state.pets.filter((p) => p.species === pet.species && p.uid !== uid);
  if (!others.length) return { ok: false, reason: 'only-one' };   // docs/07 第 11 节: only when you already have one
  state.pets = state.pets.filter((p) => p.uid !== uid);
  state.party = state.party.filter((u) => u !== uid);
  state.crystals = state.crystals ?? {};
  state.crystals[pet.species] = crystalsOf(state, pet.species) + pet.stars;
  return { ok: true, gained: pet.stars };
}

export function starUp(state, uid) {
  const pet = petBy(state, uid);
  if (!pet) return { ok: false, reason: 'unknown' };
  if (pet.stars >= 5) return { ok: false, reason: 'max' };
  const need = starCost(pet.stars);
  if (crystalsOf(state, pet.species) < need) return { ok: false, reason: 'crystals', need, have: crystalsOf(state, pet.species) };
  state.crystals[pet.species] -= need;
  pet.stars += 1;
  bump(state, 'starUp');
  return { ok: true, stars: pet.stars };
}

// 图鉴: seen in battle, caught, caught shiny (normal and shiny recorded separately).
export function dexSee(state, sp) {
  state.dex = state.dex ?? {};
  state.dex[sp] = { ...(state.dex[sp] ?? {}), seen: true };
}
export function dexCatch(state, inst) {
  state.dex = state.dex ?? {};
  const e = { ...(state.dex[inst.species] ?? {}), seen: true };
  if (inst.shiny) e.shiny = true; else e.caught = true;
  state.dex[inst.species] = e;
}
export const dexCount = (state) => PETS.filter((p) => state.dex?.[p.id]?.caught || state.dex?.[p.id]?.shiny || state.pets.some((x) => x.species === p.id)).length;

// ---------- T29 skill books (docs/07 第 4 节) ----------
export const bookSkill = (bookId) => ITEMS[bookId]?.book ?? null;

// Who may learn: the book's element must be the pet's element, normal, or a status skill.
export function canLearn(state, uid, bookId) {
  const pet = petBy(state, uid), skillId = bookSkill(bookId);
  if (!pet || !skillId) return { ok: false, reason: 'unknown' };
  const el = SKILLS[skillId].element;
  if (el && el !== '普通' && el !== species(pet.species).element) return { ok: false, reason: 'element' };
  if (pet.skills.includes(skillId)) return { ok: false, reason: 'known' };
  return { ok: true };
}

// Replace regular slot `slot` (0..2; the evolution skill has its own slot and can't be replaced).
export function learnSkill(state, uid, bookId, slot) {
  const chk = canLearn(state, uid, bookId);
  if (!chk.ok) return chk;
  if (!(slot >= 0 && slot < REGULAR_SLOTS)) return { ok: false, reason: 'slot' };
  if (countOf(state.inventory, bookId) < 1) return { ok: false, reason: 'none' };
  const pet = petBy(state, uid);
  removeItem(state.inventory, bookId, 1);
  if (slot < pet.skills.length) pet.skills[slot] = bookSkill(bookId); else pet.skills.push(bookSkill(bookId));
  bump(state, 'learn');
  return { ok: true };
}

// ---------- T39 human form (docs/07 第 10 节; first version: 焰尾狐 only) ----------
// Needs: evolved + affection 100 + a 化形铃 (made from 3 狐火灯芯 at the home workbench for now).
export function formCheck(state, uid) {
  const pet = petBy(state, uid);
  const missing = [];
  if (!species(pet.species).humanForm) return { ok: false, missing: ['species'] };
  if (pet.canTransform) return { ok: true, unlocked: true };
  if (!pet.evolved) missing.push('evolved');
  if ((pet.affection ?? 0) < 100) missing.push('affection');
  if (countOf(state.inventory, 'item_fox_bell') < 1) missing.push('bell');
  return { ok: missing.length === 0, missing };
}

export function unlockForm(state, uid) {
  const chk = formCheck(state, uid);
  if (!chk.ok || chk.unlocked) return chk;
  removeItem(state.inventory, 'item_fox_bell', 1);
  petBy(state, uid).canTransform = true;
  return { ok: true };
}

// Switch animal ⇄ human; stats never change (docs/07 P10).
export function toggleForm(state, uid) {
  const pet = petBy(state, uid);
  if (!pet?.canTransform) return { ok: false, reason: 'locked' };
  pet.form = pet.form === 'human' ? 'animal' : 'human';
  return { ok: true, form: pet.form };
}
