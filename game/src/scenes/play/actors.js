// PlayScene methods — Player, own pets (following, party), wild pets on expedition islands.
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
  // Wild pets wander near where the generator put them. Touching one starts
  // an encounter (battle is T06; for now a message).
  createWildPets() {
    const isl = this.island;
    this.wild = isl.pets.map((w, i) => {
      const data = species(w.species);
      const home = { x: w.tx * TILE + TILE / 2, y: w.ty * TILE + TILE / 2 };
      const level = wildLevel(this.state.day, mulberry32(isl.seed * 31 + i));
      const shadow = this.add.image(home.x, home.y + 2, 'shadow').setScale(0.7);
      const sprite = this.add.image(home.x, home.y, petTextureKey(data.id)).setOrigin(0.5, 0.92);
      sprite.setScale(PET_HEIGHT * 0.9 / sprite.height);
      // no encounter in the first 2 s after arriving / loading (the player may stand right next to one)
      const tag = this.add.text(home.x, home.y, `Lv.${level}`, { fontFamily: FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffffff', backgroundColor: ELEMENT_COLORS[data.element], padding: { x: 5, y: 1 } }).setOrigin(0.5, 1);
      return { ...w, data, level, sprite, shadow, tag, home, target: { ...home }, phase: this.rand() * 6, wanderAt: 0, cooldown: this.time.now + 2000 };
    });
  },

  updateWild(time, dt) {
    if (!this.wild) return;
    const p = this.player;
    for (const w of this.wild) {
      const s = w.sprite;
      if (time > w.wanderAt) {
        // pick a nearby walkable spot to stroll to
        for (let k = 0; k < 6; k++) {
          const tx = w.home.x + (this.rand() - 0.5) * 140, ty = w.home.y + (this.rand() - 0.5) * 100;
          if (this.footFits(tx, ty, false)) { w.target = { x: tx, y: ty }; break; }
        }
        w.wanderAt = time + 2500 + this.rand() * 3500;
      }
      const dx = w.target.x - s.x, dy = w.target.y - s.y, dist = Math.hypot(dx, dy);
      if (dist > 3) {
        const k = Math.min(1, (36 * dt) / dist);
        const nx = s.x + dx * k, ny = s.y + dy * k;
        if (this.footFits(nx, ny, false)) { s.x = nx; s.y = ny; } else w.wanderAt = 0;
        if (Math.abs(dx) > 2) s.setFlipX(dx < 0);
      }
      w.phase += dt * (dist > 3 ? 9 : 2.5);
      s.setDisplayOrigin(s.width / 2, s.height * 0.92 + Math.abs(Math.sin(w.phase)) * (dist > 3 ? 4 : 1.5) / s.scaleY);
      s.setDepth(s.y);
      w.shadow.setPosition(s.x, s.y + 2).setDepth(s.y - 1);
      w.tag.setPosition(s.x, s.y - s.displayHeight - 2).setDepth(s.y + 1);
      if (!this.sleeping && time > w.cooldown && Phaser.Math.Distance.Between(p.x, p.y, s.x, s.y) < 34) {
        w.cooldown = time + 4000;
        if (!this.startBattle(w)) this.hopAway(w, time);
      }
    }
  },

  hopAway(w, time) {
    const s = w.sprite, p = this.player;
    const ax = s.x - p.x, ay = s.y - p.y, len = Math.hypot(ax, ay) || 1;
    w.target = { x: s.x + ax / len * 70, y: s.y + ay / len * 70 };
    if (!this.footFits(w.target.x, w.target.y, false)) w.target = { ...w.home };
    w.wanderAt = time + 3000;
  },

  // ---------- actors ----------

  createPlayer() {
    let x = this.spawnTile.x * TILE + TILE / 2, y = this.spawnTile.y * TILE + TILE / 2;
    const saved = this.state.player;
    if (saved.area === this.area && saved.x != null && this.footFits(saved.x, saved.y)) { x = saved.x; y = saved.y; }
    else if (this.area === 'home' && this.state.flags.arriveAt) {
      const spot = this.state.flags.arriveAt === 'dock' ? this.dock : this.bed;
      if (spot && this.footFits(spot.x, spot.y + 20)) { x = spot.x; y = spot.y + 20; }
      delete this.state.flags.arriveAt;
    }
    this.playerShadow = this.add.image(x, y + 2, 'shadow').setScale(0.7);
    this.player = this.add.image(x, y, 'player').setOrigin(0.5, 0.97);
    this.facing = new Phaser.Math.Vector2(0, 1);
    this.trail = [{ x, y }];
    this.walkClock = 0;
  },

  createPets() {
    const m = this.meadowTile;
    const center = { x: m.x * TILE + TILE / 2, y: m.y * TILE + TILE / 2 };
    const slots = [[-110, -40], [-40, -70], [40, -55], [110, -30], [-70, 40], [60, 45]];
    // home: every owned pet lives here; expedition: only the party comes along. party[0] follows.
    const owned = this.area === 'home' ? this.state.pets : this.state.pets.filter((x) => this.state.party.includes(x.uid));
    this.pets = owned.map((inst, i) => {
      const slot = slots[i % slots.length];
      return this.addPetSprite(inst, { x: center.x + slot[0] + Math.floor(i / slots.length) * 24, y: center.y + slot[1] });
    });
    this.follower = this.pets.find((p) => p.inst.uid === this.state.party[0]) ?? this.pets[0];
    const p = this.player;
    this.follower.sprite.setPosition(p.x - 46, p.y + 6);
  },

  addPetSprite(inst, home) {
    const data = species(inst.species);
    const shadow = this.add.image(home.x, home.y + 2, 'shadow').setScale(0.75);
    const sprite = this.add.image(home.x, home.y, petTextureKey(data.id)).setOrigin(0.5, 0.92);
    const pet = { data, inst, sprite, shadow, home, target: { ...home }, phase: this.rand() * Math.PI * 2, wanderAt: 0 };
    this.applyPetTexture(pet);
    return pet;
  },

  // Party changed in the party panel: the new leader follows the player.
  syncParty() {
    const lead = this.pets.find((x) => x.inst.uid === this.state.party[0]);
    if (lead && lead !== this.follower) {
      const old = this.follower;
      this.follower = lead;
      if (old && !this.followLag(old)) { old.target = { ...old.home }; old.wanderAt = 0; }
      this.tweens.add({ targets: lead.sprite, scaleX: lead.sprite.scaleX * 1.15, scaleY: lead.sprite.scaleY * 0.85, duration: 90, yoyo: true });
    }
  },

  // Move the player instantly (used by tests; later by doors / airship) and
  // reset the follow trail so the follower doesn't walk the old path.
  teleport(x, y) {
    this.player.setPosition(x, y);
    this.trail = [{ x, y }];
    if (this.follower) this.follower.sprite.setPosition(x - 46, y + 6);
  },

  applyPetTexture(pet) {
    const human = pet.inst.form === 'human' && !!pet.data.humanForm;
    pet.sprite.setTexture(petTextureKey(human ? pet.data.humanForm : pet.data.id));
    // evolved: a bit bigger and warmer; shiny: bluish (placeholders until the art arrives)
    if (pet.inst.shiny) pet.sprite.setTint(0xb8d8ff); else if (pet.inst.evolved) pet.sprite.setTint(0xfff0cc); else pet.sprite.clearTint();
    const h = (human ? PET_HEIGHT * 1.15 : PET_HEIGHT) * (pet.inst.evolved ? 1.12 : 1);
    pet.sprite.setScale(h / pet.sprite.height);
  },

  movePlayer(dt) {
    const mv = this.actions.move;
    const p = this.player;
    if (mv.lengthSq() > 0) {
      const step = SPEED * dt;
      const nx = p.x + mv.x * step, ny = p.y + mv.y * step;
      if (this.footFits(nx, p.y)) p.x = nx;   // slide along walls: test each axis separately
      if (this.footFits(p.x, ny)) p.y = ny;
      this.facing.copy(mv).normalize();
      if (Math.abs(mv.x) > 0.2) p.setFlipX(mv.x < 0);
      this.walkClock += dt * 12 * mv.length();
      p.setScale(1 + Math.sin(this.walkClock) * 0.04, 1 - Math.sin(this.walkClock) * 0.04);
      const last = this.trail[this.trail.length - 1];
      this.session.markDirty();
      if (Math.hypot(p.x - last.x, p.y - last.y) > 6) {
        this.trail.push({ x: p.x, y: p.y });
        if (this.trail.length > 60) this.trail.shift();
      }
    } else {
      p.setScale(1, 1);
    }
    p.setDepth(p.y);
    this.playerShadow.setPosition(p.x, p.y + 2).setDepth(p.y - 1);
  },

  updatePets(time, dt) {
    for (const pet of this.pets) {
      const s = pet.sprite;
      let target;
      const lag = this.followLag(pet);
      if (lag) {
        target = this.trail[Math.max(0, this.trail.length - lag)];
      } else {
        if (time > pet.wanderAt) {
          pet.target = { x: pet.home.x + (this.rand() - 0.5) * 60, y: pet.home.y + (this.rand() - 0.5) * 36 };
          pet.wanderAt = time + 2000 + this.rand() * 3000;
        }
        target = pet.target;
      }
      const dx = target.x - s.x, dy = target.y - s.y;
      const dist = Math.hypot(dx, dy);
      const speed = lag ? Math.min(SPEED * 1.4, dist * 4) : 30;
      // followers keep a little personal space so they never cover the player
      const tooClose = !!lag
        && Phaser.Math.Distance.Between(s.x, s.y, this.player.x, this.player.y) < 40
        && Phaser.Math.Distance.Between(target.x, target.y, this.player.x, this.player.y) < 40;
      if (dist > 4 && !tooClose) {
        const k = Math.min(1, (speed * dt) / dist);
        s.x += dx * k; s.y += dy * k;
        if (Math.abs(dx) > 2) s.setFlipX(dx < 0);
      }
      pet.phase += dt * (dist > 4 ? 10 : 3);
      const bob = Math.abs(Math.sin(pet.phase)) * (dist > 4 ? 5 : 2);
      s.setDisplayOrigin(s.width / 2, s.height * 0.92 + bob / s.scaleY);
      s.setDepth(s.y);
      pet.shadow.setPosition(s.x, s.y + 2).setDepth(s.y - 1);
    }
  },

  // Trail delay for pets that follow the player: the follower always; on
  // expeditions the whole party walks behind in party order.
  followLag(pet) {
    if (pet === this.follower) return 9;
    if (this.area !== 'expedition') return 0;
    const rank = this.state.party.indexOf(pet.inst.uid);
    return rank < 0 ? 0 : 9 + 9 * Math.max(1, rank);
  },

  nearestPet() {
    const p = this.player;
    let best = null, bestD = INTERACT_RANGE;
    for (const pet of this.pets) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, pet.sprite.x, pet.sprite.y);
      if (d < bestD) { best = pet; bestD = d; }
    }
    return best;
  },

};
