// Optional Google Drive sync (appDataFolder). The app works fully without it.
//
// - Google Identity Services token client, scope drive.appdata only
// - progress.json in the appDataFolder
// - sync on sign-in, on tab focus, and debounced after changes
// - an expired token is re-requested silently; if that fails the status is
//   "paused" and local work continues

import { mergeProgress } from './engine/merge.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE_NAME = 'progress.json';
const ENABLED_KEY = 'tib-sync-enabled';
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

  /** Get an access token; silent=true never shows a prompt. */
  async function getToken(silent) {
    if (token && token.expiresAt > Date.now()) return token.value;
    const client = await ensureClient();
    return new Promise((resolve) => {
      pendingResolve = resolve;
      try { client.requestAccessToken({ prompt: silent ? '' : 'consent' }); } catch { resolve(null); }
    });
  }

  async function api(path, opts = {}, silent = true) {
    let tok = await getToken(silent);
    if (!tok) throw new Error('no-token');
    let res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${tok}` } });
    if (res.status === 401) {
      token = null;
      tok = await getToken(true);
      if (!tok) throw new Error('no-token');
      res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${tok}` } });
    }
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

  async function sync(silent = true) {
    if (!enabled() || busy) return;
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
    void silent;
  }

  function schedule() {
    if (!enabled()) return;
    clearTimeout(timer);
    timer = setTimeout(() => sync(true), DEBOUNCE_MS);
  }

  ctx.store.subscribe((p, source) => { if (source !== 'sync') schedule(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && enabled()) sync(true); });

  if (enabled()) {
    st.status = 'syncing';
    // try to continue silently
    sync(true);
  }

  return {
    isEnabled: enabled,
    state: () => st,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async signIn() {
      setStatus('syncing');
      const tok = await getToken(false);
      if (!tok) { setStatus('off'); return; }
      setEnabled(true);
      await sync(false);
    },
    signOut() {
      setEnabled(false);
      try { if (token && window.google) window.google.accounts.oauth2.revoke(token.value, () => {}); } catch { /* ignore */ }
      token = null; fileId = null;
      setStatus('off');
    },
    syncNow() { return sync(false); },
  };
}
