import { GAME_W, GAME_H, TILE, COLORS, FONT, DEBUG, SEED, TIMESCALE } from '../config.js';
import { ELEMENT_COLORS, petTextureKey, species } from '../data/pets.js';
import { mulberry32, valueNoise2D } from '../systems/rng.js';
import InputActions from '../systems/input.js';
import { GameClock, MS_PER_GAME_MIN, runSettlement, tintAt, phaseAt, formatClock } from '../systems/time.js';
import { survivalTick } from '../systems/survival.js';
import { generateIsland, applyChanges, blockedGrid, emptyChanges } from '../systems/islandGen.js';
import { wildLevel } from '../systems/petMath.js';
import { depart, returnHome, faint as faintState, pickUpLostBag, lostBagCount } from '../systems/travel.js';
import { gather, gatherPreview, GATHER } from '../systems/crafting.js';
import { createBattle, makeWildGroup, canStartBattle } from '../systems/battle.js';
import { PETS } from '../data/pets.js';
import * as N from '../systems/night.js';
import { applyDamage } from '../systems/survival.js';
import { ITEMS } from '../data/items.js';

// The world: either the home island (placeholder layout) or a generated
// expedition island (systems/islandGen.js), chosen by state.player.area.
// Changing area = update the state and restart this scene.

const HOME_COLS = 50;
const HOME_ROWS = 34;
const CLIFF = 30;            // px of cliff face drawn below the island edge
const SPEED = 170;           // player px/s
const PET_HEIGHT = 74;       // on-screen pet height in px
const INTERACT_RANGE = 70;
const FOOT = { hw: 10, hh: 6 }; // player foot box (collision)

export default class PlayScene extends Phaser.Scene {
  constructor() { super('play'); }

  create() {
    this.session = this.game.session;
    this.state = this.session.state;
    this.rand = mulberry32(SEED);
    // the scene object is reused on restart: clear what belongs to the previous map
    this.fires = []; this.monsters = []; this.warnings = []; this.lastSpawn = null; this.fogWisps = []; this.torchFx = null;
    this.lostBag = null; this.bed = null; this.dock = null; this.airship = null; this.island = null; this.wild = null; this.resourceSprites = null; this.lastCanAct = undefined;
    this.traveling = false; this.fainted = false; this.inBattle = null;
    this.area = this.state.player.area === 'expedition' && this.state.expedition ? 'expedition' : 'home';
    if (this.area === 'expedition') this.buildExpedition(); else this.buildIsland();
    this.buildBackdrop();
    this.drawGround();
    if (this.area === 'expedition') this.placeExpeditionProps(); else this.placeObstacles();
    this.createPlayer();
    this.createPets();
    if (this.area === 'expedition') this.createWildPets();

    this.createWorldUi();
    this.createDayNight();

    // HUD values (day, clock, hp, hunger, clover) are mirrored into the
    // registry by GameSession; this scene writes the player position back.
    this.registry.set('uiModal', false);
    const off = this.session.onBeforeSave((s) => {
      if (s.player.area !== this.area) return; // mid-travel: the position belongs to the old map
      s.player.x = Math.round(this.player.x);
      s.player.y = Math.round(this.player.y);
    });
    this.events.once('shutdown', off);

    this.scene.launch('ui');
    this.actions = new InputActions(this, () => this.scene.get('ui')?.joystick?.vector);
    const onAction = () => this.actions.queueInteract();
    const onSleep = () => this.startSleep(true);
    const onDepart = (mode) => this.travel(() => depart(this.state, mode), mode === 'new' ? '到达新的雾林浮岛，天黑前记得回来' : '回到了上次的浮岛');
    const onReturn = () => this.travel(() => returnHome(this.state), '回到家园了');
    const onFaint = () => this.faint();
    const onBattleEnd = (r) => this.onBattleEnd(r);
    const onParty = () => this.syncParty();
    const ev = this.game.events;
    const handlers = [['action-pressed', onAction], ['sleep-confirm', onSleep], ['depart', onDepart], ['return-home', onReturn], ['player-faint', onFaint], ['battle-end', onBattleEnd], ['party-changed', onParty]];
    for (const [name, fn] of handlers) ev.on(name, fn);
    this.events.once('shutdown', () => { for (const [name, fn] of handlers) ev.off(name, fn); });

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.cols * TILE, this.rows * TILE + CLIFF + TILE);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setRoundPixels(true);
    cam.fadeIn(400, 0, 0, 0);
  }

  // ---------- world ----------

  buildIsland() {
    this.cols = HOME_COLS; this.rows = HOME_ROWS;
    const noise = valueNoise2D(SEED + 7, 6);
    const cx = this.cols / 2, cy = this.rows / 2, rx = 21, ry = 13;
    this.walk = [];
    for (let y = 0; y < this.rows; y++) {
      const row = [];
      for (let x = 0; x < this.cols; x++) {
        const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        row.push(d + (noise(x, y) - 0.5) * 0.7 < 1);
      }
      this.walk.push(row);
    }
    this.blocked = this.walk.map((r) => r.map(() => false));
    this.spawnTile = { x: Math.floor(cx), y: Math.floor(cy) };
    this.meadowTile = { x: Math.floor(cx) - 7, y: Math.floor(cy) + 2 };
  }

  // Expedition island from the saved seed, minus what was already taken.
  buildExpedition() {
    const exp = this.state.expedition;
    this.island = applyChanges(generateIsland(exp.seed), exp.changes);
    this.cols = this.island.cols; this.rows = this.island.rows;
    this.walk = this.island.walk;
    this.blocked = blockedGrid(this.island);
    const l = this.island.landing;
    this.spawnTile = { x: l.tx, y: l.ty };
    this.meadowTile = { x: l.tx, y: l.ty };
  }

  isWalkableTile(tx, ty) {
    return ty >= 0 && ty < this.rows && tx >= 0 && tx < this.cols && this.walk[ty][tx] && !this.blocked[ty][tx];
  }

  isWalkablePx(px, py) {
    return this.isWalkableTile(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  footFits(px, py) {
    return this.isWalkablePx(px - FOOT.hw, py - FOOT.hh) && this.isWalkablePx(px + FOOT.hw, py - FOOT.hh)
      && this.isWalkablePx(px - FOOT.hw, py + FOOT.hh) && this.isWalkablePx(px + FOOT.hw, py + FOOT.hh);
  }

  buildBackdrop() {
    for (const k of ['sky', 'ground']) if (this.textures.exists(k)) this.textures.remove(k); // scene restart (new game)
    const sky = this.textures.createCanvas('sky', GAME_W, GAME_H);
    const g = sky.getContext();
    const grd = g.createLinearGradient(0, 0, 0, GAME_H);
    grd.addColorStop(0, '#8ccbe3'); grd.addColorStop(1, '#e6f5f7');
    g.fillStyle = grd; g.fillRect(0, 0, GAME_W, GAME_H);
    sky.refresh();
    this.add.image(0, 0, 'sky').setOrigin(0).setScrollFactor(0).setDepth(-30);

    this.clouds = [];
    for (let i = 0; i < 9; i++) {
      const c = this.add.image(this.rand() * this.cols * TILE * 0.5, this.rand() * this.rows * TILE * 0.5, 'cloud')
        .setScrollFactor(0.3).setDepth(-20).setAlpha(0.7 + this.rand() * 0.3).setScale(0.8 + this.rand() * 0.8);
      c.speed = 6 + this.rand() * 10;
      this.clouds.push(c);
    }
  }

  drawGround() {
    const W = this.cols * TILE, H = this.rows * TILE + CLIFF + 8;
    const tex = this.textures.createCanvas('ground', W, H);
    const g = tex.getContext();
    const r = TILE * 0.74;
    const tiles = [];
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) if (this.walk[y][x]) tiles.push([x * TILE + TILE / 2, y * TILE + TILE / 2]);

    // cliff / earth layer: blobs shifted down, visible only below the grass edge
    for (const [x, y] of tiles) {
      g.fillStyle = '#8a5a36';
      g.beginPath(); g.arc(x, y + CLIFF, r, 0, Math.PI * 2); g.fill();
      g.fillRect(x - r, y, r * 2, CLIFF);
    }
    for (const [x, y] of tiles) {
      g.fillStyle = '#6e4529';
      g.beginPath(); g.arc(x, y + CLIFF + 6, r * 0.8, 0, Math.PI); g.fill();
    }
    // grass rim (slightly lighter, peeks out at the edge)
    for (const [x, y] of tiles) { g.fillStyle = '#b8e46a'; g.beginPath(); g.arc(x, y - 2, r, 0, Math.PI * 2); g.fill(); }
    // grass top: seamless AI-painted grass tile (assets/tiles/tile_grass.png)
    g.fillStyle = g.createPattern(this.textures.get('tile_grass').getSourceImage(), 'repeat');
    g.beginPath();
    for (const [x, y] of tiles) { g.moveTo(x + r * 0.96, y); g.arc(x, y, r * 0.96, 0, Math.PI * 2); }
    g.fill();
    // large soft light/dark patches break up the visible repetition of the tile
    const noise = valueNoise2D(SEED + 11, 7);
    for (const [x, y] of tiles) {
      const n = noise(x / TILE, y / TILE) - 0.5;
      g.fillStyle = n > 0 ? `rgba(255,250,200,${(n * 0.22).toFixed(3)})` : `rgba(40,90,30,${(-n * 0.22).toFixed(3)})`;
      g.beginPath(); g.arc(x, y, r * 0.96, 0, Math.PI * 2); g.fill();
    }
    if (this.area === 'home') {
      // meadow patch for the pets
      const m = this.meadowTile;
      g.fillStyle = 'rgba(200,232,140,0.55)';
      g.beginPath(); g.ellipse(m.x * TILE + TILE / 2, m.y * TILE + TILE / 2, TILE * 3.6, TILE * 2.4, 0, 0, Math.PI * 2); g.fill();
    } else {
      // 雾林: cooler, slightly misty green
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(40,95,105,0.3)'; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
      for (const c of this.island.camps) {   // camp clearings: trampled earth + stone ring
        const x = c.tx * TILE + TILE / 2, y = c.ty * TILE + TILE / 2;
        g.fillStyle = 'rgba(190,150,100,0.45)'; g.beginPath(); g.ellipse(x, y, TILE * 1.4, TILE * 1.1, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#a49c8c';
        for (let a = 0; a < 8; a++) { g.beginPath(); g.arc(x + Math.cos(a * Math.PI / 4) * 18, y + Math.sin(a * Math.PI / 4) * 13, 5, 0, Math.PI * 2); g.fill(); }
      }
    }
    // a few extra flowers at random spots (the tile already has grass blades)
    for (const [x, y] of tiles) {
      if (this.rand() < 0.06) {
        const fx = x + (this.rand() - 0.5) * TILE, fy = y + (this.rand() - 0.5) * TILE;
        g.fillStyle = this.rand() < 0.5 ? '#ffffff' : '#ffd36b';
        for (let a = 0; a < 5; a++) { g.beginPath(); g.arc(fx + Math.cos(a * 1.26) * 3, fy + Math.sin(a * 1.26) * 3, 2.2, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#f5a623'; g.beginPath(); g.arc(fx, fy, 1.6, 0, Math.PI * 2); g.fill();
      }
    }
    tex.refresh();
    this.add.image(0, 0, 'ground').setOrigin(0).setDepth(-10);
  }

  placeObstacles() {
    // campfire next to the spawn point (AI icon art used as a world prop)
    const fx = this.spawnTile.x - 2, fy = this.spawnTile.y - 2;
    this.blocked[fy][fx] = true;
    const cpx = fx * TILE + TILE / 2, cpy = fy * TILE + TILE - 4;
    const fire = this.add.image(cpx, cpy, 'item_campfire').setOrigin(0.5, 0.85).setDepth(cpy);
    this.fires.push({ x: cpx, y: cpy - 12 });
    fire.setScale(64 / fire.width);
    this.tweens.add({ targets: fire, scaleY: fire.scaleY * 1.04, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // placeholder tent = the bed until the house exists (sleep → next day)
    const bx = this.spawnTile.x + 2, by = this.spawnTile.y - 2;
    this.blocked[by][bx] = true;
    const tpx = bx * TILE + TILE / 2, tpy = by * TILE + TILE - 2;
    this.add.image(tpx, tpy, 'tent').setOrigin(0.5, 0.92).setDepth(tpy);
    this.bed = { x: tpx, y: tpy + 4 };

    // airship dock on the south edge below the spawn point
    let dy = this.spawnTile.y;
    while (this.walk[dy + 1]?.[this.spawnTile.x]) dy++;
    const dkx = this.spawnTile.x * TILE + TILE / 2, dky = dy * TILE + TILE;
    const pier = this.add.graphics().setDepth(dky - 40);
    pier.fillStyle(0x8a5a36).fillRect(dkx - 22, dky - 30, 44, 70);
    pier.fillStyle(0x6e4529);
    for (let i = 0; i < 5; i++) pier.fillRect(dkx - 22, dky - 28 + i * 14, 44, 3);
    pier.fillRect(dkx - 24, dky + 36, 6, 22).fillRect(dkx + 18, dky + 36, 6, 22);
    const ship = this.add.image(dkx + 92, dky + 40, 'airship').setOrigin(0.5, 0.7).setDepth(dky + 60);
    this.tweens.add({ targets: ship, y: ship.y - 6, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.dock = { x: dkx, y: dky - 30 };
    this.dockTile = { x: this.spawnTile.x, y: dy };

    const reserved = (x, y) => Math.hypot(x - this.spawnTile.x, y - this.spawnTile.y) < 3.5
      || Math.hypot((x - this.meadowTile.x) / 1.6, y - this.meadowTile.y) < 3.2
      || Math.hypot(x - this.dockTile.x, y - this.dockTile.y) < 2.5;
    const inland = (x, y) => this.walk[y]?.[x] && this.walk[y - 1]?.[x] && this.walk[y + 1]?.[x] && this.walk[y]?.[x - 1] && this.walk[y]?.[x + 1];
    const forest = valueNoise2D(SEED + 23, 5);
    for (let y = 1; y < this.rows - 1; y++) {
      for (let x = 1; x < this.cols - 1; x++) {
        if (!inland(x, y) || reserved(x, y)) continue;
        const roll = this.rand();
        const px = x * TILE + TILE / 2, py = y * TILE + TILE - 6;
        if (roll < 0.03 + forest(x, y) * 0.12) {
          this.blocked[y][x] = true;
          this.add.image(px, py + 4, 'shadow').setScale(1.1, 1).setDepth(py - 1);
          this.add.image(px, py, 'tree').setOrigin(0.5, 0.95).setDepth(py);
        } else if (roll > 0.985) {
          this.blocked[y][x] = true;
          this.add.image(px, py, 'rock').setOrigin(0.5, 0.9).setDepth(py);
        }
      }
    }
  }

  placeExpeditionProps() {
    const isl = this.island;
    this.resourceSprites = new Map();
    const at = (tx, ty, dy = -6) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE + dy });
    const look = {
      tree: { key: 'tree', origin: [0.5, 0.95], tint: 0xa8c8b8, shadow: 1.1 },
      rock: { key: 'rock', origin: [0.5, 0.9] },
      bush: { key: 'bush', origin: [0.5, 0.9], shadow: 0.8 },
      grass: { key: 'grass_tuft', origin: [0.5, 0.9], depthBias: -20 },
      crystal: { key: 'crystal', origin: [0.5, 0.92], shadow: 0.6 },
    };
    for (const r of isl.resources) {
      const L = look[r.type], { x, y } = at(r.tx, r.ty);
      const parts = [];
      if (L.shadow) parts.push(this.add.image(x, y + 4, 'shadow').setScale(L.shadow, 1).setDepth(y - 1));
      const img = this.add.image(x, y, L.key).setOrigin(...L.origin).setDepth(y + (L.depthBias ?? 0));
      if (L.tint) img.setTint(L.tint);
      if (r.type === 'crystal') this.tweens.add({ targets: img, alpha: 0.75, duration: 900 + (r.tx % 5) * 80, yoyo: true, repeat: -1 });
      parts.push(img);
      this.resourceSprites.set(r.id, parts);
    }
    for (const c of isl.chests) {
      const { x, y } = at(c.tx, c.ty, -8);
      this.add.image(x, y + 4, 'shadow').setScale(0.8, 1).setDepth(y - 1);
      this.add.image(x, y, 'chest').setOrigin(0.5, 0.9).setDepth(y);
    }
    const lb = this.state.expedition.lostBag;
    if (lb) {
      const spr = this.add.image(lb.x, lb.y, 'lostbag').setOrigin(0.5, 0.9).setDepth(lb.y);
      this.tweens.add({ targets: spr, y: lb.y - 4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.lostBag = { x: lb.x, y: lb.y, sprite: spr };
    }
    // airship floats in the sky just off the landing edge
    const a = isl.airship;
    const ax = a.tx * TILE + TILE / 2, ay = a.ty * TILE + TILE / 2 + 18;
    const ship = this.add.image(ax, ay, 'airship').setOrigin(0.5, 0.7).setDepth(ay - 30);
    this.tweens.add({ targets: ship, y: ay - 6, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.airship = { x: ax, y: (a.ty - 1) * TILE + TILE / 2, sprite: ship }; // interact from the edge cell next to the landing
  }

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
      return { ...w, data, level, sprite, shadow, home, target: { ...home }, phase: this.rand() * 6, wanderAt: 0, cooldown: this.time.now + 2000 };
    });
  }

  updateWild(time, dt) {
    if (!this.wild) return;
    const p = this.player;
    for (const w of this.wild) {
      const s = w.sprite;
      if (time > w.wanderAt) {
        // pick a nearby walkable spot to stroll to
        for (let k = 0; k < 6; k++) {
          const tx = w.home.x + (this.rand() - 0.5) * 140, ty = w.home.y + (this.rand() - 0.5) * 100;
          if (this.footFits(tx, ty)) { w.target = { x: tx, y: ty }; break; }
        }
        w.wanderAt = time + 2500 + this.rand() * 3500;
      }
      const dx = w.target.x - s.x, dy = w.target.y - s.y, dist = Math.hypot(dx, dy);
      if (dist > 3) {
        const k = Math.min(1, (36 * dt) / dist);
        const nx = s.x + dx * k, ny = s.y + dy * k;
        if (this.footFits(nx, ny)) { s.x = nx; s.y = ny; } else w.wanderAt = 0;
        if (Math.abs(dx) > 2) s.setFlipX(dx < 0);
      }
      w.phase += dt * (dist > 3 ? 9 : 2.5);
      s.setDisplayOrigin(s.width / 2, s.height * 0.92 + Math.abs(Math.sin(w.phase)) * (dist > 3 ? 4 : 1.5) / s.scaleY);
      s.setDepth(s.y);
      w.shadow.setPosition(s.x, s.y + 2).setDepth(s.y - 1);
      if (!this.sleeping && time > w.cooldown && Phaser.Math.Distance.Between(p.x, p.y, s.x, s.y) < 34) {
        w.cooldown = time + 4000;
        if (!this.startBattle(w)) this.hopAway(w, time);
      }
    }
  }

  hopAway(w, time) {
    const s = w.sprite, p = this.player;
    const ax = s.x - p.x, ay = s.y - p.y, len = Math.hypot(ax, ay) || 1;
    w.target = { x: s.x + ax / len * 70, y: s.y + ay / len * 70 };
    if (!this.footFits(w.target.x, w.target.y)) w.target = { ...w.home };
    w.wanderAt = time + 3000;
  }

  // ---------- pet battle (T06) ----------
  partyInsts() { return this.state.party.map((uid) => this.state.pets.find((x) => x.uid === uid)).filter(Boolean); }

  // Returns false when no battle started (tired party).
  startBattle(w) {
    if (this.inBattle || this.traveling || this.sleeping) return false;
    const party = this.partyInsts();
    if (!canStartBattle(party)) { this.showToast('伙伴们累了，回家休息吧'); return false; }   // A06
    this.session.pullFromRegistry();
    const enemies = makeWildGroup({ species: w.species, level: w.level, islandSeed: this.island.seed, wildIndex: Number(w.id.slice(1)), day: this.state.day, pool: PETS.map((x) => x.id) });
    const battle = createBattle({ party, enemies, inventory: this.state.inventory });
    this.inBattle = w;
    this.clock.pause('battle');            // A07: time stops during the battle
    this.session.store.block('battle');    // A03: refreshing mid-battle loads the state from before it
    this.actions.queueInteract && this.actions.consumeInteract();
    this.scene.get('ui').joystick?.release();
    this.scene.sleep('ui');
    this.scene.launch('battle', { battle, wildId: w.id });
    this.scene.pause();
    return true;
  }

  onBattleEnd({ result, wildId, summary }) {
    const w = this.inBattle;
    this.inBattle = null;
    this.scene.resume();
    this.scene.wake('ui');
    this.clock.resume('battle');
    this.session.store.unblock('battle');
    const now = this.time.now;
    if (w) {
      if (result === 'win' || result === 'caught') {   // defeated or caught: gone for good (in the island record)
        this.tweens.add({ targets: [w.sprite, w.shadow], alpha: 0, duration: 400, onComplete: () => { w.sprite.destroy(); w.shadow.destroy(); } });
        this.wild = this.wild.filter((x) => x !== w);
        this.island.pets = this.island.pets.filter((x) => x.id !== wildId);
      } else {
        w.cooldown = now + (result === 'lose' ? 8000 : 4000);
        this.hopAway(w, now);
        if (result === 'lose') this.showToast('伙伴们玩累了，野生宠物跑开了');
      }
    }
    // a caught pet that joined the party comes along right away
    if (result === 'caught' && summary?.caught?.joined) {
      const inst = this.state.pets.find((x) => x.uid === summary.caught.uid);
      if (inst) {
        const pet = this.addPetSprite(inst, { x: w?.sprite.x ?? this.player.x, y: w?.sprite.y ?? this.player.y });
        this.pets.push(pet);
      }
    }
    this.session.save('battle');
  }

  // ---------- travel ----------
  // fade out → change the state (area, time) → save → rebuild the scene
  travel(change, notice) {
    if (this.traveling || this.sleeping) return;
    this.traveling = true;
    this.session.pullFromRegistry();
    const cam = this.cameras.main;
    cam.fadeOut(450, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      const r = change();
      if (r && r.ok === false) { this.traveling = false; cam.fadeIn(300); return; }
      if (notice) this.session.notice = notice;
      this.session.pushToRegistry();
      this.session.save('travel');
      this.scene.restart();
    });
  }

  // Interim until T23: wake up at home the next morning, nothing is lost yet.
  // Fainting (docs/06 第 2 节): the whole result is applied and saved at once,
  // then the animation plays (refreshing mid-animation is safe, E10).
  faint() {
    if (this.fainted || this.area !== 'expedition') return;
    this.fainted = true;
    this.clock.pause('faint');
    this.session.pullFromRegistry();
    const r = faintState(this.state, { x: this.player.x, y: this.player.y });
    this.session.pushToRegistry();
    this.session.save('faint');
    const n = r.dropped.reduce((s, x) => s + x.count, 0);
    const notice = n
      ? `在家里醒来了。${n} 件东西掉在了那座岛上，坐飞艇「回到上次的岛」可以捡回来。${r.replaced ? '（之前的失物包找不回来了）' : ''}`
      : '在家里醒来了，生命 50、饱食 50';
    this.showToast('你倒下了……');
    this.tweens.add({ targets: this.player, angle: 90, duration: 400 });
    this.time.delayedCall(900, () => { this.fainted = false; this.travel(() => ({ ok: true }), notice); });
  }

  // Lost bag on this island: walk onto it to get everything back (what fits).
  checkLostBag(time) {
    const bag = this.lostBag;
    if (!bag || time < (bag.cooldown ?? 0)) return;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, bag.x, bag.y) > 36) return;
    const { took, left } = pickUpLostBag(this.state);
    if (took.length) {
      const names = took.map((s) => `${ITEMS[s.id]?.name ?? s.id} ×${s.count}`).join('、');
      this.showToast(left.length ? `捡回了 ${names}；背包满了，还有 ${left.length} 种留在包里` : `捡回了失物包：${names}`);
      this.session.save('lostbag');
    } else this.showToast('背包满了，先腾出位置再来捡');
    if (!this.state.expedition.lostBag) {
      this.tweens.add({ targets: bag.sprite, alpha: 0, y: bag.sprite.y - 20, duration: 300, onComplete: () => bag.sprite.destroy() });
      this.lostBag = null;
    } else bag.cooldown = time + 3000;
  }

  // ---------- gathering (T19) ----------
  resourceCenter(r) { return { x: r.tx * TILE + TILE / 2, y: r.ty * TILE + TILE / 2 }; }

  nearestResourceSpot() {
    const p = this.player;
    let best = null, bestD = 62;
    for (const r of this.island.resources) {
      const c = this.resourceCenter(r);
      const d = Phaser.Math.Distance.Between(p.x, p.y, c.x, c.y);
      if (d < bestD) { best = r; bestD = d; }
    }
    if (!best) return null;
    const pv = gatherPreview(this.state, best.type), g = GATHER[best.type];
    const gainText = pv.need ? `需要${ITEMS[pv.need].name}` : Object.entries(pv.gains).map(([id, n]) => `${ITEMS[id].name} ×${n}`).join(' ');
    const c = this.resourceCenter(best);
    return { at: c, label: `${g.name} · ${pv.need ? gainText : `采集（${gainText}）`}`, tagY: best.type === 'tree' ? 108 : 52, act: () => this.gatherResource(best) };
  }

  gatherResource(r) {
    const res = gather(this.state, r);
    if (!res.ok) {
      this.showToast(res.reason === 'need-tool' ? `要用${ITEMS[res.tool].name}才能采集` : res.reason === 'full' ? '背包满了，先腾出一格' : '已经采过了');
      return;
    }
    this.session.markDirty();
    this.island.resources = this.island.resources.filter((x) => x.id !== r.id);
    this.blocked[r.ty][r.tx] = false;
    const parts = this.resourceSprites.get(r.id) ?? [];
    this.resourceSprites.delete(r.id);
    this.tweens.add({ targets: parts, alpha: 0, y: '-=10', duration: 260, onComplete: () => parts.forEach((o) => o.destroy()) });
    this.tweens.add({ targets: this.player, scaleX: 1.12, scaleY: 0.88, duration: 90, yoyo: true });
    const c = this.resourceCenter(r);
    const label = Object.entries(res.gains).map(([id, n]) => `+${n} ${ITEMS[id].name}`).join('  ');
    const pop = this.add.text(c.x, c.y - 40, label, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ffffff', stroke: '#5b3d26', strokeThickness: 4 })
      .setOrigin(0.5).setDepth(9100);
    this.tweens.add({ targets: pop, y: pop.y - 36, alpha: 0, delay: 350, duration: 700, onComplete: () => pop.destroy() });
  }

  // Test helper: stand next to the first resource of `type`; returns its id.
  standByResource(type) {
    const r = this.island?.resources.find((x) => x.type === type && [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => this.isWalkableTile(x.tx + dx, x.ty + dy)));
    if (!r) return null;
    const [dx, dy] = [[0, 1], [0, -1], [1, 0], [-1, 0]].find(([ax, ay]) => this.isWalkableTile(r.tx + ax, r.ty + ay));
    this.teleport((r.tx + dx) * TILE + TILE / 2, (r.ty + dy) * TILE + TILE / 2);
    return r.id;
  }

  // test hooks
  travelTo(seed) {
    this.state.expedition = { seed, biome: 'mistwood', changes: emptyChanges() };
    this.state.player.area = 'expedition';
    this.state.player.x = null; this.state.player.y = null;
    this.session.save('travel');
    this.scene.restart();
  }

  goHome() { this.travel(() => returnHome(this.state)); }

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
  }

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
  }

  addPetSprite(inst, home) {
    const data = species(inst.species);
    const shadow = this.add.image(home.x, home.y + 2, 'shadow').setScale(0.75);
    const sprite = this.add.image(home.x, home.y, petTextureKey(data.id)).setOrigin(0.5, 0.92);
    const pet = { data, inst, sprite, shadow, home, target: { ...home }, phase: this.rand() * Math.PI * 2, wanderAt: 0 };
    this.applyPetTexture(pet);
    return pet;
  }

  // Party changed in the party panel: the new leader follows the player.
  syncParty() {
    const lead = this.pets.find((x) => x.inst.uid === this.state.party[0]);
    if (lead && lead !== this.follower) {
      const old = this.follower;
      if (old && !this.followLag(old)) { old.target = { ...old.home }; old.wanderAt = 0; }
      this.follower = lead;
    }
  }

  // Move the player instantly (used by tests; later by doors / airship) and
  // reset the follow trail so the follower doesn't walk the old path.
  teleport(x, y) {
    this.player.setPosition(x, y);
    this.trail = [{ x, y }];
    if (this.follower) this.follower.sprite.setPosition(x - 46, y + 6);
  }

  applyPetTexture(pet) {
    const human = pet.inst.form === 'human' && !!pet.data.humanForm;
    pet.sprite.setTexture(petTextureKey(human ? pet.data.humanForm : pet.data.id));
    const h = human ? PET_HEIGHT * 1.15 : PET_HEIGHT;
    pet.sprite.setScale(h / pet.sprite.height);
  }

  // ---------- world-space labels; screen UI lives in UIScene ----------

  createWorldUi() {
    this.nameTag = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '14px', color: '#ffffff', backgroundColor: '#5b3d26', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(9000).setVisible(false);
    if (DEBUG) this.debugText = this.add.text(GAME_W - 10, GAME_H - 40, '', { fontFamily: 'monospace', fontSize: '12px', color: '#000' }).setOrigin(1, 0).setScrollFactor(0).setDepth(10003);
  }

  showToast(msg) { this.game.events.emit('toast', msg); }

  // ---------- time & day/night (T10) ----------

  createDayNight() {
    this.clock = new GameClock({ msPerMin: MS_PER_GAME_MIN / TIMESCALE });
    this.sleeping = false;
    // darkness = a screen-sized texture multiplied over the world, with soft
    // holes erased where lights are (campfires, torch, glowing pets)
    if (this.textures.exists('night_rt')) this.textures.remove('night_rt');
    this.tint = this.add.renderTexture(0, 0, GAME_W, GAME_H).setOrigin(0).setScrollFactor(0).setDepth(8500)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.brush = this.make.image({ key: 'lightbrush', add: false }).setOrigin(0.5);
    if (this.area === 'expedition') this.createFog();
    this.refreshTint();
  }

  refreshTint() {
    const t = tintAt(this.state.clock);
    this.tintColor = t.color;
    this.tintDark = t.dark;
  }

  currentLights() { return N.lights(this.state, this.player, this.fires); }

  drawLighting() {
    const rt = this.tint;
    if (!this.tintDark) { rt.setVisible(false); return; }
    rt.setVisible(true).clear().fill(this.tintColor, 1);
    const cam = this.cameras.main;
    for (const l of this.currentLights()) {
      this.brush.setScale((l.r * 2.2) / this.brush.width);   // visible edge ≈ r (where monsters stop)
      rt.erase(this.brush, l.x - cam.scrollX, l.y - cam.scrollY);
    }
    rt.render();
    // torch flame in the player's hand
    const lit = N.torchLit(this.state);
    if (lit && !this.torchFx) {
      this.torchFx = this.add.image(0, 0, 'item_torch').setScale(0.3).setOrigin(0.5, 1);
      this.tweens.add({ targets: this.torchFx, scaleY: 0.33, duration: 180, yoyo: true, repeat: -1 });
    }
    if (!lit && this.torchFx) { this.torchFx.destroy(); this.torchFx = null; }
    if (this.torchFx) this.torchFx.setPosition(this.player.x + 14, this.player.y - 18).setDepth(this.player.y + 1);
  }

  // drifting fog over the 雾林 at night
  createFog() {
    for (let i = 0; i < 10; i++) {
      const c = this.add.image(this.rand() * this.cols * TILE, this.rand() * this.rows * TILE, 'cloud')
        .setTint(0xc8d4e0).setAlpha(0).setScale(1.6 + this.rand()).setDepth(8400);
      c.drift = 8 + this.rand() * 10;
      this.fogWisps.push(c);
    }
  }

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
    const canStand = (x, y) => this.footFits(x, y);
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
  }

  spawnMonster(at, time) {
    const sprite = this.add.image(at.x, at.y, 'fogmonster').setOrigin(0.5, 0.9).setAlpha(0).setDepth(8550);
    this.tweens.add({ targets: sprite, alpha: 0.7, duration: 800 });
    this.monsters.push({ x: at.x, y: at.y, sprite, phase: this.rand() * 6, nextAttack: time + 2000 });
    if (this.monsters.length === 1) this.showToast('雾里有什么东西在靠近……');
  }

  warn(time) {
    const g = this.add.graphics().setDepth(8560);   // above the darkness: the warning must always be visible
    this.warnings.push({ x: this.player.x, y: this.player.y, r: N.MONSTER.warnRadius, landAt: time + N.MONSTER.warnMs, g });
  }

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
  }

  dissolveMonsters() {
    for (const m of this.monsters) this.tweens.add({ targets: m.sprite, alpha: 0, duration: 1200, onComplete: () => m.sprite.destroy() });
    for (const w of this.warnings) w.g.destroy();
    this.monsters = []; this.warnings = [];
  }

  // test hooks
  debugSpawnMonster(x, y) { this.spawnMonster({ x, y }, this.time.now); this.monsters.at(-1).nextAttack = 0; }
  debugNight() {
    return { monsters: this.monsters.map((m) => ({ x: Math.round(m.x), y: Math.round(m.y) })), warnings: this.warnings.length, lights: this.currentLights(), lastSpawn: this.lastSpawn };
  }

  updateTime(delta) {
    const c = this.clock;
    if (this.registry.get('uiModal')) c.pause('menu'); else c.resume('menu');
    const before = this.state.clock;
    const events = c.advance(this.state, delta);
    if (this.state.clock !== before) { this.registry.set('clock', this.state.clock); this.refreshTint(); }
    for (const e of events) this.onTimeEvent(e);
  }

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
  }

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
      if (e === 'faint') this.game.events.emit('player-faint'); // handled by T23 (lost bag, wake at home)
    }
  }

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
  }

  // Test helper: run game time forward by `minutes` through the normal path.
  debugAdvance(minutes) { this.updateTime(minutes * this.clock.msPerMin + 1); }

  // ---------- loop ----------

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.actions.update();
    this.updateTime(Math.min(delta, 250));
    if (!this.sleeping) this.movePlayer(dt);
    this.updatePets(time, dt);
    this.updateWild(time, dt);
    this.updateNight(time, delta);
    this.drawLighting();
    if (!this.sleeping && !this.fainted) this.checkLostBag(time);
    this.updateInteraction();
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > this.cols * TILE * 0.5 + 200) c.x = -200;
    }
    if (this.debugText) {
      const p = this.player;
      this.debugText.setText(`fps ${Math.round(this.game.loop.actualFps)}\ntile ${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)}\n${formatClock(this.state.clock)} ${phaseAt(this.state.clock)} ×${TIMESCALE}`);
    }
  }

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
  }

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
  }

  // Trail delay for pets that follow the player: the follower always; on
  // expeditions the whole party walks behind in party order.
  followLag(pet) {
    if (pet === this.follower) return 9;
    if (this.area !== 'expedition') return 0;
    const rank = this.state.party.indexOf(pet.inst.uid);
    return rank < 0 ? 0 : 9 + 9 * Math.max(1, rank);
  }

  nearestPet() {
    const p = this.player;
    let best = null, bestD = INTERACT_RANGE;
    for (const pet of this.pets) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, pet.sprite.x, pet.sprite.y);
      if (d < bestD) { best = pet; bestD = d; }
    }
    return best;
  }

  updateInteraction() {
    if (this.sleeping) return;
    const p = this.player;
    // fixed spots first (bed, dock, airship), then pets
    const spots = [
      this.bed && { at: this.bed, label: '帐篷 · 点互动睡觉', tagY: 92, act: () => this.game.events.emit('sleep-request', this.state.clock) },
      this.dock && { at: this.dock, label: '飞艇码头 · 点互动出发', tagY: 40, act: () => this.game.events.emit('dock-request', { clock: this.state.clock, last: this.state.expedition?.seed ?? null, lostBag: lostBagCount(this.state) }) },
      this.airship && { at: this.airship, label: '飞艇 · 点互动回家', tagY: 60, act: () => this.game.events.emit('airship-request', this.state.clock) },
    ].filter(Boolean);
    let spot = spots.find((s) => Phaser.Math.Distance.Between(p.x, p.y, s.at.x, s.at.y) < INTERACT_RANGE);
    if (!spot && this.island) spot = this.nearestResourceSpot();
    if (spot) {
      if (!this.lastCanAct) { this.lastCanAct = true; this.game.events.emit('interact-available', true); }
      this.nameTag.setText(spot.label).setBackgroundColor('#5b3d26').setPosition(spot.at.x, spot.at.y - spot.tagY).setVisible(true);
      if (this.actions.consumeInteract()) spot.act();
      return;
    }
    const pet = this.nearestPet();
    const canAct = !!(pet && (pet !== this.follower || pet.data.humanForm));
    if (canAct !== this.lastCanAct) {   // tell the UI only when it changes
      this.lastCanAct = canAct;
      this.game.events.emit('interact-available', canAct);
    }
    if (pet) {
      const label = pet === this.follower
        ? (pet.data.humanForm ? `${pet.data.name} · 点互动${pet.inst.form === 'human' ? '变回原形' : '化形'}（演示）` : `${pet.data.name} · 跟着你`)
        : `${pet.data.name} · ${pet.data.element}`;
      this.nameTag.setText(label).setBackgroundColor(ELEMENT_COLORS[pet.data.element])
        .setPosition(pet.sprite.x, pet.sprite.y - pet.sprite.displayHeight - 6).setVisible(true);
    } else {
      this.nameTag.setVisible(false);
    }

    if (!this.actions.consumeInteract() || !canAct) return;
    if (pet === this.follower) {
      pet.inst.form = pet.inst.form === 'human' ? 'animal' : 'human';
      this.applyPetTexture(pet);
      this.showToast(pet.inst.form === 'human' ? `${pet.data.name} 化形了！` : `${pet.data.name} 变回了原形`);
      this.session.markDirty();
      return;
    }
    const old = this.follower;
    old.home = { ...pet.home };
    old.target = { ...pet.home };
    old.wanderAt = 0;
    if (old.inst.form === 'human') { old.inst.form = 'animal'; this.applyPetTexture(old); }
    this.follower = pet;
    // the new follower leads the party (max 3); interim until the party panel (T07)
    this.state.party = [pet.inst.uid, ...this.state.party.filter((u) => u !== pet.inst.uid)].slice(0, 3);
    this.session.save('party');
    this.showToast(`${pet.data.name} 跟着你啦！`);
    this.tweens.add({ targets: pet.sprite, scaleX: pet.sprite.scaleX * 1.15, scaleY: pet.sprite.scaleY * 0.85, duration: 90, yoyo: true });
  }

  // Test helper: centre (px) of the first tile from which `len` tiles in
  // direction (dx, dy) are all walkable, searching outward from the spawn.
  findClearRun(dx, dy, len) {
    for (let r = 0; r < 20; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          const tx = this.spawnTile.x + ox, ty = this.spawnTile.y + oy;
          let ok = true;
          for (let i = -1; i <= len && ok; i++) {
            // also require the side columns/rows clear so the foot box never clips
            for (let s = -1; s <= 1 && ok; s++) {
              ok = this.isWalkableTile(tx + dx * i + dy * s, ty + dy * i + dx * s);
            }
          }
          if (ok) return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
        }
      }
    }
    return null;
  }

  // State snapshot for the automated smoke test (tools/smoke-test.mjs).
  debugState() {
    return {
      player: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
      follower: this.follower.data.id,
      followerHuman: this.follower.inst.form === 'human',
      onWalkable: this.footFits(this.player.x, this.player.y),
      day: this.state.day, clock: this.state.clock, phase: phaseAt(this.state.clock), tint: this.tintDark,
      sleeping: this.sleeping, bed: this.bed, dock: this.dock, airshipSpot: this.airship ? { x: this.airship.x, y: this.airship.y } : null, area: this.area,
      hunger: this.state.player.hunger, hp: this.state.player.hp, inBattle: !!this.inBattle, party: [...this.state.party], lostBag: this.lostBag ? { x: this.lostBag.x, y: this.lostBag.y } : null,
      island: this.island ? { seed: this.island.seed, resources: this.island.resources.length, pets: this.island.pets.length, chests: this.island.chests.length, landing: this.island.landing } : null,
    };
  }
}
