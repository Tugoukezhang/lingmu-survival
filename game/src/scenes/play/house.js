// PlayScene methods — the home cottage and its room (T15): building the room,
// furniture sprites, bed, door and the decorate board.
// Mixed into PlayScene.prototype (see ../PlayScene.js); `this` is the scene.
import { TILE, FONT, GAME_W, GAME_H } from '../../config.js';
import * as HS from '../../systems/house.js';

const OX = 1, OY = 2;   // floor cell (0,0) = tile (1,2): one wall column left, two wall rows on top

export default {
  buildHouse() {
    this.cols = HS.ROOM_W + 2; this.rows = HS.ROOM_H + 3;
    this.walk = [];
    for (let y = 0; y < this.rows; y++) {
      const row = [];
      for (let x = 0; x < this.cols; x++) row.push(x >= OX && x < OX + HS.ROOM_W && y >= OY && y < OY + HS.ROOM_H);
      this.walk.push(row);
    }
    this.blocked = this.walk.map((r) => r.map(() => false));
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) this.blocked[OY + y][OX + x] = true;   // the bed
    this.spawnTile = { x: OX + 5, y: OY + HS.ROOM_H - 1 };
    this.meadowTile = { x: OX + 8, y: OY + 4 };
  },

  // walls, wooden floor, bed, door, decorate board
  placeHouseProps() {
    const g = this.add.graphics().setDepth(-9);
    const W = this.cols * TILE, fx = OX * TILE, fy = OY * TILE, fw = HS.ROOM_W * TILE, fh = HS.ROOM_H * TILE;
    g.fillStyle(0x3b2a20).fillRect(0, 0, W, this.rows * TILE);
    g.fillStyle(0xe8d6b0).fillRect(fx, 0, fw, fy);                      // back wall
    g.fillStyle(0xd8c49a); for (let x = fx; x < fx + fw; x += 24) g.fillRect(x, 0, 2, fy);
    g.fillStyle(0xc0905a).fillRect(fx, fy, fw, fh);                      // floor planks
    g.fillStyle(0xa8784a); for (let y = fy; y < fy + fh; y += 24) g.fillRect(fx, y, fw, 2);
    for (let y = fy, k = 0; y < fy + fh; y += 24, k++) for (let x = fx + (k % 2) * 48; x < fx + fw; x += 96) g.fillRect(x, y, 2, 24);
    g.fillStyle(0xbfe3ef).fillRect(fx + fw - 150, 16, 60, 40).lineStyle(4, 0x8a5a36).strokeRect(fx + fw - 150, 16, 60, 40);   // window
    const dx = (OX + 5) * TILE, dy = (OY + HS.ROOM_H) * TILE;
    g.fillStyle(0x8a5a36).fillRect(dx, dy, TILE * 2, 14);                // door mat at the bottom
    this.add.image(fx + TILE, fy + TILE + 8, 'bed').setOrigin(0.5).setDepth(fy + 2 * TILE);
    this.bed = { x: fx + TILE, y: fy + 2 * TILE + 6 };
    this.doorSpot = { x: dx + TILE, y: dy - 10 };
    // decorate board on the back wall
    const bx = fx + fw / 2, by = fy - 30;
    g.fillStyle(0xa8703f).fillRoundedRect(bx - 50, by - 16, 100, 32, 8);
    this.add.text(bx, by, '布置家具', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(-8);
    this.decorSpot = { x: bx, y: fy + 20 };
    this.furnSprites = [];
    this.refreshHouse();
    // the room is smaller than the screen: keep it centred
    this.cameras.main.setBounds(W / 2 - GAME_W / 2, (this.rows * TILE) / 2 - GAME_H / 2, GAME_W, GAME_H);
  },

  // Furniture sprites + collision from the save (after every change).
  refreshHouse() {
    for (const s of this.furnSprites ?? []) s.destroy();
    this.furnSprites = [];
    for (let y = 0; y < HS.ROOM_H; y++) for (let x = 0; x < HS.ROOM_W; x++) this.blocked[OY + y][OX + x] = (x < 2 && y < 2);
    for (const [x, y] of HS.solidCells(this.state)) this.blocked[OY + y][OX + x] = true;
    this.fires = [];
    for (const it of HS.houseOf(this.state).items) {
      const { w, h } = HS.footprint(it.id, it.rot);
      const px = (OX + it.x + w / 2) * TILE, py = (OY + it.y + h) * TILE;
      const floor = HS.FURNITURE[it.id].floor;
      const img = this.add.image(px, floor ? py - (h * TILE) / 2 : py - 4, `furn_${it.id.slice(10)}`).setOrigin(0.5, floor ? 0.5 : 1).setDepth(floor ? -7 : py);
      if (it.rot && !floor) img.setFlipX(true);
      if (it.rot && floor) img.setAngle(90);
      this.furnSprites.push(img);
      if (HS.FURNITURE[it.id].light) this.fires.push({ x: px, y: py - 30 });
    }
  },

  houseSpots() {
    if (this.area !== 'house') return this.cottageSpot ? [{ at: this.cottageSpot, verb: '进屋', label: '我的小屋 · 进屋', tagY: 50, act: () => this.game.events.emit('enter-house') }] : [];
    return [
      { at: this.doorSpot, verb: '出门', label: '门 · 出去', tagY: 40, act: () => this.game.events.emit('leave-house') },
      { at: this.decorSpot, verb: '布置', label: '布置家具', tagY: 40, act: () => this.game.events.emit('decorate-request') },
    ];
  },

  // the cottage on the home island (door = way in)
  placeCottage() {
    const r = this.cottageRect;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (this.walk[y]?.[x]) this.blocked[y][x] = true;
    const px = r.x * TILE, py = r.y * TILE, pw = r.w * TILE, ph = r.h * TILE;
    this.add.image(px + pw / 2, py + ph + 4, 'shadow').setScale(3.2, 1.6).setDepth(py + ph - 1);
    this.add.image(px + pw / 2, py + ph + 8, 'bld_cottage').setOrigin(0.5, 1).setDepth(py + ph);   // AI art (T53)
    this.cottageSpot = { x: px + pw / 2, y: py + ph + 18 };
  },
};
