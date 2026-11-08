import { COLORS } from '../config.js';
import { ELEMENT_COLORS, petTextureKey, species } from '../data/pets.js';
import { ITEMS } from '../data/items.js';
import { calcStats, displayName } from '../systems/petMath.js';
import { woodPanel, plaqueButton, capsuleButton, slot, tag, text } from './widgets.js';

// Panels read the saved game state (scene.game.session.state).
const stateOf = (scene) => scene.game.session.state;

function closeBtn(scene, stack, w, h) {
  return plaqueButton(scene, w / 2 - 16, -h / 2 + 16, { icon: 'close', onClick: () => stack.pop(), name: 'close' });
}

export function bagPanel(scene, stack) {
  const w = 760, h = 420;
  const items = stateOf(scene).inventory.map((it) => ({ ...ITEMS[it.id], key: it.id, count: it.count }));
  const c = woodPanel(scene, w, h);
  c.add(text(scene, -w / 2 + 36, -h / 2 + 22, '背包', 26));

  // left: item detail card
  const card = woodPanel(scene, 250, 320, { radius: 20, border: 5 });
  card.setPosition(-w / 2 + 160, 22);
  c.add(card);
  const icon = scene.add.image(-60, -95, items[0]?.icon ?? '__MISSING').setScale(0.62).setVisible(!!items[0]);
  const nameT = text(scene, 10, -128, '', 22);
  const tagC = scene.add.container(0, 0);
  const descT = text(scene, -100, -40, '', 14, { bold: false, wrap: 200, lineSpacing: 4 });
  const quipT = text(scene, -100, 52, '', 14, { color: '#9a8468', bold: false, wrap: 200 });
  card.add([icon, nameT, tagC, descT, quipT]);
  card.add(capsuleButton(scene, 0, 118, '使用', { w: 150, h: 46, onClick: () => current && scene.showToast(`使用了 ${current.name}（演示）`), name: 'use' }));

  let current;
  const slots = [];
  const select = (i) => {
    current = items[i];
    icon.setTexture(current.icon);
    nameT.setText(current.name);
    tagC.removeAll(true); tagC.add(tag(scene, 10 + 30, -84, current.tag));
    descT.setText(current.desc);
    quipT.setText(`[${current.quip}]`);
    slots.forEach((s, k) => s.setSelected(k === i));
  };

  // right: 5x4 grid
  const gx = -w / 2 + 330, gy = -h / 2 + 96, size = 66, gap = 80;
  for (let i = 0; i < 20; i++) {
    const item = items[i];
    const s = slot(scene, gx + (i % 5) * gap, gy + Math.floor(i / 5) * gap, {
      size, iconKey: item?.icon, count: item?.count, onClick: item ? () => select(i) : undefined, name: item ? `slot-${item.key}` : undefined,
    });
    slots.push(s);
    c.add(s);
  }
  if (items.length) select(0); else nameT.setText('背包是空的');
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

export function petsPanel(scene, stack) {
  const w = 760, h = 420;
  const c = woodPanel(scene, w, h);
  c.add(text(scene, -w / 2 + 36, -h / 2 + 22, '宠物伙伴', 26));
  const st0 = stateOf(scene);
  st0.pets.slice(0, 6).forEach((inst, i) => {
    const p = species(inst.species);
    const x = -w / 2 + 130 + (i % 3) * 250, y = -60 + Math.floor(i / 3) * 170;
    const card = scene.add.graphics();
    card.fillStyle(COLORS.creamDark).fillRoundedRect(x - 105, y - 70, 210, 150, 18);
    const img = scene.add.image(x - 45, y + 6, petTextureKey(inst.form === 'human' && p.humanForm ? p.humanForm : p.id));
    img.setScale(120 / img.height);
    const nameT = text(scene, x + 10, y - 40, displayName(inst), 18);
    const el = tag(scene, x + 40, y - 2, `${p.element}属性`, Phaser.Display.Color.HexStringToColor(ELEMENT_COLORS[p.element]).color);
    const st = calcStats(inst);
    const inParty = st0.party.includes(inst.uid);
    const lv = text(scene, x + 10, y + 20, `Lv.${inst.level}${inParty ? ' · 同行' : ''}`, 15);
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
  c.add(text(scene, 0, -50, '音乐 / 音效 / 画质等选项以后加入', 16, { ox: 0.5, oy: 0.5, bold: false }));
  const session = scene.game.session;
  const when = new Date(session.state.savedAt);
  const saved = session.persistent ? `进度自动保存 · 上次 ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}` : '当前浏览器不能存档';
  c.add(text(scene, 0, -18, saved, 14, { ox: 0.5, oy: 0.5, bold: false, color: '#9a8468' }));
  c.add(capsuleButton(scene, 0, 60, '重新开始', {
    w: 180, style: 'yellow', name: 'restart',
    onClick: () => stack.push('confirm', (s, st) => confirmDialog(s, st, '确定要重新开始吗？\n当前进度会被清除。', () => {
      scene.game.session.newGame();
      scene.scene.get('play').scene.restart();
    })),
  }));
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

export function summaryPanel(scene, stack, report) {
  const w = 460, h = 300;
  const c = woodPanel(scene, w, h);
  c.add(text(scene, 0, -h / 2 + 42, `第 ${report.endedDay} 天结束`, 26, { ox: 0.5, oy: 0.5 }));
  const lines = report.lines.length ? report.lines : ['平静的一天。'];
  c.add(text(scene, 0, -16, lines.join('\n'), 16, { ox: 0.5, oy: 0.5, align: 'center', bold: false, lineSpacing: 6 }));
  c.add(text(scene, 0, 36, `☀ 第 ${report.day} 天 06:00`, 18, { ox: 0.5, oy: 0.5, color: '#9a8468' }));
  c.add(capsuleButton(scene, 0, h / 2 - 50, '开始新的一天', { w: 200, onClick: () => stack.pop(), name: 'summary-ok' }));
  return c;
}

export function confirmDialog(scene, stack, message, onOk) {
  const w = 400, h = 230;
  const c = woodPanel(scene, w, h);
  c.add(plaqueButton(scene, -w / 2 + 16, -h / 2 + 16, { icon: 'back', onClick: () => stack.pop(), name: 'back' }));
  c.add(text(scene, 0, -28, message, 18, { ox: 0.5, oy: 0.5, align: 'center', bold: false, lineSpacing: 6 }));
  c.add(capsuleButton(scene, -80, 62, '取消', { w: 130, style: 'yellow', onClick: () => stack.pop(), name: 'cancel' }));
  c.add(capsuleButton(scene, 80, 62, '确定', { w: 130, onClick: () => { stack.clear(); if (onOk) onOk(); else scene.showToast('已确认'); }, name: 'ok' }));
  return c;
}
