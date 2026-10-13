// Daily streak. A day counts when at least STREAK_MIN_PER_DAY sentences were
// solved; dates are the device's local calendar days.

import { STREAK_MIN_PER_DAY } from './config.js';

/** YYYY-MM-DD in the local time zone. */
export function localDay(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** A YYYY-MM-DD string shifted by n days (local calendar). */
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return localDay(dt);
}

/** The day before a YYYY-MM-DD string (local calendar). */
export function previousDay(day) {
  return addDays(day, -1);
}

/** Streak shown to the user: 0 if the last counted day is neither today nor yesterday. */
export function effectiveStreak(streak, today = localDay()) {
  if (!streak || !streak.lastDay) return 0;
  if (streak.lastDay === today || streak.lastDay === previousDay(today)) return streak.current;
  return 0;
}

/**
 * Register one solved sentence. Returns a new streak object.
 * - todayCount tracks solves for the current local day;
 * - once it reaches the threshold the day is counted: current grows if
 *   yesterday was counted, otherwise restarts at 1; best is the maximum.
 */
export function registerSolve(streak, today = localDay()) {
  const s = { ...(streak || { current: 0, best: 0, lastDay: null, todayDate: null, todayCount: 0 }) };
  if (s.todayDate !== today) { s.todayDate = today; s.todayCount = 0; }
  s.todayCount += 1;
  if (s.todayCount === STREAK_MIN_PER_DAY && s.lastDay !== today) {
    s.current = s.lastDay === previousDay(today) ? s.current + 1 : 1;
    s.lastDay = today;
    s.best = Math.max(s.best, s.current);
  }
  return s;
}

/** Solves still needed today for the day to count (0 if already counted). */
export function remainingToday(streak, today = localDay()) {
  if (!streak || streak.todayDate !== today) return STREAK_MIN_PER_DAY;
  return Math.max(0, STREAK_MIN_PER_DAY - streak.todayCount);
}
