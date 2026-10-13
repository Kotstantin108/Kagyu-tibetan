// Optional Google Drive sync (appDataFolder). The app works fully without it.
//
// - Google Identity Services token client, scope drive.appdata only
// - progress.json in the appDataFolder
// - sync on sign-in, on tab focus, and debounced after changes
// - the access token (valid for an hour) is kept in localStorage, so a reload
//   does not ask Google again; automatic syncs (page load, tab focus, after
//   changes) never open the Google window: without a valid token they set the
//   status to "paused" and the learner signs in again from Settings
// - a 401 from Drive drops the token and pauses in the same way

import { mergeProgress } from './engine/merge.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'progress.json';
const ENABLED_KEY = 'tib-sync-enabled';
const TOKEN_KEY = 'tib-sync-token';
const GSI_SRC = 'https://accounts.google.com/gsi/client';
const DEBOUNCE_MS = 4000;

export function createSync(ctx) {
  const clientId = ctx.config.GOOGLE_CLIENT_ID;
  const listeners = new Set();
  const st = { status: 'off', lastSync: null };
  let token = null;        // { value, expiresAt }
  let tokenClient = null;
  let fileId = null;
  let timer = null;
  let busy = false;
  let pendingResolve = null;

  const enabled = () => { try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; } };
  const setEnabled = (v) => { try { v ? localStorage.setItem(ENABLED_KEY, '1') : localStorage.removeItem(ENABLED_KEY); } catch { /* ignore */ } };
  const loadToken = () => { try { const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); return t && t.value && t.expiresAt > Date.now() ? t : null; } catch { return null; } };
  const saveToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, JSON.stringify(t)) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } };
  const validToken = () => (token && token.expiresAt > Date.now() ? token.value : null);
  token = loadToken();
  const emit = () => { for (const fn of listeners) fn(st); };
  const setStatus = (status) => { st.status = status; emit(); };

  if (!clientId) {
    return { isEnabled: () => false, state: () => st, subscribe: () => () => {}, signIn() {}, signOut() {}, syncNow() {} };
  }

  function loadGsi() {
    if (window.google && window.google.accounts) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GSI_SRC; s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = () => reject(new Error('gsi'));
      document.head.append(s);
    });
  }

  async function ensureClient() {
    await loadGsi();
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => {
          const resolve = pendingResolve; pendingResolve = null;
          if (resp && resp.access_token) {
            token = { value: resp.access_token, expiresAt: Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000 };
            saveToken(token);
            resolve && resolve(token.value);
          } else {
            resolve && resolve(null);
          }
        },
        error_callback: () => { const r = pendingResolve; pendingResolve = null; r && r(null); },
      });
    }
    return tokenClient;
  }

  /**
   * Get an access token. `auto` (page load, focus, debounce) never opens the
   * Google window: it only returns a still-valid token or null. A user action
   * (sign in, sync now) may open it; `prompt: ''` lets Google close it by
   * itself when the account has already consented.
   */
  async function getToken({ auto = true, consent = false } = {}) {
    const cached = validToken();
    if (cached) return cached;
    if (auto) return null;
    const client = await ensureClient();
    return new Promise((resolve) => {
      pendingResolve = resolve;
      try { client.requestAccessToken({ prompt: consent ? 'consent' : '' }); } catch { resolve(null); }
    });
  }

  async function api(path, opts = {}) {
    const tok = validToken();
    if (!tok) throw new Error('no-token');
    const res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${tok}` } });
    if (res.status === 401) { token = null; saveToken(null); throw new Error('no-token'); }
    if (!res.ok) throw new Error(`drive ${res.status}`);
    return res;
  }

  async function findFile() {
    if (fileId) return fileId;
    const res = await api(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=${encodeURIComponent(`name='${FILE_NAME}'`)}`);
    const json = await res.json();
    const f = (json.files || [])[0];
    fileId = f ? f.id : null;
    return fileId;
  }

  async function download() {
    const id = await findFile();
    if (!id) return null;
    const res = await api(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`);
    try { return await res.json(); } catch { return null; }
  }

  async function upload(progress) {
    const body = JSON.stringify(progress);
    const id = await findFile();
    if (id) {
      await api(`https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      return;
    }
    const boundary = 'tibsync' + Math.random().toString(36).slice(2);
    const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const res = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
    const json = await res.json();
    fileId = json.id || null;
  }

  async function sync(auto = true) {
    if (!enabled() || busy) return;
    if (auto && !validToken()) { setStatus('paused'); return; }
    busy = true;
    setStatus('syncing');
    try {
      const remote = await download();
      const local = ctx.store.get();
      const merged = mergeProgress(local, remote);
      const mergedStr = JSON.stringify(merged);
      if (mergedStr !== JSON.stringify(local)) ctx.store.replace(merged, 'sync');
      if (!remote || mergedStr !== JSON.stringify(mergeProgress(remote, remote))) await upload(merged);
      st.lastSync = new Date().toISOString();
      setStatus('synced');
    } catch (err) {
      console.warn('sync failed', err);
      setStatus(err && err.message === 'no-token' ? 'paused' : 'error');
    } finally {
      busy = false;
    }
  }

  function schedule() {
    if (!enabled()) return;
    clearTimeout(timer);
    timer = setTimeout(() => sync(true), DEBOUNCE_MS);
  }

  ctx.store.subscribe((p, source) => { if (source !== 'sync') schedule(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && enabled()) sync(true); });

  if (enabled()) {
    // continue with the stored token; without one the status is "paused" until the learner signs in again
    st.status = validToken() ? 'syncing' : 'paused';
    sync(true);
  }

  return {
    isEnabled: enabled,
    state: () => st,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async signIn() {
      setStatus('syncing');
      // first sign-in shows Google's consent screen; a repeat (token expired) only re-confirms the account
      const tok = await getToken({ auto: false, consent: !enabled() });
      if (!tok) { setStatus(enabled() ? 'paused' : 'off'); return; }
      setEnabled(true);
      await sync(false);
    },
    signOut() {
      setEnabled(false);
      try { if (token && window.google) window.google.accounts.oauth2.revoke(token.value, () => {}); } catch { /* ignore */ }
      token = null; saveToken(null); fileId = null;
      setStatus('off');
    },
    async syncNow() {
      if (!validToken()) { const tok = await getToken({ auto: false }); if (!tok) { setStatus('paused'); return; } }
      return sync(false);
    },
  };
}
