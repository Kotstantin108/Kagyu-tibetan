import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARTS, ROWS, partId, partOf, alphabetModule, partSigns, partPool, partNewItems, optionsFor, makeDrill, drillPass, examPassed, TRAIN_SIZE, ALPHA_CHECK_SIZE, EXAM_SIZE, TRAIN_PASS, ALPHA_CHECK_PASS, EXAM_PASS, OLD_STAGE_PARTS } from '../alphabet.js';
import { createProgress, normalizeProgress, recordAlphabetExam, setUnitStep, recordCheck, recordReadingRound } from '../progress.js';
import { allUnits, unitPassed, unitStep, currentUnit, courseProgress, PASSED } from '../course.js';
import { mergeProgress } from '../merge.js';
import { syllableToWylie } from '../wylie.js';

const DATA = new URL('../../../data/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, DATA), 'utf8'));
const words = load('words.json');
const sets = load('sets.json');
const course = load('course.json');
const alphabet = load('alphabet.json');
const t0 = new Date('2026-03-01T12:00:00Z');

test('the module has fifteen parts; the letters of the rows are the thirty letters of alphabet.json', () => {
  assert.equal(PARTS.length, 15);
  assert.deepEqual(alphabetModule().units.map((u) => u.id).slice(0, 2), ['alphabet/1', 'alphabet/2']);
  assert.equal(partOf('alphabet/9').kind, 'vowels');
  assert.equal(ROWS.flat().length, 30);
  const letters = alphabet.letters.filter((l) => l.kind === 'letter');
  assert.deepEqual(letters.map((l) => l.tib), ROWS.flat(), 'alphabet.json lists the letters in alphabet order');
  for (const l of letters) assert.equal(l.wylie, syllableToWylie(l.tib), `${l.tib}: the Wylie of the table is the transliterator's`);
  assert.equal(allUnits(course)[0].id, 'alphabet/1', 'the alphabet is the first module of the course');
});

test('signs, pools and new items of the parts', () => {
  const p1 = PARTS[0];
  assert.deepEqual(partSigns(p1, alphabet).map((s) => s.wylie), ['ka', 'kha', 'ga', 'nga']);
  assert.equal(partPool(p1, alphabet).length, 4);
  assert.equal(partPool(PARTS[2], alphabet).length, 12, 'the third row drills the twelve letters learnt so far');
  assert.deepEqual(partNewItems(PARTS[2], alphabet).map((x) => x.wylie), ['ta', 'tha', 'da', 'na']);
  assert.equal(partPool(PARTS[7], alphabet).length, 30);
  assert.equal(partSigns(PARTS[8], alphabet).length, 4, 'four vowel signs');
  assert.equal(partSigns(PARTS[11], alphabet).length, 15, 'five prefixes and ten suffixes');
  assert.ok(partPool(PARTS[12], alphabet, words, sets).length > 500, 'syllables of the course');
  assert.ok(partPool(PARTS[13], alphabet, words, sets).length > 300, 'words of the course');
  assert.deepEqual(partPool(PARTS[14], alphabet, words, sets), [], 'the sentences part has no drill pool');
  for (const l of alphabet.letters) for (const lang of ['en', 'ru', 'de', 'fr', 'pl']) assert.ok(l.sound[lang], `${l.tib} sound in ${lang}`);
});

test('options put look-alike signs first; drills have the right sizes and directions', () => {
  const pool = partPool(PARTS[7], alphabet);
  const ka = pool[0];
  const opts = optionsFor(ka, pool, alphabet, 4, () => 0.5);
  assert.equal(opts.length, 4);
  assert.equal(opts.filter((o) => o.right).length, 1);
  const similar = alphabet.letters.find((l) => l.tib === 'ཀ').similar;
  assert.ok(opts.filter((o) => !o.right).every((o) => similar.includes(o.tib)), 'the distractors of ཀ are its look-alikes');

  const train = makeDrill('train', PARTS[2], alphabet);
  assert.equal(train.length, TRAIN_SIZE);
  assert.ok(train.every((c) => !c.reverse && c.options.length === 4 && c.options.filter((o) => o.right).length === 1));
  const fresh = new Set(['ta', 'tha', 'da', 'na']);
  assert.ok(train.filter((c) => fresh.has(c.wylie)).length >= 4, 'the new row is in the round');
  assert.equal(makeDrill('train', PARTS[0], alphabet).length, TRAIN_SIZE, 'a four-letter pool still fills twelve cards');

  const check = makeDrill('check', PARTS[0], alphabet);
  assert.equal(check.length, ALPHA_CHECK_SIZE);
  assert.deepEqual(check.map((c) => c.reverse), [false, true, false, true, false, true, false, true, false, true]);

  const exam = makeDrill('exam', null, alphabet, words, sets);
  assert.equal(exam.length, EXAM_SIZE);
  assert.equal(exam.filter((c) => c.reverse).length, EXAM_SIZE / 2);
  assert.ok(exam.every((c) => c.tib && c.wylie && c.options.length === 4));
  assert.deepEqual([drillPass('train'), drillPass('check'), drillPass('exam'), drillPass('free')], [TRAIN_PASS, ALPHA_CHECK_PASS, EXAM_PASS, TRAIN_PASS]);
});

test('an alphabet part passes by its check; the exam passes the whole module', () => {
  let p = createProgress(t0);
  const u1 = allUnits(course)[0];
  assert.equal(currentUnit(course, p).id, 'alphabet/1');
  p = setUnitStep(p, u1.id, 3, t0);
  p = recordCheck(p, u1.id, { score: 7, pass: ALPHA_CHECK_PASS, wordIds: [] }, t0);
  assert.equal(unitPassed(p, u1), false);
  p = recordCheck(p, u1.id, { score: 9, pass: ALPHA_CHECK_PASS, wordIds: [] }, t0);
  assert.equal(unitPassed(p, u1), true);
  assert.equal(unitStep(p, u1), PASSED);
  assert.equal(currentUnit(course, p).id, 'alphabet/2');

  let q = createProgress(t0);
  q = recordAlphabetExam(q, 15, EXAM_PASS, t0);
  assert.equal(examPassed(q), false);
  assert.deepEqual(q.course.alphabetExam, { best: 15, attempts: 1, passedAt: null });
  q = recordAlphabetExam(q, 18, EXAM_PASS, t0);
  assert.equal(examPassed(q), true);
  assert.equal(courseProgress(course, q).passed, 15, 'all fifteen parts count as passed');
  assert.equal(currentUnit(course, q).id, 'lesson-01/1');
  assert.deepEqual(normalizeProgress(JSON.parse(JSON.stringify(q)), t0).course.alphabetExam, q.course.alphabetExam);
});

test('results of the old reading course move to the alphabet parts on load', () => {
  const raw = createProgress(t0);
  raw.reading = {
    rows1: { rounds: 3, best: 12, updatedAt: '2026-02-01T00:00:00.000Z' },
    vowels: { rounds: 1, best: 7, updatedAt: '2026-02-02T00:00:00.000Z' },
    'alphabet/2': { rounds: 1, best: 9, updatedAt: '2026-02-03T00:00:00.000Z' },
  };
  const p = normalizeProgress(JSON.parse(JSON.stringify(raw)), t0);
  assert.ok(!('rows1' in p.reading) && !('vowels' in p.reading));
  for (const n of OLD_STAGE_PARTS.rows1) assert.equal(p.reading[`alphabet/${n}`].best, 12);
  assert.equal(p.reading['alphabet/2'].rounds, 4, 'rounds add up');
  assert.equal(p.reading['alphabet/9'].best, 7);
  for (const n of [1, 2, 3, 4]) assert.equal(p.course.units[`alphabet/${n}`].step, 6, `a passed old stage passes part ${n}`);
  assert.equal(p.course.units['alphabet/9'], undefined, 'a stage below the pass mark passes nothing');
  assert.deepEqual(normalizeProgress(JSON.parse(JSON.stringify(p)), t0), p, 'the migrated record is stable');
  const r = recordReadingRound(p, 'alphabet/5', 11, t0);
  assert.equal(r.reading['alphabet/5'].best, 11);
});

test('merging alphabet exams keeps the best and the earliest pass', () => {
  const a = createProgress(new Date('2026-01-01T00:00:00Z'));
  const b = createProgress(new Date('2026-01-02T00:00:00Z'));
  a.course.alphabetExam = { best: 16, attempts: 2, passedAt: null };
  b.course.alphabetExam = { best: 18, attempts: 1, passedAt: '2026-01-02T00:00:00.000Z' };
  const m = mergeProgress(a, b);
  assert.deepEqual(m.course.alphabetExam, { best: 18, attempts: 2, passedAt: '2026-01-02T00:00:00.000Z' });
  assert.deepEqual(mergeProgress(a, null).course.alphabetExam, a.course.alphabetExam);
  assert.equal(mergeProgress(createProgress(), null).course.alphabetExam, null);
  assert.equal(partId(3), 'alphabet/3');
});
