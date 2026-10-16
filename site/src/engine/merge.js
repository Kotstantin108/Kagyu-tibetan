// Merging two progress records (local and remote). Pure function.
// - words and sentences: the entry with the later updatedAt/lastSolved wins;
// - reading: rounds and best are maxima, updatedAt the later one;
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
