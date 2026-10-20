// The editor page (edit.html): edit the theory texts (content/intro/<lang>.md,
// one section per lesson or alphabet part) or any content/*.tsv file right in
// the GitHub repository, through the password-protected /api/edit/ endpoints
// of report-api (server/report-api/edit-api.mjs). A save is a commit on the
// deploy branch; the deploy workflow rebuilds the data and publishes it, and
// this page watches that run and says when the change is live.

import { splitSections, replaceSection } from './sections.js';

const CONFIG = self.TIB_CONFIG || {};
const API = new URL('/api/edit/', location.href).href; // same origin as the page: nginx proxies /api/ to report-api
const REPO = (CONFIG.REPO_URL || '').replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
const LANGS = ['en', 'ru', 'de', 'fr', 'pl'];
const LANG_NAMES = { en: 'English', ru: 'Русский', de: 'Deutsch', fr: 'Français', pl: 'Polski' };
const PW_KEY = 'tib-edit-password';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') node.className = v; else if (k.startsWith('on')) node.addEventListener(k.slice(2), v); else node.setAttribute(k, v); }
  node.append(...children);
  return node;
};

const state = {
  password: '',
  mode: 'articles',
  lang: 'ru',
  files: [],                 // editable paths in the repository
  cache: new Map(),          // path -> { sha, content }
  current: null,             // { path, id } (id = section id in articles mode, null in files mode)
  original: '',              // the text shown when the current item was opened (for Revert / dirty check)
  names: {},                 // set id -> { lang: name }
  intros: {},                // alphabet part -> { lang: first sentence }
  branch: 'main',
  watching: null,            // commit sha being watched in the deploy workflow
};

// ---- API ----

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${state.password}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }));
  if (!res.ok) { const err = new Error(data.error || `http_${res.status}`); err.status = res.status; throw err; }
  return data;
}

const ERRORS = {
  password: 'Wrong password.',
  rate_limit: 'Too many wrong passwords from this address; try again in an hour.',
  disabled: 'Editing is switched off on the server (no EDIT_PASSWORD).',
  conflict: 'This file changed in the repository since you opened it. Copy your text, reload the file and paste it again.',
  github: 'GitHub did not accept the change. Does the server token have “Contents: write”?',
  not_found: 'File not found in the repository.',
  content: 'The text is empty or too long.',
  path: 'This file cannot be edited here.',
};
const describe = (err) => ERRORS[err.message] || `Error: ${err.message}`;

async function loadFile(path, { fresh = false } = {}) {
  if (!fresh && state.cache.has(path)) return state.cache.get(path);
  const f = await api('GET', `file?path=${encodeURIComponent(path)}`);
  state.cache.set(path, { sha: f.sha, content: f.content });
  return state.cache.get(path);
}

// ---- status lines ----

function status(kind, ...content) {
  const box = $('status');
  box.className = `status${kind ? ` ${kind}` : ''}`;
  box.replaceChildren(...content);
  box.classList.remove('hidden');
}

// ---- login ----

async function login(password, remember) {
  state.password = password;
  const files = await api('GET', 'files');
  state.files = files.files;
  state.branch = files.branch || 'main';
  try { (remember ? localStorage : sessionStorage).setItem(PW_KEY, password); } catch { /* storage may be unavailable */ }
  $('login').classList.add('hidden');
  $('work').classList.remove('hidden');
  $('logout').classList.remove('hidden');
  renderSide();
  watchBuild();
}

function logout() {
  try { localStorage.removeItem(PW_KEY); sessionStorage.removeItem(PW_KEY); } catch { /* ignore */ }
  location.reload();
}

// ---- side panel ----

function renderSide() {
  $('articles-side').classList.toggle('hidden', state.mode !== 'articles');
  $('files-side').classList.toggle('hidden', state.mode !== 'files');
  for (const b of $('modes').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  if (state.mode === 'articles') renderLangs().then(renderSections); else renderFiles();
}

async function renderLangs() {
  const have = LANGS.filter((l) => state.files.includes(`content/intro/${l}.md`));
  if (!have.includes(state.lang)) state.lang = have[0] || 'en';
  $('langs').replaceChildren(...have.map((l) => el('button', { type: 'button', 'aria-pressed': String(l === state.lang), onclick: () => { if (confirmLeave()) { state.lang = l; renderSide(); } } }, LANG_NAMES[l] || l)));
}

function sectionLabel(id) {
  const m = id.match(/^alphabet\/(\d+)$/);
  if (m) {
    const first = ((state.intros[m[1]] || {})[state.lang] || (state.intros[m[1]] || {}).en || '').split(/(?<=[.!?])\s/)[0];
    return `Alphabet, part ${m[1]}${first ? `. ${first}` : ''}`;
  }
  const n = state.names[id] || {};
  return n[state.lang] || n.en || '';
}

async function renderSections() {
  const path = `content/intro/${state.lang}.md`;
  const list = $('sections');
  list.replaceChildren(el('li', { class: 'empty' }, 'Loading…'));
  let file;
  try { file = await loadFile(path); } catch (err) { list.replaceChildren(el('li', { class: 'empty' }, describe(err))); return; }
  const doc = splitSections(file.content);
  list.replaceChildren(...doc.sections.map((s) => el('li', {}, el('button', {
    type: 'button',
    'aria-current': String(!!state.current && state.current.path === path && state.current.id === s.id),
    onclick: () => openSection(path, s.id),
  }, el('span', { class: 'id' }, s.id), el('span', { class: 'name' }, sectionLabel(s.id))))));
}

function renderFiles() {
  $('files').replaceChildren(...state.files.map((p) => el('li', {}, el('button', {
    type: 'button',
    'aria-current': String(!!state.current && state.current.path === p && state.current.id === null),
    onclick: () => openRaw(p),
  }, el('span', { class: 'name' }, p.replace(/^content\//, ''))))));
}

// ---- the editing pane ----

function isDirty() { return !$('pane').classList.contains('hidden') && $('text').value !== state.original; }
function confirmLeave() { return !isDirty() || confirm('You have unsaved changes. Leave them?'); }

function show(path, id, text, title) {
  state.current = { path, id };
  state.original = text;
  $('empty').classList.add('hidden');
  $('pane').classList.remove('hidden');
  $('title').textContent = title;
  $('path').textContent = `${path}${id ? ` · ## ${id}` : ''}`;
  const open = $('open');
  if (id) { open.href = `./#/course/${id}/theory`; open.classList.remove('hidden'); } else open.classList.add('hidden');
  const ta = $('text');
  ta.classList.toggle('raw', !id);
  ta.value = text;
  $('note').value = '';
  $('status').classList.add('hidden');
  ta.focus();
  renderSide();
}

async function openSection(path, id) {
  if (!confirmLeave()) return;
  try {
    const file = await loadFile(path);
    const s = splitSections(file.content).sections.find((x) => x.id === id);
    show(path, id, s ? s.body : '', `${sectionLabel(id) || id} · ${LANG_NAMES[state.lang] || state.lang}`);
  } catch (err) { status('bad', describe(err)); }
}

async function openRaw(path) {
  if (!confirmLeave()) return;
  try {
    const file = await loadFile(path);
    show(path, null, file.content, path.replace(/^content\//, ''));
  } catch (err) { status('bad', describe(err)); }
}

async function save() {
  if (!state.current || $('save').disabled) return;
  const { path, id } = state.current;
  const text = $('text').value;
  if (text === state.original) { status('', 'Nothing changed.'); return; }
  if (id && !text.trim()) { status('bad', 'The section is empty.'); return; }
  const file = state.cache.get(path);
  const content = id ? replaceSection(file.content, id, text) : text.replace(/\r\n?/g, '\n');
  const note = $('note').value.trim() || (id ? `${id} (${state.lang})` : '');
  $('save').disabled = true;
  status('', 'Saving…');
  try {
    const out = await api('PUT', 'file', { path, sha: file.sha, content, message: note });
    state.cache.set(path, { sha: out.sha, content });
    state.original = id ? (splitSections(content).sections.find((x) => x.id === id) || { body: '' }).body : content;
    $('text').value = state.original;
    const short = out.commit.sha.slice(0, 7);
    status('good', 'Saved as commit ', el('a', { href: out.commit.url, target: '_blank', rel: 'noopener' }, short), '. The site rebuilds in a few minutes; the build status is in the header.');
    state.watching = out.commit.sha;
    watchBuild();
  } catch (err) {
    status('bad', describe(err));
    if (err.message === 'conflict') state.cache.delete(path);
  } finally { $('save').disabled = false; }
}

function revert() {
  if (!state.current) return;
  if (!isDirty() || confirm('Discard your changes to this text?')) { $('text').value = state.original; $('status').classList.add('hidden'); }
}

// ---- the deploy workflow: latest run on the branch, and whether the watched commit is live ----
// Polled every 20 s while a run is in progress or a saved commit is awaited, at most 45 times
// per start (the unauthenticated GitHub API allows 60 requests an hour per address).

let buildTimer = null;
let polls = 0;
async function watchBuild(again = false) {
  clearTimeout(buildTimer);
  if (!again) polls = 0;
  const box = $('build');
  if (!REPO || polls++ >= 45) return;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/runs?branch=${encodeURIComponent(state.branch)}&per_page=1`, { headers: { Accept: 'application/vnd.github+json' } });
    const run = res.ok ? ((await res.json()).workflow_runs || [])[0] : null;
    if (!run) { box.textContent = ''; return; }
    const short = run.head_sha.slice(0, 7);
    const link = el('a', { href: run.html_url, target: '_blank', rel: 'noopener' }, short);
    let live = false;
    if (run.status === 'completed' && run.conclusion === 'success') {
      const cfg = await fetch(`./config.js?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()).catch(() => '');
      live = cfg.includes(`VERSION: '${short}'`);
    }
    const word = run.status !== 'completed' ? `build ${run.status.replace('_', ' ')}` : run.conclusion === 'success' ? (live ? 'live' : 'built, publishing') : `build ${run.conclusion}`;
    box.replaceChildren(`Latest deploy: ${word} · `, link);
    const mine = state.watching && run.head_sha === state.watching;
    const done = run.status === 'completed' && (live || run.conclusion !== 'success');
    if (mine && done) {
      if (run.conclusion !== 'success') status('bad', 'The build of your change failed; the site was not updated. See the run: ', el('a', { href: run.html_url, target: '_blank', rel: 'noopener' }, 'GitHub Actions'), '.');
      else status('good', 'Your change is live. ', el('a', { href: $('open').href, target: '_blank', rel: 'noopener' }, 'Open it in the app'), ' (reload the app if it was open).');
      state.watching = null;
    }
    if (state.watching || run.status !== 'completed') buildTimer = setTimeout(() => watchBuild(true), 20_000);
  } catch { box.textContent = ''; }
}

// ---- boot ----

async function boot() {
  try {
    const [sets, alphabet] = await Promise.all([
      fetch('./data/sets.json').then((r) => r.json()),
      fetch('./data/alphabet.json').then((r) => r.json()),
    ]);
    for (const s of sets) state.names[s.id] = s.name || {};
    state.intros = alphabet.intros || {};
  } catch { /* labels are a convenience */ }

  $('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = $('login-status');
    box.classList.add('hidden');
    try { await login($('password').value, $('remember').checked); } catch (err) { box.className = 'status bad'; box.textContent = describe(err); }
  });
  $('logout').addEventListener('click', logout);
  $('modes').addEventListener('click', (e) => { const b = e.target.closest('button[data-mode]'); if (b && confirmLeave()) { state.mode = b.dataset.mode; renderSide(); } });
  $('save').addEventListener('click', save);
  $('revert').addEventListener('click', revert);
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } });
  window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  let saved = '';
  try { saved = localStorage.getItem(PW_KEY) || sessionStorage.getItem(PW_KEY) || ''; } catch { /* ignore */ }
  if (saved) {
    let remembered = false;
    try { remembered = !!localStorage.getItem(PW_KEY); } catch { /* ignore */ }
    try { await login(saved, remembered); } catch (err) {
      if (err.status === 401) { try { localStorage.removeItem(PW_KEY); sessionStorage.removeItem(PW_KEY); } catch { /* ignore */ } }
      const box = $('login-status');
      box.className = 'status bad';
      box.textContent = describe(err);
    }
  }
}

boot();
