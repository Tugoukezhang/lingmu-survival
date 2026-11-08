import { GAME_W, GAME_H, FONT, COLORS } from '../config.js';
import { PETS, petTextureKey } from '../data/pets.js';
import GameSession from '../systems/GameSession.js';

// Loads real art (pet sprites) and draws code-made placeholder textures for
// everything that has no art yet (player, trees, rocks, clouds, shadows).
export default class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    const bar = this.add.rectangle(GAME_W / 2 - 160, GAME_H / 2 + 30, 0, 14, COLORS.grass).setOrigin(0, 0.5);
    this.add.rectangle(GAME_W / 2, GAME_H / 2 + 30, 324, 20).setStrokeStyle(3, COLORS.woodDark);
    this.add.text(GAME_W / 2, GAME_H / 2 - 10, '加载中…', { fontFamily: FONT, fontSize: '22px', color: COLORS.text }).setOrigin(0.5);
    this.load.on('progress', (p) => { bar.width = 320 * p; });

    this.load.image('tile_grass', 'assets/tiles/tile_grass.png');
    for (const k of ['item_campfire', 'item_net_grass', 'item_net_vine']) this.load.image(k, `assets/items/${k}.png`);
    for (const p of PETS) {
      this.load.image(petTextureKey(p.id), `assets/pets/pet_${p.id}_idle_01.png`);
      if (p.humanForm) this.load.image(petTextureKey(p.humanForm), `assets/pets/pet_${p.humanForm}_idle_01.png`);
    }
  }

  create() {
    this.makeCanvas('player', 48, 72, drawPlayer);
    this.makeCanvas('tree', 96, 120, drawTree);
    this.makeCanvas('rock', 56, 40, drawRock);
    this.makeCanvas('shadow', 64, 20, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      grd.addColorStop(0, 'rgba(40,60,30,0.35)');
      grd.addColorStop(1, 'rgba(40,60,30,0)');
      g.fillStyle = grd; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill();
    });
    this.makeCanvas('cloud', 220, 90, drawCloud);
    this.makeCanvas('tent', 104, 92, drawTent);
    for (const [k, fn] of Object.entries(FOOD_ICONS)) this.makeCanvas(k, 128, 128, fn);
    // load the save once; scenes read game.session.state from here on
    this.game.session = new GameSession(this.game);
    this.game.session.load();
    this.scene.start('play');
  }

  makeCanvas(key, w, h, draw) {
    const tex = this.textures.createCanvas(key, w, h);
    draw(tex.getContext(), w, h);
    tex.refresh();
  }
}

// --- placeholder drawings (replaced by AI art later, docs/03_素材规范.md) ---

function drawPlayer(g, w) {
  const cx = w / 2;
  g.lineWidth = 2; g.strokeStyle = '#5b3d26';
  // legs
  g.fillStyle = '#5b3d26';
  g.fillRect(cx - 9, 60, 7, 10); g.fillRect(cx + 2, 60, 7, 10);
  // body: red overalls
  g.fillStyle = '#d9574a';
  roundRect(g, cx - 13, 38, 26, 26, 8); g.fill(); g.stroke();
  // head
  g.fillStyle = '#ffe2c8';
  g.beginPath(); g.arc(cx, 26, 17, 0, Math.PI * 2); g.fill(); g.stroke();
  // braids
  g.fillStyle = '#e58a3a';
  g.beginPath(); g.arc(cx - 16, 34, 6, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + 16, 34, 6, 0, Math.PI * 2); g.fill();
  // blue cap
  g.fillStyle = '#4a86d0';
  g.beginPath(); g.arc(cx, 20, 18, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.arc(cx - 11, 7, 5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + 11, 7, 5, 0, Math.PI * 2); g.fill();
  // eyes + cheeks
  g.fillStyle = '#3b2a20';
  g.beginPath(); g.arc(cx - 6, 28, 2.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + 6, 28, 2.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(240,120,110,0.5)';
  g.beginPath(); g.arc(cx - 10, 33, 3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(cx + 10, 33, 3, 0, Math.PI * 2); g.fill();
}

function drawTree(g, w, h) {
  g.fillStyle = '#8a5a36';
  roundRect(g, w / 2 - 8, h - 46, 16, 40, 5); g.fill();
  const blobs = [[w / 2, 46, 36], [w / 2 - 22, 60, 26], [w / 2 + 22, 60, 26], [w / 2, 70, 30]];
  for (const [x, y, r] of blobs) {
    const grd = g.createRadialGradient(x - r / 3, y - r / 3, 4, x, y, r);
    grd.addColorStop(0, '#9ed36a'); grd.addColorStop(1, '#4f8a3a');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#e8564a';
  for (const [x, y] of [[w / 2 - 14, 50], [w / 2 + 16, 66], [w / 2 + 2, 78]]) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
}

function drawRock(g, w, h) {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#d8d3c6'); grd.addColorStop(1, '#9d9585');
  g.fillStyle = grd; g.strokeStyle = '#7a7266'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(6, h - 4); g.quadraticCurveTo(2, 14, 20, 8); g.quadraticCurveTo(34, 0, 46, 12);
  g.quadraticCurveTo(w, 22, w - 4, h - 4); g.closePath(); g.fill(); g.stroke();
}

// food placeholders, 128×128 like the real item icons
const FOOD_ICONS = {
  item_berry: (g) => berries(g, '#d9406a'),
  item_berry_roast: (g) => { berries(g, '#a8452e'); g.strokeStyle = '#8a5a36'; g.lineWidth = 6; g.beginPath(); g.moveTo(14, 114); g.lineTo(110, 18); g.stroke(); },
  item_carrot: (g) => {
    g.fillStyle = '#6fae4a';
    for (const a of [-0.5, 0, 0.5]) { g.save(); g.translate(78, 36); g.rotate(a); g.beginPath(); g.ellipse(0, -18, 9, 22, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    g.fillStyle = '#f08a3a'; g.strokeStyle = '#a9532a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(66, 34); g.quadraticCurveTo(100, 40, 88, 56); g.lineTo(28, 112); g.quadraticCurveTo(20, 104, 30, 92); g.closePath(); g.fill(); g.stroke();
  },
  item_fish_roast: (g) => {
    g.fillStyle = '#d98c4a'; g.strokeStyle = '#7a4a2a'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(58, 64, 40, 24, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(94, 64); g.lineTo(120, 44); g.lineTo(120, 84); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#3b2a20'; g.beginPath(); g.arc(34, 58, 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#a8602e'; for (const x of [52, 66, 80]) { g.beginPath(); g.moveTo(x, 46); g.lineTo(x - 6, 82); g.stroke(); }
  },
  item_soup: (g) => {
    g.fillStyle = '#ffffff'; g.strokeStyle = '#5b3d26'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(64, 70, 50, 16, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#f0a040'; g.beginPath(); g.ellipse(64, 68, 42, 11, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(14, 70); g.quadraticCurveTo(64, 140, 114, 70); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3;
    for (const x of [48, 64, 80]) { g.beginPath(); g.moveTo(x, 46); g.quadraticCurveTo(x + 8, 34, x, 22); g.stroke(); }
  },
};

function berries(g, color) {
  g.fillStyle = '#5a9a3c'; g.beginPath(); g.ellipse(76, 30, 20, 9, -0.5, 0, Math.PI * 2); g.fill();
  for (const [x, y] of [[48, 62], [78, 66], [62, 90], [36, 88], [90, 92]]) {
    g.fillStyle = color; g.strokeStyle = '#5b2a2a'; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, 17, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(x - 6, y - 6, 4, 0, Math.PI * 2); g.fill();
  }
}

function drawTent(g, w, h) {
  const cx = w / 2, base = h - 8;
  g.fillStyle = 'rgba(40,60,30,0.25)';
  g.beginPath(); g.ellipse(cx, base + 2, w / 2 - 4, 7, 0, 0, Math.PI * 2); g.fill();
  g.lineWidth = 3; g.strokeStyle = '#5b3d26'; g.lineJoin = 'round';
  // canvas body
  g.fillStyle = '#fbf3dc';
  g.beginPath(); g.moveTo(cx, 14); g.lineTo(w - 8, base); g.lineTo(8, base); g.closePath(); g.fill(); g.stroke();
  // pink stripe and dark door
  g.fillStyle = '#f0a9a0';
  g.beginPath(); g.moveTo(cx, 14); g.lineTo(cx + 14, base); g.lineTo(cx + 6, base); g.closePath(); g.fill();
  g.fillStyle = '#6e4529';
  g.beginPath(); g.moveTo(cx, 40); g.lineTo(cx + 15, base); g.lineTo(cx - 15, base); g.closePath(); g.fill();
  // pole + flag
  g.strokeStyle = '#8a5a36'; g.beginPath(); g.moveTo(cx, 16); g.lineTo(cx, 2); g.stroke();
  g.fillStyle = '#f5c84b'; g.beginPath(); g.moveTo(cx + 1, 2); g.lineTo(cx + 16, 6); g.lineTo(cx + 1, 10); g.closePath(); g.fill();
}

function drawCloud(g, w, h) {
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [x, y, r] of [[50, 55, 30], [95, 40, 40], [150, 50, 34], [185, 62, 24], [110, 66, 30]]) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
