// Progress as a short text code for moving it between devices without files.
// Format: "tib1." + base64(deflate-raw(JSON)) when compression is available,
// otherwise "tib0." + base64(JSON).

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Progress JSON is well under a megabyte; a code or its inflated form beyond this is not ours. */
export const MAX_CODE_CHARS = 2 * 1024 * 1024;
export const MAX_BYTES = 8 * 1024 * 1024;

async function pipe(bytes, Stream, kind, limit = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(new Stream(kind)).getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error('too-big'); }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

export async function encodeProgress(progress) {
  const bytes = new TextEncoder().encode(JSON.stringify(progress));
  if (typeof CompressionStream !== 'undefined') {
    try { return 'tib1.' + bytesToBase64(await pipe(bytes, CompressionStream, 'deflate-raw')); } catch { /* fall through */ }
  }
  return 'tib0.' + bytesToBase64(bytes);
}

/** Returns the parsed progress object, or throws on a malformed code. */
export async function decodeProgress(code) {
  const text = String(code || '').trim();
  if (text.length > MAX_CODE_CHARS) throw new Error('too-big');
  const m = text.match(/^(tib[01])\.([A-Za-z0-9+/=\s]+)$/);
  if (!m) throw new Error('bad-code');
  let bytes = base64ToBytes(m[2]);
  if (m[1] === 'tib1') {
    if (typeof DecompressionStream === 'undefined') throw new Error('no-decompress');
    bytes = await pipe(bytes, DecompressionStream, 'deflate-raw', MAX_BYTES);
  }
  if (bytes.length > MAX_BYTES) throw new Error('too-big');
  const obj = JSON.parse(new TextDecoder().decode(bytes));
  if (!obj || typeof obj !== 'object' || !('words' in obj)) throw new Error('bad-code');
  return obj;
}
