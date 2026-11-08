import { GAME_W, GAME_H, TILE, COLORS, FONT, DEBUG, SEED } from '../config.js';
import { PETS, ELEMENT_COLORS, petTextureKey } from '../data/pets.js';
import { mulberry32, valueNoise2D } from '../systems/rng.js';
import InputActions from '../systems/input.js';
import VirtualJoystick from '../ui/VirtualJoystick.js';

// T02 technical baseline: a placeholder floating island where the player
// walks with the joystick or keyboard, one pet follows, the others idle on a
// meadow, and the action button swaps the follower. No gameplay systems yet.

const COLS = 50;
const ROWS = 34;
const CLIFF = 30;            // px of cliff face drawn below the island edge
const SPEED = 170;           // player px/s
const PET_HEIGHT = 74;       // on-screen pet height in px
const INTERACT_RANGE = 70;
const FOOT = { hw: 10, hh: 6 }; // player foot box (collision)

export default class PlayScene extends Phaser.Scene {
  constructor() { super('play'); }

  create() {
    this.rand = mulberry32(SEED);
    this.buildIsland();
    this.buildBackdrop();
    this.drawGround();
    this.placeObstacles();
    this.createPlayer();
    this.createPets();

    this.joystick = new VirtualJoystick(this);
    this.actions = new InputActions(this, this.joystick);
    this.createHud();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, COLS * TILE, ROWS * TILE + CLIFF + TILE);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setRoundPixels(true);
  }

  // ---------- world ----------

  buildIsland() {
    const noise = valueNoise2D(SEED + 7, 6);
    const cx = COLS / 2, cy = ROWS / 2, rx = 21, ry = 13;
    this.walk = [];
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
        row.push(d + (noise(x, y) - 0.5) * 0.7 < 1);
      }
      this.walk.push(row);
    }
    this.blocked = this.walk.map((r) => r.map(() => false));
    this.spawnTile = { x: Math.floor(cx), y: Math.floor(cy) };
    this.meadowTile = { x: Math.floor(cx) - 7, y: Math.floor(cy) + 2 };
  }

  isWalkableTile(tx, ty) {
    return ty >= 0 && ty < ROWS && tx >= 0 && tx < COLS && this.walk[ty][tx] && !this.blocked[ty][tx];
  }

  isWalkablePx(px, py) {
    return this.isWalkableTile(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  footFits(px, py) {
    return this.isWalkablePx(px - FOOT.hw, py - FOOT.hh) && this.isWalkablePx(px + FOOT.hw, py - FOOT.hh)
      && this.isWalkablePx(px - FOOT.hw, py + FOOT.hh) && this.isWalkablePx(px + FOOT.hw, py + FOOT.hh);
  }

  buildBackdrop() {
    const sky = this.textures.createCanvas('sky', GAME_W, GAME_H);
    const g = sky.getContext();
    const grd = g.createLinearGradient(0, 0, 0, GAME_H);
    grd.addColorStop(0, '#8ccbe3'); grd.addColorStop(1, '#e6f5f7');
    g.fillStyle = grd; g.fillRect(0, 0, GAME_W, GAME_H);
    sky.refresh();
    this.add.image(0, 0, 'sky').setOrigin(0).setScrollFactor(0).setDepth(-30);

    this.clouds = [];
    for (let i = 0; i < 9; i++) {
      const c = this.add.image(this.rand() * COLS * TILE * 0.5, this.rand() * ROWS * TILE * 0.5, 'cloud')
        .setScrollFactor(0.3).setDepth(-20).setAlpha(0.7 + this.rand() * 0.3).setScale(0.8 + this.rand() * 0.8);
      c.speed = 6 + this.rand() * 10;
      this.clouds.push(c);
    }
  }

  drawGround() {
    const W = COLS * TILE, H = ROWS * TILE + CLIFF + 8;
    const tex = this.textures.createCanvas('ground', W, H);
    const g = tex.getContext();
    const r = TILE * 0.74;
    const tiles = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (this.walk[y][x]) tiles.push([x * TILE + TILE / 2, y * TILE + TILE / 2]);

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
    for (const [x, y] of tiles) { g.fillStyle = '#9ccf6a'; g.beginPath(); g.arc(x, y - 2, r, 0, Math.PI * 2); g.fill(); }
    // grass top with gentle colour variation
    const noise = valueNoise2D(SEED + 11, 4);
    for (const [x, y] of tiles) {
      const n = noise(x / TILE, y / TILE);
      g.fillStyle = `rgb(${Math.round(118 + n * 22)},${Math.round(178 + n * 18)},${Math.round(84 + n * 10)})`;
      g.beginPath(); g.arc(x, y, r * 0.96, 0, Math.PI * 2); g.fill();
    }
    // meadow patch for the pets
    const m = this.meadowTile;
    g.fillStyle = 'rgba(200,232,140,0.55)';
    g.beginPath(); g.ellipse(m.x * TILE + TILE / 2, m.y * TILE + TILE / 2, TILE * 3.6, TILE * 2.4, 0, 0, Math.PI * 2); g.fill();
    // grass blades and flowers
    for (const [x, y] of tiles) {
      for (let i = 0; i < 3; i++) {
        const bx = x + (this.rand() - 0.5) * TILE, by = y + (this.rand() - 0.5) * TILE;
        g.strokeStyle = 'rgba(70,120,50,0.45)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - 2, by - 6); g.moveTo(bx, by); g.lineTo(bx + 2, by - 5); g.stroke();
      }
      if (this.rand() < 0.12) {
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
    const reserved = (x, y) => Math.hypot(x - this.spawnTile.x, y - this.spawnTile.y) < 3.5
      || Math.hypot((x - this.meadowTile.x) / 1.6, y - this.meadowTile.y) < 3.2;
    const inland = (x, y) => this.walk[y]?.[x] && this.walk[y - 1]?.[x] && this.walk[y + 1]?.[x] && this.walk[y]?.[x - 1] && this.walk[y]?.[x + 1];
    const forest = valueNoise2D(SEED + 23, 5);
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
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

  // ---------- actors ----------

  createPlayer() {
    const x = this.spawnTile.x * TILE + TILE / 2, y = this.spawnTile.y * TILE + TILE / 2;
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
    this.pets = PETS.map((data, i) => {
      const home = { x: center.x + slots[i][0], y: center.y + slots[i][1] };
      const shadow = this.add.image(home.x, home.y + 2, 'shadow').setScale(0.75);
      const sprite = this.add.image(home.x, home.y, petTextureKey(data.id)).setOrigin(0.5, 0.92);
      const pet = { data, sprite, shadow, home, target: { ...home }, phase: this.rand() * Math.PI * 2, wanderAt: 0, human: false };
      this.applyPetTexture(pet);
      return pet;
    });
    this.follower = this.pets.find((p) => p.data.id === 'pup');
    const p = this.player;
    this.follower.sprite.setPosition(p.x - 46, p.y + 6);
  }

  // Move the player instantly (used by tests; later by doors / airship) and
  // reset the follow trail so the follower doesn't walk the old path.
  teleport(x, y) {
    this.player.setPosition(x, y);
    this.trail = [{ x, y }];
    if (this.follower) this.follower.sprite.setPosition(x - 46, y + 6);
  }

  applyPetTexture(pet) {
    const key = pet.human ? petTextureKey(pet.data.humanForm) : petTextureKey(pet.data.id);
    pet.sprite.setTexture(key);
    const h = pet.human ? PET_HEIGHT * 1.15 : PET_HEIGHT;
    pet.sprite.setScale(h / pet.sprite.height);
  }

  // ---------- HUD ----------

  createHud() {
    const panel = this.add.container(16, 14).setScrollFactor(0).setDepth(10000);
    const bg = this.add.rectangle(0, 0, 330, 54, COLORS.cream, 0.95).setOrigin(0).setStrokeStyle(4, COLORS.woodDark);
    const t1 = this.add.text(14, 8, '原型 M0 · 技术基线（占位画面）', { fontFamily: FONT, fontSize: '16px', color: COLORS.text, fontStyle: 'bold' });
    const t2 = this.add.text(14, 30, '摇杆 / WASD 移动 · 靠近宠物按「互动」', { fontFamily: FONT, fontSize: '13px', color: COLORS.text });
    panel.add([bg, t1, t2]);

    // action button (bottom-right)
    const bx = GAME_W - 96, by = GAME_H - 96;
    this.actionBtn = this.add.circle(bx, by, 46, COLORS.cream).setStrokeStyle(5, COLORS.woodDark)
      .setScrollFactor(0).setDepth(10000).setInteractive({ useHandCursor: true });
    this.actionLabel = this.add.text(bx, by, '互动', { fontFamily: FONT, fontSize: '20px', color: COLORS.text, fontStyle: 'bold' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(10001);
    this.actionBtn.on('pointerdown', () => {
      this.actions.queueInteract();
      this.tweens.add({ targets: [this.actionBtn, this.actionLabel], scale: 0.9, duration: 70, yoyo: true });
    });

    this.nameTag = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '14px', color: '#ffffff', backgroundColor: '#5b3d26', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(9000).setVisible(false);

    this.toast = this.add.text(GAME_W / 2, 84, '', {
      fontFamily: FONT, fontSize: '18px', color: COLORS.text, backgroundColor: '#fbf3dc', padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10002).setAlpha(0);

    if (DEBUG) this.debugText = this.add.text(GAME_W - 10, 10, '', { fontFamily: 'monospace', fontSize: '12px', color: '#000' }).setOrigin(1, 0).setScrollFactor(0).setDepth(10003);
  }

  showToast(msg) {
    this.toast.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toast);
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1400, duration: 500 });
  }

  // ---------- loop ----------

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    this.actions.update();
    this.movePlayer(dt);
    this.updatePets(time, dt);
    this.updateInteraction();
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > COLS * TILE * 0.5 + 200) c.x = -200;
    }
    if (this.debugText) {
      const p = this.player;
      this.debugText.setText(`fps ${Math.round(this.game.loop.actualFps)}\ntile ${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)}`);
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
      if (pet === this.follower) {
        target = this.trail[Math.max(0, this.trail.length - 9)];
      } else {
        if (time > pet.wanderAt) {
          pet.target = { x: pet.home.x + (this.rand() - 0.5) * 60, y: pet.home.y + (this.rand() - 0.5) * 36 };
          pet.wanderAt = time + 2000 + this.rand() * 3000;
        }
        target = pet.target;
      }
      const dx = target.x - s.x, dy = target.y - s.y;
      const dist = Math.hypot(dx, dy);
      const speed = pet === this.follower ? Math.min(SPEED * 1.4, dist * 4) : 30;
      // the follower keeps a little personal space so it never covers the player
      const tooClose = pet === this.follower
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
    const pet = this.nearestPet();
    const canAct = pet && (pet !== this.follower || pet.data.humanForm);
    this.actionBtn.setFillStyle(canAct ? COLORS.yellow : COLORS.cream, canAct ? 1 : 0.7);
    if (pet) {
      const label = pet === this.follower
        ? (pet.data.humanForm ? `${pet.data.name} · 点互动${pet.human ? '变回原形' : '化形'}（演示）` : `${pet.data.name} · 跟着你`)
        : `${pet.data.name} · ${pet.data.element}`;
      this.nameTag.setText(label).setBackgroundColor(ELEMENT_COLORS[pet.data.element])
        .setPosition(pet.sprite.x, pet.sprite.y - pet.sprite.displayHeight - 6).setVisible(true);
    } else {
      this.nameTag.setVisible(false);
    }

    if (!this.actions.consumeInteract() || !canAct) return;
    if (pet === this.follower) {
      pet.human = !pet.human;
      this.applyPetTexture(pet);
      this.showToast(pet.human ? `${pet.data.name} 化形了！` : `${pet.data.name} 变回了原形`);
      return;
    }
    const old = this.follower;
    old.home = { ...pet.home };
    old.target = { ...pet.home };
    old.wanderAt = 0;
    if (old.human) { old.human = false; this.applyPetTexture(old); }
    this.follower = pet;
    this.showToast(`${pet.data.name} 跟着你啦！`);
    this.tweens.add({ targets: pet.sprite, scaleX: pet.sprite.scaleX * 1.15, scaleY: pet.sprite.scaleY * 0.85, duration: 90, yoyo: true });
  }

  // State snapshot for the automated smoke test (tools/smoke-test.mjs).
  debugState() {
    return {
      player: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
      follower: this.follower.data.id,
      followerHuman: this.follower.human,
      onWalkable: this.footFits(this.player.x, this.player.y),
    };
  }
}
