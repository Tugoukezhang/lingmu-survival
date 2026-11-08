// Pet care: feeding, petting, bonding, and work at home (T12; docs/02 第 7 节, docs/07 第 7 节).
// Pure functions on the game state, no Phaser.
import { species } from '../data/pets.js';
import { ITEMS } from '../data/items.js';
import { CROPS } from '../data/crops.js';
import { countOf, addItem, removeItem } from './inventory.js';
import { mulberry32 } from './rng.js';
import { farmOf, ripe } from './farm.js';
import { bump } from './guide.js';

export const AFFECTION_MAX = 100;
export const FEED_FAV = 15, FEED_OTHER = 5, PET_GAIN = 2;
export const BOND_BATTLE = 1, BOND_TRIP = 2, BOND_DAILY_CAP = 5;

// Work at home 【建议】: base output at affection 0; amount = floor(base × (1 + affection / 100)).
export const WORK = {
  gather:   { name: '采集', out: [['item_berry', 3], ['item_grass', 2]] },
  fish:     { name: '钓鱼', out: [['item_fish', 2]] },
  chop:     { name: '伐木', out: [['item_wood', 4]] },
  mine:     { name: '挖矿', out: [['item_stone', 4]], bonusAt50: ['item_crystal', 1] },
  water:    { name: '浇水', plots: 4 },
  treasure: { name: '寻宝', clover: 10, seedChance: 0.3 },
};
export const workAmount = (base, affection) => Math.floor(base * (1 + (affection ?? 0) / 100));

const petBy = (state, uid) => state.pets.find((p) => p.uid === uid);
const addAffection = (pet, n) => { const before = pet.affection ?? 0; pet.affection = Math.min(AFFECTION_MAX, before + n); return pet.affection - before; };

// Food a pet will eat: anything edible, plus every pet's favourite (sunflower, starwheat…).
export const isPetFood = (id) => !!ITEMS[id]?.food || Object.values(CROPS).some((c) => c.crop === id);

// Feed once per day: favourite +15, other food +5. Returns { ok, gain, favourite } or { ok: false, reason }.
export function feed(state, uid, foodId) {
  const pet = petBy(state, uid);
  if (!pet) return { ok: false, reason: 'unknown' };
  if (pet.fedDay === state.day) return { ok: false, reason: 'fed' };
  if (!isPetFood(foodId)) return { ok: false, reason: 'not-food' };
  if (!removeItem(state.inventory, foodId, 1)) return { ok: false, reason: 'none' };
  const favourite = species(pet.species).food === foodId;
  pet.fedDay = state.day;
  const gain = addAffection(pet, favourite ? FEED_FAV : FEED_OTHER);
  bump(state, 'feed');
  return { ok: true, gain, favourite };
}

// Pet once per day: +2.
export function petPet(state, uid) {
  const pet = petBy(state, uid);
  if (!pet) return { ok: false, reason: 'unknown' };
  if (pet.pettedDay === state.day) return { ok: false, reason: 'petted' };
  pet.pettedDay = state.day;
  const gain = addAffection(pet, PET_GAIN);
  bump(state, 'pet');
  return { ok: true, gain };
}

// Adventure bonding (docs/07 第 7 节): win a battle together +1, finish a trip together +2, each ≤ +5 per day.
function bond(state, kind, n) {
  for (const uid of state.party) {
    const pet = petBy(state, uid);
    if (!pet) continue;
    if (!pet.bond || pet.bond.day !== state.day) pet.bond = { day: state.day, battle: 0, trip: 0 };
    const room = BOND_DAILY_CAP - pet.bond[kind];
    const add = Math.min(n, room);
    if (add > 0) { pet.bond[kind] += add; addAffection(pet, add); }
  }
}
export const bondFromBattle = (state) => bond(state, 'battle', BOND_BATTLE);
export const bondFromTrip = (state) => bond(state, 'trip', BOND_TRIP);

// ---------- work ----------
export function setJob(state, uid, on) {
  const pet = petBy(state, uid);
  if (!pet) return { ok: false, reason: 'unknown' };
  if (on && state.party.includes(uid)) return { ok: false, reason: 'party' };
  if (on && state.player.area !== 'home') return { ok: false, reason: 'away' };
  pet.job = !!on;
  return { ok: true };
}

export const workers = (state) => state.pets.filter((p) => p.job && !state.party.includes(p.uid));

// Daily settlement step "宠物打工": outputs go to the home storage; 浇水 waters the farm for the new day.
export function runPetWork(state) {
  const lines = [];
  state.storage = state.storage ?? [];
  workers(state).forEach((pet, i) => {
    const sp = species(pet.species), w = WORK[sp.work];
    if (!w) return;
    const aff = pet.affection ?? 0, got = [];
    for (const [id, base] of w.out ?? []) { const n = workAmount(base, aff); addItem(state.storage, id, n, Infinity); got.push(`${ITEMS[id].name} ×${n}`); }
    if (w.bonusAt50 && aff >= 50) { addItem(state.storage, w.bonusAt50[0], w.bonusAt50[1], Infinity); got.push(`${ITEMS[w.bonusAt50[0]].name} ×${w.bonusAt50[1]}`); }
    if (w.clover) { const n = workAmount(w.clover, aff); state.clover += n; got.push(`四叶草 ×${n}`); }
    if (w.seedChance) {
      const rng = mulberry32((state.day * 7919 + i * 131 + 17) >>> 0);
      if (rng() < w.seedChance) { const keys = Object.keys(CROPS); const seed = CROPS[keys[Math.floor(rng() * keys.length)]].seed; addItem(state.storage, seed, 1, Infinity); got.push(`${ITEMS[seed].name} ×1`); }
    }
    if (w.plots) {
      const want = workAmount(w.plots, aff);
      let n = 0;
      for (const p of Object.values(farmOf(state).plots)) { if (n >= want) break; if (p.crop && !p.watered && !ripe(p)) { p.watered = true; n++; } }
      got.push(n ? `浇了 ${n} 块地` : '没有要浇的地');
    }
    lines.push(`${sp.name}${w.name}：${got.join('、')}`);
  });
  if (lines.length && lines.some((l) => !l.endsWith('没有要浇的地'))) lines.push('（打工带回的东西放在家园仓库）');
  return lines;
}

export const caredToday = (state, pet) => ({ fed: pet.fedDay === state.day, petted: pet.pettedDay === state.day });
export const foodsInBag = (state) => state.inventory.filter((s) => isPetFood(s.id));
export const hasFood = (state, id) => countOf(state.inventory, id) > 0;
