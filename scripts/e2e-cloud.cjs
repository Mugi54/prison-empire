// Vérifie les sauvegardes en ligne contre le vrai projet Supabase (crée un compte de test).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('http://localhost:4173/');
  await p.click('text=Charger une partie');
  const email = `test-${Date.now()}@example.com`;
  await p.fill('input[type=email]', email);
  await p.fill('input[type=password]', 'motdepasse-test-123');
  await p.click('button:has-text("Créer un compte")');
  await p.waitForTimeout(4000);
  console.log('après inscription :', (await p.locator('.auth p.pos, .auth p.neg, .kv').first().innerText().catch(() => '?')).slice(0, 160));
  await p.screenshot({ path: 'shots/50-cloud.png' });
  console.log('errors', errs);
  await b.close();
})();
