// Words the learner struggles with. Pure functions.

/**
 * Words with the most mistakes, most recent first among equals.
 * A word counts as hard when it has at least `minErrors` errors, or when it
 * is still "learning" after one error and several looks at its translation.
 * @returns {string[]} word ids, hardest first (at most `limit`)
 */
export function hardWords(progress, dict, { limit = 20, minErrors = 2 } = {}) {
  const rows = [];
  for (const [id, w] of Object.entries(progress.words)) {
    if (!dict[id] || dict[id].service) continue;
    const hard = w.errors >= minErrors || (w.status === 'learning' && w.errors >= 1 && w.seen >= 3);
    if (!hard) continue;
    rows.push({ id, errors: w.errors, seen: w.seen, updatedAt: Date.parse(w.updatedAt) || 0 });
  }
  rows.sort((a, b) => b.errors - a.errors || b.updatedAt - a.updatedAt);
  return rows.slice(0, limit).map((r) => r.id);
}
