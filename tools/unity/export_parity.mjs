// Reference results computed with the web version's own rule code, for the Unity port's parity tests
// (unity/Assets/Tests/EditMode/RulesParityTests.cs). Every case is written as one plain text line so
// the C# side can build the same line and compare exactly.
//   node tools/unity/export_parity.mjs   → unity/Assets/Tests/EditMode/Data/parity_ref.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PETS, STARTERS } from '../../game/src/data/pets.js';
import { mulberry32 } from '../../game/src/systems/rng.js';
import * as M from '../../game/src/systems/petMath.js';
import * as S from '../../game/src/systems/save.js';
import * as G from '../../game/src/systems/islandGen.js';
import * as B from '../../game/src/systems/battle.js';
import * as CP from '../../game/src/systems/camp.js';
import * as CR from '../../game/src/systems/crafting.js';
import * as DY from '../../game/src/systems/daily.js';
import * as TW from '../../game/src/systems/town.js';
import * as PC from '../../game/src/systems/petcare.js';
import * as TR from '../../game/src/systems/travel.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pool = PETS.map((p) => p.id);

// ---------- islands ----------
const grid = (g) => g.map((row) => row.map((v) => (v ? 1 : 0)).join('')).join('/');
const things = (list, f) => list.map(f).join(';');
const islandLine = (i) => [
  i.seed, i.requestedSeed, i.attempts, i.fallback, i.area, `L${i.landing.tx},${i.landing.ty}`, `A${i.airship.tx},${i.airship.ty}`,
  grid(i.walk), grid(i.water),
  things(i.camps, (c) => `${c.id}@${c.tx},${c.ty}`),
  things(i.chests, (c) => `${c.id}@${c.tx},${c.ty}${c.bonus ? 'b' : ''}`),
  things(i.resources, (r) => `${r.id}:${r.type}@${r.tx},${r.ty}${r.rare ? 'r' : ''}`),
  things(i.pets, (p) => `${p.id}:${p.species}@${p.tx},${p.ty}`),
  things(i.thorns, (t) => `${t.id}@${t.tx},${t.ty}`),
  things(i.rare, (r) => `${r.kind}:${r.id}@${r.tx},${r.ty}`),
].join('|');
const islandSeeds = [20261108, 1, 2, ...Array.from({ length: 24 }, (_, k) => (k + 1) * 7919), ...Array.from({ length: 6 }, (_, k) => (k + 1) * 104729)];
const st0 = S.newGameState({ now: 1 });
for (let d = 1; d <= 4; d++) for (let t = 0; t < 2; t++) islandSeeds.push(TR.newIslandSeed({ ...st0, day: d, flags: { trips: t } }));
const islands = islandSeeds.map((seed) => ({ seed, line: islandLine(G.generateIsland(seed)) }));

// ---------- battles (auto play with a seeded rng, a snack and a net now and then) ----------
const evLine = (e) => [e.t, e.side ?? '', e.amount ?? '', e.hp ?? '', e.eff ?? '', e.skill ?? '', e.index ?? '', e.result ?? '', e.rate != null ? e.rate.toFixed(6) : ''].join(':');
const petLine = (p) => [p.uid, p.species, p.level, p.exp, p.hp ?? 'full', p.affection, p.stars, p.nature, p.shiny, p.skills.join('+')].join(':');
const battles = [];
for (let i = 0; i < 40; i++) {
  const rng = mulberry32(i * 7919 + 13);
  const starter = STARTERS[i % 3], day = 1 + (i % 12);
  const st = S.newGameState({ now: 1, starter });
  st.pets[0].level = 3 + (i % 9);
  st.expedition = { seed: i, biome: 'mistwood', changes: G.emptyChanges(), lostBag: null }; st.player.area = 'expedition';
  const foes = B.makeWildGroup({ species: pool[i % 6], level: M.wildLevel(day, rng), islandSeed: i * 31, wildIndex: i % 5, day, pool });
  const b = B.createBattle({ party: [st.pets[0]], enemies: foes, inventory: st.inventory, rng, ambush: i % 7 === 0 });
  const log = [];
  for (let k = 0; k < 80 && !b.over; k++) {
    let action = B.autoAction(b);
    if (k === 1 && i % 3 === 0) action = { type: 'snack', item: 'item_carrot' };
    if (k === 2 && i % 4 === 0) action = { type: 'catch', item: 'item_net_grass' };
    const r = B.resolveTurn(b, action);
    log.push(r.ok ? r.events.map(evLine).join(' ') : `x:${r.reason}`);
  }
  const sum = B.finishBattle(st, b, { wildId: `w${i}` });
  battles.push({
    i,
    foes: foes.map(petLine).join(' '),
    log: log.join(' | '),
    end: [b.over, b.clover, JSON.stringify(b.exp), sum.exp.map((x) => `${x.name}+${x.amount}`).join(','), sum.levelUps.map((x) => `${x.name}>${x.level}`).join(','),
      sum.caught ? `${sum.caught.uid}:${sum.caught.joined}:${sum.caught.affection}` : '-'].join('|'),
    state: [st.clover, st.pets.map(petLine).join(' '), st.inventory.map((x) => `${x.id}x${x.count}`).join(','), st.party.join(','), st.expedition.changes.pets.join(','), JSON.stringify(st.flags.stats)].join('|'),
  });
}

// ---------- chest loot, gathering drops ----------
const lootLine = (l) => `${Object.entries(l.items).map(([k, v]) => `${k}x${v}`).join(',')}|${l.clover}`;
const chests = [];
for (let seed = 0; seed < 40; seed++) for (const id of ['c0', 'c1', 'c2']) chests.push({ seed, id, bonus: id === 'c2', line: lootLine(CP.chestLoot(seed, id, id === 'c2')) });
const gathers = [];
for (let seed = 0; seed < 60; seed++) {
  const st = S.newGameState({ now: 1 });
  st.expedition = { seed: seed * 977, biome: 'mistwood', changes: G.emptyChanges() }; st.player.area = 'expedition';
  st.inventory = [{ id: 'item_pickaxe', count: 1 }];
  const r = CR.gather(st, { id: `r${seed % 13}`, type: 'crystal' });
  gathers.push({ seed: seed * 977, id: `r${seed % 13}`, line: Object.entries(r.gains).map(([k, v]) => `${k}x${v}`).join(',') });
}

// ---------- daily tasks, shop stock, resident lines, pet work, island seeds ----------
const daily = [], stock = [], talks = [], work = [], seeds = [];
for (const seed of [20261108, 1, 2, 77]) for (let day = 1; day <= 9; day++) {
  const st = { ...S.newGameState({ now: 1, seed }), day };
  daily.push({ seed, day, line: DY.ensureDaily(st).tasks.map((t) => t.id).join(',') });
  stock.push({ seed, day, line: TW.stock(st).map((x) => `${x.id}@${x.price}`).join(',') });
  for (const npc of ['granny', 'ali', 'lumi']) { const s2 = { ...S.newGameState({ now: 1, seed }), day }; talks.push({ seed, day, npc, line: TW.talk(s2, npc).line }); }
  for (let trips = 0; trips < 3; trips++) seeds.push({ seed, day, trips, value: TR.newIslandSeed({ seed, day, flags: { trips } }) });
}
for (let day = 1; day <= 12; day++) {
  const st = S.newGameState({ now: 1 });
  st.day = day; st.party = ['pet-acorn'];
  for (const id of ['pet-pup', 'pet-fox', 'pet-shark', 'pet-shadecat', 'pet-starbear']) PC.setJob(st, id, true);
  st.pets.forEach((p, k) => { p.affection = (day * 13 + k * 29) % 101; });
  st.farm.plots['1,1'] = { tilled: true, crop: 'carrot', days: 0, watered: false };
  st.farm.plots['2,1'] = { tilled: true, crop: 'pumpkin', days: 1, watered: day % 2 === 0 };
  const lines = PC.runPetWork(st);
  work.push({ day, line: [lines.join(' / '), st.clover, st.storage.map((x) => `${x.id}x${x.count}`).join(','), Object.values(st.farm.plots).map((p) => p.watered).join(',')].join('|') });
}

const out = join(root, 'unity', 'Assets', 'Tests', 'EditMode', 'Data', 'parity_ref.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ islands, battles, chests, gathers, daily, stock, talks, work, seeds }, null, 1));
console.log(`wrote ${out}: ${islands.length} islands, ${battles.length} battles, ${chests.length} chests, ${daily.length} days`);
