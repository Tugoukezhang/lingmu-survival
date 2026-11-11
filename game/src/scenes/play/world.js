// PlayScene methods — Map building and collision: home island, expedition islands (from the seed), ground drawing, props.
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
    // the farm field (T11): right-below the spawn, boxes on its right edge
    this.farmRect = { x: this.spawnTile.x + 4, y: this.spawnTile.y + 2, w: 6, h: 4 };
    // the land you can buy (T14): becomes a second field
    this.expandRect = { x: this.spawnTile.x + 5, y: this.spawnTile.y - 7, w: 6, h: 4 };
    // the cottage (T15), up-left of the spawn
    this.cottageRect = { x: this.spawnTile.x - 4, y: this.spawnTile.y - 8, w: 4, h: 3 };
  },

  // Expedition island from the saved seed, minus what was already taken.
  buildExpedition() {
    const exp = this.state.expedition;
    this.island = applyChanges(generateIsland(exp.seed), exp.changes);
    this.cols = this.island.cols; this.rows = this.island.rows;
    this.walk = this.island.walk;
    this.blocked = blockedGrid(this.island);
    this.water = this.island.water;
    const l = this.island.landing;
    this.spawnTile = { x: l.tx, y: l.ty };
    this.meadowTile = { x: l.tx, y: l.ty };
  },

  // wade: may this walker enter shallow water? (the player with 航海鲨 in the party)
  isWalkableTile(tx, ty, wade = this.wading) {
    return ty >= 0 && ty < this.rows && tx >= 0 && tx < this.cols && this.walk[ty][tx] && !this.blocked[ty][tx] && (wade || !this.water?.[ty][tx]);
  },

  isOnIsland(px, py) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    return ty >= 0 && ty < this.rows && tx >= 0 && tx < this.cols && this.walk[ty][tx];
  },

  isWalkablePx(px, py, wade = this.wading) {
    return this.isWalkableTile(Math.floor(px / TILE), Math.floor(py / TILE), wade);
  },

  footFits(px, py, wade = this.wading) {
    return this.isWalkablePx(px - FOOT.hw, py - FOOT.hh, wade) && this.isWalkablePx(px + FOOT.hw, py - FOOT.hh, wade)
      && this.isWalkablePx(px - FOOT.hw, py + FOOT.hh, wade) && this.isWalkablePx(px + FOOT.hw, py + FOOT.hh, wade);
  },

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
  },

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
    // shallow ponds (涉水): water over the grass with a soft rim and sparkles
    if (this.water) {
      const wt = tiles.filter(([x, y]) => this.water[Math.floor(y / TILE)][Math.floor(x / TILE)]);
      g.fillStyle = '#5c9a4a'; for (const [x, y] of wt) { g.beginPath(); g.arc(x, y + 3, r * 0.92, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#6fb4d8'; for (const [x, y] of wt) { g.beginPath(); g.arc(x, y, r * 0.86, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#8fd0ec'; for (const [x, y] of wt) { g.beginPath(); g.arc(x - 3, y - 3, r * 0.6, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
      for (const [x, y] of wt) if (this.rand() < 0.5) { g.beginPath(); g.moveTo(x - 8, y + 4); g.quadraticCurveTo(x, y, x + 8, y + 4); g.stroke(); }
    }
    if (this.area === 'town') {
      // cobbled plaza in the middle of town
      const px = (this.cols / 2) * TILE, py = (this.rows / 2) * TILE;
      g.fillStyle = 'rgba(200,190,170,0.85)'; g.beginPath(); g.ellipse(px, py, TILE * 5, TILE * 3.2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(160,150,135,0.6)';
      for (let i = 0; i < 70; i++) { const a = i * 2.39, rr = Math.sqrt(i / 70); g.beginPath(); g.ellipse(px + Math.cos(a) * rr * TILE * 4.6, py + Math.sin(a) * rr * TILE * 2.9, 9, 6, 0, 0, Math.PI * 2); g.fill(); }
    } else if (this.area === 'home') {
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
  },

  placeObstacles() {
    // campfire next to the spawn point
    const fx = this.spawnTile.x - 2, fy = this.spawnTile.y - 2;
    this.blocked[fy][fx] = true;
    const cpx = fx * TILE + TILE / 2, cpy = fy * TILE + TILE - 4;
    const fire = this.add.image(cpx, cpy, 'campfire_lit').setOrigin(0.5, 0.85).setDepth(cpy);
    this.fires.push({ x: cpx, y: cpy - 12 });
    fire.setScale(64 / fire.width);
    this.tweens.add({ targets: fire, scaleY: fire.scaleY * 1.04, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // placeholder tent = the bed until the house exists (sleep → next day)
    const bx = this.spawnTile.x + 2, by = this.spawnTile.y - 2;
    this.blocked[by][bx] = true;
    const tpx = bx * TILE + TILE / 2, tpy = by * TILE + TILE - 2;
    this.add.image(tpx, tpy, 'tent').setOrigin(0.5, 0.92).setDepth(tpy);
    this.bed = { x: tpx, y: tpy + 4 };

    // home storage box (仓库): extra stacks go here when the bag shrinks
    const sx = this.spawnTile.x + 3, sy = this.spawnTile.y;
    this.blocked[sy][sx] = true;
    const spx = sx * TILE + TILE / 2, spy = sy * TILE + TILE - 6;
    this.add.image(spx, spy, 'storage').setOrigin(0.5, 0.9).setDepth(spy);
    this.storageSpot = { x: spx, y: spy };

    // airship dock on the south edge below the spawn point
    let dy = this.spawnTile.y;
    while (this.walk[dy + 1]?.[this.spawnTile.x]) dy++;
    const dkx = this.spawnTile.x * TILE + TILE / 2, dky = dy * TILE + TILE;
    this.add.image(dkx - 20, dky + 36, 'dock').setOrigin(0.5, 1).setDepth(dky - 40);   // pier reaching out over the clouds; the airship waits at its end
    const ship = this.add.image(dkx + 92, dky + 40, 'airship').setOrigin(0.5, 0.7).setDepth(dky + 60);
    this.tweens.add({ targets: ship, y: ship.y - 6, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.dock = { x: dkx, y: dky - 30 };
    this.dockTile = { x: this.spawnTile.x, y: dy };

    // rope bridge to 风铃小镇 on the west edge of the spawn row (T13)
    let wx = this.spawnTile.x;
    while (this.walk[this.spawnTile.y]?.[wx - 1]) wx--;
    this.bridgeTile = { x: wx, y: this.spawnTile.y };
    this.drawBridge(wx * TILE, this.spawnTile.y * TILE + TILE / 2, -1);
    this.homeBridge = { x: wx * TILE + TILE / 2, y: this.spawnTile.y * TILE + TILE / 2 };

    const reserved = (x, y) => Math.hypot(x - this.spawnTile.x, y - this.spawnTile.y) < 3.5
      || Math.hypot((x - this.meadowTile.x) / 1.6, y - this.meadowTile.y) < 3.2
      || Math.hypot(x - this.dockTile.x, y - this.dockTile.y) < 2.5
      || Math.hypot(x - this.bridgeTile.x, y - this.bridgeTile.y) < 2.5
      || (x >= this.cottageRect.x - 1 && x <= this.cottageRect.x + this.cottageRect.w && y >= this.cottageRect.y - 1 && y <= this.cottageRect.y + this.cottageRect.h + 1)
      || (x >= this.farmRect.x - 1 && x <= this.farmRect.x + this.farmRect.w + 1 && y >= this.farmRect.y - 1 && y <= this.farmRect.y + this.farmRect.h)
      || (x >= this.expandRect.x - 1 && x <= this.expandRect.x + this.expandRect.w && y >= this.expandRect.y - 1 && y <= this.expandRect.y + this.expandRect.h + 1);
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
          this.add.image(px, py, (x * 7 + y * 13) % 3 === 0 ? 'tree_b' : 'tree').setOrigin(0.5, 0.95).setDepth(py);
        } else if (roll > 0.985) {
          this.blocked[y][x] = true;
          this.add.image(px, py, (x + y) % 2 ? 'rock_b' : 'rock').setOrigin(0.5, 0.9).setDepth(py);
        }
      }
    }
    this.placeFarm();
    this.placeCottage();
  },

  placeExpeditionProps() {
    const isl = this.island;
    this.resourceSprites = new Map();
    const at = (tx, ty, dy = -6) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE + dy });
    const look = {
      tree: { key: 'tree', alt: 'tree_b', origin: [0.5, 0.95], tint: 0xdde9e2, shadow: 1.1 },
      rock: { key: 'rock', alt: 'rock_b', origin: [0.5, 0.9] },
      bush: { key: 'bush', origin: [0.5, 0.9], shadow: 0.8 },
      grass: { key: 'grass_tuft', origin: [0.5, 0.9], depthBias: -20 },
      crystal: { key: 'crystal', origin: [0.5, 0.92], shadow: 0.6 },
    };
    for (const r of isl.resources) {
      const L = look[r.type], { x, y } = at(r.tx, r.ty);
      const parts = [];
      if (L.shadow) parts.push(this.add.image(x, y + 4, 'shadow').setScale(L.shadow, 1).setDepth(y - 1));
      const key = L.alt && (r.tx * 7 + r.ty * 13) % 3 === 0 ? L.alt : L.key;   // two looks per type (T53)
      const img = this.add.image(x, y, key).setOrigin(...L.origin).setDepth(y + (L.depthBias ?? 0));
      if (L.tint) img.setTint(L.tint);
      if (r.type === 'crystal') this.tweens.add({ targets: img, alpha: 0.75, duration: 900 + (r.tx % 5) * 80, yoyo: true, repeat: -1 });
      parts.push(img);
      this.resourceSprites.set(r.id, parts);
    }
    for (const c of isl.chests) {
      const { x, y } = at(c.tx, c.ty, -8);
      const sh = this.add.image(x, y + 4, 'shadow').setScale(0.8, 1).setDepth(y - 1);
      const img = this.add.image(x, y, 'chest').setOrigin(0.5, 0.9).setDepth(y);
      this.chestSprites.set(c.id, [sh, img]);
    }
    for (const f of CP.fires(this.state)) this.addFireSprite(f);
    for (const t of isl.thorns ?? []) {
      const { x, y } = at(t.tx, t.ty, -4);
      this.thornSprites.set(t.id, this.add.image(x, y, 'thorn').setOrigin(0.5, 0.9).setDepth(y));
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
  },

};
