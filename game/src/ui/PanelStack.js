import { GAME_W, GAME_H } from '../config.js';
import { makeClickable } from './widgets.js';

// Screens as a stack (skills: game-ui-ux). push() opens a panel on top with a
// dimmed backdrop that blocks the world; pop() closes the top one. Back,
// close, Esc and tapping the backdrop all pop exactly one level.
export default class PanelStack {
  constructor(scene, { onChange } = {}) {
    this.scene = scene;
    this.items = []; // { name, container, backdrop }
    this.onChange = onChange;
    this.lockUntil = 0;
    scene.input.keyboard.on('keydown-ESC', () => this.pop());
  }

  get size() { return this.items.length; }
  get names() { return this.items.map((i) => i.name); }

  // factory(scene, stack) must return a container centred at (0, 0).
  push(name, factory) {
    const depth = 20000 + this.items.length * 10;
    const backdrop = this.scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x1f1a14, 0.45).setDepth(depth);
    makeClickable(this.scene, backdrop, () => this.pop());
    const container = factory(this.scene, this);
    container.setPosition(GAME_W / 2, GAME_H / 2).setDepth(depth + 1).setScale(0.88).setAlpha(0);
    this.scene.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 180, ease: 'Back.out' });
    this.items.push({ name, container, backdrop });
    this.changed();
    return container;
  }

  pop() {
    const top = this.items.pop();
    if (!top) return;
    // ignore taps for a moment so the closing tap can't fall through to the world/HUD
    this.lockUntil = this.scene.time.now + 150;
    top.backdrop.destroy();
    this.scene.tweens.add({
      targets: top.container, scale: 0.9, alpha: 0, duration: 120,
      onComplete: () => top.container.destroy(),
    });
    this.changed();
  }

  clear() { while (this.items.length) this.pop(); }

  locked() { return this.scene.time.now < this.lockUntil; }

  changed() { this.onChange?.(this.items.length > 0); }
}
