// Progress screen: streak, counts, reviews due, hard words, progress by set, one-time sync promo.

import { h } from '../ui.js';
import { pickTr } from '../i18n/index.js';
import { wordStatus, dueWords, upcomingWords, STATUS } from '../engine/progress.js';
import { effectiveStreak, remainingToday, localDay } from '../engine/streak.js';
import { hardWords } from '../engine/hard.js';
import { STREAK_MIN_PER_DAY } from '../engine/config.js';
import { courseProgress, courseModules, moduleProgress } from '../engine/course.js';

const PROMO_KEY = 'tib-sync-promo-dismissed';

export function renderStats(root, ctx) {
  const { store, data, t } = ctx;
  const p = store.get();
  const today = localDay();
  const entries = Object.entries(data.words).filter(([, w]) => !w.service);
  const known = entries.filter(([id]) => wordStatus(p, id) === STATUS.KNOWN).length;
  const learning = entries.filter(([id]) => wordStatus(p, id) === STATUS.LEARNING).length;
  const solved = Object.values(p.sentences).reduce((n, s) => n + (s.solved || 0), 0);
  const real = (id) => data.words[id] && !data.words[id].service;
  const due = dueWords(p, today).filter(real).length;
  const tomorrow = upcomingWords(p, 1, today).filter(real).length;
  const week = upcomingWords(p, 7, today).filter(real).length;
  const remaining = remainingToday(p.streak, today);
  const todayCount = p.streak.todayDate === today ? p.streak.todayCount : 0;

  const stat = (num, cap) => h('div', { class: 'stat' }, h('div', { class: 'num' }, String(num)), h('div', { class: 'cap' }, cap));

  root.append(h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
    h('div', { class: 'stat-grid' },
      stat(effectiveStreak(p.streak, today), `${t('stats.streak')} · ${t('stats.days', { n: effectiveStreak(p.streak, today) })}`),
      stat(p.streak.best, t('stats.best')),
      stat(known, t('stats.known')),
      stat(learning, t('stats.learning')),
      stat(due, t('stats.due')),
      stat(solved, t('stats.solved')),
      stat(`${moduleProgress(courseModules(data.course)[0], p).passed}/${moduleProgress(courseModules(data.course)[0], p).total}`, t('stats.reading')),
      stat(`${courseProgress(data.course, p).passed}/${courseProgress(data.course, p).total}`, t('stats.course')),
    ),
    h('p', { class: 'helper', style: 'margin-top:12px' }, remaining === 0 ? t('stats.todayDone') : t('stats.today', { n: Math.min(todayCount, STREAK_MIN_PER_DAY), min: STREAK_MIN_PER_DAY })),
    h('p', { class: 'helper', style: 'margin-top:6px' }, due ? t('stats.dueText', { n: due }) : t('stats.dueNone')),
    h('p', { class: 'helper forecast', style: 'margin-top:6px' }, t('stats.forecast', { tomorrow, week })),
  )));

  // hard words
  const hard = hardWords(p, data.words, { limit: 10 });
  const hardBody = h('div', { class: 'panel-body' }, h('div', { class: 'label' }, t('stats.hardWords')));
  if (hard.length) {
    hardBody.append(h('p', { class: 'helper' }, t('stats.hardWordsText')));
    const list = h('div', { class: 'hard-list' });
    for (const id of hard) {
      const w = data.words[id];
      const e = p.words[id];
      list.append(h('div', { class: 'hard-row' },
        h('span', { class: 'tib' }, w.tib),
        h('span', { class: 'tr' }, pickTr(w.tr, ctx.lang).text),
        h('span', { class: 'counter' }, t('stats.errors', { n: e.errors })),
      ));
    }
    hardBody.append(list, h('div', { class: 'buttons' }, h('a', { class: 'action primary', href: '#/play/hard' }, t('stats.practiceHard'))));
  } else {
    hardBody.append(h('p', { class: 'helper' }, t('stats.hardWordsEmpty')));
  }
  root.append(h('section', { class: 'panel' }, hardBody));

  const bySets = h('div', { class: 'panel-body' }, h('div', { class: 'label' }, t('stats.bySets')));
  for (const set of data.sets) {
    const all = entries.filter(([, w]) => w.set === set.id);
    const k = all.filter(([id]) => wordStatus(p, id) === STATUS.KNOWN).length;
    const sent = data.sentences.filter((s) => s.set === set.id);
    const solvedSet = sent.filter((s) => p.sentences[s.id] && p.sentences[s.id].solved > 0).length;
    const module = courseModules(data.course).find((m) => m.id === set.id);
    const mp = module ? moduleProgress(module, p) : null;
    bySets.append(h('div', { class: 'set-progress' },
      h('div', {}, pickTr(set.name, ctx.lang).text),
      h('div', { class: 'counter' }, `${k}/${all.length} · ${solvedSet}/${sent.length}` + (mp ? ` · ${t('stats.unitsOf', { n: mp.passed, total: mp.total })}` : '')),
      h('div', { class: 'meter' }, h('div', { style: `width:${all.length ? Math.round((100 * k) / all.length) : 0}%` })),
    ));
  }
  root.append(h('section', { class: 'panel' }, bySets));

  let dismissed = false;
  try { dismissed = localStorage.getItem(PROMO_KEY) === '1'; } catch { /* ignore */ }
  const configured = Boolean(ctx.config.GOOGLE_CLIENT_ID);
  const signedIn = ctx.sync && ctx.sync.isEnabled();
  if (configured && !dismissed && !signedIn) {
    const promo = h('div', { class: 'promo' },
      h('p', { style: 'margin:0 0 10px' }, t('stats.syncPromo')),
      h('div', { class: 'buttons' },
        h('button', { type: 'button', class: 'action primary small', onClick: () => ctx.navigate('settings') }, t('stats.syncPromoButton')),
        h('button', { type: 'button', class: 'action small', onClick: () => { try { localStorage.setItem(PROMO_KEY, '1'); } catch { /* ignore */ } promo.remove(); } }, t('stats.dismiss')),
      ),
    );
    root.append(promo);
  }
  return () => {};
}
