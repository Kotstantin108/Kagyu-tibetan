// Browser smoke test: serves site/, opens it at phone width, plays one round.
// Usage: node scripts/smoke.mjs   (needs: npm i -D playwright && npx playwright install chromium)
//        SMOKE_URL=https://tibetan.itjoy.space node scripts/smoke.mjs   — run against a live site instead
// The test never calls the report API: config.js in the repo has an empty REPORT_API.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('../site/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

let server = null;
let base = (process.env.SMOKE_URL || '').replace(/\/+$/, '');
if (!base) {
  server = http.createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    try {
      const body = await readFile(file);
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

for (const route of ['dict', 'grammar', 'stats', 'settings']) {
  await page.goto(`${base}/index.html#/${route}`);
  await page.waitForSelector('.panel');
  check((await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)), `#/${route}: no horizontal scroll`);
}

// theme toggle in the header: brand, button and language select on one line; click switches the theme
await page.goto(`${base}/index.html#/play`);
await page.waitForSelector('.rack .tile');
const headerRow = await page.evaluate(() => {
  const tops = ['.brand', '#theme-toggle', '#lang-select'].map((s) => document.querySelector(s).getBoundingClientRect());
  const btn = document.getElementById('theme-toggle').getBoundingClientRect();
  return { sameLine: tops.every((r) => Math.abs(r.top + r.height / 2 - tops[0].top - tops[0].height / 2) < 12), size: Math.min(btn.width, btn.height) };
});
check(headerRow.sameLine, 'header: brand, theme button and language select on one line');
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
