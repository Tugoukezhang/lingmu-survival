// Action mapping: gameplay asks for "move" and "interact", never raw keys.
// Keyboard (WASD / arrows, E / Space) and touch (joystick + action button in
// the UI scene) feed the same actions. While a UI panel is open (registry
// flag `uiModal`), gameplay input is ignored.
export default class InputActions {
  constructor(scene, getJoystickVector) {
    this.scene = scene;
    this.getJoystickVector = getJoystickVector;
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE');
    this.interactQueued = false;
    this.move = new Phaser.Math.Vector2();
    // Listen to key-down events instead of polling JustDown: a quick tap can
    // go down and up within one frame and would otherwise be missed.
    this.keys.E.on('down', () => this.queueInteract());
    this.keys.SPACE.on('down', () => this.queueInteract());
  }

  get blocked() { return !!this.scene.registry.get('uiModal'); }

  queueInteract() { if (!this.blocked) this.interactQueued = true; }

  update() {
    if (this.blocked) { this.move.set(0, 0); this.interactQueued = false; return; }
    const k = this.keys;
    const x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (x || y) {
      this.move.set(x, y).normalize();
    } else {
      const v = this.getJoystickVector();
      if (v) this.move.copy(v); else this.move.set(0, 0);
    }
  }

  // Returns true once per press.
  consumeInteract() {
    const v = this.interactQueued;
    this.interactQueued = false;
    return v;
  }
}
