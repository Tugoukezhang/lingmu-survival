import { COLORS } from '../config.js';
import { PETS, ELEMENT_COLORS, petTextureKey } from '../data/pets.js';
import { createStarter, calcStats } from '../systems/petMath.js';
import { woodPanel, plaqueButton, capsuleButton, slot, tag, text } from './widgets.js';

// Demo panels for T03. They show the visual language and the stack
// behaviour; real data (inventory, pet stats) arrives with later tasks.

const DEMO_ITEMS = [
  { key: 'item_net_grass', name: '草编网', tag: '工具', count: 3, desc: '用干草和木棍编的捕宠网。\n倍率 ×1.0', quip: '轻轻一兜，交个朋友！' },
  { key: 'item_net_vine', name: '藤编网', tag: '工具', count: 1, desc: '藤蔓和布条编成，网口缠着发光的雾晶。\n倍率 ×1.5', quip: '稀有伙伴也跑不掉～' },
  { key: 'item_campfire', name: '营火', tag: '装置', count: 2, desc: '放在地上照亮半径 4 格，\n雾怪不敢靠近。', quip: '夜晚的安心小角落。' },
];

function closeBtn(scene, stack, w, h) {
  return plaqueButton(scene, w / 2 - 16, -h / 2 + 16, { icon: 'close', onClick: () => stack.pop(), name: 'close' });
}

export function bagPanel(scene, stack) {
  const w = 760, h = 420;
  const c = woodPanel(scene, w, h);
  c.add(text(scene, -w / 2 + 36, -h / 2 + 22, '背包', 26));

  // left: item detail card
  const card = woodPanel(scene, 250, 320, { radius: 20, border: 5 });
  card.setPosition(-w / 2 + 160, 22);
  c.add(card);
  const icon = scene.add.image(-60, -95, DEMO_ITEMS[0].key).setScale(0.62);
  const nameT = text(scene, 10, -128, '', 22);
  const tagC = scene.add.container(0, 0);
  const descT = text(scene, -100, -40, '', 14, { bold: false, wrap: 200, lineSpacing: 4 });
  const quipT = text(scene, -100, 52, '', 14, { color: '#9a8468', bold: false, wrap: 200 });
  card.add([icon, nameT, tagC, descT, quipT]);
  card.add(capsuleButton(scene, 0, 118, '使用', { w: 150, h: 46, onClick: () => scene.showToast(`使用了 ${current.name}（演示）`), name: 'use' }));

  let current;
  const slots = [];
  const select = (i) => {
    current = DEMO_ITEMS[i];
    icon.setTexture(current.key);
    nameT.setText(current.name);
    tagC.removeAll(true); tagC.add(tag(scene, 10 + 30, -84, current.tag));
    descT.setText(current.desc);
    quipT.setText(`[${current.quip}]`);
    slots.forEach((s, k) => s.setSelected(k === i));
  };

  // right: 5x4 grid
  const gx = -w / 2 + 330, gy = -h / 2 + 96, size = 66, gap = 80;
  for (let i = 0; i < 20; i++) {
    const item = DEMO_ITEMS[i];
    const s = slot(scene, gx + (i % 5) * gap, gy + Math.floor(i / 5) * gap, {
      size, iconKey: item?.key, count: item?.count, onClick: item ? () => select(i) : undefined, name: item ? `slot-${item.key}` : undefined,
    });
    slots.push(s);
    c.add(s);
  }
  select(0);
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

export function petsPanel(scene, stack) {
  const w = 760, h = 420;
  const c = woodPanel(scene, w, h);
  c.add(text(scene, -w / 2 + 36, -h / 2 + 22, '宠物伙伴', 26));
  PETS.forEach((p, i) => {
    const x = -w / 2 + 130 + (i % 3) * 250, y = -60 + Math.floor(i / 3) * 170;
    const card = scene.add.graphics();
    card.fillStyle(COLORS.creamDark).fillRoundedRect(x - 105, y - 70, 210, 150, 18);
    const img = scene.add.image(x - 45, y + 6, petTextureKey(p.id));
    img.setScale(120 / img.height);
    const nameT = text(scene, x + 10, y - 40, p.name, 18);
    const el = tag(scene, x + 40, y - 2, `${p.element}属性`, Phaser.Display.Color.HexStringToColor(ELEMENT_COLORS[p.element]).color);
    // demo: a fresh Lv1, 3-star, 温和 pet; the real party comes with T07/T08
    const st = calcStats(createStarter(p.id, { uid: `demo-${p.id}` }));
    const lv = text(scene, x + 10, y + 20, 'Lv.1', 15);
    const stats = text(scene, x + 10, y + 42, `体${st.hp} 攻${st.atk}
防${st.def} 速${st.spd}`, 14, { bold: false, lineSpacing: 2 });
    c.add([card, img, nameT, el, lv, stats]);
  });
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

export function settingsPanel(scene, stack) {
  const w = 460, h = 320;
  const c = woodPanel(scene, w, h);
  c.add(text(scene, 0, -h / 2 + 40, '设置', 26, { ox: 0.5, oy: 0.5 }));
  c.add(text(scene, 0, -30, '音乐 / 音效 / 画质等选项以后加入', 16, { ox: 0.5, oy: 0.5, bold: false }));
  c.add(capsuleButton(scene, 0, 60, '重新开始', {
    w: 180, style: 'yellow', name: 'restart',
    onClick: () => stack.push('confirm', (s, st) => confirmDialog(s, st, '确定要重新开始吗？\n（演示：不会真的清除进度）')),
  }));
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

export function confirmDialog(scene, stack, message) {
  const w = 400, h = 230;
  const c = woodPanel(scene, w, h);
  c.add(plaqueButton(scene, -w / 2 + 16, -h / 2 + 16, { icon: 'back', onClick: () => stack.pop(), name: 'back' }));
  c.add(text(scene, 0, -28, message, 18, { ox: 0.5, oy: 0.5, align: 'center', bold: false, lineSpacing: 6 }));
  c.add(capsuleButton(scene, -80, 62, '取消', { w: 130, style: 'yellow', onClick: () => stack.pop(), name: 'cancel' }));
  c.add(capsuleButton(scene, 80, 62, '确定', { w: 130, onClick: () => { stack.clear(); scene.showToast('已确认（演示）'); }, name: 'ok' }));
  return c;
}
