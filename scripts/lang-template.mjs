// Writes (or refreshes) content/lang-<xx>.tsv: every English string of the
// course (set names, word glosses, sentences, notes) with the existing
// translation next to it, so the missing ones can be filled in.
//
//   node scripts/lang-template.mjs de
//
// Run scripts/build-content.mjs first; this reads site/data/*.json.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lang = process.argv[2];
if (!lang || !/^[a-z]{2}$/.test(lang)) { console.error('usage: node scripts/lang-template.mjs <xx>'); process.exit(1); }
const file = join(ROOT, 'content', `lang-${lang}.tsv`);

const existing = { sets: new Map(), words: new Map(), sentences: new Map(), notes: new Map() };
if (existsSync(file)) {
  let section = null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.startsWith('@')) { section = t.slice(1).trim(); continue; }
    const idx = t.lastIndexOf('|');
    if (idx < 0 || !existing[section]) continue;
    const v = t.slice(idx + 1).trim();
    if (v) existing[section].set(t.slice(0, idx).trim(), v);
  }
}

const sets = JSON.parse(readFileSync(join(ROOT, 'site/data/sets.json'), 'utf8'));
const words = JSON.parse(readFileSync(join(ROOT, 'site/data/words.json'), 'utf8'));
const sentences = JSON.parse(readFileSync(join(ROOT, 'site/data/sentences.json'), 'utf8'));

const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const sections = {
  sets: uniq(sets.map((s) => s.name.en)),
  words: uniq(Object.values(words).filter((w) => !w.service).map((w) => w.tr.en)),
  sentences: uniq(sentences.map((s) => s.tr.en)),
  notes: uniq(sentences.map((s) => s.note && s.note.en)),
};

const out = [`# ${lang}: translations keyed by the English text. Lines: english | translation`, ''];
let missing = 0;
for (const [name, keys] of Object.entries(sections)) {
  out.push(`@${name}`);
  for (const k of keys) {
    const v = existing[name].get(k) || '';
    if (!v) missing++;
    out.push(`${k} | ${v}`);
  }
  out.push('');
}
writeFileSync(file, out.join('\n'));
console.log(`${file}: sets ${sections.sets.length}, words ${sections.words.length}, sentences ${sections.sentences.length}, notes ${sections.notes.length}; missing ${missing}`);
