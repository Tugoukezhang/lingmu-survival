// Owns the current game state and the save store for the running game.
// - Loads once at boot; HUD values are mirrored into the registry (the HUD
//   listens there) and copied back before each save.
// - Scenes add before-save hooks for things only they know (player position).
// - Autosave: every 20 s when something changed, when the page is hidden or
//   closed, and on explicit save() calls after important events.
import { SaveStore, MemoryStorage, newGameState } from './save.js';
import { eat } from './survival.js';

const AUTOSAVE_MS = 20000;
const MIRRORED = ['day', 'clock', 'clover'];
const MIRRORED_PLAYER = ['hp', 'hpMax', 'hunger', 'hungerMax'];

function pickStorage() {
  try {
    const s = window.localStorage;
    s.setItem('lingmu.probe', '1'); s.removeItem('lingmu.probe');
    return { storage: s, persistent: true };
  } catch {
    return { storage: new MemoryStorage(), persistent: false };
  }
}

export default class GameSession {
  constructor(game) {
    this.game = game;
    const { storage, persistent } = pickStorage();
    this.persistent = persistent;
    this.store = new SaveStore(storage);
    this.hooks = new Set();
    this.dirty = false;
    this.notice = null; // message for the UI to show once after loading
  }

  get registry() { return this.game.registry; }

  load() {
    const r = this.store.load();
    this.state = r.state;
    this.loadSource = r.source;
    if (!this.persistent) this.notice = '当前浏览器不允许存档，进度不会保存';
    else if (r.source === 'backup') this.notice = '存档损坏，已从备份恢复';
    else if (r.problem === 'future') this.notice = '存档来自更新的游戏版本，已另外保留；本次从新开始';
    else if (r.problem) this.notice = '存档无法读取，已重新开始';
    this.pushToRegistry();
    if (!this.started) this.startAutosave();
    return r;
  }

  newGame() {
    this.store.wipe();
    this.state = newGameState();
    this.pushToRegistry();
    this.dirty = true;
    this.save('new-game');
  }

  pushToRegistry() {
    const s = this.state;
    this.mirroring = true;
    this.registry.set({ ...Object.fromEntries(MIRRORED.map((k) => [k, s[k]])), ...Object.fromEntries(MIRRORED_PLAYER.map((k) => [k, s.player[k]])) });
    this.mirroring = false;
  }

  pullFromRegistry() {
    const s = this.state, reg = this.registry;
    for (const k of MIRRORED) if (reg.has(k)) s[k] = reg.get(k);
    for (const k of MIRRORED_PLAYER) if (reg.has(k)) s.player[k] = reg.get(k);
  }

  // A scene registers fn(state) to write its part of the state before saving.
  // Returns an unregister function (call it on scene shutdown).
  onBeforeSave(fn) { this.hooks.add(fn); return () => this.hooks.delete(fn); }

  markDirty() { this.dirty = true; }

  // Eat a food item from the bag (state + HUD stay in sync).
  eat(itemId) {
    this.pullFromRegistry();
    const r = eat(this.state, itemId);
    if (r.ok) { this.pushToRegistry(); this.dirty = true; }
    return r;
  }

  // Returns true when written. Skipped (false) while saving is blocked.
  save(reason = 'manual') {
    this.pullFromRegistry();
    for (const fn of this.hooks) fn(this.state);
    const ok = this.store.save(this.state);
    if (ok) this.dirty = false;
    this.lastSave = { reason, ok, error: this.store.lastError };
    return ok;
  }

  startAutosave() {
    this.started = true;
    this.registry.events.on('changedata', (parent, key) => {
      if (!this.mirroring && (MIRRORED.includes(key) || MIRRORED_PLAYER.includes(key))) this.dirty = true;
    });
    this.timer = setInterval(() => { if (this.dirty) this.save('auto'); }, AUTOSAVE_MS);
    const flush = () => this.save('hidden');
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush);
  }
}
