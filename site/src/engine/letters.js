// The reading course: letters, vowel signs, stacks, affixes and real syllables.
// Pure functions, no DOM. Every item is { tib, wylie }; the Wylie comes from
// the same transliterator as the Wylie exercise, so the two never disagree.

import { syllableToWylie } from './wylie.js';
import { stripTsheg, splitSyllables } from './tib.js';
import { shuffle } from './check.js';

/** Cards per round. */
export const ROUND_SIZE = 12;
/** Correct cards (of ROUND_SIZE) for a stage to count as passed. */
export const PASS_SCORE = 10;

const ROWS1 = 'ཀ ཁ ག ང ཅ ཆ ཇ ཉ ཏ ཐ ད ན པ ཕ བ མ';
const ROWS2 = 'ཙ ཚ ཛ ཝ ཞ ཟ འ ཡ ར ལ ཤ ས ཧ ཨ';
const VOWEL_SIGNS = ['ི', 'ུ', 'ེ', 'ོ'];
const SUBJOINED = 'ཀྱ ཁྱ གྱ པྱ ཕྱ བྱ མྱ ཀྲ ཁྲ གྲ ཏྲ ཐྲ དྲ པྲ ཕྲ བྲ མྲ སྲ ཧྲ ཀླ གླ བླ ཟླ རླ སླ ཀྭ ཁྭ གྭ ཉྭ དྭ ཙྭ ཚྭ ཞྭ ཟྭ རྭ ལྭ ཤྭ སྭ ཧྭ';
const SUPERSCRIBED = 'རྐ རྒ རྔ རྗ རྙ རྟ རྡ རྣ རྦ རྨ རྩ རྫ ལྐ ལྒ ལྔ ལྕ ལྗ ལྟ ལྡ ལྤ ལྦ ལྷ སྐ སྒ སྔ སྙ སྟ སྡ སྣ སྤ སྦ སྨ སྩ';
// real syllables of the course with a prefix, a suffix or both
const AFFIXES = 'ཆོས ཡིན ལམ ཡོད དང ནང བར ཡུལ ཁང ཤེས རང ཕྱག ལུས སེམས རིག ཐུབ ཆེན གསུམ དགོན བཀའ མཐོ འགྲོ བཞི དཀར མགོ འདུག གཉིས བདག མཆོད འབྲས དབང བསྒྲུབས སངས རྒྱས ཐམས ཅད གཡག དགེ བསམ འཇིག རྟེན མཁས';

export const STAGE_IDS = ['rows1', 'rows2', 'vowels', 'subjoined', 'superscribed', 'affixes', 'words'];

const item = (tib) => ({ tib, wylie: syllableToWylie(tib) });
const list = (s) => s.split(' ').map(item);

// a syllable made of letters, subjoined letters and vowel signs only (no digits, marks or punctuation)
const PLAIN_SYLLABLE = /^[ཀ-ཬ][ཀ-ཬཱ-ཽྀ-ྼ]*$/u;

/** Unique syllables of the course dictionary, in set order of first appearance. */
export function courseSyllables(dict, sets = []) {
  const order = new Map(sets.map((s) => [s.id, s.order]));
  const words = Object.values(dict).filter((w) => !w.service && w.tib);
  words.sort((a, b) => (order.get(a.set) ?? Infinity) - (order.get(b.set) ?? Infinity));
  const seen = new Set();
  const out = [];
  for (const w of words) {
    for (const syl of splitSyllables(w.tib)) {
      const tib = stripTsheg(syl);
      if (!PLAIN_SYLLABLE.test(tib) || seen.has(tib)) continue;
      seen.add(tib);
      out.push(item(tib));
    }
  }
  return out;
}

/** The cards of a stage: [{ tib, wylie }]. */
export function stageItems(stageId, dict = {}, sets = []) {
  switch (stageId) {
    case 'rows1': return list(ROWS1);
    case 'rows2': return list(ROWS2);
    case 'vowels': {
      const out = [];
      for (const c of `${ROWS1} ${ROWS2}`.split(' ')) for (const v of VOWEL_SIGNS) out.push(item(c + v));
      return out;
    }
    case 'subjoined': return list(SUBJOINED);
    case 'superscribed': return list(SUPERSCRIBED);
    case 'affixes': return list(AFFIXES);
    case 'words': return courseSyllables(dict, sets);
    default: return [];
  }
}

/** Levenshtein distance; the strings are short Wylie syllables. */
export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Answer options for a card: its own Wylie plus `n - 1` distractors from the
 * same stage, preferring spellings that differ by a letter or two. Returns
 * [{ wylie, right }] in random order.
 */
export function optionsFor(card, items, n = 4, random = Math.random) {
  const seen = new Set([card.wylie]);
  const pool = [];
  for (const it of items) {
    if (seen.has(it.wylie)) continue;
    seen.add(it.wylie);
    pool.push({ wylie: it.wylie, k: editDistance(card.wylie, it.wylie) + random() * 1.5 });
  }
  pool.sort((a, b) => a.k - b.k);
  const out = [{ wylie: card.wylie, right: true }];
  for (const p of pool.slice(0, n - 1)) out.push({ wylie: p.wylie, right: false });
  return shuffle(out, random);
}

/** A round: `size` distinct cards of the stage in random order, each with its options. */
export function makeRound(items, size = ROUND_SIZE, random = Math.random) {
  const cards = shuffle(items, random).slice(0, size);
  return cards.map((card) => ({ ...card, options: optionsFor(card, items, 4, random) }));
}

/** A stage counts as passed when the best round reached PASS_SCORE. */
export function stagePassed(progress, stageId) {
  const r = progress.reading && progress.reading[stageId];
  return Boolean(r && r.best >= PASS_SCORE);
}
