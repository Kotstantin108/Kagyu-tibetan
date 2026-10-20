// edit-api: the server side of the editor page (site/edit.html). Lets a person
// who knows the editor password read and change the course's source files
// (content/intro/<lang>.md, content/*.tsv) straight in the GitHub repository.
// Every save is a commit on the deploy branch, so the deploy workflow rebuilds
// the course data and publishes it, and the working copy on any computer gets
// the change with `git pull`. Nothing is stored on the server.
//
// Mounted by report-api.mjs under /api/edit/. Configuration (environment):
//   EDIT_PASSWORD      the editor password; empty = editing disabled (503)
//   EDIT_GITHUB_TOKEN  fine-grained PAT with Contents: write on the repository (default: GITHUB_TOKEN)
//   EDIT_BRANCH        branch the commits go to, default main
//
// All requests need `Authorization: Bearer <password>`; ten wrong passwords an hour per address lock that address out.
//   GET /api/edit/files              -> { ok, branch, files: [path…] }      editable files that exist in the repository
//   GET /api/edit/file?path=<path>   -> { ok, path, sha, content }
//   PUT /api/edit/file  { path, sha, content, message }
//                                    -> { ok, sha, commit: { sha, url } }    sha = the new file sha, for the next save
//                                    -> 409 { ok: false, error: 'conflict' } the file changed on GitHub since it was read: reload
//   errors: 401 password, 403 path, 400 bad_json/path/sha/content/message, 413 too_large, 429 rate_limit, 502 github, 503 disabled

import { createHash, timingSafeEqual } from 'node:crypto';

/** Files the editor may touch: the theory texts and the TSV tables, nothing else. */
export const EDITABLE_RE = /^content\/(intro\/[a-z]{2}\.md|[a-z0-9-]+\.tsv)$/;
export const EDIT_LIMITS = { bodyMax: 1.5 * 1024 * 1024, contentMax: 1024 * 1024, messageMax: 200, wrongPerHour: 10 };

/** Constant-time password check (both sides hashed so the length does not leak). */
export function checkPassword(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const h = (s) => createHash('sha256').update(s, 'utf8').digest();
  return timingSafeEqual(h(given), h(expected));
}

/** The password from an `Authorization: Bearer …` header, or ''. */
export function bearer(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

/** Validate a PUT body; returns { ok: true, edit } or { ok: false, error }. */
export function validateEdit(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_json' };
  const path = String(body.path || '');
  if (!EDITABLE_RE.test(path)) return { ok: false, error: 'path' };
  const sha = String(body.sha || '');
  if (!/^[0-9a-f]{40}$/.test(sha)) return { ok: false, error: 'sha' };
  if (typeof body.content !== 'string' || !body.content.trim() || body.content.length > EDIT_LIMITS.contentMax) return { ok: false, error: 'content' };
  const content = body.content.replace(/\r\n?/g, '\n');
  const message = String(body.message || '').replace(/\s+/g, ' ').trim().slice(0, EDIT_LIMITS.messageMax);
  return { ok: true, edit: { path, sha, content, message } };
}

/** The commit message of a save: "Edit <path>" plus the editor's note, if any. */
export function commitMessage(edit) {
  const what = edit.path.replace(/^content\//, '');
  return edit.message ? `Edit ${what}: ${edit.message}\n\nSaved from the editor page.` : `Edit ${what}\n\nSaved from the editor page.`;
}

/** GitHub Contents API for one repository and branch. */
export function makeContents({ token, repo, branch = 'main', fetchFn = fetch }) {
  const base = `https://api.github.com/repos/${repo}/contents/`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'tibetan-edit-api', 'Content-Type': 'application/json' };
  async function call(method, path, body, query = '') {
    const res = await fetchFn(`${base}${path}${query}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const err = new Error(`GitHub ${method} ${path}: ${res.status} ${data.message || ''}`); err.status = res.status; throw err; }
    return data;
  }
  return {
    branch,
    /** Editable files present in the repository, sorted. */
    async list() {
      const top = await call('GET', 'content', null, `?ref=${encodeURIComponent(branch)}`);
      const intro = await call('GET', 'content/intro', null, `?ref=${encodeURIComponent(branch)}`).catch(() => []);
      return [...top, ...intro].filter((e) => e.type === 'file' && EDITABLE_RE.test(e.path)).map((e) => e.path).sort();
    },
    /** { sha, content } of a file. */
    async get(path) {
      const data = await call('GET', path, null, `?ref=${encodeURIComponent(branch)}`);
      if (data.encoding !== 'base64') throw new Error(`GitHub GET ${path}: unexpected encoding ${data.encoding}`);
      return { sha: data.sha, content: Buffer.from(data.content, 'base64').toString('utf8') };
    },
    /** Commit new content; `sha` must be the file's current sha (409 otherwise). Returns { sha, commit: { sha, url } }. */
    async put(path, content, sha, message) {
      const data = await call('PUT', path, { message, content: Buffer.from(content, 'utf8').toString('base64'), sha, branch });
      return { sha: data.content.sha, commit: { sha: data.commit.sha, url: data.commit.html_url } };
    },
  };
}

/**
 * Handle one /api/edit/* request. `ctx`: { password, contents, wrong: RateLimiter of wrong passwords, readJson, send, ip, log }.
 * `send(status, data)` and `readJson(max)` are bound to the response/request by the caller.
 */
export async function handleEdit(req, url, ctx) {
  const { password, contents, wrong, readJson, send, ip, log = () => {} } = ctx;
  if (!password || !contents) return send(503, { ok: false, error: 'disabled' });
  if (!checkPassword(bearer(req), password)) {
    if (!wrong.allow(ip)) return send(429, { ok: false, error: 'rate_limit' });
    return send(401, { ok: false, error: 'password' });
  }
  try {
    if (req.method === 'GET' && url.pathname === '/api/edit/files') {
      return send(200, { ok: true, branch: contents.branch, files: await contents.list() });
    }
    if (req.method === 'GET' && url.pathname === '/api/edit/file') {
      const path = url.searchParams.get('path') || '';
      if (!EDITABLE_RE.test(path)) return send(403, { ok: false, error: 'path' });
      const f = await contents.get(path);
      return send(200, { ok: true, path, sha: f.sha, content: f.content });
    }
    if (req.method === 'PUT' && url.pathname === '/api/edit/file') {
      let body;
      try { body = await readJson(EDIT_LIMITS.bodyMax); } catch (err) { return send(err.message === 'too_large' ? 413 : 400, { ok: false, error: err.message }); }
      const v = validateEdit(body);
      if (!v.ok) return send(v.error === 'path' ? 403 : 400, { ok: false, error: v.error });
      const out = await contents.put(v.edit.path, v.edit.content, v.edit.sha, commitMessage(v.edit));
      log(`edit ${v.edit.path} -> ${out.commit.sha.slice(0, 7)}`);
      return send(200, { ok: true, sha: out.sha, commit: out.commit });
    }
    return send(404, { ok: false, error: 'not_found' });
  } catch (err) {
    if (err.status === 409 || (err.status === 422 && /sha/i.test(err.message))) return send(409, { ok: false, error: 'conflict' });
    log(`github error: ${err.message}`);
    return send(err.status === 404 ? 404 : 502, { ok: false, error: err.status === 404 ? 'not_found' : 'github' });
  }
}
