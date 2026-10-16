// Backwards compatibility of the progress record: every fixture in ./fixtures
// is a record written by a released version of the site, and the current code
// must keep all of it (see fixtures/README.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createProgress, normalizeProgress, recordSolved, recordReadingRound, setSetting, setWordStatus, wordStatus, dueWords, STATUS } from '../progress.js';
import { mergeProgress } from '../merge.js';

const DIR = join(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'fixtures');
const FILES = readdirSync(DIR).filter((f) => /^progress-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const fixtures = FILES.map((f) => ({ name: f, raw: JSON.parse(readFileSync(join(DIR, f), 'utf8')) }));
const now = new Date('2026-10-16T08:00:00Z');

/** Every value present in `part` is present and equal in `whole` (objects recursively). */
function assertContains(whole, part, path = '') {
  for (const [key, value] of Object.entries(part)) {
    const at = path ? `${path}.${key}` : key;
    if (value && typeof value === 'object') {
      assert.ok(whole[key] && typeof whole[key] === 'object', `${at} is missing`);
      assertContains(whole[key], value, at);
    } else {
      assert.deepEqual(whole[key], value, `${at} changed`);
    }
  }
}

test('there is a fixture for every released shape of the record', () => {
  assert.ok(fixtures.length >= 3, 'fixtures are missing');
});

for (const { name, raw } of fixtures) {
  test(`${name}: loading keeps every word, sentence, streak, reading and setting`, () => {
    const p = normalizeProgress(JSON.parse(JSON.stringify(raw)), now);
    assertContains(p, raw);
    // the fields the old version did not have get their defaults, not garbage
    for (const key of Object.keys(createProgress(now))) assert.ok(key in p, `${key} missing after load`);
    for (const w of Object.values(p.words)) {
      assert.ok(Number.isInteger(w.level) && w.level >= 0);
      assert.ok(w.due === null || /^\d{4}-\d{2}-\d{2}$/.test(w.due));
    }
  });

  test(`${name}: the loaded record works with the engine`, () => {
    let p = normalizeProgress(raw, now);
    const known = Object.keys(raw.words).filter((id) => raw.words[id].status === 'known');
    for (const id of known) assert.equal(wordStatus(p, id), STATUS.KNOWN, `${id} is still known`);
    assert.doesNotThrow(() => dueWords(p, '2026-10-16'));
    p = recordSolved(p, 's004', { newWordIds: ['nyi-ma'], seenIds: ['nyi-ma', 'tsha-po'] }, now);
    p = recordReadingRound(p, 'vowels', 11, now);
    p = setWordStatus(p, 'khang-pa', STATUS.KNOWN, now);
    p = setSetting(p, 'theme', 'dark', now);
    assertContains(p, { ...raw, updatedAt: now.toISOString(), settings: { ...raw.settings, theme: 'dark' } });
    assert.equal(wordStatus(p, 'nyi-ma'), STATUS.KNOWN);
    assert.equal(p.reading.vowels.best, 11);
  });

  test(`${name}: a sync merge with an empty remote record changes nothing`, () => {
    const merged = mergeProgress(raw, null, now);
    assertContains(merged, raw);
    const twice = mergeProgress(raw, raw, now);
    assertContains(twice, raw);
  });

  test(`${name}: an export file of it loads back unchanged`, () => {
    const p = normalizeProgress(raw, now);
    const file = JSON.stringify(p, null, 2);
    assert.deepEqual(normalizeProgress(JSON.parse(file), now), p);
  });
}

test('the newest fixture covers every field of the current record', () => {
  const newest = fixtures[fixtures.length - 1].raw;
  const base = createProgress(now);
  assert.deepEqual(Object.keys(newest).sort(), Object.keys(base).sort(), 'add a fixture for the new top-level field');
  assert.deepEqual(Object.keys(newest.settings).sort(), Object.keys(base.settings).sort(), 'add a fixture for the new setting');
  const word = Object.values(newest.words)[0];
  const entry = normalizeProgress(null, now);
  const sample = setWordStatus(entry, 'x', STATUS.KNOWN, now).words.x;
  assert.deepEqual(Object.keys(word).sort(), Object.keys(sample).sort(), 'add a fixture for the new word field');
});

test('a record built by the current engine survives a save and a load', () => {
  let p = createProgress(now);
  p = recordSolved(p, 's001', { newWordIds: ['dgon-pa'], seenIds: ['dgon-pa', 'dmar-po'] }, now);
  p = setWordStatus(p, 'dmar-po', STATUS.KNOWN, now);
  p = recordReadingRound(p, 'rows1', 12, now);
  p = setSetting(p, 'lang', 'ru', now);
  p = setSetting(p, 'onboarded', true, now);
  const stored = JSON.parse(JSON.stringify(p));
  assert.deepEqual(normalizeProgress(stored, now), p, 'normalizeProgress drops a field the engine writes');
});
