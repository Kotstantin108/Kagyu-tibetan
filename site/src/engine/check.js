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
