import { COLORS, FONT } from '../config.js';

// Code-drawn UI widgets in the style of docs/01_美术风格指南.md:
// cream panels with thick dark-wood borders, wooden plaque buttons,
// capsule buttons, rounded item slots. All sizes are logical px (960x540).

export const MIN_TOUCH = 44; // minimum touch target (docs/01 手机横屏注意)

export const text = (scene, x, y, str, size = 16, opts = {}) => scene.add.text(x, y, str, {
  fontFamily: FONT, fontSize: `${size}px`, color: opts.color || COLORS.text,
  fontStyle: opts.bold === false ? 'normal' : 'bold',
  stroke: opts.stroke, strokeThickness: opts.stroke ? (opts.strokeThickness || 4) : 0,
  align: opts.align || 'left', wordWrap: opts.wrap ? { width: opts.wrap, useAdvancedWrap: true } : undefined,
  lineSpacing: opts.lineSpacing || 0,
}).setOrigin(opts.ox ?? 0, opts.oy ?? 0);

// A "click" fires only when the press both starts and ends on the same
// object. This avoids the classic bug where closing a popup on press lets the
// release hit the button underneath.
export function makeClickable(scene, hit, onClick, { pressTargets = [] } = {}) {
  hit.setInteractive({ useHandCursor: true });
  let pressed = false;
  hit.on('pointerdown', () => {
    pressed = true;
    for (const t of pressTargets) t.setScale(0.92);
  });
  const release = (doClick) => {
    if (pressed && doClick && !scene.uiLocked?.()) onClick();
    pressed = false;
    for (const t of pressTargets) t.setScale(1);
  };
  hit.on('pointerup', () => release(true));
  hit.on('pointerout', () => release(false));
  return hit;
}

// Cream panel with wood border and small leaf + flower corner decorations.
export function woodPanel(scene, w, h, { radius = 24, border = 6, fill = COLORS.cream } = {}) {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  g.fillStyle(0x3b2616, 0.25).fillRoundedRect(-w / 2 + 4, -h / 2 + 8, w, h, radius); // drop shadow
  g.fillStyle(COLORS.woodDark).fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  g.fillStyle(COLORS.woodMid).fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, radius - 2);
  g.fillStyle(fill).fillRoundedRect(-w / 2 + border, -h / 2 + border, w - border * 2, h - border * 2, radius - 4);
  c.add(g);
  c.add(cornerSprig(scene, -w / 2 + 10, h / 2 - 10, 1));
  c.add(cornerSprig(scene, w / 2 - 54, -h / 2 + 8, -1));
  return c;
}

function cornerSprig(scene, x, y, dir) {
  const g = scene.add.graphics({ x, y });
  g.fillStyle(0x6fae4a);
  g.fillEllipse(8 * dir, -6, 18, 9); g.fillEllipse(18 * dir, 2, 16, 8);
  g.fillStyle(0xffffff);
  for (let a = 0; a < 5; a++) g.fillCircle(Math.cos(a * 1.26) * 5, Math.sin(a * 1.26) * 5, 3.6);
  g.fillStyle(COLORS.yellow).fillCircle(0, 0, 2.6);
  return g;
}

// Round wooden plaque button (close / back / HUD function buttons).
export function plaqueButton(scene, x, y, { size = 52, icon = 'close', onClick, name } = {}) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const r = size / 2;
  g.fillStyle(COLORS.woodDark).fillCircle(0, 2, r);
  g.fillStyle(0xb57a4a).fillCircle(0, 0, r - 3);
  g.lineStyle(2, 0x8a5a36, 0.7).strokeCircle(0, 0, r - 9); // wood ring
  c.add(g);
  c.add(drawIcon(scene, icon, size * 0.5));
  if (icon === 'close' || icon === 'back') c.add(cornerSprig(scene, r * 0.55, -r * 0.7, 1).setScale(0.7));
  const hit = scene.add.circle(0, 0, Math.max(r, MIN_TOUCH / 2), 0xffffff, 0.001);
  c.add(hit);
  makeClickable(scene, hit, onClick, { pressTargets: [c] });
  c.setData({ name: name || icon, touchW: hit.radius * 2, touchH: hit.radius * 2 });
  return c;
}

// Capsule button: style 'green' (white text) or 'yellow' (brown text).
export function capsuleButton(scene, x, y, label, { w = 140, h = 48, style = 'green', onClick, name } = {}) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const fill = style === 'yellow' ? COLORS.yellow : COLORS.grass;
  const edge = style === 'yellow' ? 0xc9962a : COLORS.grassDark;
  g.fillStyle(edge).fillRoundedRect(-w / 2, -h / 2 + 3, w, h, h / 2);
  g.fillStyle(fill).fillRoundedRect(-w / 2, -h / 2, w, h - 2, h / 2);
  g.fillStyle(0xffffff, 0.25).fillRoundedRect(-w / 2 + 10, -h / 2 + 5, w - 20, h / 3, h / 6);
  c.add(g);
  c.add(text(scene, 0, -1, label, 20, { color: style === 'yellow' ? COLORS.text : '#ffffff', ox: 0.5, oy: 0.5, stroke: style === 'yellow' ? undefined : '#4f7d3a', strokeThickness: 3 }));
  const hit = scene.add.rectangle(0, 0, w, Math.max(h, MIN_TOUCH), 0xffffff, 0.001);
  c.add(hit);
  makeClickable(scene, hit, onClick, { pressTargets: [c] });
  c.setData({ name: name || label, touchW: w, touchH: Math.max(h, MIN_TOUCH) });
  return c;
}

// Item slot: rounded cream square, optional icon texture and count.
export function slot(scene, x, y, { size = 64, iconKey, count, selected = false, onClick, name } = {}) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  c.add(g);
  const draw = (sel) => {
    g.clear();
    if (sel) g.fillStyle(COLORS.yellow).fillRoundedRect(-size / 2 - 4, -size / 2 - 4, size + 8, size + 8, 18);
    g.fillStyle(COLORS.creamDark).fillRoundedRect(-size / 2, -size / 2, size, size, 16);
    g.fillStyle(0xd9c9a3, 0.6).fillRoundedRect(-size / 2, size / 2 - 8, size, 8, { tl: 0, tr: 0, bl: 16, br: 16 });
  };
  draw(selected);
  if (iconKey) {
    const img = scene.add.image(0, -2, iconKey);
    img.setScale((size * 0.78) / Math.max(img.width, img.height));
    c.add(img);
  }
  if (count != null) c.add(text(scene, size / 2 - 6, size / 2 - 4, String(count), 16, { color: '#ffffff', stroke: '#5b3d26', ox: 1, oy: 1 }));
  if (onClick) {
    const hit = scene.add.rectangle(0, 0, Math.max(size, MIN_TOUCH), Math.max(size, MIN_TOUCH), 0xffffff, 0.001);
    c.add(hit);
    makeClickable(scene, hit, onClick);
    c.setData({ name: name || 'slot', touchW: Math.max(size, MIN_TOUCH), touchH: Math.max(size, MIN_TOUCH) });
  }
  c.setSelected = draw;
  return c;
}

// Small pill label (e.g. item category tag in pink).
export function tag(scene, x, y, label, color = 0xf0a9a0) {
  const t = text(scene, 0, 0, label, 13, { color: '#ffffff', ox: 0.5, oy: 0.5 });
  const w = t.width + 18;
  const g = scene.add.graphics().fillStyle(color).fillRoundedRect(-w / 2, -12, w, 24, 12);
  return scene.add.container(x, y, [g, t]);
}

// Wood-framed capsule progress bar with an icon on the left.
export function statBar(scene, x, y, { w = 150, icon = 'heart', color = 0xe8564a } = {}) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const fill = scene.add.graphics();
  g.fillStyle(COLORS.woodDark).fillRoundedRect(0, -11, w, 22, 11);
  g.fillStyle(COLORS.creamDark).fillRoundedRect(3, -8, w - 6, 16, 8);
  const label = text(scene, w - 10, 0, '', 12, { color: '#ffffff', stroke: '#5b3d26', strokeThickness: 3, ox: 1, oy: 0.5 });
  const ic = drawIcon(scene, icon, 26); ic.setPosition(0, 0);
  c.add([g, fill, label, ic]);
  c.setValue = (v, max) => {
    const k = Phaser.Math.Clamp(v / max, 0, 1);
    fill.clear();
    if (k > 0) fill.fillStyle(color).fillRoundedRect(3, -8, Math.max(16, (w - 6) * k), 16, 8);
    label.setText(`${Math.round(v)}/${max}`);
  };
  return c;
}

// --- vector icons, centred at (0,0), roughly `s` px wide ---
export function drawIcon(scene, kind, s) {
  const g = scene.add.graphics();
  const k = s / 24;
  const W = 0xffffff, D = COLORS.woodDark;
  switch (kind) {
    case 'close':
      g.lineStyle(5 * k, W).beginPath();
      g.moveTo(-7 * k, -7 * k); g.lineTo(7 * k, 7 * k); g.moveTo(7 * k, -7 * k); g.lineTo(-7 * k, 7 * k); g.strokePath();
      break;
    case 'back':
      g.lineStyle(5 * k, W).beginPath();
      g.arc(1 * k, 2 * k, 7 * k, Math.PI * 1.1, Math.PI * 2.35, false); g.strokePath();
      g.fillStyle(W).fillTriangle(-11 * k, -2 * k, -1 * k, -6 * k, -4 * k, 4 * k);
      break;
    case 'bag':
      g.fillStyle(W).fillRoundedRect(-9 * k, -4 * k, 18 * k, 15 * k, 4 * k);
      g.lineStyle(3 * k, W).beginPath(); g.arc(0, -4 * k, 5 * k, Math.PI, 0); g.strokePath();
      g.fillStyle(D).fillRect(-6 * k, 1 * k, 12 * k, 2.5 * k);
      break;
    case 'paw':
      g.fillStyle(W).fillEllipse(0, 5 * k, 13 * k, 10 * k);
      for (const [px, py] of [[-8, -3], [-3, -8], [3, -8], [8, -3]]) g.fillCircle(px * k, py * k, 3.2 * k);
      break;
    case 'map': // location pin
      g.fillStyle(W).fillCircle(0, -3 * k, 8 * k).fillTriangle(-6.8 * k, 1 * k, 6.8 * k, 1 * k, 0, 11 * k);
      g.fillStyle(0xb57a4a).fillCircle(0, -3 * k, 3.4 * k);
      break;
    case 'gear':
      g.fillStyle(W);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.fillCircle(Math.cos(a) * 8 * k, Math.sin(a) * 8 * k, 3 * k); }
      g.fillCircle(0, 0, 8 * k); g.fillStyle(0xb57a4a).fillCircle(0, 0, 3.5 * k);
      break;
    case 'heart':
      g.fillStyle(0xe8564a).fillCircle(-4.5 * k, -3 * k, 6 * k).fillCircle(4.5 * k, -3 * k, 6 * k)
        .fillTriangle(-10.3 * k, -1 * k, 10.3 * k, -1 * k, 0, 10 * k);
      g.fillStyle(0xffffff, 0.6).fillCircle(-5 * k, -5 * k, 2 * k);
      break;
    case 'apple':
      g.fillStyle(0xf09a3a).fillCircle(-3.5 * k, 2 * k, 7 * k).fillCircle(3.5 * k, 2 * k, 7 * k);
      g.fillStyle(0x6fae4a).fillEllipse(4 * k, -8 * k, 8 * k, 4 * k);
      g.fillStyle(0x8a5a36).fillRect(-1 * k, -9 * k, 2 * k, 5 * k);
      break;
    case 'clover':
      g.fillStyle(0x5aa83c);
      for (const [px, py] of [[0, -5], [5, 0], [0, 5], [-5, 0]]) g.fillCircle(px * k, py * k, 5 * k);
      g.fillStyle(0x3f7d2a).fillRect(-1 * k, 4 * k, 2 * k, 8 * k);
      break;
    case 'moon':
      g.fillStyle(COLORS.yellow).fillCircle(0, 0, 9 * k);
      g.fillStyle(COLORS.cream).fillCircle(4.5 * k, -3.5 * k, 8 * k);
      g.fillStyle(COLORS.yellow).fillCircle(-8 * k, -8 * k, 1.4 * k).fillCircle(8 * k, 8 * k, 1.2 * k);
      break;
    case 'dusk': // sun half below the horizon
      g.fillStyle(0xf08a3a).slice(0, 3 * k, 8 * k, Math.PI, 0, false).fillPath();
      g.fillStyle(0xf08a3a);
      for (let i = 0; i < 5; i++) { const a = Math.PI + (i + 0.5) * Math.PI / 5; g.fillCircle(Math.cos(a) * 12 * k, 3 * k + Math.sin(a) * 12 * k, 1.6 * k); }
      g.fillStyle(COLORS.woodMid).fillRect(-12 * k, 4 * k, 24 * k, 2 * k);
      break;
    case 'sun':
      g.fillStyle(COLORS.yellow).fillCircle(0, 0, 6 * k);
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.fillCircle(Math.cos(a) * 10 * k, Math.sin(a) * 10 * k, 1.8 * k); }
      break;
    default:
      g.fillStyle(W).fillCircle(0, 0, 6 * k);
  }
  return g;
}
