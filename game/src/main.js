import { GAME_W, GAME_H, VIEW3D } from './config.js';
import BootScene from './scenes/BootScene.js';
import PlayScene from './scenes/PlayScene.js';
import UIScene from './scenes/UIScene.js';
import BattleScene from './scenes/BattleScene.js';
import TitleScene from './scenes/TitleScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#9fd3e6',
  transparent: VIEW3D,   // the 3D world canvas sits underneath
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 }, // joystick + action button at the same time
  scene: [BootScene, TitleScene, PlayScene, UIScene, BattleScene], // UIScene is launched by PlayScene and draws on top
});

// Handle for automated checks (tools/ smoke test) and debugging in the console.
window.__game = game;

// 3D world view (trial): loaded only when asked for, so the 2D game never pays for it.
if (VIEW3D) import('./view3d/World3D.js').then((m) => { game.view3d = new m.default(game); });
