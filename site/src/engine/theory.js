// The theory text of a lesson or of a part of the alphabet: the page a
// learner reads before the first part of a module, or before the cards of an
// alphabet part (content/intro/<lang>.md → site/data/intro.json). Pure
// functions shared by the content build and the site.
//
// intro.json: { [module id | 'alphabet/<n>']: { [lang]: paragraphs } }, a paragraph being a
// list of tokens: a plain string, or a Tibetan run made of the course's words
//   { pieces: [{ t: 'བླ་མའི་', ids: ['bla-ma', 'i'] }, { t: 'ཆོས', ids: ['chos'] }, { t: '།', ids: [] }] }
// or, when the run is not made of the course's words (a lone letter in a
// spelling rule, a form the dictionary does not have), { tib: 'ག' }: the site
// then shows it as plain Tibetan without word help.

import { TSHEG, SHAD, fuseParticle, lastLetter } from './tib.js';

const TIBETAN_RUN = /[ༀ-࿿]+/g;

/** `## <set id>` sections of a content/intro file → { setId: [paragraph text] }. Comment lines (#) outside sections are ignored. */
export function parseIntroMarkdown(text) {
  const out = {};
  let cur = null;
  let buf = [];
  const flush = () => { if (cur && buf.length) { out[cur].push(buf.join(' ')); } buf = []; };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const head = line.match(/^##\s+(\S+)\s*$/);
    if (head) { flush(); cur = head[1]; out[cur] = out[cur] || []; continue; }
    if (!cur) continue;
    if (!line) { flush(); continue; }
    buf.push(line);
  }
  flush();
  return out;
}

/**
 * Tappable pieces of a segmented run: a fused particle joins the word before
 * it, the shad stands alone and drops the tsheg before it (except after ང).
 */
export function piecesOf(ids, dict) {
  const pieces = [];
  for (const id of ids) {
    const w = dict[id];
    if (!w) continue;
    const prev = pieces[pieces.length - 1];
    if (w.tib === SHAD) {
      if (prev && prev.t.endsWith(TSHEG) && lastLetter(prev.t) !== 'ང') prev.t = prev.t.slice(0, -1);
      pieces.push({ t: SHAD, ids: [] });
    } else if (w.fused && prev && prev.ids.length) {
      prev.t = fuseParticle(prev.t, w.tib);
      prev.ids.push(id);
    } else {
      pieces.push({ t: w.tib, ids: [id] });
    }
  }
  return pieces;
}

/**
 * A paragraph → tokens. `segment(tib)` returns the word ids of a Tibetan run
 * or null when it cannot be read as the course's words.
 */
export function tokenizeParagraph(text, segment, dict) {
  const tokens = [];
  let last = 0;
  let m;
  TIBETAN_RUN.lastIndex = 0;
  while ((m = TIBETAN_RUN.exec(text)) !== null) {
    if (m.index > last) tokens.push(text.slice(last, m.index));
    const run = m[0];
    const ids = segment(run);
    tokens.push(ids ? { pieces: piecesOf(ids, dict) } : { tib: run });
    last = m.index + run.length;
  }
  if (last < text.length) tokens.push(text.slice(last));
  return tokens;
}

/** The paragraphs of a theory page in `lang`, English as the fallback; [] when there is none. `key` is a module id or an alphabet part id. */
export function theoryOf(intro, key, lang) {
  const m = intro && intro[key];
  if (!m) return [];
  return m[lang] || m.en || [];
}

/** The theory page a unit belongs to: a lesson's page is its module's, an alphabet part has its own (`alphabet/3`). */
export function theoryKey(unit) {
  return unit.part ? unit.id : unit.module;
}

/** The theory page is still ahead of the learner: the unit opens its page (the first part of a lesson, or any alphabet part), nothing of it is done, and the page was not read. */
export function needsTheory(progress, unit, intro) {
  if (!unit || !intro) return false;
  const key = theoryKey(unit);
  if (!intro[key]) return false;
  if (!unit.part && unit.id.split('/')[1] !== '1') return false;
  if (progress.course.theory.includes(key)) return false;
  const rec = progress.course.units[unit.id];
  return !rec || (rec.step <= 1 && !(rec.done && rec.done.length));
}

/** The Tibetan text of a run token. */
export function runText(tok) {
  return tok.pieces ? tok.pieces.map((p) => p.t).join('') : tok.tib;
}

/** Plain text of a paragraph's tokens (for search and tests). */
export function plainText(tokens) {
  return tokens.map((t) => (typeof t === 'string' ? t : runText(t))).join('');
}
