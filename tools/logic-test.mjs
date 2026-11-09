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
import * as S from '../game/src/systems/save.js';
import * as T from '../game/src/systems/time.js';
import * as V from '../game/src/systems/survival.js';
import * as I from '../game/src/systems/inventory.js';
import { ITEMS } from '../game/src/data/items.js';
import * as G from '../game/src/systems/islandGen.js';
import * as TR from '../game/src/systems/travel.js';
import * as CR from '../game/src/systems/crafting.js';
import { RECIPES } from '../game/src/data/recipes.js';
import * as B from '../game/src/systems/battle.js';
import * as PT from '../game/src/systems/party.js';
import * as NI from '../game/src/systems/night.js';
import * as CP from '../game/src/systems/camp.js';
import * as EX from '../game/src/systems/explore.js';
import * as GD from '../game/src/systems/guide.js';
import * as FM from '../game/src/systems/farm.js';
import * as PC from '../game/src/systems/petcare.js';
import * as DY from '../game/src/systems/daily.js';
import * as GR from '../game/src/systems/growth.js';
import * as TW from '../game/src/systems/town.js';
import { QUESTS } from '../game/src/data/quests.js';
import { NPCS } from '../game/src/data/npcs.js';
import { CROPS, PRICES } from '../game/src/data/crops.js';

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
const bait = M.baitMultiplier('acorn', 'item_carrot');
eq('萝卜是橡果刺猬的喜好食物 ×1.5', bait, 1.5);
eq('其他食物 ×1.2', M.baitMultiplier('acorn', 'item_berry'), 1.2);
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

// ---------- save (T08; CLAUDE.md 存档约定, docs/06 第 5 节) ----------
{
  const mem = new S.MemoryStorage();
  let clock = 1000;
  const store = new S.SaveStore(mem, { now: () => clock });
  const fresh = store.load();
  check('没有存档时开新档', fresh.source === 'new' && !fresh.problem && S.validate(fresh.state).length === 0, S.validate(fresh.state).join());
  const st = fresh.state;
  eq('新档版本号', st.version, S.SAVE_VERSION);
  check('新档：6 只宠物，队伍 3 只（冰蓝小狼领头），背包 9 种物品（含食物、锄头、水壶、萝卜种子）', st.pets.length === 6 && st.party.length === 3 && st.party[0] === 'pet-pup' && st.inventory.length === 9);
  check('存档里不存属性值（永远现算）', !('stats' in st.pets[0]) && !('atk' in st.pets[0]));

  st.clover = 345; st.day = 3; st.player.x = 500; st.player.y = 420;
  M.gainExp(st.pets[0], 20);
  check('第一次存档成功', store.save(st));
  check('第一次存档时没有旧档，不产生备份', mem.getItem(S.KEYS.backup) === null);
  const back = store.load();
  check('读回来和存进去的一样', back.source === 'main' && JSON.stringify(back.state) === JSON.stringify(st));
  check('读回来的宠物属性一致', JSON.stringify(M.calcStats(back.state.pets[0])) === JSON.stringify(M.calcStats(st.pets[0])));

  clock = 2000; st.clover = 400;
  store.save(st);
  check('第二次存档后，备份是上一份（四叶草 345）', S.decode(mem.getItem(S.KEYS.backup)).state?.clover === 345);

  // damage the main save in several ways → falls back to the backup
  const good = mem.getItem(S.KEYS.main);
  const cases = {
    '截断': good.slice(0, good.length - 20),
    '篡改四叶草': good.replace('"clover":400', '"clover":99999'),
    '乱码': 'abc{{{',
    '空字符串': '',
  };
  for (const [name, bad] of Object.entries(cases)) {
    mem.setItem(S.KEYS.main, bad);
    const r = store.load();
    check(`主存档${name} → 读备份`, r.source === 'backup' && r.state.clover === 345 && !!r.problem, `${r.source} ${r.problem}`);
  }
  // checksum OK but the content is broken (e.g. a bug wrote nonsense)
  const broken = { ...st, clover: -5 };
  mem.setItem(S.KEYS.main, S.encode(broken));
  const rb = store.load();
  check('内容不合法（四叶草为负）→ 读备份', rb.source === 'backup' && rb.problem === 'invalid', `${rb.source} ${rb.problem}`);
  check('不合法的状态拒绝写入', store.save(broken) === false && store.lastError.startsWith('invalid'));

  mem.setItem(S.KEYS.main, 'x'); mem.setItem(S.KEYS.backup, 'y');
  const rn = store.load();
  check('主存档和备份都坏 → 开新档并提示', rn.source === 'new' && !!rn.problem);

  // a broken main must never overwrite the good backup
  mem.setItem(S.KEYS.main, good); store.save(st);              // backup = good (400)
  mem.setItem(S.KEYS.main, 'garbage');
  st.clover = 500; store.save(st);
  check('主存档坏时再存档，不会用坏档覆盖备份', S.decode(mem.getItem(S.KEYS.backup)).state?.clover === 400);

  // blocked during battle / fainting
  store.block('battle');
  st.clover = 600;
  check('对战中不存档', store.save(st) === false && store.lastError === 'blocked');
  store.unblock('battle');
  check('对战结束后恢复存档', store.save(st) && store.load().state.clover === 600);

  // storage full / private mode
  mem.failWrites = true;
  let threw = false; let ok;
  try { ok = store.save(st); } catch { threw = true; }
  check('存储写满时不报错、返回失败', !threw && ok === false && store.lastError === 'QuotaExceededError');
  mem.failWrites = false;

  // newer game version: kept aside, not used, not overwritten
  const futureRaw = S.encode({ ...st, version: S.SAVE_VERSION + 1 });
  mem.setItem(S.KEYS.main, futureRaw);
  const rf = store.load();
  check('更新版本的存档 → 另外保留，不读取', rf.problem === 'future' && mem.getItem(S.KEYS.future) === futureRaw);

  // migrations: a fake v0 → v1 step
  const v0 = { ...S.newGameState({ now: 1 }), version: 0, coins: 77 };
  delete v0.clover;
  const migrations = { 0: (d) => { const { coins, ...rest } = d; return { ...rest, clover: coins }; } };
  const rm = S.decode(S.encode(v0), { migrations, target: 1 });
  check('旧版本存档按迁移函数升级（coins → clover）', rm.ok && rm.state.version === 1 && rm.state.clover === 77, JSON.stringify(rm.reason ?? ''));
  const rmiss = S.decode(S.encode(v0), { migrations: {}, target: 1 });
  check('缺少迁移函数 → 读取失败而不是读出错数据', !rmiss.ok && rmiss.reason === 'migrate');

  store.wipe();
  check('重新开始会清掉主存档和备份', mem.getItem(S.KEYS.main) === null && mem.getItem(S.KEYS.backup) === null);
}

// ---------- time, day/night, settlement (T10; docs/06 第 0 节, docs/00 第 3 节) ----------
{
  near('1 游戏分钟 ≈ 0.67 现实秒', T.MS_PER_GAME_MIN / 1000, 0.667, 0.001);
  near('6:00–24:00 = 现实 12 分钟', (T.BEDTIME - T.DAY_START) * T.MS_PER_GAME_MIN / 60000, 12, 1e-9);
  near('一跳（10 游戏分钟）≈ 6.7 现实秒', T.TICK_MIN * T.MS_PER_GAME_MIN / 1000, 6.67, 0.01);
  const ph = (h, m = 0) => T.phaseAt(h * 60 + m);
  check('昼夜阶段边界：5:59 夜 / 6:00 昼 / 17:59 昼 / 18:00 黄昏 / 19:59 黄昏 / 20:00 夜 / 25:00 夜',
    ph(5, 59) === 'night' && ph(6) === 'day' && ph(17, 59) === 'day' && ph(18) === 'dusk' && ph(19, 59) === 'dusk' && ph(20) === 'night' && ph(25) === 'night');
  eq('时钟显示 25:30 → 01:30', T.formatClock(25 * 60 + 30), '01:30');
  eq('白天不调色', T.tintAt(12 * 60).dark, 0);
  check('黄昏开始变暗、夜里最暗', T.tintAt(19 * 60).dark > 0.2 && T.tintAt(23 * 60).dark > 0.5 && T.tintAt(23 * 60).dark === T.tintAt(25 * 60).dark,
    `19:00 ${T.tintAt(19 * 60).dark} 23:00 ${T.tintAt(23 * 60).dark}`);
  check('调色随时间连续变化（每分钟变化 ≤ 0.01）', Array.from({ length: 1440 }, (_, m) => Math.abs(T.tintAt(m + 1).dark - T.tintAt(m).dark)).every((d) => d <= 0.01));

  const home = () => ({ day: 1, clock: 6 * 60, player: { area: 'home', hp: 40, hpMax: 100, hunger: 50, hungerMax: 100 } });
  const ms = (min) => min * T.MS_PER_GAME_MIN;
  let s = home(), c = new T.GameClock();
  let ev = c.advance(s, ms(60));
  check('走 60 游戏分钟 → 时钟 7:00，6 跳', s.clock === 7 * 60 && ev.filter((e) => e.type === 'tick').length === 6, `${s.clock} ${ev.length}`);
  c.advance(s, ms(0.4)); c.advance(s, ms(0.4)); c.advance(s, ms(0.4));
  eq('不足 1 分钟的零头会累计（3 × 0.4 分钟 = 1 分钟）', s.clock, 7 * 60 + 1);
  c.pause('menu');
  c.advance(s, ms(120));
  eq('打开菜单时时间暂停', s.clock, 7 * 60 + 1);
  c.resume('menu');
  s.clock = 17 * 60 + 55;
  ev = c.advance(s, ms(10 * 60));
  const phases = ev.filter((e) => e.type === 'phase').map((e) => `${e.to}@${T.formatClock(e.clock)}`);
  check('家园：18:00 黄昏、20:00 夜晚，24:00 强制睡觉并停住', phases.join() === 'dusk@18:00,night@20:00' && ev.at(-1).type === 'bedtime' && s.clock === T.BEDTIME && c.paused,
    `${phases.join()} 最后 ${ev.at(-1).type} ${T.formatClock(s.clock)}`);
  c.advance(s, ms(60));
  eq('强制睡觉后时钟不再走', s.clock, T.BEDTIME);

  const ex = { ...home(), clock: 23 * 60, player: { ...home().player, area: 'expedition' } }, c2 = new T.GameClock();
  ev = c2.advance(ex, ms(2 * 60));
  check('远征：过了 24:00 不强制睡觉，继续到 1:00', ex.clock === 25 * 60 && !ev.some((e) => e.type === 'bedtime'));
  ev = c2.advance(ex, ms(10 * 60));
  check('远征：熬到 6:00 天亮 → 结束这一天', ev.some((e) => e.type === 'phase' && e.to === 'day') && ev.at(-1).type === 'dawn' && ex.clock === T.DAWN_LIMIT);

  // settlement
  s = home(); s.clock = T.BEDTIME;
  const r = T.runSettlement(s, { slept: true });
  check('结算顺序：休息 → 出货 → 作物 → 宠物打工 → 家园资源 → 天气', r.order.join() === 'rest,shipping,crops,petWork,resources,weather', r.order.join());
  check('睡觉后：第 2 天 6:00，生命回满，饱食 −20', s.day === 2 && s.clock === 360 && s.player.hp === 100 && s.player.hunger === 30, JSON.stringify(s));
  const hungry = home(); hungry.player.hunger = 12; T.runSettlement(hungry, { slept: true });
  eq('饱食不会降到 0 以下', hungry.player.hunger, 0);
  const noSleep = home(); T.runSettlement(noSleep, { slept: false });
  check('没睡觉天亮：进入新的一天但生命不恢复', noSleep.day === 2 && noSleep.player.hp === 40);

  // three consecutive days through the clock + settlement, like the game loop does
  const g = home(), gc = new T.GameClock(), log = [];
  for (let d = 0; d < 3; d++) {
    let guard = 0;
    while (!gc.paused && guard++ < 2000) {
      for (const e of gc.advance(g, ms(30))) if (e.type !== 'tick') log.push(`${g.day}:${e.type === 'phase' ? e.to : e.type}`);
    }
    const rr = T.runSettlement(g, { slept: true }); log.push(`→${rr.day}`);
    gc.restart();
  }
  eq('连续推进 3 天，事件顺序正确', log.join(' '),
    '1:dusk 1:night 1:bedtime →2 2:dusk 2:night 2:bedtime →3 3:dusk 3:night 3:bedtime →4');
  check('3 天后存档仍合法', S.validate({ ...S.newGameState(), day: g.day, clock: g.clock }).length === 0);
  check('远征凌晨的时钟（25:30）存档合法', S.validate({ ...S.newGameState(), clock: 25 * 60 + 30 }).length === 0);
}

// ---------- survival: health & fullness (T20; docs/06 第 1 节) ----------
{
  check('每种物品都有图标和描述；食物的饱食值为正', Object.values(ITEMS).every((it) => it.icon && it.desc && it.name && (it.food == null || it.food > 0)));
  const run = (area, fromClock, toClock, player) => {
    const s = { day: 1, clock: fromClock, player: { area, hp: 100, hpMax: 100, hunger: 100, hungerMax: 100, ...player } };
    const c = new T.GameClock(), ev = [];
    let firstEmpty = null, faintAt = null;
    while (s.clock < toClock && !c.paused) {
      for (const e of c.advance(s, T.MS_PER_GAME_MIN)) {
        if (e.type !== 'tick') continue;
        for (const x of V.survivalTick(s.player, area)) {
          ev.push(x);
          if (x === 'empty' && firstEmpty === null) firstEmpty = s.clock;
          if (x === 'faint' && faintAt === null) faintAt = s.clock;
        }
      }
    }
    return { s, ev, firstEmpty, faintAt };
  };
  const e03 = run('home', 6 * 60, 18 * 60);
  eq('E03 6:00 饱食 100 不吃东西 → 18:00 饱食 28', e03.s.player.hunger, 28);
  check('饱食降到 20 时提醒一次', run('home', 6 * 60, 24 * 60).ev.filter((x) => x === 'hungry').length === 1);
  const ex = run('expedition', 6 * 60, 30 * 60);
  eq('饱食在 22:40 归零（远征）', T.formatClock(ex.firstEmpty), '22:40');
  eq('一直不吃，次日 4:20 倒下（远征）', T.formatClock(ex.faintAt ?? 0), '04:20');
  check('倒下时生命为 0', ex.s.player.hp === 0);
  const e11 = run('home', 6 * 60, 24 * 60, { hunger: 0, hp: 20 });
  check('E11 家园饱食归零很久：生命停在 1，不会倒下，有提示', e11.s.player.hp === 1 && !e11.ev.includes('faint') && e11.ev.filter((x) => x === 'floor').length === 1,
    `hp ${e11.s.player.hp} ${[...new Set(e11.ev)].join(',')}`);
  const fainted = { hp: 0, hpMax: 100, hunger: 0, hungerMax: 100 };
  check('已经倒下后再受伤不重复触发', V.applyDamage(fainted, 15, 'expedition').length === 0 && fainted.hp === 0);
  const hit = { hp: 100, hpMax: 100, hunger: 50, hungerMax: 100 };
  let n = 0; while (!V.applyDamage(hit, 15, 'expedition').includes('faint')) n++;
  eq('E07 规则：生命 100 被打 15 点，第 7 次倒下', n + 1, 7);

  // eating
  const st = S.newGameState();
  st.player.hunger = 50; st.player.hp = 90;
  const berries = I.countOf(st.inventory, 'item_berry');
  const r1 = V.eat(st, 'item_berry');
  check('吃浆果：饱食 +10，浆果 −1', r1.ok && st.player.hunger === 60 && I.countOf(st.inventory, 'item_berry') === berries - 1);
  const r2 = V.eat(st, 'item_fish_roast');
  check('吃烤鱼：饱食 +30、生命 +10，吃完格子消失', r2.ok && st.player.hunger === 90 && st.player.hp === 100 && I.countOf(st.inventory, 'item_fish_roast') === 0
    && !st.inventory.some((x) => x.id === 'item_fish_roast'));
  const r3 = V.eat(st, 'item_carrot');
  check('饱食不会超过上限', r3.ok && st.player.hunger === 100 && r3.hunger === 10);
  const before = JSON.stringify(st.inventory);
  const r4 = V.eat(st, 'item_berry');
  check('吃饱了再吃 → 拒绝，不消耗', !r4.ok && r4.reason === 'full' && JSON.stringify(st.inventory) === before);
  check('没有的食物不能吃', V.eat(st, 'item_fish_roast').reason === 'none');
  check('捕宠网不能吃', V.eat(st, 'item_net_grass').reason === 'not-food');

  // inventory helpers
  const inv = [{ id: 'item_berry', count: 2 }];
  check('物品不够时扣除失败且不改动', !I.removeItem(inv, 'item_berry', 3) && inv[0].count === 2);
  I.addItem(inv, 'item_berry', 3);
  check('同种物品叠加在一格', inv.length === 1 && inv[0].count === 5);
  const full = Array.from({ length: I.BAG_SLOTS }, (_, i) => ({ id: `x${i}`, count: 1 }));
  check('背包 20 格满了放不下新物品', !I.addItem(full, 'item_berry', 1) && full.length === I.BAG_SLOTS);
}

// ---------- expedition island generation (T05; docs/06 第 5 节) ----------
{
  const a = G.generateIsland(20261108), b = G.generateIsland(20261108);
  check('E01 同一种子生成两次，两座岛完全一样', JSON.stringify(a) === JSON.stringify(b));
  check('不同种子生成不同的岛', JSON.stringify(G.generateIsland(1)) !== JSON.stringify(G.generateIsland(2)));
  let bad = [], fallback = 0, minArea = 1e9;
  const counts = { tree: 0, rock: 0, bush: 0, grass: 0, crystal: 0 };
  for (let i = 1; i <= 100; i++) {
    const isl = G.generateIsland(i * 7919);
    const why = G.validate(isl);
    if (why) bad.push(`${i}:${why}`);
    if (isl.fallback) fallback++;
    minArea = Math.min(minArea, isl.area);
    if (isl.pets.length < 4 || isl.pets.length > 6 || isl.chests.filter((c) => !c.bonus).length < 1 || isl.chests.filter((c) => !c.bonus).length > 2 || isl.camps.length < 1 || isl.camps.length > 2) bad.push(`${i}:数量`);
    for (const r of isl.resources) counts[r.type]++;
  }
  check('E02 连续 100 个种子：资源、宝箱、宠物、营地都能从着陆点走到；数量在规定范围', bad.length === 0, bad.slice(0, 3).join(' '));
  check('100 座岛可行走面积都 ≥ 600 格', minArea >= G.MIN_AREA, `最小 ${minArea}`);
  check('100 座岛都不需要兜底岛', fallback === 0, `兜底 ${fallback}`);
  check('五种资源都会出现', Object.values(counts).every((n) => n > 0), JSON.stringify(counts));
  const isl = G.generateIsland(20261108);
  check('着陆点在岛上、飞艇在岛外', isl.walk[isl.landing.ty][isl.landing.tx] && !isl.walk[isl.airship.ty][isl.airship.tx]);
  const blocked = G.blockedGrid(isl);
  check('着陆点周围没有挡路的东西', [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => !blocked[isl.landing.ty + dy][isl.landing.tx + dx])));
  const far = Math.min(...isl.chests.map((c) => Math.abs(c.tx - isl.landing.tx) + Math.abs(c.ty - isl.landing.ty)));
  check('宝箱离着陆点远（直线格数 ≥ 12）', far >= 12, `最近 ${far}`);

  // E05: collected spots stay empty when coming back to the same island
  const taken = isl.resources.slice(0, 3).map((r) => r.id);
  const st = S.newGameState();
  st.expedition = { seed: 20261108, biome: 'mistwood', changes: { collected: taken, chests: [isl.chests[0].id], pets: [isl.pets[0].id] } };
  st.player.area = 'expedition';
  const mem = new S.MemoryStorage(), store = new S.SaveStore(mem);
  store.save(st);
  const back = store.load().state;
  const again = G.applyChanges(G.generateIsland(back.expedition.seed), back.expedition.changes);
  check('E05 采集过的资源回来时仍然是空的（存档 → 读档 → 重新生成）', taken.every((id) => !again.resources.some((r) => r.id === id)) && again.resources.length === isl.resources.length - 3);
  check('打开过的宝箱、捕捉过的宠物不再出现', again.chests.length === isl.chests.length - 1 && again.pets.length === isl.pets.length - 1);
  check('没动过的资源位置不变', JSON.stringify(again.resources) === JSON.stringify(isl.resources.slice(3)));
  check('采集后格子不再挡路', !G.blockedGrid(again)[isl.resources[0].ty][isl.resources[0].tx] || isl.resources[0].type === 'grass');
  check('存档：在远征岛上但没有岛屿记录 → 不合法', S.validate({ ...S.newGameState(), player: { ...S.newGameState().player, area: 'expedition' } }).includes('player.area'));
}

// ---------- airship travel (T25; docs/06 第 5 节) ----------
{
  const st = S.newGameState();
  st.clock = 9 * 60; st.player.hunger = 80;
  check('没去过别的岛时不能选「回到上次的岛」', TR.depart(st, 'last').reason === 'no-last' && st.player.area === 'home');
  const seedA = TR.newIslandSeed(st);
  const r = TR.depart(st, 'new');
  check('出发去新岛：耗时 1 小时、路上饱食 −6、到远征岛着陆点', r.ok && st.clock === 10 * 60 && st.player.hunger === 74 && st.player.area === 'expedition' && st.player.x === null && st.expedition.seed === seedA,
    `${T.formatClock(st.clock)} 饱食 ${st.player.hunger}`);
  check('出发后存档合法', S.validate(st).length === 0, S.validate(st).join());
  check('在远征岛上不能再出发', TR.depart(st, 'new').reason === 'not-home');
  st.expedition.changes.collected.push('r0', 'r1');
  const h = TR.returnHome(st);
  check('坐飞艇回家：耗时 1 小时、回到家园码头', h.ok && st.clock === 11 * 60 && st.player.area === 'home' && st.flags.arriveAt === 'dock');
  const seedLast = st.expedition.seed;
  TR.depart(st, 'last');
  check('回到上次的岛：种子不变、采集记录还在', st.expedition.seed === seedLast && st.expedition.changes.collected.join() === 'r0,r1');
  TR.returnHome(st);
  TR.depart(st, 'new');
  check('再选新岛：换了新种子、变化记录清空', st.expedition.seed !== seedLast && st.expedition.changes.collected.length === 0);
  check('新岛种子由存档决定（同样的存档得到同样的种子）', TR.newIslandSeed({ seed: 5, day: 3, flags: { trips: 2 } }) === TR.newIslandSeed({ seed: 5, day: 3, flags: { trips: 2 } }));
  const s2 = { clock: 6 * 60 + 5, player: { hp: 100, hpMax: 100, hunger: 100, hungerMax: 100 } };
  eq('6:05 起飞 1 小时 → 经过 6 跳（6:10…7:00）', TR.passTime(s2, 60), 6);
  const s3 = { clock: 6 * 60, player: { hp: 2, hpMax: 100, hunger: 0, hungerMax: 100 } };
  TR.passTime(s3, 60);
  check('飞艇上是安全的：饿着也不会倒下（生命最低 1）', s3.player.hp === 1);
  // interim faint
  const f = S.newGameState();
  f.expedition = { seed: 1, biome: 'mistwood', changes: G.emptyChanges() };
  f.player.area = 'expedition'; f.player.hp = 0; f.player.hunger = 0; f.day = 4; f.clock = 26 * 60;
  TR.faint(f, { x: 100, y: 100 });
  check('远征中倒下（临时规则）：第二天 8:00 在家醒来，生命 50、饱食 50', f.day === 5 && f.clock === 8 * 60 && f.player.hp === 50 && f.player.hunger === 50 && f.player.area === 'home' && f.flags.arriveAt === 'bed');
  check('倒下后存档合法', S.validate(f).length === 0);
}

// ---------- gathering & crafting (T19; docs/06 第 3 节) ----------
{
  check('配方的材料和产出都是已定义的物品', RECIPES.every((r) => ITEMS[r.out] && Object.keys(r.cost).every((id) => ITEMS[id])));
  check('配方数值与文档一致（石斧 木3石2、石镐 木3石3、火把 木2草2、营火 木4石4、草编网 草3木2、藤编网 布1草3雾晶1）',
    JSON.stringify(RECIPES.map((r) => [r.id, r.cost])) === JSON.stringify([['axe', { item_wood: 3, item_stone: 2 }], ['pickaxe', { item_wood: 3, item_stone: 3 }], ['torch', { item_wood: 2, item_grass: 2 }],
      ['campfire', { item_wood: 4, item_stone: 4 }], ['net_grass', { item_grass: 3, item_wood: 2 }], ['net_vine', { item_cloth: 1, item_grass: 3, item_crystal: 1 }], ['tent', { item_cloth: 4, item_wood: 6 }], ['soup', { item_carrot: 2, item_pumpkin: 1 }], ['bigbag', { item_cloth: 6, item_crystal: 2 }]]));
  check('只有斧、镐、锄头、水壶、帐篷、大背包算工具（倒下时保留），网是消耗品', Object.entries(ITEMS).filter(([, v]) => v.tool).map(([k]) => k).sort().join() === 'item_axe,item_bigbag,item_can,item_hoe,item_pickaxe,item_tent');

  const mk = (inv) => { const s = S.newGameState(); s.inventory = inv; s.expedition = { seed: 1, biome: 'mistwood', changes: G.emptyChanges() }; s.player.area = 'expedition'; return s; };
  let s = mk([]);
  let r = CR.gather(s, { id: 'r1', type: 'tree' });
  check('徒手砍树得 1 木材，记入采集记录', r.ok && I.countOf(s.inventory, 'item_wood') === 1 && s.expedition.changes.collected.includes('r1'));
  check('同一个资源不能采两次', CR.gather(s, { id: 'r1', type: 'tree' }).reason === 'gone' && I.countOf(s.inventory, 'item_wood') === 1);
  I.addItem(s.inventory, 'item_axe', 1);
  CR.gather(s, { id: 'r2', type: 'tree' });
  eq('有石斧砍树得 3 木材', I.countOf(s.inventory, 'item_wood'), 4);
  r = CR.gather(s, { id: 'r3', type: 'crystal' });
  check('没有石镐敲不了雾晶，也不记入采集', !r.ok && r.reason === 'need-tool' && r.tool === 'item_pickaxe' && !s.expedition.changes.collected.includes('r3'));
  CR.gather(s, { id: 'r4', type: 'bush' }); CR.gather(s, { id: 'r5', type: 'grass' });
  check('浆果丛得 2 浆果、草丛得 2 草', I.countOf(s.inventory, 'item_berry') === 2 && I.countOf(s.inventory, 'item_grass') === 2);

  // bag full
  const full = mk([{ id: 'item_wood', count: 1 }, ...Array.from({ length: 19 }, (_, i) => ({ id: `f${i}`, count: 1 }))]);
  full.party = []; // no 冰蓝小狼 → 20 slots
  const before = JSON.stringify(full.inventory);
  r = CR.gather(full, { id: 'r9', type: 'rock' });
  check('背包 20 格满了：采不到新物品，资源留在原地', !r.ok && r.reason === 'full' && JSON.stringify(full.inventory) === before && !full.expedition.changes.collected.includes('r9'));
  check('背包满了但已有同种物品 → 可以继续叠加', CR.gather(full, { id: 'r10', type: 'tree' }).ok && I.countOf(full.inventory, 'item_wood') === 2);
  const pupState = S.newGameState();
  eq('冰蓝小狼在队伍里：背包 24 格', CR.bagSlots(pupState), 24);
  pupState.party = ['pet-fox'];
  eq('冰蓝小狼不在队伍里：背包 20 格', CR.bagSlots(pupState), 20);

  // E04: exactly enough for a campfire, press twice
  const e04 = mk([{ id: 'item_wood', count: 4 }, { id: 'item_stone', count: 4 }]);
  const first = CR.craft(e04, 'campfire'), second = CR.craft(e04, 'campfire');
  check('E04 材料刚好够营火，连点两次：只做出 1 个，材料只扣 1 次', first.ok && !second.ok && second.reason === 'missing' && I.countOf(e04.inventory, 'item_campfire') === 1
    && I.countOf(e04.inventory, 'item_wood') === 0 && I.countOf(e04.inventory, 'item_stone') === 0, JSON.stringify(e04.inventory));
  check('材料用完的格子会消失', e04.inventory.length === 1);
  const miss = CR.canCraft(mk([{ id: 'item_wood', count: 1 }]), 'axe');
  check('材料不够时列出缺什么（木材差 2、石头差 2）', !miss.ok && miss.missing.map((m) => `${m.id}:${m.need - m.have}`).join() === 'item_wood:2,item_stone:2');
  // crafting with a full bag: allowed if a material stack empties, refused otherwise (nothing consumed)
  const fb = mk([{ id: 'item_wood', count: 10 }, { id: 'item_stone', count: 10 }, ...Array.from({ length: 18 }, (_, i) => ({ id: `f${i}`, count: 1 }))]);
  fb.party = [];
  const fbBefore = JSON.stringify(fb.inventory);
  const rf = CR.craft(fb, 'axe');
  check('背包满且没有空出格子 → 不能制作，材料不扣', !rf.ok && rf.reason === 'full' && JSON.stringify(fb.inventory) === fbBefore);
  const fe = mk([{ id: 'item_wood', count: 3 }, { id: 'item_stone', count: 5 }, ...Array.from({ length: 18 }, (_, i) => ({ id: `f${i}`, count: 1 }))]);
  fe.party = [];
  check('背包满但材料用完空出一格 → 可以制作', CR.craft(fe, 'axe').ok && I.countOf(fe.inventory, 'item_axe') === 1);
}

// ---------- turn-based battle (T06; docs/02 第 4–5 节) ----------
{
  const half = () => 0.5;   // damageRoll(0.5) = 1.0 → matches the docs' worked examples
  const pet = (id, o = {}) => M.createPet(id, { stars: 3, nature: 'gentle', shiny: false, uid: `${id}-${o.tag ?? 'x'}`, ...o });
  // A01 through a real battle turn
  let b = B.createBattle({ party: [pet('fox', { tag: 'me' })], enemies: [pet('acorn', { tag: 'w' })], inventory: [], rng: half });
  let r = B.resolveTurn(b, { type: 'skill', skill: 'ember' });
  const dmg = r.events.find((e) => e.t === 'damage' && e.side === 'foe');
  check('A01 对战中焰尾狐用小火苗打橡果刺猬：伤害 30、提示效果拔群', dmg?.amount === 30 && dmg.eff === 'super', JSON.stringify(dmg));
  check('速度快的先出手（焰尾狐 12 > 橡果刺猬 9）', r.events.findIndex((e) => e.t === 'use' && e.side === 'me') < r.events.findIndex((e) => e.t === 'use' && e.side === 'foe'));
  const slow = B.createBattle({ party: [pet('starbear', { tag: 'me' })], enemies: [pet('shadecat', { tag: 'w' })], inventory: [], rng: half });
  const rs = B.resolveTurn(slow, { type: 'skill', skill: 'tackle' });
  check('对方更快时对方先出手（月影狐猫 14 > 星星熊仔 5）', rs.events[0].t === 'use' && rs.events[0].side === 'foe');
  r = B.resolveTurn(b, { type: 'skill', skill: 'ember' });
  check('两发小火苗打倒橡果刺猬 → 胜利，得 8 经验、3 四叶草', b.over === 'win' && b.exp['fox-me'] === 8 && b.clover === 3, `${b.over} ${JSON.stringify(b.exp)} ${b.clover}`);
  check('结束后不能再出招', B.resolveTurn(b, { type: 'skill', skill: 'ember' }).ok === false);

  // commit only at the end
  const st = S.newGameState();
  st.expedition = { seed: 9, biome: 'mistwood', changes: G.emptyChanges() }; st.player.area = 'expedition';
  const party = st.party.map((uid) => st.pets.find((x) => x.uid === uid));
  const enemy = pet('acorn', { tag: 'e', level: 2 });
  b = B.createBattle({ party, enemies: [enemy], inventory: st.inventory, rng: half });
  const snapshot = JSON.stringify(st);
  B.resolveTurn(b, { type: 'snack', item: 'item_carrot' });
  check('对战过程中不改动真实存档（只改副本）', JSON.stringify(st) === snapshot);
  check('喂喜好食物（萝卜）给橡果刺猬：诱饵 ×1.5 记下，零食算一次行动', b.bait['acorn-e'] === 1.5 && b.turn === 1);
  B.resolveTurn(b, { type: 'snack', item: 'item_berry' });
  check('诱饵取最高，不会被普通食物覆盖', b.bait['acorn-e'] === 1.5);
  check('没有的零食不能喂', B.resolveTurn(b, { type: 'snack', item: 'item_soup' }).ok === false);
  let guard = 0;
  while (!b.over && guard++ < 50) {
    if (b.needSwitch) B.resolveTurn(b, { type: 'switch', index: b.sides.me.mons.findIndex((m) => m.hp > 0) });
    else B.resolveTurn(b, { type: 'skill', skill: 'tackle' });
  }
  const carrots0 = I.countOf(st.inventory, 'item_carrot'), clover0 = st.clover;
  const sum = B.finishBattle(st, b, { wildId: 'w3' });
  check('结束时一次提交：用掉的零食从背包扣掉、四叶草增加', I.countOf(st.inventory, 'item_carrot') === carrots0 - 1 && st.clover === clover0 + b.clover && sum.result === b.over);
  check('打赢后野生宠物记入岛屿记录，不会再出现', b.over !== 'win' || st.expedition.changes.pets.includes('w3'));
  check('受伤的宠物体力带出对战（下次对战接着用）', st.pets.some((x) => x.hp != null) || b.sides.me.mons.every((m) => m.hp === m.maxHp));

  // A02: losing
  const weak = [pet('starbear', { tag: 'a', level: 1 }), pet('pup', { tag: 'b', level: 1 })];
  const st2 = S.newGameState(); const inv0 = JSON.stringify(st2.inventory), pl0 = JSON.stringify(st2.player);
  st2.pets.push(...weak);
  b = B.createBattle({ party: weak, enemies: [pet('shadecat', { tag: 'boss', level: 12 })], inventory: st2.inventory, rng: half });
  guard = 0;
  while (!b.over && guard++ < 60) {
    if (b.needSwitch) { const rr = B.resolveTurn(b, { type: 'switch', index: b.sides.me.mons.findIndex((m) => m.hp > 0) }); check('倒下后换上下一只是免费的（对方不行动）', rr.events.length === 1 && rr.events[0].t === 'send'); }
    else B.resolveTurn(b, { type: 'skill', skill: 'tackle' });
  }
  B.finishBattle(st2, b, { wildId: 'w0' });
  check('A02 我方全部倒下 → 失败；背包、玩家生命和饱食都不变', b.over === 'lose' && JSON.stringify(st2.inventory) === inv0 && JSON.stringify(st2.player) === pl0);
  check('A06 队伍全部体力为 0 → 不能进入对战', !B.canStartBattle(weak) && B.canStartBattle(st2.pets.slice(0, 1)));
  check('倒下的宠物不能被换上场', (() => { const bb = B.createBattle({ party: [pet('fox', { tag: 'q' }), { ...pet('pup', { tag: 'z' }), hp: 0 }], enemies: [pet('acorn', { tag: 'y' })], inventory: [], rng: half }); return B.resolveTurn(bb, { type: 'switch', index: 1 }).ok === false; })());

  // A05: flee
  const st3 = S.newGameState(); st3.expedition = { seed: 9, biome: 'mistwood', changes: G.emptyChanges() };
  b = B.createBattle({ party: [st3.pets[0]], enemies: [pet('acorn', { tag: 'f' })], inventory: [], rng: half });
  const rf = B.resolveTurn(b, { type: 'flee' });
  B.finishBattle(st3, b, { wildId: 'w1' });
  check('A05 溜走：总能成功，对方不出手，野生宠物保留', rf.events.every((e) => e.t !== 'use') && b.over === 'flee' && !st3.expedition.changes.pets.includes('w1'));

  // skill uses, buffs, AI, bond
  b = B.createBattle({ party: [pet('fox', { tag: 'u' })], enemies: [pet('starbear', { tag: 'v', level: 20 })], inventory: [], rng: half });
  for (let i = 0; i < 3; i++) B.resolveTurn(b, { type: 'skill', skill: 'blaze' });
  check('火焰尾每场 3 次，用完不能再用', B.resolveTurn(b, { type: 'skill', skill: 'blaze' }).reason === 'no-uses' || b.over);
  const bb = B.createBattle({ party: [pet('acorn', { tag: 's', level: 5 })], enemies: [pet('fox', { tag: 't' })], inventory: [], rng: half });
  B.resolveTurn(bb, { type: 'skill', skill: 'shell' });
  const me = B.active(bb, 'me');
  check('刺球：防御 ×1.5，持续 3 回合（回合结束时倒数）', me.buffs.length === 1 && me.buffs[0].mult === 1.5 && me.buffs[0].turns === 2);
  B.resolveTurn(bb, { type: 'skill', skill: 'shell' });
  check('同一种加成重复使用是刷新而不是叠加', B.active(bb, 'me').buffs.length === 1 && B.active(bb, 'me').buffs[0].turns === 2);
  const ai = B.createBattle({ party: [pet('fox', { tag: 'ai' })], enemies: [pet('shark', { tag: 'ai2', level: 5 })], inventory: [], rng: () => 0.9 });
  check('敌方优先用克制技能（航海鲨对焰尾狐用大浪）', B.chooseEnemySkill(ai) === 'splash', B.chooseEnemySkill(ai));
  const bondPet = pet('pup', { tag: 'bond' }); bondPet.affection = 100;
  const bd = B.createBattle({ party: [bondPet], enemies: [pet('fox', { tag: 'big', level: 30 })], inventory: [], rng: half });
  const r1 = B.resolveTurn(bd, { type: 'skill', skill: 'tackle' });
  check('P09 好感 100：第一次致命伤害保留 1 体力', B.active(bd, 'me').hp === 1 && r1.events.some((e) => e.t === 'bond'), `hp ${B.active(bd, 'me').hp}`);
  B.resolveTurn(bd, { type: 'skill', skill: 'tackle' });
  check('P09 同一场第二次致命伤害正常倒下', bd.over === 'lose');
  check('野生宠物组：第 1–4 天 1 只、第 5–9 天 2 只、第 10 天起 3 只', [1, 4, 5, 9, 10, 20].map(B.wildGroupSize).join() === '1,1,2,2,3,3');
  const g1 = B.makeWildGroup({ species: 'acorn', level: 3, islandSeed: 77, wildIndex: 2, day: 12, pool: PETS.map((x) => x.id) });
  const g2 = B.makeWildGroup({ species: 'acorn', level: 3, islandSeed: 77, wildIndex: 2, day: 12, pool: PETS.map((x) => x.id) });
  check('野生宠物组由种子决定，领头的是碰到的那只', g1.length === 3 && g1[0].species === 'acorn' && g1[0].level === 3 && JSON.stringify(g1) === JSON.stringify(g2));
  const sl = S.newGameState(); sl.pets[0].hp = 3; T.runSettlement(sl, { slept: true });
  check('睡一觉后宠物体力回满', sl.pets.every((x) => x.hp == null));
}

// ---------- catching & party (T07; docs/02 第 6 节) ----------
{
  const pet = (id, o = {}) => M.createPet(id, { stars: 3, nature: 'gentle', shiny: false, uid: `${id}-${o.tag ?? 'x'}`, ...o });
  const setup = () => {
    const st = S.newGameState();
    st.expedition = { seed: 5, biome: 'mistwood', changes: G.emptyChanges() }; st.player.area = 'expedition';
    const party = st.party.map((u) => st.pets.find((x) => x.uid === u));
    const b = B.createBattle({ party, enemies: [pet('acorn', { tag: 'wild' })], inventory: st.inventory, rng: () => 0.5 });
    B.active(b, 'foe').hp = 16;                       // docs/02 第 6 节 example: 16 HP left
    B.resolveTurn(b, { type: 'snack', item: 'item_carrot' });
    B.active(b, 'foe').hp = 16;                       // (the snack turn doesn't touch it, but keep the example exact)
    return { st, b };
  };
  // A04
  let { st, b } = setup();
  near('捕捉面板显示的成功率：剩 16 体力 + 萝卜 + 草编网 = 56.7%', B.catchChance(b, 'item_net_grass'), 0.5674);
  const nets0 = I.countOf(st.inventory, 'item_net_grass'), carrots0 = I.countOf(st.inventory, 'item_carrot'), pets0 = st.pets.length;
  b.rng = () => 0.50;
  let r = B.resolveTurn(b, { type: 'catch', item: 'item_net_grass' });
  check('A04 随机数 0.50 < 56.7% → 捕捉成功，对战立即结束', r.ok && b.over === 'caught' && r.events.some((e) => e.t === 'caught') && !r.events.some((e) => e.t === 'use' && e.side === 'foe'));
  let sum = B.finishBattle(st, b, { wildId: 'w2' });
  const got = st.pets.at(-1);
  check('A04 捕捉后：好感 20、网 −1、萝卜 −1，宠物进入家园（队伍满 3 只）', got.affection === 20 && I.countOf(st.inventory, 'item_net_grass') === nets0 - 1
    && I.countOf(st.inventory, 'item_carrot') === carrots0 - 1 && st.pets.length === pets0 + 1 && !st.party.includes(got.uid) && sum.caught.joined === false,
    JSON.stringify({ aff: got.affection, party: st.party.length }));
  check('捕捉到的宠物保留种类、等级、资质、性格，体力带出（16）', got.species === 'acorn' && got.level === 1 && got.stars === 3 && got.nature === 'gentle' && got.hp === 16);
  check('捕捉到的宠物有新的唯一编号，存档合法', got.uid !== 'acorn-wild' && new Set(st.pets.map((x) => x.uid)).size === st.pets.length && S.validate(st).length === 0, S.validate(st).join());
  check('被捕捉的野生宠物记入岛屿记录', st.expedition.changes.pets.includes('w2'));
  check('捕捉成功出战宠物也得经验（按对方等级 8）', sum.exp.some((x) => x.amount === 8));
  // A08
  ({ st, b } = setup());
  const n1 = I.countOf(b.inventory, 'item_net_grass');
  b.rng = () => 0.60;
  r = B.resolveTurn(b, { type: 'catch', item: 'item_net_grass' });
  check('A08 随机数 0.60 → 失败：网 −1，对方照常行动', r.ok && !b.over && I.countOf(b.inventory, 'item_net_grass') === n1 - 1 && r.events.some((e) => e.t === 'escape') && r.events.some((e) => e.t === 'use' && e.side === 'foe'));
  // A09
  ({ st, b } = setup());
  B.active(b, 'foe').hp = 0;
  check('A09 对方体力 0 → 不能捕捉', B.resolveTurn(b, { type: 'catch', item: 'item_net_grass' }).reason === 'fainted');
  ({ st, b } = setup());
  b.inventory = b.inventory.filter((x) => !ITEMS[x.id].netMult);
  check('没有网不能捕捉', B.resolveTurn(b, { type: 'catch', item: 'item_net_grass' }).reason === 'no-net');
  // join the party when there is room
  ({ st, b } = setup());
  st.party = ['pet-pup'];
  b.rng = () => 0.01;
  B.resolveTurn(b, { type: 'catch', item: 'item_net_vine' });
  sum = B.finishBattle(st, b, { wildId: 'w3' });
  check('队伍不满 3 只 → 抓到的宠物直接进队伍', sum.caught.joined && st.party.length === 2 && st.party[1] === sum.caught.uid);

  // party panel rules
  const ps = S.newGameState();
  check('队伍满 3 只时不能再加入', PT.joinParty(ps, 'pet-shark').reason === 'full');
  check('离开队伍后可以加入别的伙伴', PT.leaveParty(ps, 'pet-acorn').ok && PT.joinParty(ps, 'pet-shark').ok && ps.party.join() === 'pet-pup,pet-fox,pet-shark');
  check('设为领头：排到第一', PT.setLead(ps, 'pet-shark').ok && ps.party[0] === 'pet-shark' && ps.party.length === 3);
  PT.leaveParty(ps, 'pet-fox'); PT.leaveParty(ps, 'pet-pup');
  check('队伍里至少留 1 只', PT.leaveParty(ps, 'pet-shark').reason === 'last' && ps.party.length === 1);
  ps.expedition = { seed: 1, biome: 'mistwood', changes: G.emptyChanges() }; ps.player.area = 'expedition';
  check('远征中不能从家里叫伙伴、也不能让伙伴回家', PT.joinParty(ps, 'pet-fox').reason === 'away');
  check('远征中可以调整领头', (PT.joinParty({ ...ps, player: { ...ps.player, area: 'home' } }, 'pet-fox'), true) && PT.setLead(ps, ps.party[0]).ok);
}

// ---------- fainting & lost bag (T23; docs/06 第 2 节) ----------
{
  const mk = () => {
    const s = S.newGameState();
    s.expedition = { seed: 3, biome: 'mistwood', changes: G.emptyChanges(), lostBag: null }; s.player.area = 'expedition';
    s.inventory = [{ id: 'item_axe', count: 1 }, { id: 'item_wood', count: 12 }, { id: 'item_berry', count: 5 }, { id: 'item_crystal', count: 1 }];
    s.day = 5; s.clock = 23 * 60;   // after the new-player protection (days 1–3)
    return s;
  };
  let s = mk();
  const r = TR.faint(s, { x: 640, y: 512 });
  check('E08 倒下：保留石斧；失物包 = 木材 ×12、浆果 ×5、雾晶 ×1（在倒下的位置）', s.inventory.map((x) => x.id).join() === 'item_axe'
    && JSON.stringify(s.expedition.lostBag) === JSON.stringify({ x: 640, y: 512, items: [{ id: 'item_wood', count: 12 }, { id: 'item_berry', count: 5 }, { id: 'item_crystal', count: 1 }] }));
  check('倒下后：第二天 8:00 在家醒来，生命 50、饱食 50，宠物恢复', s.day === 6 && s.clock === 480 && s.player.hp === 50 && s.player.hunger === 50 && s.player.area === 'home' && s.pets.every((p) => p.hp == null));
  check('倒下后的存档合法', S.validate(s).length === 0, S.validate(s).join());
  const mem = new S.MemoryStorage(), store = new S.SaveStore(mem);
  store.save(s);
  const back = store.load().state;
  check('E10 倒下结果一次写进存档：读回来只有一个失物包，物品不多不少', back.expedition.lostBag.items.reduce((n, x) => n + x.count, 0) === 18 && back.inventory.length === 1);
  TR.depart(s, 'last');
  const p = TR.pickUpLostBag(s);
  check('E08 回到原岛捡失物包：木材 ×12、浆果 ×5、雾晶 ×1 全部回到背包，失物包消失', p.left.length === 0 && I.countOf(s.inventory, 'item_wood') === 12 && I.countOf(s.inventory, 'item_berry') === 5 && I.countOf(s.inventory, 'item_crystal') === 1 && s.expedition.lostBag === null);
  check('已经捡过的失物包不会再给东西', TR.pickUpLostBag(s).took.length === 0 && I.countOf(s.inventory, 'item_wood') === 12);
  // second faint replaces the old bag
  s = mk(); TR.faint(s, { x: 1, y: 1 });
  TR.depart(s, 'last');
  s.inventory.push({ id: 'item_stone', count: 7 });
  const r2 = TR.faint(s, { x: 2, y: 2 });
  check('还没捡回又倒下：新失物包替换旧的（旧的丢失）', r2.replaced && s.expedition.lostBag.items.map((x) => x.id).join() === 'item_stone' && s.expedition.lostBag.x === 2);
  // E09
  TR.depart(s, 'new');
  check('E09 去新的浮岛：旧岛和失物包一起消失', s.expedition.lostBag === null && s.expedition.changes.collected.length === 0);
  // only tools → nothing dropped, an older bag stays
  s = mk(); TR.faint(s, { x: 5, y: 5 }); TR.depart(s, 'last');
  const r3 = TR.faint(s, { x: 9, y: 9 });
  check('身上只有工具时倒下：不产生新失物包，旧失物包还在原处', r3.dropped.length === 0 && s.expedition.lostBag.x === 5);
  // pick up with a nearly full bag
  s = mk(); TR.faint(s, { x: 5, y: 5 }); TR.depart(s, 'last');
  s.party = [];
  while (s.inventory.length < 19) s.inventory.push({ id: Object.keys(ITEMS).filter((k) => !['item_wood', 'item_berry', 'item_crystal', 'item_axe', 'item_bigbag'].includes(k))[s.inventory.length], count: 1 });
  const p2 = TR.pickUpLostBag(s);
  check('背包只剩 1 格：能放的先拿，放不下的留在失物包里', p2.took.length === 1 && p2.left.length === 2 && s.expedition.lostBag.items.length === 2);
  check('失物包坐标不合法的存档会被拒绝', S.validate({ ...S.newGameState(), expedition: { seed: 1, changes: G.emptyChanges(), lostBag: { x: 'a', y: 1, items: [] } } }).includes('expedition.lostBag'));
}

// ---------- night: fog monsters & light (T21; docs/06 第 4 节) ----------
{
  const H = (h, m = 0) => h * 60 + m;
  check('起雾时间：19:59 没有、20:00 起雾、凌晨 5:59（29:59）还有、6:00 散去', !NI.isFoggy(H(19, 59)) && NI.isFoggy(H(20)) && NI.isFoggy(H(29, 59)) && !NI.isFoggy(H(6)));
  // spawn schedule through one night
  let last = null, count = 0; const spawns = [];
  for (let c = H(19); c <= H(30); c++) if (NI.shouldSpawn(c, last, count)) { spawns.push(NI.isFoggy(c) ? c : -1); last = c; count++; if (count === 3) break; }
  check('刷怪节奏：20:10 第一只，之后每 60 分钟；最多 3 只', spawns.map((c) => T.formatClock(c)).join() === '20:10,21:10,22:10', spawns.map((c) => T.formatClock(c)).join());
  check('午夜后每 30 分钟刷一只', NI.shouldSpawn(H(24, 30), H(24), 1) && !NI.shouldSpawn(H(23, 30), H(23), 1));
  check('同时最多 3 只', !NI.shouldSpawn(H(25), H(23), 3));

  // light sources
  const st = S.newGameState(); st.day = 2; st.clock = H(21);
  st.party = ['pet-pup', 'pet-acorn'];
  eq('队伍里没有发光宠物、没点火把：身边没有光', NI.playerLightTiles(st), 0);
  NI.lightTorch(st);
  check('点亮火把：身边 2 格光，3 小时后熄灭', NI.playerLightTiles(st) === 2 && (st.clock = H(23, 59), NI.torchLit(st)) && (st.clock = H(24), !NI.torchLit(st)));
  st.clock = H(21); st.party = ['pet-fox'];
  check('火把和发光宠物不叠加，取最大（2 格）', NI.playerLightTiles(st) === 2);
  st.player.torchUntil = 0;
  eq('只有焰尾狐在队伍里：身边 1.5 格光', NI.playerLightTiles(st), 1.5);
  check('星星熊仔也能照明', (st.party = ['pet-starbear'], NI.playerLightTiles(st) === 1.5));
  check('火把燃烧时间跨过午夜和结算也正确（按绝对时间算）', (() => { const s = S.newGameState(); s.day = 3; s.clock = H(23); NI.lightTorch(s); s.clock = H(25, 59); const a = NI.torchLit(s); s.day = 4; s.clock = H(6); return a && !NI.torchLit(s); })());

  // E06: monsters never enter a campfire's light
  const fire = { x: 1000, y: 1000 };
  const ls = NI.lights(S.newGameState(), { x: 1000, y: 1000 }, [fire]);
  const r = NI.LIGHT_TILES.campfire * NI.TILE_PX;
  let m = { x: 1000 + r + 200, y: 1000 };
  for (let i = 0; i < 400; i++) m = NI.monsterStep(m, { x: 1000, y: 1000 }, ls, 0.05);
  const d = Math.hypot(m.x - fire.x, m.y - fire.y);
  check('E06 玩家站在营火光圈里：雾怪停在光圈边缘，不进来', d >= r && d <= r + NI.MONSTER.edgeMargin + 5 && m.stopped, `距离 ${d.toFixed(1)}，光圈 ${r}`);
  let inside = { x: 1000 + 50, y: 1000 };
  const startD = 50;
  for (let i = 0; i < 20; i++) inside = NI.monsterStep(inside, { x: 1000, y: 1000 }, ls, 0.05);
  check('在光里的雾怪会往外退', Math.hypot(inside.x - 1000, inside.y - 1000) > startD && inside.retreating);
  check('站在光里的雾怪不能攻击，光外够近才攻击', !NI.canAttack({ x: 1050, y: 1000 }, { x: 1000, y: 1000 }, ls, 0) && NI.canAttack({ x: 1000 + r + 20, y: 1000 }, { x: 1000 + r - 100, y: 1000 }, ls, 0));
  check('攻击冷却 4 秒', !NI.canAttack({ x: 0, y: 0, nextAttack: 4000 }, { x: 50, y: 0 }, [], 3999) && NI.canAttack({ x: 0, y: 0, nextAttack: 4000 }, { x: 50, y: 0 }, [], 4000));
  const w = { x: 0, y: 0, r: NI.MONSTER.warnRadius };
  check('预警圈：站在圈里被打中，走出 1.2 格就躲开', NI.warningHits(w, { x: 50, y: 0 }) && !NI.warningHits(w, { x: 58, y: 0 }));
  near('1.2 秒内走出预警圈：玩家 1.2 秒能走 204 像素，圈半径 57.6', 170 * 1.2 - NI.MONSTER.warnRadius, 146.4, 0.01);
  const hp = { hp: 100, hpMax: 100, hunger: 50, hungerMax: 100 };
  let hits = 0; while (!V.applyDamage(hp, NI.MONSTER.damage, 'expedition').includes('faint')) hits++;
  eq('E07 夜晚不躲，被打 7 次倒下', hits + 1, 7);
  const sp = NI.pickSpawn(mulberry32(3), { x: 1000, y: 1000 }, ls, () => true);
  check('雾怪只在光外出现', !!sp && !NI.litBy(ls, sp.x, sp.y));
  check('火把时间存档合法', S.validate({ ...S.newGameState(), player: { ...S.newGameState().player, torchUntil: 5000 } }).length === 0);
}

// ---------- camping (T22; docs/06 第 3–4 节) ----------
{
  const mk = () => {
    const s = S.newGameState(); s.day = 3; s.clock = 20 * 60;
    s.expedition = { seed: 4242, biome: 'mistwood', changes: G.emptyChanges(), lostBag: null }; s.player.area = 'expedition';
    s.inventory = [{ id: 'item_wood', count: 4 }, { id: 'item_stone', count: 4 }];
    return s;
  };
  // 8 wood: 4 for the campfire + 4 fuel = exactly 20:00 → 6:00
  let s = mk();
  check('做营火：木材 4 + 石头 4', CR.craft(s, 'campfire').ok && I.countOf(s.inventory, 'item_campfire') === 1 && I.countOf(s.inventory, 'item_wood') === 0);
  s.inventory.push({ id: 'item_wood', count: 4 });
  const pl = CP.placeCampfire(s, 10, 10);
  check('20:00 点燃营火：能烧 2 小时（到 22:00）', pl.ok && CP.fireLeft(s, pl.fire) === 120 && I.countOf(s.inventory, 'item_campfire') === 0);
  eq('撑到 6:00 还要 4 根柴', CP.woodToDawn(s, pl.fire), 4);
  for (let i = 0; i < 4; i++) CP.addWood(s, pl.fire.id);
  check('8 份木材刚好撑过 20:00–6:00', CP.fireLeft(s, pl.fire) === 10 * 60 && CP.woodToDawn(s, pl.fire) === 0 && I.countOf(s.inventory, 'item_wood') === 0);
  check('没有木材不能添柴', CP.addWood(s, pl.fire.id).reason === 'no-wood');
  check('同一格不能放两个营火', (s.inventory.push({ id: 'item_campfire', count: 1 }), CP.placeCampfire(s, 10, 10).reason === 'occupied'));
  // burning across midnight & burning out
  s.clock = 25 * 60; check('午夜后营火还在烧（按绝对时间）', CP.burning(s).length === 1 && CP.fireLeft(s, pl.fire) === 300);
  s.clock = 30 * 60; check('6:00 燃料用完熄灭', CP.burning(s).length === 0);
  s.inventory.push({ id: 'item_wood', count: 1 });
  CP.addWood(s, pl.fire.id);
  check('熄灭的营火添柴会重新点燃（从现在算 2 小时）', CP.fireLeft(s, pl.fire) === 120);
  // tent sleep
  s = mk(); s.inventory = [{ id: 'item_campfire', count: 1 }, { id: 'item_wood', count: 2 }];
  const f2 = CP.placeCampfire(s, 5, 5).fire;
  check('没有帐篷不能在野外睡', CP.canCampSleep(s, f2.id).reason === 'no-tent');
  s.inventory.push({ id: 'item_tent', count: 1 });
  const c1 = CP.canCampSleep(s, f2.id);
  check('火撑不到天亮不能睡，并告诉差几根柴', !c1.ok && c1.reason === 'fuel' && c1.wood === 4);
  s.clock = 26 * 60;   // 2:00 — the fire (lit at 20:00 for 2h) is out; dawn in 4h → 2 wood
  CP.addWood(s, f2.id); CP.addWood(s, f2.id);
  check('凌晨 2:00 添 2 根柴就够撑到天亮，可以睡', CP.canCampSleep(s, f2.id).ok);
  s.player.hp = 30; s.player.hunger = 70; s.pets[0].hp = 3;
  T.runSettlement(s, { slept: true });
  check('帐篷睡醒：生命回满、饱食 −20、宠物恢复，还在远征岛上', s.player.hp === 100 && s.player.hunger === 50 && s.pets.every((x) => x.hp == null) && s.player.area === 'expedition' && s.clock === 360);
  check('营地存档合法', S.validate(s).length === 0, S.validate(s).join());
  check('家园岛不能放营火', (() => { const h = S.newGameState(); return CP.placeCampfire(h, 1, 1).reason === 'home'; })());
  // chests & tent recipe
  const c = mk(); c.inventory = [];
  const loot = CP.chestLoot(4242, 'c0');
  check('宝箱里有 2–3 块布，结果由种子决定', loot.items.item_cloth >= 2 && loot.items.item_cloth <= 3 && JSON.stringify(loot) === JSON.stringify(CP.chestLoot(4242, 'c0')));
  const clover0 = c.clover;
  const o = CP.openChest(c, 'c0');
  check('打开宝箱：物品进背包、四叶草 +20、记入岛屿记录', o.ok && I.countOf(c.inventory, 'item_cloth') === loot.items.item_cloth && c.clover === clover0 + 20 && c.expedition.changes.chests.includes('c0'));
  check('同一个宝箱不能开两次', CP.openChest(c, 'c0').reason === 'opened');
  const full = mk(); full.party = []; full.inventory = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, count: 1 }));
  check('背包满了打不开宝箱（宝箱留着）', CP.openChest(full, 'c1').reason === 'full' && !full.expedition.changes.chests.includes('c1'));
  const t1 = mk(); t1.inventory = [{ id: 'item_cloth', count: 4 }, { id: 'item_wood', count: 6 }];
  check('帐篷只能在家园做（远征中拒绝，材料不扣）', CR.craft(t1, 'tent').reason === 'station' && I.countOf(t1.inventory, 'item_cloth') === 4);
  t1.player.area = 'home';
  check('回家园可以做帐篷：布 4 + 木材 6', CR.craft(t1, 'tent').ok && I.countOf(t1.inventory, 'item_tent') === 1 && t1.inventory.length === 1);
  const ft = mk(); ft.day = 5; ft.inventory = [{ id: 'item_tent', count: 1 }, { id: 'item_wood', count: 3 }];
  TR.faint(ft, { x: 1, y: 1 });
  check('倒下时帐篷保留', I.countOf(ft.inventory, 'item_tent') === 1);
}

// ---------- pet explore skills (T24; docs/02 第 9 节, docs/07 第 7 节) ----------
{
  const st = S.newGameState();
  const setParty = (...ids) => { st.party = ids.map((id) => `pet-${id}`); };
  setParty('acorn'); check('只有队伍里的宠物算：橡果刺猬在队 → 能开路，不能涉水', EX.canClear(st) && !EX.canWade(st));
  setParty('shark'); check('航海鲨在队 → 能涉水', EX.canWade(st));
  setParty('fox', 'starbear'); eq('焰尾狐 + 星星熊仔都在队：照明不叠加，仍是 1.5 格', NI.playerLightTiles(st), 1.5);
  st.pets.find((x) => x.uid === 'pet-fox').affection = 100;
  eq('好感 100：照明 2.5 格', NI.playerLightTiles(st), 2.5);
  setParty('pup'); eq('冰蓝小狼在队：背包 24 格', CR.bagSlots(st), 24);
  st.pets.find((x) => x.uid === 'pet-pup').affection = 100;
  eq('冰蓝小狼好感 100：背包 26 格', CR.bagSlots(st), 26);
  setParty('acorn'); eq('没有寻宝宠物：地图不显示宝箱', EX.treasureSense(st), 0);
  setParty('shadecat'); eq('月影狐猫在队：地图显示宝箱', EX.treasureSense(st), 1);
  st.pets.find((x) => x.uid === 'pet-shadecat').affection = 100;
  eq('月影狐猫好感 100：还显示稀有地点', EX.treasureSense(st), 2);
  // generator: ponds, thorn chest, islet crystals; never required
  let ponds = 0, bonus = 0, islets = 0, ok = true;
  for (let i = 1; i <= 60; i++) {
    const isl = G.generateIsland(i * 104729);
    if (isl.water.flat().some(Boolean)) ponds++;
    const b = isl.chests.find((c) => c.bonus); if (b) { bonus++; if (isl.thorns.length !== 8 || !isl.thorns.every((x) => Math.max(Math.abs(x.tx - b.tx), Math.abs(x.ty - b.ty)) === 1)) ok = false; }
    islets += isl.resources.filter((r) => r.rare).length;
    if (isl.resources.some((r) => isl.water[r.ty][r.tx]) || isl.pets.some((w) => isl.water[w.ty][w.tx]) || isl.camps.some((c) => isl.water[c.ty][c.tx])) ok = false;
  }
  check('60 座岛：都有浅水池塘和荆棘宝箱（8 丛荆棘围一圈），东西不会放在水里', ponds === 60 && bonus === 60 && ok, `池塘 ${ponds} 荆棘宝箱 ${bonus}`);
  check('大部分岛上有池塘小岛雾晶（稀有）', islets >= 40, `小岛雾晶 ${islets}`);
  check('不需要任何宠物技能也能拿到所有普通内容（E02 的校验把水和荆棘当墙）', G.validate(G.generateIsland(20261108)) === null);
  // clearing thorns
  const s2 = S.newGameState(); s2.expedition = { seed: 20261108, biome: 'mistwood', changes: G.emptyChanges() }; s2.player.area = 'expedition';
  s2.party = ['pet-pup'];
  check('没有橡果刺猬清不了荆棘', EX.clearThorn(s2, 't0').reason === 'need-clear');
  s2.party = ['pet-acorn'];
  check('橡果刺猬在队：清掉荆棘并记入岛屿记录', EX.clearThorn(s2, 't0').ok && s2.expedition.changes.thorns.includes('t0'));
  check('同一丛荆棘不能清两次', EX.clearThorn(s2, 't0').reason === 'gone');
  const isl2 = G.applyChanges(G.generateIsland(20261108), s2.expedition.changes);
  check('回到岛上清掉的荆棘还是没有、格子不再挡路', !isl2.thorns.some((x) => x.id === 't0') && isl2.thorns.length === 7);
  check('清掉荆棘后的存档合法', S.validate(s2).length === 0, S.validate(s2).join());
  const nb = CP.chestLoot(5, 'c0'), bb = CP.chestLoot(5, 'c2', true);
  check('秘密宝箱奖励更好：布 3 + 雾晶 ≥2、四叶草 40', bb.items.item_cloth >= 3 && bb.items.item_crystal >= 2 && bb.clover === 40 && nb.clover === 20);
  // storage: 冰蓝小狼 leaves → nothing lost
  const s3 = S.newGameState();
  // only 17 kinds of items exist yet, so pad with test stacks to overflow a 20-slot bag
  s3.inventory = [...Object.keys(ITEMS).filter((id) => id !== 'item_bigbag').slice(0, 17).map((id) => ({ id, count: 1 })), ...Array.from({ length: 6 }, (_, i) => ({ id: `test${i}`, count: 2 }))];
  const total = (inv) => inv.reduce((n, x) => n + x.count, 0);
  const before = total(s3.inventory), stacks = s3.inventory.length;
  const lv = PT.leaveParty(s3, 'pet-pup');
  check('冰蓝小狼离队：背包变回 20 格，多出的放进家园仓库，一件不少', lv.ok && s3.inventory.length === 20 && lv.moved.length === stacks - 20 && total(s3.inventory) + total(s3.storage) === before,
    `${stacks} 格 → 背包 ${s3.inventory.length} + 仓库 ${s3.storage.length}`);
  check('有仓库的存档合法', S.validate({ ...S.newGameState(), storage: [{ id: 'item_wood', count: 9 }] }).length === 0);
  s3.inventory = s3.inventory.filter((x) => ITEMS[x.id]); s3.storage = s3.storage.filter((x) => ITEMS[x.id]);
  const n = EX.depositAll(s3, (id) => ITEMS[id].tool || ITEMS[id].food);
  check('全部存入：工具和食物留在身上', n > 0 && s3.inventory.every((x) => ITEMS[x.id].tool || ITEMS[x.id].food));
  const w = EX.withdrawAll(s3, CR.bagSlots(s3));
  check('全部取回：放得下的拿回来，放不下的留在仓库', s3.inventory.length <= 20 && w.took > 0 && (w.left === 0 || s3.inventory.length === 20));
}

// ---------- new-player guide (T42) ----------
{
  const s = S.newGameState();
  check('新档第一个目标：去码头出发', GD.currentGoal(s).id === 'depart');
  TR.depart(s, 'new');
  check('出发后 → 第二个目标：采集 3 次', GD.checkGuide(s)?.id === 'depart' && GD.currentGoal(s).id === 'gather');
  for (let i = 0; i < 2; i++) CR.gather(s, { id: `g${i}`, type: 'grass' });
  check('采集 2 次还不算完成', GD.checkGuide(s) === null);
  CR.gather(s, { id: 'g9', type: 'bush' });
  check('采集第 3 次完成 → 目标：做石斧', GD.checkGuide(s)?.id === 'gather' && GD.currentGoal(s).id === 'axe');
  s.inventory.push({ id: 'item_wood', count: 3 }, { id: 'item_stone', count: 2 });
  CR.craft(s, 'axe');
  check('做出石斧 → 目标：打一场', GD.checkGuide(s)?.id === 'axe' && GD.currentGoal(s).id === 'battle');
  const b = B.createBattle({ party: [s.pets[0]], enemies: [M.createPet('acorn', { uid: 'gw', stars: 3, nature: 'gentle', shiny: false })], inventory: s.inventory, rng: () => 0.5 });
  B.resolveTurn(b, { type: 'flee' }); B.finishBattle(s, b);
  check('溜走不算打了一场', GD.checkGuide(s) === null);
  const b2 = B.createBattle({ party: [s.pets[0]], enemies: [M.createPet('acorn', { uid: 'gw2', stars: 3, nature: 'gentle', shiny: false })], inventory: s.inventory, rng: () => 0.5 });
  let g = 0; while (!b2.over && g++ < 30) B.resolveTurn(b2, b2.needSwitch ? { type: 'switch', index: 0 } : { type: 'skill', skill: 'tackle' });
  B.finishBattle(s, b2);
  check('打完一场 → 目标：天黑前回家', GD.checkGuide(s)?.id === 'battle' && GD.currentGoal(s).id === 'return');
  TR.returnHome(s);
  check('坐飞艇回家 → 目标：睡觉', GD.checkGuide(s)?.id === 'return' && GD.currentGoal(s).id === 'sleep');
  T.runSettlement(s, { slept: true });
  check('睡一觉 → 新手目标全部完成，不再显示', GD.checkGuide(s)?.id === 'sleep' && GD.guideDone(s) && GD.currentGoal(s) === null);
  check('引导进度存档合法', S.validate(s).length === 0);
  // camp sleep also counts for "回家"
  const c = S.newGameState(); c.flags.guide = { step: 4, base: { ...GD.stats(c) }, off: false };
  GD.bump(c, 'campSleeps');
  check('扎营过夜也算完成「天黑前回家」', GD.checkGuide(c)?.id === 'return');
  // switching off
  const o = S.newGameState(); GD.setGuideOff(o, true);
  check('关闭新手目标后不显示、也不推进', GD.currentGoal(o) === null && (TR.depart(o, 'new'), GD.checkGuide(o) === null));
  // tips once
  const tp = S.newGameState(); tp.player.hunger = 20;
  check('饿了的提示只出现一次', GD.nextTip(tp)?.includes('吃') && GD.nextTip(tp) === null);
}

// ---------- new-player protection (负责人 2026-11-08) ----------
{
  const mk = (day) => { const s = S.newGameState(); s.day = day; s.expedition = { seed: 3, biome: 'mistwood', changes: G.emptyChanges(), lostBag: null }; s.player.area = 'expedition'; s.inventory = [{ id: 'item_axe', count: 1 }, { id: 'item_wood', count: 12 }]; return s; };
  const a = mk(3); const ra = TR.faint(a, { x: 1, y: 1 });
  check('第 3 天倒下（新手保护）：东西全部留在身上，没有失物包', ra.protected && ra.dropped.length === 0 && I.countOf(a.inventory, 'item_wood') === 12 && !a.expedition.lostBag);
  check('保护期倒下照常第二天 8:00 醒来、生命 50', a.day === 4 && a.clock === 480 && a.player.hp === 50);
  const b = mk(4); TR.faint(b, { x: 1, y: 1 });
  check('第 4 天起倒下恢复正常掉落', I.countOf(b.inventory, 'item_wood') === 0 && b.expedition.lostBag.items[0].count === 12);
}

// ---------- farming & shipping (T11) ----------
{
  check('5 种作物的种子、果实都是已定义的物品，果实都有出货价', Object.values(CROPS).every((c) => ITEMS[c.seed] && ITEMS[c.crop] && PRICES[c.crop] > c.seedPrice));
  check('5 种作物正好是 5 只宠物的喜好食物（向日葵、星光麦等）', ['item_carrot', 'item_strawberry', 'item_sunflower', 'item_starwheat', 'item_pumpkin'].every((id) => PETS.some((p) => p.food === id)));
  const s = S.newGameState();
  const k = FM.plotKey(30, 19);
  eq('没开垦的地：动作是开垦', FM.plotAction(s, k), 'till');
  check('没开垦不能播种', FM.plant(s, k, 'item_seed_carrot').reason === 'not-tilled');
  check('有锄头：开垦', FM.till(s, k).ok && FM.plotAction(s, k) === 'plant');
  const seeds0 = I.countOf(s.inventory, 'item_seed_carrot');
  check('播种萝卜：种子 −1', FM.plant(s, k, 'item_seed_carrot').ok && I.countOf(s.inventory, 'item_seed_carrot') === seeds0 - 1 && FM.plotAction(s, k) === 'water');
  check('同一块地不能种两次', FM.plant(s, k, 'item_seed_carrot').reason === 'occupied');
  // 3 days: water → sleep → water → sleep (skip one day) ...
  FM.water(s, k);
  check('浇过水后今天不能再浇', FM.plotAction(s, k) === 'wait' && FM.water(s, k).reason === 'watered');
  let r = T.runSettlement(s, { slept: true });
  check('第 1 天浇了水 → 长 1 天，结算里有提示', FM.plotOf(s, k).days === 1 && r.lines.some((l) => l.includes('作物长大')));
  r = T.runSettlement(s, { slept: true });
  check('没浇水 → 不长，结算提示没浇水', FM.plotOf(s, k).days === 1 && r.lines.some((l) => l.includes('没浇水')));
  FM.water(s, k); T.runSettlement(s, { slept: true });
  FM.water(s, k); r = T.runSettlement(s, { slept: true });
  check('萝卜浇满 3 天成熟（可以收获）', FM.ripe(FM.plotOf(s, k)) && FM.plotAction(s, k) === 'harvest' && r.lines.some((l) => l.includes('可以收获')));
  check('成熟后不用再浇水', FM.water(s, k).reason === 'ripe');
  const c0 = I.countOf(s.inventory, 'item_carrot');
  check('收获：萝卜 +1，地还是开垦好的', FM.harvest(s, k).ok && I.countOf(s.inventory, 'item_carrot') === c0 + 1 && FM.plotAction(s, k) === 'plant');
  // shipping
  const clover0 = s.clover;
  FM.ship(s, 'item_carrot', 1);
  check('放进出货箱：明早结算价值 25', FM.shippingValue(s) === 25);
  check('工具不能出货', FM.ship(s, 'item_hoe', 1).reason === 'no-price');
  r = T.runSettlement(s, { slept: true });
  check('出货收入正确：第二天四叶草 +25，出货箱清空', s.clover === clover0 + 25 && FM.farmOf(s).shipping.length === 0 && r.lines.some((l) => l.includes('+25')));
  check('结算顺序：出货在作物生长之前', r.order.indexOf('shipping') < r.order.indexOf('crops'));
  FM.ship(s, 'item_berry', 1);
  check('从出货箱取回', FM.unship(s, 'item_berry').ok && FM.shippingValue(s) === 0);
  // seeds
  const cl = s.clover;
  check('种子摊买南瓜种子：四叶草 −30', FM.buySeed(s, 'pumpkin', 1).ok && s.clover === cl - 30 && I.countOf(s.inventory, 'item_seed_pumpkin') === 1);
  s.clover = 5;
  check('四叶草不够买不了', FM.buySeed(s, 'pumpkin', 1).reason === 'clover');
  const noTool = S.newGameState(); noTool.inventory = [];
  check('没有锄头不能开垦、没有水壶不能浇水', FM.till(noTool, k).reason === 'no-hoe' && (noTool.farm.plots[k] = { tilled: true, crop: 'carrot', days: 0, watered: false }, FM.water(noTool, k).reason === 'no-can'));
  check('农田存档合法', S.validate(s).length === 0, S.validate(s).join());
  // save migration 1 → 2
  const v1 = { ...S.newGameState(), version: 1 }; delete v1.farm; v1.inventory = v1.inventory.filter((x) => !['item_hoe', 'item_can', 'item_seed_carrot'].includes(x.id));
  const mig = S.decode(S.encode(v1));
  check('旧存档（版本 1）读入时自动迁移：加上农田、锄头、水壶、萝卜种子', mig.ok && mig.state.version === S.SAVE_VERSION && mig.state.farm && ['item_hoe', 'item_can', 'item_seed_carrot'].every((id) => mig.state.inventory.some((x) => x.id === id)), JSON.stringify(mig.reason ?? ''));
}

// ---------- pet care & work (T12; docs/02 第 7 节, docs/07 第 7 节) ----------
{
  const s = S.newGameState();
  s.inventory.push({ id: 'item_carrot', count: 3 }, { id: 'item_sunflower', count: 2 });
  let r = PC.feed(s, 'pet-acorn', 'item_carrot');
  check('喂最爱的食物（橡果刺猬吃萝卜）：好感 +15', r.ok && r.favourite && s.pets.find((p) => p.uid === 'pet-acorn').affection === 15);
  check('一天只能喂一次', PC.feed(s, 'pet-acorn', 'item_carrot').reason === 'fed');
  r = PC.feed(s, 'pet-fox', 'item_carrot');
  check('喂其他食物：好感 +5', r.ok && !r.favourite && s.pets.find((p) => p.uid === 'pet-fox').affection === 5);
  check('向日葵人不能吃，但能喂冰蓝小狼（最爱 +15）', !ITEMS.item_sunflower.food && PC.feed(s, 'pet-pup', 'item_sunflower').gain === 15);
  check('工具不能喂', PC.feed(s, 'pet-shark', 'item_hoe').reason === 'not-food');
  check('摸摸 +2，一天一次', PC.petPet(s, 'pet-acorn').gain === 2 && PC.petPet(s, 'pet-acorn').reason === 'petted');
  T.runSettlement(s, { slept: true });
  check('第二天可以再喂、再摸', PC.feed(s, 'pet-acorn', 'item_carrot').ok && PC.petPet(s, 'pet-acorn').ok && s.pets.find((p) => p.uid === 'pet-acorn').affection === 34);
  const a = s.pets.find((p) => p.uid === 'pet-acorn'); a.affection = 99;
  PC.petPet({ ...s, day: s.day + 1 }, 'pet-acorn');
  eq('好感最高 100', a.affection, 100);
  // work
  eq('打工产量公式：基础 4、好感 50 → 6', PC.workAmount(4, 50), 6);
  eq('好感 100 → 翻倍', PC.workAmount(4, 100), 8);
  check('队伍里的宠物不能打工', PC.setJob(s, 'pet-pup', true).reason === 'party');
  const w = S.newGameState();
  w.party = ['pet-acorn'];
  for (const id of ['pet-pup', 'pet-fox', 'pet-shark', 'pet-shadecat', 'pet-starbear']) PC.setJob(w, id, true);
  w.pets.find((p) => p.uid === 'pet-fox').affection = 50;
  w.farm.plots['1,1'] = { tilled: true, crop: 'carrot', days: 0, watered: false };
  w.farm.plots['2,1'] = { tilled: true, crop: 'carrot', days: 0, watered: false };
  const clover0 = w.clover;
  const rep = T.runSettlement(w, { slept: true });
  const has = (id) => I.countOf(w.storage, id);
  check('冰蓝小狼伐木：仓库木材 +4', has('item_wood') === 4);
  check('焰尾狐挖矿（好感 50）：石头 +6、雾晶 +1', has('item_stone') === 6 && has('item_crystal') === 1);
  check('航海鲨钓鱼：鱼 +2', has('item_fish') === 2);
  check('月影狐猫寻宝：四叶草 +10', w.clover === clover0 + 10);
  check('星星熊仔浇水：早上把地都浇了（作物生长之后浇，算新的一天）', Object.values(w.farm.plots).every((p) => p.watered && p.days === 0));
  check('结算面板列出每只宠物带回的东西', rep.lines.filter((l) => /(伐木|挖矿|钓鱼|寻宝|浇水)：/.test(l)).length === 5, rep.lines.join(' / '));
  check('打工的宠物加入队伍后自动停止打工', PT.joinParty(w, 'pet-pup').ok && w.pets.find((p) => p.uid === 'pet-pup').job === false);
  // bonding on adventures
  const b = S.newGameState(); b.party = ['pet-fox'];
  for (let i = 0; i < 7; i++) PC.bondFromBattle(b);
  eq('一起打赢对战每次 +1，一天最多 +5', b.pets.find((p) => p.uid === 'pet-fox').affection, 5);
  PC.bondFromTrip(b); PC.bondFromTrip(b); PC.bondFromTrip(b);
  eq('一起完成远征每次 +2，一天最多 +5', b.pets.find((p) => p.uid === 'pet-fox').affection, 10);
  check('照顾记录存档合法', S.validate(w).length === 0 && S.validate(s).length === 0);
}

// ---------- daily tasks (T44) ----------
{
  const s = S.newGameState();
  const d1 = DY.ensureDaily(s);
  check('每天 3 个不同的任务', d1.tasks.length === 3 && new Set(d1.tasks.map((x) => x.id)).size === 3);
  check('同一天同一存档任务固定（刷新也一样）', JSON.stringify(DY.ensureDaily(JSON.parse(JSON.stringify({ ...s, daily: null }))).tasks) === JSON.stringify(d1.tasks));
  check('第 1 天不会出「收获」「抓宠物」（还做不到）', !d1.tasks.some((x) => ['harvest', 'catches'].includes(x.id)));
  // force a known set and complete them
  s.daily.tasks = [{ id: 'pet', stat: 'pet', n: 3, text: '摸摸宠物 3 次', done: false }, { id: 'feed', stat: 'feed', n: 2, text: '喂宠物 2 次', done: false }, { id: 'craft', stat: 'craft', n: 1, text: '制作 1 件东西', done: false }];
  const c0 = s.clover;
  PC.petPet(s, 'pet-acorn'); PC.petPet(s, 'pet-fox');
  check('进度按今天的计数算（摸了 2 次 → 2/3），还没完成', DY.progressOf(s, s.daily.tasks[0]) === 2 && DY.checkDaily(s).done.length === 0);
  PC.petPet(s, 'pet-pup');
  let r = DY.checkDaily(s);
  check('完成一个任务：自动发 20 四叶草', r.done.length === 1 && s.clover === c0 + 20);
  check('同一个任务不会重复发奖', DY.checkDaily(s).done.length === 0 && s.clover === c0 + 20);
  s.inventory.push({ id: 'item_carrot', count: 2 });
  PC.feed(s, 'pet-acorn', 'item_carrot'); PC.feed(s, 'pet-fox', 'item_carrot');
  s.inventory.push({ id: 'item_wood', count: 2 }, { id: 'item_grass', count: 2 });
  CR.craft(s, 'torch');
  const seedsBefore = s.inventory.filter((x) => ITEMS[x.id].tag === '种子').reduce((n, x) => n + x.count, 0);
  r = DY.checkDaily(s);
  check('三个都完成：再得 30 四叶草和一包种子', r.done.length === 2 && r.bonus?.clover === 30 && s.clover === c0 + 20 * 3 + 30 && s.inventory.filter((x) => ITEMS[x.id].tag === '种子').reduce((n, x) => n + x.count, 0) === seedsBefore + 1);
  check('全勤奖只发一次', DY.checkDaily(s).bonus === null);
  T.runSettlement(s, { slept: true });
  const d2 = DY.ensureDaily(s);
  check('睡醒后任务刷新，进度从 0 开始', d2.day === s.day && d2.tasks.every((x) => !x.done && DY.progressOf(s, x) === 0));
  check('每日任务存档合法', S.validate(s).length === 0, S.validate(s).join());
  check('任务池里的计数名都有系统在累加', DY.POOL.every((x) => ['water', 'feed', 'pet', 'gather', 'plant', 'craft', 'wins', 'chests', 'shipped', 'harvest', 'catches', 'talk'].includes(x.stat)));
}

// ---------- growth: evolution, stars, skill books, human form (T27/T28/T29/T39; docs/07) ----------
{
  const s = S.newGameState();
  const fox = s.pets.find((p) => p.uid === 'pet-fox');
  fox.level = 12; fox.affection = 29;
  s.inventory.push({ id: 'item_evo_fire', count: 1 });
  let r = GR.tryEvolve(s, 'pet-fox');
  check('P05 等级 12、好感 29、有火之石 → 不能进化，提示还差好感', !r.ok && r.missing.join() === 'affection');
  fox.affection = 30;
  s.inventory = s.inventory.filter((x) => x.id !== 'item_evo_fire');
  check('没有进化石不能进化', GR.tryEvolve(s, 'pet-fox').missing.join() === 'stone');
  s.inventory.push({ id: 'item_evo_fire', count: 1 });
  r = GR.tryEvolve(s, 'pet-fox');
  check('P01→P02 进化：火之石 −1，攻击 24 → 30，名字变灯焰狐，学会狐火灯笼', r.ok && I.countOf(s.inventory, 'item_evo_fire') === 0 && M.calcStats(fox).atk === 30 && M.displayName(fox) === '灯焰狐' && M.battleSkills(fox).includes('foxlantern'));
  check('进化后等级、好感不变', fox.level === 12 && fox.affection === 30);
  check('已进化不能再进化', GR.tryEvolve(s, 'pet-fox').missing.includes('evolved'));
  // P03/P04 already covered by petMath; P06 stars
  const a = s.pets.find((p) => p.uid === 'pet-acorn'); a.stars = 1;
  s.pets.push({ ...JSON.parse(JSON.stringify(a)), uid: 'dup-acorn', stars: 4 });
  check('只有一只时不能转结晶', GR.convertToCrystal({ ...s, pets: s.pets.filter((p) => p.uid !== 'dup-acorn') }, 'pet-acorn').reason === 'only-one');
  r = GR.convertToCrystal(s, 'dup-acorn');
  check('重复的橡果刺猬（4 星）转成 4 个结晶，宠物移除', r.ok && r.gained === 4 && GR.crystalsOf(s, 'acorn') === 4 && !s.pets.some((p) => p.uid === 'dup-acorn'));
  s.crystals.acorn = 6;
  GR.starUp(s, 'pet-acorn'); GR.starUp(s, 'pet-acorn');
  check('P06 1 星 + 6 个结晶连升两次 → 3 星，结晶剩 0', a.stars === 3 && GR.crystalsOf(s, 'acorn') === 0);
  check('结晶不够不能升星', GR.starUp(s, 'pet-acorn').reason === 'crystals');
  a.stars = 5; check('5 星封顶', GR.starUp(s, 'pet-acorn').reason === 'max');
  // dex
  GR.dexCatch(s, { species: 'shark', shiny: true });
  check('图鉴分别记录普通色和异色', s.dex.shark.shiny === true && !s.dex.shark.caught);
  // P08 skill books
  s.inventory.push({ id: 'item_book_ember', count: 1 }, { id: 'item_book_bubble', count: 1 }, { id: 'item_book_heal', count: 1 });
  check('P08 用火属性技能书给橡果刺猬（森） → 属性不符', GR.learnSkill(s, 'pet-acorn', 'item_book_ember', 0).reason === 'element');
  check('状态技能书（治愈之歌）谁都能学', GR.canLearn(s, 'pet-acorn', 'item_book_heal').ok);
  r = GR.learnSkill(s, 'pet-shark', 'item_book_bubble', 1);
  check('已经会的技能不能再学', r.reason === 'known');
  const shark = s.pets.find((p) => p.uid === 'pet-shark');
  r = GR.learnSkill(s, 'pet-shark', 'item_book_heal', 0);
  check('学会：替换第 1 格，技能书 −1', r.ok && shark.skills[0] === 'heal' && I.countOf(s.inventory, 'item_book_heal') === 0);
  check('进化技能那一格不能被替换（只能换前 3 格）', GR.learnSkill(s, 'pet-fox', 'item_book_ember', 3).reason !== undefined && M.battleSkills(fox).includes('foxlantern'));
  // P10 / P11 human form
  const f2 = S.newGameState(); const fx = f2.pets.find((p) => p.uid === 'pet-fox'); fx.affection = 100;
  check('P11 未进化的焰尾狐好感 100 → 化形不可用，提示先进化', GR.formCheck(f2, 'pet-fox').missing.includes('evolved'));
  fx.evolved = true;
  check('没有化形铃也不行', GR.formCheck(f2, 'pet-fox').missing.join() === 'bell');
  check('只有焰尾狐能化形', GR.formCheck(f2, 'pet-pup').missing.join() === 'species');
  f2.inventory.push({ id: 'item_foxwick', count: 3 });
  TW.accept(f2, 'lumi_wish');
  check('3 个狐火灯芯交给小镇的露米，换来化形铃（心愿任务）', TW.complete(f2, 'lumi_wish').ok && I.countOf(f2.inventory, 'item_fox_bell') === 1 && I.countOf(f2.inventory, 'item_foxwick') === 0);
  const before = JSON.stringify(M.calcStats(fx));
  check('学会化形：化形铃 −1，可以切换', GR.unlockForm(f2, 'pet-fox').ok && fx.canTransform && I.countOf(f2.inventory, 'item_fox_bell') === 0);
  check('P10 切换成人形态：所有数值与切换前完全相同', GR.toggleForm(f2, 'pet-fox').form === 'human' && JSON.stringify(M.calcStats(fx)) === before);
  check('P10 化形状态存进存档', S.decode(S.encode(f2)).state.pets.find((p) => p.uid === 'pet-fox').form === 'human');
  check('没解锁不能切换', GR.toggleForm(S.newGameState(), 'pet-fox').reason === 'locked');
  // drops
  const lootB = CP.chestLoot(77, 'c2', true);
  check('秘密宝箱必掉 1 块进化石', Object.keys(lootB.items).some((k) => GR.EVO_STONES.includes(k)));
  let stones = 0, books = 0;
  for (let i = 0; i < 400; i++) { const L = CP.chestLoot(i, 'c0'); if (Object.keys(L.items).some((k) => GR.EVO_STONES.includes(k))) stones++; if (Object.keys(L.items).some((k) => ITEMS[k].book)) books++; }
  check('普通宝箱约 15% 进化石、约 20% 技能书', stones > 30 && stones < 95 && books > 50 && books < 115, `进化石 ${stones}/400 技能书 ${books}/400`);
  check('养成后的存档合法', S.validate(s).length === 0 && S.validate(f2).length === 0, S.validate(s).join());
}

// ---------- 风铃小镇: residents, quests, store (T13) ----------
{
  const s = S.newGameState();
  check('3 位居民、6 个任务，任务要的东西和奖励都是已定义的物品', Object.keys(NPCS).length === 3 && QUESTS.length === 6
    && QUESTS.every((q) => Object.keys(q.need).every((k) => k === 'party' || ITEMS[k]) && Object.keys(q.reward.items ?? {}).every((k) => ITEMS[k])));
  const a = TW.talk(s, 'granny');
  check('聊天：第一次 +1 好感，一天只加一次', a.gain === 1 && TW.talk(s, 'granny').gain === 0 && TW.friendOf(s, 'granny') === 1 && !!a.line);
  s.inventory.push({ id: 'item_soup', count: 1 }, { id: 'item_stone', count: 1 }, { id: 'item_berry', count: 3 });
  let r = TW.gift(s, 'granny', 'item_soup');
  check('送最爱的东西（铃奶奶 ← 蔬菜汤）：+10', r.ok && r.taste === 'love' && TW.friendOf(s, 'granny') === 11);
  check('同一位居民一天只能送一次', TW.gift(s, 'granny', 'item_berry').reason === 'gifted');
  check('讨厌的东西会扣好感（阿栗 ← 草就会，铃奶奶 ← 石头）', TW.gift(s, 'ali', 'item_berry').taste === 'neutral' && (s.day++, TW.gift(s, 'granny', 'item_stone').gain === -3));
  check('工具不能送', TW.gift(s, 'lumi', 'item_hoe').reason === 'not-giftable');
  // quests
  check('一开始铃奶奶只给第一个任务（第二个要先完成第一个）', TW.offers(s, 'granny').map((q) => q.id).join() === 'granny_carrot');
  check('接任务', TW.accept(s, 'granny_carrot').ok && TW.questState(s, 'granny_carrot') === 'active' && TW.offers(s, 'granny').length === 0);
  check('萝卜不够时列出还差多少', TW.missing(s, 'granny_carrot')[0]?.need === 5 && TW.complete(s, 'granny_carrot').reason === 'missing');
  s.inventory.push({ id: 'item_carrot', count: 6 });
  const cl = s.clover, fr = TW.friendOf(s, 'granny'), car = I.countOf(s.inventory, 'item_carrot');
  r = TW.complete(s, 'granny_carrot');
  check('交任务：扣 5 根萝卜、四叶草 +60、好感 +10', r.ok && I.countOf(s.inventory, 'item_carrot') === car - 5 && s.clover === cl + 60 && TW.friendOf(s, 'granny') === fr + 10);
  check('任务不会重复领奖', TW.complete(s, 'granny_carrot').reason === 'done' && s.clover === cl + 60);
  check('完成后解锁下一个任务', TW.offers(s, 'granny').map((q) => q.id).join() === 'granny_fish');
  // recipe unlock
  s.player.area = 'home'; s.inventory.push({ id: 'item_carrot', count: 2 }, { id: 'item_pumpkin', count: 1 }, { id: 'item_fish', count: 3 });
  check('没学会之前做不了蔬菜汤', CR.craft(s, 'soup').reason === 'locked');
  TW.accept(s, 'granny_fish'); TW.complete(s, 'granny_fish');
  check('铃奶奶教会蔬菜汤后可以在家园做', s.recipes.includes('soup') && CR.craft(s, 'soup').ok && I.countOf(s.inventory, 'item_soup') === 1);
  // party quest
  s.party = ['pet-pup'];
  TW.accept(s, 'lumi_shadecat');
  check('「带月影狐猫来」：队伍里没有就交不了', TW.missing(s, 'lumi_shadecat')[0]?.party === 'shadecat');
  s.party = ['pet-shadecat'];
  check('带上月影狐猫就能交，得到暗影弹技能书', TW.complete(s, 'lumi_shadecat').ok && I.countOf(s.inventory, 'item_book_shadow') === 1);
  // big bag
  const b = S.newGameState(); b.party = []; b.player.area = 'home'; b.recipes = ['bigbag']; b.inventory = [{ id: 'item_cloth', count: 6 }, { id: 'item_crystal', count: 2 }];
  check('做出大背包：背包 20 → 28 格', CR.bagSlots(b) === 20 && CR.craft(b, 'bigbag').ok && CR.bagSlots(b) === 28);
  // store
  const st0 = TW.stock(s);
  check('杂货铺：种子、布、烤鱼等 + 每天 2 本轮换的技能书', st0.filter((x) => ITEMS[x.id].book).length === 2 && st0.some((x) => x.id === 'item_cloth'));
  check('同一天商品固定', JSON.stringify(TW.stock(s)) === JSON.stringify(st0));
  s.clover = 100;
  check('买布：四叶草 −30', TW.buy(s, 'item_cloth').ok && s.clover === 70 && TW.buy(s, 'item_evo_fire').reason === 'not-sold');
  check('进化石不卖（只能远征获得）', !st0.some((x) => GR.EVO_STONES.includes(x.id)));
  // travel and bedtime
  const tv = S.newGameState(); tv.clock = 9 * 60;
  check('过吊桥去小镇：10 分钟', TR.goTown(tv).ok && tv.player.area === 'town' && tv.clock === 9 * 60 + 10);
  check('从小镇回家园：10 分钟，出现在吊桥边', TR.leaveTown(tv).ok && tv.player.area === 'home' && tv.flags.arriveAt === 'bridge');
  const bt = { day: 1, clock: 23 * 60 + 50, player: { area: 'town' } }, gc = new T.GameClock();
  check('在小镇待到 24:00 也会睡着（小镇是安全区）', gc.advance(bt, 11 * T.MS_PER_GAME_MIN).some((e) => e.type === 'bedtime'));
  check('小镇存档合法', S.validate(s).length === 0 && S.validate({ ...S.newGameState(), player: { ...S.newGameState().player, area: 'town' } }).length === 0, S.validate(s).join());
  const v2 = { ...S.newGameState(), version: 2 }; delete v2.town; delete v2.recipes;
  const m2 = S.decode(S.encode(v2));
  check('旧存档（版本 2）自动迁移：补上小镇和配方记录', m2.ok && m2.state.town && Array.isArray(m2.state.recipes));
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
