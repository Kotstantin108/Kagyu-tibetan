import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toWylie, syllableToWylie, endingType, wylieToId } from '../wylie.js';

test('common words transliterate as in the textbook', () => {
  assert.equal(toWylie('བླ་མའི་ཆོས།'), "bla ma'i chos/");
  assert.equal(toWylie('སློབ་མ་'), 'slob ma');
  assert.equal(toWylie('དགོན་པ་དམར་པོ་'), 'dgon pa dmar po');
  assert.equal(toWylie('སྤྲེའུ་'), "spre'u");
  assert.equal(syllableToWylie('བསྒྲུབས'), 'bsgrubs');
  assert.equal(syllableToWylie('གཡག'), 'g.yag');
  assert.equal(wylieToId("bla ma'i"), "bla-ma'i");
});

test('ending type drives particle fusion', () => {
  assert.equal(endingType('བླ་མ་'), 'open');
  assert.equal(endingType('ཆོས་'), 'closed');
  assert.equal(endingType('བཀའ་'), 'achung');
  assert.equal(endingType('སྤྲེའུ་'), 'open');
  assert.equal(endingType('འགྲོ་'), 'open');
});
