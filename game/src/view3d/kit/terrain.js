// Island terrain for the 3D map (docs/14): the top surface (the game's own
// ground painting as colour, cut to the island outline), the cliff ring that
// drops into the clouds, and helpers to ask "is this spot grass, what colour".
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE_GLSL, hex, rng } from './shared.js';

const MASK_SCALE = 4;       // mask / colour lookup: 1 pixel = 4 world units

export function buildIsland({ walk, cols, rows, tile, groundCanvas, seed = 1 }) {
  const W = cols * tile, H = rows * tile;
  const group = new THREE.Group();

  // ---- outline mask: the same rounded blobs the 2D ground uses, lightly blurred ----
  const mw = Math.ceil(W / MASK_SCALE), mh = Math.ceil(H / MASK_SCALE);
  const mc = document.createElement('canvas'); mc.width = mw; mc.height = mh;
  const mg = mc.getContext('2d');
  mg.fillStyle = '#000'; mg.fillRect(0, 0, mw, mh);
  mg.filter = 'blur(1.2px)';
  mg.fillStyle = '#fff';
  const r = (tile * 0.74) / MASK_SCALE;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (walk[y][x]) { mg.beginPath(); mg.arc((x + 0.5) * tile / MASK_SCALE, (y + 0.5) * tile / MASK_SCALE, r, 0, Math.PI * 2); mg.fill(); }
  mg.filter = 'none';
  const mask = mg.getImageData(0, 0, mw, mh).data;
  const maskAt = (x, y) => { const px = Math.floor(x / MASK_SCALE), py = Math.floor(y / MASK_SCALE); return px < 0 || py < 0 || px >= mw || py >= mh ? 0 : mask[(py * mw + px) * 4]; };

  // ---- colour: the 2D ground painting (grass texture, plaza, ponds, meadow) ----
  const ac = document.createElement('canvas'); ac.width = W; ac.height = H;
  const ag = ac.getContext('2d');
  ag.fillStyle = '#7fb85a'; ag.fillRect(0, 0, W, H);
  if (groundCanvas) ag.drawImage(groundCanvas, 0, 0);
  // big soft light / dark patches so the meadow is not one flat tone
  const rand = rng(seed * 977 + 5);
  for (let i = 0; i < 90; i++) {
    const x = rand() * W, y = rand() * H, rr = 120 + rand() * 260, light = rand() < 0.5;
    const g = ag.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, light ? 'rgba(236,246,150,0.2)' : 'rgba(24,88,50,0.26)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ag.fillStyle = g; ag.fillRect(x - rr, y - rr, rr * 2, rr * 2);
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
    const R = small[i], G = small[i + 1], B = small[i + 2];
    return G > R * 1.08 && G > B * 1.25 && G > 90;
  };

  const map = new THREE.CanvasTexture(ac); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const alphaMap = new THREE.CanvasTexture(mc);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map, alphaMap, alphaTest: 0.5, roughness: 1, metalness: 0 }));
  top.position.set(W / 2, 0, H / 2);
  top.receiveShadow = true;
  top.renderOrder = -1;
  group.add(top);

  // ---- cliff: marching squares on the mask → a ring of rock dropping into the clouds ----
  const STEP = 3;                                   // mask pixels per cell (12 world units)
  const gw = Math.floor(mw / STEP) + 2, gh = Math.floor(mh / STEP) + 2;
  const val = (gx, gy) => { const px = (gx - 1) * STEP, py = (gy - 1) * STEP; return px < 0 || py < 0 || px >= mw || py >= mh ? 0 : mask[(py * mw + px) * 4]; };
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
  // rings going down: [depth, how far the wall moves inward]
  const RINGS = [[4, -3], [-26, -9], [-70, 6], [-140, 34], [-230, 86], [-330, 170]];
  const cx = W / 2, cy = H / 2;
  const pos = [], colr = [];
  const soil = hex(0x8a5f3c), rockC = hex(0x77614f), deep = hex(0x4f4a52), cc = new THREE.Color();
  const wallPoint = (p, ring) => {
    const [depth, inward] = RINGS[ring];
    const dx = cx - p[0], dy = cy - p[1], len = Math.hypot(dx, dy) || 1;
    const wob = Math.sin(p[0] * 0.031 + ring * 1.7) * 7 + Math.sin(p[1] * 0.047 + ring) * 6;
    const k = (inward + (ring > 0 ? wob : 0)) / len;
    return [p[0] + dx * k, depth, p[1] + dy * k];
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

  return { group, W, H, maskAt, colorAt, isGrass, dispose() { map.dispose(); alphaMap.dispose(); group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); } };
}
