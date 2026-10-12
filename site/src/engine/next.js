// Choosing the next sentence. Pure functions, no DOM.

import { COLD_START_KNOWN } from './config.js';
import { isKnown } from './progress.js';

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
 * @param {Object} opts      { lastId }
 * @returns {{ sentence, newWordIds, reveal, reason }|null}
 *   reveal: true in cold-start mode (show all translations)
 *   reason: 'cold' | 'one-new' | 'fewest-new'
 */
export function pickNext(sentences, dict, sets, progress, { lastId = null } = {}) {
  if (!sentences.length) return null;
  const setOrder = new Map(sets.map((s) => [s.id, s.order]));
  const index = new Map(sentences.map((s, i) => [s.id, i]));
  const cmp = compare(setOrder, progress, index);
  const notLast = (list) => (list.length > 1 ? list.filter((s) => s.id !== lastId) : list);

  // cold start: first sentences of the first set, translations open
  if (knownCount(progress) < COLD_START_KNOWN) {
    const firstSet = [...sets].sort((a, b) => a.order - b.order)[0];
    const pool = sentences.filter((s) => s.set === firstSet.id);
    if (pool.length) {
      const unsolved = pool.filter((s) => !(progress.sentences[s.id] && progress.sentences[s.id].solved > 0));
      const list = notLast(unsolved.length ? unsolved : pool).sort(cmp);
      const sentence = list[0];
      return { sentence, newWordIds: unknownWords(sentence, dict, progress), reveal: true, reason: 'cold' };
    }
  }

  const withCounts = sentences.map((s) => ({ s, n: unknownWords(s, dict, progress).length }));
  const oneNew = withCounts.filter((x) => x.n === 1).map((x) => x.s);
  if (oneNew.length) {
    const list = notLast(oneNew).sort(cmp);
    const sentence = list[0];
    return { sentence, newWordIds: unknownWords(sentence, dict, progress), reveal: false, reason: 'one-new' };
  }

  // fallback: fewest unknown words (zero counts as review)
  const min = Math.min(...withCounts.map((x) => x.n));
  const pool = withCounts.filter((x) => x.n === min).map((x) => x.s);
  const list = notLast(pool).sort(cmp);
  const sentence = list[0];
  return { sentence, newWordIds: unknownWords(sentence, dict, progress), reveal: false, reason: 'fewest-new' };
}
