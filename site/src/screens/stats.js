// Progress screen: streak, counts, progress by set, one-time sync promo.

import { h } from '../ui.js';
import { pickTr } from '../i18n/index.js';
import { wordStatus, STATUS } from '../engine/progress.js';
import { effectiveStreak, remainingToday, localDay } from '../engine/streak.js';
import { STREAK_MIN_PER_DAY } from '../engine/config.js';

const PROMO_KEY = 'tib-sync-promo-dismissed';

export function renderStats(root, ctx) {
  const { store, data, t } = ctx;
  const p = store.get();
  const today = localDay();
  const entries = Object.entries(data.words).filter(([, w]) => !w.service);
  const known = entries.filter(([id]) => wordStatus(p, id) === STATUS.KNOWN).length;
  const learning = entries.filter(([id]) => wordStatus(p, id) === STATUS.LEARNING).length;
  const solved = Object.values(p.sentences).reduce((n, s) => n + (s.solved || 0), 0);
  const remaining = remainingToday(p.streak, today);
  const todayCount = p.streak.todayDate === today ? p.streak.todayCount : 0;

  const stat = (num, cap) => h('div', { class: 'stat' }, h('div', { class: 'num' }, String(num)), h('div', { class: 'cap' }, cap));

  root.append(h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
    h('div', { class: 'stat-grid' },
      stat(effectiveStreak(p.streak, today), `${t('stats.streak')} · ${t('stats.days', { n: effectiveStreak(p.streak, today) })}`),
      stat(p.streak.best, t('stats.best')),
      stat(known, t('stats.known')),
      stat(learning, t('stats.learning')),
      stat(solved, t('stats.solved')),
    ),
    h('p', { class: 'helper', style: 'margin-top:12px' }, remaining === 0 ? t('stats.todayDone') : t('stats.today', { n: Math.min(todayCount, STREAK_MIN_PER_DAY), min: STREAK_MIN_PER_DAY })),
  )));

  const bySets = h('div', { class: 'panel-body' }, h('div', { class: 'label' }, t('stats.bySets')));
  for (const set of data.sets) {
    const all = entries.filter(([, w]) => w.set === set.id);
    const k = all.filter(([id]) => wordStatus(p, id) === STATUS.KNOWN).length;
    const sent = data.sentences.filter((s) => s.set === set.id);
    const solvedSet = sent.filter((s) => p.sentences[s.id] && p.sentences[s.id].solved > 0).length;
    bySets.append(h('div', { class: 'set-progress' },
      h('div', {}, pickTr(set.name, ctx.lang).text),
      h('div', { class: 'counter' }, `${k}/${all.length} · ${solvedSet}/${sent.length}`),
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
