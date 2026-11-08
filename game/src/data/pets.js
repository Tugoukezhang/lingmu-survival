// Pet roster (docs/02_宠物战斗与数值.md 第 2 节). Only display data for now;
// stats, skills and growth arrive with T04.
export const PETS = [
  { id: 'acorn', name: '橡果刺猬', element: '森' },
  { id: 'shark', name: '航海鲨', element: '水' },
  { id: 'pup', name: '冰蓝小狼', element: '水' },
  { id: 'fox', name: '焰尾狐', element: '火', humanForm: 'fox_human' },
  { id: 'starbear', name: '星星熊仔', element: '光' },
  { id: 'shadecat', name: '月影狐猫', element: '暗' },
];

export const ELEMENT_COLORS = { 森: '#4f7d3a', 水: '#3d7fb8', 火: '#d9572b', 光: '#c99a1e', 暗: '#7a4aa0' };

export const petTextureKey = (id) => `pet_${id}`;
