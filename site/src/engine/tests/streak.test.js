import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerSolve, effectiveStreak, remainingToday, previousDay, localDay } from '../streak.js';
import { STREAK_MIN_PER_DAY } from '../config.js';

function solveN(streak, day, n) {
  let s = streak;
  for (let i = 0; i < n; i++) s = registerSolve(s, day);
  return s;
}

test('a day counts only after the minimum number of solves', () => {
  let s = solveN(undefined, '2026-05-10', STREAK_MIN_PER_DAY - 1);
  assert.equal(s.current, 0);
  assert.equal(remainingToday(s, '2026-05-10'), 1);
  s = registerSolve(s, '2026-05-10');
  assert.equal(s.current, 1);
  assert.equal(s.best, 1);
  assert.equal(s.lastDay, '2026-05-10');
  assert.equal(remainingToday(s, '2026-05-10'), 0);
});

test('extra solves on the same day do not increase the streak', () => {
  const s = solveN(undefined, '2026-05-10', STREAK_MIN_PER_DAY * 3);
  assert.equal(s.current, 1);
});

test('consecutive days across midnight continue the streak', () => {
  let s = solveN(undefined, '2026-05-10', STREAK_MIN_PER_DAY);
  s = solveN(s, '2026-05-11', STREAK_MIN_PER_DAY);
  assert.equal(s.current, 2);
  assert.equal(effectiveStreak(s, '2026-05-11'), 2);
  assert.equal(effectiveStreak(s, '2026-05-12'), 2, 'still shown the day after');
});

test('a skipped day resets current but keeps best', () => {
  let s = solveN(undefined, '2026-05-10', STREAK_MIN_PER_DAY);
  s = solveN(s, '2026-05-11', STREAK_MIN_PER_DAY);
  assert.equal(effectiveStreak(s, '2026-05-13'), 0);
  s = solveN(s, '2026-05-13', STREAK_MIN_PER_DAY);
  assert.equal(s.current, 1);
  assert.equal(s.best, 2);
});

test('month and year boundaries', () => {
  assert.equal(previousDay('2026-03-01'), '2026-02-28');
  assert.equal(previousDay('2026-01-01'), '2025-12-31');
  let s = solveN(undefined, '2025-12-31', STREAK_MIN_PER_DAY);
  s = solveN(s, '2026-01-01', STREAK_MIN_PER_DAY);
  assert.equal(s.current, 2);
});

test('localDay uses the local calendar', () => {
  const d = new Date(2026, 0, 5, 23, 59);
  assert.equal(localDay(d), '2026-01-05');
});
