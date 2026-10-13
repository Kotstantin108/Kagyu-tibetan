// Tunable constants of the learning engine.

/** Sentences solved per day for the day to count towards the streak. */
export const STREAK_MIN_PER_DAY = 3;

/** Below this many known words the app is in "cold start" mode. */
export const COLD_START_KNOWN = 3;

/**
 * Spaced repetition: days until the next review for each review level.
 * A word becomes known at level 0 (review tomorrow); each successful review
 * when due raises the level; a mistake or a peek sends it back to learning.
 */
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60, 120];

/** Review level given to words the learner marks as known by hand. */
export const MANUAL_KNOWN_LEVEL = 2;

/** localStorage key of the progress record. */
export const PROGRESS_KEY = 'tib-progress';

export const SCHEMA_VERSION = 1;

export const LANGS = ['ru', 'en', 'de', 'fr', 'pl'];
export const DEFAULT_LANG = 'en';
