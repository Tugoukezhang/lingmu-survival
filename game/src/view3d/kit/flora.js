// Plants and rocks of the 3D map kit (docs/14), all generated in code:
// fluffy trees (leaf cards facing the camera, lit with sphere normals, over a
// dark core that casts the shadow), pines, shrubs, berry bushes, tall grass
// tufts, chiselled rocks with worn edges, glowing crystals.
// makeKit() returns prototypes keyed by the game's texture keys, so World3D can
// swap "the tree sprite" for "a 3D tree" object by object.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TIME, rng, hex, paint, patchGhost, NOISE_GLSL } from './shared.js';
import { buildingMaterials, buildingProtos } from './buildings.js';
import { rockGeometry as roundRockGeometry } from '../look/nature.js';
import { propProtos } from './props.js';

// ---------- textures ----------
let clusterTex = null;
function leafClusterTexture() {
  if (clusterTex) return clusterTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  // a clump of small rounded leaves (not a star): soft, bumpy outline, lighter and darker leaves inside
  const rand = rng(11);
  const leaf = (x, y, rot, len, wid, v) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    const grd = g.createLinearGradient(-len, 0, len, 0);
    const a = Math.round(v * 255), b = Math.round(Math.min(1, v + 0.16) * 255);
    grd.addColorStop(0, `rgb(${a},${a},${a})`); grd.addColorStop(1, `rgb(${b},${b},${b})`);
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(-len, 0); g.quadraticCurveTo(0, -wid, len, 0); g.quadraticCurveTo(0, wid, -len, 0); g.fill();
    g.restore();
  };
  g.fillStyle = '#c9c9c9'; g.beginPath(); g.arc(128, 128, 62, 0, Math.PI * 2); g.fill();      // solid middle
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 84;
    leaf(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, a + (rand() - 0.5) * 1.6, 26 + rand() * 12, 13 + rand() * 6, 0.72 + rand() * 0.26);
  }
  clusterTex = new THREE.CanvasTexture(c); clusterTex.colorSpace = THREE.SRGBColorSpace; clusterTex.anisotropy = 4;
  return clusterTex;
}

// ---------- materials ([normal, ghost]) ----------
function foliageMaterial(ghost) {
  const m = new THREE.MeshLambertMaterial({ map: leafClusterTexture(), alphaTest: 0.45, vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = TIME;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aOffset;\nuniform float uTime;')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        float kS = length(modelMatrix[0].xyz);
        float kW = sin(uTime * 1.2 + position.y * 0.06 + modelMatrix[3].x * 0.013) * 0.035;
        mvPosition.xy += (aOffset + vec2(kW * length(aOffset), 0.0)) * kS;
        gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;');
    if (ghost) patchGhost(shader);
  };
  m.customProgramCacheKey = () => `kit-foliage-${ghost}`;
  return m;
}
function solidMaterial(ghost) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  if (ghost) { m.onBeforeCompile = patchGhost; m.customProgramCacheKey = () => 'kit-solid-ghost'; }
  return m;
}
function rockMaterial(ghost) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vKPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvKPos = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vKPos;${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float kn = kNoise(vKPos * 0.09) * 0.6 + kNoise(vKPos * 0.31) * 0.4;
        diffuseColor.rgb *= 0.84 + 0.3 * kn;
        float kEdge = smoothstep(0.06, 0.5, length(fwidth(normalize(vNormal))) * 5.0);   // worn, lighter edges
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.3 + 0.04, kEdge * 0.6);`);
    if (ghost) patchGhost(shader);
  };
  m.customProgramCacheKey = () => `kit-rock-${ghost}`;
  return m;
}
function crystalMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xd4dbff, emissive: 0x7d8cff, emissiveIntensity: 0.7, roughness: 0.25, metalness: 0, flatShading: true });
}

// ---------- geometry helpers ----------
const clean = (g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; };
const lerp3 = (a, b, c, t, out) => (t < 0.5 ? out.copy(a).lerp(b, t * 2) : out.copy(b).lerp(c, (t - 0.5) * 2));

// Leaf cards on the given blobs. blob: { c: Vector3, r, dirs?: (i, n) => Vector3 }.
function canopyGeometry(rand, blobs, { perBlob = 58, size = 0.5, low, mid, top }) {
  const pos = [], off = [], uv = [], nor = [], col = [], idx = [];
  const crown = new THREE.Vector3(); let wsum = 0;
  for (const b of blobs) { crown.addScaledVector(b.c, b.r); wsum += b.r; }
  crown.multiplyScalar(1 / wsum);
  const dir = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), cc = new THREE.Color();
  const golden = Math.PI * (3 - Math.sqrt(5));
  let v = 0;
  for (const b of blobs) {
    const count = Math.round(perBlob * (b.density ?? 1));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 1.72;                       // skip the very bottom of the sphere
      const rad = Math.sqrt(Math.max(0, 1 - y * y)), th = golden * i + rand() * 0.5;
      dir.set(Math.cos(th) * rad, y, Math.sin(th) * rad);
      c.copy(b.c).addScaledVector(dir, b.r * (0.86 + rand() * 0.12));
      n.copy(c).sub(crown).normalize().multiplyScalar(0.5).addScaledVector(dir, 0.5).normalize();
      const s = b.r * size * (0.78 + rand() * 0.5);
      const rot = rand() * Math.PI * 2, cs = Math.cos(rot), sn = Math.sin(rot);
      const t = Math.min(1, Math.max(0, n.y * 0.5 + 0.5 + (rand() - 0.5) * 0.3));
      lerp3(low, mid, top, t, cc);
      cc.offsetHSL((rand() - 0.5) * 0.02, 0, (rand() - 0.5) * 0.04);
      for (const [ox, oy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(c.x, c.y, c.z);
        off.push((ox * cs - oy * sn) * s, (ox * sn + oy * cs) * s);
        uv.push(ox * 0.5 + 0.5, oy * 0.5 + 0.5);
        nor.push(n.x, n.y, n.z);
        col.push(cc.r, cc.g, cc.b);
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aOffset', new THREE.Float32BufferAttribute(off, 2));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.boundingSphere.radius += Math.max(...blobs.map((b) => b.r)) * size * 1.5;
  return g;
}
function coreGeometry(blobs, color, k = 0.8) {
  return mergeGeometries(blobs.map((b) => { const s = new THREE.IcosahedronGeometry(b.r * k, 2); s.translate(b.c.x, b.c.y, b.c.z); return paint(clean(s), color); }));
}
function trunkGeometry(rand, { h = 40, r0 = 8, r1 = 5, lean = 4, color = 0x8a5a36, dark = 0x5e3d26 }) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 9, 5); g.translate(0, h / 2, 0);
  const p = g.attributes.position, a = hex(color), b = hex(dark), cc = new THREE.Color(), col = new Float32Array(p.count * 3);
  const lx = (rand() - 0.5) * lean * 2, lz = (rand() - 0.5) * lean * 2;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h, flare = 1 + 0.55 * Math.max(0, 1 - t * 4) ** 2;
    p.setXYZ(i, p.getX(i) * flare + lx * t * t, p.getY(i), p.getZ(i) * flare + lz * t * t);
    cc.copy(b).lerp(a, Math.min(1, 0.25 + t)); col.set([cc.r, cc.g, cc.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return clean(g);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ball = (x, y, z, r, color, seg = 10) => { const s = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)); s.translate(x, y, z); return paint(clean(s), color); };

// ---------- prototypes ----------
function roundTree(rand) {
  const H = 124, th = 40 + rand() * 8;
  const R = 30 + rand() * 4;
  const blobs = [
    { c: V(0, th + R * 0.9, 0), r: R },
    { c: V(-R * 0.72, th + R * 0.55, R * 0.15), r: R * 0.72 },
    { c: V(R * 0.74, th + R * 0.62, -R * 0.1), r: R * 0.74 },
    { c: V(R * 0.1, th + R * 0.5, R * 0.62), r: R * 0.66 },
    { c: V(-R * 0.1, th + R * 0.6, -R * 0.62), r: R * 0.66 },
    { c: V(R * 0.05, th + R * 1.55, 0), r: R * 0.7 },
  ];
  const low = hex(0x357f3a), mid = hex(0x6fb53c), top = hex(0xa9d850);
  const apples = [];
  for (let i = 0; i < 7; i++) { const b = blobs[Math.floor(rand() * 5)], a = rand() * 6.28, y = (rand() - 0.6) * 0.8; apples.push(ball(b.c.x + Math.cos(a) * b.r * 0.96, b.c.y + y * b.r, b.c.z + Math.sin(a) * b.r * 0.96, 4.2, 0xdc3a2e)); }
  return { height: H, parts: [
    { geo: canopyGeometry(rand, blobs, { low, mid, top }), mat: 'foliage' },
    { geo: mergeGeometries([coreGeometry(blobs, 0x2f6e33), ...apples]), mat: 'solid', cast: true },
    { geo: trunkGeometry(rand, { h: th + R * 0.5, r0: 8.5, r1: 5 }), mat: 'solid', cast: true },
  ] };
}
function pineTree(rand) {
  const H = 132, th = 20;
  const blobs = [];
  const tiers = [[th + 14, 30], [th + 40, 24], [th + 64, 18], [th + 86, 12], [th + 103, 7]];
  for (const [y, r] of tiers) {
    const n = r > 20 ? 6 : r > 10 ? 5 : 1;
    if (n === 1) blobs.push({ c: V(0, y, 0), r: r * 1.2, density: 0.6 });
    else for (let i = 0; i < n; i++) { const a = (i / n) * 6.28 + rand(); blobs.push({ c: V(Math.cos(a) * r * 0.62, y + (rand() - 0.5) * 4, Math.sin(a) * r * 0.62), r: r * 0.62, density: 0.5 }); }
    blobs.push({ c: V(0, y + 4, 0), r: r * 0.7, density: 0.35 });
  }
  const low = hex(0x1f6650), mid = hex(0x3c9a62), top = hex(0x86cf7e);
  const cones = tiers.map(([y, r]) => { const c = new THREE.ConeGeometry(r * 0.95, r * 1.5, 10); c.translate(0, y + r * 0.2, 0); return paint(clean(c), 0x1c5a48); });
  return { height: H, parts: [
    { geo: canopyGeometry(rand, blobs, { perBlob: 44, size: 0.62, low, mid, top }), mat: 'foliage' },
    { geo: mergeGeometries(cones), mat: 'solid', cast: true },
    { geo: trunkGeometry(rand, { h: th + 20, r0: 7, r1: 4.5, lean: 1, color: 0x7a4f30 }), mat: 'solid', cast: true },
  ] };
}
function shrub(rand, { berries = 0, flowers = 0, H = 54 } = {}) {
  const R = H * 0.42;
  const blobs = [{ c: V(0, R * 0.95, 0), r: R }, { c: V(-R * 0.8, R * 0.7, R * 0.1), r: R * 0.7 }, { c: V(R * 0.8, R * 0.72, -R * 0.1), r: R * 0.72 }, { c: V(R * 0.1, R * 0.62, R * 0.7), r: R * 0.62 }];
  const low = hex(0x3a8838), mid = hex(0x78bd40), top = hex(0xb2de58);
  const extra = [];
  const dot = (n, r, color) => { for (let i = 0; i < n; i++) { const b = blobs[Math.floor(rand() * blobs.length)], a = rand() * 6.28, y = rand() * 0.9 - 0.1; const k = Math.sqrt(1 - Math.min(1, y * y)); extra.push(ball(b.c.x + Math.cos(a) * k * b.r * 1.02, b.c.y + y * b.r * 1.02, b.c.z + Math.sin(a) * k * b.r * 1.02, r, color, 8)); } };
  dot(berries, 3.4, 0xd8342c); dot(flowers, 3.8, 0xfff6e8);
  return { height: H, parts: [
    { geo: canopyGeometry(rand, blobs, { perBlob: 46, size: 0.52, low, mid, top }), mat: 'foliage' },
    { geo: mergeGeometries([coreGeometry(blobs, 0x2f6e33, 0.78), ...extra]), mat: 'solid', cast: true },
  ] };
}
function tallGrass(rand) {
  const parts = [];
  for (let i = 0; i < 16; i++) {
    const h = 22 + rand() * 20;
    const b = new THREE.ConeGeometry(2.1, h, 4, 3); b.translate(0, h / 2, 0);
    const p = b.attributes.position, bend = 5 + rand() * 9;
    for (let k = 0; k < p.count; k++) { const t = p.getY(k) / h; p.setX(k, p.getX(k) + bend * t * t); }
    b.rotateY(rand() * 6.28); b.translate((rand() - 0.5) * 14, 0, (rand() - 0.5) * 12);
    b.computeVertexNormals();
    parts.push(paint(clean(b), i % 3 ? 0x9bd24a : 0x7dbb3c));
  }
  for (let i = 0; i < 4; i++) {   // seed heads
    const h = 36 + rand() * 10, a = rand() * 6.28, d = 4 + rand() * 6;
    const stem = new THREE.CylinderGeometry(0.6, 0.8, h, 4); stem.translate(Math.cos(a) * d, h / 2, Math.sin(a) * d); parts.push(paint(clean(stem), 0xa9c95a));
    const head = new THREE.SphereGeometry(2.6, 8, 6); head.scale(1, 2.6, 1); head.translate(Math.cos(a) * d, h + 4, Math.sin(a) * d); parts.push(paint(clean(head), 0xe9d58a));
  }
  return { height: 42, parts: [{ geo: mergeGeometries(parts), mat: 'solid', cast: true }] };
}

export function rockGeometry(rand, { w = 56, h = 40, d = 44, cuts = 10 } = {}) {
  let g = new THREE.IcosahedronGeometry(1, 5);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const planes = [[V(0, 1, 0), 0.62 + rand() * 0.14]];
  for (let i = 0; i < cuts; i++) planes.push([V((rand() - 0.5) * 2, rand() * 1.1 - 0.15, (rand() - 0.5) * 2).normalize(), 0.6 + rand() * 0.26]);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    for (const [n, dist] of planes) { const t = v.dot(n) - dist; if (t > 0) v.addScaledVector(n, -t * 0.94); }
    if (v.y < 0) v.y *= 0.2;
    p.setXYZ(i, v.x * w / 2, v.y * h / 0.72, v.z * d / 2);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal, col = new Float32Array(p.count * 3);
  const base = hex(0xb4a99b), light = hex(0xe2dccf), shade = hex(0x7c7772), moss = hex(0x86b04a), bounce = hex(0x5f7a48), cc = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getY(i) / h)), up = nrm.getY(i);
    cc.copy(shade).lerp(base, Math.min(1, t * 1.5));
    if (up > 0.55) cc.lerp(light, Math.min(1, (up - 0.55) * 1.8));
    const mn = Math.sin(p.getX(i) * 0.21 + 1.3) * Math.sin(p.getZ(i) * 0.17 + 0.4);
    if (up > 0.72 && mn > 0.15) cc.lerp(moss, Math.min(0.55, (mn - 0.15) * 1.6));
    if (t < 0.22) cc.lerp(bounce, (0.22 - t) * 2.2);
    col.set([cc.r, cc.g, cc.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function rock(rand, o) { return { height: o.h, parts: [{ geo: rockGeometry(rand, o), mat: 'rock', cast: true }] }; }
function rockPile(rand) {
  const gs = [];
  for (const [x, z, s] of [[0, -4, 1], [-20, 8, 0.62], [19, 9, 0.55], [2, 14, 0.4]]) { const g = rockGeometry(rand, { w: 40 * s, h: 34 * s, d: 34 * s, cuts: 8 }); g.rotateY(rand() * 6.28); g.translate(x, 0, z); gs.push(g); }
  return { height: 34, parts: [{ geo: mergeGeometries(gs), mat: 'rock', cast: true }] };
}
// big rounded sandstone boulder (scenery on the hills; not something to gather)
function boulder(rand, { w = 96, h = 46, d = 74 } = {}) {
  const g = roundRockGeometry(rand, { w, h, d, color: [0xd9a56c, 0xcf9a62, 0xc9a878][Math.floor(rand() * 3)] });
  return { height: h * 1.1, parts: [{ geo: g, mat: 'rock', cast: true }] };
}
function crystal(rand) {
  const cs = [];
  for (let i = 0; i < 6; i++) {
    const h = 16 + rand() * 22, r = 4 + rand() * 3.5;
    const body = new THREE.CylinderGeometry(r, r * 0.8, h, 6); body.translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(r, r * 1.5, 6); tip.translate(0, h + r * 0.75, 0);
    const g = mergeGeometries([clean(body), clean(tip)]);
    g.rotateZ((rand() - 0.5) * 0.7); g.rotateY(rand() * 6.28); g.translate((rand() - 0.5) * 22, 6, (rand() - 0.5) * 14);
    cs.push(g);
  }
  const base = rockGeometry(rand, { w: 50, h: 18, d: 36, cuts: 8 });
  return { height: 46, parts: [{ geo: base, mat: 'rock', cast: true }, { geo: mergeGeometries(cs), mat: 'crystal', cast: true }] };
}

// ---------- the kit ----------
export function makeKit(seed = 20261112) {
  const rand = rng(seed);
  const mats = { foliage: [foliageMaterial(false), foliageMaterial(true)], solid: [solidMaterial(false), solidMaterial(true)], rock: [rockMaterial(false), rockMaterial(true)], crystal: [crystalMaterial(), crystalMaterial()], ...buildingMaterials() };
  const protos = {
    tree: [roundTree(rand), roundTree(rand), roundTree(rand)],
    tree_b: [pineTree(rand), pineTree(rand)],
    tree_c: [shrub(rand, { flowers: 9, H: 62 }), shrub(rand, { flowers: 7, H: 56 })],
    bush: [shrub(rand, { berries: 12, H: 46 }), shrub(rand, { berries: 10, H: 42 })],
    grass_tuft: [tallGrass(rand), tallGrass(rand)],
    rock: [rock(rand, { w: 54, h: 36, d: 44 }), rock(rand, { w: 60, h: 30, d: 46 }), rock(rand, { w: 46, h: 40, d: 40 })],
    rock_b: [rockPile(rand), rockPile(rand)],
    crystal: [crystal(rand), crystal(rand)],
    boulder: [boulder(rand), boulder(rand, { w: 80, h: 54, d: 70 }), boulder(rand, { w: 110, h: 40, d: 84 })],
    ...buildingProtos(seed + 7),
    ...propProtos(seed + 9),
  };
  // a new object for one map prop; hash picks the variant and the turn
  function instantiate(key, hash) {
    const list = protos[key];
    if (!list) return null;
    const proto = list[hash % list.length];
    const g = new THREE.Group();
    for (const part of proto.parts) {
      const m = part.points ? new THREE.Points(part.geo, mats[part.mat][0]) : new THREE.Mesh(part.geo, mats[part.mat][0]);
      if (part.points) m.frustumCulled = false;                    // the sparks rise far above their base
      m.castShadow = !!part.cast; m.receiveShadow = !['foliage', 'flame', 'glow', 'lampglow', 'spark'].includes(part.mat);
      m.userData.mat = part.mat; m.userData.cast = !!part.cast;
      g.add(m);
    }
    if (!proto.fixed) g.rotation.y = ((hash >> 3) % 628) / 100;      // buildings keep their front to the camera
    g.userData = { height: proto.height, ghost: false, scale1: proto.scale1, foot: proto.foot, dz: proto.dz };
    return g;
  }
  function setGhost(group, on) {
    if (group.userData.ghost === on) return;
    group.userData.ghost = on;
    for (const m of group.children) { m.material = mats[m.userData.mat][on ? 1 : 0]; m.castShadow = !on && m.userData.cast; }
  }
  // windows and lanterns glow at night (k: 0 day … 1 night)
  function setNight(k) {
    for (const m of mats.glow) m.emissiveIntensity = 0.22 + k * 1.7;
    for (const m of mats.lampglow) m.emissiveIntensity = 0.3 + k * 2.6;
  }
  return { protos, mats, instantiate, setGhost, setNight, has: (key) => !!protos[key] };
}
