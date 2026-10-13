import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeProgress, decodeProgress } from './transfer.js';
import { createProgress, setWordStatus, STATUS } from './engine/progress.js';

test('progress survives a code round trip', async () => {
  let p = createProgress(new Date('2026-01-01T00:00:00Z'));
  for (let i = 0; i < 300; i++) p = setWordStatus(p, `w${i}`, STATUS.KNOWN, new Date('2026-01-02T00:00:00Z'));
  const code = await encodeProgress(p);
  assert.match(code, /^tib[01]\./);
  assert.ok(code.length < JSON.stringify(p).length / 2, 'the code is much shorter than the JSON');
  const back = await decodeProgress(code);
  assert.deepEqual(back, p);
});

test('garbage codes are rejected', async () => {
  await assert.rejects(decodeProgress('hello'));
  await assert.rejects(decodeProgress('tib0.' + btoa('{"x":1}')));
});
