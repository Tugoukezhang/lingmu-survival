// PlayScene methods — the home farm (T11): field plots, shipping box, seed stand.
// Mixed into PlayScene.prototype (see ../PlayScene.js); `this` is the scene.
import { TILE, FONT } from '../../config.js';
import { CROPS } from '../../data/crops.js';
import { ITEMS } from '../../data/items.js';
import * as FM from '../../systems/farm.js';
import { worldOf } from '../../systems/progress.js';

export default {
  // Field next to the home spawn + the shipping box and seed stand on its right.
  placeFarm() {
    const r = this.farmRect;
    this.plots = [];
    const expanded = worldOf(this.state).expanded;
    for (const rect of expanded ? [r, this.expandRect] : [r]) {
      for (let ty = rect.y; ty < rect.y + rect.h; ty++) for (let tx = rect.x; tx < rect.x + rect.w; tx++) {
        if (!this.walk[ty]?.[tx] || this.blocked[ty][tx]) continue;
        this.plots.push({ key: FM.plotKey(tx, ty), tx, ty, cx: tx * TILE + TILE / 2, cy: ty * TILE + TILE / 2 });
      }
    }
    if (!expanded) this.placeExpansionSign();
    this.farmLayer = this.add.graphics().setDepth(-5);
    this.cropSprites = new Map();
    const prop = (tx, ty, key, tint) => {
      this.blocked[ty][tx] = true;
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE - 6;
      const img = this.add.image(x, y, key).setOrigin(0.5, 0.9).setDepth(y);
      if (tint) img.setTint(tint);
      return { x, y };
    };
    this.shipSpot = prop(r.x + r.w, r.y, 'chest', 0xc0864a);
    this.seedSpot = prop(r.x + r.w, r.y + 2, 'seedstand');
    this.add.text(this.shipSpot.x, this.shipSpot.y - 44, '出货箱', { fontFamily: FONT, fontSize: '13px', color: '#ffffff', backgroundColor: '#5b3d26', padding: { x: 4, y: 1 } }).setOrigin(0.5).setDepth(this.shipSpot.y);
    this.refreshFarm();
  },

  // Fenced plot with a sign until the expansion is bought (T14).
  placeExpansionSign() {
    const e = this.expandRect;
    const g = this.add.graphics().setDepth((e.y + e.h) * TILE);
    for (let ty = e.y; ty < e.y + e.h; ty++) for (let tx = e.x; tx < e.x + e.w; tx++) if (this.walk[ty]?.[tx]) this.blocked[ty][tx] = true;
    const x0 = e.x * TILE + 4, y0 = e.y * TILE + 4, x1 = (e.x + e.w) * TILE - 4, y1 = (e.y + e.h) * TILE - 4;
    g.fillStyle(0xd8c89a, 0.35).fillRect(x0, y0, x1 - x0, y1 - y0);
    g.lineStyle(4, 0x8a5a36);
    g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle(0x8a5a36);
    for (let x = x0; x <= x1; x += 24) { g.fillRect(x - 3, y0 - 8, 6, 16); g.fillRect(x - 3, y1 - 8, 6, 16); }
    for (let y = y0; y <= y1; y += 24) { g.fillRect(x0 - 3, y - 8, 6, 16); g.fillRect(x1 - 3, y - 8, 6, 16); }
    const sx = (e.x + e.w / 2) * TILE, sy = (e.y + e.h) * TILE + 20;
    g.fillStyle(0x6e4529).fillRect(sx - 3, sy - 4, 6, 26);
    g.fillStyle(0xa8703f).fillRoundedRect(sx - 40, sy - 26, 80, 26, 6);
    this.add.text(sx, sy - 13, '扩建用地', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(sy + 1);
    this.expandSpot = { x: sx, y: sy + 26 };
  },

  // Redraw soil and crops from the save.
  refreshFarm() {
    if (!this.plots) return;
    const g = this.farmLayer.clear();
    for (const p of this.plots) {
      const s = FM.plotOf(this.state, p.key);
      const x = p.cx - TILE / 2 + 3, y = p.cy - TILE / 2 + 3, w = TILE - 6;
      if (!s.tilled) {
        g.fillStyle(0xd8f0a0, 0.28).fillRoundedRect(x, y, w, w, 8).lineStyle(2, 0xa88a5a, 0.55).strokeRoundedRect(x, y, w, w, 8);
      } else {
        g.fillStyle(s.watered ? 0x5e3d24 : 0x8a5a36, 1).fillRoundedRect(x, y, w, w, 8);
        g.fillStyle(0x000000, 0.12); for (let k = 1; k < 3; k++) g.fillRect(x + 4, y + (w * k) / 3, w - 8, 2);
      }
      const old = this.cropSprites.get(p.key);
      if (!s.crop) { if (old) { old.destroy(); this.cropSprites.delete(p.key); } continue; }
      const stage = FM.ripe(s) ? 2 : s.days >= 1 ? 1 : 0;
      const key = `crop_${s.crop}_${stage}`;
      if (old && old.texture.key === key) continue;
      old?.destroy();
      this.cropSprites.set(p.key, this.add.image(p.cx, p.cy + TILE / 2 - 4, key).setOrigin(0.5, 1).setDepth(p.cy + 10));
    }
  },

  nearestPlot() {
    if (!this.plots) return null;
    let best = null, bestD = 34;
    for (const p of this.plots) {
      const d = Math.hypot(this.player.x - p.cx, this.player.y - p.cy);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  },

  // The interaction spot for the plot the player stands on.
  farmSpot() {
    const p = this.nearestPlot();
    if (!p) return null;
    const s = FM.plotOf(this.state, p.key), act = FM.plotAction(this.state, p.key);
    const c = s.crop ? CROPS[s.crop] : null;
    const left = c ? c.days - s.days : 0;
    const info = {
      till: ['开垦', '农田 · 用锄头开垦'],
      plant: ['播种', '农田 · 点「播种」选种子'],
      water: ['浇水', `${c?.name} · 浇水（还要 ${left} 天）`],
      harvest: ['收获', `${c?.name} · 成熟了！`],
      wait: ['查看', `${c?.name} · 今天浇过了，还要 ${left} 天`],
    }[act];
    return { at: { x: p.cx, y: p.cy }, verb: info[0], label: info[1], tagY: 46, act: () => this.plotAct(p, act) };
  },

  plotAct(p, act) {
    const st = this.state;
    if (act === 'plant') { this.game.events.emit('seed-request', { key: p.key }); return; }
    if (act === 'wait') { this.showToast('今天已经浇过水了，明天再来'); return; }
    const r = act === 'till' ? FM.till(st, p.key) : act === 'water' ? FM.water(st, p.key) : FM.harvest(st, p.key);
    if (!r.ok) {
      this.showToast({ 'no-hoe': '要有锄头才能开垦', 'no-can': '要有水壶才能浇水', full: '背包满了，先腾出一格' }[r.reason] ?? '现在不能这么做');
      return;
    }
    this.session.markDirty();
    this.refreshFarm();
    if (act === 'harvest') this.showToast(`收获了 ${ITEMS[r.item].name}！`);
    this.tweens.add({ targets: this.player, scaleX: 1.1, scaleY: 0.9, duration: 80, yoyo: true });
  },

  onPlant({ key, seed }) {
    const r = FM.plant(this.state, key, seed);
    if (!r.ok) { this.showToast(r.reason === 'no-seed' ? '没有这种种子了' : '这里种不了'); return; }
    this.session.markDirty();
    this.refreshFarm();
    this.showToast(`种下了${CROPS[r.crop].name}：每天浇水，${CROPS[r.crop].days} 天后成熟`);
  },

  // test helper: stand on a plot (index into this.plots)
  standOnPlot(i = 0) { const p = this.plots[i]; this.teleport(p.cx, p.cy); return p.key; },
};
