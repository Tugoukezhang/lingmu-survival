// Procedural nature for the 3D look test (docs/14): rounded boulders, big-leaf
// plants, daisies, clover, grass tufts and tiny flowers. Everything is real
// geometry with vertex colours, made in code (no model files).
import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const col = (hex) => new THREE.Color(hex);
function paint(geo, color) {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3), k = col(color);
  for (let i = 0; i < n; i++) { c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
function strip(geo) {   // keep only what mergeGeometries needs in common
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(k)) geo.deleteAttribute(k);
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  return geo.index ? geo.toNonIndexed() : geo;
}

// ---------- boulder ----------
export function rockGeometry(rand, { w = 2, h = 1.1, d = 1.6, color = 0xd59c62 } = {}) {
  let g = new THREE.IcosahedronGeometry(1, 6);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);                       // shared vertices → smooth, rounded shading
  const n = new SimplexNoise({ random: rand });
  const p = g.attributes.position, v = new THREE.Vector3();
  const base = col(color), top = base.clone().offsetHSL(0.005, -0.06, 0.09), low = base.clone().offsetHSL(-0.015, 0.06, -0.16);
  const c = new Float32Array(p.count * 3), tmp = new THREE.Color();
  const sx = rand() * 9, sz = rand() * 9;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // soft "pebble" shape: a bit boxy, flat underside
    v.set(Math.sign(v.x) * Math.abs(v.x) ** 0.74, Math.sign(v.y) * Math.abs(v.y) ** 0.8, Math.sign(v.z) * Math.abs(v.z) ** 0.74);   // slightly boxy pebble
    const k = 1 + 0.13 * n.noise3d(v.x * 0.7 + sx, v.y * 0.7, v.z * 0.7 + sz) + 0.018 * n.noise3d(v.x * 2.6 + sx, v.y * 2.6, v.z * 2.6);
    v.multiplyScalar(k);
    if (v.y < 0) v.y *= 0.25;
    const t = Math.min(1, Math.max(0, (v.y + 0.1) / 1.1));
    tmp.copy(low).lerp(base, Math.min(1, t * 1.6)).lerp(top, Math.max(0, t - 0.55) * 1.6);
    tmp.offsetHSL(0, 0, 0.05 * n.noise3d(v.x * 5, v.y * 5, v.z * 5) + 0.025 * n.noise3d(v.x * 17, v.y * 17, v.z * 17));
    c.set([tmp.r, tmp.g, tmp.b], i * 3);
    p.setXYZ(i, v.x * w / 2, v.y * h, v.z * d / 2);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- leaves ----------
// One leaf from the stem (origin) along +z: width profile, arch and droop, cupped sideways.
function leafGeometry({ len = 1, width = 0.55, arch = 0.25, droop = 0.35, cup = 0.12, segL = 10, segW = 4, tip = 0.9 } = {}) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= segL; j++) {
    const t = j / segL;
    const w = width * Math.sin(Math.PI * Math.min(1, t ** 0.75)) ** 0.9 * (t > tip ? (1 - t) / (1 - tip) * Math.sin(Math.PI * tip ** 0.75) ** 0.9 / Math.sin(Math.PI * tip ** 0.75) ** 0.9 : 1);
    const y = arch * Math.sin(Math.PI * t * 0.9) - droop * t * t;
    for (let i = 0; i <= segW; i++) {
      const u = i / segW - 0.5;
      pos.push(u * w, y - cup * (u * 2) ** 2 * (w / width), t * len);
      uv.push(u + 0.5, t);
    }
  }
  for (let j = 0; j < segL; j++) for (let i = 0; i < segW; i++) {
    const a = j * (segW + 1) + i, b = a + segW + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let leafTex = null;
export function leafTexture() {
  if (leafTex) return leafTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#5fa62c'); grd.addColorStop(0.35, '#96d443'); grd.addColorStop(1, '#b4e05a');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 512);
  const rg = g.createRadialGradient(128, 300, 10, 128, 300, 200); rg.addColorStop(0, 'rgba(230,250,150,0.35)'); rg.addColorStop(1, 'rgba(230,250,150,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 512);
  g.strokeStyle = 'rgba(225,245,150,0.85)'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 500); g.stroke();
  g.lineWidth = 3.5; g.strokeStyle = 'rgba(220,242,150,0.6)';
  for (let k = 1; k < 8; k++) {
    const y = k * 58;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128, y); g.quadraticCurveTo(128 + s * 60, y + 30, 128 + s * 125, y + 70); g.stroke(); }
  }
  // soft darker rim
  const eg = g.createLinearGradient(0, 0, 256, 0);
  eg.addColorStop(0, 'rgba(40,90,20,0.35)'); eg.addColorStop(0.18, 'rgba(40,90,20,0)'); eg.addColorStop(0.82, 'rgba(40,90,20,0)'); eg.addColorStop(1, 'rgba(40,90,20,0.35)');
  g.fillStyle = eg; g.fillRect(0, 0, 256, 512);
  leafTex = new THREE.CanvasTexture(c); leafTex.colorSpace = THREE.SRGBColorSpace; leafTex.anisotropy = 8;
  return leafTex;
}

// Big-leaf plant: n broad leaves on short stems around the base.
export function bigLeafPlant(rand, { size = 1.6, n = 7 } = {}) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const len = size * (0.65 + rand() * 0.45);
    const leaf = leafGeometry({ len, width: len * (0.85 + rand() * 0.2), arch: len * 0.26, droop: len * (0.22 + rand() * 0.22), cup: len * 0.1, tip: 0.8 });
    const stemLen = size * (0.15 + rand() * 0.35);
    leaf.rotateX(-(0.35 + rand() * 0.55));
    leaf.translate(0, stemLen, 0);
    leaf.rotateY((i / n) * Math.PI * 2 + rand() * 0.6);
    parts.push(leaf);
  }
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('normal'); return p; }));
  g.computeVertexNormals();
  return g;
}

// ---------- daisy ----------
export function daisyGeometry(rand, { h = 1.8, head = 0.42 } = {}) {
  const parts = [];
  const bend = new THREE.Vector3((rand() - 0.5) * 0.25, 0, 0.12 + rand() * 0.1);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(bend.x * 0.4, h * 0.5, bend.z * 0.3), new THREE.Vector3(bend.x, h, bend.z));
  parts.push(paint(strip(new THREE.TubeGeometry(curve, 8, 0.028 * h, 6)), 0x7dbb3a));
  for (let k = 0; k < 3; k++) {   // leaves at the foot of the stem
    const l = leafGeometry({ len: h * 0.32, width: h * 0.1, arch: 0.05, droop: 0.08, cup: 0.02, segL: 6, segW: 2 });
    l.rotateX(-0.6).rotateY(k * 2.1 + rand()).translate(0, h * 0.05, 0);
    parts.push(paint(strip(l), 0x6faa34));
  }
  const top = new THREE.Group();
  const center = new THREE.SphereGeometry(head * 0.32, 14, 8); center.scale(1, 0.45, 1); center.translate(0, head * 0.06, 0);
  const petals = [];
  const np = 14;
  for (let i = 0; i < np; i++) {
    const p = leafGeometry({ len: head, width: head * 0.38, arch: head * 0.06, droop: head * 0.12, cup: -head * 0.05, segL: 6, segW: 2, tip: 0.8 });
    p.rotateY((i / np) * Math.PI * 2);
    petals.push(paint(strip(p), 0xfdfbf2));
  }
  const headGeo = mergeGeometries([paint(strip(center), 0xf4c42e), ...petals]);
  headGeo.rotateX(0.35 + rand() * 0.25);           // flower faces up and a bit toward the camera
  headGeo.translate(bend.x, h, bend.z);
  parts.push(headGeo);
  void top;
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

// ---------- small ground cover ----------
export function cloverGeometry() {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const leaf = new THREE.CircleGeometry(0.09, 12);
    leaf.scale(1, 1.15, 1); leaf.rotateX(-Math.PI / 2 + 0.25); leaf.translate(0, 0.11, 0.075);
    leaf.rotateY(k * 2.094);
    parts.push(paint(strip(leaf), k === 0 ? 0xa3d84c : 0x92cf44));
  }
  const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.11, 4); stem.translate(0, 0.055, 0);
  parts.push(paint(strip(stem), 0x5f9a2c));
  return mergeGeometries(parts);
}

export function tuftGeometry(rand) {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const hgt = 0.14 + rand() * 0.14;
    const b = new THREE.ConeGeometry(0.03, hgt, 3, 1, true); b.translate(0, hgt / 2, 0);
    b.rotateZ((rand() - 0.5) * 0.7).rotateX((rand() - 0.5) * 0.7).translate((rand() - 0.5) * 0.12, 0, (rand() - 0.5) * 0.12);
    parts.push(paint(strip(b), rand() < 0.5 ? 0x9fd44a : 0x8cc841));
  }
  return mergeGeometries(parts);
}

export function smallFlowerGeometry(color) {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.CircleGeometry(0.035, 8); p.scale(1, 1.4, 1); p.translate(0, 0.04, 0); p.rotateX(-Math.PI / 2 + 0.3);
    p.rotateY((i / 5) * Math.PI * 2); p.translate(0, 0.14, 0);
    parts.push(paint(strip(p), color));
  }
  const c = new THREE.SphereGeometry(0.022, 8, 5); c.translate(0, 0.15, 0); parts.push(paint(strip(c), 0xf2c230));
  const s = new THREE.CylinderGeometry(0.006, 0.008, 0.14, 4); s.translate(0, 0.07, 0); parts.push(paint(strip(s), 0x5f9a2c));
  return mergeGeometries(parts);
}
