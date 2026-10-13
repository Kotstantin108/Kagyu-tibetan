import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReport, issueTitle, issueBody, issueLabels, RateLimiter, DailyIndex, fileReport, createServer, LIMITS } from './report-api.mjs';

const good = { kind: 'sentence', id: 's123', tib: 'ང་སློབ་མ་ཡིན།', translation: 'I am a student.', lang: 'ru', message: 'The translation misses the subject.', page: '#/play' };

test('validateReport accepts a good report and normalises it', () => {
  const v = validateReport({ ...good, tib: '  ང་སློབ་མ་ཡིན།\n ', lang: 'xx1' });
  assert.equal(v.ok, true);
  assert.equal(v.report.tib, 'ང་སློབ་མ་ཡིན།');
  assert.equal(v.report.lang, 'en');
  assert.equal(validateReport({ ...good, kind: 'word', id: "bla-ma'i.2" }).ok, true);
  assert.equal(v.report.category, 'translation');
  const app = validateReport({ kind: 'app', category: 'idea', message: 'Please add a night mode schedule.', lang: 'de' });
  assert.equal(app.ok, true);
  assert.deepEqual([app.report.id, app.report.category, app.report.tib], ['app', 'idea', '']);
  assert.equal(validateReport({ kind: 'app', category: 'nonsense', message: 'Something is broken here.' }).report.category, 'bug');
});

test('general reports: title from the first line, labels by category, never deduplicated', async () => {
  const r = validateReport({ kind: 'app', category: 'bug', message: 'Tiles overlap on a narrow phone\nSteps: open the dictionary…' }).report;
  assert.equal(issueTitle(r), 'Bug: Tiles overlap on a narrow phone');
  assert.deepEqual(issueLabels(r), ['bug']);
  assert.deepEqual(issueLabels({ ...r, category: 'idea' }), ['enhancement']);
  assert.match(issueBody(r), /\*\*Type:\*\* Bug/);
  const created = [];
  const github = { async findOpen() { throw new Error('must not search'); }, async createIssue(t, b, labels) { created.push(labels); return { number: created.length, url: `u${created.length}` }; }, async comment() { throw new Error('no'); } };
  const index = new DailyIndex();
  await fileReport(r, { github, index });
  await fileReport(r, { github, index });
  assert.deepEqual(created, [['bug'], ['bug']]);
});

test('validateReport rejects bad input', () => {
  assert.equal(validateReport(null).error, 'bad_json');
  assert.equal(validateReport({ ...good, kind: 'other' }).error, 'kind');
  assert.equal(validateReport({ ...good, id: 'S 1' }).error, 'id');
  assert.equal(validateReport({ ...good, id: '../x' }).error, 'id');
  assert.equal(validateReport({ ...good, message: 'short' }).error, 'message');
  assert.equal(validateReport({ ...good, message: 'x'.repeat(LIMITS.messageMax + 1) }).error, 'message');
  assert.equal(validateReport({ ...good, website: 'http://spam' }).error, 'spam');
});

test('issue title and body', () => {
  const r = validateReport(good).report;
  assert.equal(issueTitle(r), 'Sentence s123: ང་སློབ་མ་ཡིན།');
  assert.equal(issueTitle({ ...r, kind: 'word', id: 'nga' }), 'Word nga: ང་སློབ་མ་ཡིན།');
  const body = issueBody(r);
  assert.match(body, /\*\*Sentence id:\*\* s123/);
  assert.match(body, /> The translation misses the subject\./);
  assert.match(issueBody(r, { comment: true }), /^Another report/);
});

test('rate limiter: five per hour per key, sliding window', () => {
  const rl = new RateLimiter(5, 3600_000);
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(rl.allow('a', t0 + i), true);
  assert.equal(rl.allow('a', t0 + 10), false);
  assert.equal(rl.allow('b', t0 + 10), true);
  assert.equal(rl.allow('a', t0 + 3600_001), true);
});

test('fileReport: new issue, then a comment for the same id', async () => {
  const calls = [];
  const github = {
    async findOpen(title) { calls.push(['find', title]); return null; },
    async createIssue(title) { calls.push(['create', title]); return { number: 7, url: 'https://github.com/x/y/issues/7' }; },
    async comment(number) { calls.push(['comment', number]); return { url: 'https://github.com/x/y/issues/7#issuecomment-1' }; },
  };
  const index = new DailyIndex();
  const r = validateReport(good).report;
  const a = await fileReport(r, { github, index });
  assert.equal(a.duplicate, false);
  const b = await fileReport(r, { github, index });
  assert.equal(b.duplicate, true);
  assert.deepEqual(calls.map((c) => c[0]), ['find', 'create', 'comment']);
  assert.equal(b.url, 'https://github.com/x/y/issues/7#issuecomment-1');
});

test('fileReport: an open issue found by search gets a comment; a failed search still creates', async () => {
  const github = {
    async findOpen() { return { number: 3, url: 'u3' }; },
    async createIssue() { throw new Error('should not create'); },
    async comment(number) { return { url: `c${number}` }; },
  };
  const r = validateReport(good).report;
  assert.equal((await fileReport(r, { github, index: new DailyIndex() })).url, 'c3');
  const github2 = { async findOpen() { throw new Error('search down'); }, async createIssue() { return { number: 1, url: 'u1' }; }, async comment() { throw new Error('no'); } };
  assert.equal((await fileReport(r, { github: github2, index: new DailyIndex() })).url, 'u1');
});

test('http: CORS, validation, rate limit and the honeypot', async () => {
  const github = { async findOpen() { return null; }, async createIssue() { return { number: 1, url: 'u1' }; }, async comment() { return { url: 'c' }; } };
  const server = createServer({ github, allowedOrigins: ['https://tibetan.itjoy.space'], limiter: new RateLimiter(2), log: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(`${base}/api/report`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://tibetan.itjoy.space', ...headers }, body: JSON.stringify(body) });
  try {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    const pre = await fetch(`${base}/api/report`, { method: 'OPTIONS', headers: { Origin: 'https://tibetan.itjoy.space' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), 'https://tibetan.itjoy.space');
    const bad = await post(good, { Origin: 'https://evil.example' });
    assert.equal(bad.status, 403);
    const ok = await post(good);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://tibetan.itjoy.space');
    assert.deepEqual(await ok.json(), { ok: true, url: 'u1' });
    const spam = await post({ ...good, website: 'x' }, { 'X-Real-IP': '10.0.0.2' });
    assert.deepEqual(await spam.json(), { ok: true, url: '' });
    const inv = await post({ ...good, message: 'no' }, { 'X-Real-IP': '10.0.0.3' });
    assert.equal(inv.status, 400);
    assert.equal((await post(good, { 'X-Real-IP': '10.0.0.4' })).status, 200);
    assert.equal((await post(good, { 'X-Real-IP': '10.0.0.4' })).status, 200);
    assert.equal((await post(good, { 'X-Real-IP': '10.0.0.4' })).status, 429);
  } finally {
    server.close();
  }
});
