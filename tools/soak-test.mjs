// Long-play soak test: plays several in-game days through the real game
// (depart → gather → craft → battles → night with fog monsters → faint or
// fly home → sleep, plus page reloads) and after every step checks that the
// save is valid, numbers are sane, nothing leaks and no script errors appear.
// usage: cd tools && node soak-test.mjs [days]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const DAYS = Number(process.argv[2]) || 6;
const ROOT = fileURLToPath(new URL('../game/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  try { const body = await readFile(join(ROOT, path || 'index.html')); res.writeHead(200, { 'content-type': TYPES[extname(path || 'index.html')] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const problems = [];
const log = (s) => console.log(s);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const boot = async () => { await page.waitForFunction(() => window.__game?.scene?.isActive('play') && window.__game.scene.isActive('ui'), null, { timeout: 15000 }); await page.waitForTimeout(400); await page.evaluate(() => { window.__battleFast = true; }); };
  await page.goto(url); await boot();
  await page.evaluate(() => localStorage.clear()); await page.reload(); await boot();
  const play = (fn, arg) => page.evaluate(fn, arg);
  const waitArea = (a) => page.waitForFunction((x) => { const g = window.__game; return g.scene.isActive('play') && g.scene.getScene('play').area === x && !g.scene.getScene('play').traveling && g.scene.isActive('ui'); }, a, { timeout: 10000 });

  // invariants checked after every step
  const check = async (step) => {
    const r = await page.evaluate(async () => {
      const S = await import('./src/systems/save.js');
      const g = window.__game, st = g.session.state;
      g.session.pullFromRegistry();
      const bad = S.validate(st);
      const p = st.player;
      for (const k of ['hp', 'hunger', 'clock', 'day', 'clover']) { const v = k in p ? p[k] : st[k]; if (!Number.isFinite(v)) bad.push(`NaN ${k}`); }
      if (p.hp > p.hpMax || p.hp < 0) bad.push(`hp ${p.hp}`);
      if (st.inventory.some((s) => !(s.count > 0))) bad.push('inventory count');
      if (st.pets.some((x) => x.hp != null && x.hp < 0)) bad.push('pet hp');
      return { bad, textures: Object.keys(g.textures.list).length, objects: g.scene.getScene('play').children.list.length, day: st.day, clock: st.clock, area: p.area, inv: st.inventory.reduce((n, s) => n + s.count, 0), pets: st.pets.length, hp: p.hp, hunger: p.hunger };
    });
    if (r.bad.length) problems.push(`${step}: ${r.bad.join(', ')}`);
    if (errors.length) { problems.push(`${step}: script errors ${errors.splice(0).join(' | ')}`); }
    return r;
  };

  const first = await check('start');
  let maxTex = first.textures, maxObj = 0;
  const battleOnce = async () => {
    const started = await play(() => { const sc = window.__game.scene.getScene('play'); const w = sc.wild?.find((x) => x.sprite.active); if (!w) return false; w.cooldown = 0; sc.teleport(w.sprite.x + 18, w.sprite.y); return true; });
    if (!started) return 'none';
    try { await page.waitForFunction(() => window.__game.scene.isActive('battle'), null, { timeout: 3000 }); } catch { return 'no-battle'; }
    for (let k = 0; k < 80; k++) {
      await page.waitForFunction(() => { const s = window.__game.scene.getScene('battle'); return !window.__game.scene.isActive('battle') || (!s.busy && (s.menu || s.endPanel)); }, null, { timeout: 10000 });
      const done = await play(() => {
        const bs = window.__game.scene.getScene('battle'); const b = bs.battle;
        if (b.over) { bs.close(); return b.over; }
        if (b.needSwitch) { bs.act({ type: 'switch', index: b.sides.me.mons.findIndex((m) => m.hp > 0) }); return null; }
        const me = b.sides.me.mons[b.sides.me.active], foe = b.sides.foe.mons[b.sides.foe.active];
        const net = b.inventory.find((s) => s.id === 'item_net_grass');
        if (net && foe.hp < foe.maxHp * 0.4 && Math.random() < 0.6) { bs.act({ type: 'catch', item: 'item_net_grass' }); return null; }
        const sk = me.skills.find((id) => me.uses[id] > 0 && !['heal', 'shell', 'puff'].includes(id)) ?? me.skills.find((id) => me.uses[id] > 0);
        bs.act({ type: 'skill', skill: sk }); return null;
      });
      if (done) { await page.waitForTimeout(300); return done; }
    }
    return 'stuck';
  };

  for (let d = 1; d <= DAYS; d++) {
    // morning at home: eat (give some berries so the player doesn't starve), then fly out
    await play(async () => { const V = await import('./src/systems/survival.js'); const g = window.__game, st = g.session.state; const b = st.inventory.find((s) => s.id === 'item_berry'); if (b) b.count += 6; else st.inventory.push({ id: 'item_berry', count: 6 }); while (st.player.hunger < 90 && g.session.eat('item_berry').ok); });
    await play(() => window.__game.events.emit('depart', 'new'));
    await waitArea('expedition');
    let s = await check(`day ${d} arrive`);
    // gather
    const got = await play(() => {
      const sc = window.__game.scene.getScene('play'); let n = 0;
      for (const type of ['tree', 'rock', 'grass', 'bush', 'tree', 'rock', 'grass', 'tree', 'crystal']) {
        const id = sc.standByResource(type); if (!id) continue;
        const r = sc.island.resources.find((x) => x.id === id);
        const before = sc.state.inventory.length; sc.gatherResource(r); if (sc.state.inventory.length >= before) n++;
      }
      return n;
    });
    // craft what we can
    await play(async () => { const C = await import('./src/systems/crafting.js'); const st = window.__game.session.state; for (const id of ['axe', 'pickaxe', 'net_grass', 'torch', 'net_grass']) C.craft(st, id); });
    s = await check(`day ${d} gathered ${got}`);
    // battles (heal pets first so fights happen)
    await play(() => { for (const x of window.__game.session.state.pets) x.hp = null; });
    const results = [];
    for (let k = 0; k < 2; k++) results.push(await battleOnce());
    s = await check(`day ${d} battles ${results.join(',')}`);
    // 'no-battle' right after a lost battle is correct (whole party tired, A06)
    if (results.includes('stuck') || (results[0] === 'no-battle')) problems.push(`day ${d}: battle ${results.join(',')}`);
    // reload in the middle of the day: state must match the last save
    if (d % 2 === 0) {
      await play(() => window.__game.session.save('soak'));
      const before = await play(() => localStorage.getItem('lingmu.save.main'));
      await page.reload(); await boot();
      const same = await play((pre) => { const st = window.__game.session.state; const p = JSON.parse(pre.slice(9)); return st.day === p.day && st.inventory.length === p.inventory.length && st.pets.length === p.pets.length && st.player.area === p.player.area; }, before);
      if (!same) problems.push(`day ${d}: reload changed the state`);
      s = await check(`day ${d} reload`);
    }
    // night: stay out until 21:30 and stand still for a while (fog monsters attack)
    await play(() => { const sc = window.__game.scene.getScene('play'); if (sc.area === 'expedition') { sc.wild?.forEach((w) => { w.cooldown = 1e12; }); sc.debugAdvance(Math.max(0, 21 * 60 + 30 - sc.state.clock)); } });
    if (d % 3 === 0) await play(() => { const sc = window.__game.scene.getScene('play'); sc.registry.set('hp', 20); });   // some nights end in fainting
    await play(async () => { const g = window.__game; const st = g.session.state; if (st.player.hunger < 50) { const b = st.inventory.find((s) => s.id === 'item_berry'); if (b) b.count += 4; else st.inventory.push({ id: 'item_berry', count: 4 }); while (st.player.hunger < 80 && g.session.eat('item_berry').ok); } });
    await page.waitForTimeout(6000);
    const night = await play(() => { const sc = window.__game.scene.getScene('play'); return { area: sc.area, monsters: sc.monsters?.length ?? 0, fps: Math.round(window.__game.loop.actualFps) }; });
    s = await check(`day ${d} night (${night.monsters} monsters, ${night.fps} fps)`);
    if (night.area === 'expedition' && night.monsters === 0) problems.push(`day ${d}: no fog monsters at night`);
    // go home if still out (or wait for the faint transition)
    const area = await play(() => window.__game.scene.getScene('play').area);
    if (area === 'expedition') {
      const fainting = await play(() => window.__game.scene.getScene('play').fainted || window.__game.session.state.player.area === 'home');
      if (!fainting) await play(() => window.__game.events.emit('return-home'));
    }
    await waitArea('home');
    s = await check(`day ${d} home`);
    // bed: advance to midnight → forced sleep → close the summary
    const dayBefore = s.day;
    await play(() => { const sc = window.__game.scene.getScene('play'); if (sc.state.clock < 24 * 60) sc.debugAdvance(24 * 60 - sc.state.clock); });
    await page.waitForFunction((dd) => window.__game.session.state.day > dd && window.__game.scene.getScene('ui').stack.names.includes('summary'), dayBefore, { timeout: 8000 }).catch(() => problems.push(`day ${d}: no sleep/summary`));
    await play(() => window.__game.scene.getScene('ui').stack.clear());
    await page.waitForTimeout(300);
    s = await check(`day ${d} slept`);
    maxTex = Math.max(maxTex, s.textures); maxObj = Math.max(maxObj, s.objects);
    log(`day ${d}: day=${s.day} hp=${s.hp} hunger=${s.hunger} items=${s.inv} pets=${s.pets} gathered=${got} battles=${results.join('/')} night=${night.monsters} monsters ${night.fps}fps textures=${s.textures} objects=${s.objects}`);
  }
  if (maxTex - first.textures > 3) problems.push(`textures grew ${first.textures} → ${maxTex} (leak?)`);
} finally {
  await browser.close();
  server.close();
}
console.log(problems.length ? `\n${problems.length} problem(s):\n- ${problems.join('\n- ')}` : '\nno problems');
process.exit(problems.length ? 1 : 0);
