// Tunable constants of the learning engine.

/** Sentences solved per day for the day to count towards the streak. */
export const STREAK_MIN_PER_DAY = 3;

/** Below this many known words the app is in "cold start" mode. */
export const COLD_START_KNOWN = 3;

/** localStorage key of the progress record. */
export const PROGRESS_KEY = 'tib-progress';

export const SCHEMA_VERSION = 1;

export const LANGS = ['ru', 'en', 'de', 'fr', 'pl'];
export const DEFAULT_LANG = 'en';
