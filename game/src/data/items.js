// Item definitions. Only the items that exist so far; more arrive with
// crafting (T09) and farming. icon = texture key loaded in BootScene.
export const ITEMS = {
  item_net_grass: { name: '草编网', tag: '工具', icon: 'item_net_grass', netMult: 1.0,
    desc: '用干草和木棍编的捕宠网。\n倍率 ×1.0', quip: '轻轻一兜，交个朋友！' },
  item_net_vine: { name: '藤编网', tag: '工具', icon: 'item_net_vine', netMult: 1.5,
    desc: '藤蔓和布条编成，网口缠着发光的雾晶。\n倍率 ×1.5', quip: '稀有伙伴也跑不掉～' },
  item_campfire: { name: '营火', tag: '装置', icon: 'item_campfire',
    desc: '放在地上照亮半径 4 格，\n雾怪不敢靠近。', quip: '夜晚的安心小角落。' },
};

export const item = (id) => {
  const it = ITEMS[id];
  if (!it) throw new Error(`unknown item: ${id}`);
  return it;
};
