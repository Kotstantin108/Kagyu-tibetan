// "Ask a question and support": why the app is free, how to reach the author, how to thank the centre.

import { h, tibText } from '../ui.js';

export function renderSupport(root, ctx) {
  const { t } = ctx;
  root.append(
    h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
      h('h2', { class: 'prompt' }, t('support.title')),
      h('p', {}, t('support.text')),
      h('p', {}, t('support.text2')),
    )),
    h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
      h('p', {}, t('support.ask')),
      h('div', { class: 'buttons' }, h('a', { class: 'action primary', href: 'https://t.me/kot_sta', target: '_blank', rel: 'noopener' }, t('support.askLink'))),
      h('p', { class: 'fine support-thanks' }, tibText(t('support.thanks'))),
    )),
  );
  return () => {};
}
