// The cottage room in 3D (docs/14): plank floor, three walls with wainscot
// (the front wall is left out, like a doll's house), window with a patch of
// daylight on the floor, door mat, the "decorate" board. Furniture, the bed,
// the player and the pets are placed by World3D from the 2D scene as usual.
// Room coordinates are the 2D map's: x → x, y → z; the floor is y = 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './shared.js';
import { rbox, at } from './buildings.js';

const WALL_H = 150, T = 14;       // wall height and thickness

function floorTexture(w, h, seed) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), rand = rng(seed);
  g.fillStyle = '#c69660'; g.fillRect(0, 0, w, h);
  for (let y = 0, row = 0; y < h; y += 24, row++) {
    let x = -rand() * 90;
    while (x < w) {
      const len = 90 + rand() * 80, v = (rand() - 0.5) * 22;
      g.fillStyle = `rgb(${198 + v},${150 + v * 0.9},${96 + v * 0.7})`;
      g.fillRect(x, y, len, 24);
      g.strokeStyle = 'rgba(120,80,40,0.18)'; g.lineWidth = 1;               // grain
      for (let k = 0; k < 3; k++) { const gy = y + 4 + rand() * 16; g.beginPath(); g.moveTo(x + 4, gy); g.bezierCurveTo(x + len * 0.3, gy + (rand() - 0.5) * 5, x + len * 0.7, gy + (rand() - 0.5) * 5, x + len - 4, gy); g.stroke(); }
      g.fillStyle = 'rgba(96,60,30,0.55)'; g.fillRect(x + len - 1.5, y, 2, 24);                          // plank end
      g.fillStyle = 'rgba(70,44,24,0.5)'; g.fillRect(x + len - 7, y + 5, 2, 2); g.fillRect(x + len - 7, y + 17, 2, 2);   // nails
      x += len;
    }
    g.fillStyle = 'rgba(96,60,30,0.6)'; g.fillRect(0, y, w, 1.6);
    g.fillStyle = 'rgba(255,236,190,0.22)'; g.fillRect(0, y + 1.6, w, 1.4);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function wallTexture(seed) {
  const w = 512, h = 300, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), rand = rng(seed);
  g.fillStyle = '#eedcb8'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { g.fillStyle = (x / 32) % 2 ? 'rgba(226,204,160,0.55)' : 'rgba(250,238,208,0.5)'; g.fillRect(x, 0, 32, h); }   // soft stripes
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(214,150,140,0.35)'; g.beginPath(); g.arc(16 + Math.floor(rand() * 16) * 32, 20 + rand() * 150, 3, 0, Math.PI * 2); g.fill(); }  // tiny flowers
  const wy = h * 0.62;                                                       // wainscot: wooden panels on the lower wall
  g.fillStyle = '#c08a52'; g.fillRect(0, wy, w, h - wy);
  for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(96,60,30,0.5)'; g.fillRect(x, wy, 2, h - wy); g.fillStyle = 'rgba(255,230,180,0.18)'; g.fillRect(x + 8, wy + 16, 48, h - wy - 40); }
  g.fillStyle = '#a8703f'; g.fillRect(0, wy - 5, w, 10); g.fillRect(0, h - 16, w, 16);
  g.fillStyle = 'rgba(255,236,190,0.35)'; g.fillRect(0, wy - 5, w, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping;
  return t;
}

// fx, fy, fw, fh: the floor rectangle on the 2D map (px). mat / board / win: x positions (px) along the walls.
export function buildRoom({ fx, fy, fw, fh, doorX, boardX, windowX, seed = 5 }) {
  const group = new THREE.Group();
  const tex = [];
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.9 });
  // floor: a thick slab, so the open front shows its edge
  const ft = floorTexture(fw, fh, seed); tex.push(ft);
  const floorTop = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.82 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(fw + T * 2, 16, fh + T), [wood, wood, floorTop, wood, wood, wood]);
  ft.repeat.set((fw + T * 2) / fw, (fh + T) / fh); ft.offset.set(-T / fw, 0);       // the planks cover the floor, not the strip under the walls
  floor.position.set(fx + fw / 2, -8, fy + fh / 2 - T / 2);
  floor.receiveShadow = true;
  group.add(floor);
  // walls
  const wall = (len, x, z, ry) => {
    const t = wallTexture(seed + len); t.repeat.set(len / 512, 1); tex.push(t);
    const face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, WALL_H, T), [wood, wood, wood, wood, face, wood]);
    m.position.set(x, WALL_H / 2, z); m.rotation.y = ry;
    m.receiveShadow = true; m.castShadow = true;
    group.add(m);
  };
  wall(fw + T * 2, fx + fw / 2, fy - T / 2, 0);                       // back
  wall(fh, fx - T / 2, fy + fh / 2, Math.PI / 2);                     // left (its face looks +x)
  wall(fh, fx + fw + T / 2, fy + fh / 2, -Math.PI / 2);               // right
  // window, board, mat, skirting details: one painted mesh
  const o = [];
  const wz = fy + 1;
  o.push(at(rbox(84, 8, 8, 0xa8703f, 2), windowX, 62, wz + 3), at(rbox(84, 7, 6, 0xa8703f, 2), windowX, 122, wz + 2));
  for (const s of [-1, 1]) o.push(at(rbox(7, 62, 6, 0xa8703f, 2), windowX + s * 38, 92, wz + 2));
  o.push(at(rbox(4, 56, 4, 0xb98250, 1), windowX, 92, wz + 2), at(rbox(72, 4, 4, 0xb98250, 1), windowX, 92, wz + 2));
  for (const s of [-1, 1]) { const curtain = rbox(20, 60, 5, 0xf2a0a8, 2.5); o.push(at(curtain, windowX + s * 30, 94, wz + 6)); }
  o.push(at(rbox(96, 4, 5, 0x8a5a36, 1.5), windowX, 127, wz + 6));
  o.push(at(rbox(108, 36, 5, 0xb07a45, 4), boardX, 80, wz + 2), at(rbox(96, 26, 2, 0x8a5a36, 3), boardX, 80, wz + 5));       // decorate board
  o.push(at(rbox(100, 3, 30, 0x8a5a36, 1.5), doorX, 1.5, fy + fh - 17), at(rbox(86, 1.2, 20, 0xc08a52, 0.6), doorX, 3, fy + fh - 17));   // door mat
  const deco = new THREE.Mesh(mergeGeometries(o), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  deco.castShadow = true; deco.receiveShadow = true;
  group.add(deco);
  // glass: sky by day, dark at night
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(70, 54), new THREE.MeshBasicMaterial({ color: 0xbfe6f5 }));
  glass.position.set(windowX, 92, wz + 0.6);
  group.add(glass);
  // patch of daylight falling from the window onto the floor
  const lc = document.createElement('canvas'); lc.width = 128; lc.height = 128;
  const lg = lc.getContext('2d'), grd = lg.createRadialGradient(64, 64, 6, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,244,200,0.55)'); grd.addColorStop(1, 'rgba(255,244,200,0)');
  lg.fillStyle = grd; lg.fillRect(0, 0, 128, 128);
  const lt = new THREE.CanvasTexture(lc); tex.push(lt);
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(200, 250).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: lt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.set(windowX - 46, 0.6, fy + 150); beam.rotation.y = 0.35; beam.renderOrder = 1;
  group.add(beam);

  return { group, fx, fy, fw, fh, wallY: 80, wallZ: wz + 8,
    // day: 1 at noon … 0 at night
    setDay(day) { glass.material.color.set(0x2a3558).lerp(new THREE.Color(0xbfe6f5), day); beam.material.opacity = day; },
    dispose() { for (const t of tex) t.dispose(); group.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); for (const x of [].concat(m.material)) x.dispose(); } }); } };
}
