// First-run dialog: where to start, and three tips.

import { h, popover } from '../ui.js';
import { pickTr } from '../i18n/index.js';
import { setWordStatus, setSetting, STATUS } from '../engine/progress.js';

/** True when the dialog should be shown; marks old records as onboarded silently. */
export function needsOnboarding(ctx) {
  const p = ctx.store.get();
  if (p.settings.onboarded) return false;
  if (Object.keys(p.words).length > 0) {
    ctx.store.update((q) => setSetting(q, 'onboarded', true));
    return false;
  }
  return true;
}

export function showOnboarding(ctx, onDone) {
  const { store, data, t } = ctx;
  const sel = h('select', { id: 'onboarding-level' },
    h('option', { value: '' }, t('onboarding.fromScratch')),
    ...data.sets.map((s) => h('option', { value: s.id }, pickTr(s.name, ctx.lang).text)),
  );
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    const upTo = sel.value;
    store.update((p) => {
      let q = p;
      if (upTo) {
        const maxOrder = data.sets.find((s) => s.id === upTo).order;
        const orderOf = new Map(data.sets.map((s) => [s.id, s.order]));
        for (const [id, w] of Object.entries(data.words)) {
          if (w.service) continue;
          if ((orderOf.get(w.set) ?? Infinity) <= maxOrder) q = setWordStatus(q, id, STATUS.KNOWN);
        }
      }
      return setSetting(q, 'onboarded', true);
    });
    close();
    onDone();
  };
  const close = popover(h('div', { class: 'onboarding' },
    h('h2', {}, t('onboarding.title')),
    h('p', {}, t('onboarding.text')),
    h('ul', { class: 'tips' }, h('li', {}, t('onboarding.tip1')), h('li', {}, t('onboarding.tip2')), h('li', {}, t('onboarding.tip3'))),
    h('div', { class: 'field' }, h('label', { for: 'onboarding-level' }, t('onboarding.knowUpTo')), sel),
    h('div', { class: 'buttons' }, h('button', { type: 'button', class: 'action primary', onClick: finish }, t('onboarding.start'))),
  ), { onDismiss: finish });
}
