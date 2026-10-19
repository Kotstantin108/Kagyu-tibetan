import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, PRAISE_CHANCE, BLINK_MIN_MS, BLINK_MAX_MS, shuffle, pools, createPicker, shouldSpeak, blinkDelay, doubleBlink, tapCategory } from '../tashi.js';
import { makeT } from '../../i18n/index.js';
import { LANGS } from '../config.js';

/** A deterministic generator: cycles through the given fractions. */
function seq(values) { let i = 0; return () => values[i++ % values.length]; }

test('shuffle keeps the elements and leaves the input alone', () => {
  const list = [1, 2, 3, 4, 5];
  const out = shuffle(list, seq([0.1, 0.7, 0.3, 0.9, 0.5]));
  assert.deepEqual([...out].sort(), list);
  assert.deepEqual(list, [1, 2, 3, 4, 5]);
});

test('every language has the agreed number of phrases in every category', () => {
  const sizes = { correct: 18, wrong: 14, stepDone: 6, checkPassed: 4, checkFailed: 4, hello: 4 };
  for (const lang of LANGS) {
    const p = pools(makeT(lang));
    for (const c of CATEGORIES) {
      assert.equal(p[c].length, sizes[c], `${lang}: ${c}`);
      assert.equal(new Set(p[c]).size, p[c].length, `${lang}: ${c} has a duplicate`);
    }
    assert.ok(makeT(lang)('tashi.intro').length > 5, `${lang}: intro`);
  }
});

test('the picker uses the whole pool before repeating and never says the same phrase twice in a row', () => {
  const pool = ['a', 'b', 'c', 'd'];
  const picker = createPicker({ wrong: pool }, Math.random);
  for (let round = 0; round < 50; round++) {
    const heard = [];
    for (let i = 0; i < pool.length; i++) heard.push(picker.next('wrong'));
    assert.deepEqual([...heard].sort(), pool, `round ${round} heard every phrase once`);
  }
  const picker2 = createPicker({ wrong: pool }, Math.random);
  let prev = null;
  for (let i = 0; i < 400; i++) {
    const cur = picker2.next('wrong');
    assert.notEqual(cur, prev, 'a phrase repeated across the refill');
    prev = cur;
  }
});

test('an empty or unknown pool gives null; a pool of one repeats it', () => {
  const picker = createPicker({ hello: ['hi'] });
  assert.equal(picker.next('nope'), null);
  assert.equal(picker.next('hello'), 'hi');
  assert.equal(picker.next('hello'), 'hi');
});

test('praise is rationed, everything else is always said', () => {
  assert.equal(shouldSpeak('correct', () => 0.1), true);
  assert.equal(shouldSpeak('correct', () => 0.9), false);
  assert.equal(shouldSpeak('correct', () => PRAISE_CHANCE), false);
  for (const c of CATEGORIES.filter((x) => x !== 'correct')) assert.equal(shouldSpeak(c, () => 0.99), true, c);
});

test('blink delay stays in its window and leans short; a tap gives a greeting or praise', () => {
  assert.equal(blinkDelay(() => 0), BLINK_MIN_MS);
  assert.ok(blinkDelay(() => 0.999) < BLINK_MAX_MS);
  assert.ok(blinkDelay(() => 0.5) < (BLINK_MIN_MS + BLINK_MAX_MS) / 2, 'the median pause is shorter than the middle of the window');
  assert.equal(doubleBlink(() => 0.1), true);
  assert.equal(doubleBlink(() => 0.9), false);
  assert.equal(tapCategory(() => 0.2), 'hello');
  assert.equal(tapCategory(() => 0.8), 'correct');
});
