// Settings: language, theme, tiles, export/import/reset, transfer code, Google sync.

import { h, toast, formatTime } from '../ui.js';
import { STRINGS } from '../i18n/index.js';
import { LANGS } from '../engine/config.js';
import { setSetting, normalizeProgress } from '../engine/progress.js';
import { mergeProgress } from '../engine/merge.js';
import { encodeProgress, decodeProgress } from '../transfer.js';

export function renderSettings(root, ctx) {
  const { store, t } = ctx;
  const p = store.get();

  const select = (id, value, options, onChange) => {
    const el = h('select', { id }, ...options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
    el.addEventListener('change', () => onChange(el.value));
    return el;
  };

  // language
  const langSel = select('settings-lang', ctx.lang, LANGS.map((l) => [l, STRINGS[l].langName]), (v) => store.update((q) => setSetting(q, 'lang', v)));
  const machine = ctx.lang === 'en' ? null : h('div', { class: 'notice' }, t('settings.machineNotice', { lang: t('langIn') }));

  // theme
  const themeSel = select('settings-theme', p.settings.theme || 'auto', [['auto', t('settings.themeAuto')], ['light', t('settings.themeLight')], ['dark', t('settings.themeDark')]], (v) => store.update((q) => setSetting(q, 'theme', v)));

  // tiles
  const modeSel = select('settings-tiles', p.settings.tileMode, [['words', t('play.modeWords')], ['syllables', t('play.modeSyllables')]], (v) => store.update((q) => setSetting(q, 'tileMode', v)));
  const wylieBox = h('input', { type: 'checkbox', id: 'settings-wylie', checked: p.settings.showWylie === true });
  wylieBox.addEventListener('change', () => store.update((q) => setSetting(q, 'showWylie', wylieBox.checked)));

  // data: export / import / reset
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

  // transfer code
  const codeArea = h('textarea', { class: 'code-area', rows: 3, spellcheck: 'false', placeholder: t('settings.codePlaceholder'), 'aria-label': t('settings.transfer') });
  const copyBtn = h('button', { type: 'button', class: 'action', onClick: async () => {
    const code = await encodeProgress(store.get());
    codeArea.value = code;
    try { await navigator.clipboard.writeText(code); toast(t('settings.codeCopied')); } catch { codeArea.select(); toast(t('settings.codeShown')); }
  } }, t('settings.codeCopy'));
  const applyBtn = h('button', { type: 'button', class: 'action', onClick: async () => {
    try {
      const remote = await decodeProgress(codeArea.value);
      if (!confirm(t('settings.codeConfirm'))) return;
      store.replace(mergeProgress(store.get(), remote), 'replace');
      codeArea.value = '';
      toast(t('settings.codeApplied'));
    } catch {
      toast(t('settings.codeError'));
    }
  } }, t('settings.codeApply'));

  // sync
  let cleanup = null;
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
    cleanup = ctx.sync.subscribe(renderSync);
    renderSync();
    syncPanel = h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
      h('div', { class: 'label' }, t('settings.sync')),
      h('p', { class: 'helper' }, t('settings.syncText')),
      h('div', { class: 'buttons' }, signIn, syncNow, signOut),
      status,
    ));
  }

  root.append(
    h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
      h('div', { class: 'field' }, h('label', { for: 'settings-lang' }, t('settings.language')), langSel, machine),
      h('div', { class: 'field' }, h('label', { for: 'settings-theme' }, t('settings.theme')), themeSel),
      h('div', { class: 'field' }, h('label', { for: 'settings-tiles' }, t('settings.tileMode')), modeSel),
      h('div', { class: 'field check' }, h('label', { for: 'settings-wylie' }, wylieBox, ' ', t('settings.showWylie'))),
    )),
    h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
      h('div', { class: 'label' }, t('settings.data')),
      h('div', { class: 'buttons' }, exportBtn, importBtn, resetBtn, fileInput),
      h('div', { class: 'label', style: 'margin-top:18px' }, t('settings.transfer')),
      h('p', { class: 'helper' }, t('settings.transferText')),
      codeArea,
      h('div', { class: 'buttons' }, copyBtn, applyBtn),
    )),
    syncPanel,
    h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
      h('div', { class: 'label' }, t('settings.about')),
      h('p', { class: 'helper' }, t('settings.aboutText')),
      ctx.config.AUDIO_BASE ? h('p', { class: 'helper' }, t('settings.voiceNote')) : null,
      ctx.config.REPO_URL ? h('p', { class: 'helper' }, h('a', { href: ctx.config.REPO_URL, target: '_blank', rel: 'noopener' }, t('settings.sourceCode'))) : null,
      h('p', { class: 'helper' }, h('a', { href: '#/support' }, t('support.line'))),
      h('p', { class: 'fine' }, t('settings.version', { v: ctx.config.VERSION || 'dev' })),
    )),
  );

  return () => { if (cleanup) cleanup(); };
}
