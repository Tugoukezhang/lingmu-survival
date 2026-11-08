// PlayScene methods — Expedition interactions: gathering, campfires, chests, thorns, lost bag, map data.
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
  // ---------- camping (T22) ----------
  addFireSprite(f) {
    const x = f.tx * TILE + TILE / 2, y = f.ty * TILE + TILE - 4;
    const img = this.add.image(x, y, 'item_campfire').setOrigin(0.5, 0.85).setDepth(y);
    img.setScale(64 / img.width);
    img.base = img.scaleY;
    this.blocked[f.ty][f.tx] = true;
    this.fireSprites.set(f.id, { img, x, y: y - 12, f });
  },

  // Burning campfires light the night; burnt-out ones turn grey.
  updateFires(time) {
    if (this.area !== 'expedition') return;
    this.fires = [];
    for (const s of this.fireSprites.values()) {
      const lit = CP.fireLeft(this.state, s.f) > 0;
      if (lit) {
        this.fires.push({ x: s.x, y: s.y });
        s.img.clearTint().setScale(s.img.scaleX, s.img.base * (1 + Math.sin(time / 140) * 0.04));
      } else s.img.setTint(0x777777);
    }
  },

  // Put a campfire from the bag on a free tile next to the player.
  placeCampfireNear() {
    const p = this.player, ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
    const fx = Math.round(this.facing.x), fy = Math.round(this.facing.y);
    const cands = [[fx, fy], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]];
    for (const [dx, dy] of cands) {
      if (!dx && !dy) continue;
      const tx = ptx + dx, ty = pty + dy;
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      const overlapsFeet = Math.abs(p.x - cx) < TILE / 2 + 12 && Math.abs(p.y - cy) < TILE / 2 + 8;
      if (!this.isWalkableTile(tx, ty, false) || overlapsFeet) continue;
      const r = CP.placeCampfire(this.state, tx, ty);
      if (!r.ok) { this.showToast('这里放不下营火'); return; }
      this.addFireSprite(r.fire);
      this.session.save('camp');
      this.showToast('营火点起来了：能烧 2 小时，靠近按「互动」可以添柴');
      return;
    }
    this.showToast('附近没有空地放营火');
  },

  campInfo(fireId) {
    const f = CP.fires(this.state).find((x) => x.id === fireId);
    return { fireId, left: CP.fireLeft(this.state, f), wood: CP.woodToDawn(this.state, f), have: countOf(this.state.inventory, 'item_wood'), tent: countOf(this.state.inventory, 'item_tent') > 0 };
  },

  onAddWood(fireId) {
    const r = CP.addWood(this.state, fireId);
    if (!r.ok) { this.showToast('背包里没有木材了'); return; }
    const info = this.campInfo(fireId);
    this.session.save('camp');
    this.showToast(`添了一根柴：还能烧 ${Math.floor(info.left / 60)} 小时 ${info.left % 60} 分${info.wood ? `，撑到天亮还差 ${info.wood} 根` : '，够烧到天亮了'}`);
  },

  onCampSleep(fireId) {
    const r = CP.canCampSleep(this.state, fireId);
    if (!r.ok) { this.showToast(r.reason === 'no-tent' ? '要有帐篷才能在野外睡觉' : `火撑不到天亮，还差 ${r.wood} 根柴`); return; }
    GD.bump(this.state, 'campSleeps');
    this.session.save('camp');
    this.startSleep(true);
  },

  tryOpenChest(c) {
    this.session.pullFromRegistry();
    const r = CP.openChest(this.state, c.id, { bonus: !!c.bonus });
    if (!r.ok) { this.showToast(r.reason === 'full' ? '背包满了，先腾出位置再开' : '已经打开过了'); return; }
    this.session.pushToRegistry();
    this.island.chests = this.island.chests.filter((x) => x.id !== c.id);
    this.blocked[c.ty][c.tx] = false;
    const parts = this.chestSprites.get(c.id) ?? [];
    this.tweens.add({ targets: parts, alpha: 0, y: '-=12', duration: 350, onComplete: () => parts.forEach((o) => o.destroy()) });
    this.session.save('chest');
    const names = Object.entries(r.loot.items).map(([id, n]) => `${ITEMS[id].name} ×${n}`).join('、');
    this.showToast(`打开了宝箱：${names}，四叶草 +${r.loot.clover}`);
  },

  // 开路: 橡果刺猬 in the party clears a thorn bush (recorded on this island).
  tryClearThorn(t) {
    const r = EX.clearThorn(this.state, t.id);
    if (!r.ok) { this.showToast(r.reason === 'need-clear' ? '荆棘太密了……队伍里有橡果刺猬就能开路' : '已经清掉了'); return; }
    this.island.thorns = this.island.thorns.filter((x) => x.id !== t.id);
    this.blocked[t.ty][t.tx] = false;
    const spr = this.thornSprites.get(t.id);
    this.thornSprites.delete(t.id);
    if (spr) this.tweens.add({ targets: spr, alpha: 0, scaleY: 0.3, duration: 300, onComplete: () => spr.destroy() });
    this.session.save('thorn');
    this.showToast('橡果刺猬滚成刺球，清出了一条路！');
  },

  // Everything the map panel needs (UIScene asks for it).
  mapData() {
    const isl = this.island;
    return {
      area: this.area, cols: this.cols, rows: this.rows, walk: this.walk, water: this.water,
      player: { x: this.player.x / TILE, y: this.player.y / TILE },
      airship: isl ? isl.airship : null, landing: isl ? isl.landing : null,
      dock: this.dock ? { x: this.dock.x / TILE, y: this.dock.y / TILE } : null,
      bed: this.bed ? { x: this.bed.x / TILE, y: this.bed.y / TILE } : null,
      fires: (isl ? [...this.fireSprites.values()].map((s) => ({ x: s.x / TILE, y: s.y / TILE, lit: CP.fireLeft(this.state, s.f) > 0 })) : this.fires.map((f) => ({ x: f.x / TILE, y: f.y / TILE, lit: true }))),
      lostBag: this.lostBag ? { x: this.lostBag.x / TILE, y: this.lostBag.y / TILE } : null,
      chests: isl ? isl.chests.map((c) => ({ tx: c.tx, ty: c.ty, bonus: !!c.bonus })) : [],
      thorns: isl ? (isl.thorns ?? []).map((t) => ({ tx: t.tx, ty: t.ty })) : [],
      rare: isl ? isl.resources.filter((r) => r.rare).map((r) => ({ tx: r.tx, ty: r.ty })) : [],
      sense: EX.treasureSense(this.state),
      skills: Object.keys(EX.SKILL_NAMES).filter((k) => EX.partySkill(this.state, k).has).map((k) => ({ k, boosted: EX.partySkill(this.state, k).boosted })),
    };
  },

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
  },

  // ---------- gathering (T19) ----------
  resourceCenter(r) { return { x: r.tx * TILE + TILE / 2, y: r.ty * TILE + TILE / 2 }; },

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
    return { at: c, verb: '采集', label: `${g.name} · ${pv.need ? gainText : `采集（${gainText}）`}`, tagY: best.type === 'tree' ? 108 : 52, act: () => this.gatherResource(best) };
  },

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
  },

  // Test helper: stand next to the first resource of `type`; returns its id.
  standByResource(type) {
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const r = this.island?.resources.find((x) => x.type === type && !x.rare && dirs.some(([dx, dy]) => this.isWalkableTile(x.tx + dx, x.ty + dy, false)));
    if (!r) return null;
    const [dx, dy] = dirs.find(([ax, ay]) => this.isWalkableTile(r.tx + ax, r.ty + ay, false));
    this.teleport((r.tx + dx) * TILE + TILE / 2, (r.ty + dy) * TILE + TILE / 2);
    return r.id;
  },

};
