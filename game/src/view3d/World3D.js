// 3D view of the world (trial, 2026-11-11; docs/14). Turned on with ?3d=1.
//
// The game logic stays where it is (PlayScene and systems/): this class only
// *draws*. Every frame it reads the PlayScene — ground texture, every image
// and label with its position, the lights, the clock — and shows the same
// world with a perspective camera behind the player, real light and shadows.
// 2D world x → 3D x, 2D world y → 3D z (north = away from the camera), up = y.
// Pets, people and props are the existing 2D art standing upright and facing
// the camera (the 饥荒 technique); real 3D models can replace them one by one.
// The Phaser canvas stays on top, transparent, for the HUD, panels and battles.
import * as THREE from '../../vendor/three/three.module.min.js';
import { GAME_W, GAME_H, TILE } from '../config.js';
import { tintAt } from '../systems/time.js';
import * as N from '../systems/night.js';

const SKIP = new Set(['ground', 'sky', 'cloud', 'lightbrush', 'shadow']);   // sky and clouds are drawn here; real shadows replace the blobs
const FLAT = new Set(['furn_rug', 'bridge_rope', 'bridge_broken', 'bridge_fixed', 'soil', 'soil_wet']);   // lie on the ground
const SOFT = new Set(['fogmonster']);                                         // translucent edges: blend, no hard cut-out
const NO_SHADOW = new Set(['fogmonster', 'item_torch', 'campfire_lit']);
const CAM = { back: 450, up: 330, look: 46, fov: 38 };                        // camera offset behind / above the player
const MAX_LIGHTS = 6;

export default class World3D {
  constructor(game) {
    this.game = game;
    const canvas = this.canvas = document.createElement('canvas');
    canvas.id = 'world3d';
    Object.assign(canvas.style, { position: 'absolute', zIndex: 0, display: 'none' });
    const host = game.canvas.parentElement;
    host.insertBefore(canvas, game.canvas);
    Object.assign(game.canvas.style, { position: 'relative', zIndex: 1 });

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(GAME_W, GAME_H, false);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAM.fov, GAME_W / GAME_H, 20, 6000);
    this.camera.position.set(0, CAM.up, CAM.back);
    this.camera.lookAt(0, CAM.look, 0);
    this.camera.updateMatrixWorld();
    this.up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);   // "up" on the screen, in world space
    this.target = new THREE.Vector3();
    this.refDist = Math.hypot(CAM.back, CAM.up - CAM.look);   // camera → player

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xcfe6a8, 1);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -760; sc.right = 760; sc.top = 620; sc.bottom = -620; sc.near = 10; sc.far = 2200;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.fog = new THREE.Fog(0x9fd3e6, 900, 2300);
    this.points = [];
    for (let i = 0; i < MAX_LIGHTS; i++) { const p = new THREE.PointLight(0xffc27a, 0, 300, 0); p.visible = false; this.points.push(p); this.scene.add(p); }

    this.upGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);       // stands on its bottom edge
    this.flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);     // lies on the ground
    this.labelGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    this.ringGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    this.texCache = new Map();
    this.map = new Map();        // Phaser object → { mesh, kind, ... }
    this.statics = [];           // ground, cloud sea … (rebuilt on attach)
    this.rings = [];
    this.plotHints = [];
    this.ps = null;
  }

  // ---------- textures ----------
  tex(key) {
    let t = this.texCache.get(key);
    if (t) return t;
    const src = this.ps.textures.get(key).getSourceImage();
    t = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    this.texCache.set(key, t);
    return t;
  }

  // ---------- attach / detach ----------
  attach(ps) {
    this.detach();
    this.ps = ps;
    const W = ps.cols * TILE, H = ps.rows * TILE;
    if (ps.textures.exists('ground')) {
      const img = ps.textures.get('ground').getSourceImage();
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(img.width, img.height).rotateX(-Math.PI / 2),
        new THREE.MeshLambertMaterial({ map: this.tex('ground'), alphaTest: 0.5, depthWrite: false }));
      ground.position.set(img.width / 2, 0, img.height / 2);
      ground.receiveShadow = true;
      ground.renderOrder = -1;                       // drawn first: nothing standing on it is ever cut by it
      this.addStatic(ground);
    }
    // sea of clouds far below the island
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xeef8fc, depthWrite: false }));
    sea.position.set(W / 2, -420, H / 2); sea.renderOrder = -3;
    this.sea = sea; this.addStatic(sea);
    this.clouds = [];
    const rnd = mulberry(ps.cols * 131 + ps.rows);
    for (let i = 0; i < 46; i++) {
      const m = new THREE.Mesh(this.upGeo, new THREE.MeshBasicMaterial({ map: this.tex('cloud'), transparent: true, depthWrite: false, opacity: 0.9 }));
      const a = rnd() * Math.PI * 2, d = Math.max(W, H) * (0.55 + rnd() * 1.1), s = 260 + rnd() * 420;
      m.position.set(W / 2 + Math.cos(a) * d, -150 - rnd() * 230, H / 2 + Math.sin(a) * d * 0.9);
      m.scale.set(s, s * 0.42, 1);
      m.renderOrder = -2;
      m.drift = 4 + rnd() * 8;
      this.clouds.push(m); this.addStatic(m);
    }
    const p = ps.player;
    this.target.set(p.x, 0, p.y);
  }

  addStatic(m) { this.statics.push(m); this.scene.add(m); }

  detach() {
    for (const e of this.map.values()) this.dropEntry(e);
    this.map.clear();
    for (const m of [...this.statics, ...this.rings, ...this.plotHints]) { this.scene.remove(m); m.material.dispose?.(); }
    this.statics = []; this.rings = []; this.plotHints = [];
    for (const t of this.texCache.values()) t.dispose();
    this.texCache.clear();
    this.ps = null;
    this.canvas.style.display = 'none';
  }

  dropEntry(e) {
    this.scene.remove(e.mesh);
    if (e.kind === 'label') e.mesh.material.map?.dispose();
    e.mesh.material.dispose();
  }

  // Keep the 3D canvas exactly under the Phaser canvas (which is scaled to fit the window).
  layout() {
    const c = this.game.canvas, s = this.canvas.style;
    const l = `${c.offsetLeft}px`, t = `${c.offsetTop}px`, w = `${c.clientWidth}px`, h = `${c.clientHeight}px`;
    if (s.left !== l) s.left = l;
    if (s.top !== t) s.top = t;
    if (s.width !== w) s.width = w;
    if (s.height !== h) s.height = h;
  }

  // ---------- every frame ----------
  update(ps, time, dt) {
    if (this.ps !== ps) this.attach(ps);
    const on = ps.area !== 'house';                 // the room is still drawn in 2D
    ps.cameras.main.setAlpha(on ? 0 : 1);         // hide the 2D world; the camera keeps running (fades, follow)
    this.canvas.style.display = on ? 'block' : 'none';
    if (!on) return;
    this.layout();
    const fe = ps.cameras.main.fadeEffect;          // travel / sleep fades of the hidden 2D camera
    const fade = fe && (fe.isRunning || (fe.isComplete && fe.direction)) ? fe.alpha : 0;
    this.canvas.style.opacity = String(1 - fade);

    // camera follows the player
    const p = ps.player;
    this.target.lerp(new THREE.Vector3(p.x, 0, p.y), Math.min(1, dt * 7));
    this.camera.position.set(this.target.x, CAM.up, this.target.z + CAM.back);
    this.camera.lookAt(this.target.x, CAM.look, this.target.z);
    this.camera.updateMatrixWorld();

    this.syncObjects(ps);
    this.syncLabels(ps);
    this.syncLight(ps, time);
    this.syncRings(ps, time);
    this.syncPlots(ps);
    for (const c of this.clouds) { c.position.x += c.drift * dt; c.quaternion.copy(this.camera.quaternion); }
    this.renderer.render(this.scene, this.camera);
  }

  syncObjects(ps) {
    const seen = new Set();
    const q = this.camera.quaternion;
    for (const o of ps.children.list) {
      const type = o.type;
      if (type !== 'Image' && type !== 'TileSprite') continue;
      const key = o.texture?.key;
      if (!key || SKIP.has(key) || o.scrollFactorX === 0) continue;
      seen.add(o);
      let e = this.map.get(o);
      if (!e || e.key !== key) {
        if (e) this.dropEntry(e);
        e = this.makeEntry(o, key, type);
        this.map.set(o, e);
      }
      const m = e.mesh, dw = o.displayWidth, dh = o.displayHeight;
      m.visible = o.visible && o.alpha > 0.01;
      if (!m.visible) continue;
      const mat = m.material;
      if (e.soft) mat.opacity = o.alpha;
      else if (o.alpha < 0.99) { if (!mat.transparent) { mat.transparent = true; mat.needsUpdate = true; } mat.opacity = o.alpha; }
      else if (mat.transparent) { mat.transparent = false; mat.opacity = 1; mat.needsUpdate = true; }
      mat.color.setHex(o.isTinted ? o.tintTopLeft : 0xffffff);
      if (e.kind === 'up' && !e.soft && dh > 96 && o !== ps.player) {
        const front = o.y - ps.player.y;                       // > 0: nearer to the camera than the player
        const a = front > 30 ? Math.max(0.28, 1 - (front - 30) / 150) * o.alpha : o.alpha;
        if (a < 0.99) { if (!mat.transparent) { mat.transparent = true; mat.needsUpdate = true; } mat.opacity = a; }
      }
      if (e.kind === 'flat') {
        m.position.set(o.x + (0.5 - o.originX) * dw, 0.6, o.y + (0.5 - o.originY) * dh);
        m.scale.set(o.flipX ? -dw : dw, 1, dh);
        m.rotation.y = -o.rotation;
      } else {
        // feet on the ground at the object's position; a moving origin (pets bobbing) lifts it
        const below = (1 - o.originY) * dh;
        if (e.below0 == null || below > e.below0) e.below0 = below;
        m.position.set(o.x + (0.5 - o.originX) * dw, 0, o.y).addScaledVector(this.up, e.below0 - below);
        m.scale.set(o.flipX ? -dw : dw, dh, 1);
        m.quaternion.copy(q);
        if (o.rotation) m.rotateZ(-o.rotation);
        e.foot = { x: o.x, y: o.y, w: dw, h: dh };
      }
    }
    for (const [o, e] of this.map) if (e.kind !== 'label' && !seen.has(o)) { this.dropEntry(e); this.map.delete(o); }
  }

  makeEntry(o, key, type) {
    const flat = type === 'TileSprite' || FLAT.has(key);
    const soft = SOFT.has(key);
    let map = this.tex(key);
    if (type === 'TileSprite') {
      map = map.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(o.width / map.image.width, o.height / map.image.height);
      map.offset.set((o.tilePositionX % map.image.width) / map.image.width, 0);
      map.needsUpdate = true;
    }
    const mat = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide, alphaTest: soft ? 0.02 : 0.4, transparent: soft || flat, depthWrite: !(soft || flat) });
    const mesh = new THREE.Mesh(flat ? this.flatGeo : this.upGeo, mat);
    mesh.castShadow = !flat && !NO_SHADOW.has(key);
    if (flat) { mesh.receiveShadow = true; mesh.renderOrder = 1; }
    this.scene.add(mesh);
    return { mesh, key, kind: flat ? 'flat' : 'up', soft };
  }

  // Phaser texts (name tag, signs, wild pet levels, "!") float above what they belong to.
  syncLabels(ps) {
    const seen = new Set();
    const feet = [];
    for (const e of this.map.values()) if (e.kind === 'up' && e.foot && e.mesh.visible) feet.push(e.foot);
    for (const o of ps.children.list) {
      if (o.type !== 'Text' || o.scrollFactorX === 0) continue;
      seen.add(o);
      let e = this.map.get(o);
      const cw = o.canvas.width, ch = o.canvas.height;
      if (!e) {
        const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false });
        e = { mesh: new THREE.Mesh(this.labelGeo, mat), kind: 'label' };
        e.mesh.renderOrder = 20;
        this.scene.add(e.mesh);
        this.map.set(o, e);
      }
      if (e.text !== o.text || e.cw !== cw || e.ch !== ch || e.bg !== o.style.backgroundColor) {
        e.mesh.material.map?.dispose();
        const t = new THREE.CanvasTexture(o.canvas);
        t.colorSpace = THREE.SRGBColorSpace;
        e.mesh.material.map = t; e.mesh.material.needsUpdate = true;
        e.text = o.text; e.cw = cw; e.ch = ch; e.bg = o.style.backgroundColor;
      }
      const m = e.mesh;
      m.visible = o.visible && o.alpha > 0.01 && !!o.text;
      if (!m.visible) continue;
      m.material.opacity = o.alpha;
      // the thing right below the label in the 2D layout → float that many pixels above its feet
      const lx = o.x + (0.5 - o.originX) * o.displayWidth, ly = o.y + (1 - o.originY) * o.displayHeight;
      let best = null, bestScore = 1e9;
      for (const f of feet) {
        const dx = Math.abs(lx - f.x), dy = f.y - ly;
        if (dy < -6 || dy > f.h + 110 || dx > f.w / 2 + 30) continue;
        const score = dx * 2 + dy * 0.3;
        if (score < bestScore) { bestScore = score; best = f; }
      }
      if (best) m.position.set(lx, 0, best.y).addScaledVector(this.up, Math.max(8, best.y - ly));
      else m.position.set(lx, 0, ly).addScaledVector(this.up, 26);
      // same size on screen wherever it is (a sign near the camera must not fill the view)
      const k = Phaser.Math.Clamp(m.position.distanceTo(this.camera.position) / this.refDist, 0.5, 1.6);
      m.scale.set(o.displayWidth * k, o.displayHeight * k, 1);
      m.quaternion.copy(this.camera.quaternion);
    }
    for (const [o, e] of this.map) if (e.kind === 'label' && !seen.has(o)) { this.dropEntry(e); this.map.delete(o); }
  }

  // Sun and sky by the clock; campfires, lamps and the player's torch are real point lights at night.
  syncLight(ps, time) {
    const t = tintAt(ps.state.clock);
    const dark = t.dark ?? 0;                         // 0 day … ~0.6 deep night
    const day = Math.max(0.1, 1 - dark * 1.65);
    const night = new THREE.Color(t.color ?? 0x24305a);
    this.hemi.intensity = 2.1 * day;
    this.hemi.color.set(0xffffff).lerp(night, Math.min(1, dark * 1.2));
    this.sun.intensity = 2.2 * Math.max(0, 1 - dark * 2.2);
    this.sun.position.set(this.target.x - 420, 640, this.target.z + 260);
    this.sun.target.position.copy(this.target);
    const sky = new THREE.Color(0x9fd3e6).lerp(new THREE.Color(0x1b2440), Math.min(1, dark * 1.5));
    this.renderer.setClearColor(sky);
    this.scene.fog.color.copy(sky);
    this.scene.fog.near = 900 - dark * 500; this.scene.fog.far = 2300 - dark * 900;
    this.sea.material.color.set(0xeef8fc).lerp(new THREE.Color(0x3a4668), Math.min(1, dark * 1.4));
    for (const c of this.clouds) c.material.color.copy(this.sea.material.color);

    const ls = dark > 0.02 ? N.lights(ps.state, ps.player, ps.fires).slice().sort((a, b) => dist2(a, ps.player) - dist2(b, ps.player)).slice(0, MAX_LIGHTS) : [];
    this.points.forEach((pl, i) => {
      const l = ls[i];
      pl.visible = !!l;
      if (!l) { pl.intensity = 0; return; }
      pl.position.set(l.x, 70, l.y);
      pl.distance = l.r * 2.3;
      pl.intensity = Math.min(1, dark * 2.4) * (3.6 + Math.sin(time / 130 + i) * 0.15);
    });
  }

  // red warning circles of the fog monsters (drawn by Phaser graphics in 2D)
  syncRings(ps, time) {
    const ws = ps.warnings ?? [];
    while (this.rings.length < ws.length) {
      const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xe8443a, transparent: true, opacity: 0.4, depthWrite: false }));
      m.renderOrder = 2; this.rings.push(m); this.scene.add(m);
    }
    this.rings.forEach((m, i) => {
      const w = ws[i];
      m.visible = !!w;
      if (!w) return;
      m.position.set(w.x, 1.2, w.y);
      m.scale.set(w.r, 1, w.r);
      m.material.opacity = 0.3 + 0.2 * Math.sin(time / 90);
    });
  }

  // faint squares where the field can be tilled (Phaser graphics in 2D)
  syncPlots(ps) {
    const plots = ps.plots ?? [];
    while (this.plotHints.length < plots.length) {
      const m = new THREE.Mesh(this.flatGeo, new THREE.MeshBasicMaterial({ color: 0xe6f6b0, transparent: true, opacity: 0.3, depthWrite: false }));
      m.scale.set(TILE - 8, 1, TILE - 8); m.renderOrder = 0;
      this.plotHints.push(m); this.scene.add(m);
    }
    this.plotHints.forEach((m, i) => {
      const pl = plots[i];
      m.visible = !!pl && !ps.soilSprites?.has(pl.key);
      if (m.visible) m.position.set(pl.cx, 0.4, pl.cy);
    });
  }

  debug() {
    let up = 0, flat = 0, label = 0;
    for (const e of this.map.values()) { if (e.kind === 'up') up++; else if (e.kind === 'flat') flat++; else label++; }
    return { attached: !!this.ps, shown: this.canvas.style.display !== 'none', up, flat, label, lights: this.points.filter((p) => p.visible).length, calls: this.renderer.info.render.calls };
  }
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
