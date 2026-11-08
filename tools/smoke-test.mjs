// Automated smoke test for the game prototype.
// Serves game/ on a local port, opens it in Microsoft Edge with a phone-sized
// landscape viewport (touch enabled), drives keyboard / touch / interact and
// checks the results. Screenshots go to tools/out/.
//
// usage (from repo root):  cd tools && npm install && node smoke-test.mjs
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('../game/', import.meta.url));
const OUT = fileURLToPath(new URL('./out/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.md': 'text/plain' };

const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try {
    const body = await readFile(join(ROOT, path || 'index.html'));
    res.writeHead(200, { 'content-type': TYPES[extname(path || 'index.html')] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
await mkdir(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

  await page.goto(url);
  await page.waitForFunction(() => window.__game?.scene?.isActive('play'), null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const state = () => page.evaluate(() => window.__game.scene.getScene('play').debugState());
  const scene = (fn, arg) => page.evaluate(fn, arg);
  await page.screenshot({ path: join(OUT, '01-start.png') });

  const s0 = await state();
  check('场景加载、玩家站在可走区域', s0.onWalkable, JSON.stringify(s0.player));
  const box = await page.locator('canvas').boundingBox();
  check('横屏画面按 16:9 完整缩放', Math.abs(box.width / box.height - 16 / 9) < 0.02 && box.height <= 390.5, `${Math.round(box.width)}×${Math.round(box.height)}`);

  // keyboard
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(800); await page.keyboard.up('ArrowRight');
  const s1 = await state();
  check('键盘向右移动', s1.player.x - s0.player.x > 60, `x ${s0.player.x} → ${s1.player.x}`);

  // touch joystick: press in the left zone and drag upward
  const cdp = await ctx.newCDPSession(page);
  const sx = box.x + box.width * 0.15, sy = box.y + box.height * 0.75;
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', sx, sy);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', sx, sy - i * 8); await page.waitForTimeout(16); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, '02-joystick.png') });
  await touch('touchEnd');
  const s2 = await state();
  check('触屏摇杆向上移动', s1.player.y - s2.player.y > 50, `y ${s1.player.y} → ${s2.player.y}`);

  // walk into the island edge for a long time: must stay on walkable ground
  await keyHold(page, 'ArrowDown', 4000);
  const s3 = await state();
  check('走到岛边不会掉出去', s3.onWalkable, JSON.stringify(s3.player));
  await page.screenshot({ path: join(OUT, '02b-edge.png') });
  await keyHold(page, 'ArrowLeft', 4000);
  check('沿边缘横向走也不会出界', (await state()).onWalkable);

  // interact: stand next to the fox and press E → fox follows
  await scene(() => {
    const sc = window.__game.scene.getScene('play');
    const fox = sc.pets.find((p) => p.data.id === 'fox');
    sc.teleport(fox.sprite.x + 30, fox.sprite.y + 4);
  });
  await page.waitForTimeout(100);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  const s4 = await state();
  check('靠近宠物按互动 → 换成它跟随', s4.follower === 'fox', `follower=${s4.follower}`);
  await page.screenshot({ path: join(OUT, '03-swap.png') });

  // press E again next to the follower fox → human form (demo)
  await scene(() => {
    const sc = window.__game.scene.getScene('play');
    sc.teleport(sc.follower.sprite.x + 30, sc.follower.sprite.y);
  });
  await page.waitForTimeout(100);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(400);
  const s5 = await state();
  check('焰尾狐化形演示', s5.followerHuman === true);
  await page.screenshot({ path: join(OUT, '04-human-form.png') });

  // action button on screen (touch) works too: walk to another pet and tap the button
  await scene(() => {
    const sc = window.__game.scene.getScene('play');
    const pet = sc.pets.find((p) => p.data.id === 'starbear');
    sc.teleport(pet.sprite.x + 30, pet.sprite.y + 4);
  });
  await page.waitForTimeout(150);
  await page.touchscreen.tap(box.x + box.width * (864 / 960), box.y + box.height * (444 / 540));
  await page.waitForTimeout(300);
  const s6 = await state();
  check('点屏幕右下「互动」按钮也能换宠物', s6.follower === 'starbear', `follower=${s6.follower}`);

  // portrait: rotate hint visible
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  check('竖屏时提示横过来', await page.locator('#rotate').isVisible());
  await page.screenshot({ path: join(OUT, '05-portrait.png') });

  check('没有脚本报错', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed. Screenshots: tools/out/`);
process.exit(failed ? 1 : 0);

async function keyHold(page, key, ms) {
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key);
}
