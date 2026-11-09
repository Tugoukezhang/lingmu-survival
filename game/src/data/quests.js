// Town quests (T13) 【建议】. need: items to hand in, or { party: species } to show a pet.
// after: quest that must be done first. reward: clover / items / recipe unlock / friendship.
export const QUESTS = [
  { id: 'granny_carrot', npc: 'granny', title: '萝卜汤', ask: '奶奶想做萝卜汤，能帮我带 5 根萝卜来吗？', thanks: '真水灵！这些四叶草你收着。',
    need: { item_carrot: 5 }, reward: { clover: 60, friend: 10 } },
  { id: 'granny_fish', npc: 'granny', after: 'granny_carrot', title: '鲜鱼汤底', ask: '汤底还差点鲜味……3 条鱼就够了。', thanks: '谢谢！奶奶把蔬菜汤的做法教给你吧。',
    need: { item_fish: 3 }, reward: { clover: 30, recipe: 'soup', friend: 10 } },
  { id: 'ali_wood', npc: 'ali', title: '工坊的木料', ask: '工坊的屋顶漏雨了，帮我弄 20 根木材？', thanks: '够用了！这是工钱。',
    need: { item_wood: 20 }, reward: { clover: 80, friend: 10 } },
  { id: 'ali_bag', npc: 'ali', after: 'ali_wood', title: '结实的背包', ask: '想不想要个大背包？给我 10 块石头和 2 块雾晶当材料。', thanks: '图纸给你，布料备齐了就能在家园做大背包。',
    need: { item_stone: 10, item_crystal: 2 }, reward: { recipe: 'bigbag', friend: 10 } },
  { id: 'lumi_shadecat', npc: 'lumi', title: '月影狐猫观察', ask: '我在研究月影狐猫！能带一只在队伍里来给我看看吗？', thanks: '好漂亮的毛色！这本技能书送你。',
    need: { party: 'shadecat' }, reward: { clover: 40, items: { item_book_shadow: 1 }, friend: 10 } },
  { id: 'lumi_wish', npc: 'lumi', title: '焰尾狐的心愿', ask: '传说起雾的夜里会出现狐火灯芯……集齐 3 个，我能做成化形铃！', thanks: '做好了！把化形铃交给进化后、好感 100 的焰尾狐吧。',
    need: { item_foxwick: 3 }, reward: { items: { item_fox_bell: 1 }, friend: 15 } },
];
export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

// The general store (granny). Skill books rotate: 2 per day.
export const SHOP = [
  { id: 'item_seed_carrot', price: 10 }, { id: 'item_seed_strawberry', price: 20 }, { id: 'item_seed_sunflower', price: 15 },
  { id: 'item_seed_starwheat', price: 25 }, { id: 'item_seed_pumpkin', price: 30 },
  { id: 'item_cloth', price: 30 }, { id: 'item_fish_roast', price: 35 }, { id: 'item_berry', price: 5 }, { id: 'item_torch', price: 15 },
];
export const SHOP_BOOKS = ['item_book_bubble', 'item_book_ember', 'item_book_leafy', 'item_book_twinkle', 'item_book_shadow', 'item_book_heal', 'item_book_shell', 'item_book_puff'];
export const BOOK_PRICE = 80;
