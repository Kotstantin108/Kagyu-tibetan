// Tiny DOM helpers.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

let toastTimer = null;
export function toast(message, ms = 2500) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), ms);
}

/**
 * Bottom-sheet popover; returns a close function.
 * opts.onDismiss runs when the user closes it by the backdrop or Escape.
 */
export function popover(content, { onDismiss = null } = {}) {
  const backdrop = h('div', { class: 'popover-backdrop' });
  const box = h('div', { class: 'popover', role: 'dialog', 'aria-modal': 'true' }, content);
  backdrop.append(box);
  // the screen may have removed the backdrop already (a navigation while the popover was open): then the listener just goes
  const onKey = (e) => { if (e.key !== 'Escape') return; if (!backdrop.isConnected) { document.removeEventListener('keydown', onKey, true); return; } e.stopPropagation(); dismiss(); };
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey, true); };
  const dismiss = () => { close(); if (onDismiss) onDismiss(); };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) dismiss(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(backdrop);
  const focusable = box.querySelector('button, [href], input, select, textarea');
  if (focusable) setTimeout(() => focusable.focus(), 0);
  return close;
}

// ---- pronunciation clips (see README "Audio") ----
// Two kinds, two settings: the native recordings of the open textbook Basic Tibetan
// (clip ids sign-*, spell-*, msu-*, phrase-*; setting `recordings`, on by default) and
// the synthesised clips of words and sentences (w-<id>, s<n>; setting `voice`, off by
// default because that voice misreads longer words). A word that a native speaker has
// read plainly (alphabet.json `words`) plays that recording instead of its w-<id>.
let player = null;
let playingBtn = null;

/** The clip to play for `clipId` and its kind: { id, kind: 'native'|'synth' }. */
export function resolveClip(ctx, clipId) {
  const m = /^w-(.+)$/.exec(clipId);
  if (m) {
    const w = ctx.data && ctx.data.words && ctx.data.words[m[1]];
    const map = ctx.data && ctx.data.alphabet && ctx.data.alphabet.words;
    const native = w && map && (map[w.tib] || map[String(w.tib).replace(/་$/, '')]);
    if (native) return { id: native, kind: 'native' };
  }
  return { id: clipId, kind: /^(w-|s\d)/.test(clipId) ? 'synth' : 'native' };
}

/** True when the setting for this kind of clip is on. */
export function clipEnabled(ctx, kind) {
  const s = ctx.store.get().settings;
  return kind === 'native' ? s.recordings !== false : s.voice === true;
}

/**
 * A round "listen" button for a word (`w-<id>`), a sentence (`s123`) or a native clip.
 * Returns null when AUDIO_BASE is not configured or the setting for that kind of clip
 * is off. Clips are fetched on demand.
 */
export function audioButton(ctx, requested, { small = false } = {}) {
  const base = ctx.config.AUDIO_BASE;
  if (!base) return null;
  const { id: clipId, kind } = resolveClip(ctx, requested);
  if (!clipEnabled(ctx, kind)) return null;
  const size = small ? 16 : 20;
  const btn = h('button', { type: 'button', class: 'audio-btn' + (small ? ' small' : ''), 'data-kind': kind, 'aria-label': ctx.t('play.listen'), title: ctx.t('play.listen') });
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!player) { player = new Audio(); player.preload = 'none'; }
    if (playingBtn === btn && !player.paused) { player.pause(); return; }
    player.pause();
    if (playingBtn) playingBtn.classList.remove('playing');
    playingBtn = btn;
    // the deploy version in the query: clips are cached for a week, a recut clip must still reach everyone after a deploy
    player.src = `${base.replace(/\/+$/, '')}/${clipId}.mp3?v=${encodeURIComponent(ctx.config.VERSION || 'dev')}`;
    player.onplay = () => btn.classList.add('playing');
    player.onended = player.onpause = () => btn.classList.remove('playing');
    player.onerror = () => { btn.classList.remove('playing'); toast(ctx.t('play.audioMissing')); };
    player.play().catch(() => { btn.classList.remove('playing'); toast(ctx.t('play.audioMissing')); });
  });
  return btn;
}

/**
 * "Spell it": the word read letter by letter and then whole by a native
 * speaker, when alphabet.json has such a clip (content/spelling-audio.tsv).
 * Null when there is none or the voice setting is off.
 */
export function spellButton(ctx, tib) {
  const map = ctx.data && ctx.data.alphabet && ctx.data.alphabet.spelling;
  const clip = map && (map[tib] || map[String(tib).replace(/་$/, '')]);
  if (!clip) return null;
  const btn = audioButton(ctx, clip, { small: true });
  if (!btn) return null;
  btn.classList.add('spell');
  btn.title = ctx.t('alphabet.spell');
  btn.setAttribute('aria-label', ctx.t('alphabet.spell'));
  btn.append(h('span', { class: 'spell-label' }, ctx.t('alphabet.spell')));
  return btn;
}

/** True while a popover is open (keyboard shortcuts should stay quiet). */
export function popoverOpen() {
  return Boolean(document.querySelector('.popover-backdrop'));
}

export function formatTime(iso, lang) {
  try { return new Date(iso).toLocaleString(lang); } catch { return iso; }
}

/** Text with Tibetan runs wrapped in <span class="tib"> so they get the Tibetan font. */
export function tibText(text) {
  const frag = document.createDocumentFragment();
  const re = /[ༀ-࿿]+/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) frag.append(document.createTextNode(text.slice(last, m.index)));
    frag.append(h('span', { class: 'tib' }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(document.createTextNode(text.slice(last)));
  return frag;
}
