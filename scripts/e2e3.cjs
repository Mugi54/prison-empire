const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + process.cwd() + '/dist-single/index.html');
  await p.click('text=Scénarios');
  await p.locator('.preset', { hasText: 'surpeuplé' }).locator('button').click();
  await p.waitForSelector('.topbar');
  await p.evaluate(() => { const c = window.__ctl; c.setSpeed(3); c.cam.zoom = 0.6; });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: 'shots/40-scenario.png' });
  await p.evaluate(() => window.__ctl.save('auto', true)); await p.waitForTimeout(300);
  await p.reload(); await p.click('text=Charger une partie');
  const txt = await p.locator('.slot-row').first().innerText();
  console.log('file:// save listed:', txt.replace(/\n/g, ' | '), 'errors', errs);
  await b.close();
})();
