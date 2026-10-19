// Tibetan text helpers shared by the site and the content build script.
// Pure functions, no DOM.

export const TSHEG = '་';
export const SHAD = '།';

/** Strip trailing tsheg/shad. */
export function stripTsheg(s) {
  return s.replace(/[་།]+$/u, '');
}

/**
 * Attach a fused particle (འི ས ར འོ འམ འང) to a word that ends in an open
 * syllable or in a-chung. Both arguments carry their trailing tsheg.
 *   fuseParticle('བླ་མ་', 'འི་') -> 'བླ་མའི་'
 *   fuseParticle('བཀའ་', 'ས་')  -> 'བཀས་'
 *   fuseParticle('དགའ་', 'འོ་')  -> 'དགའོ་'
 */
export function fuseParticle(base, particle) {
  const b = stripTsheg(base);
  const p = stripTsheg(particle);
  if (!b) return p + TSHEG;
  if (b.endsWith('འ')) {
    if (p.startsWith('འ')) return b + p.slice(1) + TSHEG;
    return b.slice(0, -1) + p + TSHEG;
  }
  return b + p + TSHEG;
}

/** Last consonant letter of a string (used for the tsheg-before-shad rule). */
export function lastLetter(s) {
  const m = s.match(/([ཀ-ཬ])[ཱ-྄ྐ-ྼ]*་?$/u);
  return m ? m[1] : '';
}

/**
 * Render the Tibetan text of a sentence from word ids.
 * dict[id] = { tib, fused?, service? }. The shad token drops the preceding
 * tsheg except after a final nga; fused particles glue to the previous word.
 */
export function renderTib(ids, dict) {
  let out = '';
  for (const id of ids) {
    const w = dict[id];
    if (!w) continue;
    if (w.tib === SHAD) {
      if (out.endsWith(TSHEG) && lastLetter(out) !== 'ང') out = out.slice(0, -1);
      out += SHAD;
    } else if (w.fused && out) {
      out = fuseParticle(out, w.tib);
    } else {
      out += w.tib;
    }
  }
  return out;
}

/**
 * Tile texts for a sentence: one per word in word mode, one per syllable in
 * syllable mode. Fused particles are shown as their own tile in both modes.
 * Service tokens (shad) are not tiles.
 */
export function tileTexts(ids, dict, mode = 'words') {
  const out = [];
  for (const id of ids) {
    const w = dict[id];
    if (!w || w.service) continue;
    if (mode === 'syllables' && !w.fused) {
      for (const s of splitSyllables(w.tib)) out.push(s);
    } else {
      out.push(w.tib);
    }
  }
  return out;
}

/** Split Tibetan text into syllables, each keeping its tsheg. */
export function splitSyllables(text) {
  const parts = [];
  let buf = '';
  for (const ch of text) {
    buf += ch;
    if (ch === TSHEG) { parts.push(buf); buf = ''; }
  }
  if (buf) parts.push(buf.endsWith(SHAD) ? buf : buf + TSHEG);
  return parts.filter((p) => p !== TSHEG);
}
