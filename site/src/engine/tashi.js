// Yak Tashi, the mascot: which phrase he says and when. Pure logic, no DOM
// (site/src/tashi.js draws him and runs the timers).
//
// Phrases come in categories (the `tashi` block of the interface strings). Each
// category is a shuffled queue: a phrase does not come back until the whole pool
// was heard, and a refilled queue never starts with the phrase that ended the
// previous round. Praise after a correct answer comes one time in three so he
// does not turn into a parrot; every other event always gets a phrase.

export const CATEGORIES = ['correct', 'wrong', 'stepDone', 'checkPassed', 'checkFailed', 'hello'];
export const PRAISE_CHANCE = 1 / 3;
export const BUBBLE_MS = 3000;    // a phrase stays this long
export const IDLE_MS = 30000;     // no input for this long: he sits down to meditate
export const BLINK_MS = 120;
export const BLINK_MIN_MS = 3000; // a blink every 3–6 seconds
export const BLINK_MAX_MS = 6000;
export const SCREENS = ['course', 'play', 'read']; // the screens he is shown on

/** Fisher–Yates on a copy. */
export function shuffle(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The phrase pools of a translator: `t('tashi')` is the object of arrays. */
export function pools(t) {
  const obj = t('tashi');
  const out = {};
  for (const c of CATEGORIES) out[c] = Array.isArray(obj && obj[c]) ? obj[c] : [];
  return out;
}

/** A picker over the pools: `next(category)` gives the next phrase, null for an empty pool. */
export function createPicker(pools, rng = Math.random) {
  const queues = {};
  const last = {};
  return {
    next(category) {
      const pool = pools[category] || [];
      if (!pool.length) return null;
      let q = queues[category];
      if (!q || !q.length) {
        q = shuffle(pool, rng);
        if (q.length > 1 && q[0] === last[category]) q.push(q.shift());
        queues[category] = q;
      }
      const phrase = q.shift();
      last[category] = phrase;
      return phrase;
    },
  };
}

/** Does this event get a phrase? Praise is rationed, everything else is said. */
export function shouldSpeak(category, rng = Math.random) {
  return category !== 'correct' || rng() < PRAISE_CHANCE;
}

/** Milliseconds until the next blink. */
export function blinkDelay(rng = Math.random) {
  return BLINK_MIN_MS + Math.floor(rng() * (BLINK_MAX_MS - BLINK_MIN_MS));
}

/** What he says when tapped while quiet: a greeting or a bit of praise. */
export function tapCategory(rng = Math.random) {
  return rng() < 0.5 ? 'hello' : 'correct';
}
