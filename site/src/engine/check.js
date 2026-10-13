// Answer checking: compares tile TEXTS, not ids, so identical tiles are interchangeable.

/**
 * @param {string[]} expected  tile texts in the correct order
 * @param {string[]} answer    tile texts in the order the learner placed them
 * @returns {{ correct: boolean, wrong: number[] }} indexes (in `answer`) that are wrong
 */
export function checkAnswer(expected, answer) {
  const wrong = [];
  const n = Math.max(expected.length, answer.length);
  for (let i = 0; i < n; i++) {
    if (expected[i] !== answer[i]) wrong.push(i);
  }
  return { correct: wrong.length === 0, wrong };
}

/** Fisher-Yates shuffle that never returns the original order for 2+ distinct items. */
export function shuffle(items, random = Math.random) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const same = arr.every((x, i) => x === items[i]);
  if (same && new Set(items).size > 1) {
    // rotate by one to guarantee a different order
    arr.push(arr.shift());
  }
  return arr;
}

/**
 * Normalize typed Wylie for comparison: lower case, typographic apostrophes,
 * no shad, single spaces. Capital letters (retroflex T D N Sh) are kept.
 */
export function normalizeWylie(s) {
  return String(s || '')
    .replace(/[’‘`´]/g, "'")
    .replace(/\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compare typed Wylie with the expected syllables.
 * @param {string[]} expected  expected syllables (e.g. ['nga', 'slob', 'ma', 'yin'])
 * @param {string} answer      what the learner typed
 * @returns {{ correct, wrong: number[], typed: string[] }} indexes of wrong syllables
 */
export function checkWylie(expected, answer) {
  const typed = normalizeWylie(answer).split(' ').filter(Boolean);
  const exp = expected.map((s) => normalizeWylie(s));
  const wrong = [];
  const n = Math.max(exp.length, typed.length);
  for (let i = 0; i < n; i++) {
    if ((typed[i] || '').toLowerCase() !== (exp[i] || '').toLowerCase()) wrong.push(i);
  }
  return { correct: wrong.length === 0, wrong, typed };
}

/**
 * Multiple-choice options for a sentence: its own translation plus `n - 1`
 * distractors taken from other sentences, preferably the same set and a
 * similar length. Returns [{ id, text }] in random order.
 */
export function pickOptions(sentence, sentences, lang, n = 4, random = Math.random) {
  const text = (s) => (s.tr && (s.tr[lang] || s.tr.en)) || '';
  const own = text(sentence);
  const seen = new Set([own]);
  const pool = sentences.filter((s) => s.id !== sentence.id && text(s) && !seen.has(text(s)));
  const score = (s) => (s.set === sentence.set ? 0 : 1000) + Math.abs(text(s).length - own.length);
  const sorted = pool.map((s) => ({ s, k: score(s) + random() * 8 })).sort((a, b) => a.k - b.k);
  const out = [{ id: sentence.id, text: own }];
  for (const { s } of sorted) {
    const tx = text(s);
    if (seen.has(tx)) continue;
    seen.add(tx);
    out.push({ id: s.id, text: tx });
    if (out.length >= n) break;
  }
  return shuffle(out, random);
}
