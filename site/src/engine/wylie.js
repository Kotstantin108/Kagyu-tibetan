// Unicode Tibetan -> Wylie (EWTS-style) transliteration.
// Pure function, no dependencies. Good enough for dictionary words and ids.

const CONS = {
  0x0f40: 'k', 0x0f41: 'kh', 0x0f42: 'g', 0x0f43: 'gh', 0x0f44: 'ng',
  0x0f45: 'c', 0x0f46: 'ch', 0x0f47: 'j', 0x0f49: 'ny',
  0x0f4a: 'T', 0x0f4b: 'Th', 0x0f4c: 'D', 0x0f4d: 'Dh', 0x0f4e: 'N',
  0x0f4f: 't', 0x0f50: 'th', 0x0f51: 'd', 0x0f52: 'dh', 0x0f53: 'n',
  0x0f54: 'p', 0x0f55: 'ph', 0x0f56: 'b', 0x0f57: 'bh', 0x0f58: 'm',
  0x0f59: 'ts', 0x0f5a: 'tsh', 0x0f5b: 'dz', 0x0f5c: 'dzh', 0x0f5d: 'w',
  0x0f5e: 'zh', 0x0f5f: 'z', 0x0f60: "'", 0x0f61: 'y', 0x0f62: 'r', 0x0f63: 'l',
  0x0f64: 'sh', 0x0f65: 'Sh', 0x0f66: 's', 0x0f67: 'h', 0x0f68: '', 0x0f69: 'kSh', 0x0f6a: 'r',
};
const SUBJOINED_EXTRA = { 0x0fba: 'w', 0x0fbb: 'y', 0x0fbc: 'r' };
const VOWELS = {
  0x0f71: 'A', 0x0f72: 'i', 0x0f73: 'I', 0x0f74: 'u', 0x0f75: 'U', 0x0f7a: 'e', 0x0f7b: 'ai',
  0x0f7c: 'o', 0x0f7d: 'au', 0x0f80: '-i', 0x0f81: '-I',
};
const MARKS = { 0x0f7e: 'M', 0x0f7f: 'H', 0x0f83: '~M', 0x0f82: '~M`', 0x0f84: '?' };
const DIGITS = '༠༡༢༣༤༥༦༧༨༩';

// Valid prefix -> root combinations (root as Wylie letter of a single consonant).
const PREFIX_COMBOS = {
  g: ['c', 'ny', 't', 'd', 'n', 'ts', 'zh', 'z', 'y', 'sh', 's'],
  d: ['k', 'g', 'ng', 'p', 'b', 'm'],
  b: ['k', 'g', 'c', 't', 'd', 'n', 'ts', 'zh', 'z', 'sh', 's', 'r', 'l'],
  m: ['kh', 'g', 'ng', 'ch', 'j', 'ny', 'th', 'd', 'n', 'tsh', 'dz'],
  "'": ['kh', 'g', 'ch', 'j', 'th', 'd', 'ph', 'b', 'tsh', 'dz'],
};
const SUFFIXES = new Set(['g', 'ng', 'd', 'n', 'b', 'm', "'", 'r', 'l', 's']);

export function parseSyllable(syl) {
  const units = [];
  let cur = null;
  for (const ch of syl) {
    const cp = ch.codePointAt(0);
    if (CONS[cp] !== undefined) {
      cur = { cons: [CONS[cp]], full: [cp], vowel: '' };
      units.push(cur);
    } else if ((cp >= 0x0f90 && cp <= 0x0fb8) || SUBJOINED_EXTRA[cp]) {
      const base = SUBJOINED_EXTRA[cp] ?? CONS[cp - 0x50] ?? '?';
      if (!cur) { cur = { cons: [], full: [], vowel: '' }; units.push(cur); }
      cur.cons.push(base);
      cur.full.push(cp);
    } else if (VOWELS[cp] !== undefined) {
      if (!cur) { cur = { cons: [''], full: [0x0f68], vowel: '' }; units.push(cur); }
      cur.vowel += VOWELS[cp];
    } else if (MARKS[cp] !== undefined) {
      if (!cur) { cur = { cons: [''], full: [0x0f68], vowel: '' }; units.push(cur); }
      cur.vowel += MARKS[cp];
    } else if (DIGITS.includes(ch)) {
      units.push({ cons: [String(DIGITS.indexOf(ch))], full: [cp], vowel: '', digit: true });
      cur = null;
    } else {
      units.push({ cons: [ch], full: [cp], vowel: '', other: true });
      cur = null;
    }
  }
  return units;
}

export function rootIndex(units) {
  const n = units.length;
  if (n <= 1) return 0;
  const u0 = units[0];
  const u1 = units[1];
  const isSinglePrefix = u0.cons.length === 1 && PREFIX_COMBOS[u0.cons[0]];
  if (n === 2) {
    return u1.cons.length > 1 ? 1 : 0;
  }
  const last = units[n - 1].cons.join('');
  if (n === 3) {
    if (u1.cons.length > 1) return 1;
    if (isSinglePrefix && PREFIX_COMBOS[u0.cons[0]].includes(u1.cons[0]) && SUFFIXES.has(last)) return 1;
    return 0;
  }
  if (n === 4) {
    if (u1.cons.length > 1) return 1;
    if (isSinglePrefix && PREFIX_COMBOS[u0.cons[0]].includes(u1.cons[0]) && (last === 's' || last === 'd')) return 1;
    return 0;
  }
  return 1;
}

export function syllableToWylie(syl) {
  const units = parseSyllable(syl);
  if (!units.length) return '';
  const hasVowel = units.some((u) => u.vowel && !u.digit && !u.other);
  let root = hasVowel ? -1 : rootIndex(units);
  // a-chung carrying the vowel after a bare consonant: བའི = ba'i, དགའོ = dga'o
  if (hasVowel) {
    const vi = units.findIndex((u) => u.vowel && !u.digit && !u.other);
    if (vi > 0 && units[vi].cons.length === 1 && units[vi].cons[0] === "'" && !units[vi - 1].vowel) root = vi - 1;
  }
  let out = '';
  units.forEach((u, i) => {
    let s = u.cons.join('');
    // g.y disambiguation: prefix g followed by full-form ya
    if (i === 1 && units[0].cons.length === 1 && units[0].cons[0] === 'g' && !units[0].vowel && u.full[0] === 0x0f61) {
      out += '.';
    }
    if (u.digit || u.other) { out += s; return; }
    let v = u.vowel;
    if (v) {
      v = v.replace('Ai', 'I').replace('Au', 'U');
      s += v;
    } else if (i === root) {
      s += 'a';
    }
    out += s;
  });
  return out;
}

export function toWylie(text) {
  const parts = [];
  let buf = '';
  const flush = () => { if (buf) { parts.push(syllableToWylie(buf)); buf = ''; } };
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 0x0f0b || cp === 0x0f0c) { flush(); continue; }
    if (cp === 0x0f0d) { flush(); parts.push('/'); continue; }
    if (cp === 0x0f0e) { flush(); parts.push('//'); continue; }
    if (ch === ' ' || ch === '\n' || ch === '\t') { flush(); continue; }
    buf += ch;
  }
  flush();
  return parts.join(' ').replace(/ \//g, '/').trim();
}

export function wylieToId(wylie) {
  return wylie
    .toLowerCase()
    .replace(/\//g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9'\-.~]/g, '');
}

/**
 * Ending type of the last syllable of a Tibetan word (trailing tsheg allowed):
 *   'achung' - ends in a-chung (བཀའ, ནམ་མཁའ)
 *   'open'   - no suffix letter after the root (བླ་མ, དེ, འགྲོ)
 *   'closed' - has a suffix letter (ཆོས, ཁྱོད)
 */
export function endingType(tib) {
  const syls = tib.replace(/[་།]+$/u, '').split(/[་།]/u).filter(Boolean);
  if (!syls.length) return 'closed';
  const syl = syls[syls.length - 1];
  if (syl.endsWith('འ')) return 'achung';
  const units = parseSyllable(syl);
  if (!units.length) return 'closed';
  // a-chung carrying a vowel after the root (སྤྲེའུ, དགེའོ) ends the syllable in a vowel
  const last = units[units.length - 1];
  if (units.length > 1 && last.cons.length === 1 && last.cons[0] === "'" && last.vowel) return 'open';
  const vi = units.findIndex((u) => u.vowel && !u.digit && !u.other);
  const root = vi >= 0 ? vi : rootIndex(units);
  return root === units.length - 1 ? 'open' : 'closed';
}

/** The thirty consonants with their Wylie, for a quick reference table. */
export const CONSONANT_TABLE = [
  0x0f40, 0x0f41, 0x0f42, 0x0f44, 0x0f45, 0x0f46, 0x0f47, 0x0f49, 0x0f4f, 0x0f50, 0x0f51, 0x0f53,
  0x0f54, 0x0f55, 0x0f56, 0x0f58, 0x0f59, 0x0f5a, 0x0f5b, 0x0f5d, 0x0f5e, 0x0f5f, 0x0f60, 0x0f61,
  0x0f62, 0x0f63, 0x0f64, 0x0f66, 0x0f67, 0x0f68,
].map((cp) => [String.fromCodePoint(cp), (CONS[cp] || 'a') + (cp === 0x0f68 ? '' : 'a')]);

/** The four vowel signs with their Wylie. */
export const VOWEL_TABLE = [[0x0f72, 'i'], [0x0f74, 'u'], [0x0f7a, 'e'], [0x0f7c, 'o']].map(([cp, w]) => ['ཨ' + String.fromCodePoint(cp), w]);
