// PlayScene methods — 风铃小镇 (T13): the town map, houses, residents, bridges.
// Mixed into PlayScene.prototype (see ../PlayScene.js); `this` is the scene.
import { TILE, FONT } from '../../config.js';
import { NPCS } from '../../data/npcs.js';
import { worldOf } from '../../systems/progress.js';

const TOWN_W = 34, TOWN_H = 22;
// house rectangles (tiles) and where each resident stands
const HOUSES = [
  { npc: 'granny', x: 7, y: 4, w: 5, h: 3, art: 'bld_shop_granny', sign: '铃奶奶杂货铺', stand: { x: 9, y: 8 } },
  { npc: 'ali', x: 21, y: 4, w: 5, h: 3, art: 'bld_workshop', sign: '阿栗木工坊', stand: { x: 23, y: 8 } },
  { npc: 'lumi', x: 14, y: 15, w: 5, h: 3, art: 'bld_lab', sign: '露米宠物研究所', stand: { x: 16, y: 13 } },
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
      this.add.image(px + pw / 2, py + ph + 4, 'shadow').setScale(3.6, 1.6).setDepth(py + ph - 1);
      const house = this.add.image(px + pw / 2, py + ph + 10, h.art).setOrigin(0.5, 1).setDepth(py + ph);   // AI art (T53)
      this.add.text(px + pw / 2, house.y - house.displayHeight - 2, h.sign, { fontFamily: FONT, fontSize: '14px', color: '#ffffff', backgroundColor: '#5b3d26', padding: { x: 6, y: 2 } }).setOrigin(0.5, 1).setDepth(py + ph + 1);
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
      this.add.image(lx, ly + 4, 'lamp').setOrigin(0.5, 1).setDepth(ly);
      this.blocked[Math.floor(ly / TILE)][Math.floor(lx / TILE)] = true;
      this.fires.push({ x: lx, y: ly - 30 });
    }
    // fountain in the middle of the plaza
    this.add.image(cxp, cyp + TILE * 0.9, 'fountain').setOrigin(0.5, 1).setDepth(cyp + TILE * 0.9);
    for (const [fx, fy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) this.blocked[Math.floor(cyp / TILE) + fy][Math.floor(cxp / TILE) + fx] = true;
    // broken bridge on the north edge (repaired in T14)
    const bx = Math.floor(TOWN_W / 2);
    let by = 0; while (!this.walk[by][bx]) by++;
    const fixed = worldOf(this.state).bridge;
    // the bridge art is drawn sideways (east-west); turned to run north from the town edge
    this.add.image(bx * TILE + TILE / 2, (by - 1) * TILE + 10, fixed ? 'bridge_fixed' : 'bridge_broken').setAngle(-90).setDepth(-4);
    this.add.text(bx * TILE + TILE / 2, by * TILE + 6, fixed ? '星光岛之桥' : '断桥（需要修理）', { fontFamily: FONT, fontSize: '13px', color: '#ffffff', backgroundColor: '#8a5a36', padding: { x: 4, y: 2 } }).setOrigin(0.5, 0).setDepth(by * TILE + 40);
    this.northBridge = { x: bx * TILE + TILE / 2, y: by * TILE + TILE / 2, fixed };
    // rope bridge back home (east edge)
    const t = this.townBridgeTile;
    this.drawBridge(t.x * TILE + TILE, t.y * TILE + TILE / 2, 1);
    this.townBridge = { x: t.x * TILE + TILE / 2, y: t.y * TILE + TILE / 2 };
  },

  // rope bridge reaching out over the clouds (dir 1 = east, -1 = west); AI art (T53)
  drawBridge(x0, y, dir) {
    this.add.image(x0 + dir * 62, y + 4, 'bridge_rope').setFlipX(dir < 0).setDepth(y - 30);
  },

  townSpots() {
    const spots = [];
    if (this.townBridge) spots.push({ at: this.townBridge, verb: '回家', label: '吊桥 · 回家园（10 分钟）', tagY: 40, act: () => this.game.events.emit('leave-town') });
    for (const n of this.npcs ?? []) spots.push({ at: { x: n.x, y: n.y }, verb: '聊天', label: `${NPCS[n.id].name} · ${NPCS[n.id].role}`, tagY: 84, prio: 10, act: () => this.game.events.emit('npc-request', { id: n.id }) });
    if (this.northBridge) spots.push(this.northBridge.fixed
      ? { at: this.northBridge, verb: '过桥', label: '星光岛之桥', tagY: 40, act: () => this.showToast('桥对面的星光岛还在建设中，敬请期待！') }
      : { at: this.northBridge, verb: '修桥', label: '断桥 · 修好它', tagY: 40, act: () => this.game.events.emit('bridge-request') });
    if (this.expandSpot) spots.push({ at: this.expandSpot, verb: '扩建', label: '扩建用地 · 买下变成第二块农田', tagY: 70, act: () => this.game.events.emit('expand-request') });
    if (this.homeBridge) spots.push({ at: this.homeBridge, verb: '过桥', label: '吊桥 · 去风铃小镇（10 分钟）', tagY: 40, act: () => this.game.events.emit('go-town') });
    return spots;
  },

  // test helper: stand next to a resident
  standByNpc(id) { const n = this.npcs.find((x) => x.id === id); this.teleport(n.x, n.y + TILE); },
};
