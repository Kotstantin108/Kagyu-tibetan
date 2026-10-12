// Dictionary: sets with words, search, manual status marking.

import { h, clear } from '../ui.js';
import { pickTr } from '../i18n/index.js';
import { setWordStatus, wordStatus, STATUS } from '../engine/progress.js';

export function renderDict(root, ctx) {
  const { store, data, t } = ctx;
  const dict = data.words;
  const entries = Object.entries(dict).filter(([, w]) => !w.service);

  const search = h('input', { class: 'search', type: 'search', placeholder: t('dict.search'), 'aria-label': t('dict.search') });
  const found = h('p', { class: 'fine' });
  const list = h('div', {});
  root.append(h('section', { class: 'panel' }, h('div', { class: 'panel-body' }, search, found)), h('section', { class: 'panel' }, list));

  function matches(w, q) {
    if (!q) return true;
    if (w.tib.includes(q)) return true;
    if (w.wylie.toLowerCase().includes(q)) return true;
    return Object.values(w.tr).some((s) => s && s.toLowerCase().includes(q));
  }

  function statusButton(id, status, label) {
    const cur = wordStatus(store.get(), id);
    return h('button', {
      type: 'button',
      class: `status-btn ${status}` + (cur === status ? ' on' : ''),
      'aria-pressed': String(cur === status),
      onClick: () => {
        const now = wordStatus(store.get(), id);
        store.update((p) => setWordStatus(p, id, now === status ? STATUS.NEW : status));
        render();
      },
    }, label);
  }

  function wordRow([id, w]) {
    const tr = pickTr(w.tr, ctx.lang);
    const st = wordStatus(store.get(), id);
    return h('div', { class: 'word-row' },
      h('div', {},
        h('div', { class: 'tib' }, w.tib),
        h('div', { class: 'tr' }, tr.text, tr.fallback ? ` (${tr.lang})` : ''),
        h('div', { class: 'meta' }, `${w.wylie} · ${w.pos} · ${t(`status.${st}`)}`),
      ),
      h('div', { class: 'controls' },
        statusButton(id, STATUS.KNOWN, t('dict.markKnown')),
        statusButton(id, STATUS.LEARNING, t('dict.markLearning')),
      ),
    );
  }

  const openSets = new Set();

  function render() {
    const q = search.value.trim().toLowerCase();
    clear(list);
    let total = 0;
    for (const set of data.sets) {
      const words = entries.filter(([, w]) => w.set === set.id && matches(w, q));
      if (!words.length) continue;
      total += words.length;
      const all = entries.filter(([, w]) => w.set === set.id);
      const known = all.filter(([id]) => wordStatus(store.get(), id) === STATUS.KNOWN).length;
      const name = pickTr(set.name, ctx.lang).text;
      const details = h('details', { class: 'set', open: q ? true : openSets.has(set.id) },
        h('summary', {}, h('span', {}, name), h('span', { class: 'counter' }, t('dict.setProgress', { known, total: all.length }))),
        h('div', { class: 'set-actions' },
          h('div', { class: 'meter' }, h('div', { style: `width:${all.length ? Math.round((100 * known) / all.length) : 0}%` })),
          h('div', { class: 'buttons' }, h('button', {
            type: 'button', class: 'action small',
            onClick: () => {
              if (!confirm(t('dict.markSetKnownConfirm', { n: all.length }))) return;
              store.update((p) => all.reduce((acc, [id]) => setWordStatus(acc, id, STATUS.KNOWN), p));
              render();
            },
          }, t('dict.markSetKnown'))),
        ),
        ...words.map(wordRow),
      );
      details.addEventListener('toggle', () => { if (details.open) openSets.add(set.id); else openSets.delete(set.id); });
      list.append(details);
    }
    found.textContent = total ? t('dict.found', { n: total }) : t('dict.noResults');
  }

  search.addEventListener('input', render);
  render();
  return () => {};
}
