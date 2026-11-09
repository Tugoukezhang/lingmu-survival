// Residents of 风铃小镇 (T13) 【建议】— original characters; art is code-drawn
// until the owner's illustrations arrive. Friendship 0–100.
export const NPCS = {
  granny: {
    name: '铃奶奶', role: '杂货铺老板', shop: true,
    look: { skin: '#ffe2c8', hair: '#e8e2d8', cloth: '#c96a7a', accent: '#f5c84b' },
    loves: ['item_soup'], likes: ['item_strawberry', 'item_pumpkin'], dislikes: ['item_stone'],
    lines: {
      low: ['哎呀，是新来的岛主吧？缺什么就来我这儿看看。', '风铃响了，今天会是好天气。'],
      mid: ['你种的萝卜真水灵，奶奶都想讨两根了。', '晚上起雾就早点回家，别让宠物们担心。'],
      high: ['孩子，有你在，小镇热闹多了。', '奶奶给你留了块小点心——开玩笑的，但心意是真的！'],
    },
  },
  ali: {
    name: '阿栗', role: '木匠',
    look: { skin: '#f6d2b0', hair: '#8a5a36', cloth: '#6fae4a', accent: '#b07a48' },
    loves: ['item_fish_roast'], likes: ['item_carrot', 'item_crystal'], dislikes: ['item_grass'],
    lines: {
      low: ['嘿！要修东西找我阿栗，木头越多越好。', '吊桥那头的断桥？总有一天我会把它修好。'],
      mid: ['你砍的木头纹路很好，是雾林那边的吧？', '下次去远征，帮我留意雾晶，做工具用得上。'],
      high: ['兄弟，以后家园要扩建，包在我身上！', '我新做的锯子，第一刀想用在你家的柱子上。'],
    },
  },
  lumi: {
    name: '露米', role: '宠物研究员',
    look: { skin: '#ffe6d0', hair: '#7a4aa0', cloth: '#3d7fb8', accent: '#fff4a8' },
    loves: ['item_starwheat'], likes: ['item_crystal', 'item_strawberry'], dislikes: ['item_fish'],
    lines: {
      low: ['你好！我在研究浮岛上的宠物……你的伙伴看起来很精神呢。', '听说夜里的雾林会出现狐火，好想亲眼看看。'],
      mid: ['宠物好感到 100，会和你有特别的羁绊哦。', '同一种宠物也有星级之分，多抓几只就懂啦。'],
      high: ['你和宠物之间的感情，是我见过最好的样本！', '焰尾狐的化形传说……也许你能让它成真。'],
    },
  },
};
export const NPC_IDS = Object.keys(NPCS);

// Gift friendship 【建议】
export const GIFT = { love: 10, like: 5, neutral: 2, dislike: -3 };
export const TALK_GAIN = 1;
