import { COLORS } from '../config.js';
import { ELEMENT_COLORS, petTextureKey, species } from '../data/pets.js';
import { ITEMS } from '../data/items.js';
import { calcStats, displayName } from '../systems/petMath.js';
import { RECIPES } from '../data/recipes.js';
import { canCraft, craft, bagSlots } from '../systems/crafting.js';
import { woodPanel, plaqueButton, capsuleButton, slot, tag, text } from './widgets.js';

// Panels read the saved game state (scene.game.session.state).
const stateOf = (scene) => scene.game.session.state;

function closeBtn(scene, stack, w, h) {
  return plaqueButton(scene, w / 2 - 16, -h / 2 + 16, { icon: 'close', onClick: () => stack.pop(), name: 'close' });
}

export function bagPanel(scene, stack) {
  const w = 760, h = 420;
  let items = [];
  const c = woodPanel(scene, w, h);
  c.add(text(scene, -w / 2 + 36, -h / 2 + 22, '背包', 26));

  // left: item detail card
  const card = woodPanel(scene, 250, 320, { radius: 20, border: 5 });
  card.setPosition(-w / 2 + 160, 22);
  c.add(card);
  const icon = scene.add.image(-60, -95, '__DEFAULT').setScale(0.62);
  const nameT = text(scene, 10, -128, '', 22);
  const tagC = scene.add.container(0, 0);
  const descT = text(scene, -100, -40, '', 14, { bold: false, wrap: 200, lineSpacing: 4 });
  const quipT = text(scene, -100, 52, '', 14, { color: '#9a8468', bold: false, wrap: 200 });
  card.add([icon, nameT, tagC, descT, quipT]);
  const use = () => {
    if (!current) return;
    if (current.food) {
      const r = scene.game.session.eat(current.key);
      if (r.ok) {
        scene.showToast(`吃了${current.name}：饱食 +${r.hunger}${r.hp ? `　生命 +${r.hp}` : ''}`);
        render(current.key);
      } else scene.showToast(r.reason === 'full' ? '已经吃饱了' : '没有了');
    } else if (current.netMult) scene.showToast('捕宠网要在宠物对战中使用');
    else scene.showToast('放置功能以后开放');
  };
  card.add(capsuleButton(scene, 0, 118, '使用', { w: 150, h: 46, onClick: use, name: 'use' }));

  let current;
  let slots = [];
  const select = (i) => {
    current = items[i];
    icon.setTexture(current.icon).setVisible(true);
    nameT.setText(current.name);
    tagC.removeAll(true); tagC.add(tag(scene, 10 + 30, -84, current.tag));
    descT.setText(current.desc);
    quipT.setText(`[${current.quip}]`);
    slots.forEach((s, k) => s.setSelected(k === i));
  };

  // right: 5x4 grid, rebuilt from the saved inventory (after eating etc.)
  const grid = scene.add.container(0, 0);
  c.add(grid);
  const render = (keepKey) => {
    items = stateOf(scene).inventory.map((it) => ({ ...ITEMS[it.id], key: it.id, count: it.count }));
    grid.removeAll(true);
    slots = [];
    const total = Math.max(bagSlots(stateOf(scene)), items.length);   // 20, or 24 with 冰蓝小狼
    const cols = total > 20 ? 6 : 5, gap = cols === 6 ? 68 : 80, size = cols === 6 ? 58 : 66;
    const gx = -w / 2 + 330 - (cols === 6 ? 6 : 0), gy = -h / 2 + 96 - (cols === 6 ? 4 : 0);
    for (let i = 0; i < total; i++) {
      const item = items[i];
      const s = slot(scene, gx + (i % cols) * gap, gy + Math.floor(i / cols) * gap, {
        size, iconKey: item?.icon, count: item?.count, onClick: item ? () => select(i) : undefined, name: item ? `slot-${item.key}` : undefined,
      });
      slots.push(s);
      grid.add(s);
    }
    const prev = items.findIndex((it) => it.key === keepKey);
    if (items.length) select(prev >= 0 ? prev : 0);
    else { current = null; icon.setVisible(false); tagC.removeAll(true); nameT.setText('背包是空的'); descT.setText(''); quipT.setText(''); }
  };
  render();
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

// Field crafting (docs/06 第 3 节): recipes on the left, materials + button on the right.
export function craftPanel(scene, stack) {
  const w = 760, h = 420;
  const c = woodPanel(scene, w, h);
  c.add(text(scene, -w / 2 + 36, -h / 2 + 22, '制作', 26));
  const recipes = RECIPES.filter((r) => r.station === 'anywhere');
  let sel = 0, slots = [];
  const list = scene.add.container(0, 0), detail = scene.add.container(0, 0);
  c.add([list, detail]);

  const card = woodPanel(scene, 330, 320, { radius: 20, border: 5 });
  card.setPosition(w / 2 - 200, 22);
  c.add(card);
  c.bringToTop(detail);

  const draw = () => {
    const st = stateOf(scene);
    list.removeAll(true); slots = [];
    recipes.forEach((r, i) => {
      const ok = canCraft(st, r.id).ok;
      const s = slot(scene, -w / 2 + 80 + (i % 3) * 96, -h / 2 + 120 + Math.floor(i / 3) * 110, {
        size: 76, iconKey: ITEMS[r.out].icon, selected: i === sel, onClick: () => { sel = i; draw(); }, name: `recipe-${r.id}`,
      });
      if (!ok) s.list.find((o) => o.type === 'Image')?.setAlpha(0.45);
      slots.push(s);
      list.add(s);
      list.add(text(scene, -w / 2 + 80 + (i % 3) * 96, -h / 2 + 168 + Math.floor(i / 3) * 110, ITEMS[r.out].name, 14, { ox: 0.5, oy: 0, bold: !ok ? false : true, color: ok ? '#5a4030' : '#9a8468' }));
    });

    detail.removeAll(true);
    const r = recipes[sel], out = ITEMS[r.out], chk = canCraft(st, r.id);
    const cx = w / 2 - 200, top = -h / 2 + 80;
    const icon = scene.add.image(cx - 100, top + 30, out.icon); icon.setScale(80 / Math.max(icon.width, icon.height));
    detail.add(icon);
    detail.add(text(scene, cx - 40, top + 6, out.name, 22));
    detail.add(text(scene, cx - 40, top + 38, out.desc.split('\n')[0], 13, { bold: false, wrap: 190, color: '#7a6450' }));
    detail.add(text(scene, cx - 140, top + 86, '需要材料', 15));
    Object.entries(r.cost).forEach(([id, need], k) => {
      const have = Math.min(999, st.inventory.find((s) => s.id === id)?.count ?? 0);
      const y = top + 122 + k * 34;
      const mi = scene.add.image(cx - 124, y, ITEMS[id].icon); mi.setScale(30 / Math.max(mi.width, mi.height));
      detail.add(mi);
      detail.add(text(scene, cx - 100, y, ITEMS[id].name, 15, { oy: 0.5, bold: false }));
      detail.add(text(scene, cx + 120, y, `${have} / ${need}`, 16, { ox: 1, oy: 0.5, color: have >= need ? '#4f7d3a' : '#d9572b' }));
    });
    if (chk.ok) {
      detail.add(capsuleButton(scene, cx, h / 2 - 54, '制作', { w: 170, onClick: doCraft, name: 'craft-do' }));
    } else {
      const miss = chk.missing.map((m) => `${ITEMS[m.id].name} ×${m.need - m.have}`).join('、');
      detail.add(text(scene, cx, h / 2 - 54, `还缺：${miss}`, 15, { ox: 0.5, oy: 0.5, color: '#d9572b', wrap: 290, align: 'center' }));
    }
  };
  let busy = false;
  function doCraft() {
    if (busy) return;               // one press = one craft, even when tapped twice quickly
    busy = true;
    const r = recipes[sel];
    const res = craft(stateOf(scene), r.id);
    if (res.ok) { scene.game.session.markDirty(); scene.showToast(`做好了：${ITEMS[r.out].name}！`); }
    else scene.showToast(res.reason === 'full' ? '背包满了，先腾出一格' : '材料不够');
    draw();
    scene.time.delayedCall(250, () => { busy = false; });
  }
  draw();
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

// Airship dock: new island or the last one (docs/06 第 5 节).
export function departPanel(scene, stack, { clock, last }) {
  const w = 480, h = 320;
  const c = woodPanel(scene, w, h);
  const hh = Math.floor(clock / 60) % 24, mm = String(clock % 60).padStart(2, '0');
  c.add(text(scene, 0, -h / 2 + 40, '飞艇码头', 26, { ox: 0.5, oy: 0.5 }));
  c.add(text(scene, 0, -62, `去雾林浮岛探险，路上要 1 小时（现在 ${String(hh).padStart(2, '0')}:${mm}）。\n天黑后岛上会起雾，记得早点回来。`, 15,
    { ox: 0.5, oy: 0.5, align: 'center', bold: false, lineSpacing: 6 }));
  const go = (mode) => { stack.clear(); scene.game.events.emit('depart', mode); };
  c.add(capsuleButton(scene, 0, 8, '新的浮岛', { w: 220, onClick: () => go('new'), name: 'depart-new' }));
  if (last != null) c.add(capsuleButton(scene, 0, 74, '回到上次的岛', { w: 220, style: 'yellow', onClick: () => go('last'), name: 'depart-last' }));
  else c.add(text(scene, 0, 74, '（还没去过别的岛）', 15, { ox: 0.5, oy: 0.5, bold: false, color: '#9a8468' }));
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
