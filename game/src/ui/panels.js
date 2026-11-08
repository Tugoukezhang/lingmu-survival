import { COLORS } from '../config.js';
import { ELEMENT_COLORS, petTextureKey, species } from '../data/pets.js';
import { ITEMS } from '../data/items.js';
import { calcStats, displayName, expToNext } from '../systems/petMath.js';
import { NATURES } from '../data/natures.js';
import { joinParty, leaveParty, setLead } from '../systems/party.js';
import { lightTorch } from '../systems/night.js';
import { removeItem } from '../systems/inventory.js';
import { RECIPES } from '../data/recipes.js';
import { canCraft, craft, bagSlots, stationOk } from '../systems/crafting.js';
import { woodPanel, plaqueButton, capsuleButton, slot, tag, text, makeClickable } from './widgets.js';

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
    } else if (current.key === 'item_torch') {
      const st = stateOf(scene);
      if (!removeItem(st.inventory, 'item_torch', 1)) return;
      lightTorch(st);
      scene.game.session.markDirty();
      scene.showToast('点亮了火把：身边 2 格有光，能烧 3 小时');
      render();
    } else if (current.key === 'item_campfire') {
      if (stateOf(scene).player.area !== 'expedition') { scene.showToast('家园很安全，不需要营火'); return; }
      stack.clear();
      scene.game.events.emit('place-campfire');
    } else if (current.key === 'item_tent') {
      scene.showToast('在点着的营火旁按「互动」，就能用帐篷睡觉');
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

const NATURE_NAMES = (id) => (NATURES[id] ?? NATURES.gentle).name;

// Party panel (T07): all owned pets, 6 per page; pick a pet, then join /
// leave the party or make it the leader (party max 3, docs/02 第 6 节).
export function petsPanel(scene, stack) {
  const w = 760, h = 420, perPage = 6;
  const c = woodPanel(scene, w, h);
  const title = text(scene, -w / 2 + 36, -h / 2 + 22, '', 26);
  c.add(title);
  const body = scene.add.container(0, 0);
  c.add(body);
  let page = 0, selected = stateOf(scene).party[0];

  const act = (fn, okMsg) => {
    const st = stateOf(scene);
    const r = fn(st, selected);
    if (r.ok) { scene.game.session.markDirty(); scene.game.events.emit('party-changed'); if (okMsg) scene.showToast(okMsg); }
    else scene.showToast({ full: '队伍满了（最多 3 只），先让一只离队', away: '远征中只能调整顺序，回家园再换伙伴', last: '队伍里至少要有 1 只伙伴' }[r.reason] ?? '现在不能这么做');
    draw();
  };

  const draw = () => {
    const st = stateOf(scene);
    const pages = Math.max(1, Math.ceil(st.pets.length / perPage));
    page = Math.min(page, pages - 1);
    title.setText(`宠物伙伴  队伍 ${st.party.length}/3`);
    body.removeAll(true);
    st.pets.slice(page * perPage, page * perPage + perPage).forEach((inst, i) => {
      const sp = species(inst.species);
      const x = -w / 2 + 132 + (i % 3) * 248, y = -h / 2 + 136 + Math.floor(i / 3) * 140;
      const sel = inst.uid === selected;
      const g = scene.add.graphics();
      if (sel) g.fillStyle(COLORS.yellow).fillRoundedRect(x - 116, y - 64, 232, 128, 20);
      g.fillStyle(COLORS.creamDark).fillRoundedRect(x - 112, y - 60, 224, 120, 17);
      const img = scene.add.image(x - 62, y + 6, petTextureKey(inst.form === 'human' && sp.humanForm ? sp.humanForm : sp.id));
      img.setScale(98 / img.height);
      if (inst.hp === 0) img.setAlpha(0.45);
      const stats = calcStats(inst);
      const hpNow = inst.hp == null ? stats.hp : inst.hp;
      const items = [g, img,
        text(scene, x - 8, y - 46, displayName(inst), 17),
        text(scene, x - 8, y - 20, `Lv.${inst.level}  ${'★'.repeat(inst.stars)}`, 14, { color: '#c99a1e' }),
        tag(scene, x + 22, y + 10, `${sp.element}属性`, Phaser.Display.Color.HexStringToColor(ELEMENT_COLORS[sp.element]).color),
        text(scene, x - 8, y + 26, `体力 ${hpNow}/${stats.hp}`, 13, { bold: false, color: hpNow === 0 ? '#d9572b' : '#5a4030' }),
      ];
      const rank = st.party.indexOf(inst.uid);
      if (rank >= 0) items.push(tag(scene, x + 80, y - 46, rank === 0 ? '领头' : '队伍', rank === 0 ? 0xd9572b : 0x6fae4a));
      if (inst.shiny) items.push(text(scene, x + 84, y + 26, '✦异色', 12, { color: '#7a4aa0', ox: 0.5 }));
      const hit = scene.add.rectangle(x, y, 224, 120, 0xffffff, 0.001);
      makeClickable(scene, hit, () => { selected = inst.uid; draw(); });
      hit.setData({ name: `pet-card-${inst.uid}`, touchW: 224, touchH: 120 });
      body.add([...items, hit]);
    });
    if (pages > 1) {
      body.add(capsuleButton(scene, w / 2 - 210, -h / 2 + 38, '◀', { w: 56, h: 44, style: 'yellow', name: 'pets-prev', onClick: () => { page = (page + pages - 1) % pages; draw(); } }));
      body.add(text(scene, w / 2 - 160, -h / 2 + 38, `${page + 1}/${pages}`, 16, { ox: 0.5, oy: 0.5 }));
      body.add(capsuleButton(scene, w / 2 - 110, -h / 2 + 38, '▶', { w: 56, h: 44, style: 'yellow', name: 'pets-next', onClick: () => { page = (page + 1) % pages; draw(); } }));
    }
    // bottom bar: details + actions for the selected pet
    const inst = st.pets.find((x) => x.uid === selected);
    if (inst) {
      const y = h / 2 - 40;
      body.add(text(scene, -w / 2 + 36, y, `${displayName(inst)} · ${NATURE_NAMES(inst.nature)} · 好感 ${inst.affection} · 经验 ${inst.exp}/${expToNext(inst.level)}`, 14, { oy: 0.5, bold: false }));
      const rank = st.party.indexOf(inst.uid);
      if (rank < 0) body.add(capsuleButton(scene, w / 2 - 110, y, '加入队伍', { w: 150, h: 44, onClick: () => act(joinParty, `${displayName(inst)}加入了队伍`), name: 'party-join' }));
      else {
        if (rank > 0) body.add(capsuleButton(scene, w / 2 - 270, y, '设为领头', { w: 140, h: 44, style: 'yellow', onClick: () => act(setLead, `${displayName(inst)}现在领头`), name: 'party-lead' }));
        body.add(capsuleButton(scene, w / 2 - 110, y, '离开队伍', { w: 150, h: 44, style: 'yellow', onClick: () => act(leaveParty, `${displayName(inst)}回宠物小屋休息了`), name: 'party-leave' }));
      }
    }
  };
  draw();
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
  const recipes = RECIPES.filter((r) => r.station === 'anywhere' || r.station === 'workbench');
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
    if (!stationOk(st, r.id)) {
      detail.add(text(scene, cx, h / 2 - 54, '要在家园工作台做（回家园岛再来）', 15, { ox: 0.5, oy: 0.5, color: '#d9572b' }));
    } else if (chk.ok) {
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
    else scene.showToast({ full: '背包满了，先腾出一格', station: '要在家园工作台做' }[res.reason] ?? '材料不够');
    draw();
    scene.time.delayedCall(250, () => { busy = false; });
  }
  draw();
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

// Camp panel (T22): fuel and sleeping in the tent next to a campfire.
export function campPanel(scene, stack, info) {
  const w = 460, h = 300;
  const c = woodPanel(scene, w, h);
  const hm = (m) => `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
  c.add(text(scene, 0, -h / 2 + 40, '营地', 26, { ox: 0.5, oy: 0.5 }));
  c.add(text(scene, 0, -72, info.left > 0 ? `营火还能烧 ${hm(info.left)}` : '营火已经熄灭了', 17, { ox: 0.5, oy: 0.5, bold: false }));
  c.add(text(scene, 0, -44, info.wood > 0 ? `撑到天亮还要添 ${info.wood} 根柴（背包里有 ${info.have} 根）` : '火够烧到天亮了', 15, { ox: 0.5, oy: 0.5, bold: false, color: info.wood > 0 ? '#d9572b' : '#4f7d3a' }));
  c.add(capsuleButton(scene, 0, 12, `添柴（木材 −1，+2 小时）`, { w: 300, style: 'yellow', name: 'camp-wood', onClick: () => { stack.clear(); scene.game.events.emit('camp-add-wood', info.fireId); } }));
  const reason = !info.tent ? '要有帐篷才能在野外睡觉（家园工作台制作）' : info.wood > 0 ? '火撑不到天亮，先添柴' : null;
  if (reason) c.add(text(scene, 0, 78, reason, 14, { ox: 0.5, oy: 0.5, color: '#9a8468' }));
  else c.add(capsuleButton(scene, 0, 78, '在帐篷里睡到天亮', { w: 260, name: 'camp-sleep', onClick: () => { stack.clear(); scene.game.events.emit('camp-sleep', info.fireId); } }));
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

// Airship dock: new island or the last one (docs/06 第 5 节).
export function departPanel(scene, stack, { clock, last, lostBag = 0 }) {
  const w = 480, h = 320;
  const c = woodPanel(scene, w, h);
  const hh = Math.floor(clock / 60) % 24, mm = String(clock % 60).padStart(2, '0');
  c.add(text(scene, 0, -h / 2 + 40, '飞艇码头', 26, { ox: 0.5, oy: 0.5 }));
  c.add(text(scene, 0, -62, `去雾林浮岛探险，路上要 1 小时（现在 ${String(hh).padStart(2, '0')}:${mm}）。\n天黑后岛上会起雾，记得早点回来。`, 15,
    { ox: 0.5, oy: 0.5, align: 'center', bold: false, lineSpacing: 6 }));
  const go = (mode) => { stack.clear(); scene.game.events.emit('depart', mode); };
  // E09: going somewhere new abandons the lost bag on the last island — ask first
  const goNew = () => {
    if (!lostBag) return go('new');
    stack.push('lost-warn', (s, st) => confirmDialog(s, st, `上次的岛上还有失物包（${lostBag} 件东西）。\n去新的浮岛就再也找不回来了，确定吗？`, () => go('new')));
  };
  c.add(capsuleButton(scene, 0, 8, '新的浮岛', { w: 220, onClick: goNew, name: 'depart-new' }));
  if (last != null) c.add(capsuleButton(scene, 0, 74, '回到上次的岛', { w: 220, style: 'yellow', onClick: () => go('last'), name: 'depart-last' }));
  if (last != null && lostBag) c.add(text(scene, 0, 112, `（失物包在那里：${lostBag} 件东西）`, 14, { ox: 0.5, oy: 0.5, bold: false, color: '#d9572b' }));
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
