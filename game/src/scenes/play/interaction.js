// PlayScene methods — Name tags, toasts and the context action button.
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

import * as GR from '../../systems/growth.js';
export default {
  // ---------- world-space labels; screen UI lives in UIScene ----------

  createWorldUi() {
    this.nameTag = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '14px', color: '#ffffff', backgroundColor: '#5b3d26', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(9000).setVisible(false);
    if (DEBUG) this.debugText = this.add.text(GAME_W - 10, GAME_H - 40, '', { fontFamily: 'monospace', fontSize: '12px', color: '#000' }).setOrigin(1, 0).setScrollFactor(0).setDepth(10003);
  },

  showToast(msg) { this.game.events.emit('toast', msg); },

  // The action button shows what pressing it will do (null = nothing nearby).
  setActionVerb(verb) {
    if (verb === this.lastCanAct) return;    // tell the UI only when it changes
    this.lastCanAct = verb;
    this.game.events.emit('interact-available', !!verb, verb);
  },

  updateInteraction() {
    if (this.sleeping || this.fainted || this.traveling) { this.nameTag.setVisible(false); this.setActionVerb(null); return; }
    const p = this.player;
    // fixed spots first (bed, dock, airship), then pets
    const spots = [
      this.bed && { at: this.bed, verb: '睡觉', label: '帐篷 · 点互动睡觉', tagY: 92, act: () => this.game.events.emit('sleep-request', this.state.clock) },
      this.dock && { at: this.dock, verb: '出发', label: '飞艇码头 · 点互动出发', tagY: 40, act: () => this.game.events.emit('dock-request', { clock: this.state.clock, last: this.state.expedition?.seed ?? null, lostBag: lostBagCount(this.state) }) },
      this.airship && { at: this.airship, verb: '回家', label: '飞艇 · 点互动回家', tagY: 60, act: () => this.game.events.emit('airship-request', this.state.clock) },
    ].filter(Boolean);
    // campfires and chests on expedition islands
    for (const s of this.fireSprites.values()) {
      const left = CP.fireLeft(this.state, s.f);
      spots.push({ at: { x: s.x, y: s.y + 8 }, verb: '营地', label: left > 0 ? `营火 · 还能烧 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}（点互动）` : '营火 · 已熄灭（点互动添柴）', tagY: 60,
        act: () => this.game.events.emit('camp-request', this.campInfo(s.f.id)) });
    }
    for (const c of this.island?.chests ?? []) {
      spots.push({ at: { x: c.tx * TILE + TILE / 2, y: c.ty * TILE + TILE / 2 }, verb: '打开', prio: 30, label: c.bonus ? '秘密宝箱 · 点互动打开' : '宝箱 · 点互动打开', tagY: 50, act: () => this.tryOpenChest(c) });
    }
    for (const t of this.island?.thorns ?? []) {
      spots.push({ at: { x: t.tx * TILE + TILE / 2, y: t.ty * TILE + TILE / 2 }, verb: '开路', label: EX.canClear(this.state) ? '荆棘丛 · 让橡果刺猬开路' : '荆棘丛 · 要橡果刺猬才能开路', tagY: 52, act: () => this.tryClearThorn(t) });
    }
    if (this.shipSpot) spots.push({ at: this.shipSpot, verb: '出货', label: '出货箱 · 放进去的东西明早换成四叶草', tagY: 64, act: () => this.game.events.emit('ship-request') });
    if (this.seedSpot) spots.push({ at: this.seedSpot, verb: '买种子', label: '种子摊 · 买种子', tagY: 60, act: () => this.game.events.emit('seedshop-request') });
    spots.push(...this.townSpots());
    const plotSpot = this.farmSpot?.();
    if (plotSpot) spots.push(plotSpot);
    if (this.storageSpot) spots.push({ at: this.storageSpot, verb: '仓库', label: '仓库 · 点互动打开', tagY: 60, act: () => this.game.events.emit('storage-request') });
    // the closest spot in range wins (a plot under your feet beats the box next to it)
    let spot = null, bestD = INTERACT_RANGE;
    // prio: things worth more (a chest) win over things next to them (its thorns)
    for (const s of spots) { const d = Phaser.Math.Distance.Between(p.x, p.y, s.at.x, s.at.y); if (d < INTERACT_RANGE && d - (s.prio ?? 0) < bestD) { bestD = d - (s.prio ?? 0); spot = s; } }
    if (!spot && this.island) spot = this.nearestResourceSpot();
    if (spot) {
      this.setActionVerb(spot.verb ?? '互动');
      this.nameTag.setText(spot.label).setBackgroundColor('#5b3d26').setPosition(spot.at.x, spot.at.y - spot.tagY).setVisible(true);
      if (this.actions.consumeInteract()) spot.act();
      return;
    }
    // pets: open the care panel (pet, feed, lead, work, shape-shift)
    const pet = this.nearestPet();
    this.setActionVerb(pet ? '照顾' : null);
    if (pet) {
      const st = this.state, uid = pet.inst.uid;
      const label = `${pet.data.name} · ${pet === this.follower ? '跟着你' : st.party.includes(uid) ? '队伍' : pet.inst.job ? '打工中' : pet.data.element}${pet.inst.fedDay === st.day ? '' : ' · 还没喂'}`;
      this.nameTag.setText(label).setBackgroundColor(ELEMENT_COLORS[pet.data.element])
        .setPosition(pet.sprite.x, pet.sprite.y - pet.sprite.displayHeight - 6).setVisible(true);
    } else {
      this.nameTag.setVisible(false);
    }

    if (!this.actions.consumeInteract() || !pet) return;
    this.game.events.emit('petcare-request', { uid: pet.inst.uid });
  },

  // 化形 demo from the care panel (full rules: T39)
  onPetForm(uid) {
    const pet = this.pets.find((x) => x.inst.uid === uid);
    if (!pet?.data.humanForm) return;
    if (!GR.toggleForm(this.state, uid).ok) return;   // needs the unlocked form (docs/07 第 10 节)
    this.applyPetTexture(pet);
    this.showToast(pet.inst.form === 'human' ? `${pet.data.name} 化形了！` : `${pet.data.name} 变回了原形`);
    this.session.markDirty();
  },

  onPetEvolved(uid) {
    const pet = this.pets.find((x) => x.inst.uid === uid);
    if (!pet) return;
    this.applyPetTexture(pet);
    const flash = this.add.circle(pet.sprite.x, pet.sprite.y - 30, 10, 0xfff4b0, 0.9).setDepth(pet.sprite.depth + 1);
    this.tweens.add({ targets: flash, radius: 70, alpha: 0, duration: 700, onComplete: () => flash.destroy() });
  },

  // a little hop when a pet is cared for
  onPetHappy(uid) {
    const pet = this.pets.find((x) => x.inst.uid === uid);
    if (pet) this.tweens.add({ targets: pet.sprite, y: pet.sprite.y - 14, duration: 140, yoyo: true, repeat: 1 });
  },

};
