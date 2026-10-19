// Merging two progress records (local and remote). Pure function.
// - words and sentences: the entry with the later updatedAt/lastSolved wins;
// - reading: rounds and best are maxima, updatedAt the later one;
// - course: per unit the record with the larger step wins; at the same step
//   the solved lists unite and best/attempts are maxima; started is an OR,
//   canRead and current come from the record with the later updatedAt;
//   theory (read pages) is the union;
// - streak: best is the maximum; current/lastDay/today* come from the record
//   with the later lastDay (ties: the one with the larger current);
// - settings: from the record with the later updatedAt.

import { normalizeProgress } from './progress.js';

function later(a, b) {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  if (Number.isNaN(ta)) return false;
  if (Number.isNaN(tb)) return true;
  return ta > tb;
}

/** A missing record (no file on Drive yet, nothing stored) must never win by its fresh updatedAt. */
function sideOf(raw, now) {
  const p = normalizeProgress(raw, now);
  return raw && typeof raw === 'object' ? p : { ...p, updatedAt: null };
}

export function mergeProgress(localRaw, remoteRaw, now = new Date()) {
  const local = sideOf(localRaw, now);
  const remote = sideOf(remoteRaw, now);
  const out = normalizeProgress(null, now);

  const wordIds = new Set([...Object.keys(local.words), ...Object.keys(remote.words)]);
  for (const id of wordIds) {
    const a = local.words[id];
    const b = remote.words[id];
    if (!a) { out.words[id] = { ...b }; continue; }
    if (!b) { out.words[id] = { ...a }; continue; }
    const win = later(b.updatedAt, a.updatedAt) ? b : a;
    out.words[id] = { ...win, seen: Math.max(a.seen, b.seen), errors: Math.max(a.errors, b.errors) };
  }

  const sentIds = new Set([...Object.keys(local.sentences), ...Object.keys(remote.sentences)]);
  for (const id of sentIds) {
    const a = local.sentences[id];
    const b = remote.sentences[id];
    if (!a) { out.sentences[id] = { ...b }; continue; }
    if (!b) { out.sentences[id] = { ...a }; continue; }
    const win = later(b.lastSolved, a.lastSolved) ? b : a;
    out.sentences[id] = { ...win, solved: Math.max(a.solved, b.solved) };
  }

  const stageIds = new Set([...Object.keys(local.reading), ...Object.keys(remote.reading)]);
  for (const id of stageIds) {
    const a = local.reading[id];
    const b = remote.reading[id];
    if (!a || !b) { out.reading[id] = { ...(a || b) }; continue; }
    out.reading[id] = { rounds: Math.max(a.rounds, b.rounds), best: Math.max(a.best, b.best), updatedAt: later(b.updatedAt, a.updatedAt) ? b.updatedAt : a.updatedAt };
  }

  const unitIds = new Set([...Object.keys(local.course.units), ...Object.keys(remote.course.units)]);
  for (const id of unitIds) {
    const a = local.course.units[id];
    const b = remote.course.units[id];
    if (!a || !b) { out.course.units[id] = { ...(a || b), done: [...(a || b).done] }; continue; }
    if (a.step !== b.step) { const win = a.step > b.step ? a : b; out.course.units[id] = { ...win, done: [...win.done], best: Math.max(a.best, b.best), attempts: Math.max(a.attempts, b.attempts) }; continue; }
    out.course.units[id] = {
      step: a.step,
      done: [...new Set([...a.done, ...b.done])],
      best: Math.max(a.best, b.best),
      attempts: Math.max(a.attempts, b.attempts),
      passedAt: a.passedAt && b.passedAt ? (later(b.passedAt, a.passedAt) ? a.passedAt : b.passedAt) : a.passedAt || b.passedAt,
      updatedAt: later(b.updatedAt, a.updatedAt) ? b.updatedAt : a.updatedAt,
    };
  }
  const newer = later(remote.updatedAt, local.updatedAt) ? remote : local;
  const older = newer === remote ? local : remote;
  out.course.started = local.course.started || remote.course.started;
  out.course.canRead = newer.course.canRead !== null ? newer.course.canRead : older.course.canRead;
  out.course.current = newer.course.current || older.course.current;
  out.course.theory = [...new Set([...local.course.theory, ...remote.course.theory])];
  const ea = local.course.alphabetExam;
  const eb = remote.course.alphabetExam;
  out.course.alphabetExam = ea && eb
    ? { best: Math.max(ea.best, eb.best), attempts: Math.max(ea.attempts, eb.attempts), passedAt: ea.passedAt && eb.passedAt ? (later(eb.passedAt, ea.passedAt) ? ea.passedAt : eb.passedAt) : ea.passedAt || eb.passedAt }
    : ea || eb || null;

  const ls = local.streak;
  const rs = remote.streak;
  let lead = ls;
  if (rs.lastDay && (!ls.lastDay || rs.lastDay > ls.lastDay || (rs.lastDay === ls.lastDay && rs.current > ls.current))) lead = rs;
  out.streak = { ...lead, best: Math.max(ls.best, rs.best, lead.current) };
  if (ls.todayDate === rs.todayDate && ls.todayDate) {
    out.streak.todayDate = ls.todayDate;
    out.streak.todayCount = Math.max(ls.todayCount, rs.todayCount);
  }

  const remoteWins = later(remote.updatedAt, local.updatedAt);
  out.settings = remoteWins ? { ...remote.settings } : { ...local.settings };
  out.updatedAt = (remoteWins ? remote.updatedAt : local.updatedAt) || remote.updatedAt || now.toISOString();
  return out;
}
