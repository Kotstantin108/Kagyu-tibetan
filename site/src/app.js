// Entry point: loads data, sets up the store, language, theme and hash router.

import { createStore } from './store.js';
import { makeT, detectLang, STRINGS } from './i18n/index.js';
import { LANGS } from './engine/config.js';
import { setSetting } from './engine/progress.js';
import { h, clear, toast } from './ui.js';
import { renderPlay } from './screens/play.js';
import { renderDict } from './screens/dict.js';
import { renderGrammar } from './screens/grammar.js';
import { renderStats } from './screens/stats.js';
import { renderSettings } from './screens/settings.js';
import { renderSupport } from './screens/support.js';
import { createSync } from './sync.js';

const view = document.getElementById('view');
const store = createStore();

const ctx = {
  store,
  data: null,
  lang: null,
  t: null,
  sync: null,
  param: null,
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
  const btn = document.getElementById('theme-toggle');
  if (btn) { const label = ctx.t('settings.themeToggle'); btn.setAttribute('aria-label', label); btn.title = label; }
}

function effectiveDark() {
  const theme = store.get().settings.theme || 'auto';
  return theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

function applyTheme() {
  const theme = store.get().settings.theme || 'auto';
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const dark = effectiveDark();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#111a2b' : '#182943';
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    if (ctx.t) { const label = ctx.t('settings.themeToggle'); btn.setAttribute('aria-label', label); btn.title = label; }
  }
}

document.getElementById('lang-select').addEventListener('change', (e) => {
  store.update((p) => setSetting(p, 'lang', e.target.value));
});

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = effectiveDark() ? 'light' : 'dark';
  store.update((p) => setSetting(p, 'theme', next));
});

store.subscribe((p, source) => {
  applyTheme();
  if (ctx.lang !== currentLang()) { applyLang(); render(); }
  else if (source === 'sync' || source === 'replace' || source === 'reset') render();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

const screens = { play: renderPlay, dict: renderDict, grammar: renderGrammar, stats: renderStats, settings: renderSettings, support: renderSupport };

function route() {
  const m = location.hash.match(/^#\/(\w+)(?:\/(\w+))?/);
  const name = m && screens[m[1]] ? m[1] : 'play';
  return { name, param: m && screens[m[1]] ? m[2] || null : null };
}

let unmount = null;
function render() {
  if (!ctx.data) return;
  const r = route();
  ctx.param = r.param;
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.route === r.name));
  if (unmount) { try { unmount(); } catch { /* ignore */ } unmount = null; }
  clear(view);
  const res = screens[r.name](view, ctx);
  if (typeof res === 'function') unmount = res;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

async function loadJson(name) {
  const res = await fetch(`./data/${name}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  return res.json();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) toast(ctx.t('updated'), 4000);
      });
    });
  }).catch(() => { /* offline support is optional */ });
}

// Shown only on the old GitHub Pages address while it still serves the app
// (until the redirect replaces it; see README, "Server").
function movingBanner() {
  const newUrl = ctx.config.SITE_URL;
  if (!newUrl || !/\.github\.io$/.test(location.hostname)) return;
  const host = newUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const [before, after] = ctx.t('moving').split('{url}');
  const banner = h('div', { class: 'notice move-banner', role: 'status' }, before, h('a', { href: `${newUrl.replace(/\/+$/, '')}/${location.hash}` }, host), after || '');
  document.querySelector('.header').after(banner);
}

async function main() {
  applyLang();
  applyTheme();
  movingBanner();
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
  registerServiceWorker();
}

main();
