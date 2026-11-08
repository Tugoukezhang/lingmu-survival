// Pet growth and battle formulas (docs/02 第 2/5/6 节, docs/07 第 2–6 节).
// Pure functions, no Phaser: tested in Node by tools/logic-test.mjs.
// Randomness always comes from an injected rng() in [0, 1) so tests and
// seeded content are reproducible.
import { species } from '../data/pets.js';
import { NATURES, NATURE_IDS } from '../data/natures.js';
import { skill } from '../data/skills.js';
import { elementMultiplier } from '../data/elements.js';

export const MAX_LEVEL = 30;
export const SKILL3_LEVEL = 5;
export const REGULAR_SLOTS = 3; // + 1 evolution slot = 4 skills max (docs/07 第 4 节)
export const EVOLVE_LEVEL = 12;
export const EVOLVE_AFFECTION = 30;
export const EVOLVE_BASE_MULT = 1.25;
export const BASE_GROWTH = 0.08;
export const STAR_FACTOR = { 1: 0.8, 2: 0.9, 3: 1.0, 4: 1.1, 5: 1.2 };
export const STAR_ODDS = [[1, 0.30], [2, 0.30], [3, 0.25], [4, 0.12], [5, 0.03]];
export const SHINY_CHANCE = 0.01;
export const CATCH_CAP = 0.95;
export const STATS = ['hp', 'atk', 'def', 'spd'];

// Floor that ignores float noise like 12.999999999 (all formulas round down).
export const ifloor = (x) => Math.floor(x + 1e-9);

// ---------- rolls ----------
export function rollStars(rng) {
  let r = rng();
  for (const [stars, p] of STAR_ODDS) { if (r < p) return stars; r -= p; }
  return 5;
}
export const rollNature = (rng) => NATURE_IDS[Math.floor(rng() * NATURE_IDS.length)];
export const rollShiny = (rng) => rng() < SHINY_CHANCE;

// ---------- pet instances ----------
// A pet instance is plain JSON (goes straight into the save). Stats are never
// stored: always recomputed from these fields (docs/07 第 2 节).
let uidCounter = 0;
export function createPet(speciesId, { level = 1, rng = Math.random, stars, nature, shiny, uid } = {}) {
  const sp = species(speciesId);
  const pet = {
    uid: uid ?? `p${Date.now().toString(36)}${(uidCounter++).toString(36)}`,
    species: sp.id,
    level: Math.max(1, Math.min(MAX_LEVEL, level)),
    exp: 0,
    stars: stars ?? rollStars(rng),
    nature: nature ?? rollNature(rng),
    shiny: shiny ?? rollShiny(rng),
    evolved: false,
    affection: 0,
    skills: sp.skills.slice(0, level >= SKILL3_LEVEL ? 3 : 2), // regular slots only
    form: 'animal',
    canTransform: false,
    cosmetics: {},
  };
  return pet;
}

// Starter pets: fixed 3 stars, 温和, not shiny 【建议】.
export const createStarter = (speciesId, opts = {}) =>
  createPet(speciesId, { stars: 3, nature: 'gentle', shiny: false, ...opts });

// Skills usable in battle: the regular slots plus the evolution skill.
export function battleSkills(pet) {
  return pet.evolved ? [...pet.skills, species(pet.species).evolution.skill] : [...pet.skills];
}

export function displayName(pet) {
  const sp = species(pet.species);
  return pet.evolved ? sp.evolution.name : sp.name;
}

// ---------- stats ----------
// order: base (×1.25 if evolved) → growth by level and stars → nature → (battle) affection
export function calcStats(pet, { inBattle = false } = {}) {
  const sp = species(pet.species);
  const rate = BASE_GROWTH * STAR_FACTOR[pet.stars];
  const nat = NATURES[pet.nature] ?? NATURES.gentle;
  const out = {};
  for (const k of STATS) {
    let base = sp.base[k];
    if (pet.evolved) base = ifloor(base * EVOLVE_BASE_MULT);
    let v = ifloor(base * (1 + rate * (pet.level - 1)));
    if (nat.up === k) v = ifloor(v * 1.1);
    if (nat.down === k) v = ifloor(v * 0.9);
    out[k] = v;
  }
  if (inBattle) out.atk = ifloor(out.atk * affectionAttackMult(pet.affection));
  return out;
}

export const affectionAttackMult = (aff) => (aff >= 100 ? 1.10 : aff >= 50 ? 1.05 : 1);

// ---------- experience ----------
export const expToNext = (level) => 20 * level;
export const expForKO = (enemyLevel) => 8 * enemyLevel;

// Adds exp, levels up as many times as needed. Returns the number of levels gained.
export function gainExp(pet, amount) {
  if (pet.level >= MAX_LEVEL) { pet.exp = 0; return 0; }
  pet.exp += amount;
  const before = pet.level;
  let gained = 0;
  while (pet.level < MAX_LEVEL && pet.exp >= expToNext(pet.level)) {
    pet.exp -= expToNext(pet.level);
    pet.level++;
    gained++;
  }
  if (pet.level >= MAX_LEVEL) pet.exp = 0;
  // third skill unlocks when crossing Lv5 (only if a regular slot is free)
  if (before < SKILL3_LEVEL && pet.level >= SKILL3_LEVEL) {
    const third = species(pet.species).skills[2];
    if (!pet.skills.includes(third) && pet.skills.length < REGULAR_SLOTS) pet.skills.push(third);
  }
  return gained;
}

// Wild level: 1 + floor(day / 2), random −1..+1, at least 1.
export const wildLevel = (day, rng) => Math.max(1, 1 + Math.floor(day / 2) + Math.floor(rng() * 3) - 1);

// ---------- battle ----------
// damage = floor(power × atk ÷ def × 0.4 × matchup × rand(0.9–1.1)) + 1
export const damageRoll = (rng) => 0.9 + rng() * 0.2;
export function calcDamage({ power, atk, def, mult = 1, rand = 1 }) {
  if (!power) return 0;
  return ifloor(power * atk / def * 0.4 * mult * rand) + 1;
}

// Damage of a skill from one pet instance to another (no temporary buffs).
export function skillDamage(attacker, defender, skillId, { rand = 1, atk, def } = {}) {
  const s = skill(skillId);
  const a = atk ?? calcStats(attacker, { inBattle: true }).atk;
  const d = def ?? calcStats(defender, { inBattle: true }).def;
  return calcDamage({ power: s.power, atk: a, def: d, mult: elementMultiplier(s.element, species(defender.species).element), rand });
}

// ---------- catching ----------
// rate = base × (1 − 0.7 × hp ÷ maxHp) × net × bait, capped at 95%; 0 when fainted.
export function catchRate({ base, hp, maxHp, netMult = 1, baitMult = 1 }) {
  if (hp <= 0) return 0;
  return Math.min(CATCH_CAP, base * (1 - 0.7 * hp / maxHp) * netMult * baitMult);
}
export const baitMultiplier = (speciesId, foodId) => (!foodId ? 1 : species(speciesId).food === foodId ? 1.5 : 1.2);
export const catchSucceeds = (rate, roll) => roll < rate;
// affection after a catch: 10, or 20 if the favourite bait was used
export const affectionOnCatch = (usedFavouriteBait) => (usedFavouriteBait ? 20 : 10);

// ---------- evolution ----------
// Returns { ok, missing: [] } where missing lists what is lacking: 'level' | 'affection' | 'stone' | 'evolved'.
export function canEvolve(pet, { hasStone }) {
  const missing = [];
  if (pet.evolved) missing.push('evolved');
  if (pet.level < EVOLVE_LEVEL) missing.push('level');
  if (pet.affection < EVOLVE_AFFECTION) missing.push('affection');
  if (!hasStone) missing.push('stone');
  return { ok: missing.length === 0, missing };
}

// Marks the pet evolved; the evolution skill appears in its own 4th slot
// (see battleSkills). The caller removes the stone from the inventory.
export function evolve(pet) {
  if (pet.evolved) return false;
  pet.evolved = true;
  return true;
}
