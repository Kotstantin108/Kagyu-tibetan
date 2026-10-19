// Yak Tashi, the mascot: a small figure in a corner of the exercise screens and
// the course map. He smiles and blinks, speaks in a bubble after an answer or a
// passed step, and sits down to meditate when nothing happens for a while.
// Settings → "Yak Tashi" hides him. The phrase logic is in engine/tashi.js.
//
// Screens call `ctx.tashi.say('correct' | 'wrong' | 'stepDone' | 'checkPassed' | 'checkFailed')`
// and the course map `ctx.tashi.greet()`; app.js calls `setScreen(route)` on every render.

import { h } from './ui.js';
import { createPicker, shouldSpeak, blinkDelay, doubleBlink, pools, tapCategory, BUBBLE_MS, IDLE_MS, BLINK_MS, DOUBLE_BLINK_GAP_MS, SCREENS } from './engine/tashi.js';

const FRAMES = ['smile', 'blink', 'talk', 'meditate'];

export function createTashi(ctx) {
  const figure = h('button', { type: 'button', class: 'tashi-figure', id: 'tashi' });
  for (const f of FRAMES) figure.append(h('img', { src: `./img/tashi/${f}.webp`, alt: '', width: 256, height: 250, decoding: 'async', draggable: 'false', dataset: { frame: f } }));
  const bubble = h('div', { class: 'tashi-bubble', id: 'tashi-bubble', role: 'status', 'aria-live': 'polite', hidden: true });
  const root = h('div', { class: 'tashi', hidden: true, dataset: { frame: 'smile' } }, bubble, figure);
  document.body.append(root);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state = 'idle'; // idle | talk | meditate
  let shown = false;
  let picker = null;
  let pickerLang = null;
  let greeted = false; // one greeting per page load
  let blinkTimer = null;
  let blinkBack = null;
  let idleTimer = null;
  let bubbleTimer = null;

  function enabled() { return ctx.store.get().settings.tashi !== false; }

  function phrases() {
    if (pickerLang !== ctx.lang) { picker = createPicker(pools(ctx.t)); pickerLang = ctx.lang; }
    return picker;
  }

  /** `snap`: switch the frame at once (blink, talk); otherwise a cross-fade (meditation). */
  function setFrame(frame, snap) {
    root.classList.toggle('snap', Boolean(snap) || reduced.matches);
    root.dataset.frame = frame;
  }

  function setState(next) {
    const wasMeditating = state === 'meditate';
    state = next;
    if (next === 'talk') setFrame('talk', true);
    else if (next === 'meditate') setFrame('meditate', false);
    else setFrame('smile', !wasMeditating);
  }

  // ---- blinking: uneven pauses, now and then a double blink ----
  function blink(again) {
    if (!shown || state !== 'idle' || document.hidden) return;
    setFrame('blink', true);
    clearTimeout(blinkBack);
    blinkBack = setTimeout(() => {
      if (state !== 'idle') return;
      setFrame('smile', true);
      if (again) blinkBack = setTimeout(() => blink(false), DOUBLE_BLINK_GAP_MS);
    }, BLINK_MS);
  }
  function scheduleBlink() {
    clearTimeout(blinkTimer);
    if (reduced.matches) return;
    blinkTimer = setTimeout(() => {
      blink(doubleBlink());
      scheduleBlink();
    }, blinkDelay());
  }

  // ---- meditation after a quiet spell ----
  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (shown && state === 'idle') setState('meditate'); }, IDLE_MS);
  }
  function activity() {
    if (!shown) return;
    armIdle();
    if (state === 'meditate') setState('idle');
  }
  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) document.addEventListener(ev, activity, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) activity(); });

  // ---- the bubble ----
  function speak(text) {
    clearTimeout(bubbleTimer);
    bubble.hidden = false;
    bubble.textContent = text;
    bubble.classList.remove('show');
    void bubble.offsetWidth; // restart the entrance animation
    bubble.classList.add('show');
    setState('talk');
    armIdle();
    bubbleTimer = setTimeout(hush, BUBBLE_MS);
  }
  function hush() {
    clearTimeout(bubbleTimer);
    bubble.hidden = true;
    bubble.classList.remove('show');
    if (state === 'talk') setState('idle');
  }
  bubble.addEventListener('click', hush);
  figure.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!bubble.hidden) { hush(); return; }
    say(tapCategory(), { force: true });
  });

  /** A phrase of the category, if he is shown and (unless forced) the ration allows. */
  function say(category, { force = false } = {}) {
    if (!shown || !enabled()) return false;
    if (!force && !shouldSpeak(category)) return false;
    const text = phrases().next(category);
    if (!text) return false;
    speak(text);
    return true;
  }

  /** The course map: introduce himself the first time ever, then one greeting per page load. */
  function greet() {
    if (!shown || !enabled() || greeted) return;
    greeted = true;
    if (!ctx.store.get().settings.tashiMet) {
      // the flag is cosmetic: written without touching updatedAt, so a sync or the smoke test does not count it as a change
      ctx.store.update((p) => ({ ...p, settings: { ...p.settings, tashiMet: true } }));
      speak(ctx.t('tashi.intro'));
      return;
    }
    say('hello', { force: true });
  }

  /** Show him on the screens that have something to cheer for, hide him elsewhere or when switched off. */
  function setScreen(name) {
    const want = enabled() && SCREENS.includes(name);
    figure.setAttribute('aria-label', ctx.t('tashi.name'));
    figure.title = ctx.t('tashi.name');
    if (want === shown) return;
    shown = want;
    root.hidden = !shown;
    document.documentElement.classList.toggle('tashi-on', shown);
    if (shown) {
      setState('idle');
      scheduleBlink();
      armIdle();
    } else {
      hush();
      clearTimeout(blinkTimer);
      clearTimeout(blinkBack);
      clearTimeout(idleTimer);
    }
  }

  return { say, greet, hush, setScreen };
}
