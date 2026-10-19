// The brief for writing a lesson's theory text (see content/intro/PROMPT.md):
//   node scripts/intro-brief.mjs <set id> [--book <text file>] [--max-lines N]
// Prints the lesson's title in every language, the textbook remarks with
// their example sentences, every sentence rendered as the app shows it, the
// new words of the lesson and, with --book, the lesson's chapter of the
// textbook (found by its "LESSON n" / "Lesson n" heading) as a reference.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTib } from '../site/src/engine/tib.js';
import { contentWords } from '../site/src/engine/next.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'site', 'data');
const LANGS = ['en', 'ru', 'de', 'fr', 'pl'];

const args = process.argv.slice(2);
const setId = args.find((a) => !a.startsWith('--'));
const book = args.includes('--book') ? args[args.indexOf('--book') + 1] : null;
const maxLines = args.includes('--max-lines') ? Number(args[args.indexOf('--max-lines') + 1]) : 320;
if (!setId) { console.error('usage: node scripts/intro-brief.mjs <set id> [--book <text file>]'); process.exit(2); }

const json = (n) => JSON.parse(readFileSync(join(DATA, n), 'utf8'));
const sets = json('sets.json');
const words = json('words.json');
const sentences = json('sentences.json');
const course = json('course.json');

const set = sets.find((s) => s.id === setId);
if (!set) { console.error(`unknown set ${setId}`); process.exit(2); }
const pool = sentences.filter((s) => s.set === setId);
const mod = course.modules.find((m) => m.id === setId);
const newWords = mod ? mod.units.flatMap((u) => u.words) : [];

const out = [];
out.push(`# Brief: ${setId}`);
out.push('');
out.push('## Title of the lesson in the app');
for (const l of LANGS) if (set.title && set.title[l]) out.push(`- ${l}: ${set.title[l]}`);
out.push('');
out.push('## The textbook remarks, in order (each with the sentence it was attached to)');
const seen = new Set();
for (const s of pool) {
  const n = s.note && s.note.en;
  if (!n || seen.has(n)) continue;
  seen.add(n);
  out.push(`- ${n}  ::  ${renderTib(s.words, words)}  |  ${s.tr.en}`);
}
out.push('');
out.push('## Sentences of the lesson (rendered as the app shows them; copy examples from here verbatim)');
for (const s of pool) {
  const tr = LANGS.filter((l) => s.tr[l]).map((l) => `${l}: ${s.tr[l]}`).join('  |  ');
  out.push(`- ${renderTib(s.words, words)}  |  ${tr}`);
}
out.push('');
out.push('## New words of the lesson');
for (const id of newWords) {
  const w = words[id];
  if (!w) continue;
  const tr = LANGS.filter((l) => w.tr && w.tr[l]).map((l) => `${l}: ${w.tr[l]}`).join('  |  ');
  out.push(`- ${w.tib} (${w.wylie}, ${w.pos || '?'})  |  ${tr}`);
}
out.push('');
const extraIds = new Set();
for (const s of pool) for (const id of contentWords(s, words)) if (!newWords.includes(id)) extraIds.add(id);
if (extraIds.size) {
  out.push('## Other words that appear in the sentences (already taught)');
  for (const id of extraIds) { const w = words[id]; if (w) out.push(`- ${w.tib} (${w.wylie})  |  en: ${w.tr.en}`); }
  out.push('');
}

if (book) {
  const n = Number((setId.match(/(\d+)/) || [])[1]);
  const lines = readFileSync(book, 'utf8').split(/\r?\n/);
  const isHead = (line, k) => new RegExp(`^\\s*(LESSON|Lesson)\\s+${k}\\s*$`).test(line);
  // the heading occurs in the table of contents and in answer keys too: take the one that opens the longest section
  const anyHead = (line) => /^\s*(LESSON|Lesson)\s+\d+\s*$/.test(line);
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (!isHead(lines[i], n)) continue;
    let e = lines.length;
    for (let j = i + 1; j < lines.length; j++) if (anyHead(lines[j])) { e = j; break; }
    if (start < 0 || e - i > end - start) { start = i; end = e; }
  }
  if (start < 0) {
    out.push(`## Textbook reference: heading for lesson ${n} not found in ${book}`);
  } else {
    const chunk = lines.slice(start, Math.min(end, start + maxLines)).map((l) => l.replace(/\s+$/, '')).filter((l, i, a) => l || (a[i - 1] && a[i - 1] !== ''));
    out.push(`## Textbook reference (scope and order only; do not copy; ${end - start > maxLines ? 'truncated' : 'complete'})`);
    out.push('');
    out.push(...chunk);
  }
}

process.stdout.write(out.join('\n') + '\n');
