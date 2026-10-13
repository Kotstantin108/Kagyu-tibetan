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
