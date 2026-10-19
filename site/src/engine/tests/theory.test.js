import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntroMarkdown, piecesOf, tokenizeParagraph, theoryOf, needsTheory, theoryKey, plainText } from '../theory.js';
import { createProgress } from '../progress.js';

const dict = {
  'bla-ma': { tib: 'བླ་མ་' },
  i: { tib: 'འི་', fused: true },
  chos: { tib: 'ཆོས་' },
  nga: { tib: 'ང་' },
  shad: { tib: '།', service: true },
};

test('parseIntroMarkdown: sections, paragraphs, comments', () => {
  const md = '# a comment\n\n## lesson-01\n\nFirst paragraph,\nwrapped.\n\nSecond.\n\n## lesson-02\nOnly one.\n';
  assert.deepEqual(parseIntroMarkdown(md), { 'lesson-01': ['First paragraph, wrapped.', 'Second.'], 'lesson-02': ['Only one.'] });
});

test('piecesOf: a fused particle joins its word, the shad drops the tsheg except after nga', () => {
  assert.deepEqual(piecesOf(['bla-ma', 'i', 'chos', 'shad'], dict), [
    { t: 'བླ་མའི་', ids: ['bla-ma', 'i'] },
    { t: 'ཆོས', ids: ['chos'] },
    { t: '།', ids: [] },
  ]);
  assert.deepEqual(piecesOf(['nga', 'shad'], dict), [{ t: 'ང་', ids: ['nga'] }, { t: '།', ids: [] }]);
});

test('tokenizeParagraph: Tibetan runs become tokens, unreadable runs keep no pieces', () => {
  const segment = (run) => (run === 'བླ་མའི་ཆོས།' ? ['bla-ma', 'i', 'chos', 'shad'] : null);
  const tokens = tokenizeParagraph('After ག write གི: བླ་མའི་ཆོས། "the guru’s Dharma".', segment, dict);
  assert.equal(tokens.length, 7);
  assert.equal(tokens[0], 'After ');
  assert.deepEqual(tokens[1], { tib: 'ག' });
  assert.deepEqual(tokens[5].pieces[0], { t: 'བླ་མའི་', ids: ['bla-ma', 'i'] });
  assert.equal(plainText(tokens), 'After ག write གི: བླ་མའི་ཆོས། "the guru’s Dharma".');
});

test('theoryOf falls back to English; needsTheory only before the first part of an unread module', () => {
  const intro = { 'lesson-01': { en: [['a']], ru: [['б']] } };
  assert.deepEqual(theoryOf(intro, 'lesson-01', 'ru'), [['б']]);
  assert.deepEqual(theoryOf(intro, 'lesson-01', 'pl'), [['a']]);
  assert.deepEqual(theoryOf(intro, 'lesson-02', 'ru'), []);
  const p = createProgress(new Date('2026-10-19T10:00:00Z'));
  const first = { id: 'lesson-01/1', module: 'lesson-01' };
  assert.equal(needsTheory(p, first, intro), true);
  assert.equal(needsTheory(p, { id: 'lesson-01/2', module: 'lesson-01' }, intro), false);
  assert.equal(needsTheory(p, { id: 'lesson-02/1', module: 'lesson-02' }, intro), false, 'no text, no page');
  assert.equal(needsTheory(p, { id: 'alphabet/1', module: 'alphabet', part: 1 }, intro), false);
  assert.equal(needsTheory({ ...p, course: { ...p.course, theory: ['lesson-01'] } }, first, intro), false, 'read already');
  assert.equal(needsTheory({ ...p, course: { ...p.course, units: { 'lesson-01/1': { step: 2, done: [] } } } }, first, intro), false, 'the part is under way');
});

test('an alphabet part has its own theory page, keyed by the part id', () => {
  const intro = { 'alphabet/3': { en: [['t']] } };
  const third = { id: 'alphabet/3', module: 'alphabet', part: 3 };
  assert.equal(theoryKey(third), 'alphabet/3');
  assert.equal(theoryKey({ id: 'lesson-02/3', module: 'lesson-02' }), 'lesson-02');
  assert.deepEqual(theoryOf(intro, 'alphabet/3', 'ru'), [['t']], 'English fallback');
  const p = createProgress(new Date('2026-10-19T10:00:00Z'));
  assert.equal(needsTheory(p, third, intro), true, 'any part, not only the first');
  assert.equal(needsTheory(p, { id: 'alphabet/4', module: 'alphabet', part: 4 }, intro), false, 'no text, no page');
  assert.equal(needsTheory({ ...p, course: { ...p.course, theory: ['alphabet/3'] } }, third, intro), false, 'read already');
  assert.equal(needsTheory({ ...p, course: { ...p.course, units: { 'alphabet/3': { step: 2, done: [] } } } }, third, intro), false, 'the cards were seen');
});
