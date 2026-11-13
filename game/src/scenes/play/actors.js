// PlayScene methods — Player, own pets (following, party), wild pets on expedition islands.
// Mixed into PlayScene.prototype (see ../PlayScene.js); `this` is the scene.
/* eslint-disable no-unused-vars */
import { GAME_W, GAME_H, TILE, COLORS, FONT, DEBUG, SEED, TIMESCALE } from '../../config.js';
import { ELEMENT_COLORS, petTextureKey, petTextureOf, species } from '../../data/pets.js';
import { mulberry32, valueNoise2D } from '../../systems/rng.js';
import InputActions from '../../systems/input.js';
import { GameClock, MS_PER_GAME_MIN, runSettlement, tintAt, phaseAt, formatClock } from '../../systems/time.js';
import { survivalTick } from '../../systems/survival.js';
import { generateIsland, applyChanges, blockedGrid, emptyChanges } from '../../systems/islandGen.js';
import { wildLevel } from '../../systems/petMath.js';
import { depart, returnHome, faint as faintState, pickUpLostBag, lostBagCount } from '../../systems/travel.js';
import { gather, gatherPreview, GATHER } from '../../systems/crafting.js';
import { createBattle, makeWildGroup, canStartBattle, fieldCatch } from '../../systems/battle.js';
import * as ST from '../../systems/stealth.js';
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
      // notice meter (T45): small bar over the head, "!" once it has noticed you
      const alert = this.add.graphics();
      const mark = this.add.text(home.x, home.y, '!', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#e8443a', stroke: '#ffffff', strokeThickness: 4 }).setOrigin(0.5, 1).setVisible(false);
      const a = this.rand() * Math.PI * 2;
      return { ...w, data, level, sprite, shadow, tag, alert, mark, home, target: { ...home }, phase: this.rand() * 6, wanderAt: 0, cooldown: null,
        temper: ST.temperOf(data.id), meter: 0, mode: 'calm', modeUntil: 0, face: { x: Math.cos(a), y: Math.sin(a) } };
    });
    // grass tufts and bushes the player can hide next to
    this.covers = (isl.resources ?? []).filter((r) => r.type === 'grass' || r.type === 'bush').map((r) => ({ id: r.id, x: r.tx * TILE + TILE / 2, y: r.ty * TILE + TILE / 2 }));
  },

  // the same individual a battle would use (stars, nature, shiny come from the island seed)
  wildInstance(w) {
    return makeWildGroup({ species: w.species, level: w.level, islandSeed: this.island.seed, wildIndex: Number(w.id.slice(1)), day: this.state.day, pool: PETS.map((x) => x.id) })[0];
  },

  // How the player stands relative to a wild pet right now (for the throw button and the meter).
  stealthTo(w) {
    const s = w.sprite, p = this.player;
    const angle = ST.angleFromFacing(w.face, p.x - s.x, p.y - s.y);
    return { dist: Phaser.Math.Distance.Between(p.x, p.y, s.x, s.y), angle, stealth: ST.stealthOf(w.meter, angle) };
  },

  playerHidden() {
    const p = this.player;
    return (this.covers ?? []).some((c) => this.island.resources.some((r) => r.id === c.id) && Math.hypot(c.x - p.x, c.y - p.y) < ST.COVER_RANGE);
  },

  // Throw a net at a wild pet from the field (T45). roll: tests pass a fixed number.
  throwNet(w, roll = Math.random()) {
    if (this.throwing || !this.wild?.includes(w) || this.inBattle) return false;
    const netId = ST.pickNet(this.state.inventory);
    if (!netId) { this.showToast('没有捕宠网了，在「制作」里用草编一张'); return false; }
    const { stealth } = this.stealthTo(w);
    this.session.pullFromRegistry();
    const r = fieldCatch(this.state, { wild: this.wildInstance(w), netId, stealth, roll, wildId: w.id });
    if (!r.ok) return false;
    this.throwing = true;
    this.session.markDirty();
    const s = w.sprite, p = this.player;
    const net = this.add.image(p.x, p.y - 40, netId).setScale(0.32).setDepth(9500);
    this.tweens.add({ targets: net, x: s.x, y: s.y - s.displayHeight * 0.5, angle: 360, duration: 380, ease: 'Quad.out', onComplete: () => {
      net.destroy();
      this.throwing = false;
      if (r.caught) this.onFieldCaught(w, r.summary);
      else {
        this.showToast(`${w.data.name}挣脱了网！（成功率 ${Math.round(r.rate * 100)}%）`);
        this.tweens.add({ targets: s, x: s.x + 8, duration: 50, yoyo: true, repeat: 3 });
        this.noticed(w, this.time.now);
      }
    } });
    return true;
  },

  onFieldCaught(w, summary) {
    this.tweens.add({ targets: [w.sprite, w.shadow, w.tag, w.alert, w.mark], alpha: 0, scale: 0.2, duration: 380, onComplete: () => { for (const o of [w.sprite, w.shadow, w.tag, w.alert, w.mark]) o.destroy(); } });
    this.wild = this.wild.filter((x) => x !== w);
    this.island.pets = this.island.pets.filter((x) => x.id !== w.id);
    const c = summary.caught;
    if (c.joined) {
      const inst = this.state.pets.find((x) => x.uid === c.uid);
      if (inst) this.pets.push(this.addPetSprite(inst, { x: w.sprite.x, y: w.sprite.y }));
    }
    this.session.pushToRegistry();
    this.session.save('catch');
    this.game.events.emit('field-caught', summary);
  },

  // The pet has noticed the player: shy ones run, bold ones charge.
  noticed(w, time) {
    w.meter = 1;
    if (w.temper === 'bold') { w.mode = 'charge'; w.modeUntil = time + 6000; }
    else { w.mode = 'flee'; w.modeUntil = time + 3500; this.hopAway(w, time, 170); }
  },

  updateWild(time, dt) {
    if (!this.wild) return;
    const p = this.player;
    const sneaking = this.actions.move.length() < ST.SNEAK_PUSH;
    const covered = this.playerHidden();
    const dark = N.isFoggy(this.state.clock);
    const calm = this.sleeping || this.traveling || this.fainted;
    for (const w of this.wild) {
      // 3 seconds of peace after arriving or loading a save, counted from the first real frame
      // (the scene clock is not running yet while the map is being built, so a save made next to a wild pet started a battle at once)
      if (w.cooldown == null) w.cooldown = time + 3000;
      const s = w.sprite;
      // notice meter (T45)
      const look = this.stealthTo(w);
      if (!calm && w.mode === 'calm' && time > w.cooldown) {   // not right after arriving / a battle
        w.meter = ST.noticeStep(w.meter, { dist: look.dist, angle: look.angle, sneaking, covered, dark, dt });
        if (w.meter >= 1) this.noticed(w, time);
      } else if (w.mode !== 'calm' && time > w.modeUntil) { w.mode = 'calm'; w.meter = 0.6; w.wanderAt = 0; }
      if (w.mode === 'charge') {
        w.target = { x: p.x, y: p.y };
        if (look.dist > ST.NOTICE.radius * 1.6) { w.mode = 'calm'; w.meter = 0.5; w.target = { ...w.home }; }
      } else if (w.mode === 'calm' && time > w.wanderAt) {
        // pick a nearby walkable spot to stroll to
        for (let k = 0; k < 6; k++) {
          const tx = w.home.x + (this.rand() - 0.5) * 140, ty = w.home.y + (this.rand() - 0.5) * 100;
          if (this.footFits(tx, ty, false)) { w.target = { x: tx, y: ty }; break; }
        }
        w.wanderAt = time + 2500 + this.rand() * 3500;
      }
      const dx = w.target.x - s.x, dy = w.target.y - s.y, dist = Math.hypot(dx, dy);
      const speed = w.mode === 'flee' ? 120 : w.mode === 'charge' ? 95 : 36;
      if (dist > 3) {
        const k = Math.min(1, (speed * dt) / dist);
        const nx = s.x + dx * k, ny = s.y + dy * k;
        if (this.footFits(nx, ny, false)) { s.x = nx; s.y = ny; } else w.wanderAt = 0;
        w.face = { x: dx / dist, y: dy / dist };
      }
      // getting suspicious: turn to look at the player
      if (w.mode === 'calm' && w.meter >= ST.NOTICE.look && look.dist <= ST.NOTICE.radius) w.face = { x: p.x - s.x, y: p.y - s.y };
      if (Math.abs(w.face.x) > 0.1) s.setFlipX(w.face.x < 0);
      w.phase += dt * (dist > 3 ? 9 : 2.5);
      s.setDisplayOrigin(s.width / 2, s.height * 0.92 + Math.abs(Math.sin(w.phase)) * (dist > 3 ? 4 : 1.5) / s.scaleY);
      s.setDepth(s.y);
      w.shadow.setPosition(s.x, s.y + 2).setDepth(s.y - 1);
      const top = s.y - s.displayHeight - 2;
      w.tag.setPosition(s.x, top).setDepth(s.y + 1);
      w.alert.clear().setDepth(s.y + 1);
      if (w.meter > 0.02 && w.meter < 1) {
        w.alert.fillStyle(0x3b2616, 0.55).fillRoundedRect(s.x - 18, top - 24, 36, 7, 3);
        w.alert.fillStyle(w.meter >= ST.NOTICE.look ? 0xf08a3a : 0xf5c84b).fillRoundedRect(s.x - 17, top - 23, 34 * w.meter, 5, 2);
      }
      w.mark.setVisible(w.mode !== 'calm').setPosition(s.x, top - 16).setDepth(s.y + 2);
      if (!this.sleeping && time > w.cooldown && Phaser.Math.Distance.Between(p.x, p.y, s.x, s.y) < 34) {
        w.cooldown = time + 4000;
        const ambush = w.mode === 'calm' && w.meter < 1;   // it never saw you coming: you move first
        if (!this.startBattle(w, { ambush })) this.hopAway(w, time);
      }
    }
  },

  hopAway(w, time, far = 70) {
    const s = w.sprite, p = this.player;
    const ax = s.x - p.x, ay = s.y - p.y, len = Math.hypot(ax, ay) || 1;
    w.target = { x: s.x + ax / len * far, y: s.y + ay / len * far };
    if (!this.footFits(w.target.x, w.target.y, false)) w.target = { ...w.home };
    w.wanderAt = time + 3000;
  },

  // ---------- actors ----------

  createPlayer() {
    let x = this.spawnTile.x * TILE + TILE / 2, y = this.spawnTile.y * TILE + TILE / 2;
    const saved = this.state.player;
    if (saved.area === this.area && saved.x != null && this.footFits(saved.x, saved.y)) { x = saved.x; y = saved.y; }
    else if (this.area === 'home' && this.state.flags.arriveAt) {
      const spot = { dock: this.dock, bridge: this.homeBridge && { x: this.homeBridge.x + 30, y: this.homeBridge.y - 20 }, house: this.cottageSpot && { x: this.cottageSpot.x, y: this.cottageSpot.y + 4 } }[this.state.flags.arriveAt] ?? this.bed;
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
    const owned = this.area === 'home' ? this.state.pets : this.area === 'house' ? this.state.pets.filter((x) => x.uid === this.state.party[0]) : this.state.pets.filter((x) => this.state.party.includes(x.uid));
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

  // A pet left (turned into crystals after a field catch): remove its sprite.
  removePetSprite(uid) {
    const pet = this.pets.find((x) => x.inst.uid === uid);
    if (!pet) return;
    pet.sprite.destroy(); pet.shadow.destroy();
    this.pets = this.pets.filter((x) => x !== pet);
    if (this.follower === pet) this.follower = this.pets.find((x) => x.inst.uid === this.state.party[0]) ?? this.pets[0];
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
    pet.sprite.setTexture(petTextureOf(pet.inst));
    // evolved: its own art (T53), a bit bigger; shiny: bluish tint (until shiny art exists)
    if (pet.inst.shiny) pet.sprite.setTint(0xb8d8ff); else pet.sprite.clearTint();
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
