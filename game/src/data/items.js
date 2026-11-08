// Item definitions. Only the items that exist so far; more arrive with
// crafting (T09) and farming. icon = texture key (loaded or drawn in BootScene).
// food = fullness restored, heal = health restored (docs/06 第 1 节).
export const ITEMS = {
  item_net_grass: { name: '草编网', tag: '工具', icon: 'item_net_grass', netMult: 1.0,
    desc: '用干草和木棍编的捕宠网。\n倍率 ×1.0', quip: '轻轻一兜，交个朋友！' },
  item_net_vine: { name: '藤编网', tag: '工具', icon: 'item_net_vine', netMult: 1.5,
    desc: '藤蔓和布条编成，网口缠着发光的雾晶。\n倍率 ×1.5', quip: '稀有伙伴也跑不掉～' },
  item_campfire: { name: '营火', tag: '装置', icon: 'item_campfire',
    desc: '放在地上照亮半径 4 格，\n雾怪不敢靠近。', quip: '夜晚的安心小角落。' },

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
