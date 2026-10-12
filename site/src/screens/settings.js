// Settings: language, tile mode, export/import/reset, Google sync.

import { h, toast, formatTime } from '../ui.js';
import { STRINGS } from '../i18n/index.js';
import { LANGS } from '../engine/config.js';
import { setSetting, normalizeProgress } from '../engine/progress.js';

export function renderSettings(root, ctx) {
  const { store, t } = ctx;
  const p = store.get();

  // language
  const langSel = h('select', { id: 'settings-lang' }, ...LANGS.map((l) => h('option', { value: l, selected: l === ctx.lang }, STRINGS[l].langName)));
  langSel.addEventListener('change', () => store.update((q) => setSetting(q, 'lang', langSel.value)));
  const machine = ctx.lang === 'en' ? null : h('div', { class: 'notice' }, t('settings.machineNotice', { lang: t('langIn') }));

  // tile mode
  const modeSel = h('select', {}, h('option', { value: 'words', selected: p.settings.tileMode === 'words' }, t('play.modeWords')), h('option', { value: 'syllables', selected: p.settings.tileMode === 'syllables' }, t('play.modeSyllables')));
  modeSel.addEventListener('change', () => store.update((q) => setSetting(q, 'tileMode', modeSel.value)));

  // data
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      if (!raw || typeof raw !== 'object' || !('words' in raw)) throw new Error('bad');
      if (!confirm(t('settings.importConfirm'))) return;
      store.replace(normalizeProgress(raw), 'replace');
      toast(t('settings.importDone'));
    } catch {
      toast(t('settings.importError'));
    }
  });
  const exportBtn = h('button', { type: 'button', class: 'action', onClick: () => {
    const blob = new Blob([JSON.stringify(store.get(), null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `tib-progress-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } }, t('settings.export'));
  const importBtn = h('button', { type: 'button', class: 'action', onClick: () => fileInput.click() }, t('settings.import'));
  const resetBtn = h('button', { type: 'button', class: 'action danger', onClick: () => {
    if (!confirm(t('settings.resetConfirm'))) return;
    store.reset();
    toast(t('settings.resetDone'));
  } }, t('settings.reset'));

  // sync
  let syncPanel = null;
  if (ctx.config.GOOGLE_CLIENT_ID && ctx.sync) {
    const status = h('div', { class: 'sync-status' });
    const signIn = h('button', { type: 'button', class: 'action primary', onClick: () => ctx.sync.signIn() }, t('settings.signIn'));
    const signOut = h('button', { type: 'button', class: 'action', onClick: () => ctx.sync.signOut() }, t('settings.signOut'));
    const syncNow = h('button', { type: 'button', class: 'action', onClick: () => ctx.sync.syncNow() }, t('settings.syncNow'));
    const renderSync = () => {
      const s = ctx.sync.state();
      const on = ctx.sync.isEnabled();
      signIn.hidden = on;
      signOut.hidden = !on;
      syncNow.hidden = !on;
      status.textContent = s.status === 'synced' ? t('settings.syncState.synced', { time: s.lastSync ? formatTime(s.lastSync, ctx.lang) : '' }) : t(`settings.syncState.${s.status}`);
    };
    const unsub = ctx.sync.subscribe(renderSync);
    renderSync();
    syncPanel = h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
      h('div', { class: 'label' }, t('settings.sync')),
      h('p', { class: 'helper' }, t('settings.syncText')),
      h('div', { class: 'buttons' }, signIn, syncNow, signOut),
      status,
    ));
    syncPanel.dataset.unsub = '1';
    root.append(syncPanel);
    root.prepend(); // keep order below
    renderSettings.cleanup = unsub;
  }

  const main = h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
    h('div', { class: 'field' }, h('label', { for: 'settings-lang' }, t('settings.language')), langSel, machine),
    h('div', { class: 'field' }, h('label', {}, t('settings.tileMode')), modeSel),
    h('div', { class: 'label' }, t('settings.data')),
    h('div', { class: 'buttons' }, exportBtn, importBtn, resetBtn, fileInput),
  ));
  root.prepend(main);
  root.append(h('section', { class: 'panel' }, h('div', { class: 'panel-body' }, h('div', { class: 'label' }, t('settings.about')), h('p', { class: 'helper' }, t('settings.aboutText')))));

  return () => { if (renderSettings.cleanup) { renderSettings.cleanup(); renderSettings.cleanup = null; } };
}
