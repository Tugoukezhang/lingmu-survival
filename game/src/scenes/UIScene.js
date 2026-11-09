import { GAME_W, GAME_H, COLORS } from '../config.js';
import VirtualJoystick from '../ui/VirtualJoystick.js';
import PanelStack from '../ui/PanelStack.js';
import { plaqueButton, statBar, drawIcon, text, MIN_TOUCH } from '../ui/widgets.js';
import { bagPanel, petsPanel, settingsPanel, confirmDialog, summaryPanel, departPanel, craftPanel, campPanel, mapPanel, storagePanel, seedPanel, seedShopPanel, shipPanel, petCarePanel, dailyPanel, npcPanel, expandPanel, bridgePanel, decoratePanel } from '../ui/panels.js';
import { phaseAt, formatClock } from '../systems/time.js';
import { currentGoal, GOALS, guideState } from '../systems/guide.js';

export const SAFE = 24; // keep HUD at least this far from screen edges (notches, rounded corners)

// Everything drawn in screen space lives here, on top of the world scene:
// HUD, joystick, action button, toasts and the panel stack.
// Talks to the world only through the registry (state) and game events.
export default class UIScene extends Phaser.Scene {
  constructor() { super('ui'); }

  create() {
    this.hud = [];
    this.dayPhase = null; this.dayIcon = null; this.guideBox = null; // scene object is reused on restart
    this.stack = new PanelStack(this, { onChange: (open) => this.onModal(open) });
    this.joystick = new VirtualJoystick(this, { isBlocked: (over) => this.stack.size > 0 || over.length > 0 });
    this.createStatus();
    this.createButtons();
    this.createActionButton();
    this.createToast();
    this.createGuide();

    // HUD reacts to state changes instead of polling every frame
    this.registry.events.on('changedata', this.onData, this);
    this.events.once('shutdown', () => this.registry.events.off('changedata', this.onData, this));
    const ev = this.game.events;
    ev.on('toast', this.showToast, this);
    ev.on('interact-available', this.setActionReady, this);
    ev.on('sleep-request', this.askSleep, this);
    ev.on('day-summary', this.showSummary, this);
    ev.on('dock-request', this.openDock, this);
    ev.on('airship-request', this.askReturn, this);
    ev.on('camp-request', this.openCamp, this);
    ev.on('storage-request', this.openStorage, this);
    ev.on('guide-changed', this.refreshGuide, this);
    ev.on('seed-request', this.openSeeds, this);
    ev.on('seedshop-request', this.openSeedShop, this);
    ev.on('ship-request', this.openShip, this);
    ev.on('petcare-request', this.openCare, this);
    ev.on('npc-request', this.openNpc, this);
    ev.on('expand-request', this.openExpand, this);
    ev.on('bridge-request', this.openBridge, this);
    ev.on('decorate-request', this.openDecorate, this);
    this.events.once('shutdown', () => {
      ev.off('toast', this.showToast, this); ev.off('interact-available', this.setActionReady, this);
      ev.off('sleep-request', this.askSleep, this); ev.off('day-summary', this.showSummary, this);
      ev.off('dock-request', this.openDock, this); ev.off('airship-request', this.askReturn, this); ev.off('camp-request', this.openCamp, this); ev.off('storage-request', this.openStorage, this); ev.off('guide-changed', this.refreshGuide, this);
      ev.off('seed-request', this.openSeeds, this); ev.off('seedshop-request', this.openSeedShop, this); ev.off('ship-request', this.openShip, this); ev.off('petcare-request', this.openCare, this); ev.off('npc-request', this.openNpc, this); ev.off('expand-request', this.openExpand, this); ev.off('bridge-request', this.openBridge, this); ev.off('decorate-request', this.openDecorate, this);
    });
    this.refreshAll();
    const session = this.game.session;
    const msg = session.notice ?? (session.tipShown ? null : '摇杆 / WASD 移动，靠近宠物按「互动」');
    if (msg) this.showToast(msg);
    session.notice = null; session.tipShown = true;
  }

  uiLocked() { return this.stack.locked(); }

  askSleep(clock) {
    if (this.stack.size) return;
    const early = phaseAt(clock) === 'day' && clock < 18 * 60;
    const msg = early ? `现在才 ${formatClock(clock)}，天还亮着。\n确定要直接睡到明天吗？` : `现在 ${formatClock(clock)}，要睡觉吗？\n睡到明天早上 6:00。`;
    this.stack.push('sleep', (s, st) => confirmDialog(s, st, msg,
      () => this.game.events.emit('sleep-confirm')));
  }

  openDock(info) {
    if (this.stack.size) return;
    this.stack.push('dock', (s, st) => departPanel(s, st, info));
  }

  openSeeds(info) { if (!this.stack.size) this.stack.push('seeds', (s, st) => seedPanel(s, st, info)); }
  openSeedShop() { if (!this.stack.size) this.stack.push('seedshop', seedShopPanel); }
  openCare(info) { if (!this.stack.size) this.stack.push('petcare', (s, st) => petCarePanel(s, st, info)); }
  openNpc(info) { if (!this.stack.size) this.stack.push('npc', (s, st) => npcPanel(s, st, info)); }
  openExpand() { if (!this.stack.size) this.stack.push('expand', expandPanel); }
  openBridge() { if (!this.stack.size) this.stack.push('bridge', bridgePanel); }
  openDecorate() { if (!this.stack.size) this.stack.push('decorate', decoratePanel); }
  openShip() { if (!this.stack.size) this.stack.push('ship', shipPanel); }

  openStorage() {
    if (this.stack.size) return;
    this.stack.push('storage', storagePanel);
  }

  openCamp(info) {
    if (this.stack.size) return;
    this.stack.push('camp', (s, st) => campPanel(s, st, info));
  }

  askReturn(clock) {
    if (this.stack.size) return;
    this.stack.push('return', (s, st) => confirmDialog(s, st, `要坐飞艇回家吗？\n路上要 1 小时（现在 ${formatClock(clock)}）。`,
      () => this.game.events.emit('return-home')));
  }

  showSummary(report) {
    this.stack.clear();
    this.stack.push('summary', (s, st) => summaryPanel(s, st, report));
  }

  onModal(open) {
    this.registry.set('uiModal', open);
    this.joystick.release();
    this.joystick.setVisible(!open);
    this.actionGroup.setVisible(!open);
  }

  // ---------- top-left: day/time + bars ----------
  createStatus() {
    const badge = this.dayBadge = this.add.container(SAFE, SAFE).setDepth(10000);
    const g = this.add.graphics();
    g.fillStyle(COLORS.woodDark).fillRoundedRect(0, 0, 190, 40, 20);
    g.fillStyle(COLORS.cream).fillRoundedRect(3, 3, 184, 34, 17);
    this.dayText = text(this, 44, 20, '', 17, { oy: 0.5 });
    badge.add([g, this.dayText]);
    this.hud.push(badge);

    this.hpBar = statBar(this, SAFE + 14, SAFE + 64, { w: 160, icon: 'heart', color: 0xe8564a }).setDepth(10000);
    this.hungerBar = statBar(this, SAFE + 14, SAFE + 94, { w: 160, icon: 'apple', color: 0xf09a3a }).setDepth(10000);
    this.hud.push(this.hpBar, this.hungerBar);
  }

  // ---------- top-right: currency + function buttons ----------
  createButtons() {
    const cw = 150;
    const money = this.add.container(GAME_W - SAFE - cw, SAFE).setDepth(10000);
    const g = this.add.graphics();
    g.fillStyle(0x3b2a20, 0.55).fillRoundedRect(0, 0, cw, 40, 20);
    g.lineStyle(2, COLORS.cream, 0.8).strokeRoundedRect(1, 1, cw - 2, 38, 19);
    this.cloverText = text(this, cw - 46, 20, '', 20, { color: '#ffffff', ox: 1, oy: 0.5, stroke: '#3b2a20', strokeThickness: 3 });
    const icon = drawIcon(this, 'clover', 26).setPosition(cw - 24, 20);
    money.add([g, this.cloverText, icon]);
    this.hud.push(money);

    const defs = [
      ['settings', 'gear', '设置', () => this.stack.push('settings', settingsPanel)],
      ['map', 'map', '地图', () => this.stack.push('map', mapPanel)],
      ['pets', 'paw', '宠物', () => this.stack.push('pets', petsPanel)],
      ['bag', 'bag', '背包', () => this.stack.push('bag', bagPanel)],
      ['craft', 'hammer', '制作', () => this.stack.push('craft', craftPanel)],
      ['tasks', 'list', '任务', () => this.stack.push('daily', dailyPanel)],
    ];
    defs.forEach(([name, icon, label, fn], i) => {
      const x = GAME_W - SAFE - 26 - i * 64, y = SAFE + 78;
      const b = plaqueButton(this, x, y, { size: 52, icon, onClick: fn, name: `hud-${name}` }).setDepth(10000);
      const t = text(this, x, y + 33, label, 14, { color: '#ffffff', stroke: '#5b3d26', strokeThickness: 3, ox: 0.5, oy: 0 }).setDepth(10000);
      this.hud.push(b, t);
    });
  }

  // ---------- new-player goal (under the bars) ----------
  createGuide() {
    this.guideBox = this.add.container(SAFE, SAFE + 116).setDepth(10000);
    this.guideBg = this.add.graphics();
    this.guideTitle = text(this, 12, 8, '', 14, { color: '#d9572b' });
    this.guideText = text(this, 12, 28, '', 15, { bold: false, wrap: 236, lineSpacing: 3 });
    this.guideBox.add([this.guideBg, this.guideTitle, this.guideText]);
    this.hud.push(this.guideBox);
    this.refreshGuide();
  }

  refreshGuide() {
    const goal = currentGoal(this.game.session.state);
    this.guideBox.setVisible(!!goal);
    if (!goal) return;
    const step = guideState(this.game.session.state).step;
    this.guideTitle.setText(`目标 ${step + 1}/${GOALS.length}`);
    this.guideText.setText(goal.text);
    const h = this.guideText.height + 38;
    this.guideBg.clear().fillStyle(COLORS.woodDark, 0.9).fillRoundedRect(0, 0, 260, h, 14).fillStyle(COLORS.cream, 0.95).fillRoundedRect(3, 3, 254, h - 6, 12);
    this.tweens.add({ targets: this.guideBox, scale: { from: 1.06, to: 1 }, duration: 200 });
  }

  // ---------- bottom-right: action button ----------
  createActionButton() {
    const bx = GAME_W - 96, by = GAME_H - 96;
    this.actionGroup = this.add.container(bx, by).setDepth(10000);
    this.actionBg = this.add.graphics();
    this.actionLabel = text(this, 0, 0, '互动', 20, { ox: 0.5, oy: 0.5 });
    const hit = this.add.circle(0, 0, 46, 0xffffff, 0.001);
    this.actionGroup.add([this.actionBg, this.actionLabel, hit]);
    this.actionGroup.setData({ name: 'action', touchW: 92, touchH: 92 });
    // fire on press (not release) so it feels instant while walking
    hit.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (this.uiLocked() || this.stack.size) return;
      this.game.events.emit('action-pressed');
      this.tweens.add({ targets: this.actionGroup, scale: 0.9, duration: 70, yoyo: true });
    });
    this.setActionReady(false);
    this.hud.push(this.actionGroup);
  }

  // ready: something to do nearby; verb: what pressing does (shown on the button)
  setActionReady(ready, verb) {
    const g = this.actionBg;
    g.clear();
    g.fillStyle(COLORS.woodDark).fillCircle(0, 3, 46);
    g.fillStyle(ready ? COLORS.yellow : COLORS.cream, ready ? 1 : 0.8).fillCircle(0, 0, 42);
    this.actionLabel?.setText(ready && verb ? verb : '互动');
    this.actionReady = ready;
  }

  // ---------- toast ----------
  // Two toast rows: a new message takes the main row; if the previous one was
  // still fresh it moves to a second row below instead of vanishing.
  createToast() {
    const row = (depth) => ({ t: text(this, GAME_W / 2, 84, '', 17, { ox: 0.5, oy: 0.5 }).setDepth(depth + 1).setAlpha(0), bg: this.add.graphics().setDepth(depth).setAlpha(0), shownAt: 0 });
    this.toastRows = [row(29998), row(29996)];
    this.toast = this.toastRows[0].t;   // the newest message (tests read this)
  }

  paintToast(r, msg, y, life) {
    r.t.setText(msg).setY(y);
    const w = r.t.width + 36, h = 40;
    r.bg.clear().fillStyle(COLORS.woodDark).fillRoundedRect(GAME_W / 2 - w / 2, y - h / 2, w, h, 20)
      .fillStyle(COLORS.cream).fillRoundedRect(GAME_W / 2 - w / 2 + 3, y - h / 2 + 3, w - 6, h - 6, 17);
    this.tweens.killTweensOf([r.t, r.bg]);
    r.t.setAlpha(1); r.bg.setAlpha(1);
    this.tweens.add({ targets: [r.t, r.bg], alpha: 0, delay: life, duration: 500 });
  }

  showToast(msg) {
    const [top, second] = this.toastRows;
    const now = this.time.now;
    // messages sit at the bottom middle (between joystick and action button), so they never
    // cover the HUD buttons at the top or a panel's title (T16 fix; was top-centre)
    const y1 = GAME_H - 30, y2 = GAME_H - 74;
    if (!this.stack?.size && top.t.alpha > 0.5 && now - top.shownAt < 1500 && top.t.text !== msg) {   // one row while a panel is open
      this.paintToast(second, top.t.text, y2, Math.max(600, 1600 - (now - top.shownAt)));
    }
    this.paintToast(top, msg, y1, 1600);
    top.shownAt = now;
  }

  // ---------- state → HUD ----------
  onData(parent, key) {
    if (['day', 'clock'].includes(key)) this.refreshDay();
    if (['hp', 'hpMax'].includes(key)) this.hpBar.setValue(this.registry.get('hp'), this.registry.get('hpMax'));
    if (['hunger', 'hungerMax'].includes(key)) this.hungerBar.setValue(this.registry.get('hunger'), this.registry.get('hungerMax'));
    if (key === 'clover') this.cloverText.setText(String(this.registry.get('clover')));
  }

  refreshDay() {
    const m = this.registry.get('clock') ?? 360;
    this.dayText.setText(`第 ${this.registry.get('day') ?? 1} 天  ${formatClock(m)}`);
    const phase = phaseAt(m);
    if (phase !== this.dayPhase) {   // sun / sunset / moon icon
      this.dayPhase = phase;
      this.dayIcon?.destroy();
      this.dayIcon = drawIcon(this, { day: 'sun', dusk: 'dusk', night: 'moon' }[phase], 26).setPosition(24, 20);
      this.dayBadge.add(this.dayIcon);
    }
  }

  refreshAll() {
    this.refreshDay();
    this.hpBar.setValue(this.registry.get('hp') ?? 100, this.registry.get('hpMax') ?? 100);
    this.hungerBar.setValue(this.registry.get('hunger') ?? 100, this.registry.get('hungerMax') ?? 100);
    this.cloverText.setText(String(this.registry.get('clover') ?? 0));
  }

  // ---------- test hooks (tools/smoke-test.mjs) ----------
  debugUi() {
    const targets = [];
    const walk = (obj) => {
      if (obj.getData?.('touchW')) targets.push({ name: obj.getData('name'), w: obj.getData('touchW'), h: obj.getData('touchH') });
      if (obj.list) obj.list.forEach(walk);
    };
    this.children.list.forEach(walk);
    const edge = Math.min(...this.hud.map((o) => {
      const b = o.getBounds();
      return Math.min(b.left, b.top, GAME_W - b.right, GAME_H - b.bottom);
    }));
    return { stack: this.stack.names, targets, hudEdge: Math.floor(edge), minTouch: MIN_TOUCH,
      day: this.dayText.text, clover: this.cloverText.text };
  }

  // Click a named button by name (test helper; same code path as a real click).
  findTarget(name) {
    let found = null;
    const walk = (obj) => { if (!found && obj.getData?.('name') === name) found = obj; if (obj.list) obj.list.forEach(walk); };
    this.children.list.forEach(walk);
    if (!found) return null;
    const m = found.getWorldTransformMatrix();
    return { x: m.tx, y: m.ty };
  }
}
