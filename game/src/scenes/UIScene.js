import { GAME_W, GAME_H, COLORS } from '../config.js';
import VirtualJoystick from '../ui/VirtualJoystick.js';
import PanelStack from '../ui/PanelStack.js';
import { plaqueButton, statBar, drawIcon, text, MIN_TOUCH } from '../ui/widgets.js';
import { bagPanel, petsPanel, settingsPanel, confirmDialog, summaryPanel } from '../ui/panels.js';
import { phaseAt, formatClock } from '../systems/time.js';

export const SAFE = 24; // keep HUD at least this far from screen edges (notches, rounded corners)

// Everything drawn in screen space lives here, on top of the world scene:
// HUD, joystick, action button, toasts and the panel stack.
// Talks to the world only through the registry (state) and game events.
export default class UIScene extends Phaser.Scene {
  constructor() { super('ui'); }

  create() {
    this.hud = [];
    this.stack = new PanelStack(this, { onChange: (open) => this.onModal(open) });
    this.joystick = new VirtualJoystick(this, { isBlocked: (over) => this.stack.size > 0 || over.length > 0 });
    this.createStatus();
    this.createButtons();
    this.createActionButton();
    this.createToast();

    // HUD reacts to state changes instead of polling every frame
    this.registry.events.on('changedata', this.onData, this);
    this.events.once('shutdown', () => this.registry.events.off('changedata', this.onData, this));
    const ev = this.game.events;
    ev.on('toast', this.showToast, this);
    ev.on('interact-available', this.setActionReady, this);
    ev.on('sleep-request', this.askSleep, this);
    ev.on('day-summary', this.showSummary, this);
    this.events.once('shutdown', () => {
      ev.off('toast', this.showToast, this); ev.off('interact-available', this.setActionReady, this);
      ev.off('sleep-request', this.askSleep, this); ev.off('day-summary', this.showSummary, this);
    });
    this.refreshAll();
    const session = this.game.session;
    this.showToast(session.notice ?? '摇杆 / WASD 移动，靠近宠物按「互动」');
    session.notice = null;
  }

  uiLocked() { return this.stack.locked(); }

  askSleep(clock) {
    if (this.stack.size) return;
    const early = phaseAt(clock) === 'day' && clock < 18 * 60;
    const msg = early ? `现在才 ${formatClock(clock)}，天还亮着。\n确定要直接睡到明天吗？` : `现在 ${formatClock(clock)}，要睡觉吗？\n睡到明天早上 6:00。`;
    this.stack.push('sleep', (s, st) => confirmDialog(s, st, msg,
      () => this.game.events.emit('sleep-confirm')));
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
      ['map', 'map', '地图', () => this.showToast('地图以后开放')],
      ['pets', 'paw', '宠物', () => this.stack.push('pets', petsPanel)],
      ['bag', 'bag', '背包', () => this.stack.push('bag', bagPanel)],
    ];
    defs.forEach(([name, icon, label, fn], i) => {
      const x = GAME_W - SAFE - 26 - i * 64, y = SAFE + 78;
      const b = plaqueButton(this, x, y, { size: 52, icon, onClick: fn, name: `hud-${name}` }).setDepth(10000);
      const t = text(this, x, y + 33, label, 14, { color: '#ffffff', stroke: '#5b3d26', strokeThickness: 3, ox: 0.5, oy: 0 }).setDepth(10000);
      this.hud.push(b, t);
    });
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

  setActionReady(ready) {
    const g = this.actionBg;
    g.clear();
    g.fillStyle(COLORS.woodDark).fillCircle(0, 3, 46);
    g.fillStyle(ready ? COLORS.yellow : COLORS.cream, ready ? 1 : 0.8).fillCircle(0, 0, 42);
    this.actionReady = ready;
  }

  // ---------- toast ----------
  createToast() {
    this.toast = text(this, GAME_W / 2, 84, '', 17, { ox: 0.5, oy: 0.5 }).setDepth(30000).setAlpha(0);
    this.toastBg = this.add.graphics().setDepth(29999).setAlpha(0);
  }

  showToast(msg) {
    this.toast.setText(msg);
    const w = this.toast.width + 36, h = 40;
    this.toastBg.clear().fillStyle(COLORS.woodDark).fillRoundedRect(GAME_W / 2 - w / 2, 84 - h / 2, w, h, 20)
      .fillStyle(COLORS.cream).fillRoundedRect(GAME_W / 2 - w / 2 + 3, 84 - h / 2 + 3, w - 6, h - 6, 17);
    this.tweens.killTweensOf([this.toast, this.toastBg]);
    this.toast.setAlpha(1); this.toastBg.setAlpha(1);
    this.tweens.add({ targets: [this.toast, this.toastBg], alpha: 0, delay: 1600, duration: 500 });
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
