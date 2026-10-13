import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relatedNotes, noteForWord } from '../grammar.js';

const dict = {
  nga: { tib: 'ང་' }, slob: { tib: 'སློབ་མ་' }, yin: { tib: 'ཡིན་' }, bla: { tib: 'བླ་མ་' }, chos: { tib: 'ཆོས་' },
  gi: { tib: 'གི་', pos: 'particle' }, la: { tib: 'ལ་', pos: 'particle' }, dgon: { tib: 'དགོན་པ་' },
  shad: { tib: '།', service: true },
};
const sets = [{ id: 'l1', order: 1 }, { id: 'l2', order: 2 }];
const N = {
  copula: { en: 'yin is the copula.' },
  genitive: { en: 'gi marks the genitive.' },
  la: { en: 'la marks the place.' },
  adj: { en: 'Adjectives follow the noun.' },
};
const sentences = [
  { id: 's1', set: 'l1', words: ['nga', 'slob', 'yin', 'shad'], note: N.copula },
  { id: 's2', set: 'l1', words: ['bla', 'gi', 'chos', 'yin', 'shad'], note: N.genitive },
  { id: 's3', set: 'l1', words: ['slob', 'gi', 'bla', 'shad'], note: N.genitive },
  { id: 's4', set: 'l1', words: ['dgon', 'la', 'bla', 'yin', 'shad'], note: N.la },
  { id: 's5', set: 'l1', words: ['bla', 'chos', 'shad'] },
  { id: 's6', set: 'l2', words: ['nga', 'slob', 'yin', 'shad'], note: N.adj },
];

test('own note comes first with the sentence itself as example', () => {
  const r = relatedNotes(sentences[0], sentences, sets, dict, 3);
  assert.equal(r[0].own, true);
  assert.equal(r[0].note, N.copula);
  assert.equal(r[0].example.id, 's1');
});

test('related notes share words, one example each, best match first, limited', () => {
  const r = relatedNotes(sentences[0], sentences, sets, dict, 3);
  const others = r.filter((e) => !e.own);
  assert.deepEqual(others.map((e) => e.note), [N.genitive, N.la]);
  // s3 shares the rarer word slob with s1, so it is the example of the genitive note, not s2
  assert.equal(others[0].example.id, 's3');
  assert.ok(others.every((e) => e.shared.length > 0));
  assert.equal(relatedNotes(sentences[0], sentences, sets, dict, 1).filter((e) => !e.own).length, 1);
});

test('only notes of the same set; a sentence without a note has no own entry', () => {
  const r = relatedNotes(sentences[4], sentences, sets, dict, 3);
  assert.ok(r.every((e) => !e.own));
  assert.ok(r.every((e) => e.example.set === 'l1'));
  assert.deepEqual(relatedNotes(sentences[5], sentences, sets, dict, 3).map((e) => e.own), [true]);
});

test('noteForWord: a particle picks the note whose examples use it, even over the own note', () => {
  // s7 is about the copula, but the misplaced word is the genitive particle
  const s7 = { id: 's7', set: 'l1', words: ['nga', 'gi', 'chos', 'yin', 'shad'], note: N.copula };
  const all = [...sentences, s7];
  assert.equal(noteForWord(s7, 'gi', all, sets, dict).note, N.genitive);
  // without an own note: the best related note that uses the particle
  const s8 = { id: 's8', set: 'l1', words: ['dgon', 'la', 'chos', 'shad'] };
  assert.equal(noteForWord(s8, 'la', [...all, s8], sets, dict).note, N.la);
});

test('noteForWord: a non-particle falls back to the own note, null without one', () => {
  assert.equal(noteForWord(sentences[0], 'slob', sentences, sets, dict).note, N.copula);
  assert.equal(noteForWord(sentences[4], 'bla', sentences, sets, dict), null);
});

test('noteForWord: a particle in a sentence with its own note prefers the note about the particle', () => {
  // s4 (own note "la") contains bla and yin; misplacing la should still show the la note
  assert.equal(noteForWord(sentences[3], 'la', sentences, sets, dict).note, N.la);
  // s2's own note is the genitive; misplacing gi keeps it
  assert.equal(noteForWord(sentences[1], 'gi', sentences, sets, dict).note, N.genitive);
});
