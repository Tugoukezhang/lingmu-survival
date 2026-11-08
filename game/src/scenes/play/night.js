// PlayScene methods — Time, day/night tint and lights, fog monsters, survival ticks, sleeping.
// Mixed into PlayScene.prototype (see ../PlayScene.js); `this` is the scene.
/* eslint-disable no-unused-vars */
import { GAME_W, GAME_H, TILE, COLORS, FONT, DEBUG, SEED, TIMESCALE } from '../../config.js';
import { ELEMENT_COLORS, petTextureKey, species } from '../../data/pets.js';
import { mulberry32, valueNoise2D } from '../../systems/rng.js';
import InputActions from '../../systems/input.js';
import { GameClock, MS_PER_GAME_MIN, runSettlement, tintAt, phaseAt, formatClock } from '../../systems/time.js';
import { survivalTick } from '../../systems/survival.js';
import { generateIsland, applyChanges, blockedGrid, emptyChanges } from '../../systems/islandGen.js';
import { wildLevel } from '../../systems/petMath.js';
import { depart, returnHome, faint as faintState, pickUpLostBag, lostBagCount } from '../../systems/travel.js';
import { gather, gatherPreview, GATHER } from '../../systems/crafting.js';
import { createBattle, makeWildGroup, canStartBattle } from '../../systems/battle.js';
import { PETS } from '../../data/pets.js';
import * as N from '../../systems/night.js';
import { applyDamage } from '../../systems/survival.js';
import * as CP from '../../systems/camp.js';
import * as EX from '../../systems/explore.js';
import * as GD from '../../systems/guide.js';
import { countOf } from '../../systems/inventory.js';
import { ITEMS } from '../../data/items.js';
import { HOME_COLS, HOME_ROWS, CLIFF, SPEED, PET_HEIGHT, INTERACT_RANGE, FOOT } from './constants.js';

export default {
  // ---------- time & day/night (T10) ----------

  createDayNight() {
    this.clock = new GameClock({ msPerMin: MS_PER_GAME_MIN / TIMESCALE });
    this.sleeping = false;
    // darkness = a screen-sized texture multiplied over the world, with soft
    // holes erased where lights are (campfires, torch, glowing pets)
    this.tint = this.add.renderTexture(0, 0, GAME_W, GAME_H).setOrigin(0).setScrollFactor(0).setDepth(8500)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.brush = this.make.image({ key: 'lightbrush', add: false }).setOrigin(0.5);
    if (this.area === 'expedition') this.createFog();
    this.refreshTint();
  },

  refreshTint() {
    const t = tintAt(this.state.clock);
    this.tintColor = t.color;
    this.tintDark = t.dark;
  },

  currentLights() { return N.lights(this.state, this.player, this.fires); },

  drawLighting() {
    // torch flame in the player's hand (day or night)
    const lit = N.torchLit(this.state);
    if (lit && !this.torchFx) {
      this.torchFx = this.add.image(0, 0, 'item_torch').setScale(0.3).setOrigin(0.5, 1);
      this.tweens.add({ targets: this.torchFx, scaleY: 0.33, duration: 180, yoyo: true, repeat: -1 });
    }
    if (!lit && this.torchFx) { this.torchFx.destroy(); this.torchFx = null; }
    if (this.torchFx) this.torchFx.setPosition(this.player.x + 14, this.player.y - 18).setDepth(this.player.y + 1);

    const rt = this.tint;
    if (!this.tintDark) { rt.setVisible(false); return; }
    rt.setVisible(true).clear().fill(this.tintColor, 1);
    const cam = this.cameras.main;
    for (const l of this.currentLights()) {
      this.brush.setScale((l.r * 2.2) / this.brush.width);   // visible edge ≈ r (where monsters stop)
      rt.erase(this.brush, l.x - cam.scrollX, l.y - cam.scrollY);
    }
    rt.render();
  },

  // drifting fog over the 雾林 at night
  createFog() {
    for (let i = 0; i < 10; i++) {
      const c = this.add.image(this.rand() * this.cols * TILE, this.rand() * this.rows * TILE, 'cloud')
        .setTint(0xc8d4e0).setAlpha(0).setScale(1.6 + this.rand()).setDepth(8400);
      c.drift = 8 + this.rand() * 10;
      this.fogWisps.push(c);
    }
  },

  // ---------- night: fog monsters (T21) ----------
  updateNight(time, delta) {
    const foggy = this.area === 'expedition' && N.isFoggy(this.state.clock);
    for (const c of this.fogWisps) {
      c.x += c.drift * delta / 1000;
      if (c.x > this.cols * TILE + 200) c.x = -200;
      c.setAlpha(Phaser.Math.Linear(c.alpha, foggy ? 0.35 : 0, 0.02));
    }
    if (this.area !== 'expedition') return;
    if (!foggy) {   // daylight: fog monsters fade (even while the day summary is open)
      if (this.monsters.length) this.dissolveMonsters();
      this.lastSpawn = null;
      return;
    }
    if (this.registry.get('uiModal') || this.sleeping || this.fainted || this.traveling) {
      // menus pause the night too: push every timer forward
      for (const w of this.warnings) w.landAt += delta;
      for (const m of this.monsters) m.nextAttack = (m.nextAttack ?? 0) + delta;
      return;
    }
    const ls = this.currentLights();
    const canStand = (x, y) => this.isOnIsland(x, y);   // ghosts float over trees and rocks
    if (N.shouldSpawn(this.state.clock, this.lastSpawn, this.monsters.length)) {
      const at = N.pickSpawn(this.rand, this.player, ls, canStand);
      this.lastSpawn = this.state.clock;
      if (at) this.spawnMonster(at, time);
    }
    const dt = Math.min(delta, 50) / 1000;
    for (const m of this.monsters) {
      const next = N.monsterStep(m, this.player, ls, dt, canStand);
      Object.assign(m, { x: next.x, y: next.y });
      m.sprite.setPosition(m.x, m.y - 6 + Math.sin(time / 300 + m.phase) * 4).setDepth(8550); // drawn over the darkness so players can see them
      m.sprite.setFlipX(this.player.x < m.x);
      if (N.canAttack(m, this.player, ls, time)) {
        m.nextAttack = time + N.MONSTER.attackEveryMs;
        this.warn(time);
      }
    }
    for (const w of [...this.warnings]) {
      const k = Phaser.Math.Clamp(1 - (w.landAt - time) / N.MONSTER.warnMs, 0, 1);
      w.g.clear().fillStyle(0xe8564a, 0.18 + 0.25 * k).fillCircle(w.x, w.y, w.r)
        .lineStyle(3, 0xe8564a, 0.9).strokeCircle(w.x, w.y, w.r).fillStyle(0xe8564a, 0.45).fillCircle(w.x, w.y, w.r * k);
      if (time >= w.landAt) this.landWarning(w);
    }
  },

  spawnMonster(at, time) {
    const sprite = this.add.image(at.x, at.y, 'fogmonster').setOrigin(0.5, 0.9).setAlpha(0).setDepth(8550);
    this.tweens.add({ targets: sprite, alpha: 0.7, duration: 800 });
    this.monsters.push({ x: at.x, y: at.y, sprite, phase: this.rand() * 6, nextAttack: time + 2000 });
    if (this.monsters.length === 1) this.showToast('雾里有什么东西在靠近……');
  },

  warn(time) {
    const g = this.add.graphics().setDepth(8560);   // above the darkness: the warning must always be visible
    this.warnings.push({ x: this.player.x, y: this.player.y, r: N.MONSTER.warnRadius, landAt: time + N.MONSTER.warnMs, g });
  },

  landWarning(w) {
    this.warnings = this.warnings.filter((x) => x !== w);
    this.tweens.add({ targets: w.g, alpha: 0, duration: 200, onComplete: () => w.g.destroy() });
    if (!N.warningHits(w, this.player)) return;
    this.session.pullFromRegistry();
    const ev = applyDamage(this.state.player, N.MONSTER.damage, this.area);
    this.registry.set('hp', this.state.player.hp);
    this.cameras.main.shake(160, 0.006);
    this.tweens.add({ targets: this.player, alpha: 0.4, duration: 80, yoyo: true, repeat: 2 });
    if (ev.includes('faint')) this.faint();
  },

  dissolveMonsters() {
    for (const m of this.monsters) this.tweens.add({ targets: m.sprite, alpha: 0, duration: 1200, onComplete: () => m.sprite.destroy() });
    for (const w of this.warnings) w.g.destroy();
    this.monsters = []; this.warnings = [];
  },

  // test hooks
  debugSpawnMonster(x, y) { this.spawnMonster({ x, y }, this.time.now); this.monsters.at(-1).nextAttack = 0; },

  debugNight() {
    return { monsters: this.monsters.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y) })), warnings: this.warnings.length, lights: this.currentLights(), lastSpawn: this.lastSpawn };
  },

  updateTime(delta) {
    const c = this.clock;
    if (this.registry.get('uiModal')) c.pause('menu'); else c.resume('menu');
    const before = this.state.clock;
    const events = c.advance(this.state, delta);
    if (this.state.clock !== before) { this.registry.set('clock', this.state.clock); this.refreshTint(); }
    for (const e of events) this.onTimeEvent(e);
  },

  onTimeEvent(e) {
    const home = this.state.player.area === 'home';
    if (e.type === 'tick') { this.onSurvivalTick(); this.game.events.emit('time-tick', e.clock); }
    else if (e.type === 'phase') {
      this.game.events.emit('phase-change', e.to);
      const msg = { dusk: home ? '天色暗下来了' : '天黑了：20 点起雾。在岛上过夜大约要 8 份木材（营火 4 + 添柴 4），或者坐飞艇回家', night: home ? '夜深了，早点去睡吧' : '入夜了，小心雾怪', day: '天亮了' }[e.to];
      if (msg) this.showToast(msg);
    } else if (e.type === 'bedtime') {
      this.showToast('太晚了……你困得睡着了');
      this.startSleep(true, 900);
    } else if (e.type === 'dawn') {
      this.startSleep(false, 600);
    }
  },

  // Fullness −1 per tick; health −3 per tick once fullness is 0 (docs/06 第 1 节).
  onSurvivalTick() {
    this.session.pullFromRegistry();
    const p = this.state.player;
    const ev = survivalTick(p, p.area);
    this.registry.set({ hunger: p.hunger, hp: p.hp });
    const msg = {
      hungry: '肚子有点饿了，记得吃东西',
      empty: '饿坏了！生命会慢慢减少，快吃点东西',
      floor: '快去吃点东西！再饿下去就走不动了',
    };
    for (const e of ev) {
      if (msg[e]) this.showToast(msg[e]);
      if (e === 'faint') this.game.events.emit('player-faint'); // → faint(): lost bag, wake at home
    }
  },

  // Fade out → daily settlement → save → fade in → summary panel.
  startSleep(slept, delay = 0) {
    if (this.sleeping) return;
    this.sleeping = true;
    this.clock.pause('sleep');
    this.time.delayedCall(delay, () => {
      const cam = this.cameras.main;
      cam.fadeOut(700, 0, 0, 0);
      cam.once('camerafadeoutcomplete', () => {
        this.session.pullFromRegistry();
        const report = runSettlement(this.state, { slept });
        if (this.bed) this.teleport(this.bed.x, this.bed.y + 44);
        this.session.pushToRegistry();
        this.session.save('settlement');
        this.clock.restart();
        this.clock.resume('sleep');
        this.refreshTint();
        this.sleeping = false;
        cam.fadeIn(700, 0, 0, 0);
        this.game.events.emit('day-summary', report);
      });
    });
  },

  // Test helper: run game time forward by `minutes` through the normal path.
  debugAdvance(minutes) { this.updateTime(minutes * this.clock.msPerMin + 1); },

};
