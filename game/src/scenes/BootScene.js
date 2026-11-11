import { GAME_W, GAME_H, FONT, COLORS, DEMO } from '../config.js';
import { PETS, petTextureKey } from '../data/pets.js';
import GameSession from '../systems/GameSession.js';
import { CROPS } from '../data/crops.js';
import { NPCS } from '../data/npcs.js';
import { ART } from '../data/art.js';

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
    // AI art (T53, tools/art/normalize.py): replaces the code-drawn placeholder with the same key
    for (const [key, path] of Object.entries(ART)) this.load.image(key, path);
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
    this.makeCanvas('bush', 64, 52, drawBush);
    this.makeCanvas('grass_tuft', 48, 34, drawGrassTuft);
    this.makeCanvas('crystal', 44, 60, drawCrystal);
    this.makeCanvas('chest', 60, 50, drawChest);
    this.makeCanvas('airship', 190, 150, drawAirship);
    this.makeCanvas('lostbag', 56, 56, drawLostBag);
    this.makeCanvas('item_tent', 128, 128, (g, w, h) => { g.save(); g.scale(1.2, 1.2); g.translate(2, 8); drawTent(g, 104, 92); g.restore(); });
    this.makeCanvas('fogmonster', 84, 84, drawFogMonster);
    this.makeCanvas('thorn', 60, 56, drawThorn);
    this.makeCanvas('seedstand', 72, 60, drawSeedStand);
    this.makeCanvas('bed', 92, 100, drawBed);
    for (const k of ['chair', 'table', 'plant', 'rug', 'shelf', 'lamp', 'chime', 'horse', 'petbed']) {
      const size = { chair: [48, 60], table: [96, 64], plant: [48, 64], rug: [96, 96], shelf: [96, 100], lamp: [48, 76], chime: [48, 80], horse: [56, 56], petbed: [96, 52] }[k];
      this.makeCanvas(`furn_${k}`, size[0], size[1], (g, w, h) => drawFurniture(g, w, h, k));
      this.makeCanvas(`item_furn_${k}`, 128, 128, (g) => { const [w, h] = size; const s = Math.min(110 / w, 110 / h); g.save(); g.translate(64 - (w * s) / 2, 64 - (h * s) / 2); g.scale(s, s); drawFurniture(g, w, h, k); g.restore(); });
    }
    for (const [id, n] of Object.entries(NPCS)) this.makeCanvas(`npc_${id}`, 56, 84, (g, w, h) => drawNpc(g, w, h, id, n.look));
    this.makeCanvas('item_bigbag', 128, 128, (g) => { g.lineWidth = 4; g.strokeStyle = '#5b3d26'; g.fillStyle = '#c99a5a'; g.beginPath(); g.moveTo(30, 44); g.lineTo(98, 44); g.lineTo(106, 112); g.lineTo(22, 112); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#f0a9a0'; g.fillRect(34, 60, 60, 14); g.strokeStyle = '#8a5a36'; g.beginPath(); g.arc(64, 44, 22, Math.PI, 0); g.stroke(); });
    this.makeCanvas('lightbrush', 256, 256, (g, w) => {   // soft round light: opaque core, fading edge
      const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.62, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, w);
    });
    for (const [k, fn] of Object.entries({ ...FOOD_ICONS, ...MATERIAL_ICONS, ...FARM_ICONS, ...GROWTH_ICONS })) this.makeCanvas(k, 128, 128, fn);
    for (const [id, c] of Object.entries(CROPS)) for (let st = 0; st < 3; st++) this.makeCanvas(`crop_${id}_${st}`, 48, 56, (g, w, h) => drawCropStage(g, w, h, id, c.color, st));
    // load the save once; scenes read game.session.state from here on
    this.game.session = new GameSession(this.game);
    this.game.session.load();
    this.scene.start(DEMO ? 'play' : 'title');
  }

  makeCanvas(key, w, h, draw) {
    if (this.textures.exists(key)) return;   // real art already loaded
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

// material / tool placeholders, 128×128
const ink = (g, w = 4) => { g.strokeStyle = '#5b3d26'; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; };
const MATERIAL_ICONS = {
  item_wood: (g) => {
    ink(g);
    for (const [y, x0] of [[78, 18], [52, 30]]) {
      g.fillStyle = '#b07a48'; g.beginPath(); g.moveTo(x0, y - 14); g.lineTo(x0 + 80, y - 14); g.lineTo(x0 + 80, y + 14); g.lineTo(x0, y + 14); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#e8c48e'; g.beginPath(); g.ellipse(x0 + 80, y, 9, 14, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = '#b07a48'; g.lineWidth = 2; g.beginPath(); g.ellipse(x0 + 80, y, 4, 7, 0, 0, Math.PI * 2); g.stroke(); ink(g);
    }
  },
  item_stone: (g) => {
    ink(g);
    for (const [x, y, rx, ry, c] of [[48, 76, 30, 22, '#b8b2a4'], [80, 70, 26, 20, '#cfc9bb'], [64, 52, 22, 17, '#e0dacd']]) {
      g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  },
  item_grass: (g) => {
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) { g.strokeStyle = i % 2 ? '#7fb85a' : '#4f8a3a'; g.lineWidth = 6; g.beginPath(); g.moveTo(64, 104); g.quadraticCurveTo(40 + i * 6, 60, 22 + i * 10, 18 + (i % 3) * 8); g.stroke(); }
    g.fillStyle = '#c99a5a'; g.fillRect(50, 86, 28, 10);
  },
  item_crystal: (g) => {
    ink(g, 3);
    const shard = (x, top, half) => { const grd = g.createLinearGradient(x - half, top, x + half, 112); grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#7cc4f0');
      g.fillStyle = grd; g.beginPath(); g.moveTo(x, top); g.lineTo(x + half, top + 22); g.lineTo(x + half * 0.7, 112); g.lineTo(x - half * 0.7, 112); g.lineTo(x - half, top + 22); g.closePath(); g.fill(); g.stroke(); };
    shard(38, 46, 16); shard(90, 42, 16); shard(64, 14, 20);
  },
  item_cloth: (g) => {
    ink(g);
    g.fillStyle = '#f0a9a0'; g.beginPath(); g.moveTo(24, 40); g.lineTo(104, 30); g.lineTo(100, 96); g.lineTo(28, 104); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#fbf3dc'; g.lineWidth = 3; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(32, 50); g.lineTo(94, 42); g.lineTo(92, 88); g.lineTo(36, 94); g.closePath(); g.stroke(); g.setLineDash([]);
  },
  item_axe: (g) => {
    ink(g);
    g.fillStyle = '#b07a48'; g.save(); g.translate(64, 64); g.rotate(-0.7); g.fillRect(-6, -50, 12, 100); g.strokeRect(-6, -50, 12, 100); g.restore();
    g.fillStyle = '#c8c2b4'; g.beginPath(); g.moveTo(52, 22); g.quadraticCurveTo(98, 8, 108, 46); g.lineTo(76, 54); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#8a5a36'; g.fillRect(58, 34, 14, 10);
  },
  item_pickaxe: (g) => {
    ink(g);
    g.fillStyle = '#b07a48'; g.save(); g.translate(64, 70); g.rotate(-0.7); g.fillRect(-6, -46, 12, 92); g.strokeRect(-6, -46, 12, 92); g.restore();
    g.fillStyle = '#c8c2b4'; g.beginPath(); g.moveTo(26, 30); g.quadraticCurveTo(70, 4, 112, 44); g.quadraticCurveTo(72, 26, 30, 40); g.closePath(); g.fill(); g.stroke();
  },
  item_torch: (g) => {
    ink(g);
    g.fillStyle = '#b07a48'; g.save(); g.translate(64, 80); g.rotate(0.35); g.fillRect(-7, -30, 14, 64); g.strokeRect(-7, -30, 14, 64); g.restore();
    g.fillStyle = '#c99a5a'; g.fillRect(48, 42, 26, 16);
    g.fillStyle = '#f08a3a'; g.beginPath(); g.moveTo(60, 6); g.quadraticCurveTo(86, 30, 74, 46); g.lineTo(48, 46); g.quadraticCurveTo(38, 28, 60, 6); g.fill();
    g.fillStyle = '#f5c84b'; g.beginPath(); g.moveTo(61, 20); g.quadraticCurveTo(74, 34, 68, 44); g.lineTo(54, 44); g.quadraticCurveTo(50, 32, 61, 20); g.fill();
  },
};

// farm placeholders (T11)
function seedBag(g, color) {
  g.lineWidth = 4; g.strokeStyle = '#5b3d26';
  g.fillStyle = '#e8d2a8'; g.beginPath(); g.moveTo(34, 40); g.lineTo(94, 40); g.lineTo(104, 110); g.lineTo(24, 110); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#c99a5a'; g.fillRect(40, 28, 48, 14); g.strokeRect(40, 28, 48, 14);
  g.fillStyle = color; g.beginPath(); g.arc(64, 78, 18, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6fae4a'; g.beginPath(); g.ellipse(72, 58, 10, 5, -0.6, 0, Math.PI * 2); g.fill();
}
const GROWTH_ICONS = {
  item_book: (g) => {
    g.lineWidth = 4; g.strokeStyle = '#5b3d26';
    g.fillStyle = '#7a4aa0'; g.fillRect(26, 22, 76, 88); g.strokeRect(26, 22, 76, 88);
    g.fillStyle = '#fbf3dc'; g.fillRect(34, 26, 64, 80);
    g.fillStyle = '#7a4aa0'; g.fillRect(26, 22, 14, 88);
    g.fillStyle = '#f5c84b'; g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 1.2566; g.lineTo(68 + Math.cos(a) * 16, 62 + Math.sin(a) * 16); g.lineTo(68 + Math.cos(a + 0.628) * 7, 62 + Math.sin(a + 0.628) * 7); } g.closePath(); g.fill();
  },
  item_foxwick: (g) => {
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 50); grd.addColorStop(0, 'rgba(255,240,180,1)'); grd.addColorStop(0.4, 'rgba(255,150,80,0.9)'); grd.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff3c0'; g.beginPath(); g.moveTo(64, 30); g.quadraticCurveTo(84, 60, 64, 84); g.quadraticCurveTo(44, 60, 64, 30); g.fill();
  },
  item_fox_bell: (g) => {
    g.lineWidth = 4; g.strokeStyle = '#8a4a1a';
    g.fillStyle = '#f5c84b'; g.beginPath(); g.moveTo(34, 92); g.quadraticCurveTo(34, 34, 64, 30); g.quadraticCurveTo(94, 34, 94, 92); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#d9572b'; g.fillRect(28, 88, 72, 10); g.beginPath(); g.arc(64, 104, 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d9572b'; g.lineWidth = 5; g.beginPath(); g.arc(64, 24, 9, Math.PI, 0); g.stroke();
  },
};
for (const [k, c1, c2] of [['forest', '#9fdc6a', '#3f7a3a'], ['water', '#9fdcff', '#3d7fb8'], ['fire', '#ffcf7a', '#d9572b'], ['light', '#fff4a8', '#c99a1e'], ['dark', '#d0a8ff', '#5a2a8a']]) {
  GROWTH_ICONS[`item_evo_${k}`] = (g) => {
    const grd = g.createLinearGradient(34, 20, 94, 110); grd.addColorStop(0, c1); grd.addColorStop(1, c2);
    g.fillStyle = grd; g.strokeStyle = '#3b2a20'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(64, 14); g.lineTo(100, 54); g.lineTo(82, 112); g.lineTo(46, 112); g.lineTo(28, 54); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.moveTo(64, 24); g.lineTo(80, 50); g.lineTo(64, 60); g.closePath(); g.fill();
  };
}

const FARM_ICONS = {
  item_fish: (g) => {
    g.fillStyle = '#7ab0d8'; g.strokeStyle = '#3d5a7a'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(58, 64, 40, 22, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(94, 64); g.lineTo(120, 44); g.lineTo(120, 84); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(34, 58, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#3b2a20'; g.beginPath(); g.arc(34, 58, 3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; for (const x of [52, 64, 76]) { g.beginPath(); g.arc(x, 64, 10, -0.8, 0.8); g.stroke(); }
  },
  item_seed_carrot: (g) => seedBag(g, '#f08a3a'), item_seed_strawberry: (g) => seedBag(g, '#e8445a'), item_seed_sunflower: (g) => seedBag(g, '#f5c84b'),
  item_seed_starwheat: (g) => seedBag(g, '#e8d27a'), item_seed_pumpkin: (g) => seedBag(g, '#e07a2a'),
  item_strawberry: (g) => {
    g.lineWidth = 4; g.strokeStyle = '#8a2a3a'; g.fillStyle = '#e8445a';
    g.beginPath(); g.moveTo(64, 112); g.quadraticCurveTo(18, 70, 34, 44); g.quadraticCurveTo(64, 30, 94, 44); g.quadraticCurveTo(110, 70, 64, 112); g.fill(); g.stroke();
    g.fillStyle = '#ffe9a0'; for (const [x, y] of [[50, 60], [72, 58], [60, 78], [80, 76], [56, 94], [70, 92]]) { g.beginPath(); g.ellipse(x, y, 2.5, 4, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#5a9a3c'; for (const a of [-0.9, -0.3, 0.3, 0.9]) { g.beginPath(); g.ellipse(64 + Math.sin(a) * 16, 40 - Math.cos(a) * 6, 12, 5, a, 0, Math.PI * 2); g.fill(); }
  },
  item_pumpkin: (g) => {
    g.lineWidth = 4; g.strokeStyle = '#8a4a1a';
    for (const [x, rx] of [[40, 26], [88, 26], [64, 30]]) { g.fillStyle = '#e8862e'; g.beginPath(); g.ellipse(x, 76, rx, 34, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.fillStyle = '#6a8a3a'; g.fillRect(58, 30, 12, 16);
  },
  item_sunflower: (g) => {
    g.strokeStyle = '#4f8a3a'; g.lineWidth = 6; g.beginPath(); g.moveTo(64, 120); g.lineTo(64, 70); g.stroke();
    g.fillStyle = '#f5c84b'; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.ellipse(64 + Math.cos(a) * 26, 50 + Math.sin(a) * 26, 12, 6, a, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#6e4529'; g.beginPath(); g.arc(64, 50, 18, 0, Math.PI * 2); g.fill();
  },
  item_starwheat: (g) => {
    g.strokeStyle = '#c9a85a'; g.lineWidth = 4;
    for (const dx of [-14, 0, 14]) { g.beginPath(); g.moveTo(64 + dx * 0.3, 120); g.quadraticCurveTo(64 + dx, 70, 64 + dx * 1.4, 26); g.stroke(); }
    g.fillStyle = '#f0dc8a'; for (const dx of [-14, 0, 14]) for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(64 + dx * 1.3 + (k % 2 ? 5 : -5), 34 + k * 9, 5, 8, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffffff'; for (const [x, y] of [[40, 30], [92, 44], [70, 20]]) { g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill(); }
  },
  item_hoe: (g) => {
    g.lineWidth = 4; g.strokeStyle = '#5b3d26';
    g.fillStyle = '#b07a48'; g.save(); g.translate(64, 70); g.rotate(0.7); g.fillRect(-6, -50, 12, 100); g.strokeRect(-6, -50, 12, 100); g.restore();
    g.fillStyle = '#c8c2b4'; g.beginPath(); g.moveTo(84, 22); g.lineTo(112, 34); g.lineTo(104, 58); g.lineTo(88, 40); g.closePath(); g.fill(); g.stroke();
  },
  item_can: (g) => {
    g.lineWidth = 4; g.strokeStyle = '#3d5a7a';
    g.fillStyle = '#7cb4e0'; g.beginPath(); g.moveTo(30, 54); g.lineTo(90, 54); g.lineTo(86, 108); g.lineTo(34, 108); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(88, 70); g.lineTo(116, 46); g.lineTo(120, 52); g.lineTo(90, 82); g.stroke();
    g.beginPath(); g.arc(60, 54, 22, Math.PI, 0); g.stroke();
    g.fillStyle = '#aee0ff'; for (const [x, y] of [[118, 62], [122, 72], [114, 74]]) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  },
};

// crop on a plot: 0 sprout, 1 growing, 2 ripe (crop coloured)
function drawCropStage(g, w, h, id, color, st) {
  const base = h - 6;
  g.strokeStyle = '#4f8a3a'; g.fillStyle = '#6fae4a'; g.lineWidth = 3;
  if (st === 0) { g.beginPath(); g.moveTo(w / 2, base); g.lineTo(w / 2, base - 10); g.stroke(); for (const s of [-1, 1]) { g.beginPath(); g.ellipse(w / 2 + s * 6, base - 12, 6, 3, s * 0.5, 0, Math.PI * 2); g.fill(); } return; }
  const tall = id === 'sunflower' || id === 'starwheat' ? 1.6 : 1;
  for (const s of [-1, 0, 1]) { g.beginPath(); g.moveTo(w / 2, base); g.quadraticCurveTo(w / 2 + s * 8, base - 14 * tall, w / 2 + s * 12, base - 22 * tall); g.stroke(); g.beginPath(); g.ellipse(w / 2 + s * 12, base - 22 * tall, 7, 4, s, 0, Math.PI * 2); g.fill(); }
  if (st === 2) {
    g.fillStyle = color; g.strokeStyle = 'rgba(80,40,20,0.7)'; g.lineWidth = 2;
    if (id === 'pumpkin') { g.beginPath(); g.ellipse(w / 2, base - 8, 15, 11, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
    else if (id === 'carrot') { g.beginPath(); g.moveTo(w / 2 - 7, base - 6); g.lineTo(w / 2 + 7, base - 6); g.lineTo(w / 2, base + 4); g.closePath(); g.fill(); g.stroke(); }
    else if (id === 'sunflower') { for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; g.beginPath(); g.ellipse(w / 2 + Math.cos(a) * 9, base - 40 + Math.sin(a) * 9, 5, 3, a, 0, Math.PI * 2); g.fill(); } g.fillStyle = '#6e4529'; g.beginPath(); g.arc(w / 2, base - 40, 6, 0, Math.PI * 2); g.fill(); }
    else if (id === 'starwheat') { for (const s of [-1, 0, 1]) { g.beginPath(); g.ellipse(w / 2 + s * 12, base - 40, 4, 8, 0, 0, Math.PI * 2); g.fill(); } }
    else { for (const [x, y] of [[-8, -10], [6, -14], [0, -4]]) { g.beginPath(); g.arc(w / 2 + x, base + y, 5, 0, Math.PI * 2); g.fill(); g.stroke(); } }
  }
}

function berries(g, color) {
  g.fillStyle = '#5a9a3c'; g.beginPath(); g.ellipse(76, 30, 20, 9, -0.5, 0, Math.PI * 2); g.fill();
  for (const [x, y] of [[48, 62], [78, 66], [62, 90], [36, 88], [90, 92]]) {
    g.fillStyle = color; g.strokeStyle = '#5b2a2a'; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, 17, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(x - 6, y - 6, 4, 0, Math.PI * 2); g.fill();
  }
}

function drawBush(g, w, h) {
  for (const [x, y, r] of [[w / 2 - 14, h - 22, 15], [w / 2 + 14, h - 22, 15], [w / 2, h - 32, 17], [w / 2, h - 16, 16]]) {
    const grd = g.createRadialGradient(x - r / 3, y - r / 3, 3, x, y, r);
    grd.addColorStop(0, '#7fbf5a'); grd.addColorStop(1, '#3f7a3a');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#d9406a';
  for (const [x, y] of [[w / 2 - 12, h - 30], [w / 2 + 8, h - 38], [w / 2 + 16, h - 20], [w / 2 - 4, h - 16], [w / 2 - 18, h - 18]]) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
}

function drawGrassTuft(g, w, h) {
  g.strokeStyle = '#4f8a3a'; g.lineWidth = 3; g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const x = 6 + i * 4.5, lean = (i - 4) * 2.2;
    g.beginPath(); g.moveTo(x, h - 2); g.quadraticCurveTo(x + lean * 0.4, h - 16, x + lean, h - 22 - (i % 3) * 5); g.stroke();
  }
  g.strokeStyle = '#8fcf5a'; g.lineWidth = 2;
  for (let i = 0; i < 5; i++) { const x = 10 + i * 7; g.beginPath(); g.moveTo(x, h - 2); g.lineTo(x + 2, h - 18); g.stroke(); }
}

function drawCrystal(g, w, h) {
  const shard = (x, top, half, c1, c2) => {
    const grd = g.createLinearGradient(x - half, top, x + half, h);
    grd.addColorStop(0, c1); grd.addColorStop(1, c2);
    g.fillStyle = grd; g.strokeStyle = '#4a7aa8'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, top); g.lineTo(x + half, top + 14); g.lineTo(x + half * 0.7, h - 4); g.lineTo(x - half * 0.7, h - 4); g.lineTo(x - half, top + 14); g.closePath(); g.fill(); g.stroke();
  };
  shard(12, 24, 8, '#e6fbff', '#7cc4f0');
  shard(32, 22, 8, '#e6fbff', '#7cc4f0');
  shard(22, 4, 10, '#ffffff', '#9ad6ff');
}

function drawChest(g, w, h) {
  g.fillStyle = '#8a5a36'; g.strokeStyle = '#5b3d26'; g.lineWidth = 3;
  roundRect(g, 6, 20, w - 12, h - 24, 6); g.fill(); g.stroke();
  roundRect(g, 4, 8, w - 8, 18, 8); g.fillStyle = '#a8703f'; g.fill(); g.stroke();
  g.fillStyle = '#f5c84b'; g.fillRect(w / 2 - 6, 18, 12, 14); g.strokeRect(w / 2 - 6, 18, 12, 14);
  g.fillStyle = '#f5c84b'; g.fillRect(10, 22, 4, h - 28); g.fillRect(w - 14, 22, 4, h - 28);
}

// chibi residents (placeholders): body, head, hair and one accessory each
function drawNpc(g, w, h, id, c) {
  const cx = w / 2;
  g.lineWidth = 2; g.strokeStyle = '#5b3d26';
  g.fillStyle = '#5b3d26'; g.fillRect(cx - 9, h - 14, 7, 12); g.fillRect(cx + 2, h - 14, 7, 12);
  g.fillStyle = c.cloth; g.beginPath(); g.moveTo(cx - 16, h - 14); g.lineTo(cx + 16, h - 14); g.lineTo(cx + 12, 44); g.lineTo(cx - 12, 44); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = c.skin; g.beginPath(); g.arc(cx, 30, 16, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = c.hair; g.beginPath(); g.arc(cx, 26, 17, Math.PI, 0); g.closePath(); g.fill();
  g.fillStyle = '#3b2a20'; g.beginPath(); g.arc(cx - 6, 32, 2.2, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(cx + 6, 32, 2.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(240,120,110,0.5)'; g.beginPath(); g.arc(cx - 10, 36, 3, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(cx + 10, 36, 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = c.accent;
  if (id === 'granny') { g.fillStyle = c.hair; g.beginPath(); g.arc(cx, 10, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = c.accent; g.beginPath(); g.moveTo(cx + 10, 8); g.lineTo(cx + 16, 20); g.lineTo(cx + 4, 20); g.closePath(); g.fill(); g.stroke(); }
  else if (id === 'ali') { g.fillStyle = c.accent; g.beginPath(); g.arc(cx, 16, 15, Math.PI, 0); g.closePath(); g.fill(); g.stroke(); g.fillRect(cx - 2, 0, 4, 6); }
  else { g.strokeStyle = '#3b2a20'; g.lineWidth = 2; g.beginPath(); g.arc(cx - 6, 32, 5, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(cx + 6, 32, 5, 0, Math.PI * 2); g.stroke(); g.fillStyle = c.accent; g.fillRect(cx - 14, 46, 28, 6); }
}

function drawBed(g, w, h) {
  g.lineWidth = 3; g.strokeStyle = '#5b3d26';
  g.fillStyle = '#8a5a36'; g.fillRect(4, 4, w - 8, h - 8); g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = '#fbf3dc'; g.fillRect(10, 10, w - 20, 26);
  g.fillStyle = '#f0a9a0'; g.fillRect(10, 38, w - 20, h - 50);
  g.fillStyle = 'rgba(255,255,255,0.35)'; for (let y = 44; y < h - 14; y += 12) g.fillRect(14, y, w - 28, 3);
}

// furniture placeholders (T15)
function drawFurniture(g, w, h, k) {
  g.lineWidth = 3; g.strokeStyle = '#5b3d26';
  if (k === 'chair') { g.fillStyle = '#b07a48'; g.fillRect(8, 6, w - 16, 26); g.strokeRect(8, 6, w - 16, 26); g.fillRect(6, 30, w - 12, 12); g.strokeRect(6, 30, w - 12, 12); g.fillRect(8, 42, 6, h - 44); g.fillRect(w - 14, 42, 6, h - 44); }
  else if (k === 'table') { g.fillStyle = '#c0905a'; g.fillRect(4, 10, w - 8, 22); g.strokeRect(4, 10, w - 8, 22); g.fillStyle = '#8a5a36'; g.fillRect(10, 32, 8, h - 34); g.fillRect(w - 18, 32, 8, h - 34); g.fillStyle = '#fbf3dc'; g.fillRect(w / 2 - 14, 4, 28, 8); }
  else if (k === 'plant') { g.fillStyle = '#c97a4a'; g.beginPath(); g.moveTo(10, h - 26); g.lineTo(w - 10, h - 26); g.lineTo(w - 14, h - 2); g.lineTo(14, h - 2); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#5a9a3c'; for (const [x, y, r] of [[w / 2, 20, 14], [w / 2 - 12, 30, 10], [w / 2 + 12, 30, 10]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } }
  else if (k === 'rug') { g.fillStyle = '#f0a9a0'; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 4, h / 2 - 6, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fbf3dc'; g.lineWidth = 4; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2 - 14, h / 2 - 16, 0, 0, Math.PI * 2); g.stroke(); }
  else if (k === 'shelf') { g.fillStyle = '#8a5a36'; g.fillRect(4, 4, w - 8, h - 8); g.strokeRect(4, 4, w - 8, h - 8); g.fillStyle = '#6e4529'; for (const y of [32, 60]) g.fillRect(8, y, w - 16, 5); const cs = ['#d9572b', '#3d7fb8', '#6fae4a', '#f5c84b', '#7a4aa0']; for (let i = 0; i < 9; i++) { g.fillStyle = cs[i % 5]; g.fillRect(12 + (i % 5) * 15, i < 5 ? 12 : 40, 10, 20); } }
  else if (k === 'chime') { g.fillStyle = '#8a5a36'; g.fillRect(w / 2 - 3, 4, 6, h - 10); g.fillRect(w / 2 - 14, h - 8, 28, 6); g.fillRect(w / 2 - 3, 8, 18, 5); g.strokeStyle = '#5b3d26'; g.lineWidth = 2; for (const dx of [8, 13]) { g.beginPath(); g.moveTo(w / 2 + dx, 13); g.lineTo(w / 2 + dx, 30); g.stroke(); } g.fillStyle = '#9fd3e6'; for (const [dx, y] of [[8, 34], [13, 40]]) { g.beginPath(); g.arc(w / 2 + dx, y, 5, Math.PI, 0); g.fill(); g.stroke(); } g.fillStyle = '#f0a9a0'; g.fillRect(w / 2 + 6, 46, 9, 12); }
  else if (k === 'horse') { g.fillStyle = '#c0905a'; g.beginPath(); g.ellipse(w / 2, h - 18, w / 2 - 6, 8, 0, 0, Math.PI); g.lineWidth = 4; g.strokeStyle = '#8a5a36'; g.stroke(); g.lineWidth = 3; g.strokeStyle = '#5b3d26'; g.fillRect(12, 18, w - 26, 16); g.strokeRect(12, 18, w - 26, 16); g.fillRect(w - 20, 4, 12, 20); g.strokeRect(w - 20, 4, 12, 20); g.fillStyle = '#d9572b'; g.fillRect(14, 12, 10, 8); g.fillStyle = '#5b3d26'; g.fillRect(16, 34, 5, 10); g.fillRect(w - 22, 34, 5, 10); }
  else if (k === 'petbed') { g.fillStyle = '#7a4aa0'; g.beginPath(); g.ellipse(w / 2, h / 2 + 6, w / 2 - 4, h / 2 - 6, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#f2e6ff'; g.beginPath(); g.ellipse(w / 2, h / 2 + 8, w / 2 - 16, h / 2 - 14, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff4a8'; g.beginPath(); g.arc(w - 18, 12, 5, 0, Math.PI * 2); g.fill(); }
  else if (k === 'lamp') { g.fillStyle = '#8a5a36'; g.fillRect(w / 2 - 3, 26, 6, h - 32); g.fillRect(w / 2 - 12, h - 8, 24, 6); g.fillStyle = '#fff0a0'; g.beginPath(); g.moveTo(w / 2 - 16, 28); g.lineTo(w / 2 + 16, 28); g.lineTo(w / 2 + 9, 6); g.lineTo(w / 2 - 9, 6); g.closePath(); g.fill(); g.stroke(); }
}

function drawSeedStand(g, w, h) {
  g.lineWidth = 3; g.strokeStyle = '#5b3d26';
  g.fillStyle = '#a8703f'; g.fillRect(8, 26, w - 16, 10); g.strokeRect(8, 26, w - 16, 10);
  g.fillRect(12, 36, 6, h - 40); g.fillRect(w - 18, 36, 6, h - 40);
  g.fillStyle = '#f0a9a0'; g.beginPath(); g.moveTo(4, 26); g.lineTo(w / 2, 4); g.lineTo(w - 4, 26); g.closePath(); g.fill(); g.stroke();
  for (const [x, c] of [[18, '#f08a3a'], [32, '#e8445a'], [46, '#f5c84b'], [58, '#e07a2a']]) { g.fillStyle = '#e8d2a8'; g.fillRect(x - 5, 16 + 0, 10, 10); g.fillStyle = c; g.beginPath(); g.arc(x, 21, 3, 0, Math.PI * 2); g.fill(); }
}

function drawThorn(g, w, h) {
  g.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const a = Math.PI + (i / 13) * Math.PI, len = 18 + (i % 3) * 6;
    g.strokeStyle = i % 2 ? '#6a5a32' : '#4f6a2e'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(w / 2, h - 6); g.quadraticCurveTo(w / 2 + Math.cos(a) * len * 0.5, h - 6 + Math.sin(a) * len * 0.3, w / 2 + Math.cos(a) * len, h - 8 + Math.sin(a) * len); g.stroke();
  }
  g.fillStyle = '#c9b48a';
  for (let i = 0; i < 16; i++) { const x = 8 + ((i * 37) % (w - 16)), y = 8 + ((i * 23) % (h - 22)); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y - 6); g.lineTo(x + 5, y); g.closePath(); g.fill(); }
  g.fillStyle = '#d9406a'; g.beginPath(); g.arc(w / 2 + 8, h - 26, 3, 0, Math.PI * 2); g.fill();
}

function drawFogMonster(g, w, h) {
  const grd = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w / 2);
  grd.addColorStop(0, 'rgba(120,110,160,0.95)'); grd.addColorStop(0.7, 'rgba(90,86,130,0.8)'); grd.addColorStop(1, 'rgba(90,86,130,0)');
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(10, h - 10);
  g.quadraticCurveTo(4, 10, w / 2, 8); g.quadraticCurveTo(w - 4, 10, w - 10, h - 10);
  for (let i = 0; i < 4; i++) g.quadraticCurveTo(w - 18 - i * 16, h - 2, w - 26 - i * 16, h - 12);
  g.closePath(); g.fill();
  g.fillStyle = '#ffe9a0';
  for (const x of [w / 2 - 12, w / 2 + 12]) { g.beginPath(); g.ellipse(x, h / 2 - 4, 5, 7, 0, 0, Math.PI * 2); g.fill(); }
}

function drawLostBag(g, w, h) {
  g.fillStyle = 'rgba(40,60,30,0.25)'; g.beginPath(); g.ellipse(w / 2, h - 5, 20, 5, 0, 0, Math.PI * 2); g.fill();
  g.lineWidth = 3; g.strokeStyle = '#5b3d26';
  g.fillStyle = '#c99a5a';
  g.beginPath(); g.moveTo(w / 2 - 8, 16); g.quadraticCurveTo(6, 26, 10, 44); g.quadraticCurveTo(w / 2, h - 2, w - 10, 44); g.quadraticCurveTo(w - 6, 26, w / 2 + 8, 16); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#e0b878'; g.beginPath(); g.moveTo(w / 2 - 10, 16); g.lineTo(w / 2 - 14, 4); g.lineTo(w / 2, 10); g.lineTo(w / 2 + 14, 4); g.lineTo(w / 2 + 10, 16); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#f0a9a0'; g.fillRect(w / 2 - 11, 14, 22, 5);
  g.fillStyle = '#ffffff'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.fillText('!', w / 2, 40);
}

function drawAirship(g, w, h) {
  g.lineWidth = 3; g.strokeStyle = '#5b3d26';
  // balloon
  const grd = g.createLinearGradient(0, 8, 0, 80);
  grd.addColorStop(0, '#fbf3dc'); grd.addColorStop(1, '#efd9a8');
  g.fillStyle = grd; g.beginPath(); g.ellipse(w / 2, 46, 78, 38, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.strokeStyle = '#f0a9a0'; g.lineWidth = 6;
  for (const dx of [-40, 0, 40]) { g.beginPath(); g.ellipse(w / 2 + dx * 0.2, 46, Math.abs(dx) * 0.9 + 8, 37, 0, -Math.PI / 2, Math.PI / 2, dx < 0); g.stroke(); }
  // ropes
  g.strokeStyle = '#8a5a36'; g.lineWidth = 2;
  for (const dx of [-40, -14, 14, 40]) { g.beginPath(); g.moveTo(w / 2 + dx, 80); g.lineTo(w / 2 + dx * 0.8, 110); g.stroke(); }
  // boat
  g.fillStyle = '#8a5a36'; g.strokeStyle = '#5b3d26'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(w / 2 - 58, 108); g.lineTo(w / 2 + 58, 108); g.quadraticCurveTo(w / 2 + 50, 138, w / 2 + 30, 140); g.lineTo(w / 2 - 30, 140); g.quadraticCurveTo(w / 2 - 50, 138, w / 2 - 58, 108); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#f5c84b'; g.fillRect(w / 2 - 48, 114, 96, 5);
  // propeller
  g.fillStyle = '#5b3d26'; g.beginPath(); g.ellipse(w / 2 + 70, 122, 4, 14, 0, 0, Math.PI * 2); g.fill();
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
