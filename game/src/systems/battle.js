// Turn-based 3v3 pet battle (docs/02 第 4–5 节, docs/07 第 7 节 bond skill; S06).
// Pure logic, no Phaser: the battle works on copies of the pets and only
// finishBattle() writes results back to the game state (one commit).
// resolveTurn() returns a list of events the battle scene plays back.
import { species } from '../data/pets.js';
import { skill as skillDef } from '../data/skills.js';
import { ITEMS } from '../data/items.js';
import { elementMultiplier } from '../data/elements.js';
import { calcStats, calcDamage, damageRoll, battleSkills, displayName, gainExp, expForKO, baitMultiplier, createPet, wildLevel, catchRate, catchSucceeds, affectionOnCatch } from './petMath.js';
import { countOf, removeItem } from './inventory.js';

export const PARTY_MAX = 3;
import { mulberry32 } from './rng.js';

export const CLOVER_PER_LEVEL = 3;      // 【建议】 clover per KO = 3 × enemy level

// Wild group size by day 【建议】: days 1–4 → 1, 5–9 → 2, 10+ → 3
// (softened after the soak test: groups of 3 from day 7 outpaced pet growth).
export const wildGroupSize = (day) => (day >= 10 ? 3 : day >= 5 ? 2 : 1);

// The touched wild pet leads; companions are rolled from the island seed.
export function makeWildGroup({ species: lead, level, islandSeed, wildIndex, day, pool }) {
  const rng = mulberry32((islandSeed * 97 + wildIndex * 131 + day * 7) >>> 0);
  const group = [createPet(lead, { level, rng, uid: `wild-${wildIndex}-0` })];
  for (let i = 1; i < wildGroupSize(day); i++) {
    const sp = pool[Math.floor(rng() * pool.length)];
    group.push(createPet(sp, { level: wildLevel(day, rng), rng, uid: `wild-${wildIndex}-${i}` }));
  }
  return group;
}

const makeMon = (inst) => {
  const stats = calcStats(inst, { inBattle: true });
  const sp = species(inst.species);
  const uses = {};
  for (const id of battleSkills(inst)) uses[id] = skillDef(id).uses ?? Infinity;
  return {
    uid: inst.uid, species: inst.species, name: displayName(inst), element: sp.element, level: inst.level,
    stats, maxHp: stats.hp, hp: inst.hp == null ? stats.hp : Math.min(inst.hp, stats.hp),
    skills: battleSkills(inst), uses, buffs: [], bondUsed: false, affection: inst.affection ?? 0, form: inst.form,
    src: inst,   // original instance (needed to keep a caught wild pet)
  };
};

// party: the player's pet instances in party order; enemies: wild instances.
export function createBattle({ party, enemies, inventory, rng = Math.random }) {
  const mine = party.map(makeMon);
  const first = mine.findIndex((m) => m.hp > 0);
  return {
    rng,
    turn: 0,
    sides: { me: { mons: mine, active: first }, foe: { mons: enemies.map(makeMon), active: 0 } },
    inventory: inventory.map((s) => ({ ...s })), // copy; real inventory changes on finish
    used: {},                                    // itemId → count used in this battle
    bait: {},                                    // foe uid → best bait multiplier (for catching, T07)
    exp: {},                                     // my uid → exp earned
    clover: 0,
    defeated: [],                                // foe uids knocked out
    caught: null,                                // { uid, favourite } after a successful catch
    over: null,                                  // 'win' | 'lose' | 'flee' | 'caught'
    needSwitch: false,
  };
}

export const canStartBattle = (partyInsts) => partyInsts.some((p) => p.hp == null || p.hp > 0);
export const active = (b, side) => b.sides[side].mons[b.sides[side].active];
const other = (side) => (side === 'me' ? 'foe' : 'me');
const alive = (b, side) => b.sides[side].mons.filter((m) => m.hp > 0);

function statWithBuffs(mon, stat) {
  return mon.buffs.filter((x) => x.stat === stat).reduce((v, x) => v * x.mult, mon.stats[stat]);
}

// Damage preview without randomness (also used by the enemy AI).
export function expectedDamage(attacker, defender, skillId) {
  const s = skillDef(skillId);
  if (!s.power) return 0;
  return calcDamage({ power: s.power, atk: statWithBuffs(attacker, 'atk'), def: statWithBuffs(defender, 'def'), mult: elementMultiplier(s.element, defender.element) });
}

// Enemy AI (docs/02 第 4 节: prefers super-effective skills).
export function chooseEnemySkill(b) {
  const me = active(b, 'foe'), them = active(b, 'me');
  const usable = me.skills.filter((id) => me.uses[id] > 0);
  const heal = usable.find((id) => skillDef(id).effects?.some((e) => e.type === 'heal'));
  if (heal && me.hp < me.maxHp * 0.4) return heal;
  const status = usable.filter((id) => !skillDef(id).power && !skillDef(id).effects?.some((e) => e.type === 'heal'));
  const fresh = status.filter((id) => !skillDef(id).effects.some((e) => (e.target === 'self' ? me : them).buffs.some((x) => x.stat === e.stat)));
  if (fresh.length && b.rng() < 0.2) return fresh[0];
  const attacks = usable.filter((id) => skillDef(id).power > 0);
  if (!attacks.length) return usable[0] ?? 'tackle';
  return attacks.reduce((best, id) => (expectedDamage(me, them, id) > expectedDamage(me, them, best) ? id : best), attacks[0]);
}

// One skill use, with all its consequences, as events.
function useSkill(b, side, skillId, ev) {
  const user = active(b, side), target = active(b, other(side));
  const s = skillDef(skillId);
  user.uses[skillId] -= 1;
  ev.push({ t: 'use', side, name: user.name, skill: skillId, skillName: s.name });
  if (s.power) {
    const mult = elementMultiplier(s.element, target.element);
    let dmg = calcDamage({ power: s.power, atk: statWithBuffs(user, 'atk'), def: statWithBuffs(target, 'def'), mult, rand: damageRoll(b.rng) });
    let bond = false;
    if (dmg >= target.hp && target.hp > 1 && target.affection >= 100 && !target.bondUsed) { dmg = target.hp - 1; target.bondUsed = true; bond = true; }
    target.hp = Math.max(0, target.hp - dmg);
    ev.push({ t: 'damage', side: other(side), amount: dmg, hp: target.hp, maxHp: target.maxHp, eff: mult > 1 ? 'super' : mult < 1 ? 'weak' : null });
    if (bond) ev.push({ t: 'bond', side: other(side), name: target.name });
  }
  for (const e of s.effects ?? []) {
    if (e.type === 'heal') {
      const before = user.hp;
      user.hp = Math.min(user.maxHp, user.hp + Math.floor(user.maxHp * e.pct));
      ev.push({ t: 'heal', side, amount: user.hp - before, hp: user.hp, maxHp: user.maxHp });
    } else if (e.type === 'stat') {
      const who = e.target === 'self' ? user : target;
      who.buffs = who.buffs.filter((x) => x.stat !== e.stat);       // refresh instead of stacking
      who.buffs.push({ stat: e.stat, mult: e.mult, turns: e.turns });
      ev.push({ t: 'stat', side: e.target === 'self' ? side : other(side), stat: e.stat, up: e.mult > 1, name: who.name });
    }
  }
  if (target.hp <= 0) onFaint(b, other(side), ev);
}

function onFaint(b, side, ev) {
  const mon = active(b, side);
  ev.push({ t: 'faint', side, name: mon.name });
  if (side === 'foe') {
    const lvl = mon.level, killer = active(b, 'me');
    b.defeated.push(mon.uid);
    b.exp[killer.uid] = (b.exp[killer.uid] ?? 0) + expForKO(lvl);
    b.clover += CLOVER_PER_LEVEL * lvl;
    ev.push({ t: 'exp', name: killer.name, amount: expForKO(lvl) });
    const next = b.sides.foe.mons.findIndex((m) => m.hp > 0);
    if (next < 0) { b.over = 'win'; ev.push({ t: 'end', result: 'win' }); return; }
    b.sides.foe.active = next;
    ev.push({ t: 'send', side: 'foe', index: next, name: b.sides.foe.mons[next].name });
  } else {
    if (!alive(b, 'me').length) { b.over = 'lose'; ev.push({ t: 'end', result: 'lose' }); return; }
    b.needSwitch = true;
    ev.push({ t: 'need-switch' });
  }
}

// action: { type: 'skill', skill } | { type: 'switch', index } | { type: 'snack', item } | { type: 'flee' }
// Returns { ok, events } — ok false (with reason) when the action is not allowed; nothing changes then.
export function resolveTurn(b, action) {
  if (b.over) return { ok: false, reason: 'over' };
  const me = active(b, 'me');
  if (b.needSwitch) {
    if (action.type !== 'switch') return { ok: false, reason: 'must-switch' };
    const target = b.sides.me.mons[action.index];
    if (!target || target.hp <= 0) return { ok: false, reason: 'bad-switch' };
    b.sides.me.active = action.index; b.needSwitch = false;
    return { ok: true, events: [{ t: 'send', side: 'me', index: action.index, name: target.name }] };  // free switch after a faint
  }
  if (action.type === 'skill' && !(me.skills.includes(action.skill) && me.uses[action.skill] > 0)) return { ok: false, reason: 'no-uses' };
  if (action.type === 'switch') {
    const target = b.sides.me.mons[action.index];
    if (!target || target.hp <= 0 || action.index === b.sides.me.active) return { ok: false, reason: 'bad-switch' };
  }
  if (action.type === 'snack' && (!ITEMS[action.item]?.food || countOf(b.inventory, action.item) < 1)) return { ok: false, reason: 'no-item' };
  if (action.type === 'catch') {
    if (!ITEMS[action.item]?.netMult || countOf(b.inventory, action.item) < 1) return { ok: false, reason: 'no-net' };
    if (active(b, 'foe').hp <= 0) return { ok: false, reason: 'fainted' };   // A09
  }

  const ev = [];
  b.turn += 1;
  const enemySkill = chooseEnemySkill(b);
  // 1. non-skill actions always go first
  if (action.type === 'flee') { b.over = 'flee'; ev.push({ t: 'flee' }, { t: 'end', result: 'flee' }); return { ok: true, events: ev }; }
  if (action.type === 'switch') {
    b.sides.me.active = action.index;
    ev.push({ t: 'send', side: 'me', index: action.index, name: active(b, 'me').name });
  }
  if (action.type === 'snack') {
    removeItem(b.inventory, action.item, 1);
    b.used[action.item] = (b.used[action.item] ?? 0) + 1;
    const foe = active(b, 'foe');
    const mult = baitMultiplier(foe.species, action.item);
    b.bait[foe.uid] = Math.max(b.bait[foe.uid] ?? 1, mult);
    ev.push({ t: 'snack', item: action.item, itemName: ITEMS[action.item].name, name: foe.name, favourite: mult === 1.5 });
  }
  if (action.type === 'catch') {
    // docs/02 第 6 节: one net per throw, success or not; a failed throw is the player's action
    removeItem(b.inventory, action.item, 1);
    b.used[action.item] = (b.used[action.item] ?? 0) + 1;
    const foe = active(b, 'foe');
    const rate = catchChance(b, action.item);
    const roll = b.rng();
    ev.push({ t: 'throw', item: action.item, itemName: ITEMS[action.item].name, name: foe.name, rate });
    if (catchSucceeds(rate, roll)) {
      const favourite = (b.bait[foe.uid] ?? 1) === 1.5;
      b.caught = { uid: foe.uid, favourite };
      const killer = active(b, 'me');
      b.exp[killer.uid] = (b.exp[killer.uid] ?? 0) + expForKO(foe.level);
      b.over = 'caught';
      ev.push({ t: 'caught', name: foe.name }, { t: 'exp', name: killer.name, amount: expForKO(foe.level) }, { t: 'end', result: 'caught' });
      return { ok: true, events: ev };
    }
    ev.push({ t: 'escape', name: foe.name });
  }
  // 2. skills by speed (ties: the player first)
  const order = [];
  if (action.type === 'skill') order.push(['me', action.skill]);
  const foeFirst = action.type === 'skill' && statWithBuffs(active(b, 'foe'), 'spd') > statWithBuffs(me, 'spd');
  if (foeFirst) order.unshift(['foe', enemySkill]); else order.push(['foe', enemySkill]);
  for (const [side, id] of order) {
    if (b.over || b.needSwitch) break;
    const user = active(b, side);
    if (user.hp <= 0) continue;
    // an enemy sent in this turn (after a faint) doesn't act until next turn
    if (side === 'foe' && ev.some((e) => e.t === 'send' && e.side === 'foe')) continue;
    useSkill(b, side, id, ev);
  }
  // 3. buffs tick down at the end of the turn
  for (const side of ['me', 'foe']) for (const m of b.sides[side].mons) {
    m.buffs.forEach((x) => { x.turns -= 1; });
    m.buffs = m.buffs.filter((x) => x.turns > 0);
  }
  return { ok: true, events: ev };
}

// Current catch chance against the active foe with this net (shown in the UI).
export function catchChance(b, netId) {
  const foe = active(b, 'foe');
  return catchRate({ base: species(foe.species).catchRate, hp: foe.hp, maxHp: foe.maxHp, netMult: ITEMS[netId].netMult, baitMult: b.bait[foe.uid] ?? 1 });
}

// One commit at the end (docs/02 第 4 节 5–6): pet HP, exp, used items, clover,
// defeated wild pets go into the island record. Returns a summary for the UI.
export function finishBattle(state, b, { wildId } = {}) {
  const summary = { result: b.over, exp: [], clover: b.clover, levelUps: [] };
  for (const m of b.sides.me.mons) {
    const inst = state.pets.find((p) => p.uid === m.uid);
    if (!inst) continue;
    inst.hp = m.hp >= m.maxHp ? null : m.hp;
    const gained = b.exp[m.uid] ?? 0;
    if (gained) {
      const ups = gainExp(inst, gained);
      summary.exp.push({ name: m.name, amount: gained });
      if (ups) summary.levelUps.push({ name: m.name, level: inst.level });
    }
  }
  for (const [id, n] of Object.entries(b.used)) removeItem(state.inventory, id, n);
  state.clover += b.clover;
  if (b.over === 'caught' && b.caught) {
    const mon = b.sides.foe.mons.find((m) => m.uid === b.caught.uid);
    let n = state.pets.length, uid;
    do uid = `pet-${mon.species}-${(n++).toString(36)}`; while (state.pets.some((p) => p.uid === uid));
    const inst = { ...JSON.parse(JSON.stringify(mon.src)), uid, hp: mon.hp >= mon.maxHp ? null : mon.hp, affection: affectionOnCatch(b.caught.favourite) };
    state.pets.push(inst);
    const joined = state.party.length < PARTY_MAX;
    if (joined) state.party.push(uid);
    summary.caught = { uid, name: mon.name, joined, affection: inst.affection, stars: inst.stars, shiny: inst.shiny };
  }
  if ((b.over === 'win' || b.over === 'caught') && wildId && state.expedition && !state.expedition.changes.pets.includes(wildId)) state.expedition.changes.pets.push(wildId);
  return summary;
}
