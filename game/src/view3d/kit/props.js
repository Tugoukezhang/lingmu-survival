// Furniture and crops of the 3D map kit (docs/14), generated in code after the
// game's 2D art (assets/furniture, assets/crops). Each model is centred on the
// middle of the cells it stands on; World3D puts it there (and turns furniture
// a quarter when the player rotated it).
import * as THREE from 'three';
import { rng } from './shared.js';
import { rbox, at, ball, cyl, P, merge, clean, mixHex, PLAIN, CLOTH, WOOD } from './buildings.js';

const WOODC = 0xd9a05c, WOOD_D = 0xb9773f, GREEN = 0x7cc04a, GREEN_D = 0x5fa23c;
const solid = (o) => ({ geo: merge(o), mat: 'painted', cast: true });
// foot: how many cells wide the piece is (it is one cell deep); dz: where the middle is from the sprite's position
const furn = (parts, foot = 1) => ({ height: 60, parts, fixed: true, scale1: true, foot });
const crop = (o, glow) => ({ height: 40, parts: glow ? [solid(o), { geo: merge(glow), mat: 'glow' }] : [solid(o)], fixed: true, scale1: true, dz: -20 });
// a leaf: flattened ball, lifted and tilted outward, turned around the stem
function leaf(len, wid, color, tilt, turn, y = 0, out = 0) {
  const g = ball(1, color, len / 2, 0.9, wid / 2, 7); g.translate(len / 2 + out, 0, 0); g.rotateZ(tilt); g.rotateY(turn); g.translate(0, y, 0);
  return g;
}

// ---------- furniture ----------
function chair() {
  const o = [at(rbox(26, 4, 24, WOODC, 2), 0, 20, 2)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.push(at(rbox(4, sz < 0 ? 46 : 20, 4, WOOD_D, 1.2), sx * 10, sz < 0 ? 23 : 10, 2 + sz * 9));
  o.push(at(rbox(24, 16, 3, WOODC, 2.5), 0, 38, -7), at(ball(5, 0xf2a0a8, 1, 1, 0.3), 0, 39, -5));       // back rest with a little heart-pink boss
  o.push(at(rbox(22, 3, 20, 0xf3d9a4, 1.5, CLOTH), 0, 23, 2));                                              // cushion
  return furn([solid(o)]);
}
function table() {
  const o = [at(rbox(86, 5, 40, WOODC, 2.5), 0, 28, 0), at(rbox(78, 4, 32, WOOD_D, 1.5), 0, 24, 0)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.push(at(rbox(6, 24, 6, WOOD_D, 2), sx * 36, 12, sz * 14));
  o.push(at(rbox(34, 1.2, 22, 0xf7edd6, 0.6, CLOTH), -10, 31, 0), at(ball(3, 0xf8cf48, 1, 0.4, 1), -10, 32, 0));                     // place mat with a flower
  o.push(at(cyl(4.6, 3.8, 6, 0xfdf6ea, 10), 22, 30.5, -2), at(cyl(6.5, 6.5, 1, 0xf2e3c8, 10), 22, 30.5, -2), at(cyl(3.6, 3.6, 0.6, 0xc98a4e, 8), 22, 36, -2));   // cup of tea on a saucer
  return furn([solid(o)], 2);
}
function plant(rand) {
  const o = [cyl(9, 12.5, 16, 0xc9744a, 12), at(cyl(13.5, 13.5, 4, 0xd98458, 12), 0, 14, 0), at(cyl(11, 11, 1, 0x5a3a26, 10), 0, 17.4, 0)];
  for (let i = 0; i < 9; i++) {
    const turn = i * 2.4, h = 22 + rand() * 20, lean = 0.25 + rand() * 0.4;
    const stem = cyl(0.9, 0.7, h - 16, GREEN_D, 5); stem.rotateZ(-lean * 0.6); stem.rotateY(turn); o.push(at(stem, 0, 17, 0));
    const pad = ball(1, i % 2 ? GREEN : 0x92d055, 8 + rand() * 3, 1.3, 8 + rand() * 3, 9); pad.rotateZ(0.25); pad.rotateY(turn);
    o.push(at(pad, Math.cos(turn) * (h - 16) * lean * 0.75, h, -Math.sin(turn) * (h - 16) * lean * 0.75));
  }
  return furn([solid(o)]);
}
function shelf(rand) {
  const o = [at(rbox(88, 76, 4, WOOD_D, 1.5), 0, 44, -9)];
  for (const s of [-1, 1]) o.push(at(rbox(5, 80, 22, WOODC, 2), s * 43, 42, 0));
  for (const y of [8, 42, 78]) o.push(at(rbox(88, 5, 22, WOODC, 2), 0, y, 0));
  o.push(at(rbox(92, 6, 8, WOODC, 3), 0, 84, -6));
  for (const y of [10.5, 44.5]) {                                      // two rows of books
    let x = -38;
    while (x < 36) {
      const w = 4.5 + rand() * 3.5, h = 20 + rand() * 9, c = [0xe8743a, 0x5f8fd2, 0x7cc04a, 0xe3c33c, 0xb98ad6, 0xd9534a, 0x5fb8b0][Math.floor(rand() * 7)];
      const b = rbox(w, h, 15, c, 0.8, PLAIN); if (rand() < 0.12) b.rotateZ(0.18);
      o.push(at(b, x + w / 2, y + h / 2, 0)); x += w + 0.6;
    }
  }
  o.push(at(cyl(5, 6.5, 8, 0xc9744a, 8), 26, 87, 0));
  for (let i = 0; i < 5; i++) o.push(leaf(9, 6, GREEN, 0.7, i * 1.26, 95).translate(26, 0, 0));
  return furn([solid(o)], 2);
}
function floorLamp() {
  const o = [cyl(9, 10, 3, WOOD_D, 12), at(cyl(1.7, 1.7, 54, WOODC, 6), 0, 3, 0), at(ball(3.2, WOODC), 0, 30, 0), at(cyl(15.5, 15.5, 1.6, 0xf3d9a4, 12), 0, 56, 0)];
  const shade = clean(new THREE.CylinderGeometry(8.5, 15, 18, 14)); shade.translate(0, 66, 0);
  return furn([solid(o), { geo: shade, mat: 'lampglow' }]);
}
function chime() {
  const o = [at(rbox(28, 4, 12, WOOD_D, 1.5), 0, 2, 0), at(cyl(1.9, 1.9, 68, WOODC, 6), -9, 3, 0), at(rbox(26, 3.2, 3.2, WOODC, 1.4), 2, 70, 0)];
  o.push(at(cyl(0.5, 0.5, 10, 0xf7edd6, 4), 12, 59, 0), at(ball(8, 0x9fd8e8, 1, 0.9, 1, 10), 12, 53, 0), at(cyl(0.4, 0.4, 8, 0xf7edd6, 4), 12, 38, 0), at(rbox(5, 13, 0.8, 0xf7a8c2, 0.3, CLOTH), 12, 31, 0));
  for (let i = 0; i < 4; i++) o.push(at(ball(2.6, i % 2 ? 0xfff6e8 : 0xf7a8c2), -9 + (i % 2) * 4, 20 + i * 12, 2.5), leaf(6, 3.5, GREEN, 0.4, i * 1.7, 18 + i * 12).translate(-9, 0, 0));
  return furn([solid(o)]);
}
function horse() {
  const o = [];
  for (const s of [-1, 1]) { const rail = new THREE.TorusGeometry(30, 2.2, 6, 14, 1.5); rail.rotateZ(-Math.PI / 2 - 0.75); o.push(at(P(rail, WOOD_D, WOOD), 0, 31, s * 8)); }
  for (const x of [-12, 12]) o.push(at(rbox(4, 3, 20, WOOD_D, 1), x, 3.5, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.push(at(cyl(2.4, 2, 16, 0xf3e3c3, 6), sx * 9, 4, sz * 5));
  o.push(at(ball(1, 0xf7e9cf, 15, 9.5, 9), 0, 25, 0), at(ball(1, 0xf7e9cf, 7.5, 9, 6.5), 14, 34, 0), at(ball(1, 0xf7e9cf, 6, 4.2, 4.6), 19.5, 31, 0));   // body, neck and head, muzzle
  for (const s of [-1, 1]) o.push(at(ball(1.2, 0x3a2a22), 17, 36, s * 5), at(ball(2.2, 0xf7e9cf, 0.6, 1.3, 0.8), 13, 43, s * 3.2));                     // eyes, ears
  for (let i = 0; i < 5; i++) o.push(at(ball(3.6, 0xd9534a), 9.5 - i * 1.6, 41 - i * 3.4, 0));                                                              // mane
  o.push(at(ball(5, 0xd9534a, 1.3, 0.8, 0.8), -16, 27, 0), at(rbox(13, 4, 19.5, 0xc9443a, 1.6, CLOTH), 0, 33.5, 0), at(rbox(9, 1.5, 20, 0xf2c04a, 0.6), 0, 35, 0));   // tail, saddle
  return furn([solid(o)]);
}
function petbed() {
  const o = [at(cyl(38, 34, 9, 0xc98a4e, 18), 0, 0, 0)];
  o[0].scale(1.12, 1, 0.56);
  const ring = new THREE.TorusGeometry(30, 9.5, 8, 22); ring.rotateX(Math.PI / 2); ring.scale(1.12, 1, 0.56);
  o.push(at(P(ring, 0xb98ad6, CLOTH), 0, 15, 0), at(ball(1, 0xfaf1dd, 28, 5, 13, 12, CLOTH), 0, 13, 0));
  o.push(at(ball(3.6, 0xf2c04a, 1, 1, 0.5), 30, 5, 17));
  return furn([solid(o)], 2);
}
function bed() {
  const o = [at(rbox(86, 12, 92, WOODC, 3), 0, 9, 0), at(rbox(80, 10, 84, 0xfdf6ea, 4, CLOTH), 0, 19, 0)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) o.push(at(rbox(8, sz < 0 ? 52 : 30, 8, WOOD_D, 3), sx * 40, sz < 0 ? 26 : 15, sz * 44), at(ball(5.2, WOODC), sx * 40, sz < 0 ? 54 : 32, sz * 44));
  const head = rbox(76, 34, 6, WOODC, 5); o.push(at(head, 0, 31, -44), at(ball(1, GREEN, 8, 5, 1.6), 0, 38, -40.5), at(rbox(76, 16, 5, WOODC, 4), 0, 19, 44));
  o.push(at(rbox(46, 9, 20, 0xfff9ee, 4.5, CLOTH), 0, 27, -30));                                       // pillow
  o.push(at(rbox(84, 11, 56, 0xf4a6ae, 5, CLOTH), 0, 21.5, 15), at(rbox(84, 5, 10, 0xfdf6ea, 2.5, CLOTH), 0, 25.5, -13));   // blanket with its turned-down edge
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) o.push(at(rbox(18, 0.8, 16, 0xfbd0d4, 0.4, CLOTH), -27 + i * 18, 27.2, -2 + j * 16));   // checks
  return { height: 100, parts: [solid(o)], fixed: true, scale1: true, dz: -8 };
}

// ---------- crops (one model fills one field cell) ----------
const stalk = (h, color, lean, turn, r = 0.9) => { const g = cyl(r, r * 0.6, h, color, 5); g.rotateZ(lean); g.rotateY(turn); return g; };
function sprout(rand, color = 0x8fd058) {
  const o = [];
  for (const [x, z] of [[-9, -6], [8, -3], [-1, 9]]) {
    o.push(at(stalk(6, GREEN_D, 0, 0), x, 0, z));
    for (const s of [0, 1]) o.push(leaf(6.5, 4, color, 0.5, s * Math.PI + rand() * 0.8, 6).translate(x, 0, z));
  }
  o.push(at(ball(1, 0x8a5a36, 15, 1.6, 12), 0, 0.4, 0));                                                // little mound of earth
  return crop(o);
}
function carrot(rand, ripe) {
  const o = [];
  for (const [x, z] of [[-10, -8], [9, -9], [0, 2], [-9, 10], [10, 9]]) {
    for (let i = 0; i < 6; i++) o.push(at(stalk((ripe ? 20 : 13) * (0.8 + rand() * 0.4), i % 2 ? GREEN : 0x92d055, (rand() - 0.5) * 0.9, rand() * 6.28, 1.5), x, 1, z));
    if (ripe) o.push(at(ball(1, 0xf08a3a, 4.2, 3, 4.2), x, 1.2, z));
  }
  return crop(o);
}
function strawberry(rand, ripe) {
  const o = [];
  for (const [x, z] of [[-9, -7], [9, -6], [0, 8]]) {
    for (let i = 0; i < 7; i++) o.push(leaf(9 + rand() * 3, 7, i % 2 ? GREEN : GREEN_D, 0.3 + rand() * 0.35, i * 0.9 + rand(), 3 + rand() * 3).translate(x, 0, z));
    for (let i = 0, n = ripe ? 4 : 2; i < n; i++) {
      const a = rand() * 6.28, r = 6 + rand() * 4;
      if (ripe) o.push(at(ball(1, 0xe8445a, 2.8, 3.4, 2.8), x + Math.cos(a) * r, 4.5, z + Math.sin(a) * r), at(ball(1.5, 0x6fb53c, 1, 0.5, 1), x + Math.cos(a) * r, 7.6, z + Math.sin(a) * r));
      else o.push(at(ball(1.8, 0xfff6e8, 1, 0.5, 1), x + Math.cos(a) * r, 9, z + Math.sin(a) * r), at(ball(0.9, 0xf8cf48), x + Math.cos(a) * r, 9.8, z + Math.sin(a) * r));
    }
  }
  return crop(o);
}
function sunflower(rand, ripe) {
  const o = [], h = ripe ? 46 : 26;
  for (const [x, z, k] of ripe ? [[-8, -4, 1], [9, 2, 0.86]] : [[-8, -4, 1], [9, 2, 0.9], [0, 9, 0.8]]) {
    o.push(at(cyl(1.6, 1.3, h * k, GREEN_D, 6), x, 0, z));
    for (let i = 0; i < 4; i++) o.push(leaf(11, 8, GREEN, 0.35, i * 1.7 + rand(), h * k * (0.25 + i * 0.16)).translate(x, 0, z));
    if (!ripe) { o.push(at(ball(3.4, 0x92d055, 1, 1.1, 1), x, h * k + 2, z)); continue; }
    const head = [P(new THREE.CylinderGeometry(7, 7, 2.6, 14), 0x8a5a36, PLAIN), at(P(new THREE.CylinderGeometry(4.2, 4.2, 3.2, 12), 0x6b4226, PLAIN), 0, 0.2, 0)];
    for (let i = 0; i < 14; i++) { const p = ball(1, i % 2 ? 0xf8cf48 : 0xf5bc36, 5.5, 0.9, 2.6, 6); p.translate(10.5, 0, 0); p.rotateY((i / 14) * 6.283); head.push(p); }
    const hg = merge(head); hg.rotateX(Math.PI / 2 - 0.5); o.push(at(hg, x, h * k + 4, z + 2));          // the flower looks at the camera, a little upward
  }
  return crop(o);
}
function starwheat(rand, ripe) {
  const o = [], glow = [], col = ripe ? 0xe8c860 : 0x92d055;
  for (let i = 0; i < 16; i++) {
    const x = (i % 4 - 1.5) * 9 + (rand() - 0.5) * 4, z = (Math.floor(i / 4) - 1.5) * 9 + (rand() - 0.5) * 4, h = (ripe ? 30 : 20) * (0.85 + rand() * 0.3), lean = (rand() - 0.5) * 0.3;
    o.push(at(stalk(h, col, lean, rand() * 6.28, 0.8), x, 0, z), leaf(9, 2.4, col, 0.9, rand() * 6.28, h * 0.4).translate(x, 0, z));
    if (ripe) {
      o.push(at(ball(1, 0xf2d878, 1.9, 5, 1.9, 6), x - Math.sin(lean) * h * 0.2, h + 3, z));
      if (i % 5 === 0) glow.push(at(clean(new THREE.OctahedronGeometry(2.6)), x, h + 11, z));                 // the little stars the crop is named after
    }
  }
  return crop(o, glow.length ? glow : null);
}
function pumpkin(rand, ripe) {
  const o = [];
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + rand() * 0.4; o.push(leaf(12, 10, i % 2 ? GREEN : GREEN_D, 0.22, a, 4 + rand() * 3, 5)); }
  const vine = new THREE.TorusGeometry(13, 0.9, 5, 16, 4.6); vine.rotateX(Math.PI / 2); o.push(at(P(vine, GREEN_D, PLAIN), 0, 2, 0));
  if (ripe) {
    for (let i = 0; i < 8; i++) { const seg = ball(1, i % 2 ? 0xe9832e : 0xe07a2a, 5.6, 10, 8.5, 9); seg.translate(0, 0, 6.5); seg.rotateY((i / 8) * 6.283); o.push(at(seg, 0, 10.5, 0)); }
    o.push(at(cyl(2.2, 1.5, 6, 0x6a8a3a, 6), 0, 19.5, 0));
  } else o.push(at(ball(1, 0x9fc24a, 5.5, 4.6, 5.5), 6, 5, 4), at(ball(2.6, 0xf8cf48, 1, 0.6, 1), -7, 8, -5));
  return crop(o);
}

// prototypes keyed by the game's texture keys
export function propProtos(seed = 11) {
  const rand = rng(seed), out = {
    furn_chair: [chair()], furn_table: [table()], furn_plant: [plant(rand)], furn_shelf: [shelf(rand)], furn_lamp: [floorLamp()],
    furn_chime: [chime()], furn_horse: [horse()], furn_petbed: [petbed()], bed: [bed()],
  };
  const grow = { carrot, strawberry, sunflower, starwheat, pumpkin };
  for (const [id, make] of Object.entries(grow)) {
    out[`crop_${id}_0`] = [sprout(rand, mixHex(0x8fd058, id === 'starwheat' ? 0xcfe07a : 0x7cc04a, 0.5))];
    out[`crop_${id}_1`] = [make(rand, false)];
    out[`crop_${id}_2`] = [make(rand, true)];
  }
  return out;
}
