// Logic tests for pure game rules (no browser). Every check reproduces a
// worked example or acceptance case from the design docs.
// Run: cd tools && node logic-test.mjs
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PETS, STARTERS, species } from '../game/src/data/pets.js';
import { SKILLS } from '../game/src/data/skills.js';
import { NATURES, NATURE_IDS } from '../game/src/data/natures.js';
import { ELEMENTS, NORMAL, elementMultiplier } from '../game/src/data/elements.js';
import { mulberry32 } from '../game/src/systems/rng.js';
import * as M from '../game/src/systems/petMath.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const eq = (name, got, want) => check(name, got === want, `得到 ${got}，应为 ${want}`);
const near = (name, got, want, tol = 0.001) => check(name, Math.abs(got - want) <= tol, `得到 ${got.toFixed(4)}，应为 ${want}`);
const pet = (id, o = {}) => M.createPet(id, { stars: 3, nature: 'gentle', shiny: false, uid: 't', ...o });

// ---------- data integrity ----------
eq('宠物 6 种', PETS.length, 6);
check('每只宠物：属性有效、4 项基础值、3 个技能存在、进化技能存在', PETS.every((p) =>
  ELEMENTS.includes(p.element) && M.STATS.every((k) => Number.isInteger(p.base[k]) && p.base[k] > 0)
  && p.skills.length === 3 && p.skills.every((s) => SKILLS[s]) && SKILLS[p.evolution.skill]?.evolution));
check('每只宠物都有待机图', PETS.every((p) => existsSync(path.join(root, `game/assets/pets/pet_${p.id}_idle_01.png`))
  && (!p.humanForm || existsSync(path.join(root, `game/assets/pets/pet_${p.humanForm}_idle_01.png`)))));
check('技能属性都有效', Object.values(SKILLS).every((s) => s.element === null || s.element === NORMAL || ELEMENTS.includes(s.element)));
check('伤害技能有威力，状态技能有效果', Object.values(SKILLS).every((s) => s.power > 0 || s.effects?.length));
eq('性格 13 种', NATURE_IDS.length, 13);
check('12 种性格加减成组合各不相同', new Set(Object.values(NATURES).filter((n) => n.up).map((n) => n.up + n.down)).size === 12);
check('开局三选一都在名单里', STARTERS.every((id) => species(id)));

// ---------- element matchups (docs/02 第 1 节) ----------
eq('水打火 ×1.5', elementMultiplier('水', '火'), 1.5);
eq('火打水 ×0.67', elementMultiplier('火', '水'), 0.67);
eq('森打水 ×1.5', elementMultiplier('森', '水'), 1.5);
eq('光打暗 ×1.5', elementMultiplier('光', '暗'), 1.5);
eq('暗打光 ×1.5', elementMultiplier('暗', '光'), 1.5);
eq('光打森 ×1', elementMultiplier('光', '森'), 1);
eq('普通技能 ×1', elementMultiplier(NORMAL, '火'), 1);

// ---------- base stats & growth (docs/02 第 2 节, docs/07 第 2 节) ----------
const foxL1 = M.calcStats(pet('fox'));
check('焰尾狐 Lv1 属性 = 表格基础值', foxL1.hp === 42 && foxL1.atk === 13 && foxL1.def === 10 && foxL1.spd === 12, JSON.stringify(foxL1));
eq('P01 焰尾狐 Lv12 3 星温和未进化 攻击', M.calcStats(pet('fox', { level: 12 })).atk, 24);
const evo = pet('fox', { level: 12 }); M.evolve(evo);
eq('P02 进化后攻击', M.calcStats(evo).atk, 30);
check('P02 进化后学会狐火灯笼，名字变灯焰狐', M.battleSkills(evo).includes('foxlantern') && M.displayName(evo) === '灯焰狐');
const evo5 = pet('fox', { level: 12, stars: 5 }); M.evolve(evo5);
const evo1 = pet('fox', { level: 12, stars: 1 }); M.evolve(evo1);
eq('P03 进化 5 星攻击', M.calcStats(evo5).atk, 32);
eq('P03 进化 1 星攻击', M.calcStats(evo1).atk, 27);
const brave = pet('fox', { level: 12, nature: 'brave' }); M.evolve(brave); brave.affection = 100;
eq('P04 进化 3 星勇敢 面板攻击', M.calcStats(brave).atk, 33);
eq('P04 好感 100 对战中攻击', M.calcStats(brave, { inBattle: true }).atk, 36);
eq('好感 50 对战攻击 ×1.05', M.affectionAttackMult(50), 1.05);
eq('好感 49 无加成', M.affectionAttackMult(49), 1);

// ---------- damage (docs/02 第 5 节) ----------
const fox1 = pet('fox'), acorn1 = pet('acorn');
eq('A01 焰尾狐小火苗打橡果刺猬 伤害', M.skillDamage(fox1, acorn1, 'ember'), 30);
eq('焰尾狐蹭蹭打橡果刺猬 伤害', M.skillDamage(fox1, acorn1, 'tackle'), 14);
eq('状态技能伤害为 0', M.skillDamage(fox1, acorn1, 'heal'), 0);
const rolls = Array.from({ length: 1000 }, (_, i) => M.damageRoll(mulberry32(i + 1)));
check('伤害随机数在 0.9–1.1', rolls.every((r) => r >= 0.9 && r < 1.1));

// ---------- experience (docs/02 第 5 节) ----------
const exp = pet('fox');
M.gainExp(exp, M.expForKO(2));
check('Lv1 击倒 Lv2 得 16 经验，不升级', exp.level === 1 && exp.exp === 16, `Lv${exp.level} exp ${exp.exp}`);
M.gainExp(exp, M.expForKO(1));
check('再击倒 Lv1 → 升到 Lv2，余 4', exp.level === 2 && exp.exp === 4, `Lv${exp.level} exp ${exp.exp}`);
const sk = pet('acorn');
check('Lv1 会 2 个技能', sk.skills.length === 2 && !sk.skills.includes('shell'), sk.skills.join(','));
M.gainExp(sk, 20 + 40 + 60 + 80);
check('升到 Lv5 学会第 3 个技能「刺球」', sk.level === 5 && sk.skills.includes('shell'), `Lv${sk.level} ${sk.skills}`);
const cap = pet('fox', { level: 29 }); M.gainExp(cap, 99999);
check('等级上限 30', cap.level === 30 && cap.exp === 0);
const lv = Array.from({ length: 300 }, (_, i) => M.wildLevel(6, mulberry32(i + 7)));
check('第 6 天野生宠物等级在 3–5', lv.every((l) => l >= 3 && l <= 5) && new Set(lv).size === 3, [...new Set(lv)].sort().join(','));
check('第 0 天野生宠物等级最低 1', Array.from({ length: 100 }, (_, i) => M.wildLevel(0, mulberry32(i + 1))).every((l) => l >= 1));

// ---------- catching (docs/02 第 6 节) ----------
const base = species('acorn').catchRate;
near('满血草编网 15%', M.catchRate({ base, hp: 46, maxHp: 46 }), 0.15);
near('剩 16 体力 37.8%', M.catchRate({ base, hp: 16, maxHp: 46 }), 0.3783);
const bait = M.baitMultiplier('acorn', 'carrot');
eq('萝卜是橡果刺猬的喜好食物 ×1.5', bait, 1.5);
eq('其他食物 ×1.2', M.baitMultiplier('acorn', 'berry'), 1.2);
const a04 = M.catchRate({ base, hp: 16, maxHp: 46, baitMult: bait });
near('剩 16 + 萝卜 56.7%', a04, 0.5674);
near('再换藤编网 85.1%', M.catchRate({ base, hp: 16, maxHp: 46, baitMult: bait, netMult: 1.5 }), 0.8511);
eq('剩 1 + 藤编网 + 喜好 封顶 95%', M.catchRate({ base, hp: 1, maxHp: 46, baitMult: 1.5, netMult: 1.5 }), 0.95);
check('A04 随机数 0.50 → 成功', M.catchSucceeds(a04, 0.50));
check('A08 随机数 0.60 → 失败', !M.catchSucceeds(a04, 0.60));
eq('A09 对方体力 0 不能捕捉', M.catchRate({ base, hp: 0, maxHp: 46, baitMult: 1.5, netMult: 1.5 }), 0);
eq('用了喜好诱饵捕捉好感 20', M.affectionOnCatch(true), 20);

// ---------- aptitude / shiny rolls (docs/07 第 5、8 节) ----------
const rng = mulberry32(20261108), N = 10000, cnt = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
for (let i = 0; i < N; i++) cnt[M.rollStars(rng)]++;
const want = { 1: 30, 2: 30, 3: 25, 4: 12, 5: 3 };
check('P07 10000 次资质分布偏差 ≤ 1 个百分点', Object.keys(want).every((k) => Math.abs(cnt[k] / N * 100 - want[k]) <= 1),
  Object.keys(want).map((k) => `${k}星 ${(cnt[k] / N * 100).toFixed(1)}%`).join(' '));
let shiny = 0; const r2 = mulberry32(99);
for (let i = 0; i < 100000; i++) if (M.rollShiny(r2)) shiny++;
near('异色概率约 1%', shiny / 100000, 0.01, 0.002);
check('同一种子创建的宠物完全相同', JSON.stringify(M.createPet('pup', { rng: mulberry32(5), uid: 'x' })) === JSON.stringify(M.createPet('pup', { rng: mulberry32(5), uid: 'x' })));

// ---------- evolution conditions (docs/07 第 3 节) ----------
const p05 = pet('fox', { level: 12 }); p05.affection = 29;
const r05 = M.canEvolve(p05, { hasStone: true });
check('P05 好感 29 不能进化，提示缺好感', !r05.ok && r05.missing.join() === 'affection', r05.missing.join());
p05.affection = 30;
check('好感 30、等级 12、有石头 → 可以进化', M.canEvolve(p05, { hasStone: true }).ok);
check('已进化的不能再进化', !M.canEvolve(evo, { hasStone: true }).ok && M.evolve(evo) === false);

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
