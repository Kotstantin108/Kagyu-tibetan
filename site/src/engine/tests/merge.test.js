import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeProgress } from '../merge.js';
import { createProgress } from '../progress.js';

const early = '2026-01-01T00:00:00.000Z';
const late = '2026-01-02T00:00:00.000Z';

test('per word and per sentence the later record wins', () => {
  const local = createProgress(new Date(early));
  local.words.a = { status: 'known', updatedAt: late, seen: 2, errors: 0 };
  local.words.b = { status: 'learning', updatedAt: early, seen: 1, errors: 1 };
  local.sentences.s1 = { solved: 3, lastSolved: early };
  const remote = createProgress(new Date(early));
  remote.words.a = { status: 'learning', updatedAt: early, seen: 5, errors: 0 };
  remote.words.b = { status: 'known', updatedAt: late, seen: 0, errors: 0 };
  remote.words.c = { status: 'known', updatedAt: early, seen: 0, errors: 0 };
  remote.sentences.s1 = { solved: 1, lastSolved: late };
  const m = mergeProgress(local, remote);
  assert.equal(m.words.a.status, 'known');
  assert.equal(m.words.a.seen, 5, 'counters take the max');
  assert.equal(m.words.b.status, 'known');
  assert.equal(m.words.c.status, 'known');
  assert.equal(m.sentences.s1.lastSolved, late);
  assert.equal(m.sentences.s1.solved, 3);
});

test('streak: best is the max, current and lastDay from the later lastDay', () => {
  const local = createProgress();
  local.streak = { current: 2, best: 9, lastDay: '2026-05-10', todayDate: '2026-05-10', todayCount: 3 };
  const remote = createProgress();
  remote.streak = { current: 4, best: 4, lastDay: '2026-05-12', todayDate: '2026-05-12', todayCount: 3 };
  const m = mergeProgress(local, remote);
  assert.equal(m.streak.best, 9);
  assert.equal(m.streak.current, 4);
  assert.equal(m.streak.lastDay, '2026-05-12');
});

test('settings follow the record with the later updatedAt', () => {
  const local = createProgress(new Date(late));
  local.settings = { tileMode: 'syllables', lang: 'ru' };
  const remote = createProgress(new Date(early));
  remote.settings = { tileMode: 'words', lang: 'en' };
  assert.equal(mergeProgress(local, remote).settings.lang, 'ru');
  assert.equal(mergeProgress(remote, local).settings.tileMode, 'syllables');
});

test('merging with an empty remote keeps local', () => {
  const local = createProgress();
  local.words.a = { status: 'known', updatedAt: late, seen: 1, errors: 0 };
  const m = mergeProgress(local, null);
  assert.equal(m.words.a.status, 'known');
});
