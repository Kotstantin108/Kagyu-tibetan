import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, shuffle } from '../check.js';
import { tileTexts, renderTib, fuseParticle } from '../tib.js';

test('identical tiles are interchangeable (texts, not ids)', () => {
  const expected = ['ས་', 'དང་པོ་', 'ས་', 'གཉིས་པ་'];
  // the learner used the "second" ས་ tile first: same texts, must pass
  assert.equal(checkAnswer(expected, ['ས་', 'དང་པོ་', 'ས་', 'གཉིས་པ་']).correct, true);
});

test('wrong positions are reported', () => {
  const r = checkAnswer(['ང་', 'སློབ་མ་', 'ཡིན་'], ['སློབ་མ་', 'ང་', 'ཡིན་']);
  assert.equal(r.correct, false);
  assert.deepEqual(r.wrong, [0, 1]);
});

test('missing tiles count as wrong', () => {
  const r = checkAnswer(['ང་', 'ཡིན་'], ['ང་']);
  assert.equal(r.correct, false);
  assert.deepEqual(r.wrong, [1]);
});

test('shuffle never returns the original order for distinct items', () => {
  const items = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i++) {
    const s = shuffle(items);
    assert.equal(s.length, 3);
    assert.notDeepEqual(s, items);
  }
  // all-equal input is allowed to stay the same
  assert.deepEqual(shuffle(['x', 'x']), ['x', 'x']);
});

test('renderTib glues fused particles and places the shad', () => {
  const dict = {
    'bla-ma': { tib: 'བླ་མ་' }, "'i": { tib: 'འི་', fused: true }, dgon: { tib: 'དགོན་པ་' },
    'mthong': { tib: 'མཐོང་' }, ngo: { tib: 'ངོ་' }, yin: { tib: 'ཡིན་' }, dga: { tib: 'དགའ་' }, "'o": { tib: 'འོ་', fused: true },
    shad: { tib: '།', service: true },
  };
  assert.equal(renderTib(['bla-ma', "'i", 'dgon'], dict), 'བླ་མའི་དགོན་པ་');
  assert.equal(renderTib(['yin', 'shad'], dict), 'ཡིན།');
  assert.equal(renderTib(['mthong', 'ngo', 'shad'], dict), 'མཐོང་ངོ་།');
  assert.equal(renderTib(['dga', "'o", 'shad'], dict), 'དགའོ།');
  assert.equal(fuseParticle('ནམ་མཁའ་', 'ར་'), 'ནམ་མཁར་');
});

test('tile texts: words vs syllables, no service tokens', () => {
  const dict = { 'bla-ma': { tib: 'བླ་མ་' }, "'i": { tib: 'འི་', fused: true }, shad: { tib: '།', service: true } };
  assert.deepEqual(tileTexts(['bla-ma', "'i", 'shad'], dict, 'words'), ['བླ་མ་', 'འི་']);
  assert.deepEqual(tileTexts(['bla-ma', "'i", 'shad'], dict, 'syllables'), ['བླ་', 'མ་', 'འི་']);
});
