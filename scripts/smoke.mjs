// Browser smoke test: serves site/, opens it at phone width, plays one round.
// Usage: node scripts/smoke.mjs   (needs: npm i -D playwright && npx playwright install chromium)
//        SMOKE_URL=https://tibetan.itjoy.space node scripts/smoke.mjs   — run against a live site instead
// The test never calls the report API: config.js in the repo has an empty REPORT_API.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
import { syllableToWylie } from '../site/src/engine/wylie.js';

const ROOT = new URL('../site/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

let server = null;
let base = (process.env.SMOKE_URL || '').replace(/\/+$/, '');
if (!base) {
  server = http.createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    try {
      let body = await readFile(file);
      // never reach the report API from the test: serve config.js with an empty REPORT_API
      if (path === '/config.js') body = body.toString('utf8').replace(/REPORT_API: '[^']*'/, "REPORT_API: ''");
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}
console.log(`testing ${base}`);

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${base}/index.html#/play`);
await page.waitForSelector('.popover .onboarding button');
await page.click('.popover .onboarding button');
await page.waitForSelector('.rack .tile');

check((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), 'no horizontal scroll at 360px');
check((await page.evaluate(() => document.fonts.check('20px "Noto Serif Tibetan"'))), 'Tibetan font loaded');

// grammar help: opens a popover and changes nothing in the progress record
const progressBefore = await page.evaluate(() => localStorage.getItem('tib-progress'));
await page.click('.chip');
await page.waitForSelector('.popover .big-tib');
check((await page.$('.popover .audio-btn')) === null, 'word card has no listen button while the voice setting is off');
await page.keyboard.press('Escape');
await page.waitForSelector('.popover', { state: 'detached' });
await page.click('#btn-grammar');
await page.waitForSelector('.popover .grammar-help');
check((await page.$$('.popover .grammar-help .note-row')).length > 0 || (await page.$('.popover .grammar-help .helper')) !== null, 'grammar popover shows notes or the empty message');
await page.keyboard.press('Escape');
await page.waitForSelector('.popover', { state: 'detached' });
check((await page.evaluate(() => localStorage.getItem('tib-progress'))) === progressBefore, 'opening the grammar help does not change the progress');

// the chips list the words in sentence order; tiles are the same texts
const order = await page.$$eval('.chip .tib', (els) => els.map((e) => e.textContent));

// a wrong answer (reversed order) shows the "Why?" button that opens the same popover
if (order.length >= 2 && new Set(order).size === order.length) {
  for (const text of [...order].reverse()) {
    for (const t of await page.$$('.rack .tile')) {
      if ((await t.$eval('.tile-text', (e) => e.textContent)) === text) { await t.click(); break; }
    }
  }
  await page.click('.buttons .action.primary');
  check(await page.$eval('.feedback', (e) => e.classList.contains('bad')), 'reversed order is wrong');
  check((await page.$('.feedback.bad .why')) !== null, '"Why?" button shown after a mistake');
  await page.click('.feedback.bad .why');
  await page.waitForSelector('.popover .grammar-help');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.popover', { state: 'detached' });
  // the hint after a wrong answer names the tile for the first wrong position and keeps the misplaced tiles red
  await page.click('#btn-hint');
  check((await page.$eval('.feedback', (e) => e.classList.contains('bad') && /[ༀ-࿿]/.test(e.textContent))), 'hint names the expected tile');
  check((await page.$$('.answer .tile.wrong')).length > 0, 'hint keeps the misplaced tiles red');
  await page.click('#btn-reset');
  await page.waitForFunction(() => document.querySelectorAll('.answer .tile').length === 0);
}
for (const text of order) {
  const tiles = await page.$$('.rack .tile');
  for (const t of tiles) {
    if ((await t.$eval('.tile-text', (e) => e.textContent)) === text) { await t.click(); break; }
  }
}
await page.click('.buttons .action.primary');
check(await page.$eval('.feedback', (e) => e.classList.contains('good')), 'sentence solved');
check(await page.$eval('.lesson', (e) => !e.hidden), 'lesson block shown');
const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('tib-progress')));
check(Object.values(progress.words).some((w) => w.status === 'known' && w.due), 'words promoted and scheduled');

// recall exercise: the translation as the prompt, Tibetan sentences as options, word chips hidden until solved
await page.click('.switch button[data-exercise="recall"]');
await page.waitForSelector('.option .option-tib');
check((await page.$$('.option')).length === 4, 'recall: four Tibetan options');
check((await page.$eval('.chips', (e) => e.hidden)), 'recall: word chips hidden before the answer');
for (let i = 0; i < 4 && !(await page.$('.feedback.good')); i++) {
  const btn = await page.$('.option:not(:disabled)');
  if (!btn) break;
  await btn.click();
}
check((await page.$('.feedback.good')) !== null, 'recall: solved by elimination');
check((await page.$eval('.chips', (e) => !e.hidden)), 'recall: word chips shown after solving');
await page.click('.switch button[data-exercise="tiles"]');
await page.waitForSelector('.rack .tile');

// reading course: a full round of the first stage, answered with the transliterator
await page.goto(`${base}/index.html#/read`);
await page.waitForSelector('.stage');
check((await page.$$('.stage')).length === 7, 'reading: seven stages listed');
await page.click('.stage[data-stage="rows1"] a.action');
await page.waitForSelector('.read-card');
for (let i = 0; i < 12; i++) {
  const tib = await page.$eval('.read-card', (e) => e.textContent);
  const want = syllableToWylie(tib);
  let hit = false;
  for (const b of await page.$$('.read-options .option')) {
    if ((await b.$eval('.option-wylie', (e) => e.textContent)) === want) { await b.click(); hit = true; break; }
  }
  if (!hit) { check(false, `reading: no option “${want}” for ${tib}`); break; }
  await page.waitForFunction(() => !document.querySelector('.read-result').hidden || document.querySelector('.feedback').textContent === '');
}
check((await page.$eval('.read-result', (e) => !e.hidden && /12 of 12/.test(e.textContent))), 'reading: a full round of the letters is scored 12 of 12');
check((await page.evaluate(() => JSON.parse(localStorage.getItem('tib-progress')).reading.rows1.best)) === 12, 'reading: the best score is recorded in the progress');

// pronunciation: off by default, the setting shows the listen buttons
await page.goto(`${base}/index.html#/settings`);
await page.waitForSelector('#settings-voice');
await page.click('#settings-voice');
await page.goto(`${base}/index.html#/dict`);
await page.waitForSelector('.word-row', { state: 'attached' });
check((await page.$('.word-row .audio-btn')) !== null, 'dictionary shows listen buttons after enabling the voice setting');
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('tib-progress')); p.settings.voice = false; localStorage.setItem('tib-progress', JSON.stringify(p)); });

for (const route of ['dict', 'grammar', 'stats', 'settings', 'support']) {
  await page.goto(`${base}/index.html#/${route}`);
  await page.waitForSelector('.panel');
  check((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), `#/${route}: no horizontal scroll`);
  check((await page.$('#report-app')) !== null, `#/${route}: "report a problem" control in the footer`);
}
check((await page.evaluate(() => document.documentElement.lang)) === 'en', 'interface language defaults to English');

// theme toggle in the header: brand, button and language select on one line; click switches the theme
await page.goto(`${base}/index.html#/play`);
await page.waitForSelector('.rack .tile');
const headerRow = await page.evaluate(() => {
  const tops = ['.brand', '#theme-toggle', '#lang-select'].map((s) => document.querySelector(s).getBoundingClientRect());
  const btn = document.getElementById('theme-toggle').getBoundingClientRect();
  return { sameLine: tops.every((r) => Math.abs(r.top + r.height / 2 - tops[0].top - tops[0].height / 2) < 12), size: Math.min(btn.width, btn.height) };
});
check(headerRow.sameLine, 'header: brand, theme button and language select on one line');
check((await page.$eval('#menu-toggle', (b) => b.getBoundingClientRect().right <= window.innerWidth && b.getBoundingClientRect().width >= 44)), 'header: menu button inside the viewport');
await page.click('#menu-toggle');
await page.waitForSelector('#tabs:not([hidden])');
const menuLinks = await page.$$eval('#tabs a', (as) => as.map((a) => a.getAttribute('href')));
check(menuLinks.length === 8 && menuLinks.includes('#/read') && menuLinks.includes('#/support') && menuLinks.includes('#report'), 'menu lists seven sections and "report a problem"');
check((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), 'open menu: no horizontal scroll');
await page.click('#tabs a[data-route="dict"]');
await page.waitForSelector('.panel');
check((await page.$eval('#tabs', (n) => n.hidden)), 'menu closes after choosing a section');
check((await page.$eval('#section-title', (e) => e.textContent.trim().length > 0)), 'section title shown in the header');
await page.goto(`${base}/index.html#/play`);
await page.waitForSelector('.rack .tile');
check(headerRow.size >= 44, 'header: theme button is at least 44px');
const before = await page.evaluate(() => ({ dark: document.documentElement.dataset.theme === 'dark', color: document.querySelector('meta[name="theme-color"]').content }));
await page.click('#theme-toggle');
const after = await page.evaluate(() => ({ dark: document.documentElement.dataset.theme === 'dark', color: document.querySelector('meta[name="theme-color"]').content, pressed: document.getElementById('theme-toggle').getAttribute('aria-pressed'), setting: JSON.parse(localStorage.getItem('tib-progress')).settings.theme }));
check(before.dark !== after.dark && before.color !== after.color, 'theme toggle switches the theme and meta theme-color');
check(after.pressed === String(after.dark) && after.setting === (after.dark ? 'dark' : 'light'), 'theme toggle updates aria-pressed and the setting');
check((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), 'no horizontal scroll after the theme switch');

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

await browser.close();
if (server) server.close();
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nsmoke test passed');
