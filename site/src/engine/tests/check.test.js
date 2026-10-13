import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, shuffle, checkWylie, normalizeWylie, pickOptions } from '../check.js';

test('identical tiles are interchangeable: comparison is by text', () => {
  const r = checkAnswer(['ང་', 'ཡིན་', 'ང་'], ['ང་', 'ཡིན་', 'ང་']);
  assert.equal(r.correct, true);
});

test('wrong positions are reported', () => {
  const r = checkAnswer(['a', 'b', 'c'], ['a', 'c', 'b']);
  assert.equal(r.correct, false);
  assert.deepEqual(r.wrong, [1, 2]);
});

test('missing tiles count as wrong', () => {
  assert.deepEqual(checkAnswer(['a', 'b'], ['a']).wrong, [1]);
});

test('shuffle never returns the original order for distinct items', () => {
  const items = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < 50; i++) {
    const s = shuffle(items);
    assert.equal(s.length, 4);
    assert.notDeepEqual(s, items);
    assert.deepEqual([...s].sort(), items);
  }
  assert.deepEqual(shuffle(['x', 'x']), ['x', 'x']);
  assert.deepEqual(shuffle(['x']), ['x']);
});

test('Wylie answers tolerate spacing, shad and apostrophe variants', () => {
  assert.equal(normalizeWylie("  bla  ma’i chos/ "), "bla ma'i chos");
  assert.equal(checkWylie(['nga', 'slob', 'ma', 'yin'], 'Nga slob ma yin /').correct, true);
  const r = checkWylie(['nga', 'slob', 'ma', 'yin'], 'nga slob pa yin');
  assert.equal(r.correct, false);
  assert.deepEqual(r.wrong, [2]);
  assert.deepEqual(checkWylie(['nga', 'yin'], 'nga').wrong, [1]);
});

test('multiple-choice options include the right answer and distinct distractors', () => {
  const sentences = [
    { id: 'a', set: 'l1', tr: { en: 'red monastery' } },
    { id: 'b', set: 'l1', tr: { en: 'good lama' } },
    { id: 'c', set: 'l1', tr: { en: 'good lama' } },
    { id: 'd', set: 'l2', tr: { en: 'the king went to the monastery' } },
    { id: 'e', set: 'l2', tr: { en: 'I am a student' } },
  ];
  const opts = pickOptions(sentences[0], sentences, 'en', 4, () => 0.5);
  assert.equal(opts.length, 4);
  assert.ok(opts.some((o) => o.id === 'a'));
  assert.equal(new Set(opts.map((o) => o.text)).size, 4, 'no duplicate texts');
  assert.equal(pickOptions(sentences[0], sentences.slice(0, 2), 'en').length, 2, 'fewer when the pool is small');
});
