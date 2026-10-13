import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hardWords } from '../hard.js';
import { createProgress, wordError, revealWord } from '../progress.js';

const dict = { a: { tib: 'ཀ་' }, b: { tib: 'ཁ་' }, c: { tib: 'ག་' }, shad: { tib: '།', service: true } };

test('words with repeated mistakes come first', () => {
  let p = createProgress();
  const t1 = new Date('2026-01-01T00:00:00Z');
  const t2 = new Date('2026-01-02T00:00:00Z');
  p = wordError(p, 'a', t1);
  p = wordError(p, 'a', t1);
  p = wordError(p, 'b', t2);
  p = wordError(p, 'b', t2);
  p = wordError(p, 'b', t2);
  p = wordError(p, 'c', t1);
  p = wordError(p, 'shad', t1);
  p = wordError(p, 'shad', t1);
  assert.deepEqual(hardWords(p, dict), ['b', 'a']);
  assert.deepEqual(hardWords(p, dict, { limit: 1 }), ['b']);
});

test('a word peeked often after a mistake is hard too', () => {
  let p = createProgress();
  p = wordError(p, 'c');
  p = revealWord(p, 'c');
  p = revealWord(p, 'c');
  p = revealWord(p, 'c');
  assert.deepEqual(hardWords(p, dict), ['c']);
});
