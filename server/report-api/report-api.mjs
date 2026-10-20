// report-api: files a GitHub issue for a "report a problem" sent from the app,
// so that users without a GitHub account can report a wrong sentence or word.
//
// One file, no dependencies, Node >= 20. Listens on 127.0.0.1:8091 behind nginx
// (`location /api/`). Configuration comes from the environment (systemd unit
// reads /etc/report-api.env):
//   GITHUB_TOKEN     fine-grained PAT, Issues: write on the repository (required)
//   GITHUB_REPO      owner/name, default Kotstantin108/Kagyu-tibetan
//   ALLOWED_ORIGINS  comma-separated, default https://tibetan.itjoy.space
//   HOST, PORT       default 127.0.0.1, 8091
//
// POST /api/report  { kind: 'sentence'|'word'|'app', category: 'translation'|'bug'|'idea',
//                     id, tib, translation, lang, message, page, website }
//   -> 200 { ok: true, url }   (url of the issue, or of the comment when the id already has an open issue)
//   -> 400 { ok: false, error }  invalid input
//   -> 429 { ok: false, error: 'rate_limit' }  more than 5 reports an hour from one address
//   -> 502 { ok: false, error: 'github' }  GitHub did not accept it
// GET  /api/health  -> 200 { ok: true }
// /api/edit/*       the editor page's API (password-protected edits of the course sources, see edit-api.mjs);
//                   enabled by EDIT_PASSWORD, commits with EDIT_GITHUB_TOKEN (default GITHUB_TOKEN) to EDIT_BRANCH (main)
//
// Spam protection: 5 requests per hour per IP (in memory), the hidden `website`
// field must stay empty, and one issue per sentence/word per day: an open issue
// with the same title gets a comment instead of a duplicate. Labels: translation
// -> content, bug -> bug, idea -> enhancement.

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { handleEdit, makeContents, EDIT_LIMITS } from './edit-api.mjs';

export const LIMITS = { messageMin: 10, messageMax: 2000, tibMax: 400, translationMax: 1000, bodyMax: 16 * 1024, perHour: 5 };
const ID_RE = /^[a-z0-9'\-.]+$/;
export const CATEGORIES = { translation: { label: 'content', title: 'Translation' }, bug: { label: 'bug', title: 'Bug' }, idea: { label: 'enhancement', title: 'Idea' } };
const LANG_RE = /^[a-z]{2}$/;

/** Validate and normalise a report; returns { ok: true, report } or { ok: false, error }. */
export function validateReport(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_json' };
  if (typeof body.website === 'string' && body.website.trim()) return { ok: false, error: 'spam' };
  const kind = ['word', 'sentence', 'app'].includes(body.kind) ? body.kind : null;
  if (!kind) return { ok: false, error: 'kind' };
  const id = kind === 'app' ? 'app' : String(body.id || '');
  if (!ID_RE.test(id) || id.length > 80) return { ok: false, error: 'id' };
  const category = Object.hasOwn(CATEGORIES, body.category) ? body.category : kind === 'app' ? 'bug' : 'translation';
  const message = String(body.message || '').replace(/\r\n?/g, '\n').trim();
  if (message.length < LIMITS.messageMin || message.length > LIMITS.messageMax) return { ok: false, error: 'message' };
  const clip = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const tib = clip(body.tib, LIMITS.tibMax);
  const translation = clip(body.translation, LIMITS.translationMax);
  const lang = LANG_RE.test(String(body.lang || '')) ? String(body.lang) : 'en';
  const page = clip(body.page, 200);
  return { ok: true, report: { kind, category, id, tib, translation, lang, message, page } };
}

export function issueTitle(r) {
  if (r.kind === 'app') {
    const first = r.message.split('\n')[0].trim().replace(/\s+/g, ' ');
    return `${CATEGORIES[r.category].title}: ${first.length > 70 ? first.slice(0, 69).trimEnd() + '…' : first}`;
  }
  return r.kind === 'word' ? `Word ${r.id}: ${r.tib}` : `Sentence ${r.id}: ${r.tib}`;
}

export function issueLabels(r) {
  return [CATEGORIES[r.category].label];
}

export function issueBody(r, { comment = false } = {}) {
  const lines = [];
  if (comment) lines.push('Another report for the same item:', '');
  lines.push(
    `**Type:** ${CATEGORIES[r.category].title}`,
    r.kind !== 'app' ? `**${r.kind === 'word' ? 'Word' : 'Sentence'} id:** ${r.id}` : null,
    r.kind !== 'app' ? `**Tibetan:** ${r.tib}` : null,
    r.kind !== 'app' ? `**Translation (${r.lang}):** ${r.translation}` : `**Language:** ${r.lang}`,
    r.page ? `**Page:** ${r.page}` : null,
    '',
    '**What is wrong:**',
    '',
    r.message.split('\n').map((l) => `> ${l}`).join('\n'),
    '',
    '_Sent from the app via report-api._',
  );
  return lines.filter((l) => l !== null).join('\n');
}

/** Sliding one-hour window per key, kept in memory. */
export class RateLimiter {
  constructor(limit = LIMITS.perHour, windowMs = 3600_000) { this.limit = limit; this.windowMs = windowMs; this.hits = new Map(); this.sweptAt = 0; }
  /** True when the request is allowed; records it. */
  allow(key, now = Date.now()) {
    const since = now - this.windowMs;
    const list = (this.hits.get(key) || []).filter((t) => t > since);
    if (list.length >= this.limit) { this.hits.set(key, list); return false; }
    list.push(now);
    this.hits.set(key, list);
    // drop idle keys when the map is big, at most once a minute so a flood of new keys cannot make every request scan it
    if (this.hits.size > 10_000 && now - this.sweptAt > 60_000) {
      this.sweptAt = now;
      for (const [k, v] of this.hits) if (!v.some((t) => t > since)) this.hits.delete(k);
    }
    return true;
  }
}

/** One issue per id per day: remembers the issue created for an id (in memory). */
export class DailyIndex {
  constructor() { this.map = new Map(); }
  get(id, now = Date.now()) { const e = this.map.get(id); return e && now - e.at < 86_400_000 ? e : null; }
  set(id, number, url, now = Date.now()) {
    this.map.set(id, { number, url, at: now });
    if (this.map.size > 10_000) for (const [k, e] of this.map) if (now - e.at >= 86_400_000) this.map.delete(k);
  }
}

export function makeGitHub({ token, repo, fetchFn = fetch }) {
  const base = 'https://api.github.com';
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'tibetan-report-api', 'Content-Type': 'application/json' };
  async function call(method, path, body) {
    const res = await fetchFn(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} ${data.message || ''}`);
    return data;
  }
  return {
    /** Open issue with this exact title, or null. */
    async findOpen(title) {
      const q = `repo:${repo} is:issue is:open in:title "${title.replace(/"/g, ' ')}"`;
      const data = await call('GET', `/search/issues?per_page=5&q=${encodeURIComponent(q)}`);
      const hit = (data.items || []).find((it) => it.title === title);
      return hit ? { number: hit.number, url: hit.html_url } : null;
    },
    async createIssue(title, body, labels = ['content']) {
      const it = await call('POST', `/repos/${repo}/issues`, { title, body, labels });
      return { number: it.number, url: it.html_url };
    },
    async comment(number, body) {
      const c = await call('POST', `/repos/${repo}/issues/${number}/comments`, { body });
      return { url: c.html_url };
    },
  };
}

/** File the report: a comment when the id already has an open issue (or one from today), otherwise a new issue. */
export async function fileReport(report, { github, index, log = () => {} }) {
  const title = issueTitle(report);
  // one issue per item per day: sentences and words are deduplicated, general reports never are
  let existing = report.kind === 'app' ? null : index.get(report.id);
  if (!existing && report.kind !== 'app') {
    try { existing = await github.findOpen(title); } catch (err) { log(`search failed: ${err.message}`); }
  }
  if (existing) {
    const c = await github.comment(existing.number, issueBody(report, { comment: true }));
    index.set(report.id, existing.number, existing.url);
    return { url: c.url, duplicate: true };
  }
  const it = await github.createIssue(title, issueBody(report), issueLabels(report));
  if (report.kind !== 'app') index.set(report.id, it.number, it.url);
  return { url: it.url, duplicate: false };
}

function readJson(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > max) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch { reject(new Error('bad_json')); } });
    req.on('error', reject);
  });
}

/**
 * The HTTP server. `edit` (optional): { password, contents } from edit-api.mjs; without it /api/edit/* answers 503.
 * Wrong editor passwords are limited per address with `wrongLimiter` (ten an hour by default).
 */
export function createServer({ github, allowedOrigins, limiter = new RateLimiter(), index = new DailyIndex(), log = console.log, edit = null, wrongLimiter = new RateLimiter(EDIT_LIMITS.wrongPerHour) }) {
  const send = (res, status, data, origin) => {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers.Vary = 'Origin'; }
    res.writeHead(status, headers);
    res.end(JSON.stringify(data));
  };
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const origin = req.headers.origin;
    const allowed = origin && allowedOrigins.includes(origin) ? origin : null;
    if (origin && !allowed) return send(res, 403, { ok: false, error: 'origin' });
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': allowed || '', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600', Vary: 'Origin' });
      return res.end();
    }
    const ip = String(req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress || '').trim();
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true }, allowed);
    if (url.pathname.startsWith('/api/edit/')) {
      return handleEdit(req, url, { password: edit && edit.password, contents: edit && edit.contents, wrong: wrongLimiter, ip, log, send: (status, data) => send(res, status, data, allowed), readJson: (max) => readJson(req, max) });
    }
    if (req.method !== 'POST' || url.pathname !== '/api/report') return send(res, 404, { ok: false, error: 'not_found' }, allowed);
    if (!limiter.allow(ip)) return send(res, 429, { ok: false, error: 'rate_limit' }, allowed);
    let body;
    try { body = await readJson(req, LIMITS.bodyMax); } catch (err) { return send(res, err.message === 'too_large' ? 413 : 400, { ok: false, error: err.message }, allowed); }
    const v = validateReport(body);
    if (!v.ok) return send(res, v.error === 'spam' ? 200 : 400, v.error === 'spam' ? { ok: true, url: '' } : { ok: false, error: v.error }, allowed);
    try {
      const out = await fileReport(v.report, { github, index, log });
      log(`${v.report.kind} ${v.report.id} -> ${out.url}${out.duplicate ? ' (comment)' : ''}`);
      return send(res, 200, { ok: true, url: out.url }, allowed);
    } catch (err) {
      log(`github error: ${err.message}`);
      return send(res, 502, { ok: false, error: 'github' }, allowed);
    }
  });
}

function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) { console.error('GITHUB_TOKEN is not set'); process.exit(1); }
  const repo = process.env.GITHUB_REPO || 'Kotstantin108/Kagyu-tibetan';
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://tibetan.itjoy.space').split(',').map((s) => s.trim()).filter(Boolean);
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8091);
  const password = process.env.EDIT_PASSWORD || '';
  const branch = process.env.EDIT_BRANCH || 'main';
  const edit = password ? { password, contents: makeContents({ token: process.env.EDIT_GITHUB_TOKEN || token, repo, branch }) } : null;
  const server = createServer({ github: makeGitHub({ token, repo }), allowedOrigins, edit, log: (m) => console.log(new Date().toISOString(), m) });
  server.listen(port, host, () => console.log(`report-api listening on http://${host}:${port} for ${repo}, origins: ${allowedOrigins.join(' ')}, editor: ${edit ? `on (${branch})` : 'off'}`));
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
