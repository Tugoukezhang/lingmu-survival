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
  check('新档：6 只宠物，队伍 3 只（冰蓝小狼领头），背包 6 种物品（含食物）', st.pets.length === 6 && st.party.length === 3 && st.party[0] === 'pet-pup' && st.inventory.length === 6);
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
    if (isl.pets.length < 4 || isl.pets.length > 6 || isl.chests.length < 1 || isl.chests.length > 2 || isl.camps.length < 1 || isl.camps.length > 2) bad.push(`${i}:数量`);
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
  TR.recoverFromFaint(f);
  check('远征中倒下（临时规则）：第二天 8:00 在家醒来，生命 50、饱食 50', f.day === 5 && f.clock === 8 * 60 && f.player.hp === 50 && f.player.hunger === 50 && f.player.area === 'home' && f.flags.arriveAt === 'bed');
  check('倒下后存档合法', S.validate(f).length === 0);
}

// ---------- gathering & crafting (T19; docs/06 第 3 节) ----------
{
  check('配方的材料和产出都是已定义的物品', RECIPES.every((r) => ITEMS[r.out] && Object.keys(r.cost).every((id) => ITEMS[id])));
  check('配方数值与文档一致（石斧 木3石2、石镐 木3石3、火把 木2草2、营火 木4石4、草编网 草3木2、藤编网 布1草3雾晶1）',
    JSON.stringify(RECIPES.map((r) => [r.id, r.cost])) === JSON.stringify([['axe', { item_wood: 3, item_stone: 2 }], ['pickaxe', { item_wood: 3, item_stone: 3 }], ['torch', { item_wood: 2, item_grass: 2 }],
      ['campfire', { item_wood: 4, item_stone: 4 }], ['net_grass', { item_grass: 3, item_wood: 2 }], ['net_vine', { item_cloth: 1, item_grass: 3, item_crystal: 1 }]]));
  check('只有斧和镐算工具（倒下时保留），网是消耗品', Object.entries(ITEMS).filter(([, v]) => v.tool).map(([k]) => k).join() === 'item_axe,item_pickaxe');

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
  check('野生宠物组：第 1–3 天 1 只、第 4–6 天 2 只、第 7 天起 3 只', [1, 3, 4, 6, 7, 20].map(B.wildGroupSize).join() === '1,1,2,2,3,3');
  const g1 = B.makeWildGroup({ species: 'acorn', level: 3, islandSeed: 77, wildIndex: 2, day: 8, pool: PETS.map((x) => x.id) });
  const g2 = B.makeWildGroup({ species: 'acorn', level: 3, islandSeed: 77, wildIndex: 2, day: 8, pool: PETS.map((x) => x.id) });
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

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
