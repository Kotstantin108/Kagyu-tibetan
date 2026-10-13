// Grammar notes related to a sentence. Pure functions, no DOM.
//
// A "note" is the textbook remark attached to a sentence (`sentence.note`,
// {en, ru, …}). Several sentences of a set share the same note text; such a
// group is one entry here, with the sentences as its examples.

import { contentWords } from './next.js';

/** Entries { note, examples[] } of one set, deduplicated by the English text, in sentence order. */
function notesOfSet(setId, sentences) {
  const entries = [];
  const byText = new Map();
  for (const s of sentences) {
    if (s.set !== setId || !s.note || !s.note.en) continue;
    let e = byText.get(s.note.en);
    if (!e) { e = { note: s.note, examples: [] }; byText.set(s.note.en, e); entries.push(e); }
    e.examples.push(s);
  }
  return entries;
}

/** How many sentences of the set use each word id (rare shared words count more). */
function wordFrequency(setId, sentences, dict) {
  const freq = new Map();
  for (const s of sentences) {
    if (s.set !== setId) continue;
    for (const id of contentWords(s, dict)) freq.set(id, (freq.get(id) || 0) + 1);
  }
  return freq;
}

/**
 * Notes that help with `sentence`: its own note first (example: the sentence
 * itself), then up to `limit` other notes of the same set whose example
 * sentences share words with it, best match first. Each entry is
 * { note, example, own, shared }, `example` being one sentence.
 */
export function relatedNotes(sentence, sentences, sets, dict, limit = 3) {
  const out = [];
  const ownText = sentence.note && sentence.note.en ? sentence.note.en : null;
  if (ownText) out.push({ note: sentence.note, example: sentence, own: true, shared: [] });

  const words = new Set(contentWords(sentence, dict));
  const freq = wordFrequency(sentence.set, sentences, dict);
  const weight = (id) => 1 / (freq.get(id) || 1);
  const scored = [];
  for (const entry of notesOfSet(sentence.set, sentences)) {
    if (entry.note.en === ownText) continue;
    let best = null;
    for (const ex of entry.examples) {
      if (ex.id === sentence.id) continue;
      const shared = contentWords(ex, dict).filter((id) => words.has(id));
      if (!shared.length) continue;
      const score = shared.reduce((sum, id) => sum + weight(id), 0);
      if (!best || score > best.score) best = { score, example: ex, shared };
    }
    if (best) scored.push({ note: entry.note, example: best.example, own: false, shared: best.shared, score: best.score, order: scored.length });
  }
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  for (const e of scored.slice(0, limit)) out.push({ note: e.note, example: e.example, own: false, shared: e.shared });
  return out;
}

/**
 * The note to show when `wordId` was misplaced: for a particle, the note of
 * the same set whose examples use that particle (the best-matching one);
 * otherwise the sentence's own note. Null when there is nothing to show.
 */
export function noteForWord(sentence, wordId, sentences, sets, dict) {
  const w = dict[wordId];
  const own = sentence.note && sentence.note.en ? { note: sentence.note, example: sentence, own: true, shared: [] } : null;
  if (!w || w.pos !== 'particle') return own;
  const ownText = own ? own.note.en : null;
  if (ownText && contentWords(sentence, dict).includes(wordId)) {
    // the sentence's own note mentions the particle through its example (this sentence)
    const related = relatedNotes(sentence, sentences, sets, dict, 50).filter((e) => !e.own && e.shared.includes(wordId));
    if (!related.length) return own;
    // prefer a note whose examples all use the particle: it is about that particle
    const about = related.find((e) => notesOfSet(sentence.set, sentences).find((n) => n.note.en === e.note.en).examples.every((ex) => contentWords(ex, dict).includes(wordId)));
    return about || own;
  }
  const related = relatedNotes(sentence, sentences, sets, dict, 50).filter((e) => !e.own && e.shared.includes(wordId));
  return related[0] || own;
}
