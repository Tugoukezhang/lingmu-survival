// Daily tasks (T44; docs/10 第 2 节 "每天回来的理由"). Three small tasks per
// game day, picked by the save seed + day; progress = growth of the counters
// in state.flags.stats since the day started; rewards are given automatically.
// Pure functions, no Phaser.
import { mulberry32 } from './rng.js';
import { stats } from './guide.js';
import { addItem } from './inventory.js';
import { CROPS } from '../data/crops.js';

export const TASK_REWARD = 20, ALL_BONUS = 30;

// minDay: don't ask for things that can't be done yet (crops need ~3 days).
export const POOL = [
  { id: 'water', stat: 'water', n: 4, text: '给作物浇水 4 次', minDay: 1 },
  { id: 'feed', stat: 'feed', n: 2, text: '喂宠物 2 次', minDay: 1 },
  { id: 'pet', stat: 'pet', n: 3, text: '摸摸宠物 3 次', minDay: 1 },
  { id: 'gather', stat: 'gather', n: 6, text: '在远征岛采集 6 次', minDay: 1 },
  { id: 'plant', stat: 'plant', n: 3, text: '在农田播种 3 次', minDay: 1 },
  { id: 'craft', stat: 'craft', n: 1, text: '制作 1 件东西', minDay: 1 },
  { id: 'wins', stat: 'wins', n: 1, text: '打赢 1 场宠物对战', minDay: 2 },
  { id: 'chests', stat: 'chests', n: 1, text: '打开 1 个宝箱', minDay: 2 },
  { id: 'shipped', stat: 'shipped', n: 60, text: '往出货箱放价值 60 的东西', minDay: 2 },
  { id: 'harvest', stat: 'harvest', n: 2, text: '收获作物 2 次', minDay: 4 },
  { id: 'catches', stat: 'catches', n: 1, text: '抓到 1 只宠物', minDay: 3 },
  { id: 'talk', stat: 'talk', n: 2, text: '和小镇居民聊天 2 次', minDay: 2 },
];

// The day's tasks (created on first use each day).
export function ensureDaily(state) {
  const d = state.daily;
  if (d && d.day === state.day) return d;
  const rng = mulberry32((state.seed * 31 + state.day * 7877 + 5) >>> 0);
  const pool = POOL.filter((t) => t.minDay <= state.day);
  const tasks = [];
  while (tasks.length < 3 && pool.length) {
    const t = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    tasks.push({ id: t.id, stat: t.stat, n: t.n, text: t.text, done: false });
  }
  state.daily = { day: state.day, tasks, base: { ...stats(state) }, bonus: false };
  return state.daily;
}

export const progressOf = (state, t) => Math.min(t.n, (stats(state)[t.stat] ?? 0) - (state.daily.base[t.stat] ?? 0));

// Give rewards for newly finished tasks. Returns { done: [task], bonus: { clover, seed } | null }.
export function checkDaily(state) {
  const d = ensureDaily(state);
  const done = [];
  for (const t of d.tasks) {
    if (t.done || progressOf(state, t) < t.n) continue;
    t.done = true;
    state.clover += TASK_REWARD;
    done.push(t);
  }
  let bonus = null;
  if (!d.bonus && d.tasks.length && d.tasks.every((t) => t.done)) {
    d.bonus = true;
    state.clover += ALL_BONUS;
    const keys = Object.keys(CROPS);
    const seed = CROPS[keys[(state.day * 3) % keys.length]].seed;
    addItem(state.inventory, seed, 1, Infinity);
    bonus = { clover: ALL_BONUS, seed };
  }
  return { done, bonus };
}
