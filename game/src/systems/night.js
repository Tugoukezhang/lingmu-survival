// Night danger and light (docs/06 第 4 节, S18, T21). Pure logic, no Phaser.
// Fog monsters are not saved: they appear by schedule each night and fade at 6:00.
import { species } from '../data/pets.js';
import { DAY_START, NIGHT_START, phaseAt } from './time.js';

export const TILE_PX = 48;
export const LIGHT_TILES = { campfire: 4, torch: 2, petGlow: 1.5 };
export const TORCH_MINUTES = 3 * 60;
export const MONSTER = {
  max: 3,
  speed: 38,                 // px/s (the player walks 170)
  attackRange: 4 * TILE_PX,  // starts an attack from this close
  warnRadius: 1.2 * TILE_PX,
  warnMs: 1200,
  damage: 15,
  attackEveryMs: 4000,
  spawnMin: 6 * TILE_PX,
  spawnMax: 9 * TILE_PX,
  edgeMargin: 10,            // stops this far outside a light
};
export const FIRST_SPAWN = NIGHT_START + 10;   // 20:10 【建议】

// Absolute game minute, monotonic across days (used for torch burn time).
export const absMinute = (state) => state.day * 1440 + state.clock;

export const isFoggy = (clock) => phaseAt(clock) === 'night';

// Spawn interval: every 60 game minutes, every 30 after midnight.
export const spawnInterval = (clock) => (clock >= 24 * 60 || clock < DAY_START ? 30 : 60);

// Should a new monster appear now? lastSpawn = clock of the previous spawn (null = none yet tonight).
export function shouldSpawn(clock, lastSpawn, count) {
  if (!isFoggy(clock) || count >= MONSTER.max) return false;
  if (lastSpawn == null) return clock >= FIRST_SPAWN || clock < DAY_START;
  return clock - lastSpawn >= spawnInterval(clock);
}

// ---------- light ----------
export const torchLit = (state) => (state.player.torchUntil ?? 0) > absMinute(state);

export function lightTorch(state) {
  state.player.torchUntil = absMinute(state) + TORCH_MINUTES;
  return state.player.torchUntil;
}

// Pets with the 照明 explore skill in the party (docs/02 第 9 节).
export const partyGlows = (state) => state.party.some((uid) => {
  const p = state.pets.find((x) => x.uid === uid);
  return p && species(p.species).explore === 'light';
});

// Light around the player: the biggest of torch / glowing pet (they don't add up).
export function playerLightTiles(state) {
  let r = 0;
  if (torchLit(state)) r = Math.max(r, LIGHT_TILES.torch);
  if (partyGlows(state)) r = Math.max(r, LIGHT_TILES.petGlow);
  return r;
}

// All lights as { x, y, r } in px. fires: [{ x, y }] burning campfires.
export function lights(state, player, fires = []) {
  const out = fires.map((f) => ({ x: f.x, y: f.y, r: LIGHT_TILES.campfire * TILE_PX, kind: 'campfire' }));
  const pr = playerLightTiles(state);
  if (pr) out.push({ x: player.x, y: player.y, r: pr * TILE_PX, kind: 'player' });
  return out;
}

export const litBy = (ls, x, y, margin = 0) => ls.find((l) => Math.hypot(x - l.x, y - l.y) < l.r + margin) ?? null;

// ---------- monsters ----------
// One movement step. Monsters never enter light: they walk toward the player,
// stop at the edge of any light, and back out if they find themselves inside.
export function monsterStep(m, player, ls, dt, canStand = () => true) {
  const inside = litBy(ls, m.x, m.y);
  let dx, dy;
  if (inside) { dx = m.x - inside.x; dy = m.y - inside.y; }
  else { dx = player.x - m.x; dy = player.y - m.y; }
  const len = Math.hypot(dx, dy) || 1;
  const step = MONSTER.speed * dt * (inside ? 1.5 : 1);
  const nx = m.x + (dx / len) * step, ny = m.y + (dy / len) * step;
  if (!inside && (litBy(ls, nx, ny, MONSTER.edgeMargin) || Math.hypot(player.x - m.x, player.y - m.y) < 40)) return { ...m, stopped: true, retreating: false };
  if (!canStand(nx, ny)) return { ...m, stopped: true, retreating: !!inside };
  return { ...m, x: nx, y: ny, stopped: false, retreating: !!inside };
}

// Can this monster start an attack now? (outside light, close enough, cooled down)
export function canAttack(m, player, ls, now) {
  return !litBy(ls, m.x, m.y) && now >= (m.nextAttack ?? 0) && Math.hypot(player.x - m.x, player.y - m.y) <= MONSTER.attackRange;
}

// A warning circle hits when the player stands inside it at landing time.
export const warningHits = (w, player) => Math.hypot(player.x - w.x, player.y - w.y) <= w.r;

// Spawn point: in the fog (unlit), walkable, 6–9 tiles from the player.
export function pickSpawn(rng, player, ls, canStand, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const a = rng() * Math.PI * 2, d = MONSTER.spawnMin + rng() * (MONSTER.spawnMax - MONSTER.spawnMin);
    const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
    if (canStand(x, y) && !litBy(ls, x, y, MONSTER.edgeMargin)) return { x, y };
  }
  return null;
}
