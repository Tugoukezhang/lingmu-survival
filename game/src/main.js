import { GAME_W, GAME_H } from './config.js';
import BootScene from './scenes/BootScene.js';
import PlayScene from './scenes/PlayScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#9fd3e6',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 }, // joystick + action button at the same time
  scene: [BootScene, PlayScene],
});

// Handle for automated checks (tools/ smoke test) and debugging in the console.
window.__game = game;
