// Builds site/data/{words,sentences,sets}.json and CONTENT_REVIEW.md
// from the authoring files in content/.
//
//   node scripts/build-content.mjs
//
// Authoring format: pipe-separated columns, "#" starts a comment,
// "@set <id>" switches the current set for the lines that follow.
// Each base name may be split over several files: words.tsv, words-2.tsv, ...
//
//   content/sets.tsv       id | en | ru
//   content/words.tsv      tib | en | ru | pos | page | flags
//                          flags: comma-separated, e.g. "fused", "lemma=བླ་མ་"
//   content/sentences.tsv  page | tib | enOrigin | en | ru | noteEn | noteRu
//                          enOrigin: textbook | machine
//   content/lang-<xx>.tsv  extra languages, keyed by the English text:
//                          @sets / @words / @sentences / @notes sections,
//                          lines "english | translation"
//
// Tibetan in sentences is segmented automatically by greedy longest match
// over the word list. Fused particles (flag "fused": འི ས ར འོ འམ འང) are
// recognised glued to the previous open syllable (བླ་མའི = བླ་མ + འི).
// Put "+" inside the Tibetan to force a boundary. Every "།" becomes the
// service token "shad".

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toWylie, wylieToId, endingType } from './lib/wylie.mjs';
import { renderTib, fuseParticle, TSHEG, SHAD } from '../site/src/engine/tib.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const OUT = join(ROOT, 'site', 'data');
const BOOK = 'RYI Grammar Handbook';

const errors = [];
const warnings = [];

// Reads content/<base>.tsv plus content/<base>-*.tsv in name order.
function readRows(base) {
  const files = readdirSync(CONTENT)
    .filter((f) => f === `${base}.tsv` || (f.startsWith(`${base}-`) && f.endsWith('.tsv')))
    .sort();
  const rows = [];
  for (const file of files) {
    const text = readFileSync(join(CONTENT, file), 'utf8');
    let set = null;
    text.split(/\r?\n/).forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      if (t.startsWith('@set')) { set = t.slice(4).trim(); return; }
      rows.push({ line: `${file}:${i + 1}`, set, cols: t.split('|').map((c) => c.trim()) });
    });
  }
  return rows;
}

function normTib(s) {
  let t = s.replace(/\s+/g, '');
  if (!t || t === SHAD) return t;
  if (!t.endsWith(TSHEG)) t += TSHEG;
  return t;
}

function lessonLabel(setId) {
  const m = setId && setId.match(/(\d+)/);
  return m ? `lesson ${Number(m[1])}` : setId;
}

// ---- sets ----
const sets = readRows('sets').map((r, i) => {
  const [id, en, ru] = r.cols;
  return { id, name: { ru, en }, order: i + 1 };
});
const setOrder = new Map(sets.map((s) => [s.id, s.order]));

// ---- words ----
const words = {};
const byTib = new Map(); // standalone surface -> id
const idsUsed = new Set();
for (const r of readRows('words')) {
  const [tibRaw, en, ru, pos, page, flagsRaw] = r.cols;
  const where = r.line;
  if (!tibRaw) { errors.push(`${where}: empty tib`); continue; }
  const tib = normTib(tibRaw);
  const flags = {};
  for (const f of (flagsRaw || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const [k, v] = f.split('=');
    flags[k] = v === undefined ? true : v;
  }
  if (!flags.fused && byTib.has(tib)) { errors.push(`${where}: duplicate tib ${tib}`); continue; }
  if (!r.set || !setOrder.has(r.set)) errors.push(`${where}: unknown or missing @set (${r.set})`);
  const wylie = toWylie(tib);
  let id = wylieToId(wylie) || 'w';
  if (idsUsed.has(id)) {
    let n = 2;
    while (idsUsed.has(`${id}-${n}`)) n++;
    id = `${id}-${n}`;
  }
  idsUsed.add(id);
  const w = {
    tib,
    tr: { ru, en },
    wylie,
    pos: pos || 'noun',
    set: r.set,
    source: `${BOOK}, ${lessonLabel(r.set)}, p. ${page || '?'}`,
    trOrigin: { ru: 'machine', en: 'textbook' },
  };
  if (flags.fused) w.fused = true;
  if (flags.lemma) w.lemma = normTib(flags.lemma);
  if (!ru) warnings.push(`${where}: ${tib} has no ru`);
  if (!en) warnings.push(`${where}: ${tib} has no en`);
  words[id] = w;
  if (!w.fused) byTib.set(tib, id);
}
words.shad = {
  tib: SHAD,
  tr: { ru: 'шад — вертикальная черта в конце предложения', en: 'shad — the stroke that ends a sentence' },
  wylie: '/',
  pos: 'punct',
  set: sets[0].id,
  source: 'service token',
  trOrigin: { ru: 'machine', en: 'machine' },
  service: true,
};
byTib.set(SHAD, 'shad');

for (const w of Object.values(words)) {
  if (w.lemma) {
    const lid = byTib.get(w.lemma);
    if (!lid) warnings.push(`lemma ${w.lemma} of ${w.tib} is not in the word list`);
    w.lemma = lid || w.lemma;
  }
}

// ---- segmentation table: standalone surfaces + fused surfaces ----
const fusedIds = Object.entries(words).filter(([, w]) => w.fused).map(([id]) => id);
const surfaces = new Map(); // surface -> [ids]
for (const [tib, id] of byTib) surfaces.set(tib, [id]);
for (const [id, w] of Object.entries(words)) {
  if (w.fused || w.service) continue;
  const et = endingType(w.tib);
  if (et === 'closed') continue;
  for (const pid of fusedIds) {
    const surf = fuseParticle(w.tib, words[pid].tib);
    if (!surfaces.has(surf)) surfaces.set(surf, [id, pid]);
  }
}
const maxLen = Math.max(...[...surfaces.keys()].map((t) => t.length));

function segment(tibRaw, where) {
  const text = tibRaw.replace(/\s+/g, '');
  // "+" forces a word boundary; "།" ends a clause and becomes the shad token
  const chunks = [];
  for (const clause of text.split(SHAD)) {
    if (!clause) continue;
    for (const c of clause.split('+')) if (c) chunks.push({ text: c, shad: false });
    if (chunks.length) chunks[chunks.length - 1].shad = true;
  }
  if (chunks.length && !text.endsWith(SHAD)) chunks[chunks.length - 1].shad = false;
  const ids = [];
  for (const { text: chunkText, shad } of chunks) {
    let chunk = chunkText;
    if (!chunk.endsWith(TSHEG)) chunk += TSHEG;
    let pos = 0;
    while (pos < chunk.length) {
      let found = null;
      for (let len = Math.min(maxLen, chunk.length - pos); len > 0; len--) {
        const cand = chunk.slice(pos, pos + len);
        if (!cand.endsWith(TSHEG)) continue;
        if (surfaces.has(cand)) { found = cand; break; }
      }
      if (!found) {
        errors.push(`${where}: cannot segment at "${chunk.slice(pos, pos + 14)}" in ${tibRaw}`);
        return null;
      }
      ids.push(...surfaces.get(found));
      pos += found.length;
    }
    if (shad) ids.push('shad');
  }
  return ids;
}

// ---- sentences ----
const sentences = [];
for (const r of readRows('sentences')) {
  const [page, tib, enOrigin, en, ru, noteEn, noteRu] = r.cols;
  const where = r.line;
  if (!r.set || !setOrder.has(r.set)) { errors.push(`${where}: unknown or missing @set (${r.set})`); continue; }
  if (!tib) { errors.push(`${where}: empty tib`); continue; }
  const ids = segment(tib, where);
  if (!ids) continue;
  const rendered = renderTib(ids, words);
  const expected = tib.replace(/[\s+]/g, '');
  if (rendered !== expected && rendered !== expected + TSHEG && rendered + TSHEG !== expected) {
    warnings.push(`${where}: rendered text differs from source: ${rendered} vs ${expected}`);
  }
  const s = {
    id: null,
    words: ids,
    tr: { ru, en },
    set: r.set,
    source: `${BOOK}, ${lessonLabel(r.set)}, p. ${page || '?'}`,
    trOrigin: { ru: 'machine', en: enOrigin === 'textbook' ? 'textbook' : 'machine' },
  };
  if (noteEn || noteRu) s.note = { ru: noteRu || '', en: noteEn || '' };
  if (!en) warnings.push(`${where}: no en`);
  if (!ru) warnings.push(`${where}: no ru`);
  sentences.push(s);
}
sentences.sort((a, b) => setOrder.get(a.set) - setOrder.get(b.set));
sentences.forEach((s, i) => { s.id = `s${String(i + 1).padStart(3, '0')}`; });

// ---- extra languages (content/lang-<xx>.tsv, keyed by English) ----
const langFiles = readdirSync(CONTENT).filter((f) => /^lang-[a-z]{2}\.tsv$/.test(f)).sort();
const extraLangs = [];
const langStats = {};
for (const file of langFiles) {
  const lang = file.slice(5, 7);
  extraLangs.push(lang);
  const maps = { sets: new Map(), words: new Map(), sentences: new Map(), notes: new Map() };
  let section = null;
  readFileSync(join(CONTENT, file), 'utf8').split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    if (t.startsWith('@')) { section = t.slice(1).trim(); return; }
    const idx = t.lastIndexOf('|');
    if (idx < 0 || !maps[section]) { warnings.push(`${file}:${i + 1}: bad line`); return; }
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim();
    if (val) maps[section].set(key, val);
  });
  const stat = { sets: 0, words: 0, sentences: 0, notes: 0, missing: [] };
  for (const s of sets) {
    const v = maps.sets.get(s.name.en);
    if (v) { s.name[lang] = v; stat.sets++; } else stat.missing.push(`set: ${s.name.en}`);
  }
  for (const [id, w] of Object.entries(words)) {
    if (w.service) continue;
    const v = maps.words.get(w.tr.en);
    if (v) { w.tr[lang] = v; w.trOrigin[lang] = 'machine'; stat.words++; } else stat.missing.push(`word ${id}: ${w.tr.en}`);
  }
  for (const s of sentences) {
    const v = maps.sentences.get(s.tr.en);
    if (v) { s.tr[lang] = v; s.trOrigin[lang] = 'machine'; stat.sentences++; } else stat.missing.push(`${s.id}: ${s.tr.en}`);
    if (s.note && s.note.en) {
      const n = maps.notes.get(s.note.en);
      if (n) { s.note[lang] = n; stat.notes++; } else stat.missing.push(`${s.id} note: ${s.note.en}`);
    }
  }
  langStats[lang] = stat;
  for (const m of stat.missing.slice(0, 20)) warnings.push(`lang ${lang} missing: ${m}`);
  if (stat.missing.length > 20) warnings.push(`lang ${lang}: ${stat.missing.length - 20} more missing`);
}
words.shad.tr = { ...words.shad.tr };

// a word belongs to the set of the first sentence that uses it
const firstSet = new Map();
const firstIdx = new Map();
sentences.forEach((s, i) => s.words.forEach((id) => {
  if (!firstSet.has(id)) { firstSet.set(id, s.set); firstIdx.set(id, i); }
}));
for (const [id, w] of Object.entries(words)) {
  if (w.service) continue;
  const fs = firstSet.get(id);
  if (fs && setOrder.get(fs) < setOrder.get(w.set)) w.set = fs;
}
const ordered = Object.entries(words).sort((a, b) => {
  const sa = a[1].service ? 1e6 : setOrder.get(a[1].set);
  const sb = b[1].service ? 1e6 : setOrder.get(b[1].set);
  if (sa !== sb) return sa - sb;
  const ia = firstIdx.has(a[0]) ? firstIdx.get(a[0]) : 1e9;
  const ib = firstIdx.has(b[0]) ? firstIdx.get(b[0]) : 1e9;
  if (ia !== ib) return ia - ib;
  return a[1].tib.localeCompare(b[1].tib);
});
const wordsOut = Object.fromEntries(ordered);

if (errors.length) {
  console.error('BUILD ERRORS:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
for (const w of warnings) console.warn('warning: ' + w);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'sets.json'), JSON.stringify(sets, null, 2) + '\n');
writeFileSync(join(OUT, 'words.json'), JSON.stringify(wordsOut, null, 2) + '\n');
writeFileSync(join(OUT, 'sentences.json'), JSON.stringify(sentences, null, 2) + '\n');

// ---- CONTENT_REVIEW.md ----
let notes = '';
try { notes = readFileSync(join(CONTENT, 'review-notes.md'), 'utf8'); } catch { notes = ''; }
const langs = ['en', 'ru', ...extraLangs];
const L = [];
L.push('# Content review');
L.push('');
L.push('Generated by `node scripts/build-content.mjs`. Hand-written notes live in `content/review-notes.md`.');
L.push('');
L.push(notes.trim());
L.push('');
L.push('## Machine translations');
L.push('');
L.push('| language | sentences (machine / total) | words (machine / total) | notes |');
L.push('|---|---|---|---|');
for (const lang of langs) {
  const sm = sentences.filter((s) => s.trOrigin[lang] === 'machine').length;
  const st = sentences.filter((s) => s.tr[lang]).length;
  const wm = Object.values(wordsOut).filter((w) => !w.service && w.trOrigin[lang] === 'machine').length;
  const wt = Object.values(wordsOut).filter((w) => !w.service && w.tr[lang]).length;
  const nt = sentences.filter((s) => s.note && s.note[lang]).length;
  L.push(`| ${lang} | ${sm} / ${st} | ${wm} / ${wt} | ${nt} |`);
}
L.push('');
L.push('English comes from the handbook except for exercise sentences (no answer key), which we translated. Russian, German, French and Polish are our translations made from the English.');
for (const lang of langs) {
  const list = sentences.filter((s) => s.trOrigin[lang] === 'machine');
  if (!list.length) continue;
  L.push('');
  L.push(`### ${lang}: sentences to be checked (${list.length})`);
  L.push('');
  L.push(lang === 'en' ? '| id | set | Tibetan | en |' : `| id | set | Tibetan | en | ${lang} |`);
  L.push(lang === 'en' ? '|---|---|---|---|' : '|---|---|---|---|---|');
  for (const s of list) {
    const row = [s.id, s.set, renderTib(s.words, wordsOut), s.tr.en];
    if (lang !== 'en') row.push(s.tr[lang]);
    L.push(`| ${row.join(' | ')} |`);
  }
}
L.push('');
writeFileSync(join(ROOT, 'CONTENT_REVIEW.md'), L.join('\n'));

const langSummary = extraLangs.map((l) => `${l}: ${langStats[l].sentences}/${sentences.length} sentences, ${langStats[l].words} words, ${langStats[l].missing.length} missing`).join('; ');
console.log(`sets: ${sets.length}, words: ${Object.keys(wordsOut).length}, sentences: ${sentences.length}, fused surfaces: ${surfaces.size - byTib.size}${langSummary ? '; ' + langSummary : ''}`);
