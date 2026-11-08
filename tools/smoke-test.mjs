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
  check('HUD 显示天数时间和货币', /第 1 天\s+0[67]:\d\d/.test(u.day) && u.clover === '120', `${u.day} / ${u.clover}`);
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
  await tapBattle('battle-continue'); await page.waitForTimeout(500);
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
  check('E08 倒下：只留工具，其余进失物包，总数不变', afterFaint.inv.every((s) => ['item_axe', 'item_pickaxe'].includes(s.id)) && !!afterFaint.bag
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
  const inv = (id) => page.evaluate((k) => window.__game.session.state.inventory.find((x) => x.id === k)?.count ?? 0, id);
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
