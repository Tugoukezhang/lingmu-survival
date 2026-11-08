import { COLORS } from '../config.js';
import { ELEMENT_COLORS, petTextureKey, species } from '../data/pets.js';
import { ITEMS } from '../data/items.js';
import { calcStats, displayName, expToNext } from '../systems/petMath.js';
import { NATURES } from '../data/natures.js';
import { joinParty, leaveParty, setLead } from '../systems/party.js';
import { lightTorch } from '../systems/night.js';
import { SKILL_NAMES, SKILL_HELP, depositAll, withdrawAll } from '../systems/explore.js';
import { guideState, setGuideOff, guideDone } from '../systems/guide.js';
import * as FM from '../systems/farm.js';
import * as PC from '../systems/petcare.js';
import * as DY from '../systems/daily.js';
import { CROPS } from '../data/crops.js';
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
    if (r.ok) { scene.game.session.markDirty(); scene.game.events.emit('party-changed'); scene.showToast(r.moved?.length ? `${okMsg}；背包变小了，多出的 ${r.moved.length} 格物品放进了家园仓库` : okMsg); }
    else scene.showToast({ full: '队伍满了（最多 3 只），先让一只离队', away: '远征中只能调整顺序，回家园再换伙伴', last: '队伍里至少要有 1 只伙伴', party: '队伍里的伙伴不能打工，先让它离队' }[r.reason] ?? '现在不能这么做');
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
      else if (inst.job) items.push(tag(scene, x + 80, y - 46, '打工', 0x3d7fb8));
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
      body.add(text(scene, -w / 2 + 36, y - 9, `${displayName(inst)} · ${NATURE_NAMES(inst.nature)} · 好感 ${inst.affection} · 经验 ${inst.exp}/${expToNext(inst.level)}`, 14, { oy: 0.5, bold: false }));
      const ex = species(inst.species).explore;
      body.add(text(scene, -w / 2 + 36, y + 11, `探索：${SKILL_NAMES[ex]}——${SKILL_HELP[ex]}`, 12, { oy: 0.5, bold: false, color: '#7a6450' }));
      const rank = st.party.indexOf(inst.uid);
      if (rank < 0) {
        body.add(capsuleButton(scene, w / 2 - 110, y, '加入队伍', { w: 150, h: 44, onClick: () => act(joinParty, `${displayName(inst)}加入了队伍`), name: 'party-join' }));
        body.add(capsuleButton(scene, w / 2 - 270, y, inst.job ? '停止打工' : '派去打工', { w: 140, h: 44, style: 'yellow', name: 'job-toggle',
          onClick: () => act((s, u) => PC.setJob(s, u, !inst.job), inst.job ? `${displayName(inst)}回来休息了` : `${displayName(inst)}去${PC.WORK[species(inst.species).work].name}了，明早带东西回来`) }));
      }
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
  if (!guideDone(session.state)) {
    const off = guideState(session.state).off;
    c.add(capsuleButton(scene, -100, 60, off ? '打开新手目标' : '关闭新手目标', { w: 170, name: 'guide-toggle', onClick: () => {
      setGuideOff(session.state, !off); session.markDirty(); scene.game.events.emit('guide-changed'); stack.pop();
    } }));
  }
  c.add(capsuleButton(scene, guideDone(session.state) ? 0 : 100, 60, '重新开始', {
    w: 170, style: 'yellow', name: 'restart',
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

// Map (T24): island overview; 月影狐猫 (寻宝) reveals chests, at affection 100 also rare spots.
export function mapPanel(scene, stack) {
  const d = scene.scene.get('play').mapData();
  const w = 760, h = 420;
  const c = woodPanel(scene, w, h);
  c.add(text(scene, -w / 2 + 36, -h / 2 + 22, d.area === 'home' ? '地图 · 家园岛' : '地图 · 雾林浮岛', 26));
  const cell = Math.floor(Math.min(440 / d.cols, 320 / d.rows));
  const ox = -w / 2 + 40, oy = -h / 2 + 70;
  const g = scene.add.graphics();
  c.add(g);
  g.fillStyle(0xbfe3ef).fillRoundedRect(ox - 8, oy - 8, d.cols * cell + 16, d.rows * cell + 16, 12);
  for (let y = 0; y < d.rows; y++) for (let x = 0; x < d.cols; x++) {
    if (!d.walk[y][x]) continue;
    g.fillStyle(d.water?.[y][x] ? 0x6fb4d8 : 0x8cc66a).fillRect(ox + x * cell, oy + y * cell, cell, cell);
  }
  const dot = (x, y, color, r = cell * 0.55) => g.fillStyle(color).fillCircle(ox + x * cell, oy + y * cell, r);
  const sq = (tx, ty, color) => g.fillStyle(color).fillRect(ox + tx * cell + 1, oy + ty * cell + 1, cell - 2, cell - 2);
  for (const t of d.thorns) sq(t.tx, t.ty, 0x6a5a32);
  if (d.sense >= 1) for (const ch of d.chests) { if (ch.bonus) dot(ch.tx + 0.5, ch.ty + 0.5, 0xff7a1a, cell * 0.85); else sq(ch.tx, ch.ty, 0xf5c84b); }
  if (d.sense >= 2) for (const r of d.rare) dot(r.tx + 0.5, r.ty + 0.5, 0x7a4aa0);
  for (const f of d.fires) dot(f.x, f.y, f.lit ? 0xf08a3a : 0x888888);
  if (d.airship) dot(d.airship.tx + 0.5, d.airship.ty + 0.5, 0x5b3d26, cell * 0.8);
  if (d.dock) dot(d.dock.x, d.dock.y, 0x5b3d26, cell * 0.8);
  if (d.bed) dot(d.bed.x, d.bed.y, 0xf0a9a0, cell * 0.7);
  if (d.lostBag) dot(d.lostBag.x, d.lostBag.y, 0xc99a5a, cell * 0.8);
  g.lineStyle(2, 0xffffff).fillStyle(0xe8564a).fillCircle(ox + d.player.x * cell, oy + d.player.y * cell, cell * 0.75).strokeCircle(ox + d.player.x * cell, oy + d.player.y * cell, cell * 0.75);
  // legend
  const lx = ox + d.cols * cell + 40;
  const rows = [[0xe8564a, '你'], [0x5b3d26, d.area === 'home' ? '飞艇码头' : '飞艇'], [0xf08a3a, '营火']];
  if (d.area === 'home') rows.push([0xf0a9a0, '帐篷']);
  if (d.lostBag) rows.push([0xc99a5a, '失物包']);
  if (d.area !== 'home') {
    rows.push([0x6fb4d8, '浅水（航海鲨能涉水）'], [0x6a5a32, '荆棘（橡果刺猬能开路）']);
    if (d.sense >= 1) rows.push([0xf5c84b, '宝箱'], [0xd9572b, '秘密宝箱']);
    if (d.sense >= 2) rows.push([0x7a4aa0, '稀有雾晶']);
  }
  rows.forEach(([col, label], i) => {
    const y = oy + 4 + i * 26;
    g.fillStyle(col).fillCircle(lx, y + 8, 7);
    c.add(text(scene, lx + 16, y, label, 14, { bold: false }));
  });
  const skills = d.skills.map((s) => `${SKILL_NAMES[s.k]}${s.boosted ? '★' : ''}`).join(' · ') || '（无）';
  const hint = d.area === 'home' ? '' : d.sense === 0 ? '带上月影狐猫，地图会显示宝箱位置' : d.sense === 1 ? '月影狐猫好感 100 时还能找到稀有雾晶' : '月影狐猫帮你找到了所有宝物！';
  c.add(text(scene, lx - 8, h / 2 - 82, `队伍探索技能：${skills}`, 14, { wrap: 250 }));
  if (hint) c.add(text(scene, lx - 8, h / 2 - 50, hint, 13, { bold: false, color: '#9a8468', wrap: 250 }));
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

// Home storage (T24): put everything except tools and food away, or take it all back.
export function storagePanel(scene, stack) {
  const w = 600, h = 380;
  const c = woodPanel(scene, w, h);
  c.add(text(scene, -w / 2 + 36, -h / 2 + 22, '家园仓库', 26));
  const body = scene.add.container(0, 0);
  c.add(body);
  const draw = () => {
    body.removeAll(true);
    const st = stateOf(scene), items = st.storage ?? [];
    if (!items.length) body.add(text(scene, 0, -40, '仓库是空的', 18, { ox: 0.5, oy: 0.5, bold: false, color: '#9a8468' }));
    items.slice(0, 14).forEach((s, i) => body.add(slot(scene, -w / 2 + 70 + (i % 7) * 76, -h / 2 + 110 + Math.floor(i / 7) * 80, { size: 62, iconKey: ITEMS[s.id].icon, count: s.count })));
    if (items.length > 14) body.add(text(scene, w / 2 - 40, -h / 2 + 200, `还有 ${items.length - 14} 种`, 14, { ox: 1, bold: false }));
    body.add(capsuleButton(scene, -120, h / 2 - 56, '全部存入', { w: 200, style: 'yellow', name: 'storage-deposit', onClick: () => {
      const n = depositAll(stateOf(scene), (id) => ITEMS[id].tool || ITEMS[id].food);
      scene.game.session.markDirty(); scene.showToast(n ? `存进了 ${n} 格（工具和食物留在身上）` : '没有可以存的东西'); draw();
    } }));
    body.add(capsuleButton(scene, 120, h / 2 - 56, '全部取回', { w: 200, name: 'storage-withdraw', onClick: () => {
      const r = withdrawAll(stateOf(scene), bagSlots(stateOf(scene)));
      scene.game.session.markDirty(); scene.showToast(r.left ? `取回了 ${r.took} 格，背包满了，还有 ${r.left} 格留在仓库` : r.took ? `取回了 ${r.took} 格` : '仓库是空的'); draw();
    } }));
  };
  draw();
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

// ---------- daily tasks (T44) ----------
export function dailyPanel(scene, stack) {
  const w = 560, h = 340;
  const c = woodPanel(scene, w, h);
  const st = stateOf(scene);
  const d = DY.ensureDaily(st);
  c.add(text(scene, -w / 2 + 36, -h / 2 + 22, `每日任务 · 第 ${st.day} 天`, 24));
  d.tasks.forEach((t, i) => {
    const y = -h / 2 + 96 + i * 66;
    const prog = DY.progressOf(st, t);
    const g = scene.add.graphics();
    g.fillStyle(t.done ? 0xe4f2cf : COLORS.creamDark).fillRoundedRect(-w / 2 + 30, y - 26, w - 60, 54, 14);
    g.fillStyle(COLORS.woodDark).fillRoundedRect(-w / 2 + 50, y + 8, 260, 10, 5).fillStyle(COLORS.cream).fillRoundedRect(-w / 2 + 51, y + 9, 258, 8, 4);
    if (prog > 0) g.fillStyle(t.done ? 0x6fbf4a : 0xf0b43a).fillRoundedRect(-w / 2 + 51, y + 9, Math.max(8, 258 * prog / t.n), 8, 4);
    c.add(g);
    c.add(text(scene, -w / 2 + 50, y - 20, t.text, 16));
    c.add(text(scene, -w / 2 + 322, y + 13, `${prog}/${t.n}`, 14, { oy: 0.5, bold: false }));
    c.add(text(scene, w / 2 - 50, y, t.done ? '✔ 已领' : `+${DY.TASK_REWARD}`, 16, { ox: 1, oy: 0.5, color: t.done ? '#4f7d3a' : '#c99a1e' }));
  });
  c.add(text(scene, 0, h / 2 - 40, d.bonus ? '今天的奖励都领完了，明天再来！' : `三个都完成：再得 ${DY.ALL_BONUS} 四叶草 + 一包种子（睡醒后刷新）`, 14, { ox: 0.5, oy: 0.5, bold: false, color: '#7a6450' }));
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

// ---------- pet care (T12) ----------
// Pet, feed, make leader, send to work, shape-shift (焰尾狐 demo).
export function petCarePanel(scene, stack, { uid }) {
  const w = 600, h = 360;
  const c = woodPanel(scene, w, h);
  const body = scene.add.container(0, 0);
  c.add(body);
  const session = scene.game.session;
  let feeding = false;
  const draw = () => {
    body.removeAll(true);
    const st = stateOf(scene), inst = st.pets.find((p) => p.uid === uid);
    if (!inst) return;
    const sp = species(inst.species), care = PC.caredToday(st, inst), inParty = st.party.includes(uid);
    const img = scene.add.image(-w / 2 + 110, 10, petTextureKey(inst.form === 'human' && sp.humanForm ? sp.humanForm : sp.id));
    img.setScale(180 / img.height);
    body.add(img);
    body.add(text(scene, -w / 2 + 210, -h / 2 + 30, displayName(inst), 24));
    body.add(text(scene, -w / 2 + 210, -h / 2 + 64, `好感 ${inst.affection ?? 0} / 100`, 16));
    const g = scene.add.graphics();
    g.fillStyle(COLORS.woodDark).fillRoundedRect(-w / 2 + 340, -h / 2 + 64, 200, 18, 9).fillStyle(COLORS.creamDark).fillRoundedRect(-w / 2 + 342, -h / 2 + 66, 196, 14, 7);
    if (inst.affection) g.fillStyle(0xf08aa0).fillRoundedRect(-w / 2 + 342, -h / 2 + 66, Math.max(14, 196 * inst.affection / 100), 14, 7);
    body.add(g);
    const favName = ITEMS[sp.food]?.name ?? '';
    body.add(text(scene, -w / 2 + 210, -h / 2 + 94, `今天：${care.fed ? '已喂食' : '还没喂'} · ${care.petted ? '已摸摸' : '还没摸'}　最爱：${favName}`, 14, { bold: false, color: '#7a6450' }));
    body.add(text(scene, -w / 2 + 210, -h / 2 + 116, inParty ? '在队伍里（跟你去远征）' : inst.job ? `在${PC.WORK[sp.work].name}（明早带东西回来）` : '在家园休息', 14, { bold: false, color: '#7a6450' }));
    const bx = -w / 2 + 290, by = -10;
    if (feeding) {
      const foods = PC.foodsInBag(st);
      body.add(text(scene, bx - 80, by - 16, foods.length ? '喂什么？' : '背包里没有能喂的东西', 15));
      foods.slice(0, 6).forEach((s, i) => {
        const fav = sp.food === s.id;
        body.add(capsuleButton(scene, bx + (i % 2) * 170, by + 26 + Math.floor(i / 2) * 52, `${ITEMS[s.id].name}${fav ? ' ♥+15' : ' +5'}`, { w: 160, h: 44, style: fav ? 'green' : 'yellow', name: `feed-${s.id}`,
          onClick: () => {
            const r = PC.feed(stateOf(scene), uid, s.id);
            if (r.ok) { session.markDirty(); scene.game.events.emit('pet-happy', uid); scene.showToast(r.favourite ? `${displayName(inst)}超喜欢！好感 +${r.gain}` : `${displayName(inst)}吃掉了，好感 +${r.gain}`); }
            else scene.showToast(r.reason === 'fed' ? '今天已经喂过了' : '没有了');
            feeding = false; draw();
          } }));
      });
      body.add(capsuleButton(scene, bx + 85, h / 2 - 50, '返回', { w: 120, h: 44, style: 'yellow', name: 'feed-back', onClick: () => { feeding = false; draw(); } }));
      return;
    }
    body.add(capsuleButton(scene, bx, by, care.petted ? '摸过了' : '摸摸 +2', { w: 160, h: 46, style: care.petted ? 'yellow' : 'green', name: 'care-pet', onClick: () => {
      const r = PC.petPet(stateOf(scene), uid);
      if (r.ok) { session.markDirty(); scene.game.events.emit('pet-happy', uid); scene.showToast(`${displayName(inst)}眯起了眼睛，好感 +${r.gain}`); } else scene.showToast('今天已经摸过了');
      draw();
    } }));
    body.add(capsuleButton(scene, bx + 170, by, care.fed ? '喂过了' : '喂食', { w: 160, h: 46, style: care.fed ? 'yellow' : 'green', name: 'care-feed', onClick: () => {
      if (care.fed) { scene.showToast('今天已经喂过了，明天再来'); return; }
      feeding = true; draw();
    } }));
    const lead = st.party[0] === uid;
    body.add(capsuleButton(scene, bx, by + 58, lead ? '正在领头' : '跟着我', { w: 160, h: 46, style: 'yellow', name: 'care-lead', onClick: () => {
      const s2 = stateOf(scene);
      if (s2.party[0] === uid) return;
      if (!s2.party.includes(uid)) {
        if (s2.player.area !== 'home') { scene.showToast('远征中只能带队伍里的伙伴'); return; }
        if (s2.party.length >= 3) { const out = s2.party[s2.party.length - 1]; leaveParty(s2, out); scene.showToast(`${displayName(s2.pets.find((p) => p.uid === out))}回宠物小屋休息了`); }
        joinParty(s2, uid);
      }
      setLead(s2, uid);
      session.save('party');
      scene.game.events.emit('party-changed');
      stack.clear();
      scene.showToast(`${displayName(inst)}跟着你啦！`);
    } }));
    if (!inParty) body.add(capsuleButton(scene, bx + 170, by + 58, inst.job ? '停止打工' : '派去打工', { w: 160, h: 46, style: 'yellow', name: 'care-job', onClick: () => {
      const r = PC.setJob(stateOf(scene), uid, !inst.job);
      if (r.ok) { session.markDirty(); scene.showToast(inst.job ? `${displayName(inst)}去${PC.WORK[sp.work].name}了，明早带东西回来` : `${displayName(inst)}回来休息了`); }
      else scene.showToast(r.reason === 'away' ? '回家园才能派去打工' : '队伍里的伙伴不能打工');
      draw();
    } }));
    if (sp.humanForm) body.add(capsuleButton(scene, bx + 85, by + 116, inst.form === 'human' ? '变回原形' : '化形（演示）', { w: 180, h: 46, name: 'care-form', onClick: () => { scene.game.events.emit('pet-form', uid); draw(); } }));
    body.add(text(scene, bx - 80, h / 2 - 34, `打工：${PC.WORK[sp.work].name}　探索：${SKILL_NAMES[sp.explore]}`, 14, { bold: false, color: '#9a8468' }));
  };
  draw();
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

// ---------- farm panels (T11) ----------
// Choose which seed to plant on a tilled plot.
export function seedPanel(scene, stack, { key }) {
  const w = 480, h = 320;
  const c = woodPanel(scene, w, h);
  c.add(text(scene, 0, -h / 2 + 40, '种什么？', 26, { ox: 0.5, oy: 0.5 }));
  const seeds = stateOf(scene).inventory.filter((s) => ITEMS[s.id]?.tag === '种子');
  if (!seeds.length) c.add(text(scene, 0, -10, '没有种子了。\n农田右边的种子摊可以买。', 17, { ox: 0.5, oy: 0.5, align: 'center', bold: false, lineSpacing: 6 }));
  seeds.slice(0, 6).forEach((s, i) => {
    const crop = CROPS[Object.keys(CROPS).find((k) => CROPS[k].seed === s.id)];
    c.add(capsuleButton(scene, -110 + (i % 2) * 220, -50 + Math.floor(i / 2) * 60, `${crop.name} ×${s.count}（${crop.days} 天）`, { w: 205, h: 46, name: `plant-${s.id}`,
      onClick: () => { stack.clear(); scene.game.events.emit('plant', { key, seed: s.id }); } }));
  });
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

// Seed stand (interim, at home): buy seeds with clover.
export function seedShopPanel(scene, stack) {
  const w = 700, h = 400;
  const c = woodPanel(scene, w, h);
  c.add(text(scene, -w / 2 + 36, -h / 2 + 22, '种子摊', 26));
  const money = text(scene, w / 2 - 70, -h / 2 + 30, '', 18, { ox: 1 });
  c.add(money);
  const refresh = () => money.setText(`四叶草 ${scene.registry.get('clover')}`);
  const buy = (id, n) => {
    const session = scene.game.session;
    session.pullFromRegistry();
    const r = FM.buySeed(session.state, id, n);
    if (r.ok) { session.pushToRegistry(); session.markDirty(); scene.showToast(`买了 ${CROPS[id].name}种子 ×${n}（−${r.cost} 四叶草）`); }
    else scene.showToast(r.reason === 'clover' ? '四叶草不够' : '背包满了');
    refresh();
  };
  Object.entries(CROPS).forEach(([id, cr], i) => {
    const y = -h / 2 + 90 + i * 56;
    const ic = scene.add.image(-w / 2 + 64, y, ITEMS[cr.seed].icon); ic.setScale(40 / Math.max(ic.width, ic.height));
    c.add(ic);
    c.add(text(scene, -w / 2 + 96, y - 24, `${cr.name}种子`, 17));
    c.add(text(scene, -w / 2 + 96, y + 12, `浇水 ${cr.days} 天成熟 · 出货 ${FM.priceOf(cr.crop)}`, 14, { bold: false, color: '#7a6450', oy: 0.5 }));
    c.add(text(scene, 40, y, `${cr.seedPrice} 四叶草`, 16, { oy: 0.5, color: '#4f7d3a' }));
    c.add(capsuleButton(scene, 190, y, '买 1', { w: 76, h: 44, style: 'yellow', name: `buy-${id}-1`, onClick: () => buy(id, 1) }));
    c.add(capsuleButton(scene, 280, y, '买 5', { w: 76, h: 44, name: `buy-${id}-5`, onClick: () => buy(id, 5) }));
  });
  refresh();
  c.add(closeBtn(scene, stack, w, h));
  return c;
}

// Shipping box: tap a bag item to put the whole stack in; tap a boxed item to take it back.
export function shipPanel(scene, stack) {
  const w = 760, h = 420;
  const c = woodPanel(scene, w, h);
  c.add(text(scene, -w / 2 + 36, -h / 2 + 22, '出货箱', 26));
  const body = scene.add.container(0, 0);
  c.add(body);
  const draw = () => {
    body.removeAll(true);
    const st = stateOf(scene);
    body.add(text(scene, -w / 2 + 40, -h / 2 + 70, '背包（点一下放进箱子）', 15, { bold: false }));
    body.add(text(scene, 40, -h / 2 + 70, '出货箱（点一下取回）', 15, { bold: false }));
    const sellable = st.inventory.filter((s) => FM.priceOf(s.id) != null);
    sellable.slice(0, 15).forEach((s, i) => {
      const x = -w / 2 + 70 + (i % 5) * 64, y = -h / 2 + 130 + Math.floor(i / 5) * 72;
      body.add(slot(scene, x, y, { size: 54, iconKey: ITEMS[s.id].icon, count: s.count, name: `ship-${s.id}`, onClick: () => { FM.ship(stateOf(scene), s.id, s.count); scene.game.session.markDirty(); draw(); } }));
      body.add(text(scene, x, y + 32, `${FM.priceOf(s.id)}`, 14, { ox: 0.5, color: '#4f7d3a' }));
    });
    const box = FM.farmOf(st).shipping;
    box.slice(0, 15).forEach((s, i) => {
      const x = 70 + (i % 5) * 64, y = -h / 2 + 130 + Math.floor(i / 5) * 72;
      body.add(slot(scene, x, y, { size: 54, iconKey: ITEMS[s.id].icon, count: s.count, name: `unship-${s.id}`, onClick: () => { const r = FM.unship(stateOf(scene), s.id); if (!r.ok) scene.showToast('背包满了'); scene.game.session.markDirty(); draw(); } }));
    });
    body.add(text(scene, 0, h / 2 - 44, `明早结算：+${FM.shippingValue(st)} 四叶草`, 19, { ox: 0.5, oy: 0.5, color: '#4f7d3a' }));
  };
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
