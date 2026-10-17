// Progress model and pure transitions. No DOM, no storage here.
//
// {
//   schemaVersion: 1,
//   updatedAt: ISO string,
//   words: { id: { status: 'new'|'learning'|'known', updatedAt, seen, errors, level, due } },
//     level: review level (index into REVIEW_INTERVALS), due: 'YYYY-MM-DD' of the next review
//   sentences: { id: { solved, lastSolved } },
//   streak: { current, best, lastDay, todayDate, todayCount },
//   reading: { stageId: { rounds, best, updatedAt } },  the reading course (letters.js)
//   settings: { tileMode: 'words'|'syllables', exercise: 'tiles'|'meaning'|'recall'|'wylie', lang, showWylie, voice, theme, onboarded }
// }

import { SCHEMA_VERSION, REVIEW_INTERVALS, MANUAL_KNOWN_LEVEL } from './config.js';
import { localDay, addDays } from './streak.js';

export const STATUS = { NEW: 'new', LEARNING: 'learning', KNOWN: 'known' };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function createProgress(now = new Date()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now.toISOString(),
    words: {},
    sentences: {},
    streak: { current: 0, best: 0, lastDay: null, todayDate: null, todayCount: 0 },
    reading: {},
    settings: { tileMode: 'words', exercise: 'tiles', lang: null, showWylie: false, voice: false, theme: 'auto', onboarded: false },
  };
}

/** Returns a sanitized copy of a progress-like object (e.g. parsed from storage or a file). */
export function normalizeProgress(raw, now = new Date()) {
  const base = createProgress(now);
  if (!raw || typeof raw !== 'object') return base;
  const p = { ...base, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt };
  if (raw.words && typeof raw.words === 'object') {
    for (const [id, w] of Object.entries(raw.words)) {
      if (!w || typeof w !== 'object') continue;
      const status = Object.values(STATUS).includes(w.status) ? w.status : STATUS.NEW;
      p.words[id] = {
        status,
        updatedAt: typeof w.updatedAt === 'string' ? w.updatedAt : base.updatedAt,
        seen: Number.isFinite(w.seen) ? w.seen : 0,
        errors: Number.isFinite(w.errors) ? w.errors : 0,
        level: Number.isInteger(w.level) && w.level >= 0 ? w.level : 0,
        due: typeof w.due === 'string' && DAY_RE.test(w.due) ? w.due : null,
      };
    }
  }
  if (raw.sentences && typeof raw.sentences === 'object') {
    for (const [id, s] of Object.entries(raw.sentences)) {
      if (!s || typeof s !== 'object') continue;
      p.sentences[id] = {
        solved: Number.isFinite(s.solved) ? s.solved : 0,
        lastSolved: typeof s.lastSolved === 'string' ? s.lastSolved : null,
      };
    }
  }
  if (raw.streak && typeof raw.streak === 'object') {
    const s = raw.streak;
    p.streak = {
      current: Number.isFinite(s.current) ? s.current : 0,
      best: Number.isFinite(s.best) ? s.best : 0,
      lastDay: typeof s.lastDay === 'string' ? s.lastDay : null,
      todayDate: typeof s.todayDate === 'string' ? s.todayDate : null,
      todayCount: Number.isFinite(s.todayCount) ? s.todayCount : 0,
    };
  }
  if (raw.reading && typeof raw.reading === 'object') {
    for (const [id, r] of Object.entries(raw.reading)) {
      if (!r || typeof r !== 'object') continue;
      p.reading[id] = {
        rounds: Number.isInteger(r.rounds) && r.rounds >= 0 ? r.rounds : 0,
        best: Number.isInteger(r.best) && r.best >= 0 ? r.best : 0,
        updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : base.updatedAt,
      };
    }
  }
  if (raw.settings && typeof raw.settings === 'object') {
    const s = raw.settings;
    p.settings = {
      tileMode: s.tileMode === 'syllables' ? 'syllables' : 'words',
      exercise: ['tiles', 'meaning', 'recall', 'wylie'].includes(s.exercise) ? s.exercise : 'tiles',
      lang: typeof s.lang === 'string' ? s.lang : null,
      showWylie: s.showWylie === true,
      voice: s.voice === true,
      theme: ['light', 'dark'].includes(s.theme) ? s.theme : 'auto',
      onboarded: s.onboarded === true,
    };
  }
  return p;
}

export function wordStatus(progress, id) {
  const w = progress.words[id];
  return w ? w.status : STATUS.NEW;
}

export function isKnown(progress, id) {
  return wordStatus(progress, id) === STATUS.KNOWN;
}

/** A known word whose review day has come (or passed). */
export function isDue(progress, id, today = localDay()) {
  const w = progress.words[id];
  return Boolean(w && w.status === STATUS.KNOWN && w.due && w.due <= today);
}

/** Ids of all words due for review today. */
export function dueWords(progress, today = localDay()) {
  return Object.keys(progress.words).filter((id) => isDue(progress, id, today));
}

/** Ids of known words whose review falls within the next `days` days (after today, up to and including today + days). */
export function upcomingWords(progress, days, today = localDay()) {
  const last = addDays(today, days);
  return Object.keys(progress.words).filter((id) => {
    const w = progress.words[id];
    return w.status === STATUS.KNOWN && w.due && w.due > today && w.due <= last;
  });
}

/** Days until the next review at a given level. */
export function intervalFor(level) {
  return REVIEW_INTERVALS[Math.min(Math.max(level, 0), REVIEW_INTERVALS.length - 1)];
}

function touch(progress, now) {
  return { ...progress, updatedAt: now.toISOString() };
}

function blankEntry(iso) {
  return { status: STATUS.NEW, updatedAt: iso, seen: 0, errors: 0, level: 0, due: null };
}

function wordEntry(progress, id, now) {
  return progress.words[id] || blankEntry(now.toISOString());
}

/** Known at `level`, next review after the level's interval. */
function knownAt(entry, level, today, iso) {
  return { ...entry, status: STATUS.KNOWN, level, due: addDays(today, intervalFor(level)), updatedAt: iso };
}

/**
 * Set a word status directly (dictionary screen, "I know" / "learning" buttons).
 * A manual "known" starts at MANUAL_KNOWN_LEVEL; anything else resets the schedule.
 */
export function setWordStatus(progress, id, status, now = new Date()) {
  const cur = wordEntry(progress, id, now);
  const iso = now.toISOString();
  const next = status === STATUS.KNOWN
    ? knownAt(cur, MANUAL_KNOWN_LEVEL, localDay(now), iso)
    : { ...cur, status, level: 0, due: null, updatedAt: iso };
  return touch({ ...progress, words: { ...progress.words, [id]: next } }, now);
}

/** The learner looked at a word's translation: known -> learning, new -> learning. */
export function revealWord(progress, id, now = new Date()) {
  const cur = wordEntry(progress, id, now);
  const next = { ...cur, status: STATUS.LEARNING, level: 0, due: null, seen: cur.seen + 1, updatedAt: now.toISOString() };
  return touch({ ...progress, words: { ...progress.words, [id]: next } }, now);
}

/** The learner misplaced a tile of this word: errors + 1, known -> learning. */
export function wordError(progress, id, now = new Date()) {
  const cur = wordEntry(progress, id, now);
  const next = { ...cur, status: STATUS.LEARNING, level: 0, due: null, errors: cur.errors + 1, updatedAt: now.toISOString() };
  return touch({ ...progress, words: { ...progress.words, [id]: next } }, now);
}

/** Count a word as seen without changing its status. */
export function seeWord(progress, id, now = new Date()) {
  const cur = wordEntry(progress, id, now);
  const next = { ...cur, seen: cur.seen + 1, updatedAt: now.toISOString() };
  return touch({ ...progress, words: { ...progress.words, [id]: next } }, now);
}

/**
 * A sentence was assembled correctly.
 * - `newWordIds` are the words that were not known in this sentence; those not
 *   in `revealedIds` (translation not peeked) become known at level 0, provided
 *   the sentence introduced at most `promoteUpTo` new words (1 by default; the
 *   cold-start screen passes 2 because its two-word phrases show every
 *   translation anyway).
 * - every known word in `seenIds` that was due for review (and was not peeked)
 *   moves one level up and gets a later review day.
 */
export function recordSolved(progress, sentenceId, { newWordIds = [], revealedIds = [], seenIds = [], promoteUpTo = 1 } = {}, now = new Date()) {
  const iso = now.toISOString();
  const today = localDay(now);
  let p = progress;
  const sent = p.sentences[sentenceId] || { solved: 0, lastSolved: null };
  p = { ...p, sentences: { ...p.sentences, [sentenceId]: { solved: sent.solved + 1, lastSolved: iso } } };
  const words = { ...p.words };
  for (const id of seenIds) {
    const cur = words[id] || blankEntry(iso);
    let next = { ...cur, seen: cur.seen + 1 };
    if (cur.status === STATUS.KNOWN && cur.due && cur.due <= today && !revealedIds.includes(id)) {
      next = knownAt(next, cur.level + 1, today, iso);
    }
    words[id] = next;
  }
  if (newWordIds.length >= 1 && newWordIds.length <= promoteUpTo) {
    for (const id of newWordIds) {
      if (revealedIds.includes(id)) continue;
      words[id] = knownAt(words[id] || blankEntry(iso), 0, today, iso);
    }
  }
  return touch({ ...p, words }, now);
}

/** A round of the reading course was finished with `score` correct cards. */
export function recordReadingRound(progress, stageId, score, now = new Date()) {
  const cur = progress.reading[stageId] || { rounds: 0, best: 0 };
  const next = { rounds: cur.rounds + 1, best: Math.max(cur.best, score), updatedAt: now.toISOString() };
  return touch({ ...progress, reading: { ...progress.reading, [stageId]: next } }, now);
}

export function setSetting(progress, key, value, now = new Date()) {
  return touch({ ...progress, settings: { ...progress.settings, [key]: value } }, now);
}

/** Counts of words by status among the given ids (or all recorded words). */
export function countStatuses(progress, ids = null) {
  const out = { new: 0, learning: 0, known: 0 };
  const list = ids || Object.keys(progress.words);
  for (const id of list) out[wordStatus(progress, id)]++;
  return out;
}
