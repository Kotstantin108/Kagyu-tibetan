// "Support the project": why, and how to send a donation.
// The payment details live in site/config.js (SUPPORT); empty entries are not shown.

import { h, toast, tibText } from '../ui.js';

const METHODS = [
  // key in config.SUPPORT -> i18n label; `value` is shown in a copyable box, `link` as a button
  { key: 'paypal', label: 'support.paypal', link: true },
  { key: 'sbp', label: 'support.sbp' },
  { key: 'sbpBank', label: 'support.sbpBank', plain: true },
  { key: 'cardRu', label: 'support.cardRu' },
  { key: 'ibanGe', label: 'support.ibanGe' },
  { key: 'bankGe', label: 'support.bankGe', plain: true },
  { key: 'swiftGe', label: 'support.swiftGe' },
  { key: 'cardGe', label: 'support.cardGe' },
  { key: 'other', label: 'support.other' },
];

export function renderSupport(root, ctx) {
  const { t } = ctx;
  const cfg = ctx.config.SUPPORT || {};
  const rows = [];
  for (const m of METHODS) {
    const value = String(cfg[m.key] || '').trim();
    if (!value) continue;
    if (m.link) {
      rows.push(h('div', { class: 'support-row' },
        h('div', { class: 'label' }, t(m.label)),
        h('a', { class: 'action primary', href: value, target: '_blank', rel: 'noopener' }, t('support.open', { name: t(m.label) })),
      ));
      continue;
    }
    if (m.plain) { rows.push(h('p', { class: 'helper support-plain' }, `${t(m.label)}: ${value}`)); continue; }
    const copy = async () => {
      try { await navigator.clipboard.writeText(value); toast(t('support.copied')); } catch { toast(value, 5000); }
    };
    rows.push(h('div', { class: 'support-row' },
      h('div', { class: 'label' }, t(m.label)),
      h('div', { class: 'support-value' }, h('code', {}, value), h('button', { type: 'button', class: 'action small', onClick: copy }, t('support.copy'))),
    ));
  }
  if (cfg.recipient) rows.push(h('p', { class: 'helper' }, `${t('support.recipient')}: ${cfg.recipient}`));

  root.append(
    h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
      h('h2', { class: 'prompt' }, t('support.title')),
      h('p', {}, t('support.text')),
      h('p', {}, t('support.text2')),
    )),
    h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
      h('p', {}, t('support.ask')),
      h('div', { class: 'buttons' }, h('a', { class: 'action primary', href: 'https://t.me/kot_sta', target: '_blank', rel: 'noopener' }, t('support.askLink'))),
    )),
    h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
      h('div', { class: 'label' }, t('support.how')),
      rows.length ? rows : h('p', { class: 'helper' }, t('support.soon')),
      h('p', { class: 'fine support-thanks' }, tibText(t('support.thanks'))),
    )),
  );
  return () => {};
}
