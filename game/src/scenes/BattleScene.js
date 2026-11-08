import { GAME_W, GAME_H, COLORS } from '../config.js';
import { petTextureKey, species, ELEMENT_COLORS } from '../data/pets.js';
import { SKILLS } from '../data/skills.js';
import { ITEMS } from '../data/items.js';
import { woodPanel, capsuleButton, plaqueButton, text, tag, MIN_TOUCH } from '../ui/widgets.js';
import { resolveTurn, active, finishBattle } from '../systems/battle.js';

// Turn-based pet battle screen (T06). Runs on top of the paused world;
// all rules live in systems/battle.js, this scene only shows them.
// Launched with { battle, wildId }; emits game event 'battle-end' when closed.
const SPOT = { me: { x: 250, y: 372, h: 170 }, foe: { x: 700, y: 236, h: 140 } };
const STAT_NAMES = { atk: '攻击', def: '防御', spd: '速度' };

export default class BattleScene extends Phaser.Scene {
  constructor() { super('battle'); }

  init(data) {
    this.battle = data.battle;
    this.wildId = data.wildId;
    // the scene object is reused for every battle: reset everything from the last one
    this.busy = false;
    this.menu = null;
    this.endPanel = null;
    this.closing = false;
    this.summary = null;
    this.speed = window.__battleFast ? 0.08 : 1;
  }

  create() {
    this.drawBackground();
    this.sprites = { me: this.makeSprite('me'), foe: this.makeSprite('foe') };
    this.cards = { foe: this.makeCard('foe', 32, 28), me: this.makeCard('me', GAME_W - 352, 268) };
    this.panel = woodPanel(this, GAME_W - 40, 150).setPosition(GAME_W / 2, GAME_H - 88);
    this.msg = text(this, -GAME_W / 2 + 56, -48, '', 19, { wrap: 380, lineSpacing: 6 });
    this.panel.add(this.msg);
    this.menuBox = this.add.container(0, 0);
    this.panel.add(this.menuBox);
    this.refreshAll();
    const foe = active(this.battle, 'foe');
    const extra = this.battle.sides.foe.mons.length - 1;
    this.say(`野生的${foe.name}（Lv.${foe.level}）出现了！${extra ? `\n它还带着 ${extra} 个伙伴。` : ''}`);
    this.cameras.main.fadeIn(300 * this.speed + 1, 0, 0, 0);
    this.time.delayedCall(700 * this.speed, () => this.showMain());
  }

  // ---------- layout ----------
  drawBackground() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x9fd4dc, 0x9fd4dc, 0xd9efd2, 0xd9efd2, 1).fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle(0x7fb85a).fillRect(0, 300, GAME_W, GAME_H - 300);
    g.fillStyle(0x8fc66a).fillEllipse(SPOT.foe.x, SPOT.foe.y + 8, 300, 70);
    g.fillStyle(0x6fa64e).fillEllipse(SPOT.foe.x, SPOT.foe.y + 14, 260, 46);
    g.fillStyle(0x8fc66a).fillEllipse(SPOT.me.x, SPOT.me.y + 10, 340, 80);
    g.fillStyle(0x6fa64e).fillEllipse(SPOT.me.x, SPOT.me.y + 16, 290, 52);
    // distant trees for the 雾林 mood
    for (let i = 0; i < 9; i++) {
      const x = 40 + i * 115, y = 300;
      g.fillStyle(0x5f9a6a, 0.55).fillCircle(x, y - 30, 46).fillCircle(x + 34, y - 18, 34);
    }
  }

  makeSprite(side) {
    const s = SPOT[side];
    const shadow = this.add.ellipse(s.x, s.y + 4, s.h * 0.75, 20, 0x2a4a20, 0.25);
    const img = this.add.image(s.x, s.y, '__DEFAULT').setOrigin(0.5, 0.95);
    return { img, shadow };
  }

  setSprite(side) {
    const m = active(this.battle, side);
    const sp = species(m.species);
    const key = petTextureKey(m.form === 'human' && sp.humanForm ? sp.humanForm : sp.id);
    const { img } = this.sprites[side];
    img.setTexture(key).setAlpha(1).setFlipX(side === 'me');
    img.setScale(SPOT[side].h / img.height);
    img.y = SPOT[side].y;
    img.baseScale = img.scaleX;
  }

  makeCard(side, x, y) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(COLORS.woodDark).fillRoundedRect(0, 0, 320, 92, 18);
    g.fillStyle(COLORS.cream).fillRoundedRect(4, 4, 312, 84, 15);
    const name = text(this, 18, 12, '', 20);
    const lv = text(this, 300, 14, '', 16, { ox: 1 });
    const el = this.add.container(0, 0);
    const barBg = this.add.graphics();
    barBg.fillStyle(COLORS.woodDark).fillRoundedRect(18, 52, 230, 16, 8).fillStyle(COLORS.creamDark).fillRoundedRect(20, 54, 226, 12, 6);
    const bar = this.add.graphics();
    const hpT = text(this, 300, 60, '', 15, { ox: 1, oy: 0.5 });
    const balls = this.add.graphics();
    c.add([g, name, lv, el, barBg, bar, hpT, balls]);
    return { c, name, lv, el, bar, hpT, balls, shown: null };
  }

  drawBar(side, hp, maxHp) {
    const card = this.cards[side];
    const k = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    card.bar.clear();
    if (k > 0) card.bar.fillStyle(k > 0.5 ? 0x6fbf4a : k > 0.2 ? 0xf0b43a : 0xe8564a).fillRoundedRect(20, 54, Math.max(10, 226 * k), 12, 6);
    card.hpT.setText(`${Math.ceil(hp)}/${maxHp}`);
    card.shown = hp;
  }

  refreshCard(side) {
    const m = active(this.battle, side), card = this.cards[side];
    card.name.setText(m.name);
    card.lv.setText(`Lv.${m.level}`);
    card.el.removeAll(true);
    card.el.add(tag(this, card.name.x + card.name.width + 34, 26, m.element, Phaser.Display.Color.HexStringToColor(ELEMENT_COLORS[m.element]).color));
    this.drawBar(side, m.hp, m.maxHp);
    const mons = this.battle.sides[side].mons;
    card.balls.clear();
    mons.forEach((x, i) => {
      card.balls.fillStyle(x.hp > 0 ? 0xf5c84b : 0xbfb3a0).fillCircle(296 - (mons.length - 1 - i) * 18, 80, 6);
    });
  }

  refreshAll() {
    for (const side of ['me', 'foe']) { this.setSprite(side); this.refreshCard(side); }
  }

  say(s) { this.msg.setText(s); }

  // ---------- menus ----------
  clearMenu() { this.menuBox.removeAll(true); this.menu = null; }

  button(x, y, label, onClick, { w = 150, style = 'green', name, disabled = false } = {}) {
    const b = capsuleButton(this, x, y, label, { w, h: 48, style, onClick: () => { if (!disabled && !this.busy) onClick(); }, name });
    if (disabled) b.setAlpha(0.45);
    this.menuBox.add(b);
    return b;
  }

  backButton() {
    this.menuBox.add(plaqueButton(this, GAME_W / 2 - 60, -40, { icon: 'back', size: 48, onClick: () => { if (!this.busy) this.showMain(); }, name: 'cmd-back' }));
  }

  showMain() {
    if (this.battle.over) return this.showEnd();
    if (this.battle.needSwitch) return this.showSwitch(true);
    this.clearMenu(); this.menu = 'main';
    const m = active(this.battle, 'me');
    this.say(`${m.name}要做什么？`);
    const x0 = 30, y0 = -30, dx = 160, dy = 60;
    this.button(x0, y0, '技能', () => this.showSkills(), { name: 'cmd-skill' });
    this.button(x0 + dx, y0, '换伙伴', () => this.showSwitch(false), { name: 'cmd-switch', style: 'yellow' });
    this.button(x0 + dx * 2, y0, '零食', () => this.showSnacks(), { name: 'cmd-snack', style: 'yellow' });
    this.button(x0, y0 + dy, '捕捉', () => this.say('捕捉功能马上就来（T07）！'), { name: 'cmd-catch', style: 'yellow' });
    this.button(x0 + dx, y0 + dy, '溜走', () => this.act({ type: 'flee' }), { name: 'cmd-flee', style: 'yellow' });
  }

  showSkills() {
    this.clearMenu(); this.menu = 'skills';
    const m = active(this.battle, 'me');
    this.say('用哪个技能？');
    m.skills.forEach((id, i) => {
      const s = SKILLS[id], left = m.uses[id];
      const usesT = left === Infinity ? '' : ` ${left}/${s.uses}`;
      this.button(40 + (i % 2) * 210, -30 + Math.floor(i / 2) * 60, `${s.name}${usesT}`, () => this.act({ type: 'skill', skill: id }),
        { w: 196, style: s.power ? 'green' : 'yellow', name: `skill-${id}`, disabled: left <= 0 });
    });
    this.backButton();
  }

  showSwitch(forced) {
    this.clearMenu(); this.menu = forced ? 'forced-switch' : 'switch';
    this.say(forced ? '换谁上场？' : '换哪个伙伴上场？');
    const side = this.battle.sides.me;
    side.mons.forEach((m, i) => {
      const cur = i === side.active;
      this.button(40 + (i % 2) * 210, -30 + Math.floor(i / 2) * 60, `${m.name} ${m.hp}/${m.maxHp}`, () => this.act({ type: 'switch', index: i }),
        { w: 196, style: cur ? 'yellow' : 'green', name: `switch-${i}`, disabled: cur || m.hp <= 0 });
    });
    if (!forced) this.backButton();
  }

  showSnacks() {
    this.clearMenu(); this.menu = 'snacks';
    const foods = this.battle.inventory.filter((s) => ITEMS[s.id]?.food);
    const foe = active(this.battle, 'foe');
    this.say(foods.length ? `喂${foe.name}吃点什么？（喜欢的食物更容易捕捉）` : '背包里没有零食。');
    foods.slice(0, 4).forEach((s, i) => {
      this.button(40 + (i % 2) * 210, -30 + Math.floor(i / 2) * 60, `${ITEMS[s.id].name} ×${s.count}`, () => this.act({ type: 'snack', item: s.id }),
        { w: 196, style: 'yellow', name: `snack-${s.id}` });
    });
    this.backButton();
  }

  // ---------- turn playback ----------
  act(action) {
    const r = resolveTurn(this.battle, action);
    if (!r.ok) { this.say({ 'no-uses': '这个技能这场用完了。', 'bad-switch': '它不能上场。', 'no-item': '没有这个零食了。' }[r.reason] ?? '现在不能这么做。'); return; }
    this.clearMenu();
    this.busy = true;
    this.play(r.events, 0);
  }

  play(events, i) {
    if (i >= events.length) { this.busy = false; this.refreshCard('me'); this.refreshCard('foe'); this.showMain(); return; }
    const e = events[i];
    const next = (ms = 650) => this.time.delayedCall(ms * this.speed, () => this.play(events, i + 1));
    const who = (side) => (side === 'me' ? '' : '野生的');
    switch (e.t) {
      case 'use': {
        this.say(`${who(e.side)}${e.name}使用了「${e.skillName}」！`);
        const img = this.sprites[e.side].img, dir = e.side === 'me' ? 1 : -1;
        this.tweens.add({ targets: img, x: img.x + 26 * dir, duration: 110 * this.speed + 1, yoyo: true });
        return next(520);
      }
      case 'damage': {
        const img = this.sprites[e.side].img;
        this.tweens.add({ targets: img, alpha: 0.3, duration: 70 * this.speed + 1, yoyo: true, repeat: 2 });
        this.popNumber(e.side, `-${e.amount}`, '#ffffff');
        const card = this.cards[e.side], from = { v: card.shown };
        this.tweens.add({ targets: from, v: e.hp, duration: 380 * this.speed + 1, onUpdate: () => this.drawBar(e.side, from.v, e.maxHp) });
        if (e.eff) this.say(e.eff === 'super' ? '效果拔群！' : '效果不太好……');
        return next(e.eff ? 750 : 450);
      }
      case 'heal':
        this.popNumber(e.side, `+${e.amount}`, '#7fe07f');
        this.drawBar(e.side, e.hp, e.maxHp);
        this.say(`体力恢复了 ${e.amount}！`);
        return next(600);
      case 'stat':
        this.say(`${who(e.side)}${e.name}的${STAT_NAMES[e.stat]}${e.up ? '提高' : '降低'}了！`);
        return next(650);
      case 'bond':
        this.say(`${e.name}想起和你的约定，咬牙撑住了！`);
        return next(900);
      case 'faint': {
        this.say(`${who(e.side)}${e.name}倒下了！`);
        const img = this.sprites[e.side].img;
        this.tweens.add({ targets: img, alpha: 0, y: img.y + 30, duration: 420 * this.speed + 1 });
        this.refreshCard(e.side);
        return next(800);
      }
      case 'exp':
        this.say(`${e.name}获得了 ${e.amount} 点经验。`);
        return next(650);
      case 'send':
        this.setSprite(e.side); this.refreshCard(e.side);
        this.sprites[e.side].img.setAlpha(0);
        this.tweens.add({ targets: this.sprites[e.side].img, alpha: 1, duration: 260 * this.speed + 1 });
        this.say(e.side === 'me' ? `上吧，${e.name}！` : `野生的${e.name}上场了！`);
        return next(700);
      case 'snack':
        this.say(e.favourite ? `${e.name}开心地吃掉了${e.itemName}！好像很喜欢！` : `${e.name}吃掉了${e.itemName}。`);
        return next(800);
      case 'flee':
        this.say('悄悄溜走了……');
        return next(600);
      default:
        return next(0);
    }
  }

  popNumber(side, s, color) {
    const sp = SPOT[side];
    const t = text(this, sp.x + 40, sp.y - sp.h * 0.8, s, 26, { color, stroke: '#5b3d26', strokeThickness: 5, ox: 0.5, oy: 0.5 });
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, delay: 250 * this.speed, duration: 600 * this.speed + 1, onComplete: () => t.destroy() });
  }

  // ---------- result ----------
  showEnd() {
    this.clearMenu();
    const session = this.game.session;
    const sum = finishBattle(session.state, this.battle, { wildId: this.wildId });
    session.pushToRegistry();
    this.summary = sum;
    const title = { win: '胜利！', lose: '伙伴们玩累了……', flee: '溜走了' }[sum.result] ?? '对战结束';
    const lines = [];
    if (sum.result === 'win') {
      for (const x of sum.exp) lines.push(`${x.name} 经验 +${x.amount}`);
      for (const x of sum.levelUps) lines.push(`${x.name} 升到了 Lv.${x.level}！`);
      lines.push(`四叶草 +${sum.clover}`);
    } else if (sum.result === 'lose') {
      lines.push('野生宠物跑开了。', '回家睡一觉，伙伴们就能恢复。');
      if (sum.clover) lines.push(`四叶草 +${sum.clover}`);
    } else lines.push('野生宠物还在原地。');
    const w = 440, h = 280;
    const c = woodPanel(this, w, h).setPosition(GAME_W / 2, GAME_H / 2 - 30).setDepth(100);
    c.add(text(this, 0, -h / 2 + 42, title, 28, { ox: 0.5, oy: 0.5 }));
    c.add(text(this, 0, -8, lines.join('\n'), 17, { ox: 0.5, oy: 0.5, align: 'center', bold: false, lineSpacing: 6 }));
    c.add(capsuleButton(this, 0, h / 2 - 48, '继续', { w: 170, onClick: () => this.close(), name: 'battle-continue' }));
    this.endPanel = c;
    this.say(title);
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    this.game.events.emit('battle-end', { result: this.battle.over, wildId: this.wildId, summary: this.summary });
    this.scene.stop();
  }

  // ---------- test hooks ----------
  findTarget(name) {
    let found = null;
    const walk = (o) => { if (!found && o.getData?.('name') === name) found = o; if (o.list) o.list.forEach(walk); };
    this.children.list.forEach(walk);
    if (!found) return null;
    const m = found.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty, w: found.getData('touchW'), h: found.getData('touchH') };
  }

  debugBattle() {
    const b = this.battle;
    return { menu: this.menu, busy: this.busy, over: b.over, turn: b.turn, msg: this.msg.text,
      me: active(b, 'me') && { name: active(b, 'me').name, hp: active(b, 'me').hp }, foe: { name: active(b, 'foe').name, hp: active(b, 'foe').hp },
      foes: b.sides.foe.mons.length, minTouch: MIN_TOUCH };
  }
}
