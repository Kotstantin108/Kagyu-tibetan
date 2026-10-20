// The Reading section: the parts of the alphabet as a free trainer. #/read
// lists them, #/read/<n> runs a round of the part (results in `reading`).
// The course walks the same parts in order (module "Alphabet").

import { h, audioButton } from '../ui.js';
import { pickTr } from '../i18n/index.js';
import { PARTS, partId, partPool } from '../engine/alphabet.js';
import { TRAIN_SIZE, TRAIN_PASS } from '../engine/alphabet.js';
import { renderDrill } from './drill.js';
import { theoryOf } from '../engine/theory.js';

export function renderRead(root, ctx) {
  const { store, data, t } = ctx;
  const n = Number((ctx.param || '').split('/')[0]);
  const part = PARTS.find((p) => p.n === n && p.kind !== 'sentences');
  if (part) {
    return renderDrill(root, ctx, { kind: 'free', part, title: t(`alphabet.parts.${part.n}`), back: '#/read' });
  }
  const p = store.get();
  const body = h('div', { class: 'panel-body' },
    h('p', { class: 'helper read-intro' }, t('alphabet.freeIntro')),
    h('p', { class: 'fine' }, t('read.wylieNote')),
    h('p', { class: 'helper' }, h('a', { href: '#/course', class: 'read-course-link' }, t('alphabet.freeToCourse'))),
  );
  for (const part of PARTS) {
    if (part.kind === 'sentences') continue;
    const items = partPool(part, data.alphabet, data.words, data.sets);
    const rec = p.reading[partId(part.n)];
    const passed = Boolean(rec && rec.best >= TRAIN_PASS);
    const state = rec ? t('read.best', { score: rec.best, total: TRAIN_SIZE }) + (passed ? ' · ' + t('read.passed') : '') : t('read.notYet');
    const table = items.length > 60 ? null : h('details', {},
      h('summary', {}, t('read.table')),
      h('div', { class: 'wylie-table' }, ...items.map((x) => h('span', { class: 'cell' }, h('span', { class: 'tib' }, x.tib), h('span', {}, x.wylie)))),
    );
    body.append(h('div', { class: 'stage' + (passed ? ' passed' : ''), dataset: { stage: String(part.n) } },
      h('h3', {}, `${part.n}. ${t(`alphabet.parts.${part.n}`)}`),
      h('div', { class: 'stage-row' },
        h('span', { class: 'stage-state' + (passed ? ' passed' : '') }, state),
        theoryOf(data.intro, partId(part.n), ctx.lang).length ? h('a', { class: 'action small', href: `#/course/${partId(part.n)}/theory` }, t('course.theory')) : null,
        h('a', { class: 'action primary small', href: `#/read/${part.n}` }, t('read.practise')),
      ),
      table,
    ));
  }
  // colloquial phrases read by a native speaker (alphabet.json `phrases`, from content/phrases.tsv), a listening extra
  const phrases = (data.alphabet.phrases || []).filter((x) => x.clip);
  if (phrases.length && p.settings.recordings !== false) {
    body.append(h('details', { class: 'phrases' },
      h('summary', {}, `${t('read.phrases')} (${phrases.length})`),
      h('p', { class: 'fine' }, t('read.phrasesNote')),
      ...phrases.map((x) => h('div', { class: 'phrase-row' },
        h('div', { class: 'tib big' }, x.tib, ' ', audioButton(ctx, x.clip, { small: true })),
        h('div', { class: 'wylie' }, x.phon),
        h('div', { class: 'tr' }, pickTr(x.tr, ctx.lang).text),
      )),
    ));
  }
  root.append(h('section', { class: 'panel' }, body));
  return () => {};
}
