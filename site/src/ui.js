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
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); dismiss(); } };
  const close = () => { backdrop.remove(); document.removeEventListener('keydown', onKey, true); };
  const dismiss = () => { close(); if (onDismiss) onDismiss(); };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) dismiss(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(backdrop);
  const focusable = box.querySelector('button, [href], input, select, textarea');
  if (focusable) setTimeout(() => focusable.focus(), 0);
  return close;
}

// ---- pronunciation clips (synthesised, see README "Audio") ----
let player = null;
let playingBtn = null;

/**
 * A round "listen" button for a word (`w-<id>`) or a sentence (`s123`).
 * Returns null when AUDIO_BASE is not configured. Clips are fetched on demand.
 */
export function audioButton(ctx, clipId, { small = false } = {}) {
  const base = ctx.config.AUDIO_BASE;
  if (!base) return null;
  const size = small ? 16 : 20;
  const btn = h('button', { type: 'button', class: 'audio-btn' + (small ? ' small' : ''), 'aria-label': ctx.t('play.listen'), title: ctx.t('play.listen') });
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!player) { player = new Audio(); player.preload = 'none'; }
    if (playingBtn === btn && !player.paused) { player.pause(); return; }
    player.pause();
    if (playingBtn) playingBtn.classList.remove('playing');
    playingBtn = btn;
    player.src = `${base.replace(/\/+$/, '')}/${clipId}.mp3`;
    player.onplay = () => btn.classList.add('playing');
    player.onended = player.onpause = () => btn.classList.remove('playing');
    player.onerror = () => { btn.classList.remove('playing'); toast(ctx.t('play.audioMissing')); };
    player.play().catch(() => { btn.classList.remove('playing'); toast(ctx.t('play.audioMissing')); });
  });
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
