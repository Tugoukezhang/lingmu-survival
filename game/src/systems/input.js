// Action mapping: gameplay asks for "move" and "interact", never raw keys.
// Keyboard (WASD / arrows, E / Space) and touch (joystick + button) feed the same actions.
export default class InputActions {
  constructor(scene, joystick) {
    this.joystick = joystick;
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE');
    this.interactQueued = false;
    this.move = new Phaser.Math.Vector2();
    // Listen to key-down events instead of polling JustDown: a quick tap can
    // go down and up within one frame and would otherwise be missed.
    this.keys.E.on('down', () => this.queueInteract());
    this.keys.SPACE.on('down', () => this.queueInteract());
  }

  queueInteract() { this.interactQueued = true; }

  update() {
    const k = this.keys;
    let x = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let y = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (x || y) {
      this.move.set(x, y).normalize();
    } else {
      this.move.copy(this.joystick.vector);
    }
  }

  // Returns true once per press.
  consumeInteract() {
    const v = this.interactQueued;
    this.interactQueued = false;
    return v;
  }
}
