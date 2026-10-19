// The alphabet module of the course (module 0): fifteen parts, each a ladder
// of three steps (meet the signs, training, check), plus an exam that lets a
// reader skip the module. Pure functions; the drills reuse letters.js.
//
// Data: site/data/alphabet.json (from content/letters.tsv and
// content/alphabet-intro.tsv): { letters: [{ tib, wylie, kind, name, tone,
// similar, sound: {lang: text}, examples: [wordIds] }], intros: { part: {lang: text} } }

import { stageItems, courseSyllables, courseWords, editDistance, ROUND_SIZE, PASS_SCORE } from './letters.js';
import { shuffle } from './check.js';
import { OLD_STAGE_PARTS } from './progress.js';

export const ALPHABET_MODULE = 'alphabet';
export const ALPHA_STEPS = ['intro', 'train', 'check'];
export const TRAIN_SIZE = ROUND_SIZE;   // 12
export const TRAIN_PASS = PASS_SCORE;   // 10
export const ALPHA_CHECK_SIZE = 10;
export const ALPHA_CHECK_PASS = 8;
export const EXAM_SIZE = 20;
export const EXAM_PASS = 17;
/** Sentences of lesson 1 in the last part, and how many of them pass its check. */
export const FIRST_SENTENCES = 5;
export const FIRST_SENTENCES_PASS = 4;

export const ROWS = [
  ['ཀ', 'ཁ', 'ག', 'ང'], ['ཅ', 'ཆ', 'ཇ', 'ཉ'], ['ཏ', 'ཐ', 'ད', 'ན'], ['པ', 'ཕ', 'བ', 'མ'],
  ['ཙ', 'ཚ', 'ཛ', 'ཝ'], ['ཞ', 'ཟ', 'འ', 'ཡ'], ['ར', 'ལ', 'ཤ', 'ས'], ['ཧ', 'ཨ'],
];

export const PARTS = [
  ...ROWS.map((row, i) => ({ n: i + 1, kind: 'letters', row: i })),
  { n: 9, kind: 'vowels' }, { n: 10, kind: 'subjoined' }, { n: 11, kind: 'superscribed' },
  { n: 12, kind: 'affixes' }, { n: 13, kind: 'syllables' }, { n: 14, kind: 'words' }, { n: 15, kind: 'sentences' },
];

export const partId = (n) => `${ALPHABET_MODULE}/${n}`;
export const partOf = (unitId) => PARTS.find((p) => partId(p.n) === unitId) || null;

/** The module as the course sees it: one unit per part. */
export function alphabetModule() {
  return { id: ALPHABET_MODULE, units: PARTS.map((p) => ({ id: partId(p.n), module: ALPHABET_MODULE, part: p.n, kind: p.kind })) };
}

const KIND_OF_PART = { vowels: 'vowel', subjoined: 'subjoined', superscribed: 'superscribed' };

/** The entries of alphabet.json introduced by a part (the cards of its first step). */
export function partSigns(part, alphabet) {
  const letters = (alphabet && alphabet.letters) || [];
  if (part.kind === 'letters') return ROWS[part.row].map((tib) => letters.find((l) => l.kind === 'letter' && l.tib === tib)).filter(Boolean);
  if (part.kind === 'affixes') return letters.filter((l) => l.kind === 'prefix' || l.kind === 'suffix');
  const kind = KIND_OF_PART[part.kind];
  return kind ? letters.filter((l) => l.kind === kind) : [];
}

const item = (l) => ({ tib: l.tib, wylie: l.wylie });

/** The signs a part drills: the letters learnt so far for a letter part, the stage items otherwise. */
export function partPool(part, alphabet, dict = {}, sets = []) {
  const letters = ((alphabet && alphabet.letters) || []).filter((l) => l.kind === 'letter');
  switch (part.kind) {
    case 'letters': return ROWS.slice(0, part.row + 1).flat().map((tib) => letters.find((l) => l.tib === tib)).filter(Boolean).map(item);
    case 'vowels': return stageItems('vowels');
    case 'subjoined': return stageItems('subjoined');
    case 'superscribed': return stageItems('superscribed');
    case 'affixes': return stageItems('affixes');
    case 'syllables': return courseSyllables(dict, sets);
    case 'words': return courseWords(dict, sets);
    default: return [];
  }
}

/** The signs new in a part (a letter part: its row; otherwise the whole pool). */
export function partNewItems(part, alphabet, dict, sets) {
  if (part.kind !== 'letters') return partPool(part, alphabet, dict, sets);
  const letters = ((alphabet && alphabet.letters) || []).filter((l) => l.kind === 'letter');
  return ROWS[part.row].map((tib) => letters.find((l) => l.tib === tib)).filter(Boolean).map(item);
}

/**
 * Answer options for a card: the right one plus three distractors, look-alike
 * signs first (the `similar` lists of alphabet.json), then the closest Wylie.
 */
export function optionsFor(card, pool, alphabet, n = 4, random = Math.random) {
  const seen = new Set([card.wylie]);
  const out = [{ tib: card.tib, wylie: card.wylie, right: true }];
  const entry = ((alphabet && alphabet.letters) || []).find((l) => l.tib === card.tib && l.kind === 'letter');
  const byTib = new Map(pool.map((x) => [x.tib, x]));
  for (const tib of (entry && entry.similar) || []) {
    const x = byTib.get(tib) || (((alphabet && alphabet.letters) || []).find((l) => l.kind === 'letter' && l.tib === tib));
    if (!x || seen.has(x.wylie) || out.length >= n) continue;
    seen.add(x.wylie);
    out.push({ tib: x.tib, wylie: x.wylie, right: false });
  }
  const rest = pool.filter((x) => !seen.has(x.wylie)).map((x) => ({ x, k: editDistance(card.wylie, x.wylie) + random() * 1.5 })).sort((a, b) => a.k - b.k);
  for (const { x } of rest) {
    if (out.length >= n) break;
    if (seen.has(x.wylie)) continue;
    seen.add(x.wylie);
    out.push({ tib: x.tib, wylie: x.wylie, right: false });
  }
  return shuffle(out, random);
}

/** `size` cards: at least half from `fresh` (the new signs), the rest from the pool; all distinct. */
function pickCards(fresh, pool, size, random) {
  const freshSet = shuffle(fresh, random);
  const others = shuffle(pool.filter((x) => !fresh.some((f) => f.wylie === x.wylie)), random);
  const want = Math.min(size, fresh.length + others.length);
  const out = [];
  const fromFresh = Math.min(freshSet.length, Math.max(Math.ceil(want / 2), want - others.length));
  out.push(...freshSet.slice(0, fromFresh));
  out.push(...others.slice(0, want - out.length));
  // a small pool (two letters): repeat the cards to fill the round
  while (out.length < size && out.length) out.push(out[out.length % Math.max(1, fresh.length + others.length)]);
  return shuffle(out, random);
}

/**
 * A drill. kind: 'train' | 'free' (12 cards, sign → Wylie), 'check' (10 cards,
 * every other one reversed: Wylie → sign), 'exam' (20 cards over the whole alphabet).
 * Returns [{ tib, wylie, reverse, options }].
 */
export function makeDrill(kind, part, alphabet, dict = {}, sets = [], random = Math.random) {
  if (kind === 'exam') return makeExam(alphabet, dict, sets, random);
  const pool = partPool(part, alphabet, dict, sets);
  const fresh = partNewItems(part, alphabet, dict, sets);
  const size = kind === 'check' ? ALPHA_CHECK_SIZE : TRAIN_SIZE;
  const cards = pickCards(fresh, pool, size, random);
  return cards.map((card, i) => ({ ...card, reverse: kind === 'check' && i % 2 === 1, options: optionsFor(card, pool, alphabet, 4, random) }));
}

function makeExam(alphabet, dict, sets, random) {
  const plan = [['letters', 8], ['vowels', 3], ['subjoined', 2], ['superscribed', 2], ['affixes', 2], ['syllables', 2], ['words', 1]];
  const cards = [];
  for (const [kind, count] of plan) {
    const part = kind === 'letters' ? PARTS[7] : PARTS.find((p) => p.kind === kind);
    const pool = partPool(part, alphabet, dict, sets);
    const picked = shuffle(pool, random).slice(0, count);
    for (const card of picked) cards.push({ ...card, options: optionsFor(card, pool, alphabet, 4, random) });
  }
  return shuffle(cards, random).map((c, i) => ({ ...c, reverse: i % 2 === 1 }));
}

/** The pass score of a drill kind. */
export function drillPass(kind) {
  return kind === 'check' ? ALPHA_CHECK_PASS : kind === 'exam' ? EXAM_PASS : TRAIN_PASS;
}

export function examPassed(progress) {
  const e = progress.course && progress.course.alphabetExam;
  return Boolean(e && e.passedAt);
}

export { OLD_STAGE_PARTS };
