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

// ---------- save (T08; CLAUDE.md 存档约定, docs/06 第 5 节) ----------
{
  const mem = new S.MemoryStorage();
  let clock = 1000;
  const store = new S.SaveStore(mem, { now: () => clock });
  const fresh = store.load();
  check('没有存档时开新档', fresh.source === 'new' && !fresh.problem && S.validate(fresh.state).length === 0, S.validate(fresh.state).join());
  const st = fresh.state;
  eq('新档版本号', st.version, S.SAVE_VERSION);
  check('新档：6 只宠物，冰蓝小狼同行，背包 3 种物品', st.pets.length === 6 && st.party[0] === 'pet-pup' && st.inventory.length === 3);
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

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
