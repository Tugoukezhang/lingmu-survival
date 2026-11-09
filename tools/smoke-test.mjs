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

  await page.goto(`${url}?demo=1`);   // demo start: skip the title page, all six pets (title flow is tested at the end)
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

  // interact: stand next to the fox, press E → care panel → 「跟着我」 → fox follows (T12)
  const tapUi = async (name) => {
    const q = await page.evaluate((n) => window.__game.scene.getScene('ui').findTarget(n), name);
    if (!q) throw new Error(`UI target not found: ${name}`);
    await page.touchscreen.tap(box.x + q.x * box.width / 960, box.y + q.y * box.height / 540); await page.waitForTimeout(300);
  };
  await scene(() => {
    const sc = window.__game.scene.getScene('play');
    const fox = sc.pets.find((p) => p.data.id === 'fox');
    sc.teleport(fox.sprite.x + 30, fox.sprite.y + 4);
  });
  await page.waitForTimeout(100);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  check('靠近宠物按互动 → 打开照顾面板', await page.evaluate(() => window.__game.scene.getScene('ui').stack.names.join() === 'petcare'));
  await page.screenshot({ path: join(OUT, '03a-petcare.png') });
  await tapUi('care-lead');
  const s4 = await state();
  check('照顾面板点「跟着我」→ 换成它跟随', s4.follower === 'fox', `follower=${s4.follower}`);
  await page.screenshot({ path: join(OUT, '03-swap.png') });

  // fox's care panel → 化形 (demo); do it in open ground away from other pets
  await goClear(1, 0, 3);
  await page.waitForTimeout(400);
  // the human form must be unlocked first (T39): evolved + affection 100 + 化形铃 → here we set it up directly
  await page.evaluate(() => { const f = window.__game.session.state.pets.find((p) => p.uid === 'pet-fox'); f.evolved = true; f.canTransform = true; });
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  await tapUi('care-form');
  await tapUi('close');
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
  await page.waitForTimeout(350);
  await tapUi('care-lead');
  const s6 = await state();
  check('点屏幕右下「互动」按钮也能照顾宠物、让它跟着', s6.follower === 'starbear', `follower=${s6.follower}`);

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
  check('HUD 显示天数时间和货币', /第 1 天\s+0[67]:\d\d/.test(u.day) && u.clover === '120', `${u.day} / ${u.clover}`);
  check('HUD 离屏幕边缘 ≥ 24', u.hudEdge >= 24, `最近 ${u.hudEdge}px`);
  const guide0 = await page.evaluate(() => { const ui = window.__game.scene.getScene('ui'); return { visible: ui.guideBox.visible, text: ui.guideText.text }; });
  check('新手目标显示在状态条下方（第一个：去码头出发）', guide0.visible && guide0.text.includes('码头'), JSON.stringify(guide0));
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

  // ---------- time & day/night (T10) ----------
  const advanceTo = (minute) => scene((m) => { const sc = window.__game.scene.getScene('play'); sc.debugAdvance(m - sc.state.clock); }, minute);
  const t0 = await state();
  await page.waitForTimeout(2100);
  const t1 = await state();
  check('时间自己往前走（约 0.67 秒 1 游戏分钟）', t1.clock - t0.clock >= 2 && t1.clock - t0.clock <= 4, `${t0.clock} → ${t1.clock}`);
  await tapTarget('hud-bag');
  const p0 = (await state()).clock; await page.waitForTimeout(1500); const p1 = (await state()).clock;
  await tapTarget('close');
  check('打开面板时时间暂停', p0 === p1, `${p0} → ${p1}`);
  await advanceTo(19 * 60); await page.waitForTimeout(150);
  const dusk = await state();
  check('19:00 黄昏：画面变暗、HUD 时间更新', dusk.phase === 'dusk' && dusk.tint > 0.1 && /19:0\d/.test((await ui()).day), `${dusk.phase} ${dusk.tint} ${(await ui()).day}`);
  await page.screenshot({ path: join(OUT, '13-dusk.png') });
  await advanceTo(21 * 60 + 30); await page.waitForTimeout(150);
  const night = await state();
  check('21:30 夜晚：更暗', night.phase === 'night' && night.tint > dusk.tint, `${night.phase} ${night.tint}`);
  await page.screenshot({ path: join(OUT, '14-night.png') });
  await advanceTo(24 * 60);
  await page.waitForTimeout(2600);
  const morning = await state();
  u = await ui();
  const savedDay = await page.evaluate(() => localStorage.getItem('lingmu.save.main')?.match(/"day":(\d+)/)?.[1]);
  check('24:00 家园强制睡觉 → 第 2 天 6:00，弹出结算，结算后已存档', u.stack.join() === 'summary' && morning.day === 2 && morning.clock === 360 && u.day.includes('第 2 天') && savedDay === '2',
    `${u.stack.join()} day ${morning.day} clock ${morning.clock} saved ${savedDay}`);
  await page.screenshot({ path: join(OUT, '15-summary.png') });
  await tapTarget('summary-ok');
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.bed.x + 10, sc.bed.y + 36); });
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  check('在帐篷旁按互动 → 询问是否睡觉', (await ui()).stack.join() === 'sleep', (await ui()).stack.join());
  await page.screenshot({ path: join(OUT, '16-sleep-confirm.png') });
  await tapTarget('ok');
  await page.waitForTimeout(1800);
  check('确认睡觉 → 第 3 天', (await state()).day === 3 && (await ui()).stack.join() === 'summary', `day ${(await state()).day}`);
  await tapTarget('summary-ok');

  // ---------- survival (T20) ----------
  const reg = (k) => page.evaluate((key) => window.__game.registry.get(key), k);
  await page.evaluate(() => window.__game.registry.set({ hunger: 50, hp: 80 }));
  const h0 = await reg('hunger');
  await scene(() => window.__game.scene.getScene('play').debugAdvance(60));
  const h1 = await reg('hunger');
  check('饱食随时间下降（60 游戏分钟 −6）', h0 - h1 === 6, `${h0} → ${h1}`);
  await tapTarget('hud-bag');
  await tapTarget('slot-item_berry');
  const berry0 = await page.evaluate(() => window.__game.session.state.inventory.find((x) => x.id === 'item_berry')?.count);
  await tapTarget('use');
  const berry1 = await page.evaluate(() => window.__game.session.state.inventory.find((x) => x.id === 'item_berry')?.count);
  const h2 = await reg('hunger');
  check('背包里吃浆果：饱食 +10、浆果 −1、HUD 跟着变', h2 === h1 + 10 && berry1 === berry0 - 1 && (await toastText()).includes('浆果'), `${h1} → ${h2}, 浆果 ${berry0} → ${berry1}`);
  await page.screenshot({ path: join(OUT, '17-eat.png') });
  await tapTarget('close');
  await page.evaluate(() => window.__game.registry.set({ hunger: 0, hp: 5 }));
  await scene(() => window.__game.scene.getScene('play').debugAdvance(30));
  const lowHud = await page.evaluate(() => ({ hp: window.__game.registry.get('hp'), low: window.__game.scene.getScene('ui').hpBar.low }));
  check('家园饿到底：生命停在 1 不倒下，有提示，生命条闪烁', lowHud.hp === 1 && lowHud.low && (await toastText()).includes('吃'), `${JSON.stringify(lowHud)} / ${await toastText()}`);
  await page.screenshot({ path: join(OUT, '18-starving.png') });

  // ---------- expedition island (T05) ----------
  const waitArea = (area) => page.waitForFunction((a) => window.__game.scene.getScene('play')?.area === a && window.__game.scene.isActive('play') && window.__game.scene.isActive('ui'), area, { timeout: 10000 });
  await page.evaluate(() => window.__game.registry.set({ hp: 100, hunger: 100 })); // earlier checks left the player starving
  await scene(() => window.__game.scene.getScene('play').travelTo(20261108));
  await waitArea('expedition'); await page.waitForTimeout(800);
  const ex1 = await state();
  const partyOnly = await page.evaluate(() => window.__game.scene.getScene('play').pets.length === window.__game.session.state.party.length);
  check('换地图后 HUD 的昼夜图标还在', await page.evaluate(() => !!window.__game.scene.getScene('ui').dayIcon?.active));
  check('去远征岛：站在着陆点的可走区域，只带队伍里的宠物', ex1.area === 'expedition' && ex1.onWalkable && partyOnly && ex1.island.pets >= 4, JSON.stringify(ex1.island));
  await page.screenshot({ path: join(OUT, '19-expedition.png') });
  // ---------- pet battle (T06) ----------
  await page.evaluate(() => { window.__battleFast = true; });
  const bt = () => page.evaluate(() => window.__game.scene.isActive('battle') ? window.__game.scene.getScene('battle').debugBattle() : null);
  const tapBattle = async (name) => {
    const q = await page.evaluate((n) => window.__game.scene.getScene('battle').findTarget(n), name);
    if (!q) throw new Error(`battle target not found: ${name}`);
    await tapGame(q.x, q.y); await page.waitForTimeout(120);
  };
  const waitIdle = () => page.waitForFunction(() => { const s = window.__game.scene.getScene('battle'); return !window.__game.scene.isActive('battle') || (!s.busy && (s.menu || s.endPanel)); }, null, { timeout: 8000 });
  const meetWild = async (i) => {
    await scene((k) => { const sc = window.__game.scene.getScene('play'); const w = sc.wild[k]; sc.teleport(w.sprite.x + 18, w.sprite.y); }, i);
    await page.waitForFunction(() => window.__game.scene.isActive('battle'), null, { timeout: 4000 });
    await waitIdle();
  };
  const playToEnd = async () => {
    for (let k = 0; k < 60; k++) {
      const b = await bt();
      if (!b || b.over) break;
      if (b.menu === 'forced-switch') {
        const idx = await page.evaluate(() => window.__game.scene.getScene('battle').battle.sides.me.mons.findIndex((m) => m.hp > 0));
        await tapBattle(`switch-${idx}`);
      } else {
        if (b.menu !== 'skills') await tapBattle('cmd-skill');
        const sk = await page.evaluate(() => { const bb = window.__game.scene.getScene('battle').battle; const m = bb.sides.me.mons[bb.sides.me.active]; return m.skills.find((id) => m.uses[id] > 0 && id !== 'heal' && id !== 'shell' && id !== 'puff') ?? m.skills.find((id) => m.uses[id] > 0); });
        await tapBattle(`skill-${sk}`);
      }
      await waitIdle();
    }
  };
  const wildCount0 = await page.evaluate(() => window.__game.scene.getScene('play').wild.length);
  const clover0b = await reg('clover');
  await meetWild(0);
  const clockAtStart = (await state()).clock;
  const bs = await bt();
  check('碰到野生宠物 → 进入对战，世界暂停、HUD 隐藏', !!bs && bs.menu === 'main' && await page.evaluate(() => window.__game.scene.isPaused('play') && !window.__game.scene.isVisible('ui')), JSON.stringify(bs));
  await page.screenshot({ path: join(OUT, '20-battle.png') });
  const btnSizes = await page.evaluate(() => ['cmd-skill', 'cmd-switch', 'cmd-snack', 'cmd-catch', 'cmd-flee'].map((n) => window.__game.scene.getScene('battle').findTarget(n)));
  check('对战按钮触控尺寸 ≥ 44', btnSizes.every((x) => x && x.w >= 44 && x.h >= 44), JSON.stringify(btnSizes.map((x) => x && [x.w, x.h])));
  await tapBattle('cmd-skill');
  await page.screenshot({ path: join(OUT, '20b-skills.png') });
  await page.waitForTimeout(1200);
  check('A07 对战期间时间暂停', (await state()).clock === clockAtStart);
  await playToEnd();
  const endB = await bt();
  await page.screenshot({ path: join(OUT, '20c-result.png') });
  check('打到分出胜负 → 出现结算面板', !!endB?.over && !!(await page.evaluate(() => window.__game.scene.getScene('battle').findTarget('battle-continue'))), JSON.stringify(endB));
  await tapBattle('battle-continue');
  await page.waitForTimeout(500);
  const afterB = await state();
  const wildCount1 = await page.evaluate(() => window.__game.scene.getScene('play').wild.length);
  check('点继续 → 回到岛上，世界恢复，HUD 回来', !(await bt()) && !afterB.inBattle && await page.evaluate(() => !window.__game.scene.isPaused('play') && window.__game.scene.isVisible('ui')));
  if (endB.over === 'win') check('打赢：野生宠物消失、得到四叶草', wildCount1 === wildCount0 - 1 && (await reg('clover')) > clover0b, `${wildCount0}→${wildCount1} 四叶草 ${clover0b}→${await reg('clover')}`);
  else check('打输：野生宠物还在、提示伙伴累了', wildCount1 === wildCount0, endB.over);
  // ---------- catching (T07) ----------
  await page.evaluate(() => { const st = window.__game.session.state; for (const x of st.pets) x.hp = null; });
  await page.waitForTimeout(4200);
  const petsBefore = await page.evaluate(() => window.__game.session.state.pets.length);
  const wildBefore = await page.evaluate(() => window.__game.scene.getScene('play').wild.length);
  await meetWild(0);
  await page.evaluate(() => { for (const m of window.__game.scene.getScene('battle').battle.sides.foe.mons) m.stats.atk = 1; }); // keep this check deterministic
  await tapBattle('cmd-snack'); await page.waitForTimeout(150);
  const snackName = await page.evaluate(() => window.__game.scene.getScene('battle').battle.inventory.find((s) => s.id.startsWith('item_') && ['item_berry', 'item_carrot', 'item_fish_roast'].includes(s.id))?.id);
  await tapBattle(`snack-${snackName}`); await waitIdle();
  await tapBattle('cmd-catch'); await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, '28-catch-menu.png') });
  const shown = await page.evaluate(() => window.__game.scene.getScene('battle').findTarget('net-item_net_grass'));
  check('捕捉菜单列出捕宠网和成功率', !!shown);
  await page.evaluate(() => { window.__game.scene.getScene('battle').battle.rng = () => 0.01; });   // make the throw succeed
  await tapBattle('net-item_net_grass'); await waitIdle();
  const caughtB = await bt();
  await page.screenshot({ path: join(OUT, '29-caught.png') });
  check('扔网成功 → 捕捉成功结算', caughtB?.over === 'caught', JSON.stringify(caughtB));
  const dupBtn = await page.evaluate(() => window.__game.scene.getScene('battle').findTarget('catch-keep'));
  await tapBattle(dupBtn ? 'catch-keep' : 'battle-continue'); await page.waitForTimeout(500);
  const afterCatch = await page.evaluate(() => ({ pets: window.__game.session.state.pets.length, party: window.__game.session.state.party.length, wild: window.__game.scene.getScene('play').wild.length }));
  check('抓到的宠物进入存档（队伍满了送回家园），野生宠物从岛上消失', afterCatch.pets === petsBefore + 1 && afterCatch.party === 3 && afterCatch.wild === wildBefore - 1, JSON.stringify(afterCatch));
  // A05: flee keeps the wild pet
  await page.evaluate(() => { const st = window.__game.session.state; for (const x of st.pets) x.hp = null; });
  const wc = await page.evaluate(() => window.__game.scene.getScene('play').wild.length);
  await meetWild(0);
  await tapBattle('cmd-flee'); await waitIdle();
  await tapBattle('battle-continue'); await page.waitForTimeout(400);
  check('A05 溜走 → 回到岛上，野生宠物还在', await page.evaluate(() => window.__game.scene.getScene('play').wild.length) === wc);
  // A03: refresh in the middle of a battle → state from before the battle, no double rewards
  await page.waitForTimeout(4200); // encounter cooldown
  await meetWild(0);
  const preSave = await page.evaluate(() => localStorage.getItem('lingmu.save.main')); // last save before the battle
  check('A03 对战开始时存档被挡住', await page.evaluate(() => window.__game.session.store.blocked && window.__game.session.save('test') === false));
  await tapBattle('cmd-skill');
  const sk1 = await page.evaluate(() => { const bb = window.__game.scene.getScene('battle').battle; return bb.sides.me.mons[bb.sides.me.active].skills[0]; });
  await tapBattle(`skill-${sk1}`); await waitIdle();
  const stored = await page.evaluate(() => localStorage.getItem('lingmu.save.main'));
  check('A03 对战中不写存档', stored === preSave);
  await reload(); await waitArea('expedition');
  const noDup = await page.evaluate((pre) => { const st = window.__game.session.state; const p = JSON.parse(pre.slice(9)); return st.clover === p.clover && JSON.stringify(st.pets.map((x) => [x.level, x.exp, x.hp])) === JSON.stringify(p.pets.map((x) => [x.level, x.exp, x.hp])); }, preSave);
  check('A03 对战中刷新 → 回到进战斗前的状态，不重复发奖', noDup && !(await bt()));
  await scene(() => { const sc = window.__game.scene.getScene('play'); const l = sc.island.landing; sc.teleport(l.tx * 48 + 24, l.ty * 48 + 24); });
  for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) await keyHold(page, k, 1200);
  check('在远征岛上乱走不会卡进树里或掉出岛', (await state()).onWalkable, JSON.stringify((await state()).player));
  const exPos = await state();
  await reload(); await waitArea('expedition');
  const ex2 = await state();
  check('刷新后还在同一座远征岛的同一位置', ex2.area === 'expedition' && ex2.island.seed === ex1.island.seed && Math.abs(ex2.player.x - exPos.player.x) < 4 && Math.abs(ex2.player.y - exPos.player.y) < 4,
    `${JSON.stringify(exPos.player)} → ${JSON.stringify(ex2.player)}`);
  await scene(() => window.__game.scene.getScene('play').goHome());
  await waitArea('home'); await page.waitForTimeout(500);
  check('回到家园岛', (await state()).area === 'home' && (await state()).onWalkable);

  // ---------- party panel (T07) ----------
  await tapTarget('hud-pets');
  const newUid = await page.evaluate(() => window.__game.session.state.pets.at(-1).uid);
  check('宠物超过 6 只时可以翻页', !!(await page.evaluate(() => window.__game.scene.getScene('ui').findTarget('pets-next'))));
  await tapTarget('pets-next');
  await page.screenshot({ path: join(OUT, '30-party-page2.png') });
  await tapTarget('pets-prev');
  const leaveUid = await page.evaluate(() => window.__game.session.state.party[2]);
  await tapTarget(`pet-card-${leaveUid}`);
  await tapTarget('party-leave');
  await tapTarget('pets-next');
  await tapTarget(`pet-card-${newUid}`);
  await tapTarget('party-join');
  await tapTarget('party-lead');
  const pty = await page.evaluate(() => window.__game.session.state.party);
  check('回家后：让一只离队、新伙伴加入并设为领头', pty.length === 3 && pty[0] === newUid && !pty.includes(leaveUid), JSON.stringify(pty));
  check('队伍面板按钮触控尺寸 ≥ 44', smallTargets(await ui()).length === 0, JSON.stringify(smallTargets(await ui())));
  await page.screenshot({ path: join(OUT, '31-party-lead.png') });
  await tapTarget('close');
  const lead = await page.evaluate(() => window.__game.scene.getScene('play').follower.inst.uid);
  check('新领头跟在玩家身后', lead === newUid);

  // ---------- airship travel (T25) ----------
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.dock.x, sc.dock.y + 20); });
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  check('在码头按互动 → 打开出发面板（有「回到上次的岛」）', (await ui()).stack.join() === 'dock' && !!(await page.evaluate(() => window.__game.scene.getScene('ui').findTarget('depart-last'))), (await ui()).stack.join());
  await page.screenshot({ path: join(OUT, '21-dock.png') });
  const beforeTrip = await state();
  await tapTarget('depart-new');
  await waitArea('expedition'); await page.waitForTimeout(600);
  const trip = await state();
  const landTile = await scene(() => { const sc = window.__game.scene.getScene('play'); const l = sc.island.landing; return Math.hypot(sc.player.x - (l.tx * 48 + 24), sc.player.y - (l.ty * 48 + 24)); });
  check('到达新岛时站在飞艇着陆点', landTile < 4, `离着陆点 ${landTile}px`);
  check('选新的浮岛：到了另一座岛，过了 1 小时', trip.island.seed !== 20261108 && trip.clock - beforeTrip.clock >= 60 && trip.clock - beforeTrip.clock <= 62, `seed ${trip.island.seed} ${beforeTrip.clock} → ${trip.clock}`);
  await page.screenshot({ path: join(OUT, '22-new-island.png') });
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  check('着陆点旁边就能和飞艇互动 → 问要不要回家', (await ui()).stack.join() === 'return', (await ui()).stack.join());
  await tapTarget('ok');
  await waitArea('home'); await page.waitForTimeout(600);
  const back = await state();
  check('坐飞艇回家：出现在码头旁', back.area === 'home' && Math.hypot(back.player.x - back.dock.x, back.player.y - back.dock.y) < 40, JSON.stringify(back.player));
  // ---------- fainting & lost bag (T23) ----------
  await scene(() => window.__game.scene.getScene('play').travelTo(424242));
  await waitArea('expedition'); await page.waitForTimeout(500);
  await page.evaluate(() => window.__game.registry.set('day', 5));   // past the new-player protection (days 1–3)
  const dayBefore = (await state()).day;
  const invBefore = await page.evaluate(() => JSON.parse(JSON.stringify(window.__game.session.state.inventory)));
  const totalOf = (inv) => inv.reduce((n, s) => n + s.count, 0);
  await scene(() => window.__game.scene.getScene('play').standByResource('tree')); // faint away from the landing point
  await page.waitForTimeout(200);
  await page.evaluate(() => { window.__game.registry.set({ hp: 3, hunger: 0 }); window.__game.scene.getScene('play').debugAdvance(20); });
  await page.waitForTimeout(400);
  await waitArea('home'); await page.waitForTimeout(800);
  const woke = await state();
  check('远征中饿倒 → 第二天 8:00 在家醒来，生命 50', woke.day === dayBefore + 1 && woke.clock >= 480 && woke.clock < 483 && woke.hp === 50 && (await toastText()).includes('醒来'),
    `day ${dayBefore}→${woke.day} clock ${woke.clock} hp ${woke.hp} / ${await toastText()}`);
  await page.screenshot({ path: join(OUT, '23-woke.png') });
  const afterFaint = await page.evaluate(() => ({ inv: window.__game.session.state.inventory, bag: window.__game.session.state.expedition.lostBag }));
  check('E08 倒下：只留工具，其余进失物包，总数不变', afterFaint.inv.every((s) => ['item_axe', 'item_pickaxe', 'item_hoe', 'item_can', 'item_tent'].includes(s.id)) && !!afterFaint.bag
    && totalOf(afterFaint.inv) + totalOf(afterFaint.bag.items) === totalOf(invBefore), `${totalOf(invBefore)} → ${totalOf(afterFaint.inv)} + ${totalOf(afterFaint.bag?.items ?? [])}`);
  // E09: warning before abandoning the lost bag
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.dock.x, sc.dock.y + 20); });
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUT, '32-dock-lostbag.png') });
  await tapTarget('depart-new');
  check('E09 有失物包时选新的浮岛 → 先弹出提醒', (await ui()).stack.join() === 'dock,lost-warn', (await ui()).stack.join());
  await page.screenshot({ path: join(OUT, '33-lostbag-warning.png') });
  await tapTarget('cancel');
  await tapTarget('depart-last');
  await waitArea('expedition'); await page.waitForTimeout(600);
  const lbPos = (await state()).lostBag;
  check('回到上次的岛：失物包在倒下的地方', !!lbPos && Math.abs(lbPos.x - afterFaint.bag.x) < 1, JSON.stringify(lbPos));
  await page.screenshot({ path: join(OUT, '34-lostbag-island.png') });
  await scene((p) => window.__game.scene.getScene('play').teleport(p.x, p.y + 10), lbPos);
  await page.waitForTimeout(400);
  const picked = await page.evaluate(() => ({ inv: window.__game.session.state.inventory, bag: window.__game.session.state.expedition.lostBag }));
  check('E08 走到失物包上：东西全部捡回，数量和倒下前一样', !picked.bag && totalOf(picked.inv) === totalOf(invBefore) && (await toastText()).includes('捡回'), `${totalOf(picked.inv)} / ${await toastText()}`);
  // E10: refresh in the middle of the faint animation
  await page.evaluate(() => { const g = window.__game; g.registry.set({ hp: 3, hunger: 0 }); g.scene.getScene('play').debugAdvance(20); });
  await page.waitForTimeout(150);
  await reload(); await page.waitForTimeout(300);
  const e10 = await page.evaluate(() => { const st = window.__game.session.state; return { area: st.player.area, inv: st.inventory, bag: st.expedition.lostBag }; });
  check('E10 倒下过程中刷新：只有一个失物包，东西不多不少', e10.area === 'home' && !!e10.bag && totalOf(e10.inv) + totalOf(e10.bag.items) === totalOf(invBefore),
    `${e10.area} ${totalOf(e10.inv)} + ${totalOf(e10.bag?.items ?? [])} vs ${totalOf(invBefore)}`);

  // ---------- gathering & crafting (T19) ----------
  const inv = (id) => page.evaluate((k) => window.__game.session.state.inventory.filter((x) => x.id === k).reduce((n, x) => n + x.count, 0), id);
  await page.evaluate(() => window.__game.registry.set({ hp: 100, hunger: 100 }));
  await scene(() => window.__game.scene.getScene('play').travelTo(20261108));
  await waitArea('expedition'); await page.waitForTimeout(600);
  const wood0 = await inv('item_wood');
  const treeId = await scene(() => window.__game.scene.getScene('play').standByResource('tree'));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, '24-gather-tag.png') });
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  const gone = await page.evaluate((id) => ({ inIsland: window.__game.scene.getScene('play').island.resources.some((r) => r.id === id), recorded: window.__game.session.state.expedition.changes.collected.includes(id) }), treeId);
  check('站在树旁按互动：徒手得 1 木材，树消失并记入采集记录', (await inv('item_wood')) === wood0 + 1 && !gone.inIsland && gone.recorded, `木材 ${wood0}→${await inv('item_wood')} ${JSON.stringify(gone)}`);
  await page.screenshot({ path: join(OUT, '25-gathered.png') });
  // give materials and craft an axe from the HUD
  await page.evaluate(() => { const inv = window.__game.session.state.inventory; const add = (id, n) => { const s = inv.find((x) => x.id === id); if (s) s.count += n; else inv.push({ id, count: n }); }; add('item_wood', 2); add('item_stone', 2); });
  await tapTarget('hud-craft');
  check('HUD「制作」打开制作面板', (await ui()).stack.join() === 'craft');
  await tapTarget('recipe-pickaxe');
  check('材料不够的配方没有制作按钮（显示还缺什么）', !(await page.evaluate(() => window.__game.scene.getScene('ui').findTarget('craft-do'))));
  await page.screenshot({ path: join(OUT, '26-craft-missing.png') });
  await tapTarget('recipe-axe');
  await page.screenshot({ path: join(OUT, '27-craft-axe.png') });
  const w1 = await inv('item_wood');
  await tapTarget('craft-do');
  check('做出石斧：石斧 +1，木材 −3、石头 −2', (await inv('item_axe')) === 1 && (await inv('item_wood')) === w1 - 3, `斧 ${await inv('item_axe')} 木 ${w1}→${await inv('item_wood')}`);
  check('制作面板触控尺寸 ≥ 44', smallTargets(await ui()).length === 0, JSON.stringify(smallTargets(await ui())));
  await tapTarget('close');
  const w2 = await inv('item_wood');
  await scene(() => window.__game.scene.getScene('play').standByResource('tree'));
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  check('有石斧砍树得 3 木材', (await inv('item_wood')) === w2 + 3, `${w2}→${await inv('item_wood')}`);
  await reload(); await waitArea('expedition');
  const still = await page.evaluate((id) => !window.__game.scene.getScene('play').island.resources.some((r) => r.id === id), treeId);
  check('刷新后砍掉的树还是没有', still);
  // crystals need a pickaxe (island 424243 has ordinary crystals, not only islet ones)
  await scene(() => window.__game.scene.getScene('play').travelTo(424243));
  await waitArea('expedition'); await page.waitForTimeout(500);
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.wild.forEach((w) => { w.cooldown = 1e12; }); sc.standByResource('crystal'); });
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  check('没有石镐敲雾晶 → 提示需要石镐', (await toastText()).includes('石镐'), await toastText());
  await scene(() => window.__game.scene.getScene('play').goHome());
  await waitArea('home'); await page.waitForTimeout(400);

  // ---------- night on an expedition (T21) ----------
  await page.evaluate(() => { const st = window.__game.session.state; window.__game.registry.set({ hp: 100, hunger: 100 }); for (const x of st.pets) x.hp = null; });
  await scene(() => window.__game.scene.getScene('play').travelTo(777001));
  await waitArea('expedition'); await page.waitForTimeout(500);
  const nightAt = await scene(() => { const sc = window.__game.scene.getScene('play'); sc.wild.forEach((w) => { w.cooldown = 1e12; }); sc.debugAdvance(20 * 60 + 15 - sc.state.clock); return sc.state.clock; });
  await page.waitForTimeout(300);
  let nd = await page.evaluate(() => window.__game.scene.getScene('play').debugNight());
  check('20 点后远征岛起雾、出现雾怪', nd.monsters.length >= 1, `${nightAt} ${JSON.stringify(nd)}`);
  await page.screenshot({ path: join(OUT, '35-fog-night.png') });
  // standing still next to a monster: the warning circle lands and hurts
  const hp0 = await reg('hp');
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.debugSpawnMonster(sc.player.x + 120, sc.player.y); });
  await page.waitForFunction(() => window.__game.scene.getScene('play').warnings.length > 0, null, { timeout: 3000 });
  await page.screenshot({ path: join(OUT, '36-warning.png') });
  await page.waitForTimeout(1400);
  const hp1 = await reg('hp');
  check('站着不动：预警圈落下扣 15 血', hp0 - hp1 >= 15, `${hp0} → ${hp1}`);
  // dodge: step out of the circle right after it appears
  await page.waitForFunction(() => window.__game.scene.getScene('play').warnings.length > 0, null, { timeout: 6000 });
  const hp2 = await reg('hp');
  await scene(() => { const sc = window.__game.scene.getScene('play'); const w = sc.warnings[0]; for (const [dx, dy] of [[90, 0], [-90, 0], [0, 90], [0, -90]]) { if (sc.footFits(w.x + dx, w.y + dy)) { sc.teleport(w.x + dx, w.y + dy); break; } } });
  await page.waitForTimeout(1400);
  check('走出预警圈就躲开（不扣血）', (await reg('hp')) >= hp2, `${hp2} → ${await reg('hp')}`);
  // E06: inside a campfire's light monsters stop at the edge
  await scene(() => {
    const sc = window.__game.scene.getScene('play'); sc.dissolveMonsters();
    sc.state.inventory.push({ id: 'item_campfire', count: 1 }); sc.placeCampfireNear();
    const f = [...sc.fireSprites.values()].at(-1); sc.teleport(f.x + 40, f.y + 30); sc.debugSpawnMonster(f.x + 320, f.y);
  });
  await page.waitForTimeout(4500);
  const e06 = await scene(() => { const sc = window.__game.scene.getScene('play'); const f = [...sc.fireSprites.values()].at(-1); return { d: Math.min(...sc.monsters.map((m) => Math.hypot(m.x - f.x, m.y - f.y))), warns: sc.warnings.length }; });
  check('E06 营火光圈里：雾怪停在 4 格光圈外，不进来', e06.d >= 4 * 48 - 2, JSON.stringify(e06));
  await page.screenshot({ path: join(OUT, '37-campfire-safe.png') });
  // torch from the bag
  await scene(() => { const sc = window.__game.scene.getScene('play'); const inv = sc.state.inventory; const t = inv.find((s) => s.id === 'item_torch'); if (t) t.count += 1; else inv.push({ id: 'item_torch', count: 1 }); });
  await tapTarget('hud-bag');
  await tapTarget('slot-item_torch');
  await tapTarget('use');
  await tapTarget('close');
  const torchLights = await page.evaluate(() => window.__game.scene.getScene('play').debugNight().lights.filter((l) => l.kind === 'player').map((l) => l.r));
  check('背包里点亮火把：身边出现 2 格光', torchLights.includes(96), JSON.stringify(torchLights));
  await page.screenshot({ path: join(OUT, '38-torch.png') });
  // dawn: monsters fade away
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.debugAdvance(30 * 60 - 1 - sc.state.clock); });
  await page.waitForTimeout(200);
  await page.waitForTimeout(2600);
  const dawn = await page.evaluate(() => ({ area: window.__game.scene.getScene('play').area, m: window.__game.scene.getScene('play').monsters.length }));
  check('天亮（6:00）雾怪消散', dawn.m === 0, JSON.stringify(dawn));

  // ---------- camping (T22) ----------
  await page.evaluate(() => { const st = window.__game.session.state; window.__game.registry.set({ hp: 100, hunger: 100 }); for (const x of st.pets) x.hp = null; });
  await scene(() => window.__game.scene.getScene('play').travelTo(555123));
  await waitArea('expedition'); await page.waitForTimeout(500);
  // chest
  const chestRes = await scene(() => { const sc = window.__game.scene.getScene('play'); const c = sc.island.chests[0]; for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (sc.isWalkableTile(c.tx + dx, c.ty + dy)) { sc.teleport((c.tx + dx) * 48 + 24, (c.ty + dy) * 48 + 24); return c.id; } return null; });
  await page.waitForTimeout(250);
  const cloth0 = await inv('item_cloth');
  await page.keyboard.press('KeyE'); await page.waitForTimeout(400);
  check('走到宝箱旁按互动：打开宝箱得到布', (await inv('item_cloth')) >= cloth0 + 2 && (await page.evaluate((id) => window.__game.session.state.expedition.changes.chests.includes(id), chestRes)), await toastText());
  await page.screenshot({ path: join(OUT, '39-chest.png') });
  // campfire at 20:00
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.wild.forEach((w) => { w.cooldown = 1e12; }); const inv = sc.state.inventory; const add = (id, n) => { const s = inv.find((x) => x.id === id); if (s) s.count += n; else inv.push({ id, count: n }); }; add('item_campfire', 1); add('item_wood', 6); add('item_tent', 1); sc.teleport(sc.island.landing.tx * 48 + 24, (sc.island.landing.ty - 2) * 48 + 24); sc.debugAdvance(20 * 60 - sc.state.clock); });
  await tapTarget('hud-bag');
  await tapTarget('slot-item_campfire');
  await tapTarget('use');
  await page.waitForTimeout(300);
  const fireNow = await page.evaluate(() => ({ fires: window.__game.session.state.expedition.fires?.length ?? 0, lights: window.__game.scene.getScene('play').debugNight().lights.filter((l) => l.kind === 'campfire').length, onWalk: window.__game.scene.getScene('play').debugState().onWalkable }));
  check('背包里使用营火：放在身边，夜里亮起 4 格光，玩家没被卡住', fireNow.fires === 1 && fireNow.lights === 1 && fireNow.onWalk, JSON.stringify(fireNow));
  await page.screenshot({ path: join(OUT, '40-campfire.png') });
  // camp panel: not enough fuel yet
  await scene(() => { const sc = window.__game.scene.getScene('play'); const f = [...sc.fireSprites.values()][0]; sc.teleport(f.x + 50, f.y + 20); });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  check('营火旁按互动 → 营地面板（火撑不到天亮，没有睡觉按钮）', (await ui()).stack.join() === 'camp' && !(await page.evaluate(() => window.__game.scene.getScene('ui').findTarget('camp-sleep'))), (await ui()).stack.join());
  await page.screenshot({ path: join(OUT, '41-camp-panel.png') });
  for (let i = 0; i < 4; i++) {
    if ((await ui()).stack.join() !== 'camp') { await page.keyboard.press('KeyE'); await page.waitForTimeout(350); }
    await tapTarget('camp-wood');
  }
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  check('添 4 根柴后火够烧到天亮，出现「睡到天亮」', !!(await page.evaluate(() => window.__game.scene.getScene('ui').findTarget('camp-sleep'))));
  await page.screenshot({ path: join(OUT, '42-camp-ready.png') });
  const dayCamp = (await state()).day;
  await page.evaluate(() => window.__game.registry.set({ hp: 40 }));
  await tapTarget('camp-sleep');
  await page.waitForFunction((dd) => window.__game.session.state.day > dd, dayCamp, { timeout: 6000 });
  await page.waitForTimeout(600);
  const woke2 = await state();
  check('帐篷里睡到天亮：第二天 6:00、生命回满、还在岛上', woke2.day === dayCamp + 1 && woke2.clock >= 360 && woke2.clock < 365 && woke2.hp === 100 && woke2.area === 'expedition', JSON.stringify({ d: woke2.day, c: woke2.clock, hp: woke2.hp, a: woke2.area }));
  await page.evaluate(() => window.__game.scene.getScene('ui').stack.clear());
  await scene(() => window.__game.scene.getScene('play').goHome());
  await waitArea('home'); await page.waitForTimeout(400);

  // ---------- pet explore skills (T24) ----------
  // map at home
  await tapTarget('hud-map');
  check('HUD「地图」打开地图面板', (await ui()).stack.join() === 'map');
  await page.screenshot({ path: join(OUT, '43-map-home.png') });
  await tapTarget('close');
  // storage: 冰蓝小狼 leaves with a full bag → extra stacks go to storage
  await page.evaluate(() => {
    const st = window.__game.session.state;
    st.party = ['pet-pup', ...st.party.filter((u) => u !== 'pet-pup')].slice(0, 3);
    const ids = ['item_wood', 'item_stone', 'item_grass', 'item_crystal', 'item_cloth', 'item_berry', 'item_carrot', 'item_berry_roast', 'item_fish_roast', 'item_soup', 'item_net_grass', 'item_net_vine', 'item_campfire', 'item_torch', 'item_axe', 'item_pickaxe', 'item_tent'];
    st.inventory = ids.map((id) => ({ id, count: 2 }));
    window.__game.events.emit('party-changed');
  });
  const stacks0 = await page.evaluate(() => window.__game.session.state.inventory.length);
  await page.evaluate(() => { const inv = window.__game.session.state.inventory; for (let i = 0; inv.length < 23; i++) inv.push({ id: ['item_berry', 'item_wood'][i % 2] + '', count: 1 }); });
  await page.evaluate(() => { const st = window.__game.session.state; const uniq = []; for (const s of st.inventory) { const u = uniq.find((x) => x.id === s.id); if (u) u.count += s.count; else uniq.push({ ...s }); } st.inventory = uniq; });
  await tapTarget('hud-pets');
  await tapTarget('pet-card-pet-pup');
  await tapTarget('party-leave');
  const afterLeave = await page.evaluate(() => ({ inv: window.__game.session.state.inventory.length, storage: (window.__game.session.state.storage ?? []).length }));
  await tapTarget('close');
  check('冰蓝小狼离队后背包不超过 20 格', afterLeave.inv <= 20, JSON.stringify(afterLeave));
  // storage box
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.storageSpot.x - 48, sc.storageSpot.y); });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  check('家园仓库按互动打开', (await ui()).stack.join() === 'storage', (await ui()).stack.join());
  await tapTarget('storage-deposit');
  const dep = await page.evaluate(() => ({ inv: window.__game.session.state.inventory.length, storage: window.__game.session.state.storage.length }));
  check('全部存入：仓库里有东西，背包只留工具和食物', dep.storage > 0 && dep.inv < stacks0, JSON.stringify(dep));
  await page.screenshot({ path: join(OUT, '44-storage.png') });
  await tapTarget('close');
  // expedition: water needs 航海鲨, thorns need 橡果刺猬, map shows chests with 月影狐猫
  await page.evaluate(() => { const st = window.__game.session.state; st.party = ['pet-acorn', 'pet-shadecat', 'pet-fox']; for (const x of st.pets) x.hp = null; window.__game.registry.set({ hp: 100, hunger: 100 }); });
  await scene(() => window.__game.scene.getScene('play').travelTo(20261108));
  await waitArea('expedition'); await page.waitForTimeout(500);
  const waterTest = await scene(() => {
    const sc = window.__game.scene.getScene('play'); sc.wild.forEach((w) => { w.cooldown = 1e12; });
    let cell = null;
    for (let y = 0; y < sc.rows && !cell; y++) for (let x = 0; x < sc.cols && !cell; x++) if (sc.water[y][x] && sc.isWalkableTile(x, y + 2, false) && sc.water[y + 1][x]) cell = { x, y };
    if (!cell) for (let y = 0; y < sc.rows && !cell; y++) for (let x = 0; x < sc.cols && !cell; x++) if (sc.water[y][x]) cell = { x, y };
    return { blocked: !sc.isWalkableTile(cell.x, cell.y), wading: sc.wading };
  });
  check('没有航海鲨：浅水走不过去', waterTest.blocked && !waterTest.wading, JSON.stringify(waterTest));
  await tapTarget('hud-map');
  const md = await page.evaluate(() => window.__game.scene.getScene('play').mapData());
  check('月影狐猫在队：地图上显示宝箱（含秘密宝箱）', md.sense === 1 && md.chests.some((c) => c.bonus), JSON.stringify({ sense: md.sense, chests: md.chests.length }));
  await page.screenshot({ path: join(OUT, '45-map-island.png') });
  await tapTarget('close');
  // clear a thorn and open the thorn chest
  const bonusInfo = await scene(() => {
    const sc = window.__game.scene.getScene('play'); const b = sc.island.chests.find((c) => c.bonus);
    const t = sc.island.thorns.find((x) => [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => sc.isWalkableTile(x.tx + dx, x.ty + dy) && Math.max(Math.abs(x.tx + dx - b.tx), Math.abs(x.ty + dy - b.ty)) === 2));
    const [dx, dy] = [[0, 1], [0, -1], [1, 0], [-1, 0]].find(([ax, ay]) => sc.isWalkableTile(t.tx + ax, t.ty + ay) && Math.max(Math.abs(t.tx + ax - b.tx), Math.abs(t.ty + ay - b.ty)) === 2);
    sc.teleport((t.tx + dx) * 48 + 24, (t.ty + dy) * 48 + 24);
    return { b, t };
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, '46-thorns.png') });
  await page.keyboard.press('KeyE'); await page.waitForTimeout(400);
  const cleared = await page.evaluate((id) => window.__game.session.state.expedition.changes.thorns.includes(id), bonusInfo.t.id);
  check('橡果刺猬在队：按互动清掉荆棘', cleared, await toastText());
  await scene((t) => { window.__game.scene.getScene('play').teleport(t.tx * 48 + 24, t.ty * 48 + 24); }, bonusInfo.t);
  await page.waitForTimeout(250);
  const cloth1 = await inv('item_cloth');
  await page.keyboard.press('KeyE'); await page.waitForTimeout(400);
  check('走进清出的缺口，打开秘密宝箱（布 ≥3）', (await inv('item_cloth')) >= cloth1 + 3, await toastText());
  await scene(() => window.__game.scene.getScene('play').goHome());
  await waitArea('home'); await page.waitForTimeout(400);

  // ---------- new-player guide (T42) ----------
  await tapTarget('hud-settings');
  await tapTarget('restart'); await tapTarget('ok');
  await page.waitForFunction(() => window.__game.scene.isActive('ui') && window.__game.scene.getScene('ui').cloverText?.text === '120', null, { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, '47-guide-start.png') });
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.dock.x, sc.dock.y + 20); });
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  await tapTarget('depart-new');
  await waitArea('expedition'); await page.waitForTimeout(1200);
  const g2 = await page.evaluate(() => window.__game.scene.getScene('ui').guideText.text);
  check('出发后新手目标自动换成下一步（采集）', g2.includes('采集'), g2);
  await page.screenshot({ path: join(OUT, '48-guide-step2.png') });
  await tapTarget('hud-settings');
  await tapTarget('guide-toggle');
  check('设置里可以关闭新手目标', await page.evaluate(() => !window.__game.scene.getScene('ui').guideBox.visible));
  await scene(() => window.__game.scene.getScene('play').goHome());
  await waitArea('home'); await page.waitForTimeout(400);

  // ---------- farming (T11) ----------
  const sleepNight = async () => {
    const d0 = (await state()).day;
    await scene(() => { const sc = window.__game.scene.getScene('play'); if (sc.state.clock < 24 * 60) sc.debugAdvance(24 * 60 - sc.state.clock); });
    await page.waitForFunction((dd) => window.__game.session.state.day > dd && window.__game.scene.getScene('ui').stack.names.includes('summary'), d0, { timeout: 8000 });
    const lines = await page.evaluate(() => window.__game.scene.getScene('ui').stack.names);
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__game.scene.getScene('ui').stack.clear());
    await page.waitForTimeout(250);
    return lines;
  };
  await page.evaluate(() => { window.__game.registry.set({ clover: 200, hp: 100, hunger: 100 }); });
  // seed stand
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.seedSpot.x + 48, sc.seedSpot.y); });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  check('农田旁的种子摊按互动打开', (await ui()).stack.join() === 'seedshop', (await ui()).stack.join());
  const seedsBefore = await inv('item_seed_carrot');
  await tapTarget('buy-carrot-5');
  check('买 5 包萝卜种子：种子 +5、四叶草 −50', (await inv('item_seed_carrot')) === seedsBefore + 5 && (await reg('clover')) === 150, `种子 ${await inv('item_seed_carrot')} 四叶草 ${await reg('clover')}`);
  await page.screenshot({ path: join(OUT, '49-seed-shop.png') });
  await tapTarget('close');
  // till → plant → water
  const plotKey = await scene(() => window.__game.scene.getScene('play').standOnPlot(0));
  await page.waitForTimeout(250);
  const verb0 = await page.evaluate(() => window.__game.scene.getScene('ui').actionLabel.text);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  const tilled = await page.evaluate((k) => window.__game.session.state.farm.plots[k]?.tilled, plotKey);
  check('站在农田上：按钮显示「开垦」，按下开垦', verb0 === '开垦' && tilled, `${verb0} ${tilled}`);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  check('开垦后按互动 → 选种子', (await ui()).stack.join() === 'seeds');
  await page.screenshot({ path: join(OUT, '50-seed-pick.png') });
  await tapTarget('plant-item_seed_carrot');
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  const plot1 = await page.evaluate((k) => window.__game.session.state.farm.plots[k], plotKey);
  check('种下萝卜并浇水', plot1.crop === 'carrot' && plot1.watered, JSON.stringify(plot1));
  await page.screenshot({ path: join(OUT, '51-planted.png') });
  // three watered nights → ripe
  for (let d = 0; d < 3; d++) {
    if (d > 0) { await scene(() => window.__game.scene.getScene('play').standOnPlot(0)); await page.waitForTimeout(200); await page.keyboard.press('KeyE'); await page.waitForTimeout(250); }
    await sleepNight();
  }
  const plot3 = await page.evaluate((k) => window.__game.session.state.farm.plots[k], plotKey);
  check('浇水睡觉 3 天：萝卜成熟', plot3.days === 3, JSON.stringify(plot3));
  await scene(() => window.__game.scene.getScene('play').standOnPlot(0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, '52-ripe.png') });
  const carrots0 = await inv('item_carrot');
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  check('收获萝卜', (await inv('item_carrot')) === carrots0 + 1);
  // ship and get paid next morning
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.shipSpot.x + 48, sc.shipSpot.y); });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  const carrotsNow = await inv('item_carrot');
  await tapTarget('ship-item_carrot');
  await page.screenshot({ path: join(OUT, '53-shipping.png') });
  await tapTarget('close');
  const clover1 = await reg('clover');
  await sleepNight();
  check('出货的萝卜第二天结算成四叶草（每根 25）', (await reg('clover')) === clover1 + 25 * carrotsNow, `${clover1} → ${await reg('clover')} (${carrotsNow} 根)`);

  // ---------- pet care & work (T12) ----------
  // (opening by walking up to a pet is covered above; home pets wander and crowd, so open the exact one here)
  const careOpen = async (species) => {
    await page.evaluate((sp) => { const st = window.__game.session.state; const pet = st.pets.find((p) => p.species === sp && !p.uid.startsWith('pet-' + sp + '-')) ?? st.pets.find((p) => p.species === sp); window.__game.events.emit('petcare-request', { uid: pet.uid }); }, species);
    await page.waitForTimeout(350);
  };
  await page.evaluate(() => { const inv = window.__game.session.state.inventory; const c = inv.find((s) => s.id === 'item_carrot'); if (c) c.count += 2; else inv.push({ id: 'item_carrot', count: 2 }); });
  const aff0 = await page.evaluate(() => window.__game.session.state.pets.find((p) => p.uid === 'pet-acorn').affection ?? 0);
  await careOpen('acorn');
  await tapTarget('care-pet');
  await tapTarget('care-feed');
  await page.screenshot({ path: join(OUT, '54-feed.png') });
  await tapTarget('feed-item_carrot');
  const aff1 = await page.evaluate(() => window.__game.session.state.pets.find((p) => p.uid === 'pet-acorn').affection);
  check('摸摸 +2、喂最爱的萝卜 +15', aff1 === Math.min(100, aff0 + 17), `${aff0} → ${aff1}`);
  await tapTarget('care-feed');
  check('一天只能喂一次', (await toastText()).includes('喂过'), await toastText());
  await page.screenshot({ path: join(OUT, '55-petcare.png') });
  await tapTarget('close');
  // send a pet that is not in the party to work, then sleep → output in storage
  const worker = await page.evaluate(() => { const st = window.__game.session.state; return st.pets.find((p) => !st.party.includes(p.uid) && p.species === 'pup')?.uid ?? st.pets.find((p) => !st.party.includes(p.uid)).uid; });
  await page.evaluate((u) => window.__game.events.emit('petcare-request', { uid: u }), worker); await page.waitForTimeout(350);
  await tapTarget('care-job');
  await tapTarget('close');
  check('不在队伍里的宠物可以派去打工', await page.evaluate((u) => window.__game.session.state.pets.find((p) => p.uid === u).job === true, worker));
  const storage0 = await page.evaluate(() => (window.__game.session.state.storage ?? []).reduce((n, s) => n + s.count, 0) + window.__game.session.state.clover);
  await sleepNight();
  const storage1 = await page.evaluate(() => (window.__game.session.state.storage ?? []).reduce((n, s) => n + s.count, 0) + window.__game.session.state.clover);
  check('打工的宠物第二天早上带回东西（放进家园仓库）', storage1 > storage0, `${storage0} → ${storage1}`);

  // ---------- daily tasks (T44) ----------
  await page.evaluate(() => {
    const st = window.__game.session.state; const s = (st.flags.stats = st.flags.stats ?? {});
    st.daily = { day: st.day, tasks: [{ id: 'pet', stat: 'pet', n: 1, text: '摸摸宠物 1 次', done: false }, { id: 'feed', stat: 'feed', n: 5, text: '喂宠物 5 次', done: false }, { id: 'craft', stat: 'craft', n: 9, text: '制作 9 件东西', done: false }], base: { ...s }, bonus: false };
    for (const p of st.pets) p.pettedDay = -1;
  });
  await tapTarget('hud-tasks');
  check('HUD「任务」打开每日任务面板', (await ui()).stack.join() === 'daily');
  await page.screenshot({ path: join(OUT, '56-daily.png') });
  await tapTarget('close');
  const cl0 = await reg('clover');
  await page.evaluate(() => window.__game.events.emit('petcare-request', { uid: 'pet-shark' })); await page.waitForTimeout(350);
  await tapTarget('care-pet');
  await tapTarget('close');
  await page.waitForTimeout(800);
  check('完成每日任务自动发奖励（四叶草 +20）', (await reg('clover')) === cl0 + 20, `${cl0} → ${await reg('clover')} / ${await toastText()}`);

  // ---------- growth (T27 / T28 / T29 / T39) ----------
  const careFor = async (uid) => { await page.evaluate((u) => window.__game.events.emit('petcare-request', { uid: u }), uid); await page.waitForTimeout(350); };
  const petOf = (uid) => page.evaluate((u) => JSON.parse(JSON.stringify(window.__game.session.state.pets.find((p) => p.uid === u))), uid);
  await page.evaluate(() => {
    const st = window.__game.session.state; const g = st.pets.find((p) => p.uid === 'pet-starbear');
    g.level = 12; g.affection = 30; g.evolved = false; g.form = 'animal';
    st.inventory.push({ id: 'item_evo_light', count: 1 }, { id: 'item_book_heal', count: 1 });
    st.crystals = { starbear: 10 }; g.stars = 3;
  });
  await careFor('pet-starbear');
  await page.screenshot({ path: join(OUT, '57-care-growth.png') });
  await tapTarget('care-evolve');
  const evo = await petOf('pet-starbear');
  check('照顾面板点「进化」：星星熊仔进化（光之石 −1）', evo.evolved && (await inv('item_evo_light')) === 0, await toastText());
  await tapTarget('care-star');
  check('点「升星」：结晶 6 个 → 3 星升 4 星', (await petOf('pet-starbear')).stars === 4 && (await page.evaluate(() => window.__game.session.state.crystals.starbear)) === 4);
  await page.screenshot({ path: join(OUT, '58-evolved.png') });
  await tapTarget('close');
  // skill book from the bag
  await tapTarget('hud-bag');
  await tapTarget('slot-item_book_heal');
  await tapTarget('use');
  check('背包使用技能书 → 选宠物', (await ui()).stack.join() === 'bag,learn', (await ui()).stack.join());
  await tapTarget('learn-pet-pet-shark');
  await page.screenshot({ path: join(OUT, '59-learn.png') });
  await tapTarget('learn-slot-0');
  check('选格子后学会「治愈之歌」，技能书 −1', (await petOf('pet-shark')).skills[0] === 'heal' && (await inv('item_book_heal')) === 0, await toastText());
  // human form: craft the bell at home, unlock, switch
  // (the bell itself comes from 露米's wish quest in town — tested in the town section)
  await page.evaluate(() => { const st = window.__game.session.state; const f = st.pets.find((p) => p.uid === 'pet-fox'); f.evolved = true; f.affection = 100; f.canTransform = false; f.form = 'animal'; st.inventory.push({ id: 'item_fox_bell', count: 1 }); });
  await careFor('pet-fox');
  await tapTarget('care-form');
  check('焰尾狐「学会化形」（化形铃 −1）', (await petOf('pet-fox')).canTransform && (await inv('item_fox_bell')) === 0, await toastText());
  await tapTarget('care-form');
  check('再点一次切换成人形态', (await petOf('pet-fox')).form === 'human');
  await page.screenshot({ path: join(OUT, '60-human-form.png') });
  await tapTarget('close');
  // foxwicks on a foggy night
  await page.evaluate(() => window.__game.registry.set({ hp: 100, hunger: 100 }));
  await scene(() => window.__game.scene.getScene('play').travelTo(313131));
  await waitArea('expedition'); await page.waitForTimeout(500);
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.wild.forEach((w) => { w.cooldown = 1e12; }); sc.debugAdvance(20 * 60 + 20 - sc.state.clock); });
  await page.waitForTimeout(300);
  const nWicks = await page.evaluate(() => window.__game.scene.getScene('play').wicks.length);
  check('起雾的夜里岛上出现狐火灯芯', nWicks >= 1, `${nWicks}`);
  const wick0 = await inv('item_foxwick');
  await scene(() => { const sc = window.__game.scene.getScene('play'); const w = sc.wicks[0]; sc.monsters.forEach((m) => { m.nextAttack = 1e12; }); sc.teleport(w.x, w.y); });
  await page.waitForTimeout(300);
  check('走过去捡到狐火灯芯', (await inv('item_foxwick')) === wick0 + 1, await toastText());
  await scene(() => window.__game.scene.getScene('play').goHome());
  await waitArea('home'); await page.waitForTimeout(400);

  // ---------- 风铃小镇 (T13) ----------
  await page.evaluate(() => window.__game.registry.set({ clover: 300, hp: 100, hunger: 100 }));
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.homeBridge.x + 20, sc.homeBridge.y); });
  await page.waitForTimeout(250);
  const bridgeVerb = await page.evaluate(() => window.__game.scene.getScene('ui').actionLabel.text);
  await page.keyboard.press('KeyE');
  await waitArea('town'); await page.waitForTimeout(500);
  check('家园西边的吊桥：按钮显示「过桥」，过去到了风铃小镇', bridgeVerb === '过桥' && (await state()).area === 'town', bridgeVerb);
  await page.screenshot({ path: join(OUT, '61-town.png') });
  await scene(() => window.__game.scene.getScene('play').standByNpc('granny'));
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  check('走到铃奶奶面前按「聊天」→ 居民面板（好感 +1）', (await ui()).stack.join() === 'npc' && (await page.evaluate(() => window.__game.session.state.town.friend.granny)) >= 1);
  await page.screenshot({ path: join(OUT, '62-npc.png') });
  await tapTarget('npc-quests');
  await tapTarget('quest-take-granny_carrot');
  check('接下铃奶奶的任务', await page.evaluate(() => window.__game.session.state.town.quests.granny_carrot === 'active'));
  await page.evaluate(() => { const inv = window.__game.session.state.inventory; const c = inv.find((s) => s.id === 'item_carrot'); if (c) c.count += 5; else inv.push({ id: 'item_carrot', count: 5 }); });
  await tapTarget('npc-back'); await tapTarget('npc-quests');
  const cl0t = await reg('clover');
  await tapTarget('quest-done-granny_carrot');
  check('交任务：四叶草 +60，任务完成', (await reg('clover')) === cl0t + 60 && await page.evaluate(() => window.__game.session.state.town.quests.granny_carrot === 'done'), `${cl0t} → ${await reg('clover')}`);
  await page.screenshot({ path: join(OUT, '63-quest.png') });
  await tapTarget('npc-back');
  await tapTarget('npc-shop');
  check('铃奶奶的商店', (await ui()).stack.join() === 'npc,shop');
  await page.screenshot({ path: join(OUT, '64-shop.png') });
  const clothBefore = await inv('item_cloth');
  await tapTarget('shop-buy-item_cloth');
  check('商店买布：布 +1、四叶草 −30', (await inv('item_cloth')) === clothBefore + 1);
  await tapTarget('close'); await page.waitForTimeout(150);
  await tapTarget('close');
  // 露米's wish quest → 化形铃
  await page.evaluate(() => { window.__game.session.state.inventory.push({ id: 'item_foxwick', count: 3 }); });
  await scene(() => window.__game.scene.getScene('play').standByNpc('lumi'));
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  await tapTarget('npc-quests');
  await tapTarget('quest-take-lumi_wish');
  await tapTarget('npc-back'); await tapTarget('npc-quests');
  const bells = await inv('item_fox_bell'), wicks = await inv('item_foxwick');
  await tapTarget('quest-done-lumi_wish');
  check('把 3 个狐火灯芯交给露米，换来化形铃（心愿任务）', (await inv('item_fox_bell')) === bells + 1 && (await inv('item_foxwick')) === wicks - 3, `铃 ${bells}→${await inv('item_fox_bell')} 灯芯 ${wicks}→${await inv('item_foxwick')} / ${await toastText()}`);
  await tapTarget('close');
  // back home over the bridge
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.townBridge.x - 30, sc.townBridge.y); });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await waitArea('home'); await page.waitForTimeout(500);
  const backHome = await state();
  check('从小镇过桥回到家园，出现在吊桥边', backHome.area === 'home' && await page.evaluate(() => { const sc = window.__game.scene.getScene('play'); return Math.hypot(sc.player.x - sc.homeBridge.x, sc.player.y - sc.homeBridge.y) < 60; }));

  // ---------- island progress (T14) ----------
  const plots0 = await page.evaluate(() => window.__game.scene.getScene('play').plots.length);
  await page.evaluate(() => { const st = window.__game.session.state; window.__game.registry.set('clover', 900); st.inventory.push({ id: 'item_wood', count: 80 }, { id: 'item_stone', count: 60 }, { id: 'item_cloth', count: 6 }); });
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.expandSpot.x, sc.expandSpot.y + 10); });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  check('家园的「扩建用地」牌子按互动 → 材料清单', (await ui()).stack.join() === 'expand', (await ui()).stack.join());
  await page.screenshot({ path: join(OUT, '65-expand.png') });
  await tapTarget('cost-confirm');
  await waitArea('home'); await page.waitForTimeout(700);
  const plots1 = await page.evaluate(() => window.__game.scene.getScene('play').plots.length);
  check('买下扩建地：篱笆拆掉，农田变成两块', plots1 > plots0 && await page.evaluate(() => window.__game.session.state.world.expanded), `${plots0} → ${plots1}`);
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport((sc.expandRect.x + 2) * 48 + 24, (sc.expandRect.y + 2) * 48 + 24); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, '66-expanded.png') });
  // bridge in town (阿栗 first)
  await page.evaluate(() => { window.__game.session.state.town.quests.ali_wood = 'done'; });
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.homeBridge.x + 20, sc.homeBridge.y); });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await waitArea('town'); await page.waitForTimeout(500);
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.northBridge.x, sc.northBridge.y + 30); });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  check('小镇北边的断桥按「修桥」→ 材料清单', (await ui()).stack.join() === 'bridge');
  await tapTarget('cost-confirm');
  await waitArea('town'); await page.waitForTimeout(700);
  check('交材料后桥修好了（存档里记下）', await page.evaluate(() => window.__game.session.state.world.bridge && window.__game.scene.getScene('play').northBridge.fixed));
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.northBridge.x, sc.northBridge.y + 30); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUT, '67-bridge.png') });
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  check('走上修好的桥：星光岛敬请期待', (await toastText()).includes('敬请期待'), await toastText());
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.townBridge.x - 30, sc.townBridge.y); });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await waitArea('home'); await page.waitForTimeout(400);

  // ---------- home decoration (T15) ----------
  await page.evaluate(() => { const inv = window.__game.session.state.inventory; inv.push({ id: 'item_furn_table', count: 1 }, { id: 'item_furn_chair', count: 1 }, { id: 'item_furn_lamp', count: 1 }); });
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.cottageSpot.x, sc.cottageSpot.y + 6); });
  await page.waitForTimeout(250);
  const houseVerb = await page.evaluate(() => window.__game.scene.getScene('ui').actionLabel.text);
  await page.keyboard.press('KeyE');
  await waitArea('house'); await page.waitForTimeout(500);
  check('家园小屋按「进屋」→ 进到房间里', houseVerb === '进屋' && (await state()).area === 'house', houseVerb);
  await page.screenshot({ path: join(OUT, '68-room.png') });
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.decorSpot.x, sc.decorSpot.y + 40); });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(350);
  check('「布置家具」打开布置面板', (await ui()).stack.join() === 'decorate', (await ui()).stack.join());
  await tapTarget('furn-item_furn_table');
  await tapTarget('cell-6-3');
  await tapTarget('furn-item_furn_chair');
  await tapTarget('cell-6-3');
  check('摆木桌成功；在同一格再摆木椅会被拒绝（不能重叠）', await page.evaluate(() => window.__game.session.state.house.items.length === 1) && (await toastText()).includes('已经有'), await toastText());
  await tapTarget('cell-9-5');
  await tapTarget('furn-item_furn_lamp');
  await tapTarget('cell-3-2');
  await tapTarget('cell-6-3');
  await tapTarget('deco-rotate');
  const rot = await page.evaluate(() => window.__game.session.state.house.items.find((it) => it.id === 'item_furn_table').rot);
  check('选中木桌点「旋转」', rot === 1);
  await page.screenshot({ path: join(OUT, '69-decorate.png') });
  await tapTarget('close');
  await page.waitForTimeout(300);
  check('房间里出现家具，台灯算光源', await page.evaluate(() => { const sc = window.__game.scene.getScene('play'); return sc.furnSprites.length === 3 && sc.fires.length === 1; }));
  await page.screenshot({ path: join(OUT, '70-room-furnished.png') });
  await reload(); await waitArea('house');
  check('刷新后布局还在', await page.evaluate(() => window.__game.session.state.house.items.length === 3 && window.__game.scene.getScene('play').furnSprites.length === 3));
  await scene(() => { const sc = window.__game.scene.getScene('play'); sc.teleport(sc.doorSpot.x, sc.doorSpot.y - 20); });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await waitArea('home'); await page.waitForTimeout(400);
  check('出门回到家园，站在小屋门口', await page.evaluate(() => { const sc = window.__game.scene.getScene('play'); return Math.hypot(sc.player.x - sc.cottageSpot.x, sc.player.y - sc.cottageSpot.y) < 40; }));

  // ---------- title page & starter choice (T16): fresh browser storage, no ?demo ----------
  {
    const tctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const tp = await tctx.newPage();
    tp.on('pageerror', (e) => errors.push(e.message));
    tp.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await tp.goto(url);
    await tp.waitForFunction(() => window.__game?.scene?.isActive('title'), null, { timeout: 15000 });
    await tp.waitForTimeout(400);
    const tbox = await tp.locator('canvas').boundingBox();
    const tapIn = async (sceneKey, name) => {
      const p = await tp.evaluate(([k, n]) => window.__game.scene.getScene(k).findTarget(n), [sceneKey, name]);
      if (!p) throw new Error(`${sceneKey} target not found: ${name}`);
      await tp.touchscreen.tap(tbox.x + p.x * tbox.width / 960, tbox.y + p.y * tbox.height / 540); await tp.waitForTimeout(350);
    };
    const tTap = (name) => tapIn('title', name);
    const td = () => tp.evaluate(() => window.__game.scene.getScene('title').debugTitle());
    const inGame = () => tp.waitForFunction(() => window.__game.scene.isActive('play') && window.__game.scene.isActive('ui'), null, { timeout: 8000 }).then(() => tp.waitForTimeout(500));
    let d = await td();
    check('第一次打开：标题页只有「开始游戏」，还没进游戏', d.step === 'title' && d.targets.join() === 'start' && !(await tp.evaluate(() => window.__game.scene.isActive('play'))), JSON.stringify(d));
    check('标题页有健康游戏忠告', await tp.evaluate(() => window.__game.scene.getScene('title').children.list.some((o) => o.text?.includes('抵制不良游戏'))));
    await tp.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    check('停在标题页时不会存档', await tp.evaluate(() => localStorage.getItem('lingmu.save.main') === null));
    await tp.screenshot({ path: join(OUT, '71-title.png') });
    await tTap('start');
    d = await td();
    check('「开始游戏」→ 三只宠物可选', d.step === 'choose' && ['starter-acorn', 'starter-shark', 'starter-fox'].every((n) => d.targets.includes(n)), JSON.stringify(d));
    await tTap('pick');
    check('没选宠物时「就选它」不起作用', (await td()).step === 'choose');
    await tTap('starter-fox');
    await tp.screenshot({ path: join(OUT, '72-choose.png') });
    await tTap('pick');
    check('选焰尾狐 →「就选它」→ 开场介绍', (await td()).step === 'intro');
    await tp.screenshot({ path: join(OUT, '73-intro.png') });
    await tTap('begin');
    await inGame();
    const g1 = await tp.evaluate(() => { const st = window.__game.session.state, sc = window.__game.scene.getScene('play'); return { pets: st.pets.map((x) => x.species + x.level), party: st.party.join(), follower: sc.debugState().follower, saved: !!localStorage.getItem('lingmu.save.main'), guide: window.__game.scene.getScene('ui').guideText.text }; });
    check('进入游戏：只有焰尾狐（4 级）跟着，已存档，新手目标是去码头', g1.pets.join() === 'fox4' && g1.party === 'pet-fox' && g1.follower === 'fox' && g1.saved && g1.guide.includes('码头'), JSON.stringify(g1));
    await tp.screenshot({ path: join(OUT, '74-first-day.png') });
    await tp.reload();
    await tp.waitForFunction(() => window.__game?.scene?.isActive('title'), null, { timeout: 15000 }); await tp.waitForTimeout(300);
    d = await td();
    check('再打开：标题页显示「继续游戏」和「新的开始」', d.targets.includes('continue') && d.targets.includes('new'), JSON.stringify(d));
    await tp.screenshot({ path: join(OUT, '75-title-continue.png') });
    await tTap('new');
    check('「新的开始」会先确认清除存档', (await td()).step === 'confirm');
    await tTap('cancel');
    await tTap('continue');
    await inGame();
    check('「继续游戏」回到原来的进度', await tp.evaluate(() => window.__game.session.state.party.join() === 'pet-fox'));
    await tapIn('ui', 'hud-settings'); await tapIn('ui', 'restart'); await tapIn('ui', 'ok');
    await tp.waitForFunction(() => window.__game.scene.isActive('title'), null, { timeout: 5000 }).catch(() => {});
    await tp.waitForTimeout(300);
    d = await td();
    const wiped = await tp.evaluate(() => !window.__game.scene.isActive('play') && localStorage.getItem('lingmu.save.main') === null);
    check('设置 → 重新开始：回到选宠物，旧存档已清除', d.step === 'choose' && wiped, JSON.stringify(d));
    await tTap('starter-acorn'); await tTap('pick'); await tTap('begin');
    await inGame();
    check('重新选橡果刺猬开局，界面正常', await tp.evaluate(() => window.__game.session.state.party.join() === 'pet-acorn' && window.__game.scene.getScene('ui').dayText.text.includes('第 1 天')));
    await tctx.close();
  }

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
