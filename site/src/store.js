// Progress store: localStorage persistence + change events.

import { PROGRESS_KEY } from './engine/config.js';
import { createProgress, normalizeProgress } from './engine/progress.js';

export function createStore() {
  let progress = load();
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      return raw ? normalizeProgress(JSON.parse(raw)) : createProgress();
    } catch {
      return createProgress();
    }
  }

  function persist() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* private mode: keep in memory */ }
  }

  function emit(source) {
    for (const fn of listeners) fn(progress, source);
  }

  return {
    get: () => progress,
    /** Apply a pure transition progress -> progress. */
    update(fn, source = 'local') {
      const next = fn(progress);
      if (next === progress) return progress;
      progress = next;
      persist();
      emit(source);
      return progress;
    },
    /** Replace the whole record (import, sync). */
    replace(raw, source = 'replace') {
      progress = normalizeProgress(raw);
      persist();
      emit(source);
      return progress;
    },
    reset() {
      progress = createProgress();
      persist();
      emit('reset');
      return progress;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
