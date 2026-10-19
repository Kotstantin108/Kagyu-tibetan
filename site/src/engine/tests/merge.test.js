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
  local.settings = { ...local.settings, lang: 'ru', theme: 'dark', onboarded: true };
  const m = mergeProgress(local, null);
  assert.equal(m.words.a.status, 'known');
  assert.deepEqual(m.settings, local.settings, 'an empty remote must not reset the settings');
  assert.equal(m.updatedAt, local.updatedAt);
  assert.deepEqual(mergeProgress(null, local).settings, local.settings);
});

test('reading stages merge by maximum', () => {
  const local = createProgress(new Date(early));
  local.reading = { 'alphabet/1': { rounds: 3, best: 10, updatedAt: early }, 'alphabet/9': { rounds: 1, best: 5, updatedAt: early } };
  const remote = createProgress(new Date(early));
  remote.reading = { 'alphabet/1': { rounds: 1, best: 12, updatedAt: late } };
  const m = mergeProgress(local, remote);
  assert.deepEqual(m.reading['alphabet/1'], { rounds: 3, best: 12, updatedAt: late });
  assert.deepEqual(m.reading['alphabet/9'], { rounds: 1, best: 5, updatedAt: early });
});

test('course units merge: the larger step wins, equal steps unite the solved lists', () => {
  const local = createProgress(new Date(early));
  const remote = createProgress(new Date(late));
  local.course = { started: true, canRead: null, current: 'lesson-01/2', units: {
    'lesson-01/1': { step: 6, done: [], best: 8, attempts: 1, passedAt: early, updatedAt: early },
    'lesson-01/2': { step: 3, done: ['s011'], best: 0, attempts: 0, passedAt: null, updatedAt: early },
    'lesson-01/3': { step: 2, done: ['s020'], best: 0, attempts: 0, passedAt: null, updatedAt: early },
  } };
  remote.course = { started: false, canRead: true, current: 'lesson-01/3', units: {
    'lesson-01/1': { step: 5, done: ['s001'], best: 9, attempts: 3, passedAt: null, updatedAt: late },
    'lesson-01/2': { step: 3, done: ['s012'], best: 0, attempts: 0, passedAt: null, updatedAt: late },
  } };
  const m = mergeProgress(local, remote);
  assert.equal(m.course.units['lesson-01/1'].step, 6, 'the passed unit stays passed');
  assert.equal(m.course.units['lesson-01/1'].best, 9);
  assert.equal(m.course.units['lesson-01/1'].attempts, 3);
  assert.deepEqual(m.course.units['lesson-01/2'].done.sort(), ['s011', 's012']);
  assert.equal(m.course.units['lesson-01/2'].updatedAt, late);
  assert.deepEqual(m.course.units['lesson-01/3'].done, ['s020']);
  assert.equal(m.course.started, true);
  assert.equal(m.course.canRead, true);
  assert.equal(m.course.current, 'lesson-01/3', 'current from the later record');
});
