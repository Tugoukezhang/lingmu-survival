// 3D view of the world (docs/14). Turned on with ?3d=1 (&q=low for weak devices).
//
// The game logic stays where it is (PlayScene and systems/): this class only
// *draws*. Every frame it reads the PlayScene — walk grid, ground painting,
// every image and label with its position, the lights, the clock — and shows
// the same map with a perspective camera behind the player.
// 2D world x → 3D x, 2D world y → 3D z (north = away from the camera), up = y.
//
// The map itself is real 3D from the kit (view3d/kit/): island terrain with a
// cliff ring, tens of thousands of grass blades coloured from the ground,
// fluffy trees, pines, shrubs, chiselled rocks, crystals, flowers, soft sun
// shadows, bloom, tilt-shift and colour grading. Things that have no 3D model
// yet (pets, people, buildings, items) are the existing 2D art standing upright
// and facing the camera, tinted by the light around them.
// The Phaser canvas stays on top, transparent, for the HUD, panels and battles.
import * as THREE from 'three';
import { GAME_W, GAME_H, TILE } from '../config.js';
import { tintAt } from '../systems/time.js';
import * as N from '../systems/night.js';
import { TIME, rng } from './kit/shared.js';
import { buildIsland } from './kit/terrain.js';
import { buildGrass } from './kit/grass.js';
import { makeKit } from './kit/flora.js';
import { makePost } from './kit/post.js';
import { smallFlowerGeometry } from './look/nature.js';

const SKIP = new Set(['ground', 'sky', 'cloud', 'lightbrush', 'shadow']);   // sky and clouds are drawn here; real shadows replace the blobs
const FLAT = new Set(['furn_rug', 'bridge_rope', 'bridge_broken', 'bridge_fixed', 'soil', 'soil_wet']);   // lie on the ground
const SOFT = new Set(['fogmonster']);                                         // translucent edges: blend, no hard cut-out
const NO_SHADOW = new Set(['fogmonster', 'item_torch', 'campfire_lit']);
const MODEL_SCALE = { tree: 1.28, tree_b: 1.22, tree_c: 1.15, bush: 1.1, grass_tuft: 1.2, rock: 1.25, rock_b: 1.2, crystal: 1.15 };   // 3D props a bit bigger than the sprites were
const CAM = { back: 440, up: 292, look: 44, fov: 40 };                        // camera offset behind / above the player
const MAX_LIGHTS = 6;
const QUALITY = new URLSearchParams(location.search).get('q') ?? 'high';

export default class World3D {
  constructor(game) {
    this.game = game;
    const canvas = this.canvas = document.createElement('canvas');
    canvas.id = 'world3d';
    Object.assign(canvas.style, { position: 'absolute', zIndex: 0, display: 'none' });
    const host = game.canvas.parentElement;
    host.insertBefore(canvas, game.canvas);
    Object.assign(game.canvas.style, { position: 'relative', zIndex: 1 });

    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY === 'low' ? 1 : 2));
    r.setSize(GAME_W, GAME_H, false);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;        // keeps the art's colours (2D sprites) close to the source
    r.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAM.fov, GAME_W / GAME_H, 20, 7000);
    this.camera.position.set(0, CAM.up, CAM.back);
    this.camera.lookAt(0, CAM.look, 0);
    this.camera.updateMatrixWorld();
    this.up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);   // "up" on the screen, in world space
    this.target = new THREE.Vector3();
    this.refDist = Math.hypot(CAM.back, CAM.up - CAM.look);   // camera → player

    this.hemi = new THREE.HemisphereLight(0xe6f4ff, 0x86b24a, 1);
    this.sun = new THREE.DirectionalLight(0xffe9c4, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(QUALITY === 'low' ? 1024 : 2048, QUALITY === 'low' ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -820; sc.right = 820; sc.top = 700; sc.bottom = -640; sc.near = 10; sc.far = 2600;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 1.2; this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.fog = new THREE.Fog(0xbfe6f2, 1000, 2600);
    this.points = [];
    for (let i = 0; i < MAX_LIGHTS; i++) { const p = new THREE.PointLight(0xffc27a, 0, 300, 0); p.visible = false; this.points.push(p); this.scene.add(p); }

    // sky dome: deeper blue overhead, pale at the horizon
    const skyGeo = new THREE.SphereGeometry(5200, 24, 12);
    const sp = skyGeo.attributes.position, scol = new Float32Array(sp.count * 3), ca = new THREE.Color(0x58aee6), cb = new THREE.Color(0xd4f0fa), cc = new THREE.Color();
    for (let i = 0; i < sp.count; i++) { const t = Math.max(0, Math.min(1, sp.getY(i) / 5200 * 1.6 + 0.15)); cc.copy(cb).lerp(ca, t); scol.set([cc.r, cc.g, cc.b], i * 3); }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
    this.sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    this.post = makePost(r, this.scene, this.camera, { width: GAME_W, height: GAME_H, quality: QUALITY });
    this.kit = makeKit();
    this.upGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);       // stands on its bottom edge
    this.flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);     // lies on the ground
    this.ringGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    this.texCache = new Map();
    this.map = new Map();        // Phaser object → { mesh, kind, ... }
    this.statics = [];           // terrain, grass, clouds … (rebuilt on attach)
    this.rings = [];
    this.plotHints = [];
    this.lightList = [];
    this.ambient = new THREE.Color(1, 1, 1);
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
    if (ps.area === 'house') return;                 // the room is still drawn in 2D
    const W = ps.cols * TILE, H = ps.rows * TILE;
    const seed = ps.cols * 131 + ps.rows * 17 + (ps.island?.seed ?? 0) % 9973;
    const groundCanvas = ps.textures.exists('ground') ? ps.textures.get('ground').getSourceImage() : null;
    this.terrain = buildIsland({ walk: ps.walk, cols: ps.cols, rows: ps.rows, tile: TILE, groundCanvas, seed });
    this.addStatic(this.terrain.group);

    // no grass on the field, under the fire, the tent, the buildings …
    const bare = new Set();
    for (const p of ps.plots ?? []) bare.add(`${Math.floor(p.cx / TILE)},${Math.floor(p.cy / TILE)}`);
    const avoid = (x, y) => bare.has(`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`);
    this.grass = buildGrass(this.terrain, { step: QUALITY === 'low' ? 11 : 6, bladeH: 11, bladeW: 5, seed, avoid });
    this.addStatic(this.grass.group);
    this.addFlowers(seed, avoid);

    // sea of clouds far below the island
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xeef8fc, depthWrite: false }));
    sea.position.set(W / 2, -460, H / 2); sea.renderOrder = -3;
    this.sea = sea; this.addStatic(sea);
    this.clouds = [];
    const rnd = rng(seed + 7);
    for (let i = 0; i < 54; i++) {
      const m = new THREE.Mesh(this.upGeo, new THREE.MeshBasicMaterial({ map: this.tex('cloud'), transparent: true, depthWrite: false, opacity: 0.92 }));
      const a = rnd() * Math.PI * 2, d = Math.max(W, H) * (0.52 + rnd() * 1.2), s = 300 + rnd() * 520;
      m.position.set(W / 2 + Math.cos(a) * d, -170 - rnd() * 250, H / 2 + Math.sin(a) * d * 0.9);
      m.scale.set(s, s * 0.42, 1);
      m.renderOrder = -2;
      m.drift = 4 + rnd() * 8;
      this.clouds.push(m); this.addStatic(m);
    }
    const p = ps.player;
    this.target.set(p.x, 0, p.y);
  }

  // small white / pink / yellow flowers dotted over the meadow (decoration only)
  addFlowers(seed, avoid) {
    const rand = rng(seed + 31), t = this.terrain;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    for (const [color, per] of [[0xfffaf0, 1 / 11000], [0xf7a8c2, 1 / 30000], [0xf8cf48, 1 / 28000]]) {
      const want = Math.round(t.W * t.H * per * (QUALITY === 'low' ? 0.5 : 1));
      const mesh = new THREE.InstancedMesh(smallFlowerGeometry(color), mat, want);
      let n = 0;
      for (let k = 0; k < want * 6 && n < want; k++) {
        const x = rand() * t.W, y = rand() * t.H;
        if (!t.isGrass(x, y, 235) || avoid(x, y)) continue;
        const sc = 34 + rand() * 22;
        mesh.setMatrixAt(n++, m4.compose(p.set(x, 0, y), q.setFromEuler(e.set(0, rand() * 6.28, 0)), s.setScalar(sc)));
      }
      mesh.count = n; mesh.frustumCulled = false; mesh.receiveShadow = true;
      this.addStatic(mesh);
    }
    this.flowerMat = mat;
  }

  addStatic(m) { this.statics.push(m); this.scene.add(m); }

  detach() {
    for (const e of this.map.values()) this.dropEntry(e);
    this.map.clear();
    for (const m of this.statics) this.scene.remove(m);
    for (const m of [...this.rings, ...this.plotHints, ...(this.clouds ?? []), ...(this.sea ? [this.sea] : [])]) { this.scene.remove(m); m.material.dispose?.(); }
    this.terrain?.dispose(); this.grass?.dispose(); this.flowerMat?.dispose();
    this.terrain = this.grass = this.flowerMat = this.sea = null;
    this.statics = []; this.rings = []; this.plotHints = []; this.clouds = [];
    for (const t of this.texCache.values()) t.dispose();
    this.texCache.clear();
    this.ps = null;
    this.canvas.style.display = 'none';
  }

  dropEntry(e) {
    this.scene.remove(e.mesh);
    if (e.kind === 'model') return;                  // geometry and materials belong to the kit
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
    const on = ps.area !== 'house';
    ps.cameras.main.setAlpha(on ? 0 : 1);         // hide the 2D world; the camera keeps running (fades, follow)
    this.canvas.style.display = on ? 'block' : 'none';
    if (!on) return;
    this.layout();
    const fe = ps.cameras.main.fadeEffect;          // travel / sleep fades of the hidden 2D camera
    const fade = fe && (fe.isRunning || (fe.isComplete && fe.direction)) ? fe.alpha : 0;
    this.canvas.style.opacity = String(1 - fade);
    TIME.value = time / 1000;

    // camera follows the player
    const p = ps.player;
    this.target.lerp(new THREE.Vector3(p.x, 0, p.y), Math.min(1, dt * 7));
    this.camera.position.set(this.target.x, CAM.up, this.target.z + CAM.back);
    this.camera.lookAt(this.target.x, CAM.look, this.target.z);
    this.camera.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);

    this.syncLight(ps, time);
    this.syncObjects(ps);
    this.syncLabels(ps);
    this.syncRings(ps, time);
    this.syncPlots(ps);
    for (const c of this.clouds) { c.position.x += c.drift * dt; c.quaternion.copy(this.camera.quaternion); }
    this.post.render(dt);
  }

  // light on an unlit sprite at (x, y): the day / night ambient plus nearby fires and lamps
  spriteTint(x, y, out) {
    out.copy(this.ambient);
    for (const l of this.lightList) {
      const d = Math.hypot(x - l.x, y - l.y), k = 1 - d / (l.r * 1.9);
      if (k > 0) { const a = k * k * l.power; out.r += 1.0 * a; out.g += 0.78 * a; out.b += 0.5 * a; }
    }
    out.r = Math.min(1.12, out.r); out.g = Math.min(1.12, out.g); out.b = Math.min(1.12, out.b);
    return out;
  }

  syncObjects(ps) {
    const seen = new Set();
    const q = this.camera.quaternion;
    const tint = new THREE.Color(), tc = new THREE.Color();
    const pl = ps.player;
    for (const o of ps.children.list) {
      const type = o.type;
      if (type !== 'Image' && type !== 'TileSprite') continue;
      const key = o.texture?.key;
      if (!key || SKIP.has(key) || o.scrollFactorX === 0) continue;
      seen.add(o);
      let e = this.map.get(o);
      if (!e || e.key !== key) {
        if (e) this.dropEntry(e);
        e = this.kit.has(key) ? this.makeModel(o, key) : this.makeEntry(o, key, type);
        this.map.set(o, e);
      }
      const m = e.mesh, dw = o.displayWidth, dh = o.displayHeight;
      m.visible = o.visible && o.alpha > (e.kind === 'model' ? 0.35 : 0.01);
      if (!m.visible) continue;
      if (e.kind === 'model') {
        // a real 3D prop from the kit, standing where the sprite is
        m.position.set(o.x, 0, o.y);
        m.scale.setScalar((dh / m.userData.height) * (MODEL_SCALE[key] ?? 1));
        const front = o.y - pl.y;
        this.kit.setGhost(m, e.tall && front > 24 && front < 330 && Math.abs(o.x - pl.x) < 70 + dw * 0.5);
        e.foot = { x: o.x, y: o.y, w: dw, h: dh * 1.25 };
        continue;
      }
      const mat = m.material;
      if (e.soft) mat.opacity = o.alpha;
      else if (o.alpha < 0.99) { if (!mat.transparent) { mat.transparent = true; mat.needsUpdate = true; } mat.opacity = o.alpha; }
      else if (mat.transparent) { mat.transparent = false; mat.opacity = 1; mat.needsUpdate = true; }
      this.spriteTint(o.x, o.y, tint);
      if (o.isTinted) tint.multiply(tc.setHex(o.tintTopLeft));
      mat.color.copy(tint);
      if (e.kind === 'up' && !e.soft && dh > 96 && o !== pl) {
        const front = o.y - pl.y;                       // > 0: nearer to the camera than the player
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

  makeModel(o, key) {
    const hash = (Math.round(o.x) * 73856093) ^ (Math.round(o.y) * 19349663);
    const mesh = this.kit.instantiate(key, Math.abs(hash));
    this.scene.add(mesh);
    return { mesh, key, kind: 'model', tall: key.startsWith('tree') };
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
    // sprites are not lit by the 3D lights (their shading is painted in); spriteTint() colours them
    const mat = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, alphaTest: soft ? 0.02 : 0.4, transparent: soft || flat, depthWrite: !(soft || flat) });
    const mesh = new THREE.Mesh(flat ? this.flatGeo : this.upGeo, mat);
    mesh.castShadow = !flat && !NO_SHADOW.has(key);
    if (flat) mesh.renderOrder = 1;
    this.scene.add(mesh);
    return { mesh, key, kind: flat ? 'flat' : 'up', soft };
  }

  // Phaser texts (name tag, signs, wild pet levels, "!") float above what they belong to.
  syncLabels(ps) {
    const seen = new Set();
    const feet = [];
    for (const e of this.map.values()) if ((e.kind === 'up' || e.kind === 'model') && e.foot && e.mesh.visible) feet.push(e.foot);
    for (const o of ps.children.list) {
      if (o.type !== 'Text' || o.scrollFactorX === 0) continue;
      seen.add(o);
      let e = this.map.get(o);
      const cw = o.canvas.width, ch = o.canvas.height;
      if (!e) {
        const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
        e = { mesh: new THREE.Mesh(this.upGeo, mat), kind: 'label' };
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
    this.hemi.intensity = 1.5 * day;
    this.hemi.color.set(0xe6f4ff).lerp(night, Math.min(1, dark * 1.2));
    this.sun.intensity = 3.3 * Math.max(0, 1 - dark * 2.2);
    this.sun.position.set(this.target.x - 460, 760, this.target.z + 320);     // from the front left: the sides we look at are lit, shadows fall back-right
    this.sun.target.position.copy(this.target);
    const nightK = Math.min(1, dark * 1.5);
    this.sky.material.color.set(0xffffff).lerp(new THREE.Color(0x232e58), nightK);
    const horizon = new THREE.Color(0xcdeaf5).lerp(new THREE.Color(0x1b2440), nightK);
    this.scene.fog.color.copy(horizon);
    this.scene.fog.near = 1000 - dark * 560; this.scene.fog.far = 2600 - dark * 1000;
    this.sea.material.color.set(0xeef8fc).lerp(new THREE.Color(0x3a4668), Math.min(1, dark * 1.4));
    for (const c of this.clouds) c.material.color.copy(this.sea.material.color);
    this.post.look.uniforms.uNight.value = nightK;
    this.post.bloom.strength = 0.2 + nightK * 0.35;
    // ambient for the unlit sprites
    this.ambient.set(0xffffff).lerp(night, Math.min(1, dark * 1.5)).multiplyScalar(1 - dark * 0.5);

    const ls = dark > 0.02 ? N.lights(ps.state, ps.player, ps.fires).slice().sort((a, b) => dist2(a, ps.player) - dist2(b, ps.player)).slice(0, MAX_LIGHTS) : [];
    const power = Math.min(1, dark * 2.4);
    this.lightList = ls.map((l) => ({ x: l.x, y: l.y, r: l.r, power: power * 0.75 }));
    this.points.forEach((pl, i) => {
      const l = ls[i];
      pl.visible = !!l;
      if (!l) { pl.intensity = 0; return; }
      pl.position.set(l.x, 70, l.y);
      pl.distance = l.r * 2.3;
      pl.intensity = power * (4.4 + Math.sin(time / 130 + i) * 0.2);
    });
  }

  // red warning circles of the fog monsters (drawn by Phaser graphics in 2D)
  syncRings(ps, time) {
    const ws = ps.warnings ?? [];
    while (this.rings.length < ws.length) {
      const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xe8443a, transparent: true, opacity: 0.4, depthWrite: false, depthTest: false }));
      m.renderOrder = 5; this.rings.push(m); this.scene.add(m);
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
      const m = new THREE.Mesh(this.flatGeo, new THREE.MeshBasicMaterial({ color: 0xc9a06a, transparent: true, opacity: 0.42, depthWrite: false }));
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
    let up = 0, flat = 0, label = 0, model = 0;
    for (const e of this.map.values()) { if (e.kind === 'up') up++; else if (e.kind === 'flat') flat++; else if (e.kind === 'model') model++; else label++; }
    return { attached: !!this.ps, shown: this.canvas.style.display !== 'none', up, flat, label, model, grass: this.grass?.count ?? 0,
      lights: this.points.filter((p) => p.visible).length, calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles, quality: QUALITY };
  }
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
