// Unicode Tibetan -> THL simplified phonetics (the reading pronunciation of Lhasa
// Tibetan in the transcription of the Tibetan and Himalayan Library, as used in
// Western books on Buddhism: "tashi delek", "gönpa", "dorjé", "chö").
// Pure functions, no DOM, no data: rules only, as the Wylie transliterator.
//
// The rules (the RYI textbook of colloquial Tibetan, THL's transcription guide):
//   - prefixes and superscribed letters are silent, but keep the third column
//     voiced: ga/ja/da/ba/dza without them are k/ch/t/p/ts, with them g/j/d/b/dz
//     (bod -> pö, mgo -> go, ja -> cha, 'jug -> juk);
//   - the suffixes d and s are silent and make an umlaut (a -> e, o -> ö, u -> ü),
//     n and l are heard and make the same umlaut; g -> k, b -> p; a second suffix is silent;
//   - subjoined ya: ky, khy, gy; py/phy -> ch, by -> ch or j; my -> ny;
//     subjoined ra: tr (kr, khr, tr, thr, pr, phr) and dr (prefixed gr, dr, br);
//     subjoined la: l (bla -> la), except zla -> da;
//   - db -> w (dbang -> wang), dby -> y (dbyangs -> yang), dbu -> u;
//   - zha -> sha, za -> sa unless prefixed (zhabs -> shap, bzang -> zang), c and ch both -> ch, tha/pha/tsha -> t/p/ts (aspiration is written only for kh and ch);
//   - a later syllable of a word keeps the third column voiced (rgya gar -> gyagar, nor bu -> norbu),
//     and ba/bo there -> wa/wo (dge ba -> gewa, zla ba -> dawa);
//   - the e of the last syllable of a word is written é when nothing is heard after it (rdo rje -> dorjé,
//     thams cad -> tamché, bla ma'i -> lamé);
//   - the superscribed ra of a later syllable is heard at the end of an open syllable before it (rdo rje -> dorjé).
// Syllables of a word are written together (gönpa); no tones.

import { parseSyllable, rootIndex } from './wylie.js';
import { splitSyllables, stripTsheg, SHAD } from './tib.js';

/** The onset of a syllable: the Wylie letters of the root stack and whether a prefix or a superscribed letter precedes. */
function onset(consIn, prefix, later) {
  let cons = consIn.slice();
  if (cons.length > 1 && cons[cons.length - 1] === 'w') cons.pop(); // wazur is silent
  let voiced = prefix !== '' || later; // a later syllable of the word is voiced between vowels: rgya gar -> gyagar, 'od zer -> özer
  if (cons.length > 1 && ['r', 'l', 's'].includes(cons[0]) && !(cons[0] === 'l' && cons[1] === 'h')) {
    cons = cons.slice(1); // superscribed letter
    voiced = true;
  }
  const root = cons[0] ?? '';
  const sub = cons[1] ?? '';
  // db: dbang -> wang, dbyangs -> yang, dbu -> u (the vowel is handled by the caller)
  if (prefix === 'd' && root === 'b') return sub === 'y' ? 'y' : 'w';
  if (sub === 'y') {
    if (root === 'k') return 'ky';
    if (root === 'kh') return 'khy';
    if (root === 'g') return voiced ? 'gy' : 'ky';
    if (root === 'p' || root === 'ph') return 'ch';
    if (root === 'b') return voiced ? 'j' : 'ch';
    if (root === 'm') return 'ny';
    return plain(root, voiced) + 'y';
  }
  if (sub === 'r') {
    if (['k', 'kh', 't', 'th', 'p', 'ph', 'T', 'Th'].includes(root)) return 'tr';
    if (['g', 'd', 'b'].includes(root)) return voiced ? 'dr' : 'tr';
    if (root === 's') return 's';
    if (root === 'h') return 'hr';
    if (root === 'm') return 'm';
    return plain(root, voiced) + 'r';
  }
  if (sub === 'l') {
    if (root === 'z') return 'd';
    return 'l';
  }
  if (root === 'l' && sub === 'h') return 'lh';
  return plain(root, voiced);
}

/** A single root letter without subjoined letters. */
function plain(root, voiced) {
  switch (root) {
    case 'g': return voiced ? 'g' : 'k';
    case 'j': return voiced ? 'j' : 'ch';
    case 'd': return voiced ? 'd' : 't';
    case 'b': return voiced ? 'b' : 'p';
    case 'dz': return voiced ? 'dz' : 'ts';
    case 'c': return 'ch';
    case 'th': return 't'; // THL does not mark the aspiration of tha, pha, tsha (Tamché, Pema, Püntsok), only of kha and cha
    case 'ph': return 'p';
    case 'tsh': return 'ts';
    case 'zh': return voiced ? 'zh' : 'sh';
    case 'z': return voiced ? 'z' : 's';
    case "'": return '';
    case '': return ''; // ཨ
    case 'T': return 't';
    case 'Th': return 't';
    case 'D': return voiced ? 'd' : 't';
    case 'Dh': return 'd';
    case 'N': return 'n';
    case 'Sh': return 'sh';
    case 'gh': return 'g';
    case 'dh': return 'd';
    case 'bh': return 'b';
    case 'dzh': return 'dz';
    case 'kSh': return 'k';
    default: return root;
  }
}

const UMLAUT = { a: 'e', o: 'ö', u: 'ü', i: 'i', e: 'e' };
const CODA = { g: 'k', ng: 'ng', d: '', n: 'n', b: 'p', m: 'm', "'": '', r: 'r', l: 'l', s: '' };

/**
 * One syllable (without tsheg) -> phonetics.
 * `later`: the syllable is not the first of its word; `last`: it is the last one.
 */
function syllablePhon(syl, later, last) {
  const units = parseSyllable(syl);
  if (!units.length) return { out: '', open: false, superR: false };
  if (units.every((u) => u.digit || u.other)) return { out: units.map((u) => u.cons.join('')).join(''), open: false, superR: false };
  const hasVowel = units.some((u) => u.vowel && !u.digit && !u.other);
  let root = hasVowel ? units.findIndex((u) => u.vowel && !u.digit && !u.other) : rootIndex(units);
  // a-chung carrying a vowel after a bare consonant: བའི, དགའོ — the vowel belongs to the syllable before it
  let glued = '';
  if (hasVowel && root > 0 && units[root].cons.length === 1 && units[root].cons[0] === "'" && !units[root - 1].vowel) {
    glued = units[root].vowel;
    root -= 1;
  }
  const prefix = root === 1 && units[0].cons.length === 1 ? units[0].cons[0] : '';
  const ru = units[root];
  let vowel = ru.vowel || 'a';
  const anusvara = /M/.test(vowel); // ཨོཾ -> om
  vowel = vowel.replace('A', 'a').replace('I', 'i').replace('U', 'u').replace(/[M~`?H-]/g, '');
  if (vowel === 'ai') vowel = 'e';
  if (vowel === 'au') vowel = 'o';
  let head = onset(ru.cons, prefix, later);
  // ba/bo/be as a later syllable of the word: dge ba -> gewa, skye bo -> kyewo
  if (later && prefix === '' && ru.cons.length === 1 && ru.cons[0] === 'b' && ['a', 'o', 'e'].includes(vowel)) head = 'w';
  // dbu -> u, dbus -> ü, dbyings -> ying: w before u and i is not heard
  if (prefix === 'd' && ru.cons[0] === 'b' && head === 'w' && (vowel === 'u' || vowel === 'i')) head = '';
  // the suffixes after the root (the glued a-chung vowel is not a suffix)
  const rest = units.slice(root + 1 + (glued ? 1 : 0)).filter((u) => !u.digit && !u.other);
  const s1 = rest[0] ? rest[0].cons.join('') : '';
  let coda = CODA[s1] ?? (anusvara ? 'm' : '');
  if (['d', 's', 'n', 'l'].includes(s1)) vowel = UMLAUT[vowel] ?? vowel;
  let tail = '';
  if (glued) {
    const g = glued.replace(/[^aiueo]/g, '');
    if (g === 'i') vowel = vowel === 'a' ? 'e' : vowel === 'o' ? 'ö' : vowel === 'u' ? 'ü' : vowel;
    else tail = g; // dga'o -> gao, spre'u -> peu
  }
  let out = head + vowel + tail + coda;
  // the e of the last syllable without a heard coda is written é (dorjé, tamché, lamé, ngé) so it is not read as a silent e
  if (last && !coda && !tail && out.endsWith('e')) out = out.slice(0, -1) + 'é';
  // a superscribed ra of a later syllable is heard at the end of an open syllable before it: rdo rje -> dorjé, ka rma -> karma
  return { out, open: !coda && !tail, superR: later && prefix === '' && ru.cons.length > 1 && ru.cons[0] === 'r' && ru.cons[1] !== 'w' };
}

/** The phonetics of a word, one string per syllable, aligned with splitSyllables(tib). */
export function phoneticSyllables(tib) {
  const syls = splitSyllables(tib).map((s) => stripTsheg(s).replace(SHAD, '').replace(/[༑༔]/gu, '')).filter(Boolean);
  const parts = syls.map((s, i) => syllablePhon(s, i > 0, i === syls.length - 1));
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].superR && parts[i - 1].open) parts[i - 1].out += 'r';
  }
  return parts.map((p) => p.out);
}

/** The phonetics of a word: its syllables written together ("gönpa"); words separated by a space or shad keep a space. */
export function toPhonetics(tib) {
  const words = tib.split(/[\s།༑༔]+/u).filter((w) => w && w !== '་');
  return words.map((w) => phoneticSyllables(w).join('')).filter(Boolean).join(' ');
}

/** Phonetics without diacritics, lower case, for search: "gönpa" -> "gonpa", "dorjé" -> "dorje". */
export function foldPhonetics(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
