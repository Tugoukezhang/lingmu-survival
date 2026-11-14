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
import { buildIsland, WATER_LEVEL } from './kit/terrain.js';
import { buildWater } from './kit/water.js';
import { buildRoom } from './kit/room.js';
import { buildGrass } from './kit/grass.js';
import { makeKit } from './kit/flora.js';
import { makePost } from './kit/post.js';
import { makePetKit } from './kit/pets.js';
import { buildLife } from './kit/scenery.js';
import { bigLeafPlant, leafTexture, cloverGeometry, daisyGeometry } from './look/nature.js';
import { smallFlowerGeometry } from './look/nature.js';

const SKIP = new Set(['ground', 'sky', 'cloud', 'lightbrush', 'shadow']);   // sky and clouds are drawn here; real shadows replace the blobs
const FLAT = new Set(['furn_rug', 'bridge_rope', 'bridge_broken', 'bridge_fixed', 'soil', 'soil_wet']);   // lie on the ground
const SOFT = new Set(['fogmonster']);                                         // translucent edges: blend, no hard cut-out
const NO_SHADOW = new Set(['fogmonster', 'item_torch']);
const MODEL_SCALE = { tree: 1.28, tree_b: 1.22, tree_c: 1.15, bush: 1.1, grass_tuft: 1.2, rock: 1.25, rock_b: 1.2, crystal: 1.15 };   // 3D props a bit bigger than the sprites were
const CAM = { back: 392, up: 250, look: 46, fov: 42 };                        // camera offset behind / above the player
const ROOM_CAM = { back: 455, up: 335, look: 30 };                              // the cottage room: the whole room in view
const BATTLE = { fov: 36, h: 170, pitch: 0.3 };                                 // battle stage camera: height above the meadow, tilt down (radians)
const CENTERED = new Set(['bed']);                                              // sprites whose 2D position is their middle, not their feet
const PAD_TOP = 6;                                                               // rows of room north of the map for the hills behind the island
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

    this.sky = makeSky();
    this.scene.add(this.sky);

    this.post = makePost(r, this.scene, this.camera, { width: GAME_W, height: GAME_H, quality: QUALITY });
    this.kit = makeKit();
    this.pets = makePetKit();                 // 3D pets and people (loaded when first seen)
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
    const src = this.game.textures.get(key).getSourceImage();
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
    this.hemi.groundColor.set(ps.area === 'house' ? 0xa07850 : 0x86b24a);
    this.sky.visible = ps.area !== 'house';
    this.scene.background = ps.area === 'house' ? new THREE.Color(0x241812) : null;
    if (ps.area === 'house') {
      // the cottage room (scenes/play/house.js): floor = the walkable cells, one wall column left, two wall rows on top
      const fx = TILE, fy = 2 * TILE, fw = (ps.cols - 2) * TILE, fh = (ps.rows - 3) * TILE;
      this.room = buildRoom({ fx, fy, fw, fh, doorX: ps.doorSpot.x, boardX: ps.decorSpot.x, windowX: fx + fw - 120 });
      this.addStatic(this.room.group);
      this.target.set(fx + fw / 2, 0, fy + fh / 2);
      return;
    }
    const W = ps.cols * TILE, H = ps.rows * TILE;
    const seed = ps.cols * 131 + ps.rows * 17 + (ps.island?.seed ?? 0) % 9973;
    const groundCanvas = ps.textures.exists('ground') ? ps.textures.get('ground').getSourceImage() : null;
    this.hints = this.layoutHints(ps, seed);
    this.terrain = buildIsland({ walk: ps.walk, cols: ps.cols, rows: ps.rows, tile: TILE, groundCanvas, seed, water: ps.water, padTop: PAD_TOP, ...this.hints });
    this.addStatic(this.terrain.group);
    if (this.terrain.hasWater) { this.water = buildWater(this.terrain); this.addStatic(this.water.mesh); }
    this.addHillDressing(this.hints.ridges, seed);
    this.addDecor(seed);
    this.life = buildLife(QUALITY === 'low' ? 24 : 46); this.addStatic(this.life.points);
    this.addFarIslands(W, H, seed);

    // no grass on the field, under the fire, the tent, the buildings …
    const bare = new Set();
    for (const p of ps.plots ?? []) bare.add(`${Math.floor(p.cx / TILE)},${Math.floor(p.cy / TILE)}`);
    const avoid = (x, y) => bare.has(`${Math.floor(x / TILE)},${Math.floor(y / TILE)}`);
    this.grass = buildGrass(this.terrain, { step: QUALITY === 'low' ? 11 : 6, bladeH: 11, bladeW: 5, seed, avoid });
    this.addStatic(this.grass.group);
    this.flowerMat = this.addFlowers(seed, avoid);

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
    this.target.set(p.x, this.h(p.x, p.y), p.y);
  }

  // ground height under a spot of the 2D map (0 while no island is built)
  h(x, y) { return this.terrain ? this.terrain.heightAt(x, y) : 0; }

  // Where the ground must stay level (buildings, fields, camp) and where dirt paths run.
  layoutHints(ps, seed = 1) {
    const T = TILE, flats = [], paths = [];
    const mid = (t) => ({ x: (t.x + 0.5) * T, y: (t.y + 0.5) * T });
    const rect = (r, pad) => ({ x: (r.x + r.w / 2) * T, y: (r.y + r.h / 2) * T, w: r.w * T, h: r.h * T, pad });
    const curve = (a, b, bend = 0.1, width = 38) => {
      const mx = (a.x + b.x) / 2 - (b.y - a.y) * bend, my = (a.y + b.y) / 2 + (b.x - a.x) * bend, pts = [];
      for (let i = 0; i <= 14; i++) { const t = i / 14, u = 1 - t; pts.push({ x: u * u * a.x + 2 * u * t * mx + t * t * b.x, y: u * u * a.y + 2 * u * t * my + t * t * b.y }); }
      pts.width = width;
      return pts;
    };
    const patch = (x, y, width) => { const pts = [{ x: x - 6, y }, { x: x + 6, y }]; pts.width = width; return pts; };
    for (const o of ps.children.list) {   // every building stands on level ground
      const key = o.type === 'Image' ? o.texture?.key : null;
      if (key && (key.startsWith('bld_') || key === 'fountain')) flats.push({ x: o.x, y: o.y - 50, w: o.displayWidth * 0.9, h: 110, pad: 30 });
    }
    let relief = 26, terrace = 22;
    if (ps.area === 'home') {
      const s = mid(ps.spawnTile);
      flats.push({ x: s.x, y: s.y - T, pad: 150 }, rect(ps.farmRect, 44), rect(ps.expandRect, 44), { x: ps.dock.x, y: ps.dock.y, pad: 50 }, { x: ps.homeBridge.x, y: ps.homeBridge.y, pad: 40 });
      paths.push(patch(s.x, s.y - T * 0.9, 150));
      paths.push(curve(s, { x: ps.dock.x, y: ps.dock.y + 40 }, 0.06));
      paths.push(curve(s, { x: ps.homeBridge.x - 20, y: ps.homeBridge.y }, -0.07));
      if (ps.cottageSpot) paths.push(curve({ x: s.x - T * 0.6, y: s.y - T * 1.4 }, { x: ps.cottageSpot.x, y: ps.cottageSpot.y - 14 }, 0.12));
      paths.push(curve({ x: s.x + T * 0.8, y: s.y }, { x: ps.farmRect.x * T - 10, y: (ps.farmRect.y + 1.5) * T }, -0.12, 34));
    } else if (ps.area === 'town') {
      relief = 15; terrace = 0;
      const c = { x: ps.cols * T / 2, y: ps.rows * T / 2 };
      flats.push({ x: c.x, y: c.y, w: T * 9, h: T * 5.6, pad: 30 });
      for (const n of ps.npcs ?? []) {
        flats.push({ x: n.x, y: n.y, pad: 40 });
        const k = 1 / Math.max(Math.abs(n.x - c.x) / (T * 4.4), Math.abs(n.y - c.y) / (T * 2.8));
        paths.push(curve({ x: c.x + (n.x - c.x) * k, y: c.y + (n.y - c.y) * k }, { x: n.x, y: n.y + (n.y < c.y ? 34 : -34) }, 0.1, 44));
      }
      if (ps.townBridge) { flats.push({ x: ps.townBridge.x, y: ps.townBridge.y, pad: 40 }); paths.push(curve({ x: c.x + T * 4.2, y: c.y }, { x: ps.townBridge.x + 30, y: ps.townBridge.y }, 0.06, 44)); }
      if (ps.northBridge) { flats.push({ x: ps.northBridge.x, y: ps.northBridge.y, pad: 40 }, { x: ps.northBridge.x, y: ps.northBridge.y - 120, pad: 90 }); paths.push(curve({ x: c.x, y: c.y - T * 2.6 }, { x: ps.northBridge.x, y: ps.northBridge.y - 24 }, 0.08, 44)); }
    } else {
      relief = 30; terrace = 24;
      const l = ps.island.landing;
      flats.push({ ...mid({ x: l.tx, y: l.ty }), pad: 50 });
      if (ps.airship) flats.push({ x: ps.airship.sprite.x, y: ps.airship.sprite.y, pad: 110 });
      for (const c of ps.island.camps ?? []) flats.push({ ...mid({ x: c.tx, y: c.ty }), pad: 50 });
    }
    // rocky hills behind the island: along its north edge, wherever nothing is built or moored
    const ridges = [], rnd = rng(seed * 13 + 5), W = ps.cols * T, n = Math.round(W / 300);
    for (let i = 0; i < n; i++) {
      const x = W * (0.1 + 0.8 * (i + 0.5 + (rnd() - 0.5) * 0.5) / n), tx = Math.floor(x / T);
      let ty = 0; while (ty < ps.rows && !ps.walk[ty][tx]) ty++;
      const edge = ty * T, r = Math.min(150 + rnd() * 120, (edge + PAD_TOP * T) / 1.55), h = (0.55 + rnd() * 0.6) * r;
      if (ty >= ps.rows || r < 90) continue;
      if (flats.some((f) => Math.hypot(f.x - x, f.y - edge) < r * 0.8 + (f.pad ?? 30) + Math.max(f.w ?? 0, f.h ?? 0) / 2)) continue;
      ridges.push({ x, y: edge - r * 0.52, r, h });
    }
    return { flats, paths, relief, terrace, ridges };
  }

  // Scenery on the hills: big sandstone boulders, pines and shrubs (none of it on walkable ground).
  addHillDressing(ridges, seed) {
    const t = this.terrain, ps = this.ps, rnd = rng(seed * 7 + 3), g = new THREE.Group();
    for (const r of ridges) {
      for (let i = 0, n = Math.round(r.r / 9); i < n; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r.r * 0.86, x = r.x + Math.cos(a) * d, y = r.y + Math.sin(a) * d;
        if (t.maskAt(x, y) < 235 || ps.isOnIsland(x, y) || ps.isOnIsland(x, y + 30) || t.slopeAt(x, y) > 0.55) continue;      // only on the ledges
        const roll = rnd(), key = roll < 0.4 ? 'boulder' : roll < 0.68 ? 'tree_b' : roll < 0.8 ? 'tree' : roll < 0.92 ? 'tree_c' : 'rock';
        const m = this.kit.instantiate(key, Math.floor(rnd() * 1e6));
        m.position.set(x, t.heightAt(x, y) - (key === 'boulder' ? 5 : 0), y);
        m.scale.setScalar(key === 'boulder' ? 0.7 + rnd() * 1.1 : (MODEL_SCALE[key] ?? 1) * (0.8 + rnd() * 0.5));
        g.add(m);
      }
    }
    this.addStatic(g);
  }

  // Undergrowth: broad-leaved plants and daisies around the trees and rocks, clover in patches on the grass.
  // Decoration only — small enough to walk through, placed where nobody needs to stand.
  addDecor(seed) {
    const t = this.terrain, ps = this.ps, rnd = rng(seed * 5 + 1), low = QUALITY === 'low';
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const put = (list, x, y, s) => list.push(m4.compose(p.set(x, t.heightAt(x, y) - 0.5, y), q.setFromEuler(e.set(0, rnd() * 6.28, 0)), sc.setScalar(s)).clone());
    const leafy = [[], [], []], daisies = [[], []], clover = [];
    const ok = (x, y) => t.maskAt(x, y) > 235 && !t.isWater(x, y) && t.isGrass(x, y, 235);
    for (const o of ps.children.list) {
      const key = o.type === 'Image' ? o.texture?.key : null;
      if (!key || !(key.startsWith('tree') || key.startsWith('rock') || key === 'bush')) continue;
      for (let i = 0, n = 1 + Math.floor(rnd() * (low ? 1.3 : 2.4)); i < n; i++) {
        const a = rnd() * 6.28, d = 20 + rnd() * 20, x = o.x + Math.cos(a) * d, y = o.y - 6 + Math.sin(a) * d * 0.8;
        if (!ok(x, y)) continue;
        if (rnd() < 0.62) put(leafy[Math.floor(rnd() * 3)], x, y, 11 + rnd() * 9);
        else for (let k = 0; k < 3; k++) put(daisies[k % 2], x + (rnd() - 0.5) * 16, y + (rnd() - 0.5) * 12, 9 + rnd() * 6);
      }
    }
    for (let c = 0, n = Math.round(t.W * t.H / (low ? 90000 : 42000)); c < n; c++) {     // clover patches
      const cx = rnd() * t.W, cy = rnd() * t.H;
      if (!ok(cx, cy)) continue;
      for (let i = 0; i < 14; i++) { const x = cx + (rnd() - 0.5) * 46, y = cy + (rnd() - 0.5) * 36; if (ok(x, y)) put(clover, x, y, 50 + rnd() * 26); }
    }
    const g = new THREE.Group(), mats = [];
    const add = (geo, mat, list, cast) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = cast; mesh.receiveShadow = true; mesh.frustumCulled = false;
      g.add(mesh);
    };
    const leafMat = new THREE.MeshLambertMaterial({ map: leafTexture(), side: THREE.DoubleSide }), colMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mats.push(leafMat, colMat);
    const r2 = rng(seed + 77);
    leafy.forEach((list, i) => add(bigLeafPlant(r2, { size: 1.5 + i * 0.25, n: 6 + i }), leafMat, list, true));
    daisies.forEach((list) => add(daisyGeometry(r2, { h: 1.5 + r2() * 0.6 }), colMat, list, true));
    add(cloverGeometry(), colMat, clover, false);
    this.decorMats = mats;
    this.addStatic(g);
  }

  // Other floating islands far off in the sea of clouds (backdrop only).
  addFarIslands(W, H, seed) {
    const rnd = rng(seed * 3 + 11), g = new THREE.Group();
    const mat = this.farMat ??= new THREE.MeshLambertMaterial({ vertexColors: true });
    this.farIslands = [];
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.08 + 0.84 * (i + rnd() * 0.8) / 7), d = Math.max(W, H) * 0.62 + 420 + rnd() * 900, r = 110 + rnd() * 210;
      const isl = new THREE.Group();
      // rock underside (upside-down cone, knobbly) and a grassy cap
      const body = new THREE.ConeGeometry(r, r * (1.2 + rnd() * 0.8), 11, 4).rotateX(Math.PI);
      const bp = body.attributes.position, col = new Float32Array(bp.count * 3), c = new THREE.Color(), hgt = body.parameters.height;
      for (let k = 0; k < bp.count; k++) {
        const y = bp.getY(k), tt = 0.5 - y / hgt, j = 1 + (rnd() - 0.5) * 0.3;          // tt: 0 at the top rim … 1 at the tip
        bp.setXYZ(k, bp.getX(k) * j, y - hgt / 2, bp.getZ(k) * j);
        c.setHex(0x9a7654).lerp(new THREE.Color(0x5a5560), Math.min(1, tt * 1.3)); col.set([c.r, c.g, c.b], k * 3);
      }
      body.setAttribute('color', new THREE.BufferAttribute(col, 3)); body.computeVertexNormals();
      isl.add(new THREE.Mesh(body, mat));
      const cap = new THREE.CylinderGeometry(r * 1.02, r * 0.96, 16, 14).translate(0, 4, 0);
      const cp = cap.attributes.position, cc = new Float32Array(cp.count * 3);
      for (let k = 0; k < cp.count; k++) { c.setHex(cp.getY(k) > 4 ? 0x8fcf58 : 0x6fa544); cc.set([c.r, c.g, c.b], k * 3); }
      cap.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      isl.add(new THREE.Mesh(cap, mat));
      for (let k = 0, n = 2 + Math.floor(rnd() * 5); k < n; k++) {
        const key = ['tree', 'tree_b', 'tree_b', 'boulder', 'tree_c'][Math.floor(rnd() * 5)], m = this.kit.instantiate(key, Math.floor(rnd() * 1e6));
        const ta = rnd() * 6.28, td = Math.sqrt(rnd()) * r * 0.75;
        m.position.set(Math.cos(ta) * td, 11, Math.sin(ta) * td); m.scale.setScalar((0.9 + rnd() * 0.6) * (r / 150));
        m.traverse((o) => { o.castShadow = false; });
        isl.add(m);
      }
      isl.position.set(W / 2 + Math.cos(a) * d, -40 + rnd() * 240, H / 2 + Math.sin(a) * d * 0.9);
      isl.userData = { y: isl.position.y, ph: rnd() * 6.28 };
      this.farIslands.push(isl); g.add(isl);
    }
    this.addStatic(g);
  }

  // small white / pink / yellow flowers dotted over the meadow (decoration only)
  addFlowers(seed, avoid, t = this.terrain, add = (m) => this.addStatic(m)) {
    const rand = rng(seed + 31);
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
        mesh.setMatrixAt(n++, m4.compose(p.set(x, t.heightAt(x, y), y), q.setFromEuler(e.set(0, rand() * 6.28, 0)), s.setScalar(sc)));
      }
      mesh.count = n; mesh.frustumCulled = false; mesh.receiveShadow = true;
      add(mesh);
    }
    return mat;
  }

  addStatic(m) { this.statics.push(m); this.scene.add(m); }

  detach() {
    for (const e of this.map.values()) this.dropEntry(e);
    this.map.clear();
    for (const m of this.statics) this.scene.remove(m);
    for (const m of [...this.rings, ...this.plotHints, ...(this.clouds ?? []), ...(this.sea ? [this.sea] : [])]) { this.scene.remove(m); m.material.dispose?.(); }
    this.terrain?.dispose(); this.grass?.dispose(); this.flowerMat?.dispose(); this.water?.dispose(); this.room?.dispose(); this.life?.dispose();
    for (const m of this.decorMats ?? []) m.dispose();
    this.life = null; this.decorMats = null;
    this.terrain = this.grass = this.flowerMat = this.sea = this.water = this.room = null;
    this.statics = []; this.rings = []; this.plotHints = []; this.clouds = []; this.farIslands = [];
    for (const t of this.texCache.values()) t.dispose();
    this.texCache.clear();
    this.ps = null;
    this.canvas.style.display = 'none';
  }

  dropEntry(e) {
    this.scene.remove(e.mesh);
    if (e.kind === 'model' || e.kind === 'pet') return;   // geometry and materials belong to the kit
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
    // Draw at the size the picture really has on this screen (sharp), within a budget of pixels for weak devices.
    const dpr = Math.min(window.devicePixelRatio || 1, 2), cap = QUALITY === 'low' ? 1280 * 720 : 2560 * 1440;
    let rw = Math.max(320, c.clientWidth * dpr), rh = Math.max(180, c.clientHeight * dpr);
    const k = Math.min(1, Math.sqrt(cap / (rw * rh)));
    rw = Math.round(rw * k); rh = Math.round(rh * k);
    if (rw !== this.rw || rh !== this.rh) {
      this.rw = rw; this.rh = rh;
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(rw, rh, false);
      this.post.setSize(rw, rh);
    }
  }

  // ---------- every frame ----------
  update(ps, time, dt) {
    if (this.ps !== ps) this.attach(ps);
    ps.cameras.main.setAlpha(0);                  // hide the 2D world; the camera keeps running (fades, follow)
    this.canvas.style.display = 'block';
    this.post.setScene(this.scene, this.camera);  // (a battle shows its own stage; back to the world)
    this.layout();
    const fe = ps.cameras.main.fadeEffect;          // travel / sleep fades of the hidden 2D camera
    const fade = fe && (fe.isRunning || (fe.isComplete && fe.direction)) ? fe.alpha : 0;
    this.canvas.style.opacity = String(1 - fade);
    TIME.value = time / 1000;
    this.time = time / 1000; this.dt = dt;

    // camera follows the player
    const p = ps.player;
    const cam = this.room ? ROOM_CAM : CAM, r = this.room;
    // outdoors the camera follows the player; in the room it stays near the middle and only leans toward the player
    const goal = r ? new THREE.Vector3(r.fx + r.fw / 2 + (p.x - r.fx - r.fw / 2) * 0.22, 0, r.fy + r.fh / 2 + (p.y - r.fy - r.fh / 2) * 0.22) : new THREE.Vector3(p.x, this.h(p.x, p.y), p.y);
    if (this.target.distanceTo(goal) > 360) this.target.copy(goal);      // teleport / travel: jump, don't glide across the map
    else this.target.lerp(goal, Math.min(1, dt * 7));
    this.camera.position.set(this.target.x, this.target.y + cam.up, this.target.z + cam.back);
    this.camera.lookAt(this.target.x, this.target.y + cam.look, this.target.z);
    this.up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    this.camera.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);

    this.syncLight(ps, time);
    this.syncObjects(ps);
    this.syncLabels(ps);
    this.syncRings(ps, time);
    this.syncPlots(ps);
    for (const c of this.clouds) { c.position.x += c.drift * dt; c.quaternion.copy(this.camera.quaternion); }
    for (const f of this.farIslands ?? []) f.position.y = f.userData.y + Math.sin(time / 2600 + f.userData.ph) * 7;      // they bob slowly
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
      if (!e || e.key !== key || (e.kind === 'up' && this.pets.ready(key))) {      // (the 2D art stands in until the model has loaded)
        if (e) this.dropEntry(e);
        e = this.kit.has(key) ? this.makeModel(o, key) : this.makePet(o, key) ?? this.makeEntry(o, key, type);
        this.map.set(o, e);
      }
      const m = e.mesh, dw = o.displayWidth, dh = o.displayHeight;
      m.visible = o.visible && o.alpha > (e.kind === 'model' || e.kind === 'pet' ? 0.35 : 0.01);
      if (!m.visible) continue;
      if (e.kind === 'pet') {
        // a 3D pet: stands where the sprite is, as tall as the sprite; walks when the sprite moves, looks where it goes
        const gy = Math.max(this.h(o.x, o.y), this.terrain?.isWater(o.x, o.y) ? WATER_LEVEL - 7 : -1e9);
        const vx = o.x - (e.lx ?? o.x), vy = o.y - (e.ly ?? o.y), sp = Math.hypot(vx, vy) / Math.max(this.dt, 1e-3);
        e.lx = o.x; e.ly = o.y;
        if (sp > 12) e.face = Math.atan2(vx, vy);                       // toward where it walks
        else if (e.face == null || Math.abs(Math.sin(e.face)) < 0.2 || Math.cos(e.face) < 0.3) e.face = (o.flipX ? 1 : -1) * 0.55;   // standing: turned a little, toward the camera
        m.position.set(o.x, gy, o.y);
        m.scale.setScalar(o.height * Math.sqrt(Math.abs(o.scaleX * o.scaleY)) * 0.9 * m.userData.size);      // (size without the squash of the 2D tweens)
        // the 2D scene squashes the sprite when working, turns it when fainting, blinks it when hurt: read that and act it out
        this.pets.animate(m, this.time, this.dt, { moving: Math.min(1, sp / 60), face: e.face, squash: Math.abs(o.scaleY / (o.scaleX || 1)), roll: -o.rotation, hurt: o === pl && o.alpha < 0.9 });
        e.foot = { x: o.x, y: o.y, w: dw, h: dh };
        continue;
      }
      if (e.kind === 'model') {
        // a real 3D prop from the kit, standing where the sprite is
        const ud = m.userData, dz = ud.foot ? -4 - (o.flipX ? ud.foot : 1) * TILE / 2 : ud.dz ?? 0;     // furniture and crops are centred on their cells
        m.position.set(o.x, this.h(o.x, o.y + dz), o.y + dz);
        m.scale.setScalar(ud.scale1 ? 1 : (dh / ud.height) * (MODEL_SCALE[key] ?? 1));
        if (ud.foot) m.rotation.y = o.flipX ? Math.PI / 2 : 0;
        if (ud.spin) m.rotation.y = -o.rotation;                                        // bridges lie the way the 2D picture is turned
        if (ud.hover) m.position.y += ud.hover + Math.sin(this.time * 1.4 + o.x * 0.01) * 5;   // the airship floats
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
        const fx = o.x + (0.5 - o.originX) * dw, fz = o.y + (0.5 - o.originY) * dh;
        m.position.set(fx, this.h(fx, fz) + 0.8, fz);
        m.scale.set(o.flipX ? -dw : dw, 1, dh);
        m.rotation.y = -o.rotation;
      } else {
        // feet on the ground at the object's position; a moving origin (pets bobbing) lifts it
        const below = (1 - o.originY) * dh;
        if (e.below0 == null || below > e.below0) e.below0 = below;
        m.position.set(o.x + (0.5 - o.originX) * dw, Math.max(this.h(o.x, o.y), this.terrain?.isWater(o.x, o.y) ? WATER_LEVEL - 7 : -1e9), o.y + (CENTERED.has(key) ? dh * 0.42 : 0)).addScaledVector(this.up, e.below0 - below);
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
    return { mesh, key, kind: 'model', tall: key.startsWith('tree') || key.startsWith('bld_') || key === 'tent' };
  }

  makePet(o, key) {
    const mesh = this.pets.has(key) ? this.pets.instance(key) : null;
    if (!mesh) return null;
    this.scene.add(mesh);
    return { mesh, key, kind: 'pet' };
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
    for (const e of this.map.values()) if ((e.kind === 'up' || e.kind === 'model' || e.kind === 'pet') && e.foot && e.mesh.visible) feet.push(e.foot);
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
      if (this.room && ly < this.room.fy) m.position.set(lx, this.room.wallY, this.room.wallZ);      // signs on the back wall
      else if (best) m.position.set(lx, this.h(best.x, best.y), best.y).addScaledVector(this.up, Math.max(8, best.y - ly));
      else m.position.set(lx, this.h(lx, ly), ly).addScaledVector(this.up, 26);
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
    this.sea?.material.color.set(0xeef8fc).lerp(new THREE.Color(0x3a4668), Math.min(1, dark * 1.4));
    for (const c of this.clouds) c.material.color.copy(this.sea.material.color);
    this.water?.setLight(new THREE.Color(0xffffff).lerp(night, Math.min(1, dark * 1.5)).multiplyScalar(1 - dark * 0.55));
    this.post.look.uniforms.uNight.value = nightK;
    this.kit.setNight(nightK);
    this.pets.setDay(1 - nightK * 0.7);
    this.life?.set(this.target, nightK, (this.rh ?? 540) / 540);
    this.post.bloom.strength = 0.2 + nightK * 0.35;
    // ambient for the unlit sprites
    this.ambient.set(0xffffff).lerp(night, Math.min(1, dark * 1.5)).multiplyScalar(1 - dark * 0.5);

    if (this.room) {
      // indoors: warm and never really dark; daylight comes in through the window
      const d = Math.max(0, 1 - dark * 1.8);
      this.hemi.color.set(0xfff0dc); this.hemi.intensity = 1.0 + 0.45 * d;
      this.sun.intensity = 1.7 * d;
      this.scene.fog.near = 5000; this.scene.fog.far = 9000;
      this.ambient.set(0xfff4e6).multiplyScalar(0.82 + 0.18 * d);
      this.room.setDay(d);
      this.post.look.uniforms.uNight.value = 0;
    }
    const ls = dark > 0.02 ? N.lights(ps.state, ps.player, ps.fires).slice().sort((a, b) => dist2(a, ps.player) - dist2(b, ps.player)).slice(0, MAX_LIGHTS) : [];
    const power = Math.min(1, dark * 2.4);
    this.lightList = ls.map((l) => ({ x: l.x, y: l.y, r: l.r, power: power * 0.75 }));
    this.points.forEach((pl, i) => {
      const l = ls[i];
      pl.visible = !!l;
      if (!l) { pl.intensity = 0; return; }
      pl.position.set(l.x, this.h(l.x, l.y) + 70, l.y);
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
      m.position.set(w.x, this.h(w.x, w.y) + 1.6, w.y);
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
      if (m.visible) m.position.set(pl.cx, this.h(pl.cx, pl.cy) + 0.5, pl.cy);
    });
  }

  // ---------- battle stage ----------
  // The ground point seen at a screen position (px of the 960×540 layout) by a camera.
  stagePoint(camera, sx, sy, planeY = 0) {
    const v = new THREE.Vector3((sx / GAME_W) * 2 - 1, -(sy / GAME_H) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
    return camera.position.clone().addScaledVector(v, (planeY - camera.position.y) / v.y);
  }

  // A small round meadow with a forest behind it; built once, used for every battle.
  buildArena() {
    const R = 17, n = R * 2 + 2, walk = [];
    for (let y = 0; y < n; y++) { const row = []; for (let x = 0; x < n; x++) row.push(Math.hypot(x + 0.5 - n / 2, (y + 0.5 - n / 2) * 1.08) < R); walk.push(row); }
    const size = n * TILE, ox = -size / 2, oz = -560 - size / 2;         // island (x, y) → stage (x + ox, 0, y + oz)
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xcdeaf5, 900, 2600);
    const hemi = new THREE.HemisphereLight(0xe6f4ff, 0x86b24a, 1.5), sun = new THREE.DirectionalLight(0xffe9c4, 3.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(QUALITY === 'low' ? 1024 : 2048, QUALITY === 'low' ? 1024 : 2048);
    const sc = sun.shadow.camera; sc.left = -760; sc.right = 760; sc.top = 760; sc.bottom = -760; sc.near = 10; sc.far = 2600;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 1.2; sun.shadow.radius = 3;
    sun.position.set(-460, 760, -560 + 320); sun.target.position.set(0, 0, -560);
    const camera = new THREE.PerspectiveCamera(BATTLE.fov, GAME_W / GAME_H, 10, 7000);
    camera.position.set(0, BATTLE.h, 0); camera.rotation.set(-BATTLE.pitch, 0, 0); camera.updateMatrixWorld();
    const sky = makeSky(); sky.position.copy(camera.position);
    scene.add(hemi, sun, sun.target, sky);
    // where the two pets stand: the 2D layout of BattleScene (SPOT), seen through this camera
    const spots = { me: this.stagePoint(camera, 250, 372), foe: this.stagePoint(camera, 700, 236) };
    const terrain = buildIsland({ walk, cols: n, rows: n, tile: TILE, groundCanvas: null, seed: 4242, relief: 16,
      flats: [{ x: spots.me.x - ox, y: spots.me.z - oz, pad: 80 }, { x: spots.foe.x - ox, y: spots.foe.z - oz, pad: 100 }] });
    const holder = new THREE.Group(); holder.position.set(ox, 0, oz);
    const grass = buildGrass(terrain, { step: QUALITY === 'low' ? 11 : 6.5, bladeH: 11, bladeW: 5, seed: 99 });
    holder.add(terrain.group, grass.group);
    this.addFlowers(505, () => false, terrain, (m) => holder.add(m));
    // forest behind and at the sides; the fighting ground and the view from the camera stay open
    const rand = rng(777), keys = ['tree', 'tree', 'tree', 'tree_b', 'tree_b', 'tree_c', 'bush', 'rock', 'rock_b', 'grass_tuft', 'grass_tuft'];
    for (let i = 0; i < 150; i++) {
      const x = rand() * size, y = rand() * size, sx = x + ox, sz = y + oz, key = keys[Math.floor(rand() * keys.length)];
      if (terrain.maskAt(x, y) < 235) continue;
      const big = key.startsWith('tree');
      if (sz > (big ? -330 : -260) || (Math.abs(sx) < (big ? 300 : 210) - sz * 0.3 && sz > -840)) continue;
      const m = this.kit.instantiate(key, Math.floor(rand() * 1e6));
      m.position.set(x, terrain.heightAt(x, y), y);
      m.scale.setScalar((MODEL_SCALE[key] ?? 1) * (0.9 + rand() * 0.35));
      holder.add(m);
    }
    scene.add(holder);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xeef8fc, depthWrite: false }));
    sea.position.set(0, -460, -560); sea.renderOrder = -3; scene.add(sea);
    const clouds = [];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(this.upGeo, new THREE.MeshBasicMaterial({ map: this.tex('cloud'), transparent: true, depthWrite: false, opacity: 0.92 }));
      const s = 320 + rand() * 520;
      m.position.set((rand() - 0.5) * 3600, -150 - rand() * 220, -1500 - rand() * 1500);
      m.scale.set(s, s * 0.42, 1); m.renderOrder = -2; m.drift = 4 + rand() * 8;
      m.quaternion.copy(camera.quaternion);
      clouds.push(m); scene.add(m);
    }
    const sprite = (side) => {
      const mesh = new THREE.Mesh(this.upGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, alphaTest: 0.4, transparent: true }));
      mesh.castShadow = true; mesh.visible = false; scene.add(mesh);
      return { mesh, key: null, groundY: terrain.heightAt(spots[side].x - ox, spots[side].z - oz) };
    };
    this.arena = { scene, camera, hemi, sun, sky, sea, clouds, terrain, sprites: { me: sprite('me'), foe: sprite('foe') } };
  }

  // Called by BattleScene every frame: draws the stage and puts the two pets on it,
  // exactly where (and as big as) the 2D layout has them — so cards, numbers and buttons still line up.
  updateBattle(bs, time, dt) {
    if (!this.arena) this.buildArena();
    const A = this.arena, cam = A.camera;
    this.layout();
    this.canvas.style.display = 'block'; this.canvas.style.opacity = '1';
    TIME.value = time / 1000;
    // the light of the hour, but never too dark to see the pets
    const t = tintAt(this.game.session.state.clock), dark = t.dark ?? 0, nightK = Math.min(1, dark * 1.5), night = new THREE.Color(t.color ?? 0x24305a);
    A.hemi.intensity = 1.5 * Math.max(0.5, 1 - dark * 1.3);
    A.hemi.color.set(0xe6f4ff).lerp(night, Math.min(0.7, dark));
    A.sun.intensity = 3.3 * Math.max(0.12, 1 - dark * 2);
    A.sky.material.color.set(0xffffff).lerp(new THREE.Color(0x232e58), nightK);
    A.scene.fog.color.set(0xcdeaf5).lerp(new THREE.Color(0x1b2440), nightK);
    A.sea.material.color.set(0xeef8fc).lerp(new THREE.Color(0x3a4668), Math.min(1, dark * 1.4));
    for (const c of A.clouds) { c.material.color.copy(A.sea.material.color); c.position.x += c.drift * dt; }
    this.post.look.uniforms.uNight.value = nightK * 0.6;
    this.post.bloom.strength = 0.2 + nightK * 0.25;
    this.kit.setNight(nightK);
    const amb = new THREE.Color(0xffffff).lerp(night, Math.min(0.6, dark)).multiplyScalar(1 - dark * 0.3), tc = new THREE.Color();
    const focal = (GAME_H / 2) / Math.tan(THREE.MathUtils.degToRad(BATTLE.fov / 2));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), upv = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    for (const side of ['me', 'foe']) {
      const { img, shadow } = bs.sprites[side], e = A.sprites[side], m = e.mesh;
      img.visible = false; shadow.visible = false;          // the 2D picture stays hidden; its position, size, flash and fade are copied
      const key = img.texture.key;
      if (e.key !== key) {
        m.material.map = this.tex(key); m.material.needsUpdate = true; e.key = key;
        if (e.pet) { A.scene.remove(e.pet); e.pet = null; }
      }
      if (!e.pet && this.pets.has(key) && this.pets.ready(key)) { e.pet = this.pets.instance(key); A.scene.add(e.pet); }
      const g = this.stagePoint(cam, img.x, img.y, e.groundY);
      const upp = g.clone().sub(cam.position).dot(fwd) / focal;          // world units per screen pixel at that depth
      const dw = img.displayWidth * upp, dh = img.displayHeight * upp;
      if (e.pet) {
        // 3D pet on the stage: mine looks up the field at the wild one, the wild one looks back; blinking when hit, gone when it faints
        m.visible = false;
        const spot = side === 'me' ? { x: 250, y: 372 } : { x: 700, y: 236 };       // where it stands (BattleScene SPOT)
        const down = img.y - spot.y > 3;                                                // the 2D picture sinks when it faints …
        const hit = img.alpha < 0.95 && !down;                                          // … and blinks when it is hit
        e.pet.visible = key !== '__DEFAULT' && img.alpha > 0.08;
        e.pet.position.copy(g);
        e.pet.scale.setScalar(img.height * Math.sqrt(Math.abs(img.scaleX * img.scaleY)) * upp * 0.9 * e.pet.userData.size);
        this.pets.animate(e.pet, time / 1000, dt, { face: side === 'me' ? 2.2 : -0.75, hurt: hit, roll: down ? (side === 'me' ? -1.35 : 1.35) : 0, lunge: Math.max(-1, Math.min(1, (img.x - spot.x) / 26)) });
        continue;
      }
      m.visible = img.alpha > 0.01 && key !== '__DEFAULT';
      if (!m.visible) continue;
      m.position.copy(g).addScaledVector(upv, -(1 - img.originY) * dh);
      m.scale.set(img.flipX ? -dw : dw, dh, 1);
      m.quaternion.copy(cam.quaternion);
      m.material.opacity = img.alpha;
      m.material.color.copy(amb);
      if (img.isTinted) m.material.color.multiply(tc.setHex(img.tintTopLeft));
    }
    this.post.setScene(A.scene, cam);
    this.post.render(dt);
  }

  debug() {
    let up = 0, flat = 0, label = 0, model = 0;
    let pet = 0;
    for (const e of this.map.values()) { if (e.kind === 'up') up++; else if (e.kind === 'flat') flat++; else if (e.kind === 'model') model++; else if (e.kind === 'pet') pet++; else label++; }
    return { attached: !!this.ps, shown: this.canvas.style.display !== 'none', room: !!this.room, arena: !!this.arena, water: !!this.water, up, flat, label, model, pet, grass: this.grass?.count ?? 0,
      lights: this.points.filter((p) => p.visible).length, calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles, quality: QUALITY };
  }
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// sky dome: deeper blue overhead, pale at the horizon
function makeSky() {
  const skyGeo = new THREE.SphereGeometry(5200, 24, 12);
  const sp = skyGeo.attributes.position, scol = new Float32Array(sp.count * 3), ca = new THREE.Color(0x58aee6), cb = new THREE.Color(0xd4f0fa), cc = new THREE.Color();
  for (let i = 0; i < sp.count; i++) { const t = Math.max(0, Math.min(1, sp.getY(i) / 5200 * 1.6 + 0.15)); cc.copy(cb).lerp(ca, t); scol.set([cc.r, cc.g, cc.b], i * 3); }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  return sky;
}
