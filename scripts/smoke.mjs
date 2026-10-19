// Browser smoke test: serves site/, opens it at phone width, plays one round.
// Usage: node scripts/smoke.mjs   (needs: npm i -D playwright && npx playwright install chromium)
//        SMOKE_URL=https://tibetan.itjoy.space node scripts/smoke.mjs   — run against a live site instead
// The test never calls the report API: config.js in the repo has an empty REPORT_API.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
import { syllableToWylie } from '../site/src/engine/wylie.js';
import { STAGE_IDS } from '../site/src/engine/letters.js';
import { contentWords } from '../site/src/engine/next.js';
import { renderTib } from '../site/src/engine/tib.js';
import { findUnit, allUnits } from '../site/src/engine/course.js';

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
check((await page.$$('.stage')).length === STAGE_IDS.length, `reading: ${STAGE_IDS.length} stages listed`);
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
check(menuLinks.length === 9 && menuLinks[0] === '#/course' && menuLinks.includes('#/read') && menuLinks.includes('#/support') && menuLinks.includes('#report'), 'menu lists the course first, eight sections and "report a problem"');
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

// a learner with practice progress gets the one-time choice when the course opens
await page.goto(`${base}/index.html#/course`);
await page.waitForSelector('#course-intro-start');
await page.click('#course-intro-start');
await page.waitForSelector('#course-continue');
check((await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('tib-progress')); return p.course.started && p.settings.home === 'course' && p.course.canRead === true; })), 'course: an old learner who chose the course has it started, the script question skipped (known words)');

// the course from scratch, in its own profile: welcome, the script question, the map, a unit, its words, the tiles step, a check
{
  const dataDir = new URL('../site/data/', import.meta.url);
  const words = JSON.parse(await readFile(new URL('words.json', dataDir), 'utf8'));
  const sentences = JSON.parse(await readFile(new URL('sentences.json', dataDir), 'utf8'));
  const course = JSON.parse(await readFile(new URL('course.json', dataDir), 'utf8'));
  const byId = new Map(sentences.map((s) => [s.id, s]));
  const unit = findUnit(course, 'lesson-01/1');
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const c = await ctx.newPage();
  c.on('pageerror', (e) => errors.push(`course: ${e}`));
  c.on('console', (m) => { if (m.type() === 'error') errors.push(`course: ${m.text()}`); });
  await c.goto(`${base}/index.html`);
  await c.waitForSelector('.popover .onboarding button');
  check(/#\/course$/.test(c.url()), 'course: a new learner lands on #/course');
  await c.click('.popover .onboarding .action.primary');
  await c.waitForSelector('#can-read-no');
  await c.click('#can-read-yes');
  await c.waitForSelector('#course-continue');
  check((await c.$$('.module')).length === 1 + course.modules.length, `course: ${1 + course.modules.length} modules on the map`);
  check((await c.$eval('#course-continue', (a) => a.getAttribute('href'))) === '#/course/lesson-01/1', 'course: "Continue" points at the first lesson unit for a reader');
  check((await c.$$('.unit-row')).length === allUnits(course).length, 'course: every unit listed');
  await c.click('#course-continue');
  await c.waitForSelector('.ladder');
  check((await c.$$('.ladder-row')).length === 5, 'course: the unit shows five steps');
  await c.click('.ladder-row[data-step="words"] a.action');
  await c.waitForSelector('#words-next');
  check((await c.$$('.word-card')).length === unit.words.length, `course: the words step shows the ${unit.words.length} new words`);
  await c.click('#words-next');
  await c.waitForSelector('.course-crumb');
  check((await c.evaluate(() => { const p = JSON.parse(localStorage.getItem('tib-progress')); return p.course.units['lesson-01/1'].step === 2 && Object.values(p.words).every((w) => w.status === 'learning'); })), 'course: after the words the unit is at the tiles step and the words are "learning"');
  check(/#\/course\/lesson-01\/1\/tiles$/.test(c.url()), 'course: the tiles step opened');
  check((await c.$eval('#course-counter', (e) => /0/.test(e.textContent))), 'course: the step counter starts at zero');

  // solve every sentence of the step from the chips (clean solves), until the unit screen comes back
  let solvedHere = 0;
  for (let i = 0; i < unit.sentences.length + 3 && !/#\/course\/lesson-01\/1$/.test(c.url()); i++) {
    await c.waitForSelector('.rack .tile');
    const order = await c.$$eval('.chip .tib', (els) => els.map((e) => e.textContent));
    const expected = await c.evaluate(() => [...document.querySelectorAll('.rack .tile .tile-text')].map((e) => e.textContent));
    // the chips list distinct words; a sentence may repeat one, so place by the rack's own texts in chip order
    const want = []; const pool = [...expected];
    for (const t of order) { let k; while ((k = pool.indexOf(t)) >= 0) { want.push(t); pool.splice(k, 1); } }
    for (const text of want) {
      for (const t of await c.$$('.rack .tile')) {
        if ((await t.$eval('.tile-text', (e) => e.textContent)) === text) { await t.click(); break; }
      }
    }
    await c.click('.buttons .action.primary');
    await c.waitForSelector('.feedback.good');
    solvedHere++;
    await c.click('.action.next');
    await c.waitForFunction(() => document.querySelector('.rack .tile') || document.querySelector('.ladder'));
  }
  check(/#\/course\/lesson-01\/1$/.test(c.url()) && solvedHere === unit.sentences.length, `course: the tiles step ends after its ${unit.sentences.length} sentences (solved ${solvedHere})`);
  check((await c.evaluate(() => JSON.parse(localStorage.getItem('tib-progress')).course.units['lesson-01/1'].step)) === 3, 'course: the unit moved on to the meaning step');

  // jump to the check and pass it: no hints, one try per task, the result closes the unit
  await c.evaluate(() => { const p = JSON.parse(localStorage.getItem('tib-progress')); p.course.units['lesson-01/1'].step = 5; p.course.units['lesson-01/1'].done = []; localStorage.setItem('tib-progress', JSON.stringify(p)); });
  await c.reload();
  await c.waitForSelector('.ladder-row[data-step="check"] a.action');
  await c.click('.ladder-row[data-step="check"] a.action');
  await c.waitForSelector('.course-crumb');
  check((await c.$eval('#btn-hint', (b) => b.hidden)) && (await c.$eval('.chips', (e) => e.hidden)), 'course: the check hides the hint button and the word chips');
  const unitSentences = unit.sentences.map((id) => byId.get(id));
  for (let task = 0; task < 10; task++) {
    await c.waitForFunction(() => document.querySelector('.rack .tile') || document.querySelector('.option .option-tib'));
    const prompt = await c.$eval('.prompt', (e) => e.textContent);
    const cands = unitSentences.filter((s) => s.tr.en === prompt);
    if (await c.$('.rack .tile')) {
      const rackTexts = await c.$$eval('.rack .tile .tile-text', (els) => els.map((e) => e.textContent).sort().join('|'));
      const s = cands.find((x) => x.words.filter((id) => !words[id].service).map((id) => words[id].tib).sort().join('|') === rackTexts) || cands[0];
      for (const text of s.words.filter((id) => !words[id].service).map((id) => words[id].tib)) {
        for (const t of await c.$$('.rack .tile')) {
          if ((await t.$eval('.tile-text', (e) => e.textContent)) === text) { await t.click(); break; }
        }
      }
      await c.click('.buttons .action.primary');
    } else {
      const texts = await c.$$eval('.option .option-tib', (els) => els.map((e) => e.textContent));
      const s = cands.find((x) => texts.includes(renderTib(x.words, words))) || cands[0];
      const i = texts.indexOf(renderTib(s.words, words));
      await (await c.$$('.option'))[i >= 0 ? i : 0].click();
    }
    await c.waitForSelector('.feedback.good, .feedback.bad');
    await c.click('.action.next');
  }
  await c.waitForSelector('.course-result:not([hidden])');
  const after = await c.evaluate(() => JSON.parse(localStorage.getItem('tib-progress')));
  check(after.course.units['lesson-01/1'].step === 6 && after.course.units['lesson-01/1'].best >= 8, `course: the check passed the unit (best ${after.course.units['lesson-01/1'].best})`);
  check(unit.words.every((id) => after.words[id] && after.words[id].status === 'known' && after.words[id].due), 'course: the words of the passed unit are known and scheduled');
  check((await c.$('#check-next-unit')) !== null, 'course: the result offers the next part');

  // a review session: the words of the unit made due today
  await c.evaluate(() => { const p = JSON.parse(localStorage.getItem('tib-progress')); const today = new Date(); const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; for (const w of Object.values(p.words)) if (w.status === 'known') w.due = d; localStorage.setItem('tib-progress', JSON.stringify(p)); });
  await c.goto(`${base}/index.html#/course`);
  await c.reload(); // the store reads localStorage once, at start
  await c.waitForSelector('#course-review');
  check((await c.$eval('#course-continue', (a) => a.getAttribute('href'))) === '#/course/lesson-01/2', 'course: "Continue" moved to the second part');
  check((await c.$eval('.unit-row[data-unit="lesson-01/1"]', (e) => e.classList.contains('passed'))), 'course: the map marks the passed part');
  await c.click('#course-review');
  await c.waitForSelector('.course-crumb');
  check((await c.$eval('#course-counter', (e) => /1/.test(e.textContent))), 'course: the review session starts at task 1');
  await c.goto(`${base}/index.html#/stats`);
  await c.waitForSelector('.stat-grid .stat');
  check((await c.$$('.stat-grid .stat')).length === 8, 'progress screen: eight tiles including the course');
  await ctx.close();
}

// records written by earlier versions of the site load with nothing lost (site/src/engine/tests/fixtures)
const contains = (whole, part) => Object.entries(part).every(([k, v]) => (v && typeof v === 'object' ? whole[k] && typeof whole[k] === 'object' && contains(whole[k], v) : whole[k] === v));
for (const name of ['progress-2026-10-12.json', 'progress-2026-10-19.json']) {
  const fixture = JSON.parse(await readFile(new URL(`../site/src/engine/tests/fixtures/${name}`, import.meta.url), 'utf8'));
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const old = await ctx.newPage();
  old.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  await old.goto(`${base}/index.html#/stats`);
  await old.evaluate((json) => localStorage.setItem('tib-progress', json), JSON.stringify(fixture));
  await old.reload();
  await old.waitForSelector('.stat-grid .stat');
  const onboarding = await old.$('.popover .onboarding button');
  if (onboarding) { await onboarding.click(); await old.waitForSelector('.popover', { state: 'detached' }); }
  const nums = await old.$$eval('.stat-grid .stat .num', (els) => els.map((e) => e.textContent));
  const known = Object.values(fixture.words).filter((w) => w.status === 'known').length;
  const solved = Object.values(fixture.sentences).reduce((n, s) => n + s.solved, 0);
  const passed = Object.values(fixture.reading || {}).filter((r) => r.best >= 10).length;
  check(nums[1] === String(fixture.streak.best) && nums[2] === String(known) && nums[5] === String(solved) && nums[6] === `${passed}/${STAGE_IDS.length}`,
    `${name}: progress screen shows the stored best streak, known words, solved sentences and reading stages (${nums.join(' ')})`);
  check((await old.evaluate(() => document.documentElement.lang)) === fixture.settings.lang, `${name}: the stored interface language is used`);
  await old.goto(`${base}/index.html#/dict`);
  await old.waitForSelector('.word-row', { state: 'attached' });
  check((await old.$$('.word-row .status-btn.known.on')).length === known, `${name}: dictionary marks the stored known words`);
  if (fixture.reading) {
    await old.goto(`${base}/index.html#/read`);
    await old.waitForSelector('.stage');
    check((await old.$$eval('.stage.passed', (els) => els.map((e) => e.dataset.stage))).join() === Object.keys(fixture.reading).filter((id) => fixture.reading[id].best >= 10).join(), `${name}: reading list marks the passed stages`);
  }
  if (fixture.course) {
    await old.goto(`${base}/index.html#/course`);
    await old.waitForSelector('#course-continue');
    check((await old.$eval('#course-continue', (a) => a.getAttribute('href'))) === `#/course/${fixture.course.current}`, `${name}: the course continues at the stored unit`);
    check((await old.$eval('.unit-row[data-unit="lesson-01/1"]', (e) => e.classList.contains('passed'))), `${name}: the passed unit is marked`);
  }
  check(contains(await old.evaluate(() => JSON.parse(localStorage.getItem('tib-progress'))), fixture), `${name}: nothing of the stored record is lost after using the site`);
  await ctx.close();
}

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

await browser.close();
if (server) server.close();
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nsmoke test passed');
