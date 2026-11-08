// Elements and type matchups (docs/02_宠物战斗与数值.md 第 1 节).
export const ELEMENTS = ['森', '水', '火', '光', '暗'];
export const NORMAL = '普通';

export const ELEMENT_COLORS = { 森: '#4f7d3a', 水: '#3d7fb8', 火: '#d9572b', 光: '#c99a1e', 暗: '#7a4aa0' };

// 水克火、火克森、森克水 (×1.5, reverse ×0.67); 光 and 暗 hit each other ×1.5.
const BEATS = { 水: '火', 火: '森', 森: '水' };

export function elementMultiplier(attackEl, defendEl) {
  if (!attackEl || attackEl === NORMAL || !defendEl) return 1;
  if (BEATS[attackEl] === defendEl) return 1.5;
  if (BEATS[defendEl] === attackEl) return 0.67;
  if ((attackEl === '光' && defendEl === '暗') || (attackEl === '暗' && defendEl === '光')) return 1.5;
  return 1;
}
