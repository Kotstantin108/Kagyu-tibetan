import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDITABLE_RE, checkPassword, validateEdit, commitMessage, makeContents, EDIT_LIMITS } from './edit-api.mjs';
import { createServer, RateLimiter } from './report-api.mjs';

const SHA = 'a'.repeat(40);

test('only the theory texts and the TSV tables are editable', () => {
  for (const p of ['content/intro/ru.md', 'content/words.tsv', 'content/sentences-bialek.tsv']) assert.equal(EDITABLE_RE.test(p), true, p);
  for (const p of ['content/intro/PROMPT.md', 'content/../README.md', 'README.md', 'site/config.js', 'content/intro/ru.md/x', '.github/workflows/deploy.yml', 'content/x.TSV']) assert.equal(EDITABLE_RE.test(p), false, p);
});

test('password check', () => {
  assert.equal(checkPassword('secret', 'secret'), true);
  assert.equal(checkPassword('secret ', 'secret'), false);
  assert.equal(checkPassword('', ''), false);
  assert.equal(checkPassword(undefined, 'secret'), false);
});

test('validateEdit', () => {
  const v = validateEdit({ path: 'content/intro/ru.md', sha: SHA, content: 'a\r\nb', message: '  fix  typo \n in lesson 3 ' });
  assert.equal(v.ok, true);
  assert.deepEqual(v.edit, { path: 'content/intro/ru.md', sha: SHA, content: 'a\nb', message: 'fix typo in lesson 3' });
  assert.equal(validateEdit(null).error, 'bad_json');
  assert.equal(validateEdit({ path: 'README.md', sha: SHA, content: 'x' }).error, 'path');
  assert.equal(validateEdit({ path: 'content/words.tsv', sha: 'abc', content: 'x' }).error, 'sha');
  assert.equal(validateEdit({ path: 'content/words.tsv', sha: SHA, content: '  \n' }).error, 'content');
  assert.equal(validateEdit({ path: 'content/words.tsv', sha: SHA, content: 'x'.repeat(EDIT_LIMITS.contentMax + 1) }).error, 'content');
  assert.equal(commitMessage(v.edit), 'Edit intro/ru.md: fix typo in lesson 3\n\nSaved from the editor page.');
  assert.equal(commitMessage({ ...v.edit, message: '' }), 'Edit intro/ru.md\n\nSaved from the editor page.');
});

/** A fake GitHub Contents API holding files in memory. */
function fakeGitHub(files) {
  const calls = [];
  const fetchFn = async (url, init) => {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname.replace(/^\/repos\/o\/r\/contents\//, ''));
    calls.push({ method: init.method, path, ref: u.searchParams.get('ref'), body: init.body ? JSON.parse(init.body) : null, auth: init.headers.Authorization });
    const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
    if (init.method === 'GET' && (path === 'content' || path === 'content/intro')) {
      const prefix = `${path}/`;
      const own = Object.keys(files).filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/')).map((p) => ({ path: p, type: 'file' }));
      return json(200, own.concat(path === 'content' ? [{ path: 'content/intro', type: 'dir' }] : []));
    }
    if (init.method === 'GET') {
      if (!files[path]) return json(404, { message: 'Not Found' });
      return json(200, { sha: files[path].sha, encoding: 'base64', content: Buffer.from(files[path].content).toString('base64').replace(/(.{60})/g, '$1\n') });
    }
    if (init.method === 'PUT') {
      const b = init.body ? JSON.parse(init.body) : {};
      if (!files[path] || files[path].sha !== b.sha) return json(409, { message: `${path} does not match ${b.sha}` });
      files[path] = { sha: 'b'.repeat(40), content: Buffer.from(b.content, 'base64').toString('utf8') };
      return json(200, { content: { sha: files[path].sha }, commit: { sha: 'c'.repeat(40), html_url: 'https://github.com/o/r/commit/ccc' } });
    }
    return json(500, {});
  };
  return { calls, fetchFn };
}

test('makeContents lists, reads and writes through the GitHub Contents API', async () => {
  const files = { 'content/words.tsv': { sha: SHA, content: 'a | b\n' }, 'content/intro/ru.md': { sha: SHA, content: '## lesson-01\n\nПривет ཆོས་\n' }, 'content/intro/PROMPT.md': { sha: SHA, content: 'no' } };
  const gh = fakeGitHub(files);
  const c = makeContents({ token: 't', repo: 'o/r', branch: 'dev', fetchFn: gh.fetchFn });
  assert.deepEqual(await c.list(), ['content/intro/ru.md', 'content/words.tsv']);
  assert.equal(gh.calls[0].ref, 'dev');
  const f = await c.get('content/intro/ru.md');
  assert.equal(f.content, '## lesson-01\n\nПривет ཆོས་\n');
  const out = await c.put('content/intro/ru.md', '## lesson-01\n\nПока\n', f.sha, 'msg');
  assert.equal(out.sha, 'b'.repeat(40));
  assert.equal(out.commit.url, 'https://github.com/o/r/commit/ccc');
  assert.deepEqual(gh.calls.at(-1).body, { message: 'msg', content: Buffer.from('## lesson-01\n\nПока\n').toString('base64'), sha: SHA, branch: 'dev' });
  assert.equal(gh.calls.at(-1).auth, 'Bearer t');
  await assert.rejects(c.put('content/intro/ru.md', 'x', SHA, 'msg'), (e) => e.status === 409);
});

/** Start the real server with a fake GitHub; returns { api, files, close }. */
async function startServer({ password = 'pw', files = {} } = {}) {
  const gh = fakeGitHub(files);
  const contents = makeContents({ token: 't', repo: 'o/r', fetchFn: gh.fetchFn });
  const server = createServer({ github: {}, allowedOrigins: ['https://site'], log: () => {}, edit: password ? { password, contents } : null, wrongLimiter: new RateLimiter(3) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, path, { body, auth = password, headers = {} } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  return { api, files, close: () => new Promise((r) => server.close(r)) };
}

test('the edit endpoints: password, list, read, save, conflict', async () => {
  const s = await startServer({ files: { 'content/intro/ru.md': { sha: SHA, content: '## lesson-01\n\nText\n' } } });
  try {
    assert.equal((await s.api('GET', '/api/edit/files', { auth: '' })).status, 401);
    assert.equal((await s.api('GET', '/api/edit/files', { auth: 'nope' })).status, 401);
    let r = await s.api('GET', '/api/edit/files');
    assert.deepEqual(r.data, { ok: true, branch: 'main', files: ['content/intro/ru.md'] });
    r = await s.api('GET', '/api/edit/file?path=content/intro/ru.md');
    assert.deepEqual(r.data, { ok: true, path: 'content/intro/ru.md', sha: SHA, content: '## lesson-01\n\nText\n' });
    assert.equal((await s.api('GET', '/api/edit/file?path=README.md')).status, 403);
    assert.equal((await s.api('GET', '/api/edit/file?path=content/missing.tsv')).status, 404);
    r = await s.api('PUT', '/api/edit/file', { body: { path: 'content/intro/ru.md', sha: SHA, content: '## lesson-01\n\nNew\n', message: 'typo' } });
    assert.equal(r.status, 200);
    assert.equal(r.data.sha, 'b'.repeat(40));
    assert.equal(r.data.commit.url, 'https://github.com/o/r/commit/ccc');
    assert.equal(s.files['content/intro/ru.md'].content, '## lesson-01\n\nNew\n');
    r = await s.api('PUT', '/api/edit/file', { body: { path: 'content/intro/ru.md', sha: SHA, content: 'stale\n' } });
    assert.deepEqual([r.status, r.data.error], [409, 'conflict']);
    r = await s.api('PUT', '/api/edit/file', { body: { path: 'site/sw.js', sha: SHA, content: 'x' } });
    assert.equal(r.status, 403);
    assert.equal((await s.api('POST', '/api/edit/file')).status, 404);
    assert.equal((await s.api('GET', '/api/edit/files', { headers: { Origin: 'https://evil' } })).status, 403);
  } finally { await s.close(); }
});

test('wrong passwords are limited per address; the right one is not counted', async () => {
  const s = await startServer();
  try {
    for (let i = 0; i < 3; i++) assert.equal((await s.api('GET', '/api/edit/files', { auth: 'bad' })).status, 401);
    assert.equal((await s.api('GET', '/api/edit/files', { auth: 'bad' })).status, 429);
    assert.equal((await s.api('GET', '/api/edit/files')).status, 200);
  } finally { await s.close(); }
});

test('without EDIT_PASSWORD the editor API is off, the report API still works', async () => {
  const s = await startServer({ password: '' });
  try {
    assert.deepEqual((await s.api('GET', '/api/edit/files', { auth: 'x' })).data, { ok: false, error: 'disabled' });
    assert.deepEqual((await s.api('GET', '/api/health')).data, { ok: true });
  } finally { await s.close(); }
});
