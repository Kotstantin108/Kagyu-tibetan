// The game screen.

import { h, clear, popover } from '../ui.js';
import { pickTr } from '../i18n/index.js';
import { pickNext, contentWords } from '../engine/next.js';
import { checkAnswer, shuffle } from '../engine/check.js';
import { renderTib, splitSyllables } from '../engine/tib.js';
import { revealWord, wordError, recordSolved, setWordStatus, setSetting, wordStatus, STATUS } from '../engine/progress.js';
import { registerSolve, localDay } from '../engine/streak.js';

let lastSentenceId = null;

export function renderPlay(root, ctx) {
  const { store, data, t } = ctx;
  const dict = data.words;

  // ---- round state ----
  let pick = null;      // { sentence, newWordIds, reveal, reason }
  let tiles = [];       // [{ key, text, wordId }]
  let rack = [];        // keys
  let chosen = [];      // keys
  let complete = false;
  let revealed = new Set();
  let hintedKey = null;
  let feedback = { text: t('play.start'), kind: '' };

  // ---- DOM skeleton ----
  const reasonBadge = h('span', { class: 'badge reason' });
  const newBadge = h('span', { class: 'badge gold' });
  const modeSwitch = h('div', { class: 'switch', role: 'group' },
    h('button', { type: 'button', dataset: { mode: 'words' }, onClick: () => setMode('words') }, t('play.modeWords')),
    h('button', { type: 'button', dataset: { mode: 'syllables' }, onClick: () => setMode('syllables') }, t('play.modeSyllables')),
  );
  const prompt = h('h2', { class: 'prompt' });
  const fallbackNote = h('p', { class: 'fine' });
  const machineNote = h('p', { class: 'fine' });
  const chips = h('div', { class: 'chips' });
  const coldNote = h('div', { class: 'cold-note', hidden: true }, t('play.coldStart'));
  const answerCount = h('span', { class: 'counter' });
  const rackCount = h('span', { class: 'counter' });
  const answer = h('div', { class: 'answer', 'aria-label': t('play.yourSentence') });
  const rackEl = h('div', { class: 'rack', 'aria-label': t('play.tiles') });
  const feedbackEl = h('p', { class: 'feedback', role: 'status' });
  const btnCheck = h('button', { type: 'button', class: 'action primary', onClick: check }, t('play.check'));
  const btnHint = h('button', { type: 'button', class: 'action', onClick: hint }, t('play.hint'));
  const btnReset = h('button', { type: 'button', class: 'action', onClick: () => deal(false) }, t('play.reset'));
  const btnSkip = h('button', { type: 'button', class: 'action', onClick: () => nextSentence() }, t('play.skip'));
  const btnNext = h('button', { type: 'button', class: 'action next', hidden: true, onClick: () => nextSentence() }, t('play.next'));
  const lesson = h('section', { class: 'lesson', hidden: true });

  root.append(
    h('section', { class: 'panel' },
      h('div', { class: 'topbar' }, h('div', { class: 'progressline' }, reasonBadge, newBadge), modeSwitch),
      h('div', { class: 'panel-body' },
        h('div', { class: 'label' }, t('play.prompt')),
        prompt, fallbackNote, machineNote, chips, coldNote,
        h('div', { class: 'section-head' }, h('h2', {}, t('play.yourSentence')), answerCount),
        answer,
        h('div', { class: 'section-head' }, h('h2', {}, t('play.tiles')), rackCount),
        rackEl,
        feedbackEl,
        h('div', { class: 'buttons' }, btnCheck, btnHint, btnReset, btnSkip, btnNext),
        lesson,
      ),
    ),
  );

  // ---- helpers ----
  function mode() { return store.get().settings.tileMode || 'words'; }

  function setMode(m) {
    if (m === mode()) return;
    store.update((p) => setSetting(p, 'tileMode', m));
    deal(true);
  }

  function buildTiles() {
    const out = [];
    let k = 0;
    for (const id of pick.sentence.words) {
      const w = dict[id];
      if (!w || w.service) continue;
      if (mode() === 'syllables' && !w.fused) {
        for (const s of splitSyllables(w.tib)) out.push({ key: k++, text: s, wordId: id });
      } else {
        out.push({ key: k++, text: w.tib, wordId: id });
      }
    }
    return out;
  }

  function expectedTexts() { return tiles.map((x) => x.text); }
  function tile(key) { return tiles.find((x) => x.key === key); }

  function setFeedback(text, kind = '') { feedback = { text, kind }; }

  function nextSentence() {
    const p = store.get();
    pick = pickNext(data.sentences, dict, data.sets, p, { lastId: lastSentenceId });
    lastSentenceId = pick ? pick.sentence.id : null;
    revealed = new Set();
    deal(true);
  }

  function deal(fresh) {
    tiles = buildTiles();
    rack = shuffle(tiles.map((x) => x.key));
    chosen = [];
    complete = false;
    hintedKey = null;
    lesson.hidden = true;
    if (fresh) setFeedback(t('play.start'));
    render();
  }

  function isNew(wordId) { return pick.newWordIds.includes(wordId); }

  function showWord(wordId) {
    const w = dict[wordId];
    if (!w) return;
    if (!pick.reveal && !complete) {
      revealed.add(wordId);
      store.update((p) => revealWord(p, wordId));
    }
    const tr = pickTr(w.tr, ctx.lang);
    let close = null;
    const mark = (status) => { store.update((p) => setWordStatus(p, wordId, status)); close(); render(); };
    close = popover(h('div', {},
      h('p', { class: 'big-tib' }, w.tib),
      h('div', { class: 'wylie' }, w.wylie, ' · ', t(`status.${wordStatus(store.get(), wordId)}`)),
      h('p', { class: 'tr' }, tr.text, tr.fallback ? ` (${tr.lang})` : ''),
      h('div', { class: 'buttons' },
        h('button', { type: 'button', class: 'action primary', onClick: () => mark(STATUS.KNOWN) }, t('play.know')),
        h('button', { type: 'button', class: 'action', onClick: () => mark(STATUS.LEARNING) }, t('play.learning')),
      ),
    ));
  }

  function tileButton(key, from) {
    const x = tile(key);
    const p = store.get();
    const btn = h('button', {
      type: 'button',
      class: 'tile' + (isNew(x.wordId) && !complete ? ' new' : '') + (hintedKey === key && from === 'rack' ? ' hinted' : ''),
      'aria-label': x.text,
      onClick: () => {
        if (complete) return;
        if (from === 'rack') { rack = rack.filter((k) => k !== key); chosen.push(key); }
        else { chosen = chosen.filter((k) => k !== key); rack.push(key); }
        hintedKey = null;
        render();
      },
    }, x.text);
    const help = h('button', { type: 'button', class: 'tile-help', 'aria-label': t('play.wordHelp'), onClick: (e) => { e.stopPropagation(); showWord(x.wordId); } }, '?');
    void p;
    return h('span', { class: 'tile-wrap' }, btn, help);
  }

  function render() {
    const p = store.get();
    const s = pick.sentence;
    const tr = pickTr(s.tr, ctx.lang);
    prompt.textContent = tr.text;
    fallbackNote.textContent = tr.fallback ? `(${tr.lang})` : '';
    fallbackNote.hidden = !tr.fallback;
    machineNote.hidden = ctx.lang === 'en';
    machineNote.textContent = ctx.lang === 'en' ? '' : t('settings.machineNotice', { lang: t('langIn') }).split('.')[0] + '.';
    reasonBadge.textContent = t(`play.whyThis.${pick.reason}`);
    newBadge.textContent = pick.newWordIds.length ? `${t('play.newWord')}: ${pick.newWordIds.length}` : '';
    newBadge.hidden = !pick.newWordIds.length;
    coldNote.hidden = !pick.reveal;
    modeSwitch.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.mode === mode();
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    });

    // chips: the words of the sentence
    clear(chips);
    for (const id of contentWords(s, dict)) {
      const w = dict[id];
      const st = wordStatus(p, id);
      const showTr = pick.reveal || complete || revealed.has(id);
      const chip = h('button', {
        type: 'button',
        class: `chip ${st}` + (isNew(id) ? ' new' : ''),
        onClick: () => showWord(id),
      },
        h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'tib' }, w.tib),
        showTr ? h('span', { class: 'tr' }, pickTr(w.tr, ctx.lang).text) : h('span', { class: 'tr' }, '?'),
      );
      chips.append(chip);
    }

    answerCount.textContent = t('play.tilesCount', { placed: chosen.length, total: tiles.length });
    rackCount.textContent = t('play.available', { n: rack.length });
    clear(answer);
    clear(rackEl);
    if (!chosen.length) answer.append(h('span', { class: 'placeholder' }, t('play.placeholder')));
    chosen.forEach((k) => answer.append(tileButton(k, 'answer')));
    rack.forEach((k) => rackEl.append(tileButton(k, 'rack')));
    answer.classList.toggle('correct', complete);

    feedbackEl.textContent = feedback.text;
    feedbackEl.className = 'feedback' + (feedback.kind ? ' ' + feedback.kind : '');
    btnCheck.disabled = complete;
    btnHint.disabled = complete;
    btnReset.disabled = complete;
    btnSkip.hidden = complete;
    btnNext.hidden = !complete;
  }

  function check() {
    if (complete) return;
    if (chosen.length < tiles.length) {
      setFeedback(t('play.placeAll', { total: tiles.length, placed: chosen.length }), 'bad');
      render();
      return;
    }
    const result = checkAnswer(expectedTexts(), chosen.map((k) => tile(k).text));
    if (!result.correct) {
      const firstWrong = result.wrong[0];
      const wrongWord = tile(chosen[firstWrong]).wordId;
      store.update((p) => wordError(p, wrongWord));
      setFeedback(t('play.wrong', { pos: firstWrong + 1 }), 'bad');
      render();
      // mark wrong tiles after render
      [...answer.querySelectorAll('.tile')].forEach((el, i) => { if (result.wrong.includes(i)) el.classList.add('wrong'); });
      return;
    }
    complete = true;
    const s = pick.sentence;
    store.update((p) => {
      let np = recordSolved(p, s.id, { newWordIds: pick.newWordIds, revealedIds: pick.reveal ? [] : [...revealed], seenIds: contentWords(s, dict), promoteUpTo: pick.reveal ? 2 : 1 });
      np = { ...np, streak: registerSolve(np.streak, localDay()) };
      return np;
    });
    setFeedback(t('play.correct'), 'good');
    const tr = pickTr(s.tr, ctx.lang);
    clear(lesson);
    lesson.append(
      h('strong', {}, t('play.correctSentence'), ':'),
      h('span', { class: 'sentence-display' }, renderTib(s.words, dict)),
      h('div', {}, h('strong', {}, t('play.translationLabel'), ': '), tr.text),
    );
    if (s.note) {
      const note = pickTr(s.note, ctx.lang);
      if (note.text) lesson.append(h('div', {}, h('strong', {}, t('play.note'), ': '), note.text));
    }
    lesson.append(h('div', { class: 'source' }, `${t('play.source')}: ${s.source}`));
    lesson.hidden = false;
    render();
  }

  function hint() {
    if (complete) return;
    const expected = expectedTexts();
    let pos = chosen.findIndex((k, i) => tile(k).text !== expected[i]);
    if (pos === -1) pos = chosen.length;
    if (pos >= expected.length) { setFeedback(t('play.hintAllPlaced')); render(); return; }
    if (pos < chosen.length) { setFeedback(t('play.hintReturn', { pos: pos + 1 })); render(); return; }
    const key = rack.find((k) => tile(k).text === expected[pos]);
    hintedKey = key ?? null;
    setFeedback(t('play.hintNext'));
    render();
  }

  nextSentence();
  return () => {};
}
