// The game screen: four exercises on the same sentence picker.
//   tiles   - assemble the Tibetan sentence from word/syllable tiles
//   meaning - read the Tibetan sentence and choose its translation
//   recall  - read the translation and choose the Tibetan sentence
//   wylie   - type the sentence in Wylie transliteration
//
// In course mode (`mode`) the same screen runs a step of a unit, a unit check
// or a review session: the sentences come from the course engine instead of
// the picker, the exercise is fixed, and the header shows the place in the course.
//   { kind: 'step', unit, step: 'tiles'|'meaning'|'recall', repeat }
//   { kind: 'check', unit }
//   { kind: 'review' }

import { h, clear, popover, popoverOpen, tibText, audioButton, toast } from '../ui.js';
import { pickTr } from '../i18n/index.js';
import { pickNext, contentWords, unknownWords, dueWordsIn } from '../engine/next.js';
import { checkAnswer, shuffle, checkWylie, pickOptions, pickTibOptions } from '../engine/check.js';
import { renderTib, splitSyllables, fuseParticle, stripTsheg } from '../engine/tib.js';
import { toWylie, syllableToWylie, CONSONANT_TABLE, VOWEL_TABLE } from '../engine/wylie.js';
import { revealWord, wordError, recordSolved, setWordStatus, setSetting, wordStatus, markStepDone, setUnitStep, recordCheck, STATUS } from '../engine/progress.js';
import { registerSolve, localDay } from '../engine/streak.js';
import { hardWords } from '../engine/hard.js';
import { relatedNotes, noteForWord } from '../engine/grammar.js';
import { stepQueue, makeCheck, passScore, reviewSession, nextUnit, STEPS, unitAllKnown } from '../engine/course.js';
import { sentenceIssueUrl, wordIssueUrl, reportControl } from '../report.js';
import { needsOnboarding, showOnboarding } from './onboarding.js';
import { unitName } from './course.js';

const EXERCISES = ['tiles', 'meaning', 'recall', 'wylie'];

let lastSentenceId = null;
let lastReason = null;

export function renderPlay(root, ctx, mode = null) {
  const { store, data, t } = ctx;
  const dict = data.words;
  const focusMode = !mode && ctx.param === 'hard';
  const kind = mode ? mode.kind : null;     // null | 'step' | 'check' | 'review'
  const inCheck = kind === 'check';

  // ---- round state ----
  let pick = null;        // { sentence, newWordIds, dueWordIds, reveal, reason }
  let tiles = [];         // [{ key, text, wylie, wordId }]
  let rack = [];          // keys
  let chosen = [];        // keys
  let complete = false;
  let failed = false;     // check mode: the task is over with a wrong answer
  let revealed = new Set();
  let hintedKey = null;
  let attempts = 0;
  let options = [];       // meaning mode: [{ id, text }]
  let wrongOptions = new Set();
  let wylieTokens = [];   // wylie mode: [{ text, wordId }]
  let feedback = { text: '', kind: '' };
  let wrongWordId = null;  // the misplaced word of the last wrong answer ("Why?" button)
  let taskExercise = null; // course modes: the exercise of the current task
  // course state
  let deferred = new Set(); // step: sentences solved with a mistake, back to the end of the queue
  let tasks = [];           // check / review: [{ sentence, exercise }]
  let taskIndex = -1;
  let score = 0;
  let wrongTasks = [];      // check: the failed sentences
  let wrongWords = new Set();
  let demoted = 0;          // review: words sent back to learning
  let finished = false;

  // ---- DOM skeleton ----
  const reasonBadge = h('span', { class: 'badge reason' });
  const newBadge = h('span', { class: 'badge gold' });
  const dueBadge = h('span', { class: 'badge blue' });
  const exerciseSwitch = h('div', { class: 'switch', role: 'group', 'aria-label': t('play.exercise') },
    ...EXERCISES.map((ex) => h('button', { type: 'button', dataset: { exercise: ex }, onClick: () => setExercise(ex) }, t(`play.exercises.${ex}`))),
  );
  const courseTitle = h('div', { class: 'course-crumb' });
  const courseCounter = h('span', { class: 'counter', id: 'course-counter' });
  const courseBack = h('a', { class: 'course-back', href: kind === 'review' ? '#/course' : mode ? mode.back || `#/course/${mode.unit.id}` : '#/course' }, kind === 'review' ? t('course.toMap') : t('course.toUnit'));
  const focusBar = focusMode ? h('div', { class: 'cold-note' }, t('play.focusNote'), ' ', h('a', { href: '#/play' }, t('play.focusExit'))) : null;
  const promptLabel = h('div', { class: 'label' });
  const prompt = h('h2', { class: 'prompt' });
  const promptAudio = h('span', { class: 'prompt-audio' });
  const fallbackNote = h('p', { class: 'fine' });
  const machineNote = h('p', { class: 'fine' });
  const chips = h('div', { class: 'chips' });
  const coldNote = h('div', { class: 'cold-note', hidden: true }, t('play.coldStart'));
  const answerCount = h('span', { class: 'counter' });
  const rackCount = h('span', { class: 'counter' });
  const answerHead = h('div', { class: 'section-head' }, h('h2', {}, t('play.yourSentence')), answerCount);
  const answer = h('div', { class: 'answer', 'aria-label': t('play.yourSentence') });
  const rackHead = h('div', { class: 'section-head' }, h('h2', {}, t('play.tiles')), rackCount);
  const rackEl = h('div', { class: 'rack', 'aria-label': t('play.tiles') });
  const optionsEl = h('div', { class: 'options', role: 'group' });
  const wylieInput = h('input', { class: 'wylie-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: t('play.wyliePlaceholder'), 'aria-label': t('play.wyliePrompt') });
  const wylieHelpBtn = h('button', { type: 'button', class: 'action small', onClick: showWylieHelp }, t('play.wylieHelp'));
  const wylieBox = h('div', { class: 'wylie-box' }, wylieInput, wylieHelpBtn);
  const feedbackEl = h('p', { class: 'feedback', role: 'status' });
  const btnCheck = h('button', { type: 'button', class: 'action primary', onClick: check }, t('play.check'));
  const btnHint = h('button', { type: 'button', class: 'action', id: 'btn-hint', onClick: hint }, t('play.hint'));
  const btnGrammar = h('button', { type: 'button', class: 'action', id: 'btn-grammar', onClick: () => showGrammar(null) }, t('play.grammar'));
  const btnReset = h('button', { type: 'button', class: 'action', id: 'btn-reset', onClick: () => deal(false) }, t('play.reset'));
  const btnSkip = h('button', { type: 'button', class: 'action', onClick: () => nextSentence() }, t('play.skip'));
  const btnNext = h('button', { type: 'button', class: 'action next', hidden: true, onClick: () => nextSentence() }, t('play.next'));
  const lesson = h('section', { class: 'lesson', hidden: true });
  const meterFill = h('div', {});
  const lessonMeter = h('div', { class: 'lesson-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, meterFill);
  const shortcuts = h('p', { class: 'fine shortcuts' }, t('play.shortcuts'));
  const result = h('div', { class: 'course-result', hidden: true });
  const body = h('div', { class: 'panel-body' },
    focusBar,
    promptLabel,
    prompt, promptAudio, fallbackNote, machineNote, chips, coldNote,
    answerHead, answer,
    rackHead, rackEl,
    optionsEl,
    wylieBox,
    feedbackEl,
    h('div', { class: 'buttons' }, btnCheck, btnHint, btnGrammar, btnReset, btnSkip, btnNext),
    lesson,
    result,
    shortcuts,
  );

  root.append(
    h('section', { class: 'panel' + (mode ? ' course-play' : '') },
      mode
        ? h('div', { class: 'topbar course-top' }, courseTitle, h('div', { class: 'progressline' }, courseCounter, courseBack))
        : h('div', { class: 'topbar' }, h('div', { class: 'progressline' }, reasonBadge, newBadge, dueBadge), exerciseSwitch, lessonMeter),
      body,
    ),
  );

  // ---- helpers ----
  const settings = () => store.get().settings;
  function tileMode() { return settings().tileMode || 'words'; }
  function exercise() {
    if (kind === 'step') return mode.step;
    if (kind === 'check' || kind === 'review') return taskExercise || 'tiles';
    return EXERCISES.includes(settings().exercise) ? settings().exercise : 'tiles';
  }
  function showWylie() { return settings().showWylie === true; }

  function setExercise(ex) {
    if (ex === exercise()) return;
    store.update((p) => setSetting(p, 'exercise', ex));
    deal(true);
  }

  function buildTiles() {
    const out = [];
    let k = 0;
    for (const id of pick.sentence.words) {
      const w = dict[id];
      if (!w || w.service) continue;
      if (tileMode() === 'syllables' && !w.fused) {
        for (const s of splitSyllables(w.tib)) out.push({ key: k++, text: s, wylie: syllableToWylie(stripTsheg(s)), wordId: id });
      } else {
        out.push({ key: k++, text: w.tib, wylie: toWylie(w.tib), wordId: id });
      }
    }
    return out;
  }

  /** Expected Wylie syllables with the word each belongs to (fused particles glue to the previous word). */
  function buildWylieTokens() {
    const words = [];
    for (const id of pick.sentence.words) {
      const w = dict[id];
      if (!w || w.service) continue;
      if (w.fused && words.length) {
        const prev = words[words.length - 1];
        prev.tib = fuseParticle(prev.tib, w.tib);
      } else {
        words.push({ tib: w.tib, wordId: id });
      }
    }
    const out = [];
    for (const w of words) {
      for (const s of splitSyllables(w.tib)) out.push({ text: syllableToWylie(stripTsheg(s)), wordId: w.wordId });
    }
    return out;
  }

  function expectedTexts() { return tiles.map((x) => x.text); }
  function tile(key) { return tiles.find((x) => x.key === key); }
  function setFeedback(text, kind = '', wrongId = null) { feedback = { text, kind }; wrongWordId = kind === 'bad' ? wrongId : null; }
  function sentenceTib() { return renderTib(pick.sentence.words, dict); }

  /** A course pick: the sentence with its unknown and due words. */
  function coursePick(sentence, reason) {
    const p = store.get();
    return { sentence, newWordIds: inCheck ? [] : unknownWords(sentence, dict, p), dueWordIds: dueWordsIn(sentence, dict, p, localDay()), reveal: false, reason };
  }

  function nextSentence() {
    if (kind === 'step') return nextStepSentence();
    if (kind === 'check' || kind === 'review') return nextTask();
    const p = store.get();
    const focusIds = focusMode ? hardWords(p, dict) : null;
    pick = pickNext(data.sentences, dict, data.sets, p, { lastId: lastSentenceId, lastReason, focusIds, today: localDay() });
    lastSentenceId = pick ? pick.sentence.id : null;
    lastReason = pick ? pick.reason : null;
    revealed = new Set();
    deal(true);
  }

  // ---- course: a step of a unit ----
  function nextStepSentence() {
    const p = store.get();
    const unit = mode.unit;
    const rec = p.course.units[unit.id];
    const done = new Set(rec ? rec.done : []);
    const queue = mode.repeat ? unitQueueAll() : mode.sentences ? mode.sentences.filter((s) => !done.has(s.id)) : stepQueue(unit, p, data.sentences, dict);
    if (!queue.length) return stepFinished();
    let next = queue.find((s) => !deferred.has(s.id) && s.id !== lastSentenceId) || queue.find((s) => !deferred.has(s.id));
    if (!next) { deferred = new Set(); next = queue.find((s) => s.id !== lastSentenceId) || queue[0]; }
    pick = coursePick(next, 'course');
    lastSentenceId = next.id;
    revealed = new Set();
    deal(true);
  }

  const repeatDone = new Set();
  function unitQueueAll() {
    const byId = new Map(data.sentences.map((s) => [s.id, s]));
    return (mode.sentences || mode.unit.sentences.map((id) => byId.get(id))).filter((s) => s && !repeatDone.has(s.id));
  }

  function stepFinished() {
    finished = true;
    if (!mode.repeat) {
      const n = stepNo();
      store.update((p) => (stepIndexOf(p) === n ? setUnitStep(p, mode.unit.id, n + 1) : p));
    }
    ctx.tashi?.say('stepDone');
    toast(t('course.stepDone'));
    ctx.navigate(`course/${mode.unit.id}`);
  }

  /** The number of this screen's step in the unit's ladder. */
  function stepNo() { return mode.stepNo || (kind === 'check' ? STEPS.length : STEPS.indexOf(mode.step) + 1); }

  function stepIndexOf(p) {
    const r = p.course.units[mode.unit.id];
    return r ? r.step : 1;
  }

  // ---- course: check and review tasks ----
  function startTasks() {
    if (inCheck) {
      tasks = mode.tasks || makeCheck(mode.unit, data.sentences);
    } else {
      tasks = reviewSession(data.course, store.get(), data.sentences, dict, localDay());
      if (!tasks.length) { toast(t('course.nothingToReview')); ctx.navigate('course'); return; }
    }
    taskIndex = -1;
    score = 0;
    wrongTasks = [];
    wrongWords = new Set();
    nextTask();
  }

  function nextTask() {
    taskIndex++;
    if (taskIndex >= tasks.length) return tasksFinished();
    const task = tasks[taskIndex];
    taskExercise = task.exercise;
    pick = coursePick(task.sentence, inCheck ? 'check' : 'due');
    revealed = new Set();
    deal(true);
  }

  function tasksFinished() {
    finished = true;
    if (inCheck) {
      const pass = mode.pass || passScore(tasks.length);
      const unitWords = mode.wordIds || mode.unit.words;
      store.update((p) => recordCheck(p, mode.unit.id, { score, pass, wordIds: unitWords, wrongWordIds: [...wrongWords] }));
      showCheckResult(score >= pass, pass);
      return;
    }
    ctx.tashi?.say('stepDone');
    toast(t('course.reviewDone', { n: tasks.length, demoted }), 4000);
    ctx.navigate('course');
  }

  function showCheckResult(passed, pass) {
    ctx.tashi?.say(passed ? 'checkPassed' : 'checkFailed');
    const unit = mode.unit;
    const next = nextUnit(data.course, unit);
    clear(result).append(
      h('h3', {}, t('course.checkResultTitle')),
      h('p', { class: 'feedback ' + (passed ? 'good' : 'bad') }, t('course.checkResult', { score, total: tasks.length }), ' ', passed ? t('course.checkPassed') : t('course.checkFailed', { pass })),
      wrongTasks.length ? h('div', { class: 'unit-notes' },
        h('div', { class: 'label' }, t('course.checkMistakes')),
        ...wrongTasks.map((s) => h('div', { class: 'example' }, h('span', { class: 'tib' }, renderTib(s.words, dict)), h('span', { class: 'tr' }, pickTr(s.tr, ctx.lang).text))),
      ) : null,
      h('div', { class: 'buttons' },
        passed && next ? h('a', { class: 'action next', id: 'check-next-unit', href: `#/course/${next.id}` }, t('course.nextUnit')) : null,
        h('button', { type: 'button', class: 'action' + (passed ? '' : ' primary'), id: 'check-again', onClick: () => { finished = false; result.hidden = true; startTasks(); } }, t('course.checkAgain')),
        h('a', { class: 'action', href: `#/course/${unit.id}` }, t('course.toUnit')),
      ),
    );
    result.hidden = false;
    for (const el of [promptLabel, prompt, promptAudio, fallbackNote, machineNote, chips, coldNote, answerHead, answer, rackHead, rackEl, optionsEl, wylieBox, feedbackEl, lesson, shortcuts]) el.hidden = true;
    btnCheck.hidden = btnHint.hidden = btnGrammar.hidden = btnReset.hidden = btnSkip.hidden = btnNext.hidden = true;
    courseCounter.textContent = '';
    const again = result.querySelector('#check-again');
    if (again) again.focus();
  }

  function courseHeader() {
    if (!mode) return;
    if (kind === 'review') {
      courseTitle.textContent = t('course.reviewTitle');
      courseCounter.textContent = t('course.taskOf', { n: Math.min(taskIndex + 1, tasks.length), total: tasks.length });
      return;
    }
    const stepName = mode.stepLabel || (kind === 'check' ? t('course.steps.check') : t(`course.steps.${mode.step}`));
    courseTitle.textContent = `${unitName(ctx, mode.unit)} · ${stepName}`;
    if (kind === 'check') {
      courseCounter.textContent = t('course.taskOf', { n: Math.min(taskIndex + 1, tasks.length), total: tasks.length });
    } else {
      const r = store.get().course.units[mode.unit.id];
      const done = mode.repeat ? repeatDone.size : r && r.done ? r.done.length : 0;
      courseCounter.textContent = t('course.solvedOf', { n: done, total: mode.unit.sentences.length });
    }
  }

  function deal(fresh) {
    tiles = buildTiles();
    rack = shuffle(tiles.map((x) => x.key));
    chosen = [];
    complete = false;
    failed = false;
    hintedKey = null;
    attempts = 0;
    wrongOptions = new Set();
    options = exercise() === 'meaning' ? pickOptions(pick.sentence, data.sentences, ctx.lang, 4)
      : exercise() === 'recall' ? pickTibOptions(pick.sentence, data.sentences, dict, 4) : [];
    wylieTokens = exercise() === 'wylie' ? buildWylieTokens() : [];
    wylieInput.value = '';
    lesson.hidden = true;
    if (fresh) setFeedback(inCheck ? t('course.checkPrompt') : t(`play.start_${exercise()}`));
    render();
    if (exercise() === 'wylie' && fresh && !popoverOpen()) wylieInput.focus();
  }

  function isNew(wordId) { return pick.newWordIds.includes(wordId); }
  function isDueWord(wordId) { return pick.dueWordIds.includes(wordId); }

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
    const report = reportControl(ctx, { kind: 'word', id: wordId, tib: w.tib, translation: tr.text, fallbackUrl: wordIssueUrl(ctx.config, wordId, w, tr.text, ctx.lang) });
    close = popover(h('div', {},
      h('p', { class: 'big-tib' }, w.tib, ' ', audioButton(ctx, `w-${wordId}`)),
      h('div', { class: 'wylie' }, w.wylie, ' · ', t(`status.${wordStatus(store.get(), wordId)}`)),
      h('p', { class: 'tr' }, tr.text, tr.fallback ? ` (${tr.lang})` : ''),
      h('div', { class: 'buttons' },
        h('button', { type: 'button', class: 'action primary', onClick: () => mark(STATUS.KNOWN) }, t('play.know')),
        h('button', { type: 'button', class: 'action', onClick: () => mark(STATUS.LEARNING) }, t('play.learning')),
      ),
      report ? h('p', { class: 'fine' }, report) : null,
    ));
  }

  /**
   * Grammar help for the current sentence: its own note, then notes of the
   * same set whose examples share its words. With `wordId` (a misplaced word)
   * the note about that word comes first. Looking is not a peek: no word
   * status changes here.
   */
  function showGrammar(wordId) {
    const s = pick.sentence;
    let entries = relatedNotes(s, data.sentences, data.sets, dict, 3);
    if (wordId) {
      const first = noteForWord(s, wordId, data.sentences, data.sets, dict);
      if (first) entries = [first, ...entries.filter((e) => e.note.en !== first.note.en)];
    }
    const hideOwnTr = exercise() === 'meaning' && !complete; // the translation is the answer there
    const hideOwnTib = exercise() === 'recall' && !complete; // and the Tibetan sentence is the answer here
    let close = null;
    const items = entries.map((e) => {
      const ex = e.example;
      const tr = pickTr(ex.tr, ctx.lang);
      return h('div', { class: 'note-row' },
        h('p', { class: 'note-text' }, tibText(pickTr(e.note, ctx.lang).text)),
        h('div', { class: 'example' },
          ex.id === s.id && hideOwnTib ? null : h('span', { class: 'tib' }, renderTib(ex.words, dict)),
          ex.id === s.id && hideOwnTr ? null : h('span', { class: 'tr' }, tr.text),
        ),
      );
    });
    close = popover(h('div', { class: 'grammar-help' },
      h('h3', {}, t('play.grammar')),
      items.length ? items : h('p', { class: 'helper' }, t('play.noGrammar')),
      h('p', { class: 'fine' }, h('a', { href: '#/grammar', onClick: () => close() }, t('play.openGrammar'))),
    ));
  }

  function showWylieHelp() {
    const row = (pairs) => h('div', { class: 'wylie-table' }, ...pairs.map(([tib, w]) => h('span', { class: 'cell' }, h('span', { class: 'tib' }, tib), h('span', {}, w))));
    popover(h('div', {},
      h('h3', {}, t('play.wylieHelp')),
      h('p', { class: 'helper' }, t('play.wylieHelpText')),
      row(CONSONANT_TABLE),
      row(VOWEL_TABLE),
      h('p', { class: 'helper' }, t('play.wylieHelpExample')),
    ));
  }

  function tileButton(key, from) {
    const x = tile(key);
    const n = from === 'rack' ? rack.indexOf(key) + 1 : 0;
    const btn = h('button', {
      type: 'button',
      class: 'tile' + (isNew(x.wordId) && !complete ? ' new' : '') + (hintedKey === key && from === 'rack' ? ' hinted' : '') + (showWylie() && !inCheck ? ' with-wylie' : ''),
      'aria-label': x.text + (n && n <= 9 ? ` (${n})` : ''),
      onClick: () => {
        if (complete) return;
        if (from === 'rack') { rack = rack.filter((k) => k !== key); chosen.push(key); }
        else { chosen = chosen.filter((k) => k !== key); rack.push(key); }
        hintedKey = null;
        render();
      },
    }, h('span', { class: 'tile-text' }, x.text), showWylie() && !inCheck ? h('span', { class: 'tile-wylie' }, x.wylie) : null);
    const help = inCheck ? null : h('button', { type: 'button', class: 'tile-help', 'aria-label': t('play.wordHelp'), onClick: (e) => { e.stopPropagation(); showWord(x.wordId); } }, '?');
    return h('span', { class: 'tile-wrap' }, btn, help);
  }

  function optionButton(opt, i) {
    const isRight = complete && opt.id === pick.sentence.id;
    return h('button', {
      type: 'button',
      class: 'option' + (isRight ? ' right' : '') + (wrongOptions.has(opt.id) ? ' wrong' : ''),
      disabled: complete || wrongOptions.has(opt.id),
      onClick: () => chooseOption(opt),
    }, h('span', { class: 'option-num' }, String(i + 1)), h('span', { class: exercise() === 'recall' ? 'tib option-tib' : '' }, opt.text));
  }

  function render() {
    if (finished) return;
    const p = store.get();
    const s = pick.sentence;
    const ex = exercise();
    const tr = pickTr(s.tr, ctx.lang);

    if (!mode) {
      exerciseSwitch.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.exercise === ex;
        b.classList.toggle('selected', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }
    courseHeader();

    // prompt: translation (tiles, wylie) or the Tibetan sentence (meaning)
    if (ex === 'meaning') {
      promptLabel.textContent = t('play.meaningPrompt');
      prompt.textContent = sentenceTib();
      prompt.classList.add('tib');
      fallbackNote.hidden = true;
      clear(promptAudio).append(audioButton(ctx, s.id) || '');
      promptAudio.hidden = false;
    } else {
      promptLabel.textContent = ex === 'wylie' ? t('play.wyliePrompt') : ex === 'recall' ? t('play.recallPrompt') : t('play.prompt');
      promptAudio.hidden = true;
      prompt.textContent = tr.text;
      prompt.classList.remove('tib');
      fallbackNote.textContent = tr.fallback ? `(${tr.lang})` : '';
      fallbackNote.hidden = !tr.fallback;
    }
    machineNote.hidden = ctx.lang === 'en' || ex === 'meaning';
    machineNote.textContent = ctx.lang === 'en' ? '' : t('settings.machineNotice', { lang: t('langIn') }).split('.')[0] + '.';
    if (!mode) {
      reasonBadge.textContent = t(`play.whyThis.${pick.reason}`);
      // lesson progress: known words of the current set
      const setIds = Object.keys(dict).filter((id) => dict[id].set === s.set && !dict[id].service);
      const knownInSet = setIds.filter((id) => wordStatus(p, id) === STATUS.KNOWN).length;
      const pct = setIds.length ? Math.round((100 * knownInSet) / setIds.length) : 0;
      meterFill.style.width = `${pct}%`;
      lessonMeter.setAttribute('aria-valuenow', String(pct));
      lessonMeter.title = `${knownInSet}/${setIds.length}`;
      newBadge.textContent = pick.newWordIds.length ? `${t('play.newWord')}: ${pick.newWordIds.length}` : '';
      newBadge.hidden = !pick.newWordIds.length;
      dueBadge.textContent = pick.dueWordIds.length ? `${t('play.dueWord')}: ${pick.dueWordIds.length}` : '';
      dueBadge.hidden = !pick.dueWordIds.length;
    }
    coldNote.hidden = !pick.reveal || (ex === 'recall' && !complete); // the chips are hidden there

    // chips: the words of the sentence (translations hidden in meaning mode until solved;
    // in recall mode the words would give the sentence away, so the chips wait for the answer;
    // a check shows no chips at all)
    chips.hidden = (ex === 'recall' && !complete) || inCheck;
    clear(chips);
    for (const id of contentWords(s, dict)) {
      const w = dict[id];
      const st = wordStatus(p, id);
      const showTr = ex === 'meaning' ? complete || revealed.has(id) : pick.reveal || complete || revealed.has(id);
      const chip = h('button', {
        type: 'button',
        class: `chip ${st}` + (isNew(id) ? ' new' : '') + (isDueWord(id) && !complete ? ' due' : ''),
        onClick: () => showWord(id),
      },
        h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'tib' }, w.tib),
        h('span', { class: 'tr' }, showTr ? pickTr(w.tr, ctx.lang).text : '?'),
      );
      chips.append(chip);
    }

    // exercise-specific areas
    const tilesOn = ex === 'tiles';
    answerHead.hidden = !tilesOn; answer.hidden = !tilesOn; rackHead.hidden = !tilesOn; rackEl.hidden = !tilesOn;
    const choice = ex === 'meaning' || ex === 'recall';
    optionsEl.hidden = !choice;
    wylieBox.hidden = ex !== 'wylie';
    btnHint.hidden = choice || inCheck;
    btnGrammar.hidden = inCheck;
    btnReset.hidden = choice;
    btnCheck.hidden = choice;
    shortcuts.hidden = !window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    if (tilesOn) {
      answerCount.textContent = t('play.tilesCount', { placed: chosen.length, total: tiles.length });
      rackCount.textContent = t('play.available', { n: rack.length });
      clear(answer);
      clear(rackEl);
      if (!chosen.length) answer.append(h('span', { class: 'placeholder' }, t('play.placeholder')));
      chosen.forEach((k) => answer.append(tileButton(k, 'answer')));
      rack.forEach((k) => rackEl.append(tileButton(k, 'rack')));
      answer.classList.toggle('correct', complete && !failed);
      answer.classList.toggle('failed', failed);
    } else if (choice) {
      clear(optionsEl);
      options.forEach((o, i) => optionsEl.append(optionButton(o, i)));
    } else {
      wylieInput.disabled = complete;
    }

    clear(feedbackEl).append(tibText(feedback.text));
    if (feedback.kind === 'bad' && wrongWordId && dict[wrongWordId] && !inCheck) {
      const id = wrongWordId;
      feedbackEl.append(' ', h('button', { type: 'button', class: 'linkish why', onClick: () => showGrammar(id) }, t('play.why')));
    }
    feedbackEl.className = 'feedback' + (feedback.kind ? ' ' + feedback.kind : '');
    btnCheck.disabled = complete;
    btnHint.disabled = complete;
    btnReset.disabled = complete;
    btnSkip.hidden = complete || Boolean(mode);
    btnNext.hidden = !complete;
    if (mode) btnNext.textContent = kind === 'step' || kind === 'review' || taskIndex < tasks.length - 1 ? t('play.next') : t('course.seeResult');
  }

  /** The sentence, its Wylie, translation, note and source, shown after the answer. */
  function showLesson() {
    const s = pick.sentence;
    const tr = pickTr(s.tr, ctx.lang);
    const tib = sentenceTib();
    clear(lesson);
    lesson.append(
      h('strong', {}, t('play.correctSentence'), ':'),
      h('span', { class: 'sentence-display' }, tib, ' ', audioButton(ctx, s.id)),
      h('div', { class: 'wylie-line' }, toWylie(tib)),
      h('div', {}, h('strong', {}, t('play.translationLabel'), ': '), tr.text),
    );
    if (s.note) {
      const note = pickTr(s.note, ctx.lang);
      if (note.text) lesson.append(h('div', {}, h('strong', {}, t('play.note'), ': '), tibText(note.text)));
    }
    const report = reportControl(ctx, { kind: 'sentence', id: s.id, tib, translation: tr.text, fallbackUrl: sentenceIssueUrl(ctx.config, s, tib, tr.text, ctx.lang) });
    lesson.append(h('div', { class: 'source' }, `${t('play.source')}: ${s.source}`, report ? [' · ', report] : null));
    lesson.hidden = false;
  }

  /** Common bookkeeping after a correct answer. */
  function solved() {
    complete = true;
    const s = pick.sentence;
    store.update((p) => {
      // a course step or a check never promotes new words (the check does that when passed);
      // the practice promotes the one new word of a sentence; due words move up everywhere
      const newWordIds = kind === 'step' || inCheck ? [] : pick.newWordIds;
      let np = recordSolved(p, s.id, { newWordIds, revealedIds: pick.reveal ? [] : [...revealed], seenIds: contentWords(s, dict), promoteUpTo: pick.reveal ? 2 : 1 });
      np = { ...np, streak: registerSolve(np.streak, localDay()) };
      if (kind === 'step' && !mode.repeat && attempts === 0 && !revealed.size) np = markStepDone(np, mode.unit.id, s.id);
      return np;
    });
    if (kind === 'step') {
      if (attempts > 0 || revealed.size) deferred.add(s.id); else deferred.delete(s.id);
      if (mode.repeat) repeatDone.add(s.id);
    }
    if (inCheck) score++;
    ctx.tashi?.say('correct');
    setFeedback(t('play.correct'), 'good');
    showLesson();
    render();
    btnNext.focus();
  }

  /** Check mode: a wrong answer ends the task; the right answer is shown. */
  function taskFailed(wrongIds) {
    complete = true;
    failed = true;
    wrongTasks.push(pick.sentence);
    const unitWords = new Set(mode.unit.words || []);
    for (const id of wrongIds) if (unitWords.has(id)) wrongWords.add(id);
    ctx.tashi?.say('wrong');
    setFeedback(t('course.taskWrong'), 'bad');
    showLesson();
    render();
    btnNext.focus();
  }

  /** Why was it wrong? A particle hint right away, the lesson note from the second try. */
  function explain(wrongWordId) {
    const w = dict[wrongWordId];
    if (w && w.pos === 'particle') return ' ' + t('play.particleHint', { tib: w.tib });
    if (attempts >= 2 && pick.sentence.note) {
      const note = pickTr(pick.sentence.note, ctx.lang).text;
      if (note) return ' ' + t('play.noteHint', { note });
    }
    return '';
  }

  function check() {
    if (complete) return;
    if (exercise() === 'wylie') return checkTyped();
    if (chosen.length < tiles.length) {
      setFeedback(t('play.placeAll', { total: tiles.length, placed: chosen.length }), 'bad');
      render();
      return;
    }
    const result = checkAnswer(expectedTexts(), chosen.map((k) => tile(k).text));
    if (!result.correct) {
      attempts++;
      const firstWrong = result.wrong[0];
      const wrongWord = tile(chosen[firstWrong]).wordId;
      if (inCheck) { taskFailed(result.wrong.map((i) => tile(chosen[i]).wordId)); return; }
      store.update((p) => wordError(p, wrongWord));
      if (kind === 'review' && wordStatus(store.get(), wrongWord) === STATUS.LEARNING) demoted++;
      ctx.tashi?.say('wrong');
      setFeedback(t('play.wrong', { pos: firstWrong + 1 }) + explain(wrongWord), 'bad', wrongWord);
      render();
      [...answer.querySelectorAll('.tile')].forEach((el, i) => { if (result.wrong.includes(i)) el.classList.add('wrong'); });
      return;
    }
    solved();
  }

  function checkTyped() {
    const value = wylieInput.value;
    if (!value.trim()) { setFeedback(t('play.wylieEmpty'), 'bad'); render(); return; }
    const result = checkWylie(wylieTokens.map((x) => x.text), value);
    if (!result.correct) {
      attempts++;
      const i = result.wrong[0];
      const tok = wylieTokens[Math.min(i, wylieTokens.length - 1)];
      if (tok) store.update((p) => wordError(p, tok.wordId));
      let msg = t('play.wylieWrong', { pos: i + 1 });
      if (attempts >= 2 && tok) msg += ' ' + t('play.wylieExpected', { syllable: tok.text });
      msg += explain(tok ? tok.wordId : null);
      ctx.tashi?.say('wrong');
      setFeedback(msg, 'bad', tok ? tok.wordId : null);
      render();
      wylieInput.focus();
      return;
    }
    solved();
  }

  function chooseOption(opt) {
    if (complete || wrongOptions.has(opt.id)) return;
    if (opt.id === pick.sentence.id) { solved(); return; }
    attempts++;
    wrongOptions.add(opt.id);
    if (inCheck) { taskFailed(contentWords(pick.sentence, dict)); return; }
    if (kind === 'review') {
      // a wrong recall sends the due words of the sentence back to learning
      const due = pick.dueWordIds;
      if (due.length) { store.update((p) => due.reduce((q, id) => wordError(q, id), p)); demoted += due.length; pick = { ...pick, dueWordIds: [] }; }
    }
    ctx.tashi?.say('wrong');
    setFeedback(t('play.meaningWrong'), 'bad');
    render();
  }

  function hint() {
    if (complete) return;
    if (exercise() === 'wylie') {
      const typed = checkWylie(wylieTokens.map((x) => x.text), wylieInput.value).typed;
      const i = wylieTokens.findIndex((tok, idx) => (typed[idx] || '').toLowerCase() !== tok.text.toLowerCase());
      if (i === -1) { setFeedback(t('play.hintAllPlaced')); render(); return; }
      setFeedback(t('play.wylieHint', { pos: i + 1, syllable: wylieTokens[i].text }));
      render();
      wylieInput.focus();
      return;
    }
    if (kind === 'step') attempts++; // a hint is not a clean solve
    const expected = expectedTexts();
    let pos = chosen.findIndex((k, i) => tile(k).text !== expected[i]);
    if (pos === -1) pos = chosen.length;
    if (pos >= expected.length) { setFeedback(t('play.hintAllPlaced')); render(); return; }
    if (pos < chosen.length) {
      // a placed tile is wrong: name the tile that belongs there and keep the misplaced ones red
      setFeedback(t('play.hintReturn', { pos: pos + 1, tib: expected[pos] }), 'bad');
      render();
      [...answer.querySelectorAll('.tile')].forEach((el, i) => { if (i >= pos) el.classList.add('wrong'); });
      return;
    }
    const key = rack.find((k) => tile(k).text === expected[pos]);
    hintedKey = key ?? null;
    setFeedback(t('play.hintNext'));
    render();
  }

  // ---- keyboard ----
  function onKey(e) {
    if (popoverOpen() || e.altKey || e.ctrlKey || e.metaKey || finished) return;
    const tag = (e.target && e.target.tagName) || '';
    const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if (e.key === 'Enter') {
      if (complete) { e.preventDefault(); nextSentence(); return; }
      if (exercise() === 'wylie' && e.target === wylieInput) { e.preventDefault(); checkTyped(); return; }
      if (!inField && exercise() === 'tiles') { e.preventDefault(); check(); }
      return;
    }
    if (inField) return;
    const ex = exercise();
    if (ex === 'tiles') {
      if (/^[1-9]$/.test(e.key)) {
        const key = rack[Number(e.key) - 1];
        if (key !== undefined && !complete) { rack = rack.filter((k) => k !== key); chosen.push(key); hintedKey = null; render(); }
        e.preventDefault();
      } else if (e.key === 'Backspace' && chosen.length && !complete) {
        rack.push(chosen.pop()); render(); e.preventDefault();
      } else if ((e.key === '?' || e.key === 'h') && !inCheck) { hint(); }
    } else if ((ex === 'meaning' || ex === 'recall') && /^[1-4]$/.test(e.key)) {
      const opt = options[Number(e.key) - 1];
      if (opt) chooseOption(opt);
      e.preventDefault();
    }
  }
  document.addEventListener('keydown', onKey);

  // ---- start ----
  if (kind === 'check' || kind === 'review') {
    if (inCheck && !(unitAllKnown(store.get(), mode.unit) || stepIndexOf(store.get()) >= stepNo())) { ctx.navigate(`course/${mode.unit.id}`); }
    else startTasks();
  } else if (kind === 'step') {
    if (!mode.repeat && stepIndexOf(store.get()) !== stepNo()) {
      // not the current step of the unit: the ladder decides where to go
      ctx.navigate(`course/${mode.unit.id}`);
    } else nextSentence();
  } else if (!focusMode && needsOnboarding(ctx)) showOnboarding(ctx, nextSentence);
  else nextSentence();

  return () => document.removeEventListener('keydown', onKey);
}
