// Global constants. Logical resolution is fixed at 960x540 (landscape) and
// scaled to fit the screen; see CLAUDE.md "技术约定".
export const GAME_W = 960;
export const GAME_H = 540;
export const TILE = 48;

// UI palette from docs/01_美术风格指南.md
export const COLORS = {
  woodDark: 0x5b3d26,
  woodMid: 0x8a5a36,
  cream: 0xfbf3dc,
  creamDark: 0xefe2c2,
  grass: 0x7fb85a,
  grassDark: 0x4f7d3a,
  yellow: 0xf5c84b,
  text: '#5a4030',
};

export const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

// URL flags: ?debug=1 shows FPS and player tile; ?seed=123 changes the placeholder island.
const params = new URLSearchParams(location.search);
export const DEBUG = params.has('debug');
export const SEED = Number(params.get('seed')) || 20261108;
// ?timescale=60 makes game time run 60× faster (testing day/night)
// ?demo=1 skips the title page; a new game then starts with all six pets (tests, demos)
export const DEMO = params.has('demo');
// ?3d=1: the world is drawn in 3D by view3d/World3D.js (trial; docs/14)
export const VIEW3D = params.has('3d');
export const TIMESCALE = Math.max(0.1, Number(params.get('timescale')) || 1);
