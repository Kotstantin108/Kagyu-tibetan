// Every word of the course with its Wylie and its generated pronunciation, as TSV for a reviewer.
// Usage: node scripts/tools/phonetics-review.mjs > phonetics-review.tsv
import { readFileSync } from 'node:fs';
import { toPhonetics } from '../../site/src/engine/phonetics.js';

const words = JSON.parse(readFileSync(new URL('../../site/data/words.json', import.meta.url), 'utf8'));
const out = ['# id\ttib\twylie\tphonetics\ten\tset'];
for (const [id, w] of Object.entries(words)) {
  if (w.service) continue;
  out.push([id, w.tib, w.wylie, toPhonetics(w.tib), w.tr.en, w.set].join('\t'));
}
process.stdout.write(out.join('\n') + '\n');
