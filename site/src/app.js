// Entry point: loads data, sets up the store, language and hash router.

import { createStore } from './store.js';
import { makeT, detectLang, STRINGS } from './i18n/index.js';
import { LANGS } from './engine/config.js';
import { setSetting } from './engine/progress.js';
import { h, clear } from './ui.js';
import { renderPlay } from './screens/play.js';
import { renderDict } from './screens/dict.js';
import { renderStats } from './screens/stats.js';
import { renderSettings } from './screens/settings.js';
import { createSync } from './sync.js';

const view = document.getElementById('view');
const store = createStore();

const ctx = {
  store,
  data: null,
  lang: null,
  t: null,
  sync: null,
  config: (window.TIB_CONFIG || {}),
  navigate(route) { location.hash = `#/${route}`; },
};

function currentLang() {
  const saved = store.get().settings.lang;
  return LANGS.includes(saved) ? saved : detectLang(navigator.language);
}

function applyLang() {
  ctx.lang = currentLang();
  ctx.t = makeT(ctx.lang);
  document.documentElement.lang = ctx.lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = ctx.t(el.dataset.i18n); });
  const sel = document.getElementById('lang-select');
  if (sel.options.length !== LANGS.length) {
    clear(sel);
    for (const l of LANGS) sel.append(h('option', { value: l }, STRINGS[l].langName));
  }
  sel.value = ctx.lang;
}

document.getElementById('lang-select').addEventListener('change', (e) => {
  store.update((p) => setSetting(p, 'lang', e.target.value));
});

store.subscribe((p, source) => {
  if (ctx.lang !== currentLang()) { applyLang(); render(); }
  else if (source === 'sync' || source === 'replace' || source === 'reset') render();
});

const screens = { play: renderPlay, dict: renderDict, stats: renderStats, settings: renderSettings };

function route() {
  const m = location.hash.match(/^#\/(\w+)/);
  return m && screens[m[1]] ? m[1] : 'play';
}

let unmount = null;
function render() {
  if (!ctx.data) return;
  const r = route();
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.route === r));
  if (unmount) { try { unmount(); } catch { /* ignore */ } unmount = null; }
  clear(view);
  const res = screens[r](view, ctx);
  if (typeof res === 'function') unmount = res;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

async function loadJson(name) {
  const res = await fetch(`./data/${name}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.json();
}

async function main() {
  applyLang();
  try {
    const [words, sentences, sets] = await Promise.all([loadJson('words.json'), loadJson('sentences.json'), loadJson('sets.json')]);
    sets.sort((a, b) => a.order - b.order);
    ctx.data = { words, sentences, sets };
  } catch (err) {
    console.error(err);
    clear(view).append(h('p', { class: 'feedback bad' }, ctx.t('loadError')));
    return;
  }
  ctx.sync = createSync(ctx);
  if (!location.hash) location.hash = '#/play';
  render();
}

main();
