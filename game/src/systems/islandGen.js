// Expedition island generator, biome 雾林 (docs/06 第 5 节, S17).
// Pure and deterministic: the same seed always gives the same island.
// The save stores only the seed + a change record (collected resources,
// opened chests, caught/defeated pets); the island is regenerated each visit.
import { mulberry32, valueNoise2D } from './rng.js';
import { PETS } from '../data/pets.js';

export const ISLAND_W = 40;
export const ISLAND_H = 30;
export const MIN_AREA = 600;
export const MAX_ATTEMPTS = 10;
export const RESOURCE_WEIGHTS = [['tree', 35], ['rock', 25], ['bush', 15], ['grass', 15], ['crystal', 10]];
export const BLOCKING = { tree: true, rock: true, bush: true, crystal: true, grass: false };
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------- helpers ----------
const grid = (w, h, v) => Array.from({ length: h }, () => Array(w).fill(v));
const inside = (x, y) => x >= 0 && y >= 0 && x < ISLAND_W && y < ISLAND_H;
const key = (x, y) => y * ISLAND_W + x;

function bfs(passable, sx, sy) {
  const dist = grid(ISLAND_W, ISLAND_H, -1);
  if (!passable(sx, sy)) return dist;
  const q = [[sx, sy]]; dist[sy][sx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (inside(nx, ny) && dist[ny][nx] < 0 && passable(nx, ny)) { dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]); }
    }
  }
  return dist;
}

function pickWeighted(rand, table) {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of table) { if (r < w) return v; r -= w; }
  return table[table.length - 1][0];
}

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

// Cells blocked by remaining entities (resources that block, chests, thorns).
// Water is separate (island.water): only a party with 航海鲨 can wade.
export function blockedGrid(island) {
  const b = grid(ISLAND_W, ISLAND_H, false);
  for (const r of island.resources) if (BLOCKING[r.type]) b[r.ty][r.tx] = true;
  for (const c of island.chests) b[c.ty][c.tx] = true;
  for (const t of island.thorns ?? []) b[t.ty][t.tx] = true;
  return b;
}

// ---------- one attempt ----------
function attempt(seed, plain) {
  const rand = mulberry32(seed);
  const noise = valueNoise2D(seed + 101, 5);
  const amp = plain ? 0 : 0.8;
  const cx = ISLAND_W / 2, cy = ISLAND_H / 2;
  const rx = 16.5 + rand() * 2, ry = 12.4 + rand() * 1;

  // 1. outline: noisy ellipse, keep a 1-cell sky border, keep the largest connected piece
  let walk = grid(ISLAND_W, ISLAND_H, false);
  for (let y = 1; y < ISLAND_H - 1; y++) {
    for (let x = 1; x < ISLAND_W - 1; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      walk[y][x] = d + (noise(x, y) - 0.5) * amp < 1;
    }
  }
  const seen = new Set();
  let best = [];
  for (let y = 0; y < ISLAND_H; y++) for (let x = 0; x < ISLAND_W; x++) {
    if (!walk[y][x] || seen.has(key(x, y))) continue;
    const d = bfs((a, b) => walk[b][a], x, y);
    const cells = [];
    for (let yy = 0; yy < ISLAND_H; yy++) for (let xx = 0; xx < ISLAND_W; xx++) if (d[yy][xx] >= 0) { cells.push([xx, yy]); seen.add(key(xx, yy)); }
    if (cells.length > best.length) best = cells;
  }
  walk = grid(ISLAND_W, ISLAND_H, false);
  for (const [x, y] of best) walk[y][x] = true;
  const area = best.length;
  if (area < MIN_AREA) return { ok: false, why: `area ${area}` };
  const isWalk = (x, y) => inside(x, y) && walk[y][x];

  // 2. landing: a south-edge cell with solid ground above it; the airship floats just below
  let edges = best.filter(([x, y]) => !isWalk(x, y + 1) && isWalk(x, y - 1) && isWalk(x, y - 2) && isWalk(x - 1, y) && isWalk(x + 1, y) && y > cy);
  if (!edges.length) edges = best.filter(([x, y]) => !isWalk(x, y + 1));
  const [lx, ly] = pick(rand, edges);
  const landing = { tx: lx, ty: ly - 1 };   // stand one cell inland
  const airship = { tx: lx, ty: ly + 1 };
  const dist = bfs(isWalk, landing.tx, landing.ty);
  const maxDist = Math.max(...dist.flat());

  const reserved = new Set();
  const reserve = (x, y, r = 0) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) reserved.add(key(x + dx, y + dy)); };
  reserve(landing.tx, landing.ty, 2);
  reserve(lx, ly, 1);
  const free = (x, y) => isWalk(x, y) && !reserved.has(key(x, y));
  const far = (list, x, y, gap) => list.every((o) => Math.abs(o.tx - x) + Math.abs(o.ty - y) >= gap);

  // 2b. shallow ponds (docs/02 第 9 节 涉水): 1–2 ponds inland (about 5–8 tiles across; smaller only
  //     when the island has no room); most have a tiny islet with a rare crystal only a wading party can reach
  const water = grid(ISLAND_W, ISLAND_H, false);
  const islets = [];
  const pondCount = rand() < 0.35 ? 2 : 1;
  for (let p = 0, tries = 0; p < pondCount && tries < 60; tries++) {
    const [px, py] = pick(rand, best);
    if (dist[py][px] < 7) continue;
    const small = tries > 30 ? 0.62 : 1;                      // no room for a big pond after many tries → a small one
    const prx = (2.6 + rand() * 1.4) * small, pry = (1.9 + rand() * 1.0) * small;
    const cells = [];
    let ok = true;
    for (let y = py - 4; y <= py + 4 && ok; y++) for (let x = px - 5; x <= px + 5; x++) {
      if (((x - px) / prx) ** 2 + ((y - py) / pry) ** 2 > 1) continue;
      if (![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => isWalk(x + dx, y + dy)) || reserved.has(key(x, y)) || water[y][x]) { ok = false; break; }
      cells.push([x, y]);
    }
    if (!ok || cells.length < 5) continue;
    for (const [x, y] of cells) water[y][x] = true;
    for (const [x, y] of cells) reserve(x, y, 1);
    if (cells.length >= 9 && rand() < 0.7) { water[py][px] = false; islets.push({ tx: px, ty: py }); }
    p++;
  }

  // 2c. thorn-guarded chest (开路): a far 3×3 spot, chest in the middle, thorns all around
  let bonus = null;
  const bonusCells = best.filter(([x, y]) => dist[y][x] >= maxDist * 0.5 && [-2, -1, 0, 1, 2].every((dy) => [-2, -1, 0, 1, 2].every((dx) => free(x + dx, y + dy) && !water[y + dy][x + dx])));
  if (bonusCells.length) { const [x, y] = pick(rand, bonusCells); bonus = { tx: x, ty: y }; reserve(x, y, 2); }
  const thorns = [];
  if (bonus) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) thorns.push({ id: `t${thorns.length}`, tx: bonus.tx + dx, ty: bonus.ty + dy });

  // 3. camps: 3×3 open clearings, not too close to the landing
  const camps = [];
  const campCount = 1 + Math.floor(rand() * 2);
  const campCells = best.filter(([x, y]) => dist[y][x] >= 8 && [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => free(x + dx, y + dy))));
  for (let i = 0; i < 40 && camps.length < campCount && campCells.length; i++) {
    const [x, y] = pick(rand, campCells);
    if (far(camps, x, y, 8)) { camps.push({ id: `k${camps.length}`, tx: x, ty: y }); reserve(x, y, 1); }
  }

  // 4. chests: in the farthest part of the island
  const chests = [];
  const chestCount = 1 + Math.floor(rand() * 2);
  const chestCells = best.filter(([x, y]) => dist[y][x] >= maxDist * 0.75 && free(x, y));
  for (let i = 0; i < 40 && chests.length < chestCount && chestCells.length; i++) {
    const [x, y] = pick(rand, chestCells);
    if (far(chests, x, y, 5)) { chests.push({ id: `c${chests.length}`, tx: x, ty: y }); reserve(x, y, 1); }
  }

  if (bonus) chests.push({ id: `c${chests.length}`, tx: bonus.tx, ty: bonus.ty, bonus: true });

  // 5. resource clusters by weight
  const resources = [];
  const taken = new Set();
  const clusterCount = 16 + Math.floor(rand() * 5);
  for (let c = 0; c < clusterCount; c++) {
    const type = pickWeighted(rand, RESOURCE_WEIGHTS);
    let center = null;
    for (let t = 0; t < 30 && !center; t++) {
      const [x, y] = pick(rand, best);
      if (free(x, y) && dist[y][x] >= 3 && !taken.has(key(x, y))) center = [x, y];
    }
    if (!center) continue;
    const size = type === 'tree' ? 3 + Math.floor(rand() * 4) : 2 + Math.floor(rand() * 3);
    for (let n = 0, tries = 0; n < size && tries < 20; tries++) {
      const x = center[0] + Math.round((rand() - 0.5) * 4), y = center[1] + Math.round((rand() - 0.5) * 4);
      if (!free(x, y) || taken.has(key(x, y))) continue;
      taken.add(key(x, y));
      resources.push({ id: `r${resources.length}`, type, tx: x, ty: y });
      n++;
    }
  }

  for (const s of islets) resources.push({ id: `r${resources.length}`, type: 'crystal', tx: s.tx, ty: s.ty, rare: true });

  // 6. wild pets: 4–6, away from the landing, not on top of each other
  const pets = [];
  const petCount = 4 + Math.floor(rand() * 3);
  for (let t = 0; t < 200 && pets.length < petCount; t++) {
    const [x, y] = pick(rand, best);
    if (!free(x, y) || taken.has(key(x, y)) || dist[y][x] < 6 || !far(pets, x, y, 4)) continue;
    pets.push({ id: `w${pets.length}`, species: pick(rand, PETS).id, tx: x, ty: y });
  }

  // rare spots (shown on the map by a 100-affection 月影狐猫): the thorn chest and islet crystals
  const rare = [...chests.filter((c) => c.bonus).map((c) => ({ kind: 'chest', id: c.id, tx: c.tx, ty: c.ty })), ...resources.filter((r) => r.rare).map((r) => ({ kind: 'crystal', id: r.id, tx: r.tx, ty: r.ty }))];
  const island = { seed, biome: 'mistwood', cols: ISLAND_W, rows: ISLAND_H, walk, water, area, landing, airship, camps, chests, resources, pets, thorns, rare };
  const problem = validate(island);
  return problem ? { ok: false, why: problem } : { ok: true, island };
}

// ---------- reachability check ----------
// Everything must be reachable from the landing point. Blocking things
// (trees, rocks, chests) count as reachable when a neighbouring cell is.
// Without any pet skill: water and thorns block. The thorn chest must be
// reachable once thorns are cleared; islet crystals once you can wade.
export function validate(island) {
  const blocked = blockedGrid(island);
  const walk = island.walk, water = island.water ?? grid(ISLAND_W, ISLAND_H, false);
  const dist = bfs((x, y) => walk[y][x] && !water[y][x] && !blocked[y][x], island.landing.tx, island.landing.ty);
  const reach = (x, y) => inside(x, y) && dist[y][x] >= 0;
  const touch = (x, y) => DIRS4.some(([dx, dy]) => reach(x + dx, y + dy));
  const wadeDist = bfs((x, y) => walk[y][x] && !blocked[y][x], island.landing.tx, island.landing.ty);
  const touchWading = (x, y) => DIRS4.some(([dx, dy]) => inside(x + dx, y + dy) && wadeDist[y + dy][x + dx] >= 0);
  if (!reach(island.landing.tx, island.landing.ty)) return 'landing blocked';
  if (island.camps.length < 1) return 'no camp';
  if (island.chests.length < 1) return 'no chest';
  if (island.pets.length < 4) return 'too few pets';
  for (const c of island.camps) if (!reach(c.tx, c.ty)) return `camp ${c.id} unreachable`;
  for (const p of island.pets) if (!reach(p.tx, p.ty)) return `pet ${p.id} unreachable`;
  for (const c of island.chests) {
    if (c.bonus) { if (!(island.thorns ?? []).some((t) => t.tx !== c.tx && touch(t.tx, t.ty))) return `thorn chest ${c.id} unreachable`; }
    else if (!touch(c.tx, c.ty)) return `chest ${c.id} unreachable`;
  }
  for (const r of island.resources) {
    if (r.rare) { if (!touchWading(r.tx, r.ty)) return `islet ${r.id} unreachable`; continue; }
    if (!(BLOCKING[r.type] ? touch(r.tx, r.ty) : reach(r.tx, r.ty))) return `resource ${r.id} unreachable`;
  }
  return null;
}

// generateIsland(seed): tries seed, seed+1, … up to 10 times; then a plain
// fallback island. Returns the island with { requestedSeed, seed, attempts, fallback }.
export function generateIsland(requestedSeed) {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const r = attempt(requestedSeed + i, false);
    if (r.ok) return { ...r.island, requestedSeed, attempts: i + 1, fallback: false };
  }
  for (let i = 0; i < 50; i++) {
    const r = attempt(requestedSeed + i, true);
    if (r.ok) return { ...r.island, requestedSeed, attempts: MAX_ATTEMPTS, fallback: true };
  }
  throw new Error(`island generation failed for seed ${requestedSeed}`);
}

// The change record stored in the save for the current/last island.
export const emptyChanges = () => ({ collected: [], chests: [], pets: [], thorns: [] });

// Removes what the player already took (docs/06 第 5 节: collected spots stay empty).
export function applyChanges(island, changes = emptyChanges()) {
  const gone = (list, ids) => list.filter((o) => !ids.includes(o.id));
  return { ...island, resources: gone(island.resources, changes.collected), chests: gone(island.chests, changes.chests), pets: gone(island.pets, changes.pets), thorns: gone(island.thorns ?? [], changes.thorns ?? []) };
}
