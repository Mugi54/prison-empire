const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:4173/');
  await p.screenshot({ path: 'shots/01-menu.png' });
  await p.click('text=Carrière');
  await p.screenshot({ path: 'shots/02-career.png' });
  await p.locator('.preset', { hasText: 'Tilleuls' }).locator('button').click();
  await p.waitForSelector('.topbar');
  await p.evaluate(() => { window.__ctl.setSpeed(3); });
  await p.waitForTimeout(9000);
  await p.screenshot({ path: 'shots/03-game.png' });
  // sélection d'un détenu
  await p.evaluate(() => { const c = window.__ctl; c.setPanel('overview'); const i = c.state.inmates[0]; c.select({ kind: 'inmate', id: i.id }); c.focusTile(i.x, i.y); c.cam.zoom = 1.5; });
  await p.waitForTimeout(600);
  await p.screenshot({ path: 'shots/04-inmate.png' });
  for (const [k, id] of [['05', 'build'], ['06', 'inmates'], ['07', 'staff'], ['08', 'security'], ['09', 'finance'], ['10', 'research'], ['11', 'events'], ['12', 'stats']]) {
    await p.evaluate((id) => { const c = window.__ctl; c.select(null); if (c.panel !== id) c.setPanel(id); }, id);
    await p.waitForTimeout(350);
    await p.screenshot({ path: `shots/${k}-${id}.png` });
  }
  console.log('time', await p.evaluate(() => window.__ctl.state.time), 'errors', errs.length, errs.slice(0, 8));
  await b.close();
})();
