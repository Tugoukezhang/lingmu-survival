// Battle skills (docs/02 第 3 节 + docs/07 第 3 节 evolution skills).
// element: 森/水/火/光/暗, '普通', or null for pure status skills.
// uses: times per battle, null = unlimited.
// effects (applied after damage, if any):
//   { type: 'heal', pct }                      heal self by pct of max HP
//   { type: 'stat', target, stat, mult, turns } temporary multiplier on self/foe
export const SKILLS = {
  tackle:   { name: '蹭蹭',     element: '普通', power: 30, uses: null },
  leafy:    { name: '叶片旋风', element: '森', power: 45, uses: null },
  bubble:   { name: '泡泡弹',   element: '水', power: 45, uses: null },
  ember:    { name: '小火苗',   element: '火', power: 45, uses: null },
  twinkle:  { name: '闪闪光',   element: '光', power: 45, uses: null },
  shadow:   { name: '暗影弹',   element: '暗', power: 45, uses: null },
  splash:   { name: '大浪',     element: '水', power: 70, uses: 3 },
  blaze:    { name: '火焰尾',   element: '火', power: 70, uses: 3 },
  starfall: { name: '星落',     element: '光', power: 70, uses: 3 },
  eclipse:  { name: '月蚀',     element: '暗', power: 70, uses: 3 },
  heal:     { name: '治愈之歌', element: null, power: 0, uses: 2, effects: [{ type: 'heal', pct: 0.3 }] },
  shell:    { name: '刺球',     element: null, power: 0, uses: 2, effects: [{ type: 'stat', target: 'self', stat: 'def', mult: 1.5, turns: 3 }] },
  puff:     { name: '毛茸茸',   element: null, power: 0, uses: 2, effects: [{ type: 'stat', target: 'foe', stat: 'atk', mult: 0.75, turns: 3 }] },

  // evolution skills (4th slot, cannot be replaced by skill books)
  acornrain: { name: '橡果雨',   element: '森', power: 85, uses: 2, evolution: true },
  cradle:    { name: '星梦摇篮', element: null, power: 0, uses: 2, evolution: true,
               effects: [{ type: 'stat', target: 'self', stat: 'def', mult: 1.5, turns: 3 }, { type: 'heal', pct: 0.15 }] },
  vortex:    { name: '漩涡',     element: '水', power: 85, uses: 2, evolution: true },
  frostmist: { name: '霜雾',     element: '水', power: 40, uses: 2, evolution: true,
               effects: [{ type: 'stat', target: 'foe', stat: 'atk', mult: 0.75, turns: 3 }] },
  foxlantern:{ name: '狐火灯笼', element: '火', power: 85, uses: 2, evolution: true },
  darkmoon:  { name: '暗月',     element: '暗', power: 85, uses: 2, evolution: true },
};

export const skill = (id) => {
  const s = SKILLS[id];
  if (!s) throw new Error(`unknown skill: ${id}`);
  return s;
};
