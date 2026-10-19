// The course: the lesson sets cut into units, a ladder of steps per unit, a
// check at the end of each, and review sessions of due words. Pure functions.
//
// Units are built by splitUnits() at content-build time and shipped as
// site/data/course.json, so an edit of the content cannot silently move the
// unit borders under a learner's feet (the validator rebuilds and compares).
//
// A unit: { id: 'lesson-01/3', module: 'lesson-01', sentences: [ids], words: [ids] }
//   words = the content words that appear for the first time in this unit,
//   counting from the start of the course.
// The alphabet comes first as the module 'alphabet', one unit per part (alphabet.js).

import { contentWords } from './next.js';
import { isKnown, isDue, STATUS } from './progress.js';
import { alphabetModule, examPassed, ALPHABET_MODULE } from './alphabet.js';
import { shuffle } from './check.js';
import { localDay } from './streak.js';

/** A unit closes once it holds this many new words … */
export const UNIT_WORDS = 12;
/** … and at least this many sentences. */
export const UNIT_SENTENCES = 10;
/** A shorter tail of a set joins the previous unit. */
export const TAIL_MIN = 6;
/** Tasks in a unit check and the score that passes it. */
export const CHECK_SIZE = 10;
export const CHECK_PASS = 8;
/** Sentences in one review session at most. */
export const REVIEW_MAX = 20;
/** Sentences up to this many content words are reviewed as "recall", longer ones as tiles. */
export const RECALL_MAX_WORDS = 4;

export const STEPS = ['words', 'tiles', 'meaning', 'recall', 'check'];
/** `step` of a unit record: 1–5 = the current step, PASSED = the check was passed. */
export const PASSED = STEPS.length + 1;


/** Cut the sentences of every set (in set order, sentence order) into units. Deterministic. */
export function splitUnits(sentences, dict, sets) {
  const order = [...sets].sort((a, b) => a.order - b.order);
  const seen = new Set();
  const modules = [];
  for (const set of order) {
    const pool = sentences.filter((s) => s.set === set.id);
    if (!pool.length) continue;
    const units = [];
    let cur = { sentences: [], words: [] };
    const close = () => { units.push(cur); cur = { sentences: [], words: [] }; };
    for (const s of pool) {
      cur.sentences.push(s.id);
      for (const id of contentWords(s, dict)) {
        if (seen.has(id)) continue;
        seen.add(id);
        cur.words.push(id);
      }
      if (cur.words.length >= UNIT_WORDS && cur.sentences.length >= UNIT_SENTENCES) close();
    }
    if (cur.sentences.length) {
      if (cur.sentences.length < TAIL_MIN && units.length) {
        const last = units[units.length - 1];
        last.sentences.push(...cur.sentences);
        last.words.push(...cur.words);
      } else {
        close();
      }
    }
    modules.push({ id: set.id, units: units.map((u, i) => ({ id: `${set.id}/${i + 1}`, module: set.id, ...u })) });
  }
  return modules;
}

/** All modules of the course, the alphabet first. `course` is the parsed course.json. */
export function courseModules(course) {
  return [alphabetModule(), ...((course && course.modules) || [])];
}

/** All units of the course in order. */
export function allUnits(course) {
  return courseModules(course).flatMap((m) => m.units);
}

export function findUnit(course, unitId) {
  return allUnits(course).find((u) => u.id === unitId) || null;
}

function unitRecord(progress, unitId) {
  return (progress.course && progress.course.units && progress.course.units[unitId]) || null;
}

/** The current step of a lesson unit (1 = words … 5 = check, PASSED = done). */
export function unitStep(progress, unit) {
  const r = unitRecord(progress, unit.id);
  return r ? r.step : 1;
}

export function unitPassed(progress, unit) {
  if (unit.module === ALPHABET_MODULE && examPassed(progress)) return true;
  return unitStep(progress, unit) >= PASSED;
}

/** Every new word of the unit is already known: the check can be taken right away. */
export function unitAllKnown(progress, unit) {
  return Boolean(unit.words) && unit.words.every((id) => isKnown(progress, id));
}

/** { passed, total } over all units of the course. */
export function courseProgress(course, progress) {
  const units = allUnits(course);
  return { passed: units.filter((u) => unitPassed(progress, u)).length, total: units.length };
}

/** { passed, total } for one module. */
export function moduleProgress(module, progress) {
  return { passed: module.units.filter((u) => unitPassed(progress, u)).length, total: module.units.length };
}

/**
 * Where "Continue" goes: the unit the learner opened last if it is not passed,
 * otherwise the first unit that is not passed; null when the course is done.
 */
export function currentUnit(course, progress) {
  const units = allUnits(course);
  const cur = progress.course && progress.course.current ? units.find((u) => u.id === progress.course.current) : null;
  if (cur && !unitPassed(progress, cur)) return cur;
  return units.find((u) => !unitPassed(progress, u)) || null;
}

export function nextUnit(course, unit) {
  const units = allUnits(course);
  const i = units.findIndex((u) => u.id === unit.id);
  return i >= 0 ? units[i + 1] || null : null;
}

/** Sentences of a unit, shortest first (ties keep the unit order). */
export function unitSentences(unit, sentences, dict) {
  const byId = new Map(sentences.map((s) => [s.id, s]));
  const list = unit.sentences.map((id) => byId.get(id)).filter(Boolean);
  return list.map((s, i) => ({ s, n: contentWords(s, dict).length, i })).sort((a, b) => a.n - b.n || a.i - b.i).map((x) => x.s);
}

/** Sentences still to solve in the current step of a unit, in step order. */
export function stepQueue(unit, progress, sentences, dict) {
  const r = unitRecord(progress, unit.id);
  const done = new Set(r ? r.done : []);
  return unitSentences(unit, sentences, dict).filter((s) => !done.has(s.id));
}

/** The tasks of a unit check: random sentences, tiles and recall in turn. */
export function makeCheck(unit, sentences, random = Math.random) {
  const byId = new Map(sentences.map((s) => [s.id, s]));
  const pool = shuffle(unit.sentences.map((id) => byId.get(id)).filter(Boolean), random);
  const tasks = [];
  for (let i = 0; i < Math.min(CHECK_SIZE, pool.length); i++) {
    tasks.push({ sentence: pool[i], exercise: i % 2 === 0 ? 'tiles' : 'recall' });
  }
  return tasks;
}

/** The score that passes a check of `size` tasks (8 of 10, scaled for a short unit). */
export function passScore(size) {
  return Math.min(size, Math.ceil((size * CHECK_PASS) / CHECK_SIZE));
}

/**
 * A review session: sentences of the passed units that cover the words whose
 * review day has come, greedy by coverage, at most REVIEW_MAX. Each task is
 * { sentence, exercise } — recall for short sentences, tiles for long ones.
 */
export function reviewSession(course, progress, sentences, dict, today = localDay(), limit = REVIEW_MAX) {
  const passed = new Set(allUnits(course).filter((u) => u.sentences && unitPassed(progress, u)).flatMap((u) => u.sentences));
  const due = new Set(Object.keys(progress.words).filter((id) => dict[id] && !dict[id].service && isDue(progress, id, today)));
  if (!due.size) return [];
  let cands = sentences
    .filter((s) => passed.has(s.id))
    .map((s) => ({ s, words: contentWords(s, dict), hits: contentWords(s, dict).filter((id) => due.has(id)) }))
    .filter((x) => x.hits.length && x.words.every((id) => isKnown(progress, id)));
  const out = [];
  const covered = new Set();
  while (cands.length && out.length < limit) {
    cands.sort((a, b) => b.hits.length - a.hits.length || a.words.length - b.words.length);
    const best = cands.shift();
    if (!best.hits.length) break;
    out.push({ sentence: best.s, exercise: best.words.length <= RECALL_MAX_WORDS ? 'recall' : 'tiles' });
    for (const id of best.hits) covered.add(id);
    cands = cands.map((x) => ({ ...x, hits: x.hits.filter((id) => !covered.has(id)) })).filter((x) => x.hits.length);
  }
  return out;
}

/** Ids of the known words whose review day has come (what the "Review N words" button counts). */
export function dueCount(progress, dict, today = localDay()) {
  return Object.keys(progress.words).filter((id) => dict[id] && !dict[id].service && progress.words[id].status === STATUS.KNOWN && isDue(progress, id, today)).length;
}
