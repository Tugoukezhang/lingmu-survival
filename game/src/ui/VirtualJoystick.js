import { COLORS } from '../config.js';

// Floating joystick: appears where the finger first touches inside the left
// part of the screen. Output: this.vector (x, y in -1..1, length <= 1).
export default class VirtualJoystick {
  constructor(scene, { zoneWidth = 0.45, radius = 56, deadZone = 0.15 } = {}) {
    this.scene = scene;
    this.radius = radius;
    this.deadZone = deadZone;
    this.zoneWidth = zoneWidth;
    this.pointerId = null;
    this.vector = new Phaser.Math.Vector2(0, 0);
    this.restX = 120;
    this.restY = scene.scale.height - 110;

    this.base = scene.add.circle(this.restX, this.restY, radius, COLORS.cream, 0.35)
      .setStrokeStyle(4, COLORS.woodDark, 0.6).setScrollFactor(0).setDepth(10000);
    this.knob = scene.add.circle(this.restX, this.restY, radius * 0.45, COLORS.cream, 0.9)
      .setStrokeStyle(4, COLORS.woodDark).setScrollFactor(0).setDepth(10001);
    this.setIdleLook();

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);
  }

  setIdleLook() { this.base.setAlpha(0.5); this.knob.setAlpha(0.6); }

  onDown(p) {
    if (this.pointerId !== null) return;
    if (p.x > this.scene.scale.width * this.zoneWidth) return; // right side belongs to buttons
    this.pointerId = p.id;
    this.base.setPosition(p.x, p.y).setAlpha(1);
    this.knob.setPosition(p.x, p.y).setAlpha(1);
  }

  onMove(p) {
    if (p.id !== this.pointerId) return;
    const dx = p.x - this.base.x;
    const dy = p.y - this.base.y;
    const len = Math.hypot(dx, dy);
    const k = len > this.radius ? this.radius / len : 1;
    this.knob.setPosition(this.base.x + dx * k, this.base.y + dy * k);
    const mag = Math.min(len / this.radius, 1);
    if (mag < this.deadZone) { this.vector.set(0, 0); return; }
    this.vector.set(dx / len, dy / len).scale((mag - this.deadZone) / (1 - this.deadZone));
  }

  onUp(p) {
    if (p.id !== this.pointerId) return;
    this.pointerId = null;
    this.vector.set(0, 0);
    this.base.setPosition(this.restX, this.restY);
    this.knob.setPosition(this.restX, this.restY);
    this.setIdleLook();
  }
}
