// "Report a problem" links: a prefilled GitHub issue (no backend needed).

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
    `**Source:** ${sentence.source || ''}`,
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
    `**Source:** ${word.source || ''}`,
    '',
    '**What is wrong:**',
    '',
  ].join('\n');
  return `${base}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=content`;
}
