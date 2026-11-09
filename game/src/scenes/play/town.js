// PlayScene methods — 风铃小镇 (T13): the town map, houses, residents, bridges.
// Mixed into PlayScene.prototype (see ../PlayScene.js); `this` is the scene.
import { TILE, FONT } from '../../config.js';
import { NPCS } from '../../data/npcs.js';

const TOWN_W = 34, TOWN_H = 22;
// house rectangles (tiles) and where each resident stands
const HOUSES = [
  { npc: 'granny', x: 7, y: 4, w: 5, h: 3, roof: 0xc96a7a, sign: '铃奶奶杂货铺', stand: { x: 9, y: 8 } },
  { npc: 'ali', x: 21, y: 4, w: 5, h: 3, roof: 0x6fae4a, sign: '阿栗木工坊', stand: { x: 23, y: 8 } },
  { npc: 'lumi', x: 14, y: 15, w: 5, h: 3, roof: 0x3d7fb8, sign: '露米宠物研究所', stand: { x: 16, y: 13 } },
];

export default {
  buildTown() {
    this.cols = TOWN_W; this.rows = TOWN_H;
    const cx = TOWN_W / 2, cy = TOWN_H / 2;
    this.walk = [];
    for (let y = 0; y < TOWN_H; y++) {
      const row = [];
      for (let x = 0; x < TOWN_W; x++) row.push(((x + 0.5 - cx) / 15.6) ** 2 + ((y + 0.5 - cy) / 9.6) ** 2 < 1);
      this.walk.push(row);
    }
    this.blocked = this.walk.map((r) => r.map(() => false));
    const row = Math.floor(cy);
    let ex = TOWN_W - 1;
    while (!this.walk[row][ex]) ex--;
    this.townBridgeTile = { x: ex, y: row };
    this.spawnTile = { x: ex - 1, y: row };
    this.meadowTile = { x: ex - 1, y: row };
  },

  placeTownProps() {
    const g = this.add.graphics();
    this.npcs = [];
    for (const h of HOUSES) {
      for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) this.blocked[y][x] = true;
      const px = h.x * TILE, py = h.y * TILE, pw = h.w * TILE, ph = h.h * TILE;
      const house = this.add.graphics().setDepth(py + ph);
      house.fillStyle(0x000000, 0.12).fillEllipse(px + pw / 2, py + ph + 4, pw + 10, 22);
      house.fillStyle(0xfbf3dc).fillRect(px + 6, py + ph * 0.38, pw - 12, ph * 0.62);
      house.lineStyle(3, 0x5b3d26).strokeRect(px + 6, py + ph * 0.38, pw - 12, ph * 0.62);
      house.fillStyle(h.roof).fillTriangle(px - 6, py + ph * 0.42, px + pw / 2, py - 18, px + pw + 6, py + ph * 0.42);
      house.lineStyle(3, 0x5b3d26).strokeTriangle(px - 6, py + ph * 0.42, px + pw / 2, py - 18, px + pw + 6, py + ph * 0.42);
      house.fillStyle(0x8a5a36).fillRoundedRect(px + pw / 2 - 16, py + ph - 46, 32, 46, { tl: 14, tr: 14, bl: 0, br: 0 });
      house.fillStyle(0xbfe3ef).fillRect(px + 20, py + ph * 0.5, 26, 22).fillRect(px + pw - 46, py + ph * 0.5, 26, 22);
      this.add.text(px + pw / 2, py + ph * 0.38 - 4, h.sign, { fontFamily: FONT, fontSize: '14px', color: '#ffffff', backgroundColor: '#5b3d26', padding: { x: 6, y: 2 } }).setOrigin(0.5, 1).setDepth(py + ph + 1);
      // the resident in front of the door
      const sx = h.stand.x * TILE + TILE / 2, sy = h.stand.y * TILE + TILE / 2;
      this.blocked[h.stand.y][h.stand.x] = true;
      const shadow = this.add.image(sx, sy + 2, 'shadow').setScale(0.7).setDepth(sy - 1);
      const sprite = this.add.image(sx, sy, `npc_${h.npc}`).setOrigin(0.5, 0.95).setDepth(sy);
      this.tweens.add({ targets: sprite, scaleY: 1.03, duration: 900 + h.stand.x * 20, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.npcs.push({ id: h.npc, x: sx, y: sy, sprite, shadow });
    }
    // street lamps around the plaza: the town stays cosy at night (they are lights)
    const cxp = (TOWN_W / 2) * TILE, cyp = (TOWN_H / 2) * TILE;
    for (const [dx, dy] of [[-5.5, -3], [5.5, -3], [-5.5, 3], [5.5, 3]]) {
      const lx = cxp + dx * TILE, ly = cyp + dy * TILE;
      const lamp = this.add.graphics().setDepth(ly);
      lamp.fillStyle(0x5b3d26).fillRect(lx - 3, ly - 64, 6, 64).fillRect(lx - 10, ly - 4, 20, 6);
      lamp.fillStyle(0xfff0a0).fillCircle(lx, ly - 70, 9).lineStyle(3, 0x5b3d26).strokeCircle(lx, ly - 70, 10);
      this.blocked[Math.floor(ly / TILE)][Math.floor(lx / TILE)] = true;
      this.fires.push({ x: lx, y: ly - 30 });
    }
    // broken bridge on the north edge (repaired in T14)
    const bx = Math.floor(TOWN_W / 2);
    let by = 0; while (!this.walk[by][bx]) by++;
    g.setDepth(-4).fillStyle(0x8a5a36);
    for (let i = 0; i < 3; i++) g.fillRect(bx * TILE + 6, (by - 1 - i) * TILE + 10, TILE - 12, 10);
    this.add.text(bx * TILE + TILE / 2, by * TILE + 6, '断桥（阿栗说总有一天会修好）', { fontFamily: FONT, fontSize: '13px', color: '#ffffff', backgroundColor: '#8a5a36', padding: { x: 4, y: 2 } }).setOrigin(0.5, 0).setDepth(by * TILE + 40);
    // rope bridge back home (east edge)
    const t = this.townBridgeTile;
    this.drawBridge(t.x * TILE + TILE, t.y * TILE + TILE / 2, 1);
    this.townBridge = { x: t.x * TILE + TILE / 2, y: t.y * TILE + TILE / 2 };
  },

  // planks + ropes reaching out over the clouds (dir 1 = east, -1 = west)
  drawBridge(x0, y, dir) {
    const g = this.add.graphics().setDepth(y - 30);
    for (let i = 0; i < 6; i++) {
      const x = x0 + dir * (i * 22);
      g.fillStyle(i % 2 ? 0x8a5a36 : 0xa8703f).fillRect(Math.min(x, x + dir * 18), y - 18, 18, 36);
    }
    g.lineStyle(3, 0xc99a5a).lineBetween(x0, y - 20, x0 + dir * 130, y - 16).lineBetween(x0, y + 20, x0 + dir * 130, y + 24);
  },

  townSpots() {
    const spots = [];
    if (this.townBridge) spots.push({ at: this.townBridge, verb: '回家', label: '吊桥 · 回家园（10 分钟）', tagY: 40, act: () => this.game.events.emit('leave-town') });
    for (const n of this.npcs ?? []) spots.push({ at: { x: n.x, y: n.y }, verb: '聊天', label: `${NPCS[n.id].name} · ${NPCS[n.id].role}`, tagY: 84, prio: 10, act: () => this.game.events.emit('npc-request', { id: n.id }) });
    if (this.homeBridge) spots.push({ at: this.homeBridge, verb: '过桥', label: '吊桥 · 去风铃小镇（10 分钟）', tagY: 40, act: () => this.game.events.emit('go-town') });
    return spots;
  },

  // test helper: stand next to a resident
  standByNpc(id) { const n = this.npcs.find((x) => x.id === id); this.teleport(n.x, n.y + TILE); },
};
