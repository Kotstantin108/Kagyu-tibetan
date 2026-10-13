// Writes the list of texts to synthesise: every dictionary word and every
// sentence (rendered with the fused particles, like the app shows them).
// Usage: node scripts/tools/tts-texts.mjs > tts-texts.json

import { readFileSync } from 'node:fs';
import { renderTib } from '../../site/src/engine/tib.js';

const words = JSON.parse(readFileSync(new URL('../../site/data/words.json', import.meta.url), 'utf8'));
const sentences = JSON.parse(readFileSync(new URL('../../site/data/sentences.json', import.meta.url), 'utf8'));

const out = [];
for (const [id, w] of Object.entries(words)) {
  if (w.service) continue;
  out.push({ id: `w-${id}`, text: w.tib });
}
for (const s of sentences) out.push({ id: s.id, text: renderTib(s.words, words) });
process.stdout.write(JSON.stringify(out));
console.error(`${out.length} texts (${Object.keys(words).length} words, ${sentences.length} sentences)`);
