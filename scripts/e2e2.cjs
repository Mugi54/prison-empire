const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:4173/');
  await p.click('text=Bac à sable');
  await p.click('text=Créer l\'établissement');
  await p.waitForSelector('.topbar');
  const S = () => p.evaluate(() => { const s = window.__ctl.state; return { rooms: s.rooms.length, doors: s.doors.length, furn: s.furn.length, walls: s.walls.length, bal: Math.round(s.finance.balance), inm: s.inmates.length, staff: s.staff.length, time: s.time }; });
  // position écran d'une case
  const at = (x, y) => p.evaluate(([x, y]) => { const c = window.__ctl, cv = document.querySelector('canvas').getBoundingClientRect(); const wx = (x - y) * 32, wy = (x + y) * 16; return [cv.left + (wx - c.cam.x) * c.cam.zoom + cv.width / 2, cv.top + (wy - c.cam.y) * c.cam.zoom + cv.height / 2]; }, [x, y]);
  await p.evaluate(() => { const c = window.__ctl; c.setSpeed(0); c.cam.zoom = 1.2; c.focusTile(27, 20); });
  console.log('start', await S());
  // 1. salle par cliquer-glisser
  await p.click('.sidemenu button:has-text("Construction")');
  await p.click('.build-card:has-text("Cellule individuelle")');
  let [x0, y0] = await at(24.5, 18.5), [x1, y1] = await at(25.5, 20.5);
  await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move((x0 + x1) / 2, (y0 + y1) / 2); await p.mouse.move(x1, y1); await p.waitForTimeout(100);
  await p.screenshot({ path: 'shots/20-drag.png' });
  await p.mouse.up();
  console.log('after room', await S());
  // 2. porte sur le mur sud de (24,20)
  await p.click('.toolrow button:has-text("Porte")');
  let [dx, dy] = await at(24.5, 20.93); await p.mouse.move(dx, dy); await p.waitForTimeout(80); await p.mouse.click(dx, dy);
  console.log('after door', await S());
  // 3. mobilier : lit + wc
  await p.click('.tabs button:has-text("Mobilier")');
  await p.click('.build-card:has-text("Lit —")');
  let [bx, by] = await at(24.5, 18.5); await p.mouse.move(bx, by); await p.waitForTimeout(80); await p.mouse.click(bx, by);
  await p.click('.build-card:has-text("WC")');
  [bx, by] = await at(25.5, 18.5); await p.mouse.move(bx, by); await p.waitForTimeout(80); await p.mouse.click(bx, by);
  console.log('after furn', await S());
  await p.keyboard.press('Escape');
  // 4. sélection de la salle
  [bx, by] = await at(25.5, 20.5); await p.mouse.click(bx, by);
  await p.waitForTimeout(200);
  console.log('context:', (await p.locator('.context .sheet-head').innerText()).replace(/\n/g, ' | '));
  await p.screenshot({ path: 'shots/21-built.png' });
  // 5. recrutement via l'interface
  await p.click('.sidemenu button:has-text("Personnel")');
  await p.click('.tabs button:has-text("Recrutement")');
  await p.locator('.card button:has-text("Recruter")').first().click();
  console.log('after hire', await S());
  // 6. sauvegarde manuelle, rechargement de la page, chargement
  await p.click('.top-right button[title="Menu du jeu"]');
  await p.locator('.slot-row', { hasText: 'Emplacement 1' }).locator('button:has-text("Sauvegarder")').click();
  await p.waitForTimeout(400);
  const before = await S();
  await p.reload();
  await p.click('text=Charger une partie');
  await p.locator('.slot-row', { hasText: 'Emplacement 1' }).locator('button:has-text("Charger")').click();
  await p.waitForSelector('.topbar');
  const after = await S();
  console.log('reload ok:', JSON.stringify(before) === JSON.stringify(after), after);
  // 7. endurance : 12 jours simulés dans une carrière, interface ouverte
  await p.click('.top-right button[title="Menu du jeu"]'); await p.click('text=Sauvegarder et quitter');
  await p.click('text=Carrière'); await p.locator('.preset', { hasText: 'Grand-Fort' }).locator('button').click();
  await p.waitForSelector('.topbar');
  const r = await p.evaluate(async () => {
    const c = window.__ctl; c.setSpeed(0); const s = c.state; const E = await Promise.resolve(null);
    const t0 = performance.now(); let n = 0;
    while (n < 1440 * 12 && !s.outcome) { c['frame']; n++; window.__tick(s); }
    return { ms: Math.round(performance.now() - t0), day: Math.floor(s.time / 1440) + 1, inm: s.inmates.length, bal: Math.round(s.finance.balance), inc: s.incidents.length, ev: s.events.history.length, active: s.events.active.length, outcome: s.outcome, mission: s.career.mission };
  });
  console.log('endurance', r);
  for (const id of ['overview', 'security', 'finance', 'stats', 'events', 'inmates']) {
    await p.evaluate((id) => { const c = window.__ctl; if (c.panel !== id) c.setPanel(id); }, id);
    await p.waitForTimeout(300);
    await p.screenshot({ path: `shots/30-${id}.png` });
  }
  console.log('errors', errs.length, errs.slice(0, 6));
  await b.close();
})();
