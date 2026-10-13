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

async function pipe(bytes, Stream, kind) {
  const stream = new Blob([bytes]).stream().pipeThrough(new Stream(kind));
  return new Uint8Array(await new Response(stream).arrayBuffer());
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
  const m = String(code || '').trim().match(/^(tib[01])\.([A-Za-z0-9+/=\s]+)$/);
  if (!m) throw new Error('bad-code');
  let bytes = base64ToBytes(m[2]);
  if (m[1] === 'tib1') {
    if (typeof DecompressionStream === 'undefined') throw new Error('no-decompress');
    bytes = await pipe(bytes, DecompressionStream, 'deflate-raw');
  }
  const obj = JSON.parse(new TextDecoder().decode(bytes));
  if (!obj || typeof obj !== 'object' || !('words' in obj)) throw new Error('bad-code');
  return obj;
}
