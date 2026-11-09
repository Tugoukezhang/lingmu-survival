// Crops (T11) 【建议】 — the price table the plan left open ("待补：作物价格表").
// days = watered days until ripe. The five crops are the five pets' favourite
// foods, so farming feeds pet care (bait, feeding) as well as income.
// Profit per plot per day ≈ 5–9 clover (carrot 5, strawberry 5, sunflower 6, starwheat 5.8, pumpkin 8.6).
export const CROPS = {
  carrot:     { name: '萝卜',   seed: 'item_seed_carrot',     crop: 'item_carrot',     days: 3, seedPrice: 10, color: '#f08a3a' },
  strawberry: { name: '草莓',   seed: 'item_seed_strawberry', crop: 'item_strawberry', days: 4, seedPrice: 20, color: '#e8445a' },
  sunflower:  { name: '向日葵', seed: 'item_seed_sunflower',  crop: 'item_sunflower',  days: 5, seedPrice: 15, color: '#f5c84b' },
  starwheat:  { name: '星光麦', seed: 'item_seed_starwheat',  crop: 'item_starwheat',  days: 6, seedPrice: 25, color: '#e8d27a' },
  pumpkin:    { name: '南瓜',   seed: 'item_seed_pumpkin',    crop: 'item_pumpkin',    days: 7, seedPrice: 30, color: '#e07a2a' },
};
export const CROP_IDS = Object.keys(CROPS);
export const cropBySeed = (seedId) => CROP_IDS.find((k) => CROPS[k].seed === seedId) ?? null;

// Shipping box prices (clover per item). Items without a price can't be shipped (tools).
export const PRICES = {
  item_carrot: 25, item_strawberry: 40, item_sunflower: 45, item_starwheat: 60, item_pumpkin: 90,
  item_wood: 2, item_stone: 2, item_grass: 1, item_crystal: 20, item_cloth: 15,
  item_berry: 3, item_fish: 10, item_berry_roast: 8, item_fish_roast: 20, item_soup: 60,
  item_net_grass: 6, item_net_vine: 30, item_torch: 4, item_campfire: 10,
  item_evo_forest: 40, item_evo_water: 40, item_evo_fire: 40, item_evo_light: 40, item_evo_dark: 40,
  item_seed_carrot: 5, item_seed_strawberry: 10, item_seed_sunflower: 7, item_seed_starwheat: 12, item_seed_pumpkin: 15,
};
