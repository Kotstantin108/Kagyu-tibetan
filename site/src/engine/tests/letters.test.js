import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageItems, STAGE_IDS, optionsFor, makeRound, editDistance, courseSyllables, stagePassed, ROUND_SIZE, PASS_SCORE } from '../letters.js';

test('every stage has at least a round of cards with distinct Wylie and the textbook spellings', () => {
  const dict = { a: { tib: 'དགོན་པ་', set: 'l1' }, b: { tib: 'བླ་མ་', set: 'l1' }, c: { tib: 'གཡག་', set: 'l2' }, d: { tib: '།', service: true }, e: { tib: '༡་', set: 'l1' } };
  for (const id of STAGE_IDS) {
    const items = stageItems(id, dict, [{ id: 'l1', order: 1 }, { id: 'l2', order: 2 }]);
    assert.ok(items.length >= 4, `${id} has ${items.length} items`);
    assert.ok(items.every((x) => x.tib && x.wylie), `${id}: every item has tib and wylie`);
    if (id !== 'vowels') assert.equal(new Set(items.map((x) => x.wylie)).size, items.length, `${id}: distinct spellings`);
  }
  const by = (id) => Object.fromEntries(stageItems(id).map((x) => [x.tib, x.wylie]));
  assert.equal(by('rows1')['ཀ'], 'ka');
  assert.equal(by('rows2')['འ'], "'a");
  assert.equal(by('rows2')['ཨ'], 'a');
  assert.equal(by('vowels')['ཀི'], 'ki');
  assert.equal(by('subjoined')['བླ'], 'bla');
  assert.equal(by('superscribed')['ལྷ'], 'lha');
  assert.equal(by('affixes')['བསྒྲུབས'], 'bsgrubs');
  assert.equal(by('affixes')['གཡག'], 'g.yag');
  assert.deepEqual(courseSyllables(dict, [{ id: 'l1', order: 1 }, { id: 'l2', order: 2 }]).map((x) => x.wylie), ['dgon', 'pa', 'bla', 'ma', 'g.yag'], 'course syllables: unique, in set order, no digits or shad');
});

test('options hold the right answer and close distractors; a round has distinct cards', () => {
  const items = stageItems('rows1');
  const ka = items[0];
  const opts = optionsFor(ka, items, 4, () => 0.5);
  assert.equal(opts.length, 4);
  assert.equal(opts.filter((o) => o.right).length, 1);
  assert.equal(opts.find((o) => o.right).wylie, 'ka');
  assert.ok(opts.every((o) => o.right || editDistance('ka', o.wylie) <= 2), 'distractors differ by at most two letters');
  assert.equal(new Set(opts.map((o) => o.wylie)).size, 4);
  const round = makeRound(items);
  assert.equal(round.length, ROUND_SIZE);
  assert.equal(new Set(round.map((c) => c.tib)).size, ROUND_SIZE);
  assert.ok(round.every((c) => c.options.length === 4));
  assert.equal(makeRound(stageItems('rows1').slice(0, 3)).length, 3, 'a small pool gives a short round');
  assert.equal(editDistance('kha', 'ka'), 1);
  assert.equal(editDistance('', 'abc'), 3);
});

test('a stage is passed from PASS_SCORE correct cards', () => {
  assert.equal(stagePassed({ reading: {} }, 'rows1'), false);
  assert.equal(stagePassed({ reading: { rows1: { best: PASS_SCORE - 1 } } }, 'rows1'), false);
  assert.equal(stagePassed({ reading: { rows1: { best: PASS_SCORE } } }, 'rows1'), true);
});
