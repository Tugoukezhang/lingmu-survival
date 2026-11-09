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
  item_hoe: { name: '锄头', tag: '工具', tool: true, icon: 'item_hoe', desc: '在家园农田开垦土地。', quip: '一下一下，松松土。' },
  item_can: { name: '水壶', tag: '工具', tool: true, icon: 'item_can', desc: '给作物浇水。每块地每天浇一次，\n不浇水作物就不长。', quip: '咕嘟咕嘟～' },
  item_bigbag: { name: '大背包', tag: '工具', tool: true, icon: 'item_bigbag', desc: '背在身上，背包 +8 格（20 → 28）。', quip: '能装好多好多。' },
  item_tent: { name: '帐篷', tag: '工具', tool: true, icon: 'item_tent', desc: '在营火旁按互动，可以睡到天亮。\n能反复使用，倒下也不会丢。', quip: '野外的小小家。' },
  item_torch: { name: '火把', tag: '照明', icon: 'item_torch', desc: '在背包里「使用」点亮，\n身边照亮 2 格，烧 3 小时。', quip: '小小的光。' },

  // growth (M3): evolution stones, skill books, 化形 items
  item_evo_forest: { name: '森之石', tag: '进化石', icon: 'item_evo_forest', desc: '森属性宠物的进化石。\n等级 12、好感 30 时可以进化。', quip: '里面有光在转。' },
  item_evo_water: { name: '水之石', tag: '进化石', icon: 'item_evo_water', desc: '水属性宠物的进化石。\n等级 12、好感 30 时可以进化。', quip: '里面有光在转。' },
  item_evo_fire: { name: '火之石', tag: '进化石', icon: 'item_evo_fire', desc: '火属性宠物的进化石。\n等级 12、好感 30 时可以进化。', quip: '里面有光在转。' },
  item_evo_light: { name: '光之石', tag: '进化石', icon: 'item_evo_light', desc: '光属性宠物的进化石。\n等级 12、好感 30 时可以进化。', quip: '里面有光在转。' },
  item_evo_dark: { name: '暗之石', tag: '进化石', icon: 'item_evo_dark', desc: '暗属性宠物的进化石。\n等级 12、好感 30 时可以进化。', quip: '里面有光在转。' },
  item_book_bubble: { name: '技能书·泡泡弹', tag: '技能书', icon: 'item_book', book: 'bubble', desc: '学会「泡泡弹」（水）。\n本属性或状态技能才能学；\n不能替换进化技能。', quip: '翻开就会了。' },
  item_book_ember: { name: '技能书·小火苗', tag: '技能书', icon: 'item_book', book: 'ember', desc: '学会「小火苗」（火）。\n本属性或状态技能才能学；\n不能替换进化技能。', quip: '翻开就会了。' },
  item_book_leafy: { name: '技能书·叶片旋风', tag: '技能书', icon: 'item_book', book: 'leafy', desc: '学会「叶片旋风」（森）。\n本属性或状态技能才能学；\n不能替换进化技能。', quip: '翻开就会了。' },
  item_book_twinkle: { name: '技能书·闪闪光', tag: '技能书', icon: 'item_book', book: 'twinkle', desc: '学会「闪闪光」（光）。\n本属性或状态技能才能学；\n不能替换进化技能。', quip: '翻开就会了。' },
  item_book_shadow: { name: '技能书·暗影弹', tag: '技能书', icon: 'item_book', book: 'shadow', desc: '学会「暗影弹」（暗）。\n本属性或状态技能才能学；\n不能替换进化技能。', quip: '翻开就会了。' },
  item_book_heal: { name: '技能书·治愈之歌', tag: '技能书', icon: 'item_book', book: 'heal', desc: '学会「治愈之歌」（状态）。\n本属性或状态技能才能学；\n不能替换进化技能。', quip: '翻开就会了。' },
  item_book_shell: { name: '技能书·刺球', tag: '技能书', icon: 'item_book', book: 'shell', desc: '学会「刺球」（状态）。\n本属性或状态技能才能学；\n不能替换进化技能。', quip: '翻开就会了。' },
  item_book_puff: { name: '技能书·毛茸茸', tag: '技能书', icon: 'item_book', book: 'puff', desc: '学会「毛茸茸」（状态）。\n本属性或状态技能才能学；\n不能替换进化技能。', quip: '翻开就会了。' },
  item_foxwick: { name: '狐火灯芯', tag: '材料', icon: 'item_foxwick', desc: '只在起雾的夜里出现的狐火。\n小镇的露米想要 3 个。', quip: '摸起来不烫。' },
  item_fox_bell: { name: '化形铃', tag: '道具', icon: 'item_fox_bell', desc: '让进化后、好感 100 的焰尾狐\n学会化形。在照顾面板使用。', quip: '叮铃——' },

  // food (icons are code-drawn placeholders until the art arrives)
  // farm crops (T11)
  item_strawberry: { name: '草莓', tag: '作物', icon: 'item_strawberry', food: 12, desc: '甜甜的草莓，月影狐猫最爱。\n饱食 +12　出货 40', quip: '一口一个！' },
  item_pumpkin: { name: '南瓜', tag: '作物', icon: 'item_pumpkin', food: 25, desc: '又大又圆的南瓜，焰尾狐最爱。\n饱食 +25　出货 90', quip: '抱都抱不动。' },
  item_sunflower: { name: '向日葵', tag: '作物', icon: 'item_sunflower', desc: '冰蓝小狼最爱的花。\n可以喂宠物、当诱饵。出货 45', quip: '一直朝着太阳。' },
  item_starwheat: { name: '星光麦', tag: '作物', icon: 'item_starwheat', desc: '麦穗会发微光，星星熊仔最爱。\n可以喂宠物、当诱饵。出货 60', quip: '晚上也亮晶晶。' },
  item_seed_carrot: { name: '萝卜种子', tag: '种子', icon: 'item_seed_carrot', desc: '浇水 3 天成熟。\n在开垦好的农田上播种。', quip: '小小一粒。' },
  item_seed_strawberry: { name: '草莓种子', tag: '种子', icon: 'item_seed_strawberry', desc: '浇水 4 天成熟。', quip: '会结红果子。' },
  item_seed_sunflower: { name: '向日葵种子', tag: '种子', icon: 'item_seed_sunflower', desc: '浇水 5 天成熟。', quip: '会长得很高。' },
  item_seed_starwheat: { name: '星光麦种子', tag: '种子', icon: 'item_seed_starwheat', desc: '浇水 6 天成熟。', quip: '摸起来暖暖的。' },
  item_seed_pumpkin: { name: '南瓜种子', tag: '种子', icon: 'item_seed_pumpkin', desc: '浇水 7 天成熟。\n最值钱的作物。', quip: '耐心等等。' },

  item_fish: { name: '鱼', tag: '食物', icon: 'item_fish', food: 8, desc: '航海鲨打工钓来的鱼。\n饱食 +8　出货 10', quip: '还在扑腾。' },
  item_berry: { name: '浆果', tag: '食物', icon: 'item_berry', food: 10,
    desc: '林间随手摘的小浆果。\n饱食 +10', quip: '酸酸甜甜！' },
  item_carrot: { name: '萝卜', tag: '作物', icon: 'item_carrot', food: 15,
    desc: '脆生生的萝卜，橡果刺猬最爱。\n饱食 +15　出货 25', quip: '咔嚓咔嚓～' },
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
