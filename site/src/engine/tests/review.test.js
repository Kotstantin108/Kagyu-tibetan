import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgress, recordSolved, setWordStatus, wordError, revealWord, isDue, dueWords, STATUS, normalizeProgress } from '../progress.js';
import { pickNext } from '../next.js';
import { REVIEW_INTERVALS, MANUAL_KNOWN_LEVEL } from '../config.js';
import { addDays } from '../streak.js';

const day1 = new Date(2026, 4, 10, 12, 0); // local 2026-05-10
const D = '2026-05-10';

test('a newly known word is due tomorrow', () => {
  let p = createProgress(day1);
  p = recordSolved(p, 's1', { newWordIds: ['nga'] }, day1);
  assert.equal(p.words.nga.level, 0);
  assert.equal(p.words.nga.due, addDays(D, REVIEW_INTERVALS[0]));
  assert.equal(isDue(p, 'nga', D), false);
  assert.equal(isDue(p, 'nga', addDays(D, 1)), true);
  assert.equal(isDue(p, 'nga', addDays(D, 5)), true, 'overdue still counts');
});

test('a successful review when due raises the level and pushes the due day', () => {
  let p = createProgress(day1);
  p = recordSolved(p, 's1', { newWordIds: ['nga'] }, day1);
  const day2 = new Date(2026, 4, 11, 9, 0);
  p = recordSolved(p, 's2', { seenIds: ['nga'] }, day2);
  assert.equal(p.words.nga.level, 1);
  assert.equal(p.words.nga.due, addDays('2026-05-11', REVIEW_INTERVALS[1]));
  assert.equal(p.words.nga.status, STATUS.KNOWN);
});

test('seeing a known word before it is due does not change its schedule', () => {
  let p = createProgress(day1);
  p = recordSolved(p, 's1', { newWordIds: ['nga'] }, day1);
  const before = p.words.nga.due;
  p = recordSolved(p, 's2', { seenIds: ['nga'] }, day1);
  assert.equal(p.words.nga.level, 0);
  assert.equal(p.words.nga.due, before);
  assert.equal(p.words.nga.seen, 1);
});

test('the level never exceeds the last interval', () => {
  let p = createProgress(day1);
  p = recordSolved(p, 's1', { newWordIds: ['nga'] }, day1);
  let day = D;
  for (let i = 0; i < 12; i++) {
    day = p.words.nga.due;
    const [y, m, d] = day.split('-').map(Number);
    p = recordSolved(p, 's2', { seenIds: ['nga'] }, new Date(y, m - 1, d, 10));
  }
  const last = REVIEW_INTERVALS[REVIEW_INTERVALS.length - 1];
  assert.equal(p.words.nga.due, addDays(day, last));
});

test('a mistake or a peek resets the schedule', () => {
  let p = createProgress(day1);
  p = recordSolved(p, 's1', { newWordIds: ['nga', 'yin'], promoteUpTo: 2 }, day1);
  p = wordError(p, 'nga', day1);
  assert.equal(p.words.nga.status, STATUS.LEARNING);
  assert.equal(p.words.nga.due, null);
  p = revealWord(p, 'yin', day1);
  assert.equal(p.words.yin.level, 0);
  assert.equal(p.words.yin.due, null);
});

test('a peeked due word is not advanced on solve', () => {
  let p = createProgress(day1);
  p = recordSolved(p, 's1', { newWordIds: ['nga'] }, day1);
  const day2 = new Date(2026, 4, 11, 9, 0);
  p = revealWord(p, 'nga', day2); // now learning, not known
  p = recordSolved(p, 's2', { seenIds: ['nga'], revealedIds: ['nga'] }, day2);
  assert.equal(p.words.nga.status, STATUS.LEARNING);
});

test('manual "known" starts at the manual level', () => {
  let p = createProgress(day1);
  p = setWordStatus(p, 'bla', STATUS.KNOWN, day1);
  assert.equal(p.words.bla.level, MANUAL_KNOWN_LEVEL);
  assert.equal(p.words.bla.due, addDays(D, REVIEW_INTERVALS[MANUAL_KNOWN_LEVEL]));
  assert.deepEqual(dueWords(p, addDays(D, 30)), ['bla']);
});

test('old records without schedule fields are tolerated', () => {
  const p = normalizeProgress({ words: { a: { status: 'known', updatedAt: '2026-01-01T00:00:00Z', seen: 1, errors: 0 } } }, day1);
  assert.equal(p.words.a.level, 0);
  assert.equal(p.words.a.due, null);
  assert.equal(isDue(p, 'a', D), false, 'never scheduled: not due');
});

// ---- picking reviews ----

const dict = {
  nga: { tib: 'ང་' }, slob: { tib: 'སློབ་མ་' }, yin: { tib: 'ཡིན་' }, bla: { tib: 'བླ་མ་' }, chos: { tib: 'ཆོས་' },
  shad: { tib: '།', service: true },
};
const sets = [{ id: 'l1', order: 1 }, { id: 'l2', order: 2 }];
const sentences = [
  { id: 's1', set: 'l1', words: ['nga', 'slob', 'yin', 'shad'] },
  { id: 's2', set: 'l1', words: ['nga', 'bla', 'yin', 'shad'] },
  { id: 's3', set: 'l2', words: ['bla', 'chos', 'yin', 'shad'] },
  { id: 's4', set: 'l2', words: ['bla', 'yin', 'shad'] },
];

function knownSince(progress, day, ...ids) {
  let p = progress;
  for (const id of ids) p = recordSolved(p, `x-${id}`, { newWordIds: [id] }, day);
  return p;
}

test('a sentence with due words is preferred and alternates with new material', () => {
  let p = createProgress(day1);
  p = knownSince(p, day1, 'nga', 'yin', 'bla'); // due on 05-11
  const tomorrow = addDays(D, 1);
  const r1 = pickNext(sentences, dict, sets, p, { today: tomorrow });
  assert.equal(r1.reason, 'due');
  assert.equal(r1.sentence.id, 's2', 'most due words (nga, bla, yin), then set order');
  assert.deepEqual(r1.dueWordIds, ['nga', 'bla', 'yin']);
  assert.deepEqual(r1.newWordIds, []);
  const r2 = pickNext(sentences, dict, sets, p, { today: tomorrow, lastReason: 'due', lastId: 's2' });
  assert.equal(r2.reason, 'one-new', 'not two reviews in a row while one-new sentences exist');
  assert.equal(r2.sentence.id, 's1');
});

test('no review when nothing is due', () => {
  let p = createProgress(day1);
  p = knownSince(p, day1, 'nga', 'yin', 'bla');
  const r = pickNext(sentences, dict, sets, p, { today: D });
  assert.equal(r.reason, 'one-new');
});

test('reviews repeat when no new material is left', () => {
  let p = createProgress(day1);
  p = knownSince(p, day1, 'nga', 'yin', 'bla', 'slob', 'chos');
  const tomorrow = addDays(D, 1);
  const r = pickNext(sentences, dict, sets, p, { today: tomorrow, lastReason: 'due', lastId: 's2' });
  assert.equal(r.reason, 'due');
  assert.notEqual(r.sentence.id, 's2');
});
