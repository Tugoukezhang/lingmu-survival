// New-player guide (T42): a short chain of "next goal" hints, plus a few
// one-time tips. Progress counters live in state.flags.stats and are bumped by
// the systems themselves (gather, craft, battle, travel, sleep), so the guide
// only reads them. Pure functions, no Phaser.
import { countOf } from './inventory.js';

// Each goal: done when stat[key] grew by n since the goal became active
// (or a custom check). Order matters.
export const GOALS = [
  { id: 'depart', text: '去出生点正下方的飞艇码头，坐飞艇出发', stat: 'trips', n: 1 },
  { id: 'gather', text: '在岛上采集 3 次：走到树、石头、草丛旁按「采集」', stat: 'gather', n: 3 },
  { id: 'axe', text: '点右上「制作」，做一把石斧（砍树一次得 3 木材）', check: (s) => countOf(s.inventory, 'item_axe') > 0 },
  { id: 'battle', text: '碰一碰野生宠物，打一场（打弱了还能扔网抓它）', stat: 'battles', n: 1 },
  { id: 'return', text: '20 点会起雾——天黑前回着陆点坐飞艇回家', stat: 'returns', n: 1, alt: { stat: 'campSleeps', n: 1 } },
  { id: 'sleep', text: '走到家门口的帐篷，睡觉开始新的一天', stat: 'sleeps', n: 1 },
];

export const stats = (state) => (state.flags.stats = state.flags.stats ?? {});
export const bump = (state, key, n = 1) => { const s = stats(state); s[key] = (s[key] ?? 0) + n; };

export function guideState(state) {
  const f = state.flags;
  f.guide = f.guide ?? { step: 0, base: { ...stats(state) }, off: false };
  return f.guide;
}

export const currentGoal = (state) => (guideState(state).off ? null : GOALS[guideState(state).step] ?? null);

const grew = (state, g, key, n) => (stats(state)[key] ?? 0) - (g.base[key] ?? 0) >= n;

// Advance the guide. Returns the goal just completed (or null).
export function checkGuide(state) {
  const g = guideState(state);
  const goal = GOALS[g.step];
  if (!goal || g.off) return null;
  const done = goal.check ? goal.check(state) : grew(state, g, goal.stat, goal.n) || (goal.alt && grew(state, g, goal.alt.stat, goal.alt.n));
  if (!done) return null;
  g.step += 1;
  g.base = { ...stats(state) };
  return goal;
}

export const guideDone = (state) => guideState(state).step >= GOALS.length;
export function setGuideOff(state, off) { guideState(state).off = off; }

// One-time tips. Returns the tip text the first time its condition is true.
export const TIPS = [
  { id: 'night', when: (s) => s.player.area === 'expedition' && (s.clock >= 20 * 60 || s.clock < 6 * 60), text: '起雾了！雾怪会在你脚下画红圈——看到就走开。站在营火或火把的光里最安全。' },
  { id: 'hungry', when: (s) => s.player.hunger <= 30, text: '肚子饿了：打开背包，点食物再点「使用」就能吃。' },
  { id: 'lowhp', when: (s) => s.player.area === 'expedition' && s.player.hp <= 40, text: '生命不多了：吃烤鱼、蔬菜汤能回血；倒下会把背包里的东西掉在岛上。' },
];

export function nextTip(state) {
  const seen = (state.flags.tips = state.flags.tips ?? {});
  const tip = TIPS.find((t) => !seen[t.id] && t.when(state));
  if (!tip) return null;
  seen[tip.id] = true;
  return tip.text;
}
