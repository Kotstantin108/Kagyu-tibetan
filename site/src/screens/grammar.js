// Grammar reference: the textbook's notes grouped by lesson, each with an example.

import { h, clear, tibText } from '../ui.js';
import { pickTr } from '../i18n/index.js';
import { renderTib } from '../engine/tib.js';
import { theoryOf } from '../engine/theory.js';

/** Notes per set, deduplicated by their English text, with example sentences. */
export function collectNotes(sentences, sets) {
  const bySet = new Map(sets.map((s) => [s.id, []]));
  const seen = new Map(); // set|en -> entry
  for (const s of sentences) {
    if (!s.note || !s.note.en) continue;
    const key = `${s.set}|${s.note.en}`;
    let entry = seen.get(key);
    if (!entry) {
      entry = { note: s.note, examples: [] };
      seen.set(key, entry);
      if (!bySet.has(s.set)) bySet.set(s.set, []);
      bySet.get(s.set).push(entry);
    }
    if (entry.examples.length < 2) entry.examples.push(s);
  }
  return bySet;
}

export function renderGrammar(root, ctx) {
  const { data, t } = ctx;
  const dict = data.words;
  const notes = collectNotes(data.sentences, data.sets);
  const search = h('input', { class: 'search', type: 'search', placeholder: t('grammar.search'), 'aria-label': t('grammar.search') });
  const list = h('div', {});
  root.append(
    h('section', { class: 'panel' }, h('div', { class: 'panel-body' }, h('p', { class: 'helper' }, t('grammar.intro')), search)),
    h('section', { class: 'panel' }, list),
  );
  const openSets = new Set();

  function render() {
    const q = search.value.trim().toLowerCase();
    clear(list);
    let total = 0;
    for (const set of data.sets) {
      const entries = (notes.get(set.id) || []).filter((e) => {
        if (!q) return true;
        const text = pickTr(e.note, ctx.lang).text.toLowerCase();
        return text.includes(q) || e.examples.some((s) => renderTib(s.words, dict).includes(q) || pickTr(s.tr, ctx.lang).text.toLowerCase().includes(q));
      });
      if (!entries.length) continue;
      total += entries.length;
      const details = h('details', { class: 'set', open: q ? true : openSets.has(set.id) },
        h('summary', {}, h('span', {}, pickTr(set.name, ctx.lang).text), h('span', { class: 'counter' }, t('grammar.count', { n: entries.length }))),
        theoryOf(data.intro, set.id, ctx.lang).length ? h('div', { class: 'note-row theory-link' }, h('a', { class: 'action small', href: `#/course/${set.id}/theory` }, t('grammar.theoryLink'))) : null,
        ...entries.map((e) => h('div', { class: 'note-row' },
          h('p', { class: 'note-text' }, tibText(pickTr(e.note, ctx.lang).text)),
          ...e.examples.map((s) => h('div', { class: 'example' },
            h('span', { class: 'tib' }, renderTib(s.words, dict)),
            h('span', { class: 'tr' }, pickTr(s.tr, ctx.lang).text),
          )),
        )),
      );
      details.addEventListener('toggle', () => { if (details.open) openSets.add(set.id); else openSets.delete(set.id); });
      list.append(details);
    }
    if (!total) list.append(h('p', { class: 'helper', style: 'padding:16px' }, t('dict.noResults')));
  }

  search.addEventListener('input', render);
  render();
  return () => {};
}
