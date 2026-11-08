// Item definitions. Only the items that exist so far; more arrive with
// crafting (T09) and farming. icon = texture key (loaded or drawn in BootScene).
// food = fullness restored, heal = health restored (docs/06 第 1 节).
export const ITEMS = {
  item_net_grass: { name: '草编网', tag: '捕捉', icon: 'item_net_grass', netMult: 1.0,
    desc: '用干草和木棍编的捕宠网。\n倍率 ×1.0', quip: '轻轻一兜，交个朋友！' },
  item_net_vine: { name: '藤编网', tag: '捕捉', icon: 'item_net_vine', netMult: 1.5,
    desc: '藤蔓和布条编成，网口缠着发光的雾晶。\n倍率 ×1.5', quip: '稀有伙伴也跑不掉～' },
  item_campfire: { name: '营火', tag: '装置', icon: 'item_campfire',
    desc: '在远征岛上「使用」放到身边，\n照亮 4 格，雾怪不敢靠近。\n能烧 2 小时，每添 1 木材 +2 小时。', quip: '夜晚的安心小角落。' },

  // materials (code-drawn placeholder icons)
  item_wood: { name: '木材', tag: '材料', icon: 'item_wood', desc: '砍树得到的木头。\n徒手 1 个，用石斧 3 个。', quip: '做什么都用得上。' },
  item_stone: { name: '石头', tag: '材料', icon: 'item_stone', desc: '敲石块得到的石头。\n徒手 1 个，用石镐 3 个。', quip: '沉甸甸的。' },
  item_grass: { name: '草', tag: '材料', icon: 'item_grass', desc: '一把结实的干草，\n能编网、扎火把。', quip: '软软的。' },
  item_crystal: { name: '雾晶', tag: '材料', icon: 'item_crystal', desc: '雾林里发光的晶石，\n要用石镐才能敲下来。', quip: '里面好像有雾在转。' },
  item_cloth: { name: '布', tag: '材料', icon: 'item_cloth', desc: '结实的布料，远征岛的宝箱里能找到。\n做帐篷要 4 块。', quip: '缝缝补补。' },

  // tools are kept when fainting (docs/06 第 2 节)
  item_axe: { name: '石斧', tag: '工具', tool: true, icon: 'item_axe', desc: '砍树一次得到 3 个木材。', quip: '咚、咚、咚！' },
  item_pickaxe: { name: '石镐', tag: '工具', tool: true, icon: 'item_pickaxe', desc: '敲石头一次得到 3 个石头，\n还能敲下雾晶。', quip: '叮！' },
  item_tent: { name: '帐篷', tag: '工具', tool: true, icon: 'item_tent', desc: '在营火旁按互动，可以睡到天亮。\n能反复使用，倒下也不会丢。', quip: '野外的小小家。' },
  item_torch: { name: '火把', tag: '照明', icon: 'item_torch', desc: '在背包里「使用」点亮，\n身边照亮 2 格，烧 3 小时。', quip: '小小的光。' },

  // food (icons are code-drawn placeholders until the art arrives)
  item_berry: { name: '浆果', tag: '食物', icon: 'item_berry', food: 10,
    desc: '林间随手摘的小浆果。\n饱食 +10', quip: '酸酸甜甜！' },
  item_carrot: { name: '萝卜', tag: '食物', icon: 'item_carrot', food: 15,
    desc: '脆生生的萝卜，橡果刺猬最爱。\n饱食 +15', quip: '咔嚓咔嚓～' },
  item_berry_roast: { name: '烤浆果', tag: '食物', icon: 'item_berry_roast', food: 20, heal: 5,
    desc: '在营火旁烤得软软的浆果。\n饱食 +20　生命 +5', quip: '暖乎乎的。' },
  item_fish_roast: { name: '烤鱼', tag: '食物', icon: 'item_fish_roast', food: 30, heal: 10,
    desc: '外焦里嫩的烤鱼。\n饱食 +30　生命 +10', quip: '航海鲨看了想哭。' },
  item_soup: { name: '蔬菜汤', tag: '食物', icon: 'item_soup', food: 40, heal: 20,
    desc: '萝卜和南瓜熬的浓汤。\n饱食 +40　生命 +20', quip: '一碗下去，元气满满。' },
};

export const item = (id) => {
  const it = ITEMS[id];
  if (!it) throw new Error(`unknown item: ${id}`);
  return it;
};
