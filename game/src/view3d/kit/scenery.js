// More 3D pieces of the map (docs/14), generated in code after the 2D art:
// the pier, the airship, the rope bridges (whole and broken), the seed stall,
// thorn bushes, the lost backpack. And the little life in the air: petals by
// day, fireflies at night.
import * as THREE from 'three';
import { TIME, rng } from './shared.js';
import { rbox, at, ball, cyl, P, merge, clean, mixHex, PLAIN, CLOTH, WOOD } from './buildings.js';

const WOODC = 0xc98a4e, WOOD_D = 0x9a6238, ROPE = 0xe2c58a;
const solid = (o) => ({ geo: merge(o), mat: 'painted', cast: true });
// thin round bar between two points (ropes, rails)
function bar(a, b, r, color) {
  const d = new THREE.Vector3().subVectors(b, a), g = cyl(r, r, d.length(), color, 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  return at(g, a.x, a.y, a.z);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// pier reaching out over the clouds (the sprite's foot is its far end; the island edge is ~36 behind it)
function dock(rand) {
  const o = [], glow = [], cx = 20, Y = 16, z0 = -100, z1 = 6;
  for (let z = z0, i = 0; z < z1; z += 9.6, i++) o.push(at(rbox(66 + (i % 3) * 2, 4, 9, mixHex(WOODC, i % 2 ? 0xd9a05c : 0xb9773f, 0.6), 1.2), cx + (rand() - 0.5) * 2, Y, z + 4.8));
  for (const s of [-1, 1]) o.push(at(rbox(6, 6, z1 - z0, WOOD_D, 2), cx + s * 26, Y - 5, (z0 + z1) / 2));
  for (const [x, z] of [[-34, -60], [34, -60], [-34, -8], [34, -8], [-34, -34]]) {
    o.push(at(cyl(4.4, 4, 62, WOOD_D, 8, 0xe2b074), cx + x, Y - 40, z));
    for (const y of [Y + 12, Y + 15]) { const t = new THREE.TorusGeometry(4.8, 1.3, 5, 10); t.rotateX(Math.PI / 2); o.push(at(P(t, ROPE, PLAIN), cx + x, y, z)); }
  }
  for (const s of [-1, 1]) o.push(bar(V(cx + s * 34, Y + 16, -60), V(cx + s * 34, Y + 13, -34), 1.1, ROPE), bar(V(cx + s * 34, Y + 13, -34), V(cx + s * 34, Y + 16, -8), 1.1, ROPE));
  // lamp post at the end, a coil of rope, a crate
  o.push(at(cyl(2.6, 2.2, 56, 0x5b3d26, 8), cx + 30, Y, 2), at(rbox(18, 3, 3, 0x5b3d26, 1), cx + 22, Y + 54, 2), at(rbox(9, 2, 9, 0x4f3524, 0.8), cx + 15, Y + 51, 2), at(rbox(9, 2, 9, 0x4f3524, 0.8), cx + 15, Y + 38, 2));
  glow.push(at(clean(new THREE.BoxGeometry(7, 11, 7)), cx + 15, Y + 44.5, 2));
  const coil = new THREE.TorusGeometry(8, 2.6, 6, 14); coil.rotateX(Math.PI / 2); o.push(at(P(coil, ROPE, PLAIN), cx - 18, Y + 4, -20), at(P(coil.clone(), ROPE, PLAIN), cx - 18, Y + 8, -20));
  o.push(at(rbox(18, 16, 18, 0xcf8f4c, 2), cx - 16, Y + 10, -76));
  return { height: 90, parts: [solid(o), { geo: merge(glow), mat: 'lampglow' }], fixed: true, scale1: true };
}

function airship(rand) {
  const o = [], glow = [];
  // balloon: cream and yellow stripes running nose to tail
  const bal = clean(new THREE.SphereGeometry(1, 28, 18)); bal.rotateZ(Math.PI / 2); bal.scale(74, 40, 40);
  const bp = bal.attributes.position, col = new Float32Array(bp.count * 3), c1 = new THREE.Color(0xfbf1dc), c2 = new THREE.Color(0xf5c84b);
  for (let i = 0; i < bp.count; i++) { const a = Math.atan2(bp.getZ(i), bp.getY(i)), c = Math.floor((a / Math.PI + 1) * 5) % 2 ? c1 : c2; col.set([c.r, c.g, c.b], i * 3); }
  bal.setAttribute('color', new THREE.BufferAttribute(col, 3));
  o.push(at(P(bal, 0xffffff, CLOTH).setAttribute('color', new THREE.BufferAttribute(col, 3)), 0, 104, 0));
  o.push(at(ball(1, 0xb9773f, 10, 12, 12, 10), 74, 104, 0));                                               // nose cap
  for (const [ry, rz] of [[0, 0.5], [0, -0.5], [1.57, 0]]) { const fin = rbox(30, 26, 3, 0xf5c84b, 2, CLOTH); fin.translate(-14, 0, 0); fin.rotateX(ry); fin.rotateZ(rz); o.push(at(fin, -64, 104, 0)); }
  // gondola: a little wooden boat hanging under it
  const hull = clean(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)); hull.scale(38, 20, 17);
  o.push(at(P(hull, WOODC, WOOD), 0, 46, 0), at(rbox(72, 4, 32, WOOD_D, 2), 0, 46, 0), at(rbox(66, 3, 26, 0xd9a05c, 1.5), 0, 48.5, 0));
  for (const y of [38, 31]) { const band = new THREE.TorusGeometry(1, 0.05, 5, 24); band.rotateX(Math.PI / 2); band.scale(36 - (46 - y) * 0.7, 1, 16 - (46 - y) * 0.35); o.push(at(P(band, 0x7a4a2c, PLAIN), 0, y, 0)); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.push(bar(V(sx * 28, 48, sz * 12), V(sx * 40, 76, sz * 20), 0.9, ROPE));
  for (let i = 0; i < 4; i++) { const net = new THREE.TorusGeometry(1, 0.03, 4, 20); net.scale(30 + i * 3, 30 + i * 3, 40); net.rotateY(Math.PI / 2); o.push(at(P(net, ROPE, PLAIN), -36 + i * 24, 104, 0)); }   // rope net over the balloon
  for (let i = 0; i < 3; i++) { const blade = rbox(4, 22, 2, 0xe2b074, 1.5); blade.translate(0, 11, 0); blade.rotateX(i * 2.094); o.push(at(blade, -40, 40, 0)); }   // propeller
  o.push(at(cyl(3, 3, 6, 0x7a4a2c, 8).rotateZ(Math.PI / 2), -37, 40, 0));
  for (const s of [-1, 1]) for (const x of [-14, 4, 22]) { const w = clean(new THREE.CylinderGeometry(3.4, 3.4, 1.5, 10)); w.rotateX(Math.PI / 2); glow.push(at(w, x, 39, s * 14.4)); }   // portholes
  o.push(at(rbox(3, 14, 3, 0x5b3d26, 1), 36, 55, 0)); glow.push(at(clean(new THREE.BoxGeometry(6, 8, 6)), 36, 64, 0));
  void rand;
  return { height: 150, parts: [solid(o), { geo: merge(glow), mat: 'lampglow' }], fixed: true, scale1: true, hover: 34 };
}

// rope bridge along x (150 long): planks sag a little, rope rails; broken = planks missing in the middle
function bridge(rand, kind) {
  const o = [], L = 150, n = 15, Y = 8;
  const sag = (t) => -7 * Math.sin(Math.PI * t);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, gone = kind === 'broken' && t > 0.36 && t < 0.72;
    if (gone && i % 3 !== 0) continue;
    const plank = rbox(8.6, 3.4, 36, mixHex(WOODC, i % 2 ? 0xd9a05c : 0xb9773f, 0.6 + rand() * 0.3), 1.2);
    if (gone) { plank.rotateX(0.9); plank.rotateZ(0.5); plank.translate(0, -12, 6); }
    else plank.rotateZ(Math.cos(Math.PI * t) * 0.14);
    o.push(at(plank, -L / 2 + t * L, Y + sag(t), 0));
  }
  for (const s of [-1, 1]) {
    for (const x of [-L / 2, L / 2]) o.push(at(cyl(3.8, 3.4, 34, WOOD_D, 8, 0xe2b074), x, Y - 8, s * 19));
    const sturdy = kind === 'fixed';
    for (let i = 0; i < 10; i++) {
      const t0 = i / 10, t1 = (i + 1) / 10;
      if (kind === 'broken' && t0 > 0.4 && t1 < 0.68) continue;
      o.push(bar(V(-L / 2 + t0 * L, Y + 22 + sag(t0) * 1.3, s * 19), V(-L / 2 + t1 * L, Y + 22 + sag(t1) * 1.3, s * 19), sturdy ? 1.9 : 1.2, sturdy ? WOOD_D : ROPE));
      o.push(bar(V(-L / 2 + t0 * L, Y - 1 + sag(t0), s * 18.5), V(-L / 2 + t1 * L, Y - 1 + sag(t1), s * 18.5), 1.3, ROPE));
      if (i > 0) o.push(bar(V(-L / 2 + t0 * L, Y + sag(t0), s * 18.5), V(-L / 2 + t0 * L, Y + 22 + sag(t0) * 1.3, s * 19), 0.8, ROPE));
    }
  }
  return { height: 100, parts: [solid(o)], fixed: true, scale1: true, spin: true };
}

function seedstand() {
  const o = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.push(at(cyl(2.6, 2.4, 56, WOOD_D, 7), sx * 30, 0, sz * 12));
  o.push(at(rbox(70, 4, 30, WOODC, 2), 0, 24, 0), at(rbox(66, 3, 26, WOOD_D, 1.5), 0, 8, 0));
  for (let i = 0; i < 8; i++) { const s = rbox(9.2, 3, 40, i % 2 ? 0xfff4ec : 0xef8f98, 1.2, CLOTH); s.rotateX(0.35); o.push(at(s, -32 + (i + 0.5) * 8.1, 58, 4), at(ball(4.6, i % 2 ? 0xfff4ec : 0xef8f98, 1, 1, 0.5, 8), -32 + (i + 0.5) * 8.1, 49, 22)); }
  for (const [x, c, top] of [[-20, 0xe9dcc2, 0x8fd058], [0, 0xd9e8b4, 0xf5c84b], [20, 0xf2c8d0, 0xe8743a]]) o.push(at(ball(1, c, 9, 9, 8, 10, CLOTH), x, 34, 0), at(ball(1, top, 6, 2.6, 5), x, 42, 0));   // sacks of seed
  return { height: 66, parts: [solid(o)], fixed: true, scale1: true };
}

function thorn(rand) {
  const o = [];
  for (let i = 0; i < 9; i++) {
    const arc = new THREE.TorusGeometry(14 + rand() * 10, 1.8, 5, 12, 2.2 + rand()); arc.rotateY(rand() * 6.28); arc.rotateX((rand() - 0.5) * 0.9);
    o.push(at(P(arc, i % 2 ? 0x4f7a3a : 0x3f6a34, PLAIN), (rand() - 0.5) * 16, 2, (rand() - 0.5) * 10));
  }
  for (let i = 0; i < 26; i++) {
    const a = rand() * 6.28, r = 8 + rand() * 18, sp = P(new THREE.ConeGeometry(1.5, 7, 5), 0xa8405a, PLAIN);
    sp.rotateZ((rand() - 0.5) * 2); sp.rotateY(rand() * 6.28);
    o.push(at(sp, Math.cos(a) * r, 6 + rand() * 20, Math.sin(a) * r * 0.6));
  }
  for (let i = 0; i < 8; i++) o.push(at(ball(1, 0x6fa544, 5, 1.2, 3.4, 6).rotateY(rand() * 6.28), (rand() - 0.5) * 40, 8 + rand() * 18, (rand() - 0.5) * 20));
  return { height: 44, parts: [solid(o)], fixed: true, scale1: true };
}

function lostbag() {
  const o = [at(rbox(34, 34, 22, 0xb9773f, 7), 0, 18, 0), at(rbox(36, 14, 24, 0x9a6238, 6), 0, 30, 0), at(rbox(22, 12, 5, 0xc98a4e, 3), 0, 13, 12), at(rbox(6, 7, 3, 0xf2c23e, 1.5), 0, 24, 13)];
  for (const s of [-1, 1]) o.push(at(rbox(5, 30, 4, 0x7a4a2c, 2), s * 11, 18, -12));
  const roll = cyl(6, 6, 32, 0xe9dcc2, 10).rotateZ(Math.PI / 2); o.push(at(roll, 16, 40, 0));
  return { height: 56, parts: [solid(o)], fixed: true, scale1: true };
}

export function sceneryProtos(seed = 17) {
  const rand = rng(seed);
  return { dock: [dock(rand)], airship: [airship(rand)], bridge_rope: [bridge(rand, 'rope')], bridge_fixed: [bridge(rand, 'fixed')], bridge_broken: [bridge(rand, 'broken')],
    seedstand: [seedstand()], thorn: [thorn(rand), thorn(rand)], lostbag: [lostbag()] };
}

// Petals drifting by day, fireflies at night: a handful of soft dots that stay around the camera.
export function buildLife(count = 46) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count), rand = rng(99);
  for (let i = 0; i < count; i++) { pos.set([rand() * 1000, 14 + rand() * 80, rand() * 700], i * 3); seed[i] = rand(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: TIME, uCenter: { value: new THREE.Vector3() }, uNight: { value: 0 }, uScale: { value: 1 } },
    vertexShader: `uniform float uTime, uNight, uScale; uniform vec3 uCenter; attribute float aSeed; varying float vA; varying vec3 vC;
      void main() {
        vec3 p = position;
        float sp = mix(1.0, 0.35, uNight);
        p.x += uTime * (10.0 + aSeed * 14.0) * sp + sin(uTime * (0.7 + aSeed) + aSeed * 30.0) * 26.0;
        p.z += sin(uTime * (0.5 + aSeed * 0.6) + aSeed * 17.0) * 34.0;
        p.y += sin(uTime * (1.1 + aSeed) + aSeed * 9.0) * 9.0;
        p.xz = mod(p.xz - uCenter.xz + vec2(500.0, 350.0), vec2(1000.0, 700.0)) - vec2(500.0, 350.0) + uCenter.xz;   // stay around the camera
        p.y += uCenter.y;
        float blink = 0.55 + 0.45 * sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 40.0);
        vA = mix(0.85, blink, uNight);
        vec3 day = aSeed < 0.4 ? vec3(1.0, 0.98, 0.94) : aSeed < 0.75 ? vec3(1.0, 0.76, 0.84) : vec3(1.0, 0.9, 0.45);
        vC = mix(day, vec3(1.5, 1.7, 0.55), uNight);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (3.0 + aSeed * 2.5 + uNight * 2.0) * uScale * 500.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: 'varying float vA; varying vec3 vC; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.2, d)); }',
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false; points.renderOrder = 6;
  return { points, set(center, night, scale) { mat.uniforms.uCenter.value.copy(center); mat.uniforms.uNight.value = night; mat.uniforms.uScale.value = scale; }, dispose() { g.dispose(); mat.dispose(); } };
}
