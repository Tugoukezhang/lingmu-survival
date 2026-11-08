// Natures (docs/07 第 6 节): one stat ×1.1, another ×0.9; 温和 changes nothing.
// 12 combinations of the 4 stats + 温和 = 13. Names are placeholders.
export const NATURES = {
  gentle:   { name: '温和', up: null, down: null },
  brave:    { name: '勇敢', up: 'atk', down: 'spd' },
  reckless: { name: '莽撞', up: 'atk', down: 'def' },
  feisty:   { name: '好斗', up: 'atk', down: 'hp' },
  relaxed:  { name: '悠闲', up: 'def', down: 'spd' },
  careful:  { name: '慎重', up: 'def', down: 'atk' },
  tough:    { name: '坚韧', up: 'def', down: 'hp' },
  hasty:    { name: '急躁', up: 'spd', down: 'def' },
  timid:    { name: '胆小', up: 'spd', down: 'atk' },
  lively:   { name: '活泼', up: 'spd', down: 'hp' },
  steady:   { name: '稳重', up: 'hp', down: 'atk' },
  greedy:   { name: '贪吃', up: 'hp', down: 'def' },
  easygoing:{ name: '憨厚', up: 'hp', down: 'spd' },
};
export const NATURE_IDS = Object.keys(NATURES);
