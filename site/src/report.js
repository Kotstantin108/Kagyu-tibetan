// "Report a problem": sends a short message to report-api (server/report-api),
// which files a GitHub issue; without REPORT_API, or when the request fails,
// falls back to a prefilled GitHub issue link (needs a GitHub account).

import { h, popover, toast } from './ui.js';

function issuesBase(config) {
  const repo = (config && config.REPO_URL) || '';
  return repo ? `${repo.replace(/\/+$/, '')}/issues/new` : '';
}

/** Issue link for a sentence; empty string when no repository is configured. */
export function sentenceIssueUrl(config, sentence, tib, translation, lang) {
  const base = issuesBase(config);
  if (!base) return '';
  const title = `Sentence ${sentence.id}: ${tib}`;
  const body = [
    `**Sentence id:** ${sentence.id}`,
    `**Tibetan:** ${tib}`,
    `**Translation (${lang}):** ${translation}`,
    `**Source:** ${sentence.source || ''}${sentence.page ? `, p. ${sentence.page}` : ''}`,
    '',
    '**What is wrong:**',
    '',
  ].join('\n');
  return `${base}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=content`;
}

/** Issue link for a dictionary word. */
export function wordIssueUrl(config, id, word, translation, lang) {
  const base = issuesBase(config);
  if (!base) return '';
  const title = `Word ${id}: ${word.tib}`;
  const body = [
    `**Word id:** ${id}`,
    `**Tibetan:** ${word.tib} (${word.wylie})`,
    `**Translation (${lang}):** ${translation}`,
    `**Source:** ${word.source || ''}${word.page ? `, p. ${word.page}` : ''}`,
    '',
    '**What is wrong:**',
    '',
  ].join('\n');
  return `${base}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=content`;
}

/** Generic issue link (bug or idea about the app itself). */
export function appIssueUrl(config) {
  const base = issuesBase(config);
  return base ? `${base}?labels=bug` : '';
}

const CATEGORIES = ['translation', 'bug', 'idea'];

/** POST the report to REPORT_API; resolves to { url } or throws. */
export async function sendReport(config, report, fetchFn = fetch) {
  const api = (config && config.REPORT_API) || '';
  if (!api) throw new Error('no api');
  const res = await fetchFn(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `http ${res.status}`);
  return { url: data.url || '' };
}

/**
 * The "Report a problem" control for a sentence or a word:
 * a button opening the report form when REPORT_API is set, otherwise the
 * prefilled-issue link (or null when neither is configured).
 * info: { kind: 'sentence'|'word'|'app', id, tib, translation, fallbackUrl }
 */
export function reportControl(ctx, info) {
  const { t, config } = ctx;
  if (!config.REPORT_API) {
    return info.fallbackUrl ? h('a', { href: info.fallbackUrl, target: '_blank', rel: 'noopener' }, t('play.report')) : null;
  }
  return h('button', { type: 'button', class: 'linkish report-btn', onClick: () => openReportForm(ctx, info) }, t('play.report'));
}

export function openReportForm(ctx, info) {
  const { t, config } = ctx;
  const isApp = info.kind === 'app';
  const text = h('textarea', { class: 'report-text', rows: 4, maxlength: 2000, placeholder: t(isApp ? 'report.hintApp' : 'report.hint'), 'aria-label': t('report.what') });
  // category: translation errors go to the content label, bugs and ideas to their own
  const catName = `report-cat-${Date.now()}`;
  const catInputs = CATEGORIES.map((c) => h('input', { type: 'radio', name: catName, value: c, checked: c === (isApp ? 'bug' : 'translation') }));
  const cats = h('div', { class: 'cats', role: 'radiogroup', 'aria-label': t('report.category') },
    ...CATEGORIES.map((c, i) => h('label', { class: 'cat' }, catInputs[i], h('span', {}, t(`report.cat${c[0].toUpperCase()}${c.slice(1)}`)))));
  const category = () => (catInputs.find((r) => r.checked) || catInputs[0]).value;
  // honeypot: hidden from people, filled by bots; the server drops such reports
  const honey = h('input', { class: 'visually-hidden', type: 'text', name: 'website', tabindex: -1, autocomplete: 'off', 'aria-hidden': 'true' });
  const status = h('p', { class: 'fine report-status', role: 'status' });
  const btnSend = h('button', { type: 'button', class: 'action primary' }, t('report.send'));
  const btnCancel = h('button', { type: 'button', class: 'action' }, t('common.cancel'));
  let close = null;
  const fallback = () => (info.fallbackUrl ? h('a', { href: info.fallbackUrl, target: '_blank', rel: 'noopener' }, t('report.openIssue')) : null);

  async function send() {
    const message = text.value.trim();
    if (message.length < 10) { status.textContent = t('report.tooShort'); text.focus(); return; }
    btnSend.disabled = true;
    status.textContent = t('report.sending');
    try {
      const { url } = await sendReport(config, { kind: info.kind, category: category(), id: info.id, tib: info.tib, translation: info.translation, lang: ctx.lang, message, page: location.hash, website: honey.value });
      close();
      toast(h('span', {}, t('report.thanks'), url ? [' ', h('a', { href: url, target: '_blank', rel: 'noopener', style: 'color:inherit' }, t('report.view'))] : null), 6000);
    } catch {
      btnSend.disabled = false;
      status.replaceChildren(t('report.failed'), ' ', fallback() || '');
    }
  }
  btnSend.addEventListener('click', send);
  btnCancel.addEventListener('click', () => close());
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });

  close = popover(h('div', { class: 'report-form' },
    h('h3', {}, t('report.title')),
    isApp ? null : h('p', { class: 'big-tib', style: 'font-size:1.6rem' }, info.tib),
    isApp ? null : h('p', { class: 'tr' }, info.translation),
    h('div', { class: 'label' }, t('report.category')),
    cats,
    h('label', { class: 'field' }, h('span', {}, t('report.what')), text),
    honey,
    status,
    h('div', { class: 'buttons' }, btnSend, btnCancel),
  ));
  setTimeout(() => text.focus(), 0);
}
