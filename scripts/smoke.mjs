// Browser smoke test: serves site/, opens it at phone width, plays one round.
// Usage: node scripts/smoke.mjs   (needs: npm i -D playwright && npx playwright install chromium)
//        SMOKE_URL=https://tibetan.itjoy.space node scripts/smoke.mjs   — run against a live site instead
// The test never calls the report API: config.js in the repo has an empty REPORT_API.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';
import { syllableToWylie, toWylie } from '../site/src/engine/wylie.js';
import { PARTS, OLD_STAGE_PARTS } from '../site/src/engine/alphabet.js';
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
check((await page.$eval('.tashi', (e) => !e.hidden && (e.dataset.frame === 'smile' || e.dataset.frame === 'blink'))), 'Yak Tashi is shown on the exercise screen, smiling (or mid-blink)');
check((await page.$eval('#tashi-bubble', (e) => e.hidden)), 'Yak Tashi is quiet before any answer');

// grammar help: opens a popover and changes nothing in the progress record
const progressBefore = await page.evaluate(() => localStorage.getItem('tib-progress'));
await page.click('.chip');
await page.waitForSelector('.popover .big-tib');
check((await page.$('.popover .audio-btn[data-kind="synth"]')) === null, 'word card has no synthesised listen button while the voice setting is off');
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
  check((await page.$eval('#tashi-bubble', (e) => !e.hidden && e.textContent.trim().length > 0)), 'Yak Tashi consoles after a mistake');
  check((await page.$eval('.tashi', (e) => e.dataset.frame === 'talk')), 'Yak Tashi shows the talking frame while the bubble is up');
  check((await page.evaluate(() => { const b = document.getElementById('tashi-bubble').getBoundingClientRect(); return b.left >= 0 && b.right <= window.innerWidth; })), 'the bubble stays inside the 360px screen');
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
check((await page.$$('.stage')).length === PARTS.length - 1, `reading: ${PARTS.length - 1} parts of the alphabet listed as a free trainer`);
await page.click('.stage[data-stage="1"] a.action.primary');
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
check((await page.evaluate(() => JSON.parse(localStorage.getItem('tib-progress')).reading['alphabet/1'].best)) === 12, 'reading: the best score is recorded in the progress');

// pronunciation: the native recordings are on by default, the synthesised voice needs its setting
await page.goto(`${base}/index.html#/dict`);
await page.waitForSelector('.word-row', { state: 'attached' });
check((await page.$('.word-row .audio-btn[data-kind="synth"]')) === null && (await page.$('.word-row .audio-btn[data-kind="native"]')) !== null, 'dictionary: by default only the words with a native recording have a listen button');
await page.goto(`${base}/index.html#/settings`);
await page.waitForSelector('#settings-recordings');
check((await page.$eval('#settings-recordings', (b) => b.checked)) && !(await page.$eval('#settings-voice', (b) => b.checked)), 'settings: recordings on, synthesised voice off by default');
await page.click('#settings-voice');
await page.goto(`${base}/index.html#/dict`);
await page.waitForSelector('.word-row', { state: 'attached' });
check((await page.$('.word-row .audio-btn[data-kind="synth"]')) !== null, 'dictionary shows synthesised listen buttons after enabling the voice setting');
await page.goto(`${base}/index.html#/course/alphabet/1/intro`);
await page.waitForSelector('#words-next');
check((await page.$$('.sign-card .word-card-head .audio-btn')).length === 4, 'alphabet: the letter cards show listen buttons (native recordings of the signs)');
await page.goto(`${base}/index.html#/course/alphabet/12/intro`);
await page.waitForSelector('#words-next');
check((await page.$$('.sign-card .spelled .audio-btn.spell')).length >= 20, 'alphabet: the affix cards show words spelled out by a native speaker');
await page.goto(`${base}/index.html#/course/alphabet/8/intro`);
await page.waitForSelector('#words-next');
check((await page.$$('.sign-card.sanskrit')).length === 11, 'alphabet: the last row of letters shows the eleven signs for Sanskrit words');
await page.goto(`${base}/index.html#/course/alphabet/4/intro`);
await page.waitForSelector('#words-next');
check((await page.$$('.sign-card .spelled .example')).length >= 3, 'alphabet: the letter cards show the single-letter words with their recordings');
check((await page.$$eval('.sign-card .spelled .example', (es) => es.filter((e) => e.querySelector('.audio-btn:not(.spell)') && e.querySelector('.audio-btn.spell')).length)) >= 1, 'alphabet: a spelled-out word has both the plain reading and the spelling');
check((await page.$('.sign-card .spell-note')) !== null, 'alphabet: the spelling note is shown under the spelled-out words');
await page.goto(`${base}/index.html#/read`);
await page.waitForSelector('.phrases');
check((await page.$$('.phrase-row .audio-btn')).length === 23, 'reading: the colloquial phrases are listed with listen buttons');
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
check((await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('tib-progress')); return p.course.started && p.settings.home === 'course' && p.course.canRead === null; })), 'course: an old learner who chose the course has it started, without the script question');
check((await page.$('#course-exam')) !== null, 'course: an old learner sees the alphabet exam on the map');

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
  await c.click('#can-read-no');
  await c.waitForSelector('#course-continue');
  check((await c.$$('.module')).length === 1 + course.modules.length, `course: ${1 + course.modules.length} modules on the map`);
  check((await c.$eval('#course-continue', (a) => a.getAttribute('href'))) === '#/course/alphabet/1/theory', 'course: "Continue" points at the theory of the first part of the alphabet');
  check((await c.$$('.unit-row:not(.exam-row):not(.theory-row)')).length === allUnits(course).length, 'course: every unit listed');
  check((await c.$('#course-exam')) !== null, 'course: the alphabet module offers the exam');

  // the alphabet: meet the signs, a training round, the check; then the exam
  const solveDrill = async (count, label) => {
    for (let i = 0; i < count; i++) {
      await c.waitForSelector('.read-card:not([hidden])');
      const reverse = await c.$eval('.read-card', (e) => e.classList.contains('reverse'));
      const shown = await c.$eval('.read-card', (e) => e.textContent);
      let hit = false;
      for (const b of await c.$$('.read-options .option')) {
        const text = await b.$eval('.option-wylie, .option-tib', (e) => e.textContent);
        const ok = reverse ? toWylie(text) === shown : text === toWylie(shown);
        if (ok) { await b.click(); hit = true; break; }
      }
      if (!hit) { check(false, `${label}: no right option for ${shown}`); return false; }
      await c.waitForFunction(() => !document.querySelector('.read-result').hidden || document.querySelector('.feedback').textContent === '');
    }
    return true;
  };
  await c.click('#course-continue');
  // the theory page of the first part: letters open their cards, "next" leads to the cards
  await c.waitForSelector('#theory-next');
  check(/#\/course\/alphabet\/1\/theory$/.test(c.url()), 'alphabet: "Continue" opens the theory of the first part');
  check((await c.$$('.theory-text')).length >= 4, 'alphabet theory: the page shows the paragraphs of part 1');
  check((await c.$$('.theory-text .tib-sign')).length >= 4, 'alphabet theory: the letters are tappable');
  await c.click('.theory-text .tib-sign');
  await c.waitForSelector('.popover .theory-sign .sign-name');
  check((await c.$eval('.popover .theory-sign .tr', (e) => e.textContent.trim().length > 0)), 'alphabet theory: a tapped letter shows its sound');
  await c.keyboard.press('Escape');
  await c.waitForSelector('.popover', { state: 'detached' });
  await c.click('#theory-next');
  await c.waitForSelector('#words-next');
  check(/#\/course\/alphabet\/1\/intro$/.test(c.url()), 'alphabet theory: "next" opens the cards of the part');
  check((await c.evaluate(() => JSON.parse(localStorage.getItem('tib-progress')).course.theory.includes('alphabet/1'))), 'alphabet theory: the page is recorded as read');
  await c.goto(`${base}/index.html#/course/alphabet/1`);
  await c.waitForSelector('.ladder');
  check((await c.$$('.ladder-row')).length === 4, 'alphabet: a part shows the theory and three steps');
  check((await c.$eval('.ladder-row[data-step="theory"]', (e) => e.classList.contains('done'))), 'alphabet: the theory row is done');
  await c.click('.ladder-row[data-step="intro"] a.action');
  await c.waitForSelector('#words-next');
  check((await c.$$('.sign-card')).length === 4, 'alphabet: the first part introduces four letters');
  check((await c.$$eval('.sign-card .tone-badge', (els) => els.length)) === 4, 'alphabet: every letter card shows its tone');
  await c.click('#words-next');
  await c.waitForSelector('.read-card');
  check(/#\/course\/alphabet\/1\/train$/.test(c.url()), 'alphabet: the training opened after the introduction');
  if (await solveDrill(12, 'alphabet training')) {
    check((await c.$eval('.read-result', (e) => !e.hidden && /12/.test(e.textContent))), 'alphabet: the training round is scored');
    await c.waitForSelector('#drill-on:not([hidden])');
    await c.click('#drill-on');
    await c.waitForSelector('.read-card');
    check(/#\/course\/alphabet\/1\/check$/.test(c.url()), 'alphabet: the check opened after a passed training');
    if (await solveDrill(10, 'alphabet check')) {
      const rec = await c.evaluate(() => JSON.parse(localStorage.getItem('tib-progress')).course.units['alphabet/1']);
      check(rec && rec.step === 6 && rec.best === 10, 'alphabet: the check passed the first part');
    }
  }
  await c.goto(`${base}/index.html#/course/alphabet/exam`);
  await c.waitForSelector('.read-card');
  if (await solveDrill(20, 'alphabet exam')) {
    const exam = await c.evaluate(() => JSON.parse(localStorage.getItem('tib-progress')).course.alphabetExam);
    check(exam && exam.best === 20 && exam.passedAt, 'alphabet: the exam is recorded as passed');
  }
  await c.goto(`${base}/index.html#/course`);
  await c.waitForSelector('#course-continue');
  check((await c.$eval('.module[data-module="alphabet"]', (e) => e.classList.contains('passed'))), 'alphabet: the module is passed after the exam');
  check((await c.$eval('#course-continue', (a) => a.getAttribute('href'))) === '#/course/lesson-01/theory', 'course: "Continue" moves on to the theory of the first lesson');
  check((await c.$$('.theory-row')).length === course.modules.length, 'course: every lesson has a theory row on the map');
  await c.click('#course-continue');
  await c.waitForSelector('#theory-next');
  check((await c.$$('.theory-text')).length >= 4, 'theory: the page shows the paragraphs of lesson 1');
  check((await c.$$('.theory-text .tib-word')).length >= 10, 'theory: the Tibetan words are tappable');
  await c.click('.theory-text .tib-word');
  await c.waitForSelector('.popover .theory-word .big-tib');
  check((await c.$eval('.popover .theory-word .tr', (e) => e.textContent.trim().length > 0)), 'theory: a tapped word shows its meaning');
  await c.keyboard.press('Escape');
  await c.waitForSelector('.popover', { state: 'detached' });
  await c.click('#theory-next');
  await c.waitForSelector('#words-next');
  check(/#\/course\/lesson-01\/1\/words$/.test(c.url()), 'theory: "next" opens the words of the first part');
  check((await c.evaluate(() => JSON.parse(localStorage.getItem('tib-progress')).course.theory.includes('lesson-01'))), 'theory: the page is recorded as read');
  await c.goto(`${base}/index.html#/course/lesson-01/1`);
  await c.waitForSelector('.ladder');
  check((await c.$$('.ladder-row')).length === 6, 'course: the first unit shows the theory and five steps');
  check((await c.$eval('.ladder-row[data-step="theory"]', (e) => e.classList.contains('done'))), 'course: the theory row is done');
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
for (const name of ['progress-2026-10-12.json', 'progress-2026-10-19.json', 'progress-2026-10-19d.json']) {
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
  // the alphabet parts the stored record passes: old stages with a pass mark, plus explicit units and the exam
  const alphaParts = new Set();
  for (const [id, r] of Object.entries(fixture.reading || {})) if (r.best >= 10) for (const n of OLD_STAGE_PARTS[id] || []) alphaParts.add(n);
  for (const [id, u] of Object.entries((fixture.course || {}).units || {})) if (id.startsWith('alphabet/') && u.step >= 6) alphaParts.add(Number(id.split('/')[1]));
  const passed = alphaParts.size;
  check(nums[1] === String(fixture.streak.best) && nums[2] === String(known) && nums[5] === String(solved) && nums[6] === `${passed}/${PARTS.length}`,
    `${name}: progress screen shows the stored best streak, known words, solved sentences and reading stages (${nums.join(' ')})`);
  check((await old.evaluate(() => document.documentElement.lang)) === fixture.settings.lang, `${name}: the stored interface language is used`);
  await old.goto(`${base}/index.html#/dict`);
  await old.waitForSelector('.word-row', { state: 'attached' });
  check((await old.$eval('.tashi', (e) => e.hidden)), `${name}: Yak Tashi stays off the dictionary`);
  check((await old.$$('.word-row .status-btn.known.on')).length === known, `${name}: dictionary marks the stored known words`);
  if (fixture.reading) {
    await old.goto(`${base}/index.html#/read`);
    await old.waitForSelector('.stage');
    const readPassed = new Set();
    for (const [id, r] of Object.entries(fixture.reading)) if (r.best >= 10) for (const n of OLD_STAGE_PARTS[id] || [Number(id.split('/')[1])]) readPassed.add(String(n));
    check((await old.$$eval('.stage.passed', (els) => els.map((e) => e.dataset.stage))).join() === [...readPassed].join(), `${name}: reading list marks the passed parts`);
  }
  if (fixture.course) {
    await old.goto(`${base}/index.html#/course`);
    await old.waitForSelector('#course-continue');
    check((await old.$eval('#course-continue', (a) => a.getAttribute('href'))) === `#/course/${fixture.course.current}`, `${name}: the course continues at the stored unit`);
    const passedUnit = Object.keys(fixture.course.units).find((id) => fixture.course.units[id].step >= 6);
    check((await old.$eval(`.unit-row[data-unit="${passedUnit}"]`, (e) => e.classList.contains('passed'))), `${name}: the passed unit ${passedUnit} is marked`);
  }
  const expected = { ...fixture, reading: {} };
  for (const [id, r] of Object.entries(fixture.reading || {})) { const parts = OLD_STAGE_PARTS[id]; if (parts) for (const n of parts) expected.reading[`alphabet/${n}`] = { best: r.best }; else expected.reading[id] = r; }
  // the store writes only on a change: the record is either still the stored one or its migrated form
  const storedNow = await old.evaluate(() => JSON.parse(localStorage.getItem('tib-progress')));
  check(contains(storedNow, fixture) || contains(storedNow, expected), `${name}: nothing of the stored record is lost after using the site`);
  await ctx.close();
}

// the editor page (edit.html): the API is mocked in the browser, the real one is report-api on the server
{
  const ectx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const ed = await ectx.newPage();
  ed.on('pageerror', (e) => errors.push(`edit: ${e}`));
  const SHA = 'a'.repeat(40);
  const repo = { 'content/intro/ru.md': '# Русский\n\n## lesson-01\n\nПервый абзац ཆོས་ «Дхарма».\n\nВторой.\n\n## alphabet/1\n\nБуквы.\n', 'content/words.tsv': '# tib | en\nཆོས་ | Dharma\n' };
  const puts = [];
  await ed.route('**/api/edit/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.headers().authorization !== 'Bearer pw') return json(401, { ok: false, error: 'password' });
    if (u.pathname.endsWith('/files')) return json(200, { ok: true, branch: 'main', files: Object.keys(repo).sort() });
    const path = u.searchParams.get('path') || (req.postDataJSON() || {}).path;
    if (req.method() === 'GET') return json(200, { ok: true, path, sha: SHA, content: repo[path] });
    const body = req.postDataJSON();
    puts.push(body);
    repo[path] = body.content;
    return json(200, { ok: true, sha: 'b'.repeat(40), commit: { sha: 'c'.repeat(40), url: 'https://github.com/x/y/commit/ccc' } });
  });
  await ed.route('https://api.github.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"workflow_runs":[]}' }));
  await ed.goto(`${base}/edit.html`);
  await ed.fill('#password', 'wrong');
  await ed.click('#login button[type=submit]');
  await ed.waitForSelector('#login-status:not(.hidden)');
  check((await ed.$eval('#login-status', (e) => e.textContent)) === 'Wrong password.', 'editor: a wrong password is reported');
  await ed.fill('#password', 'pw');
  await ed.click('#login button[type=submit]');
  await ed.waitForSelector('#sections button');
  check((await ed.$$eval('#langs button', (bs) => bs.map((b) => b.textContent))).join() === 'Русский', 'editor: only languages whose file exists are offered');
  check((await ed.$$eval('#sections .id', (es) => es.map((e) => e.textContent))).join() === 'lesson-01,alphabet/1', 'editor: the sections of the file are listed');
  check((await ed.$eval('#sections li:first-child .name', (e) => e.textContent)).startsWith('Урок 1'), 'editor: lesson names come from the course data');
  await ed.click('#sections li:first-child button');
  await ed.waitForSelector('#pane:not(.hidden)');
  check((await ed.$eval('#text', (t) => t.value)) === 'Первый абзац ཆོས་ «Дхарма».\n\nВторой.', 'editor: a section opens with its paragraphs only');
  check((await ed.$eval('#open', (a) => a.getAttribute('href'))) === './#/course/lesson-01/theory', 'editor: link to the page in the app');
  await ed.fill('#text', 'Первый абзац ཆོས་ «Дхарма».\n\nВторой, исправленный.\n');
  await ed.fill('#note', 'typo');
  await ed.click('#save');
  await ed.waitForSelector('#status.good');
  check(puts.length === 1 && puts[0].path === 'content/intro/ru.md' && puts[0].sha === SHA && puts[0].message === 'typo', 'editor: save sends the file path, its sha and the note');
  check(puts[0] && puts[0].content === '# Русский\n\n## lesson-01\n\nПервый абзац ཆོས་ «Дхарма».\n\nВторой, исправленный.\n\n## alphabet/1\n\nБуквы.\n', 'editor: only the edited section changes in the file');
  check((await ed.$eval('#status a', (a) => a.textContent)) === 'ccccccc', 'editor: the commit is linked after saving');
  await ed.click('#modes button[data-mode="files"]');
  await ed.waitForSelector('#files button');
  await ed.click('#files li:last-child button');
  await ed.waitForFunction(() => document.getElementById('text').classList.contains('raw'));
  check((await ed.$eval('#text', (t) => t.value)) === repo['content/words.tsv'], 'editor: a TSV file opens whole in the raw mode');
  await ectx.close();
}

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

await browser.close();
if (server) server.close();
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nsmoke test passed');
