// Title page and starter choice (T16; docs/02 第 2 节「开局三选一」).
// Steps: 'title' (继续游戏 / 新的开始, or 开始游戏 without a save) →
// 'choose' (three starter cards) → 'intro' (one line of story) → PlayScene.
// Saving is blocked while this scene is open, so the placeholder state that
// exists before a game starts can never be written over a real save.
import { GAME_W, GAME_H, FONT, COLORS } from '../config.js';
import { PET_BY_ID, STARTERS, petTextureKey, ELEMENT_COLORS } from '../data/pets.js';
import { ELEMENTS, elementMultiplier } from '../data/elements.js';
import { SKILL_NAMES } from '../systems/explore.js';
import { WORK } from '../systems/petcare.js';
import { woodPanel, capsuleButton, plaqueButton, text, tag, makeClickable, MIN_TOUCH } from '../ui/widgets.js';

export const GAME_NAME = '云海宠物岛';   // 暂名，负责人定名后改这里和 index.html
export const VERSION = 'v0.5 开发版';
export const HEALTH_NOTICE = '抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。\n适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。';

// 【建议】 one-line character for each starter (matches docs/02 stats)
const TRAITS = {
  acorn: '结实耐打，防御最高',
  shark: '活泼均衡，攻守兼备',
  fox: '机灵敏捷，攻击最高',
};

export default class TitleScene extends Phaser.Scene {
  constructor() { super('title'); }

  init(data) {
    this.step = null; this.layer = null; this.picked = null; this.cards = []; this.goBtn = null;   // scene object is reused
    this.firstStep = data?.step ?? 'title';
  }

  create() {
    const session = this.game.session;
    session.store.block('title');
    this.events.once('shutdown', () => session.store.unblock('title'));
    this.drawBackdrop();
    this.add.text(GAME_W / 2, GAME_H - 34, HEALTH_NOTICE, { fontFamily: FONT, fontSize: '14px', color: '#4a6a7a', align: 'center', lineSpacing: 4 }).setOrigin(0.5).setDepth(5);
    this.add.text(GAME_W - 12, GAME_H - 8, VERSION, { fontFamily: FONT, fontSize: '14px', color: '#6a8a9a' }).setOrigin(1, 1).setDepth(5);
    this.show(this.firstStep);
  }

  // sky, drifting clouds, a small floating island with the three starters on it
  drawBackdrop() {
    const g = this.add.graphics().setDepth(-10);
    g.fillGradientStyle(0x8fd0ec, 0x8fd0ec, 0xdff3f7, 0xdff3f7, 1).fillRect(0, 0, GAME_W, GAME_H);
    this.clouds = [];
    for (const [x, y, s] of [[120, 80, 0.9], [760, 60, 1.1], [420, 190, 0.7], [880, 250, 0.8], [60, 300, 0.75]]) {
      this.clouds.push(this.add.image(x, y, 'cloud').setScale(s).setAlpha(0.9).setDepth(-9));
    }
  }

  // island used on the title step only
  drawIsland(layer) {
    const cx = GAME_W / 2, cy = 300;
    const g = this.add.graphics();
    g.fillStyle(0x8a5a36).fillEllipse(cx, cy + 34, 420, 120);
    g.fillStyle(0x6e4528).fillTriangle(cx - 150, cy + 50, cx + 150, cy + 50, cx, cy + 150);
    g.fillStyle(COLORS.grassDark).fillEllipse(cx, cy + 6, 440, 104);
    g.fillStyle(COLORS.grass).fillEllipse(cx, cy, 424, 92);
    layer.add(g);
    layer.add(this.add.image(cx - 160, cy - 6, 'tree').setOrigin(0.5, 1).setScale(0.9));
    layer.add(this.add.image(cx + 170, cy - 2, 'tree').setOrigin(0.5, 1).setScale(0.75));
    layer.add(this.add.image(cx - 70, cy - 14, 'tent').setOrigin(0.5, 1).setScale(0.8));
    STARTERS.forEach((id, i) => {
      const img = this.add.image(cx + 10 + i * 64, cy + 14, petTextureKey(id)).setOrigin(0.5, 1);
      img.setScale(64 / img.height);
      layer.add(img);
      this.tweens.add({ targets: img, y: img.y - 6, duration: 700 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    });
  }

  show(step) {
    this.layer?.destroy();
    this.layer = this.add.container(0, 0);
    this.step = step;
    this.cards = []; this.goBtn = null;
    if (step === 'choose') this.picked = null;
    if (step === 'title') this.buildTitle();
    else if (step === 'choose') this.buildChoose();
    else if (step === 'intro') this.buildIntro();
    else if (step === 'confirm') this.buildConfirm();
  }

  buildTitle() {
    const L = this.layer, session = this.game.session;
    this.drawIsland(L);
    const plate = woodPanel(this, 460, 104).setPosition(GAME_W / 2, 92);
    plate.add(text(this, 0, -6, GAME_NAME, 46, { ox: 0.5, oy: 0.5, stroke: '#fbf3dc', strokeThickness: 2 }));
    plate.add(text(this, 0, 32, '（暂名）', 14, { ox: 0.5, oy: 0.5, bold: false, color: '#9a8468' }));
    L.add(plate);
    const y = 448;
    if (session.hasSave) {
      L.add(capsuleButton(this, GAME_W / 2 - 110, y, `继续游戏 · 第 ${session.state.day} 天`, { w: 250, h: 54, name: 'continue', onClick: () => this.continueGame() }));
      L.add(capsuleButton(this, GAME_W / 2 + 130, y, '新的开始', { w: 170, h: 54, style: 'yellow', name: 'new', onClick: () => this.show('confirm') }));
    } else {
      L.add(capsuleButton(this, GAME_W / 2, y, '开始游戏', { w: 240, h: 56, name: 'start', onClick: () => this.show('choose') }));
    }
  }

  // overwrite warning before a new game replaces the save
  buildConfirm() {
    const c = woodPanel(this, 420, 230).setPosition(GAME_W / 2, GAME_H / 2 - 20);
    c.add(text(this, 0, -36, `现在的存档（第 ${this.game.session.state.day} 天）会被清除，\n确定要重新开始吗？`, 18, { ox: 0.5, oy: 0.5, align: 'center', bold: false, lineSpacing: 6 }));
    c.add(capsuleButton(this, -86, 58, '取消', { w: 140, style: 'yellow', name: 'cancel', onClick: () => this.show('title') }));
    c.add(capsuleButton(this, 86, 58, '重新开始', { w: 140, name: 'ok', onClick: () => this.show('choose') }));
    this.layer.add(c);
  }

  buildChoose() {
    const L = this.layer;
    L.add(text(this, GAME_W / 2, 44, '选一只宠物，陪你一起出发', 26, { ox: 0.5, oy: 0.5, stroke: '#fbf3dc', strokeThickness: 4 }));
    L.add(plaqueButton(this, 40, 40, { icon: 'back', name: 'back', onClick: () => this.show('title') }));
    STARTERS.forEach((id, i) => L.add(this.starterCard(id, GAME_W / 2 + (i - 1) * 290, 250)));
    this.goBtn = capsuleButton(this, GAME_W / 2, 446, '就选它', { w: 220, h: 52, name: 'pick', onClick: () => { if (this.picked) this.show('intro'); } });
    this.goBtn.setAlpha(0.45);
    L.add(this.goBtn);
  }

  starterCard(id, x, y) {
    const sp = PET_BY_ID[id], w = 262, h = 320;
    const c = this.add.container(x, y);
    const ring = this.add.graphics();
    c.add(ring);
    const panel = woodPanel(this, w, h, { radius: 20 });
    c.add(panel);
    const img = this.add.image(0, -36, petTextureKey(id)).setOrigin(0.5, 1);
    img.setScale(Math.min(140 / img.height, 170 / img.width));
    c.add(img);
    c.add(text(this, 0, 2, sp.name, 24, { ox: 0.5, oy: 0 }));
    c.add(tag(this, 0, 48, `${sp.element}属性`, Phaser.Display.Color.HexStringToColor(ELEMENT_COLORS[sp.element]).color));
    c.add(text(this, 0, 70, TRAITS[id], 16, { ox: 0.5, oy: 0, bold: false }));
    // type matchups up front: 焰尾狐 has two water counters in the wild (T16 soak test)
    const strong = ELEMENTS.filter((e) => elementMultiplier(sp.element, e) > 1), weak = ELEMENTS.filter((e) => elementMultiplier(e, sp.element) > 1);
    c.add(text(this, 0, 96, `克制：${strong.join('、')}　怕：${weak.join('、')}`, 15, { ox: 0.5, oy: 0, bold: false, color: '#8a6a4a' }));
    c.add(text(this, 0, 122, `探索：${SKILL_NAMES[sp.explore]}　打工：${WORK[sp.work].name}`, 15, { ox: 0.5, oy: 0, bold: false, color: '#8a6a4a' }));
    const hit = this.add.rectangle(0, 0, w, Math.max(h, MIN_TOUCH), 0xffffff, 0.001);
    c.add(hit);
    makeClickable(this, hit, () => this.pick(id));
    c.setData({ name: `starter-${id}`, touchW: w, touchH: h });
    this.cards.push({ id, c, ring, img, w, h });
    return c;
  }

  pick(id) {
    this.picked = id;
    for (const k of this.cards) {
      const on = k.id === id;
      k.ring.clear();
      if (on) k.ring.fillStyle(COLORS.yellow).fillRoundedRect(-k.w / 2 - 7, -k.h / 2 - 7, k.w + 14, k.h + 14, 26);
      k.c.setScale(on ? 1.04 : 1);
      if (on) this.tweens.add({ targets: k.img, y: k.img.y - 16, duration: 140, yoyo: true, ease: 'Quad.out' });
    }
    this.goBtn?.setAlpha(1);
  }

  buildIntro() {
    const sp = PET_BY_ID[this.picked];
    const c = woodPanel(this, 600, 300).setPosition(GAME_W / 2, GAME_H / 2 - 24);
    const img = this.add.image(-190, 40, petTextureKey(this.picked)).setOrigin(0.5, 1);
    img.setScale(Math.min(150 / img.height, 160 / img.width));
    c.add(img);
    this.tweens.add({ targets: img, y: img.y - 8, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    c.add(text(this, -90, -96, `${sp.name}成为了你的伙伴！`, 22, { ox: 0, oy: 0 }));
    c.add(text(this, -90, -52, '飞艇把你们送到了云海上的一座小浮岛。\n从今天起，这里就是你们的家。\n\n坐飞艇去远方的岛屿探险，\n天黑前记得回家。', 16, { ox: 0, oy: 0, bold: false, lineSpacing: 6 }));
    c.add(capsuleButton(this, 0, 104, '开始冒险', { w: 220, h: 52, name: 'begin', onClick: () => this.startNew(this.picked) }));
    this.layer.add(c);
  }

  continueGame() {
    this.game.session.store.unblock('title');
    this.scene.start('play');
  }

  startNew(starter) {
    const session = this.game.session;
    session.store.unblock('title');
    session.newGame({ starter });
    this.scene.start('play');
  }

  update(time, delta) {
    for (const [i, c] of this.clouds.entries()) {
      c.x += (delta / 1000) * (6 + i * 2);
      if (c.x > GAME_W + 130) c.x = -130;
    }
  }

  // for automated checks (same shape as UIScene.findTarget)
  findTarget(name) {
    let found = null;
    const walk = (obj) => { if (!found && obj.getData?.('name') === name) found = obj; if (obj.list) obj.list.forEach(walk); };
    this.children.list.forEach(walk);
    if (!found) return null;
    const m = found.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty };
  }

  debugTitle() {
    const names = [];
    const walk = (obj) => { if (obj.getData?.('name')) names.push(obj.getData('name')); if (obj.list) obj.list.forEach(walk); };
    this.layer?.list.forEach(walk);
    return { step: this.step, picked: this.picked, targets: names };
  }
}
