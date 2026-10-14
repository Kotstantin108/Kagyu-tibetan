import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeProgress, decodeProgress, MAX_BYTES, MAX_CODE_CHARS } from './transfer.js';
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

test('oversized codes are rejected before they are inflated', async () => {
  await assert.rejects(decodeProgress('tib0.' + 'A'.repeat(MAX_CODE_CHARS + 1)), /too-big/);
  // a compressed bomb: a small code that inflates past the limit
  const zeros = new Uint8Array(MAX_BYTES + 1);
  const stream = new Blob([zeros]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const packed = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < packed.length; i += 0x8000) bin += String.fromCharCode(...packed.subarray(i, i + 0x8000));
  const code = 'tib1.' + btoa(bin);
  assert.ok(code.length < 100_000, 'the bomb itself is small');
  await assert.rejects(decodeProgress(code), /too-big/);
});
