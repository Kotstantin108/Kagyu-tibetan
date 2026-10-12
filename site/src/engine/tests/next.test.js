import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickNext, unknownWords } from '../next.js';
import { createProgress, setWordStatus, recordSolved, STATUS } from '../progress.js';

const dict = {
  nga: { tib: 'ང་' }, slob: { tib: 'སློབ་མ་' }, yin: { tib: 'ཡིན་' }, bla: { tib: 'བླ་མ་' }, chos: { tib: 'ཆོས་' },
  shad: { tib: '།', service: true },
};
const sets = [
  { id: 'l1', order: 1 }, { id: 'l2', order: 2 },
];
const sentences = [
  { id: 's1', set: 'l1', words: ['nga', 'slob', 'yin', 'shad'] },
  { id: 's2', set: 'l1', words: ['nga', 'bla', 'yin', 'shad'] },
  { id: 's3', set: 'l2', words: ['bla', 'chos', 'yin', 'shad'] },
  { id: 's4', set: 'l2', words: ['bla', 'yin', 'shad'] },
];

function known(progress, ...ids) {
  let p = progress;
  for (const id of ids) p = setWordStatus(p, id, STATUS.KNOWN, new Date('2026-01-01T00:00:00Z'));
  return p;
}

test('cold start: first set, translations revealed', () => {
  const p = createProgress();
  const r = pickNext(sentences, dict, sets, p);
  assert.equal(r.reason, 'cold');
  assert.equal(r.reveal, true);
  assert.equal(r.sentence.id, 's1');
});

test('cold start skips the sentence just solved', () => {
  let p = createProgress();
  p = recordSolved(p, 's1');
  const r = pickNext(sentences, dict, sets, p, { lastId: 's1' });
  assert.equal(r.sentence.id, 's2');
});

test('exactly one unknown word is preferred, by set order', () => {
  const p = known(createProgress(), 'nga', 'yin', 'bla');
  // s1 has 1 unknown (slob), s2 has 0, s3 has 1 (chos), s4 has 0
  const r = pickNext(sentences, dict, sets, p);
  assert.equal(r.reason, 'one-new');
  assert.equal(r.sentence.id, 's1');
  assert.deepEqual(r.newWordIds, ['slob']);
  assert.equal(r.reveal, false);
});

test('among one-new candidates the least recently solved comes first', () => {
  let p = known(createProgress(), 'nga', 'yin', 'bla');
  p = recordSolved(p, 's1', {}, new Date('2026-02-01T10:00:00Z'));
  p = recordSolved(p, 's3', {}, new Date('2026-01-01T10:00:00Z'));
  // both s1 (l1) and s3 (l2) have one unknown; set order still wins over recency
  assert.equal(pickNext(sentences, dict, sets, p).sentence.id, 's1');
  // same set: recency decides
  const sameSet = sentences.map((s) => ({ ...s, set: 'l1' }));
  assert.equal(pickNext(sameSet, dict, sets, p).sentence.id, 's3');
});

test('fallback: fewest unknown words when no one-new sentence exists', () => {
  const p = known(createProgress(), 'nga', 'yin', 'slob');
  // s1: 0 unknown, s2: 1 (bla)... make s2 impossible: mark nothing else
  const only = [sentences[2], { id: 's5', set: 'l2', words: ['bla', 'chos', 'slob', 'shad'] }];
  // s3: bla, chos unknown (2); s5: bla, chos unknown (2) -> min is 2, first by order
  const r = pickNext(only, dict, sets, p);
  assert.equal(r.reason, 'fewest-new');
  assert.equal(r.sentence.id, 's3');
  assert.deepEqual(r.newWordIds, ['bla', 'chos']);
});

test('the sentence just solved is not repeated when alternatives exist', () => {
  const p = known(createProgress(), 'nga', 'yin', 'bla', 'slob', 'chos');
  const r1 = pickNext(sentences, dict, sets, p, { lastId: 's1' });
  assert.notEqual(r1.sentence.id, 's1');
  const r2 = pickNext([sentences[0]], dict, sets, p, { lastId: 's1' });
  assert.equal(r2.sentence.id, 's1');
});

test('unknownWords ignores service tokens and duplicates', () => {
  const p = createProgress();
  const s = { id: 'x', set: 'l1', words: ['nga', 'nga', 'shad'] };
  assert.deepEqual(unknownWords(s, dict, p), ['nga']);
});
