import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { splitUnits, allUnits, findUnit, unitStep, unitPassed, unitAllKnown, courseProgress, currentUnit, nextUnit, stepQueue, makeCheck, passScore, reviewSession, dueCount, UNIT_WORDS, UNIT_SENTENCES, TAIL_MIN, STEPS, PASSED, CHECK_SIZE } from '../course.js';
import { createProgress, setWordStatus, setCanRead, setCurrentUnit, seeUnitWords, markStepDone, setUnitStep, recordCheck, recordReadingRound, wordStatus, STATUS } from '../progress.js';

const DATA = new URL('../../../data/', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(name, DATA), 'utf8'));
const words = load('words.json');
const sentences = load('sentences.json');
const sets = load('sets.json');
const course = load('course.json');
const t0 = new Date('2026-03-01T12:00:00Z');

// a tiny course: two sets, words w1..w40 with sentences of two words each
function tinyData() {
  const dict = { shad: { tib: '།', service: true } };
  const list = [];
  let n = 0;
  const mk = (set, count) => {
    for (let i = 0; i < count; i++) {
      const a = `w${n + 1}`; const b = `w${n + 2}`; n += 2;
      dict[a] = { tib: 'ཀ་', set }; dict[b] = { tib: 'ཁ་', set };
      list.push({ id: `${set}-${i + 1}`, words: [a, b, 'shad'], set, tr: { en: 'x' } });
    }
  };
  mk('a', 17); // 17 sentences, 34 words -> units of 10 sentences (20 words) + 7
  mk('b', 4);  // 4 sentences: one short unit
  return { dict, list, sets: [{ id: 'a', order: 1 }, { id: 'b', order: 2 }] };
}

test('splitUnits cuts a set at 12 new words and 10 sentences, keeps a short tail with the previous unit', () => {
  const { dict, list, sets: ss } = tinyData();
  const modules = splitUnits(list, dict, ss);
  assert.deepEqual(modules.map((m) => m.id), ['a', 'b']);
  assert.deepEqual(modules[0].units.map((u) => u.sentences.length), [10, 7]);
  assert.deepEqual(modules[0].units.map((u) => u.id), ['a/1', 'a/2']);
  assert.equal(modules[0].units[0].words.length, 20);
  assert.deepEqual(modules[1].units.map((u) => u.sentences.length), [4], 'a set shorter than a unit is one unit');
  assert.deepEqual(splitUnits(list, dict, ss), modules, 'deterministic');
});

test('the shipped course.json covers every sentence once and respects the unit rules', () => {
  const seen = new Map();
  for (const m of course.modules) {
    for (const u of m.units) {
      assert.ok(u.sentences.length >= 1);
      for (const id of u.sentences) { assert.ok(!seen.has(id), `${id} twice`); seen.set(id, u.id); }
      const isLast = u === m.units[m.units.length - 1];
      if (!isLast) assert.ok(u.words.length >= UNIT_WORDS && u.sentences.length >= UNIT_SENTENCES, `${u.id} closed early`);
      else assert.ok(u.sentences.length >= Math.min(TAIL_MIN, m.units.length === 1 ? 1 : TAIL_MIN), `${u.id} is a dangling tail`);
      for (const id of u.words) assert.ok(words[id] && !words[id].service, `${u.id}: ${id}`);
    }
  }
  assert.equal(seen.size, sentences.length);
  const units = allUnits(course);
  assert.equal(units[0].id, 'reading/rows1', 'the reading course comes first');
  assert.ok(units.length > 60);
  assert.deepEqual(JSON.stringify(splitUnits(sentences, words, sets)), JSON.stringify(course.modules), 'course.json is what the splitter gives (run build:content)');
});

test('unit state, the current unit and the fast check', () => {
  let p = createProgress(t0);
  const u1 = findUnit(course, 'lesson-01/1');
  const u2 = findUnit(course, 'lesson-01/2');
  const r1 = findUnit(course, 'reading/rows1');
  assert.equal(unitStep(p, u1), 1);
  assert.equal(unitPassed(p, u1), false);
  assert.equal(currentUnit(course, p).id, 'reading/rows1', 'a fresh learner starts with the script');
  p = setCanRead(p, true, t0);
  assert.equal(unitPassed(p, r1), true, 'reading units count as passed for a reader');
  assert.equal(currentUnit(course, p).id, 'lesson-01/1');
  p = setCanRead(p, false, t0);
  p = recordReadingRound(p, 'rows1', 12, t0);
  assert.equal(unitPassed(p, r1), true, 'or when the stage was passed');
  p = setCanRead(p, true, t0);

  p = setCurrentUnit(p, 'lesson-01/2', t0);
  assert.equal(currentUnit(course, p).id, 'lesson-01/2', 'the unit opened last');
  assert.equal(nextUnit(course, u1).id, 'lesson-01/2');

  assert.equal(unitAllKnown(p, u1), false);
  for (const id of u1.words) p = setWordStatus(p, id, STATUS.KNOWN, t0);
  assert.equal(unitAllKnown(p, u1), true);

  p = seeUnitWords(p, u2.words, t0);
  for (const id of u2.words) assert.equal(wordStatus(p, id), STATUS.LEARNING);
  p = seeUnitWords(p, u1.words, t0);
  for (const id of u1.words) assert.equal(wordStatus(p, id), STATUS.KNOWN, 'known words stay known');

  p = setUnitStep(p, u2.id, 2, t0);
  assert.equal(stepQueue(u2, p, sentences, words).length, u2.sentences.length);
  const first = stepQueue(u2, p, sentences, words)[0];
  p = markStepDone(p, u2.id, first.id, t0);
  p = markStepDone(p, u2.id, first.id, t0);
  assert.deepEqual(p.course.units[u2.id].done, [first.id]);
  assert.equal(stepQueue(u2, p, sentences, words).length, u2.sentences.length - 1);
  p = setUnitStep(p, u2.id, 3, t0);
  assert.deepEqual(p.course.units[u2.id].done, [], 'a new step starts with an empty solved list');
  assert.deepEqual(STEPS, ['words', 'tiles', 'meaning', 'recall', 'check']);
  assert.equal(PASSED, 6);
});

test('a check: tasks, the pass score, and what passing does to the words', () => {
  const u = findUnit(course, 'lesson-01/1');
  const tasks = makeCheck(u, sentences, () => 0.5);
  assert.equal(tasks.length, CHECK_SIZE);
  assert.equal(new Set(tasks.map((x) => x.sentence.id)).size, CHECK_SIZE, 'distinct sentences');
  assert.ok(tasks.every((x) => u.sentences.includes(x.sentence.id)));
  assert.deepEqual(tasks.slice(0, 4).map((x) => x.exercise), ['tiles', 'recall', 'tiles', 'recall']);
  assert.equal(passScore(10), 8);
  assert.equal(passScore(7), 6);
  assert.equal(passScore(3), 3);

  let p = createProgress(t0);
  p = setWordStatus(p, u.words[0], STATUS.KNOWN, t0); // already known: untouched
  p = seeUnitWords(p, u.words, t0);
  p = setUnitStep(p, u.id, 5, t0);
  p = recordCheck(p, u.id, { score: 6, pass: 8, wordIds: u.words, wrongWordIds: [u.words[1]] }, t0);
  assert.equal(p.course.units[u.id].step, 5, 'a failed check keeps the step');
  assert.equal(p.course.units[u.id].attempts, 1);
  assert.equal(p.course.units[u.id].best, 6);
  assert.equal(wordStatus(p, u.words[2]), STATUS.LEARNING, 'no promotion on a fail');
  p = recordCheck(p, u.id, { score: 9, pass: 8, wordIds: u.words, wrongWordIds: [u.words[1]] }, t0);
  assert.equal(p.course.units[u.id].step, PASSED);
  assert.equal(p.course.units[u.id].best, 9);
  assert.equal(p.course.units[u.id].passedAt, t0.toISOString());
  assert.equal(unitPassed(p, u), true);
  assert.equal(wordStatus(p, u.words[2]), STATUS.KNOWN);
  assert.equal(p.words[u.words[2]].level, 0);
  assert.equal(p.words[u.words[2]].due, '2026-03-02', 'known at level 0: review tomorrow');
  assert.equal(wordStatus(p, u.words[1]), STATUS.LEARNING, 'a word missed in the check stays learning');
  assert.equal(p.words[u.words[0]].level, 2, 'a word known before keeps its level');
  assert.equal(courseProgress(course, p).passed, 1);
});

test('a review session covers the due words with sentences of the passed units', () => {
  const u = findUnit(course, 'lesson-01/1');
  let p = createProgress(t0);
  p = setUnitStep(p, u.id, 5, t0);
  p = recordCheck(p, u.id, { score: 10, pass: 8, wordIds: u.words }, t0);
  assert.deepEqual(reviewSession(course, p, sentences, words, '2026-03-01'), [], 'nothing due today');
  const tasks = reviewSession(course, p, sentences, words, '2026-03-02');
  assert.ok(tasks.length > 0 && tasks.length <= 20);
  assert.ok(tasks.every((x) => u.sentences.includes(x.sentence.id)), 'only sentences of passed units');
  assert.ok(tasks.every((x) => ['tiles', 'recall'].includes(x.exercise)));
  const covered = new Set(tasks.flatMap((x) => x.sentence.words));
  const due = u.words.filter((id) => p.words[id].due === '2026-03-02');
  assert.ok(due.filter((id) => covered.has(id)).length >= due.length * 0.8, 'most due words are covered');
  assert.equal(dueCount(p, words, '2026-03-02'), u.words.length);
  assert.equal(dueCount(p, words, '2026-03-01'), 0);
});
