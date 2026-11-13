// Buildings and camp props of the 3D map kit (docs/14), all generated in code
// after the game's own 2D art (assets/world/bld_*.png, tent, campfire, lamp …):
// log cottage, the three town houses, tent, campfire, street lamp, fountain,
// chests and crates. Fronts face the camera (+z); the model's origin is the
// middle of its front edge on the ground, like the foot of the 2D sprite.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { TIME, hex, paint, patchGhost, NOISE_GLSL, rng } from './shared.js';
import { rockGeometry } from './flora.js';

// ---------- materials ([normal, ghost]) ----------
function paintedMaterial(ghost) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aKind;\nvarying vec3 vKPos;\nvarying vec4 vKind;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvKPos = position; vKind = aKind;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vKPos;\nvarying vec4 vKind;${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float kn = kNoise(vKPos * 0.16) * 0.6 + kNoise(vKPos * 0.55) * 0.4;                 // hand-painted mottling
        diffuseColor.rgb *= 0.92 + 0.16 * kn;
        // surface detail by kind (aKind.w), painted in object space so it stays crisp close up
        float kKind = floor(vKind.w + 0.5);
        if (kKind == 1.0) {                                                                  // wood: streaks and grain lines along the piece
          vec3 kg = normalize(vKind.xyz + 1e-4);
          float al = dot(vKPos, kg); vec3 pp = vKPos - kg * al;
          float gr = kNoise(pp * 1.25 + kg * al * 0.075 + 7.0);
          float fine = kNoise(pp * 4.6 + kg * al * 0.28);
          float lines = smoothstep(0.0, 0.17, abs(fract(gr * 7.0) - 0.5));
          diffuseColor.rgb *= (0.83 + 0.22 * gr + 0.08 * fine) * (0.84 + 0.16 * lines);
        } else if (kKind == 2.0) {                                                           // stone: speckles and small pits
          float sp = kNoise(vKPos * 1.1), pit = smoothstep(0.7, 0.8, kNoise(vKPos * 2.7 + 3.0));
          diffuseColor.rgb *= 0.86 + 0.24 * sp - 0.18 * pit;
        } else if (kKind == 3.0) {                                                           // plaster: brush marks, a little grime near the ground
          float br = kNoise(vec3(vKPos.x * 0.5, vKPos.y * 0.12, vKPos.z * 0.5));
          diffuseColor.rgb *= (0.92 + 0.11 * br + 0.05 * kNoise(vKPos * 3.0)) * (0.86 + 0.14 * smoothstep(10.0, 36.0, vKPos.y));
        } else if (kKind == 4.0) {                                                           // roof tile: baked clay
          diffuseColor.rgb *= 0.88 + 0.2 * kNoise(vKPos * 1.7) + 0.06 * kNoise(vKPos * 6.0);
        } else if (kKind == 5.0) {                                                           // cloth: weave
          float weave = sin((vKPos.x + vKPos.z) * 2.4) * sin(vKPos.y * 2.4);
          diffuseColor.rgb *= 0.95 + 0.05 * weave + 0.07 * kNoise(vKPos * 0.35);
        }
        float kEdge = smoothstep(0.08, 0.6, length(fwidth(normalize(vNormal))) * 4.0);       // lighter worn edges
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.22 + 0.03, kEdge * 0.5);`);
    if (ghost) patchGhost(shader);
  };
  m.customProgramCacheKey = () => `kit-painted-${ghost}`;
  return m;
}
function glowMaterial(ghost, color = 0xffd27a) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: color, emissiveIntensity: 0.3, roughness: 0.4 });
  if (ghost) { m.onBeforeCompile = patchGhost; m.customProgramCacheKey = () => 'kit-glow-ghost'; }
  return m;
}
function flameMaterial() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = TIME;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float kPh = modelMatrix[3].x * 0.07 + modelMatrix[3].z * 0.05;
        transformed.x += sin(uTime * 11.0 + position.y * 0.33 + kPh) * position.y * 0.055;
        transformed.z += cos(uTime * 9.0 + position.y * 0.29 + kPh) * position.y * 0.045;
        transformed.y *= 1.0 + 0.09 * sin(uTime * 13.0 + kPh);`);
  };
  m.customProgramCacheKey = () => 'kit-flame';
  return m;
}
function sparkMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: TIME },
    vertexShader: `uniform float uTime; attribute float aSeed; varying float vA;
      void main() {
        float ph = aSeed * 7.0 + modelMatrix[3].x * 0.013;
        float t = fract(uTime * (0.3 + aSeed * 0.3) + ph);
        vec3 p = position;
        p.y += 16.0 + t * 62.0; p.x += sin(t * 6.0 + aSeed * 40.0) * 7.0 * t; p.z += cos(t * 5.0 + aSeed * 31.0) * 5.0 * t;
        vA = (1.0 - t) * smoothstep(0.0, 0.12, t);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (2.0 + 2.4 * aSeed) * 520.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: 'varying float vA; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.7, 0.85, 0.22) * vA * smoothstep(0.5, 0.1, d), 1.0); }',
  });
}
function waterMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x8fdcf0, emissive: 0x2f8fb0, emissiveIntensity: 0.25, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.88 });
}
export function buildingMaterials() {
  return { painted: [paintedMaterial(false), paintedMaterial(true)], glow: [glowMaterial(false), glowMaterial(true)], lampglow: [glowMaterial(false, 0xffc45a), glowMaterial(true, 0xffc45a)],
    flame: [flameMaterial(), flameMaterial()], spark: [sparkMaterial(), sparkMaterial()], fountain: [waterMaterial(), waterMaterial()] };
}

// ---------- geometry helpers (everything ends up non-indexed with position, normal, colour) ----------
export const PLAIN = 0, WOOD = 1, STONE = 2, PLASTER = 3, TILE = 4, CLOTH = 5;
// aKind = (grain direction, kind). Rotating a geometry must turn the grain with it: applyMatrix4 is wrapped per geometry.
const tracked = new WeakSet();
function track(g) {
  if (tracked.has(g)) return g;
  tracked.add(g);
  const baseApply = g.applyMatrix4;
  g.applyMatrix4 = function (m) {
    baseApply.call(this, m);
    const a = this.attributes.aKind;
    if (a) { const m3 = new THREE.Matrix3().setFromMatrix4(m), v = new THREE.Vector3(); for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix3(m3).normalize(); a.setXYZ(i, v.x, v.y, v.z); } }
    return this;
  };
  return g;
}
export const clean = (g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aKind'].includes(k)) g.deleteAttribute(k); return track(g.index ? g.toNonIndexed() : g); };
export const merge = (list) => track(mergeGeometries(list));
// browns → wood, greys → stone, everything else plain paint
function autoKind(color) { const hsl = {}; (color.isColor ? color : hex(color)).getHSL(hsl); return hsl.s < 0.2 ? STONE : hsl.h > 0.035 && hsl.h < 0.125 && hsl.l < 0.72 && hsl.s > 0.25 ? WOOD : PLAIN; }
export function setKind(g, kind, dir) {
  const n = g.attributes.position.count, a = new Float32Array(n * 4);
  if (!dir) { g.computeBoundingBox(); const b = g.boundingBox.getSize(new THREE.Vector3()); dir = b.x >= b.y && b.x >= b.z ? [1, 0, 0] : b.y >= b.z ? [0, 1, 0] : [0, 0, 1]; }   // grain runs along the piece
  for (let i = 0; i < n; i++) a.set([dir[0], dir[1], dir[2], kind], i * 4);
  g.setAttribute('aKind', new THREE.BufferAttribute(a, 4));
  return g;
}
export const P = (g, color, kind = autoKind(color)) => setKind(paint(clean(g), color), kind);
export const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
// box with softened edges, centred
export function rbox(w, h, d, color, r = 2.5, kind) {
  let g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  r = Math.min(r, w / 3.2, h / 3.2, d / 3.2);
  const p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3(), ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.min(ix, Math.max(-ix, v.x)), Math.min(iy, Math.max(-iy, v.y)), Math.min(iz, Math.max(-iz, v.z)));
    v.sub(c); if (v.lengthSq() > 1e-6) v.setLength(r);
    p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
  }
  g.computeVertexNormals();
  return P(g, color, kind);
}
// upright cylinder standing on y = 0; the two end faces can have their own colour (log ends)
export function cyl(r0, r1, h, color, seg = 10, cap = null) {
  const g = clean(new THREE.CylinderGeometry(r1, r0, h, seg)); g.translate(0, h / 2, 0);
  paint(g, color); setKind(g, autoKind(color), [0, 1, 0]);
  if (cap == null) return g;
  const n = g.attributes.normal, c = g.attributes.color, k = hex(cap);
  for (let i = 0; i < n.count; i++) if (Math.abs(n.getY(i)) > 0.9) c.setXYZ(i, k.r, k.g, k.b);
  // sawn ends: growth rings
  const rings = [g];
  for (const [y, r] of [[-0.25, r0], [h + 0.25, r1]]) {
    rings.push(at(P(new THREE.CylinderGeometry(r * 0.7, r * 0.7, 0.5, seg), mixHex(cap, 0x7a4a2c, 0.35), PLAIN), 0, y, 0));
    rings.push(at(P(new THREE.CylinderGeometry(r * 0.36, r * 0.36, 0.9, seg), mixHex(cap, 0xffffff, 0.12), PLAIN), 0, y, 0));
  }
  return merge(rings);
}
const logX = (len, r, color, cap) => { const g = cyl(r, r, len, color, 9, cap); g.translate(0, -len / 2, 0); g.rotateZ(Math.PI / 2); return g; };
const logZ = (len, r, color, cap) => { const g = cyl(r, r, len, color, 9, cap); g.translate(0, -len / 2, 0); g.rotateX(Math.PI / 2); return g; };
export const ball = (r, color, sx = 1, sy = 1, sz = 1, seg = 8, kind = PLAIN) => { const g = new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2)); g.scale(sx, sy, sz); return P(g, color, kind); };
// flat outline (points [x, y]) pushed back by depth; the front face is at z = 0
function slab(pts, depth, color, kind) {
  const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }); g.translate(0, 0, -depth);
  return P(g, color, kind);
}
// door / window outline with a round top, bottom middle at the origin
function archPts(w, h, n = 8) {
  const r = w / 2, pts = [[-r, 0], [r, 0], [r, h - r]];
  for (let i = 1; i < n; i++) { const a = (i / n) * Math.PI; pts.push([Math.cos(a) * r, h - r + Math.sin(a) * r]); }
  pts.push([-r, h - r]);
  return pts;
}
const arch = (w, h, depth, color) => slab(archPts(w, h), depth, color);
export const mixHex = (a, b, t) => hex(a).lerp(hex(b), t);

// Gabled roof with rounded shingles; ridge runs front to back at x = 0. y0 = top of the walls.
function roof(out, rand, { w, d, y0, rise, over = 15, front = 12, tiles = [0xd8643a, 0xc9552f, 0xe27a48], ridge = 0xe2a560, trim = 0xecc083, under = 0x8f4a30, moss = 7 }) {
  const half = w / 2 + over, ang = Math.atan2(rise, w / 2), L = half / Math.cos(ang), D = d + front * 2;
  const side = [];
  side.push(at(rbox(L, 4, D, under, 1.5), L / 2, -1.5, 0));
  const stepU = 13.5, stepZ = 15, nu = Math.ceil(L / stepU), nz = Math.ceil(D / stepZ);
  for (let i = 0; i < nu; i++) {
    const u = L - (i + 0.5) * stepU + 2;
    for (let j = 0; j <= nz; j++) {
      const z = -D / 2 + j * stepZ + (i % 2 ? stepZ / 2 : 0) - stepZ * 0.25;
      if (z < -D / 2 - 2 || z > D / 2 + 2) continue;
      const c = mixHex(tiles[Math.floor(rand() * tiles.length)], 0xffe0a8, (i / nu) * 0.22 + rand() * 0.06);
      const t = ball(1, c, stepU * 0.74, 3.6, stepZ * 0.58, 7, TILE); t.rotateZ(-0.16);
      side.push(at(t, u, 1.6 + i * 0.12, z));
    }
  }
  for (let i = 0; i < moss; i++) side.push(at(ball(1, rand() < 0.5 ? 0x6f9a48 : 0x7fa652, 5 + rand() * 5, 2.2, 5 + rand() * 4, 7), L * (0.45 + rand() * 0.5), 3.4, (rand() - 0.5) * D * 0.9));   // moss near the eaves
  for (const s of [-1, 1]) side.push(at(rbox(L + 2, 7, 5, trim, 2), L / 2, 1.5, s * (D / 2 + 1.5)));   // boards along the gable edges
  const slope = merge(side); slope.rotateZ(-ang); slope.translate(0, y0 + rise, 0);
  const other = track(slope.clone()); other.rotateY(Math.PI);
  out.push(slope, other);
  out.push(at(logZ(D + 8, 5.2, ridge, 0xf6dba8), 0, y0 + rise + 2.5, 0));
  return { ang, D };
}

// window: frame, warm glass, cross bars; optional flower box. Centre bottom at (x, y), on the front wall at z.
function windowAt(out, glow, x, y, z, { w = 26, h = 30, frame = 0xf1dcb2, box = true, round = false } = {}) {
  if (round) {
    const f = P(new THREE.CylinderGeometry(w / 2 + 3.5, w / 2 + 3.5, 4, 16), frame); f.rotateX(Math.PI / 2); out.push(at(f, x, y + w / 2, z + 1));
    const g = clean(new THREE.CylinderGeometry(w / 2, w / 2, 4, 16)); g.rotateX(Math.PI / 2); glow.push(at(g, x, y + w / 2, z + 2));
    out.push(at(rbox(w, 2.4, 2.4, frame, 1), x, y + w / 2, z + 4), at(rbox(2.4, w, 2.4, frame, 1), x, y + w / 2, z + 4));
    return;
  }
  out.push(at(arch(w + 8, h + 5, 4, frame), x, y - 2.5, z + 3));
  const g = clean(new THREE.ExtrudeGeometry(new THREE.Shape(archPts(w, h).map(([a, b]) => new THREE.Vector2(a, b))), { depth: 2, bevelEnabled: false }));
  glow.push(at(g, x, y, z + 1.6));
  out.push(at(rbox(w, 2.6, 2.6, frame, 1), x, y + h * 0.5, z + 4.4), at(rbox(2.6, h - 2, 2.6, frame, 1), x, y + h / 2 - 1, z + 4.4));
  if (box) {
    out.push(at(rbox(w + 10, 7, 9, 0xb9773f, 2), x, y - 6, z + 7));
    for (let i = 0; i < 5; i++) out.push(at(ball(3.4, i % 2 ? 0x6fb53c : 0x86c84a), x - w / 2 + i * (w / 4), y - 1.5, z + 8));
    for (let i = 0; i < 3; i++) out.push(at(ball(2.3, [0xf7a8c2, 0xfff6e8, 0xf8cf48][i]), x - w / 3 + i * (w / 3), y + 1.5, z + 9.5));
  }
}
function doorAt(out, x, y, z, { w = 30, h = 46, color = 0xa9633a, frame = 0xecc083 } = {}) {
  out.push(at(arch(w + 10, h + 6, 5, frame), x, y, z + 4));
  out.push(at(arch(w, h, 3, color), x, y, z + 6));
  for (const dx of [-w / 4, w / 4]) out.push(at(rbox(1.6, h - 12, 1.4, mixHex(color, 0x3a2416, 0.45), 0.5), x + dx * 0.9, y + (h - 12) / 2, z + 6.5));
  out.push(at(ball(2.2, 0xf2c04a), x + w * 0.28, y + h * 0.42, z + 8));
  for (const k of [0.22, 0.66]) out.push(at(rbox(w * 0.42, 3, 1.2, 0x5a5560, 0.6), x - w * 0.27, y + h * k, z + 6.8));        // iron hinges
}
const signAt = (out, x, y, z, w = 50, color = 0xf3cf93) => { out.push(at(rbox(w, 15, 4, color, 3), x, y, z), at(rbox(w - 10, 2, 1, mixHex(color, 0x7a4f30, 0.5), 0.5), x, y, z + 2.4)); };
function chimney(out, x, y, z, h = 36) {
  out.push(at(rbox(18, h, 18, 0xb3aca3, 2.5), x, y + h / 2, z), at(rbox(23, 6, 23, 0x8f8983, 2), x, y + h + 2, z));
  for (let i = 0; i < 5; i++) out.push(at(rbox(7, 4, 1.5, 0x9a938b, 0.7), x - 5 + (i % 2) * 8, y + 6 + i * 6, z + 9));
}
const leaves = (out, rand, n, cx, cy, cz, sx, sy, sz) => { for (let i = 0; i < n; i++) out.push(at(ball(3.5 + rand() * 3, rand() < 0.5 ? 0x6fb53c : 0x8fce4c, 1, 0.8, 1, 6), cx + (rand() - 0.5) * sx, cy + (rand() - 0.5) * sy, cz + (rand() - 0.5) * sz)); };
// finish: move the front edge to z = 0 and pack the parts
function finish(height, depthFront, solid, glow, extra = []) {
  const parts = [{ geo: at(merge(solid), 0, 0, -depthFront), mat: 'painted', cast: true }];
  if (glow.length) { const g = merge(glow); g.computeVertexNormals(); parts.push({ geo: at(g, 0, 0, -depthFront), mat: 'glow' }); }
  for (const e of extra) { e.geo.translate(0, 0, -depthFront); parts.push(e); }
  return { height, parts, fixed: true };
}

// ---------- houses ----------
function cottage(rand) {
  const w = 148, d = 104, wallH = 60, rise = 64, zf = d / 2, o = [], glow = [];
  o.push(at(rbox(w + 14, 10, d + 14, 0xb9ab9a, 3), 0, 5, 0));
  o.push(at(rbox(w - 8, wallH, d - 8, 0x7a5232, 1), 0, 10 + wallH / 2, 0));                       // dark filling behind the logs
  const R = 6.6, n = Math.round(wallH / (R * 1.9));
  for (let i = 0; i < n; i++) {
    const y = 10 + R + i * (wallH / n), c = i % 2 ? 0xc98a4e : 0xbd7d43;
    for (const s of [-1, 1]) { o.push(at(logX(w + 16, R, c, 0xedc48e), 0, y, s * zf), at(logZ(d + 16, R, c, 0xedc48e), s * (w / 2), y + (wallH / n) * 0.5 - R * 0.35, 0)); }
  }
  for (const s of [-1, 1]) o.push(at(slab([[-w / 2, 0], [w / 2, 0], [0, rise]], 6, 0xd39b5e), 0, 10 + wallH, s * zf + (s > 0 ? 2 : 4)));
  roof(o, rand, { w, d, y0: 10 + wallH, rise });
  chimney(o, w * 0.28, 10 + wallH + rise * 0.42, -d * 0.12, 40);
  doorAt(o, 0, 10, zf + R - 3);
  o.push(at(rbox(46, 6, 16, 0xd8a868, 2.5), 0, 5, zf + 14), at(rbox(36, 5, 12, 0xcf9c5c, 2), 0, 3, zf + 24));
  for (const s of [-1, 1]) windowAt(o, glow, s * w * 0.31, 24, zf + R - 3, { w: 24, h: 28 });
  signAt(o, 0, 10 + wallH + 8, zf + R + 4, 52);
  windowAt(o, glow, 0, 10 + wallH + 24, zf + 3, { w: 15, round: true });
  // cobbles along the foot of the walls
  for (let x = -w / 2 - 2; x <= w / 2 + 2; x += 15) if (Math.abs(x) > 26) o.push(at(rbox(13 + rand() * 4, 10 + rand() * 3, 9, mixHex(0xb9ab9a, rand() < 0.5 ? 0x8f8983 : 0xd6ccbc, rand() * 0.6), 4), x, 5.5, zf + 8));
  for (const sx of [-1, 1]) for (let z = -zf + 8; z < zf; z += 16) o.push(at(rbox(9, 10 + rand() * 3, 13 + rand() * 4, mixHex(0xb9ab9a, 0x8f8983, rand() * 0.6), 4), sx * (w / 2 + 8), 5.5, z));
  // firewood stacked against the left wall, a barrel on the right, a lantern by the door
  for (const [row, n] of [[0, 4], [1, 3], [2, 2]]) for (let i = 0; i < n; i++) o.push(at(logZ(30, 5, 0x9a6238, 0xe8c08a), -w / 2 - 22 - row * 0 + (i - (n - 1) / 2) * 10.4, 5 + row * 9, zf - 26));
  o.push(at(cyl(11, 11, 26, 0xb9773f, 12, 0xd9a868), w / 2 + 22, 0, zf - 14));
  for (const y of [5, 20]) o.push(at(P(new THREE.CylinderGeometry(11.8, 11.8, 3, 12), 0x6a6570), w / 2 + 22, y, zf - 14));
  o.push(at(rbox(3, 3, 12, 0x5b3d26, 1), 27, 58, zf + R + 3), at(rbox(9, 2, 9, 0x4f3524, 0.8), 27, 56, zf + R + 9), at(rbox(9, 2, 9, 0x4f3524, 0.8), 27, 43, zf + R + 9));
  glow.push(at(clean(new THREE.BoxGeometry(7, 11, 7)), 27, 49.5, zf + R + 9));
  for (const [x, z, r] of [[-6, 40, 11], [9, 56, 9], [-8, 70, 10]]) o.push(at(ball(r, mixHex(0xcfc4b4, 0xa9a39a, rand()), 1, 0.22, 0.8, 9, STONE), x, 0.5, zf + z - 12));
  return finish(176, zf + 30, o, glow);
}
// plaster house with timber corners; opts choose the colours and the extras
function townHouse(rand, { wall = 0xf2b7ae, timber = 0xf3e3c3, tiles, door = 0xa9633a, extras }) {
  const w = 164, d = 112, wallH = 72, rise = 72, zf = d / 2, o = [], glow = [], more = [];
  o.push(at(rbox(w + 12, 12, d + 12, 0xcfc4b4, 3), 0, 6, 0));
  o.push(at(rbox(w, wallH, d, wall, 4, PLASTER), 0, 12 + wallH / 2, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.push(at(rbox(10, wallH + 2, 10, timber, 3), sx * (w / 2 - 2), 12 + wallH / 2, sz * (zf - 2)));
  o.push(at(rbox(w + 4, 7, 6, timber, 2.5), 0, 12 + wallH - 2, zf));
  for (const s of [-1, 1]) o.push(at(slab([[-w / 2, 0], [w / 2, 0], [0, rise]], 6, mixHex(wall, 0xffffff, 0.2), PLASTER), 0, 12 + wallH, s * zf + (s > 0 ? 2 : 4)));
  roof(o, rand, { w, d, y0: 12 + wallH, rise, tiles });
  chimney(o, w * 0.27, 12 + wallH + rise * 0.45, -d * 0.1, 40);
  doorAt(o, 0, 12, zf, { color: door, h: 48 });
  o.push(at(rbox(44, 7, 16, 0xd9cdbb, 2.5), 0, 5, zf + 12));
  for (const s of [-1, 1]) windowAt(o, glow, s * w * 0.31, 30, zf, { w: 26, h: 30 });
  windowAt(o, glow, 0, 12 + wallH + 30, zf + 3, { w: 18, round: true });
  signAt(o, 0, 12 + wallH + 12, zf + 9, 60);
  extras?.({ o, glow, more, w, d, wallH, rise, zf, rand });
  return finish(210, zf + 30, o, glow, more);
}
const shop = (rand) => townHouse(rand, { wall: 0xf2b3ae, tiles: [0xe58a6a, 0xd97a5c, 0xef9d78], extras: ({ o, w, wallH, zf, rand: r }) => {
  // striped awning over the shop front, crates of vegetables beside the door
  const n = 10, aw = w + 8, sw = aw / n;
  for (let i = 0; i < n; i++) {
    const c = i % 2 ? 0xfff4ec : 0xef8f98, x = -aw / 2 + (i + 0.5) * sw;
    const s = rbox(sw + 0.4, 3, 34, c, 1.2, CLOTH); s.rotateX(0.5); o.push(at(s, x, 12 + wallH * 0.84, zf + 15));
    o.push(at(ball(sw / 2, c, 1, 1, 0.5, 8), x, 12 + wallH * 0.84 - 9.5, zf + 29.5));
  }
  for (const s of [-1, 1]) {
    o.push(at(rbox(34, 14, 18, 0xc98a4e, 2), s * w * 0.33, 7, zf + 24));
    for (let i = 0; i < 6; i++) o.push(at(ball(4.5, [0xe8743a, 0x7cc04a, 0xe3c33c, 0xd9534a][Math.floor(r() * 4)]), s * w * 0.33 - 12 + (i % 3) * 12, 15.5, zf + 20 + Math.floor(i / 3) * 8));
  }
} });
const workshop = (rand) => townHouse(rand, { wall: 0xd6b98a, timber: 0xb07a45, tiles: [0xdd8a4a, 0xcf7a3e, 0xe89c58], door: 0x7fa650, extras: ({ o, w, d, wallH, rise, zf, rand: r }) => {
  o.push(at(rbox(w + 3, 24, d + 3, 0xb9ab9a, 3), 0, 12 + 12, 0));                                  // stone lower wall
  for (let i = 0; i < 12; i++) o.push(at(rbox(13, 7, 2, 0xa59d92, 1), -w / 2 + 12 + (i % 6) * 28 + (i > 5 ? 9 : 0), 18 + Math.floor(i / 6) * 10, zf + 2));
  leaves(o, r, 16, -w * 0.44, 12 + wallH * 0.6, zf + 2, 22, wallH, 8);                             // ivy up the left corner and onto the roof
  leaves(o, r, 14, -w * 0.3, 12 + wallH + rise * 0.45, zf + 8, 60, 30, 10);
  o.push(at(rbox(26, 5, 16, 0xe0b070, 1.5), w * 0.36, 5, zf + 22), at(rbox(26, 5, 16, 0xd6a05e, 1.5), w * 0.36 + 3, 10, zf + 20));   // planks
  const blade = rbox(30, 9, 1.4, 0xd9dde2, 1); blade.rotateZ(0.5); o.push(at(blade, w * 0.2, 12 + wallH * 0.86, zf + 9), at(rbox(9, 9, 3, 0xa9633a, 2), w * 0.2 - 15, 12 + wallH * 0.86 - 8, zf + 9));   // saw
} });
function lab(rand) {
  const R = 66, wallH = 64, o = [], glow = [];
  o.push(cyl(R + 8, R + 6, 12, 0xcfc4b4, 28));
  o.push(at(cyl(R, R - 2, wallH, 0xf2e6cc, 28), 0, 10, 0));
  o.push(at(cyl(R + 4, R + 4, 7, 0xe2cfa6, 28), 0, 10 + wallH - 2, 0));
  const dome = new THREE.SphereGeometry(R + 1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.9, 1);
  o.push(at(P(dome, 0x5f8fd2), 0, 10 + wallH + 4, 0));
  for (let i = 0; i < 8; i++) {                                                                    // gold ribs
    const rib = new THREE.TorusGeometry(R + 2, 2.2, 6, 14, Math.PI / 2); rib.scale(1, 0.9, 1); rib.rotateY((i / 8) * Math.PI * 2 + 0.39);
    o.push(at(P(rib, 0xe9c35a), 0, 10 + wallH + 4, 0));
  }
  const top = 10 + wallH + 4 + (R + 1) * 0.9;
  o.push(at(cyl(9, 7, 7, 0xe9c35a, 12), 0, top - 2, 0), at(ball(6.5, 0xf2d06a), 0, top + 10, 0), at(cyl(1.2, 1.2, 12, 0xe9c35a, 6), 0, top + 14, 0));
  const ring = new THREE.TorusGeometry(8, 1.3, 6, 16); o.push(at(P(ring, 0xe9c35a), 0, top + 12, 0));
  doorAt(o, 0, 10, R - 4, { color: 0x9a6a44, w: 34, h: 48 });
  o.push(at(rbox(48, 7, 16, 0xd9cdbb, 2.5), 0, 5, R + 8));
  for (const s of [-1, 1]) {
    const a = s * 0.62, x = Math.sin(a) * (R - 1), z = Math.cos(a) * (R - 1);
    const w0 = [], g0 = [];
    windowAt(w0, g0, 0, 0, 0, { w: 20, h: 26, box: false });
    for (const g of w0) { g.rotateY(a); o.push(at(g, x, 30, z)); }
    for (const g of g0) { g.rotateY(a); glow.push(at(g, x, 30, z)); }
  }
  signAt(o, 0, 10 + wallH - 2, R + 6, 56);
  leaves(o, rand, 22, -R * 0.75, 10 + wallH * 0.7, R * 0.45, 40, wallH * 1.2, 40);                   // vines on the left
  leaves(o, rand, 10, R * 0.8, 20, R * 0.3, 26, 30, 30);
  // telescope on a tripod, right of the door
  const tx = R * 0.72, tz = R * 0.78;
  for (let i = 0; i < 3; i++) { const leg = cyl(1.3, 1.3, 30, 0x9a6a44, 6); leg.rotateZ(0.28); leg.rotateY(i * 2.09); o.push(at(leg, tx, 0, tz)); }
  const tube = cyl(4.5, 3.2, 30, 0xe0b85a, 10); tube.translate(0, -15, 0); tube.rotateZ(-1.0); o.push(at(tube, tx, 32, tz));
  return finish(210, R + 20, o, glow);
}

// ---------- camp ----------
function tent() {
  const w = 86, h = 70, d = 84, o = [];
  const tri = (k) => [[-w / 2 * k, 0], [w / 2 * k, 0], [0, h * k]];
  o.push(at(slab(tri(1), d, 0xfaedd2, CLOTH), 0, 0, d / 2));                                  // canvas body
  o.push(at(slab(tri(0.74), 2, 0x6a3a2e), 0, 0, d / 2 + 1.2));                         // dark opening
  const flap = slab([[-w / 2, 0], [-w * 0.06, 0], [0, h], [-w * 0.1, h * 0.72]], 2.5, 0xd4705c, CLOTH); o.push(at(flap, 0, 0, d / 2 + 3));
  const flapR = slab([[w * 0.2, 0], [w / 2, 0], [0, h], [w * 0.16, h * 0.5]], 2.5, 0xe9dcc2, CLOTH); o.push(at(flapR, 0, 0, d / 2 + 3));
  const ang = Math.atan2(w / 2, h), len = Math.hypot(w / 2, h) + 16;
  for (const z of [d / 2 + 2, -d / 2 - 2]) for (const s of [-1, 1]) { const pole = cyl(2.6, 2.6, len, 0xb07a45, 7); pole.rotateZ(-s * ang); o.push(at(pole, -s * w / 2 - s * 1, 0, z)); }
  o.push(at(logZ(d + 14, 2.4, 0xb07a45, 0xe8c08a), 0, h + 1, 0));
  for (const s of [-1, 1]) o.push(at(cyl(2, 1.2, 9, 0x9a6a44, 6), s * (w / 2 + 12), 0, d / 2 - 6), at(cyl(2, 1.2, 9, 0x9a6a44, 6), s * (w / 2 + 12), 0, -d / 2 + 6));
  const body = merge(o); body.rotateY(0.5);                                   // opening turned a little to the side; the big canvas side catches the sun
  return { height: 92, parts: [{ geo: at(body, 0, 0, -d / 2), mat: 'painted', cast: true }], fixed: true };
}
function flameGeometry() {
  const tint = (geo, r, g, b) => { const n = geo.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set([r, g, b], i * 3); geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo; };
  const layer = (R, H, r, g, b, y0, z0 = 0) => {   // inner flames sit a little toward the camera so they show
    const pts = [[0.02, 0], [0.55, 0.1], [0.7, 0.3], [0.5, 0.58], [0.24, 0.82], [0.0, 1]].map(([x, y]) => new THREE.Vector2(x * R, y * H));
    const geo = clean(new THREE.LatheGeometry(pts, 10)); geo.translate(0, y0, z0);
    return tint(geo, r, g, b);
  };
  const parts = [layer(15, 44, 1.15, 0.3, 0.06, 8), layer(10, 33, 1.45, 0.8, 0.14, 8, 6), layer(5.5, 21, 1.7, 1.5, 0.75, 8, 11)];
  for (const [x, z, s] of [[-12, 4, 0.5], [11, -3, 0.42], [3, 12, 0.36]]) parts.push(layer(15 * s, 44 * s, 1.25, 0.45, 0.08, 6, 0).translate(x, 0, z));   // small side flames
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 4 + (i % 4) * 3.2; parts.push(tint(clean(new THREE.IcosahedronGeometry(2.6 + (i % 3), 0)).translate(Math.cos(a) * r, 3.4, Math.sin(a) * r), 1.5, 0.42, 0.06)); }   // glowing embers
  return mergeGeometries(parts);
}
function sparkGeometry() {
  const n = 16, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = i * 2.399, r = 2 + (i % 5) * 1.8; pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3); seed[i] = (i * 0.618) % 1; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  return g;
}
function campfire(rand, lit) {
  const o = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.2, g = rockGeometry(rand, { w: 15 + rand() * 7, h: 9 + rand() * 6, d: 13 + rand() * 5, cuts: 7 });
    const c = g.attributes.color; for (let k = 0; k < c.count; k++) c.setXYZ(k, c.getX(k) * 0.78, c.getY(k) * 0.8, c.getZ(k) * 0.9);   // greyer than the field rocks
    g.rotateY(rand() * 6.28); o.push(at(setKind(clean(g), STONE), Math.cos(a) * 25, 0, Math.sin(a) * 20));
  }
  for (let i = 0; i < 7; i++) { const a = rand() * 6.28, r = 30 + rand() * 6; o.push(at(ball(2 + rand() * 2, 0x9a958f, 1, 0.6, 1, 6, STONE), Math.cos(a) * r, 1, Math.sin(a) * r * 0.8)); }   // pebbles
  const bark = lit ? 0x6b4226 : 0x4a4442, end = lit ? 0xe2b074 : 0x77716c;
  for (let i = 0; i < 5; i++) {                                     // logs leaning together
    const l = cyl(4, 3.2, 30, bark, 8, end); l.rotateZ(0.62); l.translate(12, 1, 0); l.rotateY((i / 5) * 6.283 + 0.4);
    o.push(l);
  }
  for (let i = 0; i < 2; i++) { const l = logX(36, 3.6, mixHex(bark, 0x1a1210, 0.3), end); l.rotateY(i * 1.3 + 0.5); o.push(at(l, 0, 4, 0)); }
  o.push(at(ball(15, lit ? 0x2e221c : 0x5d5853, 1, 0.22, 0.85, 10), 0, 1.2, 0));                 // ash and charcoal
  if (!lit) for (let i = 0; i < 6; i++) o.push(at(ball(2.6, 0x3a3634, 1, 0.7, 1, 6), Math.cos(i * 1.1) * 7, 3, Math.sin(i * 1.1) * 6));
  const parts = [{ geo: merge(o), mat: 'painted', cast: true }];
  if (lit) parts.push({ geo: flameGeometry(), mat: 'flame' }, { geo: sparkGeometry(), mat: 'spark', points: true });
  return { height: 58, parts, fixed: true };
}
function lamp() {
  const o = [], glow = [];
  o.push(cyl(8, 6, 6, 0x4f3524, 10), at(cyl(3.2, 2.6, 66, 0x5b3d26, 8), 0, 5, 0), at(cyl(5, 4, 4, 0x4f3524, 8), 0, 69, 0));
  o.push(at(rbox(17, 2.5, 17, 0x4f3524, 1), 0, 73, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.push(at(rbox(2, 17, 2, 0x4f3524, 0.6), sx * 7, 82, sz * 7));
  const cap = P(new THREE.ConeGeometry(14, 9, 4), 0x4f3524); cap.rotateY(Math.PI / 4); o.push(at(cap, 0, 95, 0), at(ball(2.2, 0x4f3524), 0, 100, 0));
  glow.push(at(clean(new THREE.BoxGeometry(12.5, 16, 12.5)), 0, 82, 0));
  return { height: 96, parts: [{ geo: merge(o), mat: 'painted', cast: true }, { geo: merge(glow), mat: 'lampglow' }], fixed: true };
}
function fountain(rand) {
  const o = [], R = 56;
  const rim = new THREE.TorusGeometry(R, 9, 8, 28); rim.rotateX(Math.PI / 2); rim.scale(1, 1.25, 1); o.push(at(P(rim, 0xd6ccbc), 0, 9, 0));
  for (let i = 0; i < 14; i++) { const j = at(rbox(2.4, 13, 20, 0xb9b0a2, 1), 0, 9, R); j.rotateY((i / 14) * 6.283); o.push(j); }   // joints between the rim stones
  o.push(cyl(R - 4, R - 4, 5, 0x9fb4b4, 28));
  o.push(at(cyl(11, 8, 22, 0xd6ccbc, 12), 0, 4, 0), at(cyl(21, 9, 7, 0xcfc4b4, 16), 0, 25, 0), at(cyl(5, 4, 12, 0xd6ccbc, 10), 0, 31, 0));
  leaves(o, rand, 7, -R * 0.75, 15, R * 0.5, 22, 6, 22);
  leaves(o, rand, 5, R * 0.8, 15, R * 0.3, 16, 6, 16);
  const water = [];
  const pool = clean(new THREE.CylinderGeometry(R - 5, R - 5, 2, 28)); water.push(at(pool, 0, 11, 0));
  water.push(at(clean(new THREE.CylinderGeometry(18, 18, 2, 16)), 0, 32.5, 0));
  for (let i = 0; i < 7; i++) {   // arcs of water falling from the top
    const a = (i / 7) * 6.283, jet = clean(new THREE.SphereGeometry(1, 7, 6)); jet.scale(3, 13, 3); jet.rotateZ(0.5); jet.rotateY(a);
    water.push(at(jet, Math.cos(a) * 9, 46, -Math.sin(a) * 9));
  }
  const col = clean(new THREE.SphereGeometry(1, 8, 6)); col.scale(4.5, 16, 4.5); water.push(at(col, 0, 52, 0));
  const wg = merge(water); wg.computeVertexNormals();
  return { height: 110, parts: [{ geo: at(merge(o), 0, 0, -R * 0.82), mat: 'painted', cast: true }, { geo: at(wg, 0, 0, -R * 0.82), mat: 'fountain' }], fixed: true };
}
// wooden chest: body, round lid (open or shut), metal bands, lock
function chest({ w = 52, h = 26, d = 34, wood = 0xc9813f, band = 0x8a7f9a, open = false, leaf = false, height = 50 }) {
  const o = [];
  o.push(at(rbox(w, h, d, wood, 3), 0, h / 2, 0));
  const lid = [];
  const top = clean(new THREE.CylinderGeometry(d / 2, d / 2, w, 14, 1, false, 0, Math.PI)); top.rotateZ(Math.PI / 2); top.scale(1, 0.72, 1);
  lid.push(setKind(paint(top, mixHex(wood, 0xffffff, 0.08)), WOOD, [1, 0, 0]));
  for (const s of [-1, 0, 1]) { const b = clean(new THREE.CylinderGeometry(d / 2 + 1.2, d / 2 + 1.2, s ? 6 : 5, 14, 1, false, 0, Math.PI)); b.rotateZ(Math.PI / 2); b.scale(1, 0.74, 1); lid.push(at(setKind(paint(b, band), autoKind(band)), s * (w / 2 - 4), 0, 0)); }
  lid.push(at(rbox(w - 2, 2, d - 2, 0x7a4a2c, 0.8), 0, 0.5, 0));                          // underside (seen when open)
  const lg = merge(lid);
  if (open) { lg.translate(0, 0, d / 2); lg.rotateX(-1.25); lg.translate(0, 0, -d / 2); }
  o.push(at(lg, 0, h, 0));
  for (const s of [-1, 1]) o.push(at(rbox(6, h + 1, d + 2, band, 1.5), s * (w / 2 - 4), h / 2, 0));
  o.push(at(rbox(w + 2, 5, d + 2, band, 1.5), 0, h - 1, 0), at(rbox(9, 11, 3, 0xe9c35a, 1.5), 0, h - 3, d / 2 + 1.5));
  if (leaf) o.push(at(ball(6, 0x86c84a, 1.4, 0.8, 0.3), 0, h + d * 0.2, d * 0.42));
  if (open) o.push(at(rbox(w - 8, 3, d - 8, 0x4a2f1e, 1), 0, h - 1, 0), at(ball(6, 0xf2d06a, 1.6, 0.6, 1.2), 0, h, 0));
  return { height, parts: [{ geo: at(merge(o), 0, 0, -d / 2 - 2), mat: 'painted', cast: true }], fixed: true };
}
function crate(rand) {
  const o = [], w = 46, h = 40, d = 40;
  o.push(at(rbox(w, h, d, 0xcf8f4c, 2), 0, h / 2, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.push(at(rbox(7, h + 3, 7, 0xb9773f, 2), sx * (w / 2 - 2), h / 2, sz * (d / 2 - 2)));
  for (const y of [3, h - 2]) o.push(at(rbox(w + 3, 6, d + 3, 0xb9773f, 2), 0, y, 0));
  for (const s of [-1, 1]) { const x = rbox(Math.hypot(w, h) - 14, 5, 2, 0xb9773f, 1); x.rotateZ(s * Math.atan2(h, w)); o.push(at(x, 0, h / 2, d / 2 + 1)); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.push(at(rbox(8, 8, 8, 0x8a7f9a, 2), sx * (w / 2 - 1), h - 1, sz * (d / 2 - 1)));
  o.push(at(cyl(11, 13, 12, 0xd9a85c, 12), w * 0.42, 0, d * 0.5));                                 // basket of carrots
  for (let i = 0; i < 4; i++) o.push(at(ball(4, 0xe8743a, 1, 1.5, 1), w * 0.42 - 5 + (i % 2) * 9, 13, d * 0.5 - 4 + Math.floor(i / 2) * 7), at(ball(3, 0x7cc04a), w * 0.42 - 5 + (i % 2) * 9, 19, d * 0.5 - 4 + Math.floor(i / 2) * 7));
  void rand;
  return { height: 60, parts: [{ geo: at(merge(o), 0, 0, -d / 2 - 12), mat: 'painted', cast: true }], fixed: true };
}

// prototypes keyed by the game's texture keys
export function buildingProtos(seed = 7) {
  const rand = rng(seed);
  return {
    bld_cottage: [cottage(rand)],
    bld_shop_granny: [shop(rand)],
    bld_workshop: [workshop(rand)],
    bld_lab: [lab(rand)],
    tent: [tent()],
    campfire_lit: [campfire(rand, true)],
    campfire_out: [campfire(rand, false)],
    lamp: [lamp()],
    fountain: [fountain(rand)],
    storage: [chest({ w: 54, h: 28, d: 36, leaf: true, height: 56 })],
    chest: [chest({ w: 48, h: 22, d: 30, wood: 0xb8693a, band: 0xd9b45a, height: 50 })],
    chest_open: [chest({ w: 48, h: 22, d: 30, wood: 0xb8693a, band: 0xd9b45a, height: 50, open: true })],
    shipbox: [crate(rand)],
  };
}
