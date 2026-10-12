import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgress, setWordStatus, revealWord, wordError, recordSolved, wordStatus, normalizeProgress, STATUS } from '../progress.js';

const t0 = new Date('2026-03-01T12:00:00Z');

test('solving a sentence with exactly one new word makes it known', () => {
  let p = createProgress(t0);
  p = recordSolved(p, 's1', { newWordIds: ['nga'], seenIds: ['nga', 'yin'] }, t0);
  assert.equal(wordStatus(p, 'nga'), STATUS.KNOWN);
  assert.equal(p.sentences.s1.solved, 1);
  assert.equal(p.sentences.s1.lastSolved, t0.toISOString());
  assert.equal(p.words.yin.seen, 1);
});

test('a peeked new word does not become known', () => {
  let p = createProgress(t0);
  p = revealWord(p, 'nga', t0);
  p = recordSolved(p, 's1', { newWordIds: ['nga'], revealedIds: ['nga'] }, t0);
  assert.equal(wordStatus(p, 'nga'), STATUS.LEARNING);
});

test('two new words in a sentence: neither becomes known', () => {
  let p = createProgress(t0);
  p = recordSolved(p, 's1', { newWordIds: ['nga', 'yin'] }, t0);
  assert.equal(wordStatus(p, 'nga'), STATUS.NEW);
  assert.equal(wordStatus(p, 'yin'), STATUS.NEW);
});

test('cold start may promote up to two new words', () => {
  let p = createProgress(t0);
  p = recordSolved(p, 's1', { newWordIds: ['nga', 'yin'], promoteUpTo: 2 }, t0);
  assert.equal(wordStatus(p, 'nga'), STATUS.KNOWN);
  assert.equal(wordStatus(p, 'yin'), STATUS.KNOWN);
  p = recordSolved(p, 's2', { newWordIds: ['a', 'b', 'c'], promoteUpTo: 2 }, t0);
  assert.equal(wordStatus(p, 'a'), STATUS.NEW);
});

test('"I know" sets known directly; peeking a known word demotes it to learning', () => {
  let p = createProgress(t0);
  p = setWordStatus(p, 'bla', STATUS.KNOWN, t0);
  assert.equal(wordStatus(p, 'bla'), STATUS.KNOWN);
  p = revealWord(p, 'bla', t0);
  assert.equal(wordStatus(p, 'bla'), STATUS.LEARNING);
  assert.equal(p.words.bla.seen, 1);
});

test('a position error on a known word demotes it and counts the error', () => {
  let p = createProgress(t0);
  p = setWordStatus(p, 'bla', STATUS.KNOWN, t0);
  p = wordError(p, 'bla', t0);
  assert.equal(wordStatus(p, 'bla'), STATUS.LEARNING);
  assert.equal(p.words.bla.errors, 1);
});

test('transitions do not mutate the previous record', () => {
  const p0 = createProgress(t0);
  const p1 = setWordStatus(p0, 'x', STATUS.KNOWN, t0);
  assert.equal(Object.keys(p0.words).length, 0);
  assert.equal(Object.keys(p1.words).length, 1);
});

test('normalizeProgress tolerates garbage', () => {
  const p = normalizeProgress({ words: { a: { status: 'weird' }, b: null }, streak: { current: 'x' }, settings: { tileMode: 'nope' } }, t0);
  assert.equal(p.words.a.status, STATUS.NEW);
  assert.equal(p.words.b, undefined);
  assert.equal(p.streak.current, 0);
  assert.equal(p.settings.tileMode, 'words');
  assert.equal(normalizeProgress('junk', t0).schemaVersion, 1);
});
