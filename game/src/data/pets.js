// Pet species (docs/02_宠物战斗与数值.md 第 2/6/7/9 节, docs/07 第 3 节).
// Pure data: no Phaser here, so tools/logic-test.mjs can import it in Node.
//
// base: level-1 stats at 3 stars, no nature, not evolved.
// skills: first two known at Lv1, third unlocks at Lv5 (docs/07 第 4 节).
// catchRate: base catch rate (docs/02 第 6 节).
// food: favourite food item id (bait ×1.5, affection +15).
export { ELEMENT_COLORS } from './elements.js';

export const PETS = [
  { id: 'acorn', name: '橡果刺猬', element: '森',
    base: { hp: 46, atk: 11, def: 12, spd: 9 }, skills: ['tackle', 'leafy', 'shell'],
    catchRate: 0.50, food: 'item_carrot', work: 'gather', explore: 'clear',
    evolution: { name: '橡冠刺猬', skill: 'acornrain', stone: 'stone_forest' } },
  { id: 'shark', name: '航海鲨', element: '水',
    base: { hp: 44, atk: 12, def: 10, spd: 11 }, skills: ['tackle', 'bubble', 'splash'],
    catchRate: 0.50, food: 'item_berry', work: 'fish', explore: 'wade',
    evolution: { name: '船长鲨', skill: 'vortex', stone: 'stone_water' } },
  { id: 'pup', name: '冰蓝小狼', element: '水',
    base: { hp: 40, atk: 12, def: 9, spd: 13 }, skills: ['tackle', 'bubble', 'puff'],
    catchRate: 0.35, food: 'item_sunflower', work: 'chop', explore: 'carry',
    evolution: { name: '霜原狼', skill: 'frostmist', stone: 'stone_water' } },
  { id: 'fox', name: '焰尾狐', element: '火', humanForm: 'fox_human',
    base: { hp: 42, atk: 13, def: 10, spd: 12 }, skills: ['tackle', 'ember', 'blaze'],
    catchRate: 0.50, food: 'item_pumpkin', work: 'mine', explore: 'light',
    evolution: { name: '灯焰狐', skill: 'foxlantern', stone: 'stone_fire' } },
  { id: 'starbear', name: '星星熊仔', element: '光',
    base: { hp: 52, atk: 10, def: 15, spd: 5 }, skills: ['tackle', 'twinkle', 'heal'],
    catchRate: 0.45, food: 'item_starwheat', work: 'water', explore: 'light',
    evolution: { name: '星梦熊', skill: 'cradle', stone: 'stone_light' } },
  { id: 'shadecat', name: '月影狐猫', element: '暗',
    base: { hp: 40, atk: 12, def: 9, spd: 14 }, skills: ['tackle', 'shadow', 'eclipse'],
    catchRate: 0.35, food: 'item_strawberry', work: 'treasure', explore: 'treasure',
    evolution: { name: '夜冕狐猫', skill: 'darkmoon', stone: 'stone_dark' } },
];

export const PET_BY_ID = Object.fromEntries(PETS.map((p) => [p.id, p]));

export const species = (id) => {
  const s = PET_BY_ID[id];
  if (!s) throw new Error(`unknown pet species: ${id}`);
  return s;
};

// Starter choice (docs/02 第 2 节).
export const STARTERS = ['acorn', 'shark', 'fox'];

export const petTextureKey = (id) => `pet_${id}`;
