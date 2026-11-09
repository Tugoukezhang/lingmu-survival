// Crafting recipes (docs/06 第 3 节). station: where it can be made —
// 'anywhere' (field crafting, T19), 'workbench' (home, T22/T11), 'campfire' (cooking).
export const RECIPES = [
  { id: 'axe', out: 'item_axe', n: 1, station: 'anywhere', cost: { item_wood: 3, item_stone: 2 } },
  { id: 'pickaxe', out: 'item_pickaxe', n: 1, station: 'anywhere', cost: { item_wood: 3, item_stone: 3 } },
  { id: 'torch', out: 'item_torch', n: 1, station: 'anywhere', cost: { item_wood: 2, item_grass: 2 } },
  { id: 'campfire', out: 'item_campfire', n: 1, station: 'anywhere', cost: { item_wood: 4, item_stone: 4 } },
  { id: 'net_grass', out: 'item_net_grass', n: 1, station: 'anywhere', cost: { item_grass: 3, item_wood: 2 } },
  { id: 'net_vine', out: 'item_net_vine', n: 1, station: 'anywhere', cost: { item_cloth: 1, item_grass: 3, item_crystal: 1 } },
  // home workbench (for now: anywhere on the home island)
  { id: 'tent', out: 'item_tent', n: 1, station: 'workbench', cost: { item_cloth: 4, item_wood: 6 } },
  // furniture (T15): made at the home workbench
  { id: 'furn_chair', out: 'item_furn_chair', n: 1, station: 'workbench', cost: { item_wood: 4 } },
  { id: 'furn_table', out: 'item_furn_table', n: 1, station: 'workbench', cost: { item_wood: 6 } },
  { id: 'furn_plant', out: 'item_furn_plant', n: 1, station: 'workbench', cost: { item_grass: 3, item_stone: 2 } },
  { id: 'furn_rug', out: 'item_furn_rug', n: 1, station: 'workbench', cost: { item_cloth: 3 } },
  { id: 'furn_shelf', out: 'item_furn_shelf', n: 1, station: 'workbench', cost: { item_wood: 8 } },
  { id: 'furn_lamp', out: 'item_furn_lamp', n: 1, station: 'workbench', cost: { item_wood: 2, item_crystal: 1 } },
  // taught by town residents (T13): locked until the quest reward unlocks them
  { id: 'soup', out: 'item_soup', n: 1, station: 'workbench', unlock: 'soup', teacher: '铃奶奶', cost: { item_carrot: 2, item_pumpkin: 1 } },
  { id: 'bigbag', out: 'item_bigbag', n: 1, station: 'workbench', unlock: 'bigbag', teacher: '阿栗', cost: { item_cloth: 6, item_crystal: 2 } },
];

export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
