// Progress model and pure transitions. No DOM, no storage here.
//
// {
//   schemaVersion: 1,
//   updatedAt: ISO string,
//   words: { id: { status: 'new'|'learning'|'known', updatedAt, seen, errors } },
//   sentences: { id: { solved, lastSolved } },
//   streak: { current, best, lastDay, todayDate, todayCount },
//   settings: { tileMode: 'words'|'syllables', lang }
// }

import { SCHEMA_VERSION } from './config.js';

export const STATUS = { NEW: 'new', LEARNING: 'learning', KNOWN: 'known' };

export function createProgress(now = new Date()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now.toISOString(),
    words: {},
    sentences: {},
    streak: { current: 0, best: 0, lastDay: null, todayDate: null, todayCount: 0 },
    settings: { tileMode: 'words', lang: null },
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
  if (raw.settings && typeof raw.settings === 'object') {
    p.settings = {
      tileMode: raw.settings.tileMode === 'syllables' ? 'syllables' : 'words',
      lang: typeof raw.settings.lang === 'string' ? raw.settings.lang : null,
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

function touch(progress, now) {
  return { ...progress, updatedAt: now.toISOString() };
}

function wordEntry(progress, id, now) {
  return progress.words[id] || { status: STATUS.NEW, updatedAt: now.toISOString(), seen: 0, errors: 0 };
}

/** Set a word status directly (dictionary screen, "I know" / "learning" buttons). */
export function setWordStatus(progress, id, status, now = new Date()) {
  const cur = wordEntry(progress, id, now);
  const next = { ...cur, status, updatedAt: now.toISOString() };
  return touch({ ...progress, words: { ...progress.words, [id]: next } }, now);
}

/** The learner looked at a word's translation: known -> learning, new -> learning. */
export function revealWord(progress, id, now = new Date()) {
  const cur = wordEntry(progress, id, now);
  const next = { ...cur, status: STATUS.LEARNING, seen: cur.seen + 1, updatedAt: now.toISOString() };
  return touch({ ...progress, words: { ...progress.words, [id]: next } }, now);
}

/** The learner misplaced a tile of this word: errors + 1, known -> learning. */
export function wordError(progress, id, now = new Date()) {
  const cur = wordEntry(progress, id, now);
  const next = { ...cur, status: STATUS.LEARNING, errors: cur.errors + 1, updatedAt: now.toISOString() };
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
 * `newWordIds` are the words that were new in this sentence; those not in
 * `revealedIds` (translation not peeked) become known, provided the sentence
 * introduced at most `promoteUpTo` new words (1 by default; the cold-start
 * screen passes 2 because its two-word phrases show every translation anyway).
 */
export function recordSolved(progress, sentenceId, { newWordIds = [], revealedIds = [], seenIds = [], promoteUpTo = 1 } = {}, now = new Date()) {
  const iso = now.toISOString();
  let p = progress;
  const sent = p.sentences[sentenceId] || { solved: 0, lastSolved: null };
  p = { ...p, sentences: { ...p.sentences, [sentenceId]: { solved: sent.solved + 1, lastSolved: iso } } };
  const words = { ...p.words };
  for (const id of seenIds) {
    const cur = words[id] || { status: STATUS.NEW, updatedAt: iso, seen: 0, errors: 0 };
    words[id] = { ...cur, seen: cur.seen + 1 };
  }
  if (newWordIds.length >= 1 && newWordIds.length <= promoteUpTo) {
    for (const id of newWordIds) {
      if (revealedIds.includes(id)) continue;
      const cur = words[id] || { status: STATUS.NEW, updatedAt: iso, seen: 0, errors: 0 };
      words[id] = { ...cur, status: STATUS.KNOWN, updatedAt: iso };
    }
  }
  return touch({ ...p, words }, now);
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
