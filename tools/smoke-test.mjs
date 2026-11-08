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

  // keyboard (start from a spot with clear ground to the right, so map layout can't block the test)
  const goClear = (dx, dy, len) => scene(([dx, dy, len]) => {
    const sc = window.__game.scene.getScene('play');
    const p = sc.findClearRun(dx, dy, len); sc.teleport(p.x, p.y); return p;
  }, [dx, dy, len]);
  await goClear(1, 0, 5); await page.waitForTimeout(100);
  const s0b = await state();
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(800); await page.keyboard.up('ArrowRight');
  const s1 = await state();
  check('键盘向右移动', s1.player.x - s0b.player.x > 60, `x ${s0b.player.x} → ${s1.player.x}`);
  await goClear(0, -1, 6); await page.waitForTimeout(100);
  const s1b = await state();

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
  check('触屏摇杆向上移动', s1b.player.y - s2.player.y > 50, `y ${s1b.player.y} → ${s2.player.y}`);

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

  // press E again next to the follower fox → human form (demo); do it in open ground away from other pets
  await goClear(1, 0, 3);
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

  // ---------- UI framework (T03) ----------
  const ui = () => page.evaluate(() => window.__game.scene.getScene('ui').debugUi());
  const tapGame = (gx, gy) => page.touchscreen.tap(box.x + gx * box.width / 960, box.y + gy * box.height / 540);
  const tapTarget = async (name) => {
    const p = await page.evaluate((n) => window.__game.scene.getScene('ui').findTarget(n), name);
    if (!p) throw new Error(`UI target not found: ${name}`);
    await tapGame(p.x, p.y); await page.waitForTimeout(300);
  };
  const smallTargets = (u) => u.targets.filter((t) => t.w < u.minTouch || t.h < u.minTouch);

  let u = await ui();
  check('HUD 显示天数时间和货币', u.day.includes('第 1 天') && u.day.includes('06:00') && u.clover === '120', `${u.day} / ${u.clover}`);
  check('HUD 离屏幕边缘 ≥ 24', u.hudEdge >= 24, `最近 ${u.hudEdge}px`);
  await page.evaluate(() => window.__game.registry.set('clover', 345));
  await page.waitForTimeout(50);
  check('数值变化时 HUD 自动更新', (await ui()).clover === '345');

  await tapTarget('hud-bag');
  u = await ui();
  check('点「背包」打开面板', u.stack.join() === 'bag', u.stack.join());
  await page.screenshot({ path: join(OUT, '06-bag.png') });
  check('背包面板按钮触控尺寸 ≥ 44', smallTargets(u).length === 0, JSON.stringify(smallTargets(u)));
  const before = await state();
  await keyHold(page, 'ArrowRight', 500);
  check('面板打开时角色不会移动', (await state()).player.x === before.player.x);
  await tapTarget('slot-item_campfire');
  await page.screenshot({ path: join(OUT, '06b-bag-campfire.png') });
  await tapTarget('close');
  check('点关闭按钮关闭面板', (await ui()).stack.length === 0);

  await tapTarget('hud-settings');
  await tapTarget('restart');
  u = await ui();
  check('面板可以叠加（设置 → 确认框）', u.stack.join() === 'settings,confirm', u.stack.join());
  await page.screenshot({ path: join(OUT, '07-confirm.png') });
  await tapTarget('back');
  check('返回按钮只关一层', (await ui()).stack.join() === 'settings');
  const beforeBackdrop = await state();
  await tapGame(60, 500); await page.waitForTimeout(400);
  check('点面板外的暗处关闭面板', (await ui()).stack.length === 0);
  check('关闭面板的那一下不会让角色走动', (await state()).player.x === beforeBackdrop.player.x);

  await tapTarget('hud-pets');
  await page.screenshot({ path: join(OUT, '08-pets.png') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('Esc 键关闭面板', (await ui()).stack.length === 0);
  await page.screenshot({ path: join(OUT, '09-hud.png') });

  // ---------- save (T08) ----------
  const reload = async () => {
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene?.isActive('ui'), null, { timeout: 15000 });
    await page.waitForTimeout(600);
  };
  const toastText = () => page.evaluate(() => window.__game.scene.getScene('ui').toast.text);
  const savedOk = await scene(() => {
    const g = window.__game, sc = g.scene.getScene('play');
    g.registry.set('clover', 777);
    const p = sc.findClearRun(0, 1, 2); sc.teleport(p.x, p.y);
    return g.session.save('test');
  });
  const beforeReload = await state();
  await reload();
  const afterReload = await state();
  check('存档写入成功', savedOk);
  check('刷新后四叶草保留', (await ui()).clover === '777', (await ui()).clover);
  check('刷新后位置和同行宠物保留', afterReload.player.x === beforeReload.player.x && afterReload.player.y === beforeReload.player.y
    && afterReload.follower === beforeReload.follower, `${JSON.stringify(beforeReload)} → ${JSON.stringify(afterReload)}`);

  await page.evaluate(() => { window.__game.registry.set('clover', 999); window.dispatchEvent(new Event('pagehide')); });
  check('关闭页面时自动存档', await page.evaluate(() => window.__game.session.lastSave?.reason === 'hidden' && window.__game.session.lastSave.ok));

  // edit the save by hand → checksum fails → backup (the previous save) is used
  await page.evaluate(() => {
    const g = window.__game;
    g.registry.set('clover', 888); g.session.save('test');
    g.session.store.block('test'); // so the reload's own autosave can't overwrite the damage
    const raw = localStorage.getItem('lingmu.save.main');
    localStorage.setItem('lingmu.save.main', raw.replace('"clover":888', '"clover":99999'));
  });
  await reload();
  const restored = (await ui()).clover, notice = await toastText();
  check('存档被改坏 → 自动从备份恢复并提示', restored === '999' && notice.includes('备份'), `${restored} / ${notice}`);
  await page.screenshot({ path: join(OUT, '10-restored.png') });

  await tapTarget('hud-settings');
  await page.screenshot({ path: join(OUT, '11-settings.png') });
  await tapTarget('restart');
  await tapTarget('ok');
  await page.waitForFunction(() => window.__game.scene.isActive('ui') && window.__game.scene.getScene('ui').cloverText?.text === '120', null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const fresh = await page.evaluate(() => ({ clover: window.__game.scene.getScene('ui').cloverText.text, follower: window.__game.scene.getScene('play').debugState().follower,
    stored: localStorage.getItem('lingmu.save.main')?.includes('"clover":120'), backup: localStorage.getItem('lingmu.save.backup') }));
  check('设置 → 重新开始：进度清空、存档重置', fresh.clover === '120' && fresh.follower === 'pup' && fresh.stored && fresh.backup === null, JSON.stringify(fresh).slice(0, 160));
  await page.screenshot({ path: join(OUT, '12-new-game.png') });

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
