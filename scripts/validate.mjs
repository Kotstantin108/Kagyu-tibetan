// Validates site/data/{words,sentences,sets,course,alphabet,intro}.json.
//   node scripts/validate.mjs
// Exit code 1 on errors; warnings do not fail the run.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitUnits } from '../site/src/engine/course.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'site', 'data');
const REQUIRED_LANGS = ['ru', 'en'];

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function readJson(name) {
  const raw = readFileSync(join(DATA, name), 'utf8');
  // duplicate top-level keys are silently collapsed by JSON.parse, so count them in the raw text
  return { raw, data: JSON.parse(raw) };
}

const { data: sets } = readJson('sets.json');
const { raw: wordsRaw, data: words } = readJson('words.json');
const { data: sentences } = readJson('sentences.json');
const { data: course } = readJson('course.json');
const { data: alphabet } = readJson('alphabet.json');
const { data: intro } = readJson('intro.json');

// ---- the alphabet: counts, every language, look-alikes and examples that exist ----
{
  const want = { letter: 30, vowel: 4, subjoined: 4, superscribed: 3, prefix: 5, suffix: 10 };
  const letters = alphabet.letters || [];
  for (const [kind, n] of Object.entries(want)) {
    const have = letters.filter((l) => l.kind === kind).length;
    if (have !== n) err(`alphabet: ${have} entries of kind ${kind}, expected ${n}`);
  }
  const glyphs = new Set(letters.filter((l) => l.kind === 'letter').map((l) => l.tib));
  for (const l of letters) {
    for (const lang of ['en', 'ru', 'de', 'fr', 'pl']) if (!l.sound || !l.sound[lang]) err(`alphabet: ${l.tib} (${l.kind}) has no sound text in ${lang}`);
    if (l.kind === 'letter') for (const s of l.similar || []) if (!glyphs.has(s)) err(`alphabet: ${l.tib}: look-alike ${s} is not a letter`);
    for (const id of l.examples || []) if (!words[id]) err(`alphabet: ${l.tib}: example word ${id} does not exist`);
  }
  for (let n = 1; n <= 15; n++) {
    const intro = (alphabet.intros || {})[String(n)];
    if (!intro) { err(`alphabet: no introduction for part ${n}`); continue; }
    for (const lang of ['en', 'ru', 'de', 'fr', 'pl']) if (!intro[lang]) err(`alphabet: part ${n} has no introduction in ${lang}`);
  }
}

// ---- the theory texts: every lesson in every language, made of the course's words ----
{
  const langs = ['en', 'ru', 'de', 'fr', 'pl'];
  for (const set of sets) {
    const m = intro[set.id];
    if (!m) { err(`intro: ${set.id} has no theory text`); continue; }
    for (const lang of langs) {
      const paras = m[lang];
      if (!paras || !paras.length) { err(`intro: ${set.id} has no theory text in ${lang}`); continue; }
      let unread = 0;
      for (const para of paras) {
        for (const tok of para) {
          if (typeof tok === 'string') continue;
          if (!tok.pieces) { if ((tok.tib.match(/་/g) || []).length >= 2) unread++; continue; }
          for (const piece of tok.pieces) for (const id of piece.ids) if (!words[id]) err(`intro: ${set.id} ${lang}: unknown word ${id}`);
        }
      }
      if (unread) warn(`intro: ${set.id} ${lang}: ${unread} Tibetan runs are not made of the course's words (no word help)`);
    }
  }
  for (const id of Object.keys(intro)) if (!sets.some((s) => s.id === id)) err(`intro: ${id} is not a set`);
}

// ---- course units: the shipped file must be what the splitter gives for this content ----
{
  const rebuilt = JSON.stringify({ modules: splitUnits(sentences, words, sets) });
  if (rebuilt !== JSON.stringify(course)) err('course.json is stale: run npm run build:content (unit borders changed; learners keep unit ids in their progress)');
  const seen = new Set();
  for (const m of course.modules || []) {
    for (const u of m.units || []) {
      if (!u.sentences || !u.sentences.length) err(`course unit ${u.id} has no sentences`);
      for (const id of u.sentences) { if (seen.has(id)) err(`sentence ${id} is in two course units`); seen.add(id); }
    }
  }
  for (const s of sentences) if (!seen.has(s.id)) err(`sentence ${s.id} is in no course unit`);
}

// languages present anywhere in the data
const langSet = new Set(REQUIRED_LANGS);
for (const s of sets) for (const k of Object.keys(s.name || {})) langSet.add(k);
for (const w of Object.values(words)) for (const k of Object.keys(w.tr || {})) langSet.add(k);
for (const s of sentences) for (const k of Object.keys(s.tr || {})) langSet.add(k);
const LANGS = [...langSet];

// ---- duplicate ids ----
const keyCounts = new Map();
for (const m of wordsRaw.matchAll(/^  "([^"]+)": \{/gm)) keyCounts.set(m[1], (keyCounts.get(m[1]) || 0) + 1);
for (const [k, n] of keyCounts) if (n > 1) err(`duplicate word id ${k} (${n} times)`);
const sentIds = new Map();
for (const s of sentences) sentIds.set(s.id, (sentIds.get(s.id) || 0) + 1);
for (const [k, n] of sentIds) if (n > 1) err(`duplicate sentence id ${k} (${n} times)`);
const setIds = new Map();
for (const s of sets) setIds.set(s.id, (setIds.get(s.id) || 0) + 1);
for (const [k, n] of setIds) if (n > 1) err(`duplicate set id ${k} (${n} times)`);

// ---- sets ----
const setOrder = new Map(sets.map((s) => [s.id, s.order]));
for (const s of sets) {
  for (const lang of REQUIRED_LANGS) if (!s.name || !s.name[lang]) warn(`set ${s.id}: missing ${lang} name`);
}

// ---- words ----
const LATIN = /[A-Za-z]/;
const TIB_ALLOWED = /^[ༀ-࿿]+$/u;
const machine = {};
const coverage = {};
for (const lang of LANGS) { machine[lang] = { words: 0, sentences: 0 }; coverage[lang] = { words: 0, sentences: 0, notes: 0 }; }
let wordCount = 0;
for (const [id, w] of Object.entries(words)) {
  if (!w.tib || !w.tib.trim()) err(`word ${id}: empty tib`);
  else {
    if (LATIN.test(w.tib)) err(`word ${id}: latin letters in tib "${w.tib}"`);
    if (w.tib !== w.tib.trim() || /\s/.test(w.tib)) err(`word ${id}: whitespace in tib "${w.tib}"`);
    if (!TIB_ALLOWED.test(w.tib)) err(`word ${id}: non-Tibetan characters in tib "${w.tib}"`);
  }
  for (const lang of REQUIRED_LANGS) if (!w.tr || !w.tr[lang]) warn(`word ${id}: missing ${lang} translation`);
  if (!w.service && !setOrder.has(w.set)) err(`word ${id}: unknown set ${w.set}`);
  if (w.service) continue;
  wordCount++;
  for (const lang of LANGS) {
    if (w.tr && w.tr[lang]) coverage[lang].words++;
    if (w.trOrigin && w.trOrigin[lang] === 'machine') machine[lang].words++;
  }
}

// ---- sentences ----
const used = new Set();
const seen = new Set();
const multiNew = [];
let noteCount = 0;
const ordered = [...sentences].sort((a, b) => (setOrder.get(a.set) ?? 1e9) - (setOrder.get(b.set) ?? 1e9));
for (const s of ordered) {
  if (!s.id) err('sentence without id');
  if (!setOrder.has(s.set)) err(`sentence ${s.id}: unknown set ${s.set}`);
  if (!Array.isArray(s.words) || !s.words.length) err(`sentence ${s.id}: empty words`);
  const fresh = [];
  for (const id of s.words || []) {
    if (!words[id]) { err(`sentence ${s.id}: unknown word id ${id}`); continue; }
    used.add(id);
    if (!words[id].service && !seen.has(id)) { seen.add(id); fresh.push(id); }
  }
  if (fresh.length > 1) multiNew.push({ id: s.id, set: s.set, fresh });
  for (const lang of REQUIRED_LANGS) if (!s.tr || !s.tr[lang]) warn(`sentence ${s.id}: missing ${lang} translation`);
  if (s.note) {
    noteCount++;
    for (const lang of REQUIRED_LANGS) if (!s.note[lang]) warn(`sentence ${s.id}: note has no ${lang}`);
  }
  for (const lang of LANGS) {
    if (s.tr && s.tr[lang]) coverage[lang].sentences++;
    if (s.note && s.note[lang]) coverage[lang].notes++;
    if (s.trOrigin && s.trOrigin[lang] === 'machine') machine[lang].sentences++;
  }
}

// ---- per-set stats ----
const perSet = sets.map((set) => ({
  id: set.id,
  words: Object.values(words).filter((w) => w.set === set.id && !w.service).length,
  sentences: sentences.filter((s) => s.set === set.id).length,
}));

const unused = Object.entries(words).filter(([id, w]) => !w.service && !used.has(id));

// ---- report ----
console.log('== Sets ==');
for (const p of perSet) console.log(`  ${p.id.padEnd(12)} words: ${String(p.words).padStart(4)}  sentences: ${String(p.sentences).padStart(4)}`);
console.log(`  total        words: ${String(wordCount).padStart(4)}  sentences: ${String(sentences.length).padStart(4)}`);
console.log('== Translations: coverage (machine) ==');
for (const lang of LANGS) {
  const c = coverage[lang]; const m = machine[lang];
  console.log(`  ${lang}: words ${c.words}/${wordCount} (${m.words} machine), sentences ${c.sentences}/${sentences.length} (${m.sentences} machine), notes ${c.notes}/${noteCount}`);
}
console.log(`== Words not used in any sentence: ${unused.length} ==`);
for (const [id, w] of unused) console.log(`  ${id} ${w.tib} (${w.set})`);
console.log(`== Sentences introducing more than one new word: ${multiNew.length} ==`);
for (const m of multiNew) console.log(`  ${m.id} (${m.set}): ${m.fresh.join(', ')}`);
console.log(`== Warnings: ${warnings.length} ==`);
for (const w of warnings) console.log('  ' + w);
console.log(`== Errors: ${errors.length} ==`);
for (const e of errors) console.log('  ' + e);
process.exit(errors.length ? 1 : 0);
