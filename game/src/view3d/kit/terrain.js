// Island terrain for the 3D map (docs/14): the top surface (the game's own
// ground painting as colour, cut to the island outline, lifted into gentle
// hills), the cliff ring that drops into the clouds, pond basins, dirt paths,
// and helpers to ask "how high / what colour / is this grass" at any spot.
// The walking grid of the game stays flat: height is only how the map is drawn.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE_GLSL, hex, rng } from './shared.js';

const MASK_SCALE = 4;       // mask / colour lookup: 1 pixel = 4 world units
const G = 12;               // height grid: one node every 12 world units
export const WATER_LEVEL = -4;
const POND_BED = -16;
export const SUN_DIR = new THREE.Vector3(-460, 760, 320).normalize();   // where the sun stands (World3D uses the same)

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// smooth value noise on the JS side (hills)
function noise2(seed) {
  const h = (x, y) => { let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
  };
}

// box blur of a w×h float field (canvas "filter: blur" is missing on some phones)
function blur(src, w, h, r, passes = 2) {
  const a = Float32Array.from(src), b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { b[y * w + x] = sum / (2 * r + 1); sum += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = sum / (2 * r + 1); sum += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]; }
    }
  }
  return a;
}
function bilinear(arr, w, h, fx, fy) {
  const x = Math.min(w - 1.001, Math.max(0, fx)), y = Math.min(h - 1.001, Math.max(0, fy));
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, i = yi * w + xi;
  return (arr[i] * (1 - u) + arr[i + 1] * u) * (1 - v) + (arr[i + w] * (1 - u) + arr[i + w + 1] * u) * v;
}

// A dirt path along the points: olive rim, warm sand body, lighter and darker patches, pebbles.
function paintPath(g, pts, width, rand) {
  const steps = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 7));
    for (let k = 0; k < n; k++) steps.push([a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n, 0.86 + rand() * 0.3, (rand() - 0.5) * 7, (rand() - 0.5) * 7]);
  }
  const layer = (color, k) => { g.fillStyle = color; g.beginPath(); for (const [x, y, s, jx, jy] of steps) { g.moveTo(x + jx + width * k * s, y + jy); g.arc(x + jx, y + jy, width * k * s, 0, Math.PI * 2); } g.fill(); };
  layer('rgba(150,136,84,0.6)', 0.66);
  layer('#d7a96e', 0.5);
  for (const [x, y, s] of steps) {
    if (rand() < 0.3) { g.fillStyle = rand() < 0.55 ? 'rgba(240,206,150,0.5)' : 'rgba(176,128,80,0.35)'; g.beginPath(); g.ellipse(x + (rand() - 0.5) * width * 0.5, y + (rand() - 0.5) * width * 0.4, width * 0.2 * s, width * 0.13 * s, rand() * 3, 0, Math.PI * 2); g.fill(); }
    if (rand() < 0.14) { g.fillStyle = rand() < 0.5 ? '#efe2c6' : '#b99c7c'; g.beginPath(); g.ellipse(x + (rand() - 0.5) * width * 0.8, y + (rand() - 0.5) * width * 0.6, 2 + rand() * 2.5, 1.6 + rand() * 1.6, rand() * 3, 0, Math.PI * 2); g.fill(); }
  }
}

// walk, water: rows × cols booleans. flats: [{ x, y, w?, h?, pad? }] (px) stay level (buildings, fields).
// paths: [[{x, y}, …], …] dirt paths painted on the ground.
// terrace: height of one step (0 = smooth hills): the hills become flat levels with short earth banks between them.
// ridges: [{ x, y, r, h }] rocky hills outside the walkable ground (behind the island); padTop: extra rows
// of room for them on the north side. Positions given to and returned by this module stay in map coordinates.
export function buildIsland({ walk, cols, rows, tile, groundCanvas, seed = 1, water = null, flats = [], paths = [], relief = 26, terrace = 0, ridges = [], padTop = 0 }) {
  const off = padTop * tile;                         // inside, everything is shifted down by the padding
  if (padTop) {
    const empty = () => new Array(cols).fill(false);
    walk = [...Array.from({ length: padTop }, empty), ...walk];
    if (water) water = [...Array.from({ length: padTop }, empty), ...water];
    rows += padTop;
    flats = flats.map((f) => ({ ...f, y: f.y + off }));
    paths = paths.map((p) => { const q = p.map((pt) => ({ x: pt.x, y: pt.y + off })); q.width = p.width; return q; });
    ridges = ridges.map((r) => ({ ...r, y: r.y + off }));
  }
  const W = cols * tile, H = rows * tile;
  const group = new THREE.Group();
  group.position.z = -off;

  // ---- outline mask: the same rounded blobs the 2D ground uses ----
  const mw = Math.ceil(W / MASK_SCALE), mh = Math.ceil(H / MASK_SCALE);
  const jit = (x, y, n) => { const v = Math.sin(x * 127.1 + y * 311.7 + n * 74.7 + seed) * 43758.5453; return v - Math.floor(v); };   // per-tile wobble (ponds)
  const blobs = (grid, k, wobble = 0, discs = []) => {
    const c = document.createElement('canvas'); c.width = mw; c.height = mh;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, mw, mh);
    g.fillStyle = '#fff';
    const r = (tile * k) / MASK_SCALE;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (grid[y][x]) { g.beginPath(); g.arc((x + 0.5 + (jit(x, y, 1) - 0.5) * wobble) * tile / MASK_SCALE, (y + 0.5 + (jit(x, y, 2) - 0.5) * wobble) * tile / MASK_SCALE, r * (1 - wobble * 0.5 * jit(x, y, 3)), 0, Math.PI * 2); g.fill(); }
    for (const c of discs) { g.beginPath(); g.arc(c.x / MASK_SCALE, c.y / MASK_SCALE, c.r / MASK_SCALE, 0, Math.PI * 2); g.fill(); }
    const d = g.getImageData(0, 0, mw, mh).data, out = new Float32Array(mw * mh);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
    return out;
  };
  const walkHard = blobs(walk, 0.74);
  const hard = ridges.length ? blobs(walk, 0.74, 0, ridges.map((r) => ({ x: r.x, y: r.y, r: r.r * 0.9 }))) : walkHard;      // the hills belong to the island's outline
  const walkSoft = blur(walkHard, mw, mh, 6, 2);       // 1 well inside the walkable ground, 0 outside
  const mask = blur(hard, mw, mh, 1, 1);                // soft 1-pixel edge for the cut-out
  const soft = blur(hard, mw, mh, 5, 2);                // wide falloff: how far inside the island
  const maskAt = (x, y) => { const px = Math.floor(x / MASK_SCALE), py = Math.floor(y / MASK_SCALE); return px < 0 || py < 0 || px >= mw || py >= mh ? 0 : mask[py * mw + px] * 255; };
  const hasWater = !!water && water.some((r) => r.some(Boolean));
  const wHard = hasWater ? blobs(water, 0.9, 0.5) : null;
  const wSoft = hasWater ? blur(wHard, mw, mh, 4, 2) : null;       // pond basin
  const wFar = hasWater ? blur(wHard, mw, mh, 14, 2) : null;       // land sinks toward the pond

  // ---- height: rolling hills, level where things are built, round rim, pond basins ----
  const n1 = noise2(seed + 1), n2 = noise2(seed + 2);
  const rolling = (x, y) => (n1(x / 380, y / 380) - 0.5) * 2 * relief + (n2(x / 130, y / 130) - 0.5) * 2 * relief * 0.22;
  // terraces: flat levels, one step apart, joined by short steep banks
  const hill = terrace ? (x, y) => { const v = rolling(x, y) / terrace + 0.5, f = v - Math.floor(v); return (Math.floor(v) - 0.5 + smooth(0.36, 0.64, f)) * terrace; } : rolling;
  const flat = flats.map((f) => ({ cx: f.x, cy: f.y, hw: (f.w ?? 0) / 2, hh: (f.h ?? 0) / 2, pad: f.pad ?? 30, h: terrace ? hill(f.x, f.y) : hill(f.x, f.y) * 0.5 }));
  // rocky hills: a rounded cone per ridge, broken into ledges, bumpy
  const n3 = noise2(seed + 3), LEDGE = 34;
  const ridgeAt = (x, y) => {
    let b = 0;
    for (const r of ridges) { const d = Math.hypot(x - r.x, y - r.y) / r.r; if (d < 1) b = Math.max(b, r.h * Math.pow(1 - d, 1.1) * (0.7 + 0.55 * n3(x / 52, y / 52))); }
    if (b <= 0) return 0;
    const v = b / LEDGE, q = (Math.floor(v) + smooth(0.28, 0.72, v - Math.floor(v))) * LEDGE;
    return mix(b, q, 0.75);
  };
  const hw = Math.round(W / G) + 1, hh = Math.round(H / G) + 1;
  const hgt = new Float32Array(hw * hh);
  for (let j = 0; j < hh; j++) for (let i = 0; i < hw; i++) {
    const x = i * G, y = j * G;
    let h = hill(x, y);
    for (const f of flat) {
      const d = Math.hypot(Math.max(Math.abs(x - f.cx) - f.hw, 0), Math.max(Math.abs(y - f.cy) - f.hh, 0));
      if (d < f.pad + 110) h = mix(h, f.h, 1 - smooth(f.pad, f.pad + 110, d));
    }
    const mx = x / MASK_SCALE - 0.5, my = y / MASK_SCALE - 0.5;
    h -= (1 - smooth(0.5, 0.97, bilinear(soft, mw, mh, mx, my))) * 11;          // the rim rounds off
    if (hasWater) {
      h = mix(h, 0, smooth(0.02, 0.5, bilinear(wFar, mw, mh, mx, my)));
      h = mix(h, POND_BED, smooth(0.3, 0.85, bilinear(wSoft, mw, mh, mx, my)));
    }
    if (ridges.length) h += ridgeAt(x, y) * (1 - smooth(0.2, 0.7, bilinear(walkSoft, mw, mh, mx, my)));   // never under the player's feet
    hgt[j * hw + i] = h;
  }
  const heightAt = (x, y) => bilinear(hgt, hw, hh, x / G, y / G);
  // how much sun a slope gets compared with flat ground (baked into the grass colour)
  const nrm = new THREE.Vector3();
  const shadeAt = (x, y) => {
    nrm.set(heightAt(x - 8, y) - heightAt(x + 8, y), 16, heightAt(x, y - 8) - heightAt(x, y + 8)).normalize();
    return Math.min(1.3, Math.max(0.5, 1 + 2.2 * (nrm.dot(SUN_DIR) - SUN_DIR.y) / SUN_DIR.y));
  };

  // ---- colour: the 2D ground painting (grass texture, plaza, meadow) + paths + pond beds ----
  const ac = document.createElement('canvas'); ac.width = W; ac.height = H;
  const ag = ac.getContext('2d');
  ag.fillStyle = '#7fb85a'; ag.fillRect(0, 0, W, H);
  if (groundCanvas) ag.drawImage(groundCanvas, 0, off);
  // big soft light / dark patches so the meadow is not one flat tone
  const rand = rng(seed * 977 + 5);
  for (let i = 0, n = Math.round(W * H / 52000); i < n; i++) {      // as many per area on a small map as on a big one
    const x = rand() * W, y = rand() * H, rr = 120 + rand() * 260, light = rand() < 0.5;
    const g = ag.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, light ? 'rgba(236,246,150,0.2)' : 'rgba(24,88,50,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ag.fillStyle = g; ag.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // steep ground shows earth (the banks between terraces) or layered rock (the hills) instead of grass
  if (terrace || ridges.length) {
    const ec = document.createElement('canvas'); ec.width = mw; ec.height = mh;
    const eg = ec.getContext('2d'), img = eg.createImageData(mw, mh), d = img.data;
    const soilA = hex(0xc49a62), soilB = hex(0x9a6e44), rockA = hex(0xd2b488), rockB = hex(0xa98a6a), c = new THREE.Color();
    for (let py = 0; py < mh; py++) for (let px = 0; px < mw; px++) {
      const x = (px + 0.5) * MASK_SCALE, y = (py + 0.5) * MASK_SCALE;
      const h0 = heightAt(x, y), slope = Math.hypot(heightAt(x + 6, y) - heightAt(x - 6, y), heightAt(x, y + 6) - heightAt(x, y - 6)) / 12;
      const a = smooth(0.34, 0.62, slope);
      if (a <= 0) continue;
      const onRidge = ridges.length && bilinear(walkSoft, mw, mh, px, py) < 0.3;
      if (onRidge) c.copy(rockA).lerp(rockB, 0.5 + 0.5 * Math.sin(h0 * 0.19 + n3(x / 90, y / 90) * 5));        // strata
      else c.copy(soilA).lerp(soilB, n3(x / 30, y / 30));
      const i = (py * mw + px) * 4;
      c.convertLinearToSRGB();
      d[i] = c.r * 255; d[i + 1] = c.g * 255; d[i + 2] = c.b * 255; d[i + 3] = a * 255;
    }
    eg.putImageData(img, 0, 0);
    ag.imageSmoothingEnabled = true;
    ag.drawImage(ec, 0, 0, W, H);
  }
  for (const p of paths) paintPath(ag, p, p.width ?? 40, rand);
  if (hasWater) {
    // pond bed under the (see-through) water: wet sand at the shore, teal in the middle
    const r = tile * 0.74;
    const cells = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (water[y][x]) cells.push([(x + 0.5 + (jit(x, y, 1) - 0.5) * 0.5) * tile, (y + 0.5 + (jit(x, y, 2) - 0.5) * 0.5) * tile, 1 - 0.25 * jit(x, y, 3)]);
    for (const [color, k] of [['#9cab6a', 1.0], ['#c9b780', 0.93], ['#8fc0a4', 0.8], ['#4f9c9c', 0.64], ['#35808e', 0.44]]) {
      ag.fillStyle = color; ag.beginPath();
      for (const [x, y, j] of cells) { ag.moveTo(x + r * k * j * 1.2, y); ag.arc(x, y, r * k * j * 1.2, 0, Math.PI * 2); }
      ag.fill();
    }
    for (const [x, y] of cells) for (let i = 0; i < 3; i++) { ag.fillStyle = rand() < 0.5 ? 'rgba(230,222,190,0.55)' : 'rgba(40,96,104,0.5)'; ag.beginPath(); ag.ellipse(x + (rand() - 0.5) * tile, y + (rand() - 0.5) * tile, 3 + rand() * 4, 2 + rand() * 3, rand() * 3, 0, Math.PI * 2); ag.fill(); }
  }
  const sc = document.createElement('canvas'); sc.width = mw; sc.height = mh;
  const sg = sc.getContext('2d'); sg.drawImage(ac, 0, 0, mw, mh);
  const small = sg.getImageData(0, 0, mw, mh).data;
  const tmp = new THREE.Color();
  const colorAt = (x, y, out = tmp) => {
    const px = Math.min(mw - 1, Math.max(0, Math.floor(x / MASK_SCALE))), py = Math.min(mh - 1, Math.max(0, Math.floor(y / MASK_SCALE))), i = (py * mw + px) * 4;
    return out.setRGB(small[i] / 255, small[i + 1] / 255, small[i + 2] / 255, THREE.SRGBColorSpace);
  };
  // grass = inside the island (with a margin) and clearly green in the painting
  const isGrass = (x, y, margin = 200) => {
    if (maskAt(x, y) < margin) return false;
    const px = Math.floor(x / MASK_SCALE), py = Math.floor(y / MASK_SCALE), i = (py * mw + px) * 4;
    const R = small[i], G2 = small[i + 1], B = small[i + 2];
    return G2 > R * 1.08 && G2 > B * 1.25 && G2 > 90;
  };
  const isWater = (x, y) => hasWater && bilinear(wSoft, mw, mh, x / MASK_SCALE - 0.5, y / MASK_SCALE - 0.5) > 0.45;

  // ---- top surface ----
  const map = new THREE.CanvasTexture(ac); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const md = new Uint8Array(mw * mh * 4);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const v = Math.round(mask[y * mw + x] * 255), i = ((mh - 1 - y) * mw + x) * 4; md[i] = md[i + 1] = md[i + 2] = v; md[i + 3] = 255; }   // rows bottom-up, like the uv of the plane
  const alphaMap = new THREE.DataTexture(md, mw, mh, THREE.RGBAFormat);
  alphaMap.magFilter = alphaMap.minFilter = THREE.LinearFilter; alphaMap.needsUpdate = true;
  const tg = new THREE.PlaneGeometry(W, H, hw - 1, hh - 1).rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, heightAt(tp.getX(i) + W / 2, tp.getZ(i) + H / 2));
  tg.computeVertexNormals();
  const topMat = new THREE.MeshStandardMaterial({ map, alphaMap, alphaTest: 0.5, roughness: 1, metalness: 0 });
  topMat.onBeforeCompile = (shader) => {
    // fine grain so bare ground (paths, pond shore) is not a blurry stretch of the painting
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vKPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvKPos = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vKPos;${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float kg = kNoise(vec3(vKPos.xz * 0.42, 1.0)) * 0.55 + kNoise(vec3(vKPos.xz * 1.3, 4.0)) * 0.45;
        diffuseColor.rgb *= 0.9 + 0.2 * kg;`);
  };
  const top = new THREE.Mesh(tg, topMat);
  top.position.set(W / 2, 0, H / 2);
  top.receiveShadow = true;
  top.renderOrder = -1;
  group.add(top);

  // ---- cliff: marching squares on the mask → a ring of rock dropping into the clouds ----
  const STEP = 3;                                   // mask pixels per cell (12 world units)
  const gw = Math.floor(mw / STEP) + 2, gh = Math.floor(mh / STEP) + 2;
  const val = (gx, gy) => { const px = (gx - 1) * STEP, py = (gy - 1) * STEP; return px < 0 || py < 0 || px >= mw || py >= mh ? 0 : mask[py * mw + px] * 255; };
  const wx = (gx) => (gx - 1) * STEP * MASK_SCALE, wy = (gy) => (gy - 1) * STEP * MASK_SCALE;
  const ISO = 128;
  const lerpP = (ax, ay, av, bx, by, bv) => { const t = (ISO - av) / (bv - av || 1); return [ax + (bx - ax) * t, ay + (by - ay) * t]; };
  const segs = [];
  for (let gy = 0; gy < gh - 1; gy++) for (let gx = 0; gx < gw - 1; gx++) {
    const a = val(gx, gy), b = val(gx + 1, gy), c = val(gx + 1, gy + 1), d = val(gx, gy + 1);
    const idx = (a > ISO ? 8 : 0) | (b > ISO ? 4 : 0) | (c > ISO ? 2 : 0) | (d > ISO ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const x0 = wx(gx), x1 = wx(gx + 1), y0 = wy(gy), y1 = wy(gy + 1);
    const T = () => lerpP(x0, y0, a, x1, y0, b), Rt = () => lerpP(x1, y0, b, x1, y1, c), Bm = () => lerpP(x0, y1, d, x1, y1, c), L = () => lerpP(x0, y0, a, x0, y1, d);
    const add = (p, q) => segs.push([p, q]);
    switch (idx) {
      case 1: case 14: add(L(), Bm()); break;
      case 2: case 13: add(Bm(), Rt()); break;
      case 3: case 12: add(L(), Rt()); break;
      case 4: case 11: add(T(), Rt()); break;
      case 6: case 9: add(T(), Bm()); break;
      case 7: case 8: add(L(), T()); break;
      case 5: add(L(), T()); add(Bm(), Rt()); break;
      case 10: add(L(), Bm()); add(T(), Rt()); break;
      default: break;
    }
  }
  // rings going down: [depth, how far the wall moves inward, how much it follows the hills]
  const RINGS = [[4, -3, 1], [-26, -9, 1], [-70, 6, 0.6], [-140, 34, 0.2], [-230, 86, 0], [-330, 170, 0]];
  const cx = W / 2, cy = H / 2;
  const pos = [], colr = [];
  const soil = hex(0x8a5f3c), rockC = hex(0x77614f), deep = hex(0x4f4a52), cc = new THREE.Color();
  const wallPoint = (p, ring) => {
    const [depth, inward, follow] = RINGS[ring];
    const dx = cx - p[0], dy = cy - p[1], len = Math.hypot(dx, dy) || 1;
    const wob = Math.sin(p[0] * 0.031 + ring * 1.7) * 7 + Math.sin(p[1] * 0.047 + ring) * 6;
    const k = (inward + (ring > 0 ? wob : 0)) / len;
    return [p[0] + dx * k, depth + heightAt(p[0], p[1]) * follow, p[1] + dy * k];
  };
  const ringColor = (ring, p) => {
    const t = ring / (RINGS.length - 1);
    cc.copy(soil).lerp(rockC, Math.min(1, t * 2.2)).lerp(deep, Math.max(0, t - 0.5) * 1.6);
    cc.offsetHSL(0, 0, Math.sin(p[0] * 0.05 + p[1] * 0.07) * 0.03);
    return [cc.r, cc.g, cc.b];
  };
  for (const [p, q] of segs) {
    for (let k = 0; k < RINGS.length - 1; k++) {
      const a = wallPoint(p, k), b = wallPoint(q, k), c = wallPoint(q, k + 1), d = wallPoint(p, k + 1);
      pos.push(...a, ...d, ...b, ...b, ...d, ...c);
      colr.push(...ringColor(k, p), ...ringColor(k + 1, p), ...ringColor(k, q), ...ringColor(k, q), ...ringColor(k + 1, p), ...ringColor(k + 1, q));
    }
  }
  if (pos.length) {
    let cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cg.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    cg = mergeVertices(cg, 0.5);
    cg.computeVertexNormals();
    const cliffMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
    cliffMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vKPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvKPos = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vKPos;${NOISE_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float strata = kNoise(vec3(vKPos.x * 0.012, vKPos.y * 0.09, vKPos.z * 0.012));
          float blot = kNoise(vKPos * 0.035);
          diffuseColor.rgb *= 0.82 + 0.22 * strata + 0.14 * blot;`);
    };
    const cliff = new THREE.Mesh(cg, cliffMat);
    cliff.receiveShadow = true;
    group.add(cliff);
  }

  // map coordinates outside, padded coordinates inside
  return { group, W, H: H - off, y0: -off, off, fullH: H, hasWater, waterMask: wSoft, maskW: mw, maskH: mh,
    maskAt: (x, y) => maskAt(x, y + off), colorAt: (x, y, out) => colorAt(x, y + off, out), isGrass: (x, y, m) => isGrass(x, y + off, m),
    isWater: (x, y) => isWater(x, y + off), heightAt: (x, y) => heightAt(x, y + off), shadeAt: (x, y) => shadeAt(x, y + off),
    slopeAt: (x, y) => Math.hypot(heightAt(x + 8, y + off) - heightAt(x - 8, y + off), heightAt(x, y + off + 8) - heightAt(x, y + off - 8)) / 16,
    dispose() { map.dispose(); alphaMap.dispose(); group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); } };
}
