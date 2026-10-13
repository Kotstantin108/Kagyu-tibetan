// Choosing the next sentence. Pure functions, no DOM.

import { COLD_START_KNOWN } from './config.js';
import { isKnown, isDue } from './progress.js';
import { localDay } from './streak.js';

/** Non-service word ids of a sentence, deduplicated, in order. */
export function contentWords(sentence, dict) {
  const out = [];
  for (const id of sentence.words) {
    const w = dict[id];
    if (!w || w.service) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function unknownWords(sentence, dict, progress) {
  return contentWords(sentence, dict).filter((id) => !isKnown(progress, id));
}

/** Known words of the sentence whose review day has come. */
export function dueWordsIn(sentence, dict, progress, today = localDay()) {
  return contentWords(sentence, dict).filter((id) => isDue(progress, id, today));
}

function setRank(sentence, setOrder) {
  return setOrder.get(sentence.set) ?? Number.MAX_SAFE_INTEGER;
}

function lastSolvedTime(sentence, progress) {
  const s = progress.sentences[sentence.id];
  if (!s || !s.lastSolved) return 0; // never solved sorts first
  const t = Date.parse(s.lastSolved);
  return Number.isFinite(t) ? t : 0;
}

/** Sort: set order, then least recently solved, then original order. */
function compare(setOrder, progress, index) {
  return (a, b) =>
    setRank(a, setOrder) - setRank(b, setOrder) ||
    lastSolvedTime(a, progress) - lastSolvedTime(b, progress) ||
    index.get(a.id) - index.get(b.id);
}

function knownCount(progress) {
  return Object.values(progress.words).filter((w) => w.status === 'known').length;
}

/**
 * Pick the next sentence.
 *
 * @param {Array} sentences  all sentences
 * @param {Object} dict      words.json
 * @param {Array} sets       sets.json (gives the set order)
 * @param {Object} progress  progress record
 * @param {Object} opts      { lastId, lastReason, today, focusIds }
 * @returns {{ sentence, newWordIds, dueWordIds, reveal, reason }|null}
 *   reveal: true in cold-start mode (show all translations)
 *   reason: 'cold' | 'focus' | 'due' | 'one-new' | 'fewest-new'
 *
 * Order of preference after the cold start:
 *   1. a sentence made only of known words, at least one of them due for
 *      review ('due') — but never two of those in a row while new material
 *      is available, so reviews and new words alternate;
 *   2. a sentence with exactly one unknown word ('one-new');
 *   3. the sentence with the fewest unknown words ('fewest-new').
 */
export function pickNext(sentences, dict, sets, progress, { lastId = null, lastReason = null, today = localDay(), focusIds = null } = {}) {
  if (!sentences.length) return null;
  const setOrder = new Map(sets.map((s) => [s.id, s.order]));
  const index = new Map(sentences.map((s, i) => [s.id, i]));
  const cmp = compare(setOrder, progress, index);
  const notLast = (list) => (list.length > 1 ? list.filter((s) => s.id !== lastId) : list);
  const result = (sentence, reason, reveal = false) => ({
    sentence,
    newWordIds: unknownWords(sentence, dict, progress),
    dueWordIds: dueWordsIn(sentence, dict, progress, today),
    reveal,
    reason,
  });

  // cold start: first sentences of the first set, translations open
  if (knownCount(progress) < COLD_START_KNOWN) {
    const firstSet = [...sets].sort((a, b) => a.order - b.order)[0];
    const pool = sentences.filter((s) => s.set === firstSet.id);
    if (pool.length) {
      const unsolved = pool.filter((s) => !(progress.sentences[s.id] && progress.sentences[s.id].solved > 0));
      const list = notLast(unsolved.length ? unsolved : pool).sort(cmp);
      return result(list[0], 'cold', true);
    }
  }

  const withCounts = sentences.map((s) => ({ s, n: unknownWords(s, dict, progress).length }));

  // focused practice (e.g. "hard words"): sentences containing the focus
  // words, preferring those whose other words are all known
  if (focusIds && focusIds.length) {
    const focus = new Set(focusIds);
    const cands = withCounts
      .map((x) => {
        const words = contentWords(x.s, dict);
        const hits = words.filter((id) => focus.has(id)).length;
        const others = unknownWords(x.s, dict, progress).filter((id) => !focus.has(id)).length;
        return { s: x.s, hits, others };
      })
      .filter((x) => x.hits > 0 && x.others <= 1);
    if (cands.length) {
      const list = notLast(cands.sort((a, b) => a.others - b.others || b.hits - a.hits || cmp(a.s, b.s)).map((x) => x.s));
      return result(list[0], 'focus');
    }
  }

  const oneNew = withCounts.filter((x) => x.n === 1).map((x) => x.s);

  // scheduled reviews: all words known, some of them due
  const review = withCounts
    .filter((x) => x.n === 0)
    .map((x) => ({ s: x.s, due: dueWordsIn(x.s, dict, progress, today).length }))
    .filter((x) => x.due > 0);
  if (review.length && (lastReason !== 'due' || !oneNew.length)) {
    const list = notLast(review.sort((a, b) => b.due - a.due || cmp(a.s, b.s)).map((x) => x.s));
    return result(list[0], 'due');
  }

  if (oneNew.length) {
    const list = notLast(oneNew).sort(cmp);
    return result(list[0], 'one-new');
  }

  // fallback: fewest unknown words (zero counts as review)
  const min = Math.min(...withCounts.map((x) => x.n));
  const pool = withCounts.filter((x) => x.n === min).map((x) => x.s);
  const list = notLast(pool).sort(cmp);
  return result(list[0], 'fewest-new');
}
