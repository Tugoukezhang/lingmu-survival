// Reference layout of the home island, computed with the web version's own rule code (game/src/systems/rng.js)
// and the same order of random numbers as PlayScene (buildIsland → buildBackdrop → drawGround → placeObstacles).
// The Unity port (unity/Assets/Scripts/World/HomeIslandLayout.cs) must reproduce it exactly — see its EditMode test.
//   node tools/unity/export_home_layout.mjs [seed]   → unity/Assets/Tests/EditMode/Data/home_layout_ref.json
import { mulberry32, valueNoise2D } from '../../game/src/systems/rng.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED = Number(process.argv[2]) || 20261108;          // config.js default
const COLS = 50, ROWS = 34;                                  // play/constants.js HOME_COLS / HOME_ROWS

// buildIsland (play/world.js)
const noise = valueNoise2D(SEED + 7, 6);
const cx = COLS / 2, cy = ROWS / 2, rx = 21, ry = 13;
const walk = [];
for (let y = 0; y < ROWS; y++) {
  const row = [];
  for (let x = 0; x < COLS; x++) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    row.push(d + (noise(x, y) - 0.5) * 0.7 < 1);
  }
  walk.push(row);
}
const spawn = { x: Math.floor(cx), y: Math.floor(cy) };
const meadow = { x: Math.floor(cx) - 7, y: Math.floor(cy) + 2 };
const farmRect = { x: spawn.x + 4, y: spawn.y + 2, w: 6, h: 4 };
const expandRect = { x: spawn.x + 5, y: spawn.y - 7, w: 6, h: 4 };
const cottageRect = { x: spawn.x - 4, y: spawn.y - 8, w: 4, h: 3 };

// the scene's random stream: buildBackdrop uses 5 numbers per cloud (9 clouds), drawGround 1 per tile (+3 when a flower is drawn)
const rand = mulberry32(SEED);
for (let i = 0; i < 9 * 5; i++) rand();
for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (walk[y][x]) { if (rand() < 0.06) { rand(); rand(); rand(); } }

// placeObstacles: fixed camp pieces, dock, bridge, then trees and rocks
const campfire = { x: spawn.x - 2, y: spawn.y - 2 };
const tent = { x: spawn.x + 2, y: spawn.y - 2 };
const storage = { x: spawn.x + 3, y: spawn.y };
let dy = spawn.y; while (walk[dy + 1]?.[spawn.x]) dy++;
const dockTile = { x: spawn.x, y: dy };
let wx = spawn.x; while (walk[spawn.y]?.[wx - 1]) wx--;
const bridgeTile = { x: wx, y: spawn.y };
const reserved = (x, y) => Math.hypot(x - spawn.x, y - spawn.y) < 3.5
  || Math.hypot((x - meadow.x) / 1.6, y - meadow.y) < 3.2
  || Math.hypot(x - dockTile.x, y - dockTile.y) < 2.5
  || Math.hypot(x - bridgeTile.x, y - bridgeTile.y) < 2.5
  || (x >= cottageRect.x - 1 && x <= cottageRect.x + cottageRect.w && y >= cottageRect.y - 1 && y <= cottageRect.y + cottageRect.h + 1)
  || (x >= farmRect.x - 1 && x <= farmRect.x + farmRect.w + 1 && y >= farmRect.y - 1 && y <= farmRect.y + farmRect.h)
  || (x >= expandRect.x - 1 && x <= expandRect.x + expandRect.w && y >= expandRect.y - 1 && y <= expandRect.y + expandRect.h + 1);
const inland = (x, y) => walk[y]?.[x] && walk[y - 1]?.[x] && walk[y + 1]?.[x] && walk[y]?.[x - 1] && walk[y]?.[x + 1];
const forest = valueNoise2D(SEED + 23, 5);
const trees = [], rocks = [];
for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
  if (!inland(x, y) || reserved(x, y)) continue;
  const roll = rand();
  if (roll < 0.03 + forest(x, y) * 0.12) trees.push({ x, y, kind: (x * 7 + y * 13) % 3 === 0 ? 'pine' : 'apple' });
  else if (roll > 0.985) rocks.push({ x, y, kind: (x + y) % 2 ? 'rock_b' : 'rock' });
}

// farm (play/farm.js): shipping box and seed stand on the right edge of the field
const shipbox = { x: farmRect.x + farmRect.w, y: farmRect.y };
const seedstand = { x: farmRect.x + farmRect.w, y: farmRect.y + 2 };

const out = { seed: SEED, cols: COLS, rows: ROWS, walk: walk.map((r) => r.map((v) => (v ? 1 : 0)).join('')),
  spawn, meadow, farmRect, expandRect, cottageRect, campfire, tent, storage, dockTile, bridgeTile, shipbox, seedstand, trees, rocks };
const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', '..', 'unity', 'Assets', 'Tests', 'EditMode', 'Data', 'home_layout_ref.json');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`walkable ${walk.flat().filter(Boolean).length}, trees ${trees.length}, rocks ${rocks.length} → ${file}`);
