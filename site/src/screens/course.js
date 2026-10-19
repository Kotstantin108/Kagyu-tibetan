// The course: #/course is the map (continue, review, modules and units),
// #/course/<module>/<n> a unit with its ladder of steps, #/course/<module>/<n>/words
// the first step; the other steps and the review run on the play screen in
// course mode. #/course/<module>/theory is the theory page of a module (read
// before its first part). #/course/done is the end of the course.

import { h, popover, tibText, audioButton, toast } from '../ui.js';
import { pickTr } from '../i18n/index.js';
import { renderPlay } from './play.js';
import { needsOnboarding, showOnboarding } from './onboarding.js';
import { courseModules, allUnits, findUnit, unitStep, unitPassed, unitAllKnown, courseProgress, moduleProgress, currentUnit, nextUnit, dueCount, STEPS, PASSED, CHECK_SIZE } from '../engine/course.js';
import { startCourse, setCanRead, setCurrentUnit, seeUnitWords, setUnitStep, setSetting, wordStatus, markTheory, STATUS } from '../engine/progress.js';
import { PARTS, partOf, partId, partSigns, partNewItems, examPassed, ALPHABET_MODULE, ALPHA_STEPS, ALPHA_CHECK_SIZE, FIRST_SENTENCES, FIRST_SENTENCES_PASS } from '../engine/alphabet.js';
import { toWylie } from '../engine/wylie.js';
import { renderDrill } from './drill.js';
import { contentWords } from '../engine/next.js';
import { effectiveStreak, localDay } from '../engine/streak.js';
import { renderTib } from '../engine/tib.js';
import { theoryOf, needsTheory, theoryKey } from '../engine/theory.js';

export function renderCourse(root, ctx) {
  const parts = (ctx.param || '').split('/').filter(Boolean);
  if (!parts.length) return renderMap(root, ctx);
  if (parts[0] === 'review') return renderPlay(root, ctx, { kind: 'review' });
  if (parts[0] === 'done') return renderDone(root, ctx);
  if (parts[0] === ALPHABET_MODULE) return renderAlphabet(root, ctx, parts.slice(1));
  if (parts[1] === 'theory') return renderTheory(root, ctx, parts[0]);
  const unit = findUnit(ctx.data.course, `${parts[0]}/${parts[1] || ''}`);
  if (!unit) { ctx.navigate('course'); return () => {}; }
  const step = parts[2];
  if (!step) return renderUnit(root, ctx, unit);
  if (step === 'words') return renderWords(root, ctx, unit);
  if (step === 'check') return renderPlay(root, ctx, { kind: 'check', unit });
  if (['tiles', 'meaning', 'recall'].includes(step)) return renderPlay(root, ctx, { kind: 'step', unit, step, repeat: parts[3] === 'again' });
  ctx.navigate(`course/${unit.id}`);
  return () => {};
}

// ---- names ----

export function moduleName(ctx, moduleId) {
  if (moduleId === ALPHABET_MODULE) return ctx.t('alphabet.title');
  const set = ctx.data.sets.find((s) => s.id === moduleId);
  return set ? pickTr(set.name, ctx.lang).text : moduleId;
}

/** "Lesson 2 · part 3" (or "Alphabet · part 3"). */
export function unitName(ctx, unit) {
  if (unit.part) return `${ctx.t('alphabet.title')} · ${ctx.t('course.part', { n: unit.part, total: PARTS.length })}`;
  const module = courseModules(ctx.data.course).find((m) => m.id === unit.module);
  const n = unit.id.split('/')[1];
  return `${shortModuleName(ctx, unit.module)} · ${ctx.t('course.part', { n, total: module ? module.units.length : n })}`;
}

/** The set name up to the first period: "Lesson 2" of "Lesson 2. Verbs". */
function shortModuleName(ctx, moduleId) {
  return moduleName(ctx, moduleId).split(/\.\s/)[0];
}

function theoryHref(key) {
  return `#/course/${key}/theory`;
}

/** The step-0 row of a unit's ladder: its theory page, when it has one (the first part of a lesson, any alphabet part). */
function theoryLadderRow(ctx, p, unit) {
  const { data, t } = ctx;
  const key = theoryKey(unit);
  if (!theoryOf(data.intro, key, ctx.lang).length || (!unit.part && !unit.id.endsWith('/1'))) return null;
  const read = p.course.theory.includes(key);
  const first = !read && needsTheory(p, unit, data.intro);
  return h('div', { class: 'ladder-row' + (read ? ' done' : '') + (first ? ' current' : ''), dataset: { step: 'theory' } },
    h('span', { class: 'ladder-num' }, read ? '✓' : '0'),
    h('div', { class: 'ladder-main' }, h('div', { class: 'ladder-title' }, t('course.theory')), h('div', { class: 'stage-state' + (read ? ' passed' : '') }, read ? t('course.theoryRead') : t('course.theoryUnread'))),
    h('a', { class: 'action small' + (first ? ' primary' : ''), href: theoryHref(key) }, read ? t('course.repeatStep') : t('course.theoryOpen')),
  );
}

/** The listen button of a sign, when a native recording of it exists (alphabet.json `audio`, from content/sign-audio.tsv). */
function signAudio(ctx, tib) {
  const id = ctx.data.alphabet.audio && ctx.data.alphabet.audio[tib];
  return id ? audioButton(ctx, id, { small: true }) : null;
}

/** A popover with the card of a tapped sign of the alphabet (a letter, a vowel sign, a stack); a sign used as a prefix or suffix shows every role. */
function showSign(ctx, tib) {
  const { data, t } = ctx;
  const dict = data.words;
  const entries = (data.alphabet.letters || []).filter((e) => e.tib === tib);
  if (!entries.length) return;
  const rows = entries.map((e) => {
    const examples = (e.examples || []).map((id) => dict[id]).filter(Boolean);
    return h('div', { class: 'theory-word theory-sign' },
      h('div', { class: 'word-card-head' },
        h('span', { class: 'tib big' }, e.tib),
        signAudio(ctx, e.tib),
        h('span', { class: 'sign-name' }, e.name),
        e.tone ? h('span', { class: 'tone-badge ' + e.tone.toLowerCase() }, t(`alphabet.tone${e.tone}`)) : null,
      ),
      h('div', { class: 'wylie' }, t('alphabet.wylieLabel'), ': ', e.wylie),
      h('p', { class: 'tr' }, soundText(e, ctx.lang)),
      examples.length ? h('div', { class: 'sign-examples' }, ...examples.map((w) => h('div', { class: 'example' }, h('span', { class: 'tib' }, w.tib), h('span', { class: 'tr' }, `${w.wylie} · ${pickTr(w.tr, ctx.lang).text}`)))) : null,
    );
  });
  popover(h('div', { class: 'theory-popover' }, ...rows));
}

/** A popover with the words of a tapped piece of Tibetan (a word, or a word with its fused particle). */
function showPieceWords(ctx, ids) {
  const { data, t } = ctx;
  const rows = ids.filter((id) => data.words[id]).map((id) => data.words[id]).map((w, i) => h('div', { class: 'theory-word' },
    h('p', { class: 'big-tib' }, w.tib, ' ', audioButton(ctx, `w-${ids.filter((id) => data.words[id])[i]}`, { small: true })),
    h('div', { class: 'wylie' }, w.wylie, w.pos ? ` · ${w.pos}` : ''),
    h('p', { class: 'tr' }, pickTr(w.tr, ctx.lang).text),
  ));
  if (!rows.length) return;
  popover(h('div', { class: 'theory-popover' }, ...rows, h('p', { class: 'fine' }, t('course.theoryWordHint'))));
}

/**
 * A theory page: a lesson's grammar, read before its first part (`key` is
 * the module id), or the text of an alphabet part, read before its cards
 * (`key` is the part id, `alphabet/3`). Every Tibetan word opens its
 * meaning; on an alphabet page every sign of the alphabet opens its card.
 */
function renderTheory(root, ctx, key) {
  const { store, data, t } = ctx;
  const paragraphs = theoryOf(data.intro, key, ctx.lang);
  const first = findUnit(data.course, key.startsWith(`${ALPHABET_MODULE}/`) ? key : `${key}/1`);
  if (!paragraphs.length || !first) { ctx.navigate('course'); return () => {}; }
  const part = first.part ? PARTS.find((x) => x.n === first.part) : null;
  const p = store.get();
  const read = p.course.theory.includes(key);
  const toWords = needsTheory(p, first, data.intro);
  const signs = part ? new Set((data.alphabet.letters || []).map((e) => e.tib)) : null;
  const body = h('div', { class: 'panel-body theory' },
    h('div', { class: 'label' }, part ? `${t('alphabet.title')} · ${t('course.theory')}` : t('course.theory')),
    h('h2', { class: 'prompt' }, part ? `${part.n}. ${t(`alphabet.parts.${part.n}`)}` : moduleName(ctx, key)),
  );
  for (const para of paragraphs) {
    const el = h('p', { class: 'theory-text' });
    for (const tok of para) {
      if (typeof tok === 'string') { el.append(document.createTextNode(tok)); continue; }
      if (!tok.pieces) {
        if (signs && signs.has(tok.tib)) el.append(h('button', { type: 'button', class: 'tib tib-word tib-sign', onClick: () => showSign(ctx, tok.tib) }, tok.tib));
        else el.append(h('span', { class: 'tib' }, tok.tib));
        continue;
      }
      const run = h('span', { class: 'tib theory-run' });
      for (const piece of tok.pieces) {
        if (piece.ids.length) run.append(h('button', { type: 'button', class: 'tib-word', onClick: () => showPieceWords(ctx, piece.ids) }, piece.t));
        else run.append(document.createTextNode(piece.t));
      }
      el.append(run);
    }
    body.append(el);
  }
  body.append(h('p', { class: 'helper' }, t(part ? 'course.theorySignHint' : 'course.theoryHint')));
  const done = () => {
    store.update((q) => markTheory(q, key));
    if (!toWords) ctx.navigate(`course/${first.id}`);
    else ctx.navigate(part ? `course/${first.id}/intro` : `course/${first.id}/words`);
  };
  body.append(h('div', { class: 'buttons' },
    h('button', { type: 'button', class: 'action primary', id: 'theory-next', onClick: done }, read && !toWords ? t('course.toUnit') : t(part ? 'course.theoryNextSigns' : 'course.theoryNext')),
    part ? h('a', { class: 'action', href: `#/course/${first.id}` }, t('course.toUnit')) : h('a', { class: 'action', href: '#/course' }, t('course.toMap')),
  ));
  root.append(h('section', { class: 'panel' }, body));
  return () => {};
}

function unitHref(unit) {
  return `#/course/${unit.id}`;
}

// ---- the map ----

function renderMap(root, ctx) {
  const { store, data, t } = ctx;
  const course = data.course;

  // one-time dialogs: the welcome for a new learner, the choice for an old one, the script question
  if (needsOnboarding(ctx)) { showOnboarding(ctx, begin); return () => {}; }
  const p0 = store.get();
  if (!p0.course.started && Object.keys(p0.words).length && p0.settings.home === null) { showCourseIntro(ctx, begin); return () => {}; }
  begin();
  return () => {};

  function begin() {
    if (!store.get().course.started) store.update((p) => startCourse(p));
    const q = store.get();
    // the script question, once, for a learner without any words yet: a reader goes to the exam, the others start with the letters
    // (a learner with practice progress sees the alphabet module with its exam button instead)
    if (q.course.canRead === null && !Object.keys(q.words).length && !examPassed(q) && !unitPassed(q, allUnits(course)[0])) { askCanRead(ctx, draw); return; }
    draw();
  }

  function draw() {
    ctx.tashi?.greet();
    const p = store.get();
    const cur = currentUnit(course, p);
    const { passed, total } = courseProgress(course, p);
    const due = dueCount(p, data.words);

    const top = h('div', { class: 'panel-body' });
    if (cur) {
      const step = unitStep(p, cur);
      const theoryFirst = needsTheory(p, cur, data.intro);
      const where = theoryFirst ? t('course.theory') : cur.part ? t(`alphabet.steps.${ALPHA_STEPS[Math.min(step, ALPHA_STEPS.length) - 1]}`) : t(`course.steps.${STEPS[step - 1]}`);
      top.append(
        h('div', { class: 'label' }, t('course.continueLabel')),
        h('h2', { class: 'prompt course-next' }, theoryFirst && !cur.part ? moduleName(ctx, cur.module) : unitName(ctx, cur)),
        h('p', { class: 'helper' }, where),
        h('div', { class: 'buttons' }, h('a', { class: 'action primary', id: 'course-continue', href: theoryFirst ? theoryHref(theoryKey(cur)) : unitHref(cur) }, t('course.continue'))),
      );
    } else {
      top.append(
        h('h2', { class: 'prompt course-next' }, t('course.allDone')),
        h('div', { class: 'buttons' }, h('a', { class: 'action primary', id: 'course-continue', href: '#/course/done' }, t('course.seeResult'))),
      );
    }
    if (due) {
      top.append(h('div', { class: 'cold-note course-due' }, t('course.dueText', { n: due }), h('div', { class: 'buttons' }, h('a', { class: 'action small', id: 'course-review', href: '#/course/review' }, t('course.review', { n: due })))));
    }
    top.append(
      h('div', { class: 'set-progress course-total' },
        h('div', {}, t('course.unitsPassed')),
        h('div', { class: 'counter' }, `${passed}/${total}`),
        h('div', { class: 'meter' }, h('div', { style: `width:${total ? Math.round((100 * passed) / total) : 0}%` })),
      ),
    );

    const list = h('div', { class: 'panel-body course-modules' });
    for (const m of courseModules(course)) {
      const mp = moduleProgress(m, p);
      const open = Boolean(cur && cur.module === m.id);
      const rows = m.units.map((u) => {
        const done = unitPassed(p, u);
        const isCur = cur && cur.id === u.id;
        const step = unitStep(p, u);
        let state = t('course.ahead');
        if (done) state = t('course.passedState');
        else if (isCur) state = t('course.currentState');
        else if (step > 1) state = t('course.stepOf', { n: step, total: u.part ? ALPHA_STEPS.length : STEPS.length });
        const words = u.words ? u.words.slice(0, 3).map((id) => data.words[id] && data.words[id].tib).filter(Boolean).join(' ') : '';
        return h('div', { class: 'unit-row' + (done ? ' passed' : '') + (isCur ? ' current' : ''), dataset: { unit: u.id } },
          h('div', { class: 'unit-main' },
            h('div', { class: 'unit-title' }, u.part ? `${u.part}. ${t(`alphabet.parts.${u.part}`)}` : t('course.part', { n: u.id.split('/')[1], total: m.units.length })),
            words ? h('div', { class: 'unit-words tib' }, words, u.words.length > 3 ? ' …' : '') : null,
            h('div', { class: 'stage-state' + (done ? ' passed' : '') }, state),
          ),
          h('a', { class: 'action small' + (isCur ? ' primary' : ''), href: unitHref(u) }, done ? t('course.open') : isCur ? t('course.continue') : t('course.open')),
        );
      });
      const theoryRow = theoryOf(data.intro, m.id, ctx.lang).length
        ? h('div', { class: 'unit-row theory-row' + (p.course.theory.includes(m.id) ? ' passed' : '') },
          h('div', { class: 'unit-main' }, h('div', { class: 'unit-title' }, t('course.theory')), h('div', { class: 'stage-state' + (p.course.theory.includes(m.id) ? ' passed' : '') }, p.course.theory.includes(m.id) ? t('course.theoryRead') : t('course.theoryUnread'))),
          h('a', { class: 'action small' + (cur && cur.module === m.id && needsTheory(p, cur, data.intro) ? ' primary' : ''), href: theoryHref(m.id) }, p.course.theory.includes(m.id) ? t('course.open') : t('course.theoryOpen')))
        : null;
      const examRow = m.id === ALPHABET_MODULE && mp.passed < mp.total && !examPassed(p)
        ? h('div', { class: 'unit-row exam-row' },
          h('div', { class: 'unit-main' }, h('div', { class: 'unit-title' }, t('alphabet.examTitle')), h('div', { class: 'stage-state' }, t('alphabet.examText'))),
          h('a', { class: 'action small', id: 'course-exam', href: '#/course/alphabet/exam' }, t('alphabet.exam')))
        : null;
      list.append(h('details', { class: 'module' + (mp.passed === mp.total ? ' passed' : ''), open: open || undefined, dataset: { module: m.id } },
        h('summary', {},
          h('span', { class: 'module-name' }, moduleName(ctx, m.id)),
          h('span', { class: 'counter' }, `${mp.passed}/${mp.total}`),
          h('span', { class: 'meter' }, h('span', { style: `width:${mp.total ? Math.round((100 * mp.passed) / mp.total) : 0}%` })),
        ),
        theoryRow,
        examRow,
        ...rows,
      ));
    }

    clearRoot(root);
    root.append(
      h('section', { class: 'panel' }, top),
      h('section', { class: 'panel' }, list),
      h('p', { class: 'helper course-practice' }, t('course.practiceHint'), ' ', h('a', { href: '#/play' }, t('course.practiceLink'))),
    );
  }
}

function clearRoot(root) {
  for (const el of [...root.children]) if (!el.classList.contains('support-line')) el.remove();
}

/** "Now there is a course": the one-time choice for a learner with practice progress. */
function showCourseIntro(ctx, onDone) {
  const { store, t } = ctx;
  let close = null;
  const choose = (home) => {
    store.update((p) => setSetting(home === 'course' ? startCourse(p) : p, 'home', home));
    close();
    if (home === 'course') onDone(); else ctx.navigate('play');
  };
  close = popover(h('div', { class: 'onboarding course-intro' },
    h('h2', {}, t('course.introTitle')),
    h('p', {}, t('course.introText')),
    h('p', { class: 'helper' }, t('course.introNote')),
    h('div', { class: 'buttons' },
      h('button', { type: 'button', class: 'action primary', id: 'course-intro-start', onClick: () => choose('course') }, t('course.introStart')),
      h('button', { type: 'button', class: 'action', id: 'course-intro-play', onClick: () => choose('play') }, t('course.introPlay')),
    ),
  ), { onDismiss: () => choose('course') });
}

/** "Do you read the Tibetan script?": yes leads to the alphabet exam, no to the letters. */
function askCanRead(ctx, onDone) {
  const { store, t } = ctx;
  let close = null;
  const answer = (v) => { store.update((p) => setCanRead(p, v)); close(); if (v) ctx.navigate('course/alphabet/exam'); else onDone(); };
  close = popover(h('div', { class: 'onboarding' },
    h('h2', {}, t('course.canReadTitle')),
    h('p', {}, t('course.canReadText')),
    h('div', { class: 'buttons' },
      h('button', { type: 'button', class: 'action primary', id: 'can-read-yes', onClick: () => answer(true) }, t('alphabet.canReadYes')),
      h('button', { type: 'button', class: 'action', id: 'can-read-no', onClick: () => answer(false) }, t('course.canReadNo')),
    ),
  ), { onDismiss: () => answer(false) });
}

// ---- the alphabet module ----

function renderAlphabet(root, ctx, rest) {
  const { store, data, t } = ctx;
  if (rest[0] === 'exam') {
    return renderDrill(root, ctx, { kind: 'exam', part: null, title: t('alphabet.examTitle'), intro: t('alphabet.examText'), back: '#/course', backLabel: t('course.toMap'), next: { href: '#/course', label: t('course.toMap') } });
  }
  const part = PARTS.find((p) => String(p.n) === rest[0]);
  if (!part) { ctx.navigate('course'); return () => {}; }
  const unit = findUnit(data.course, partId(part.n));
  const step = rest[1];
  if (!step) return renderAlphabetUnit(root, ctx, unit, part);
  if (step === 'theory') return renderTheory(root, ctx, unit.id);
  const p = store.get();
  const cur = unitStep(p, unit);
  const passed = unitPassed(p, unit);
  const next = nextUnit(data.course, unit);
  const title = `${unitName(ctx, unit)} · ${t(`alphabet.steps.${step}`)}`;
  if (step === 'intro') return part.kind === 'sentences' ? renderFirstSentences(root, ctx, unit, part) : renderAlphabetIntro(root, ctx, unit, part);
  if (part.kind === 'sentences') {
    const sentences = firstSentences(ctx);
    if (step === 'train') return renderPlay(root, ctx, { kind: 'step', unit, step: 'meaning', stepNo: 2, sentences, stepLabel: t('alphabet.steps.train'), back: `#/course/${unit.id}` });
    if (step === 'check') return renderPlay(root, ctx, { kind: 'check', unit, stepNo: 3, tasks: sentences.map((s) => ({ sentence: s, exercise: 'tiles' })), pass: FIRST_SENTENCES_PASS, wordIds: [], stepLabel: t('alphabet.steps.check'), back: `#/course/${unit.id}` });
  }
  if (step === 'train') {
    return renderDrill(root, ctx, { kind: 'train', part, title, back: `#/course/${unit.id}`, backLabel: t('course.toUnit'), next: { href: `#/course/${unit.id}/check`, label: t('alphabet.trainNext') } });
  }
  if (step === 'check') {
    if (cur < ALPHA_STEPS.length && !passed) { ctx.navigate(`course/${unit.id}`); return () => {}; }
    return renderDrill(root, ctx, { kind: 'check', part, title, back: `#/course/${unit.id}`, backLabel: t('course.toUnit'), next: next ? { href: unitHref(next), label: t('course.nextUnit') } : null });
  }
  ctx.navigate(`course/${unit.id}`);
  return () => {};
}

/** The first sentences of the first set, for the last part of the alphabet. */
function firstSentences(ctx) {
  const first = ctx.data.sets[0];
  return ctx.data.sentences.filter((s) => s.set === first.id).slice(0, FIRST_SENTENCES);
}

function soundText(entry, lang) {
  return (entry.sound && (entry.sound[lang] || entry.sound.en)) || '';
}

function renderAlphabetUnit(root, ctx, unit, part) {
  const { store, data, t } = ctx;
  store.update((p) => setCurrentUnit(p, unit.id));
  const p = store.get();
  const step = unitStep(p, unit);
  const rec = p.course.units[unit.id];
  const passed = unitPassed(p, unit);
  const next = nextUnit(data.course, unit);
  const signs = part.kind === 'sentences' ? [] : partNewItems(part, data.alphabet, data.words, data.sets);
  const preview = h('div', { class: 'unit-wordline' }, ...signs.slice(0, 16).map((x) => h('span', { class: 'tib' }, x.tib)), signs.length > 16 ? h('span', {}, '…') : null);
  const checkTotal = part.kind === 'sentences' ? FIRST_SENTENCES : ALPHA_CHECK_SIZE;

  const ladder = h('div', { class: 'ladder' });
  const theoryRow = theoryLadderRow(ctx, p, unit);
  if (theoryRow) ladder.append(theoryRow);
  const theoryFirst = Boolean(theoryRow && theoryRow.classList.contains('current'));
  ALPHA_STEPS.forEach((name, i) => {
    const n = i + 1;
    const isDone = passed || n < step;
    const isCur = !passed && n === step && !(n === 1 && theoryFirst);
    const href = `#/course/${unit.id}/${name}`;
    let action = null;
    if (name === 'intro') action = h('a', { class: 'action small' + (isCur ? ' primary' : ''), href }, isCur ? t('course.start') : t('course.open'));
    else if (name === 'train') { if (step >= 2 || passed) action = h('a', { class: 'action small' + (isCur ? ' primary' : ''), href }, isCur ? t('course.start') : t('course.repeatStep')); }
    else if (step >= 3 || passed) action = h('a', { class: 'action small' + (isCur ? ' primary' : ''), href }, passed ? t('course.checkAgain') : t('course.startCheck'));
    let state = t('course.ahead');
    if (isDone) state = t('course.passedState');
    else if (isCur) state = t('course.currentState');
    ladder.append(h('div', { class: 'ladder-row' + (isDone ? ' done' : '') + (isCur ? ' current' : ''), dataset: { step: name } },
      h('span', { class: 'ladder-num' }, isDone ? '✓' : String(n)),
      h('div', { class: 'ladder-main' }, h('div', { class: 'ladder-title' }, t(`alphabet.steps.${name}`)), h('div', { class: 'stage-state' + (isDone ? ' passed' : '') }, state)),
      action,
    ));
  });

  root.append(h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
    h('div', { class: 'label' }, t('alphabet.title')),
    h('h2', { class: 'prompt' }, `${part.n}. ${t(`alphabet.parts.${part.n}`)}`),
    h('p', { class: 'helper' }, t('course.part', { n: part.n, total: PARTS.length })),
    preview,
    passed ? h('p', { class: 'feedback good unit-passed' }, examPassed(p) && !(rec && rec.step >= PASSED) ? t('alphabet.passedByExam') : t('course.unitPassed', { best: rec ? rec.best : 0, total: checkTotal })) : null,
    ladder,
    h('div', { class: 'buttons' },
      passed && next ? h('a', { class: 'action next', href: unitHref(next) }, t('course.nextUnit')) : null,
      h('a', { class: 'action', href: '#/course' }, t('course.toMap')),
    ),
  )));
  return () => {};
}

/** Step 1 of an alphabet part: the introduction and a card for every new sign. */
function renderAlphabetIntro(root, ctx, unit, part) {
  const { store, data, t } = ctx;
  const dict = data.words;
  const intro = (data.alphabet.intros || {})[String(part.n)] || {};
  const text = intro[ctx.lang] || intro.en || '';
  const cards = h('div', { class: 'word-cards sign-cards' });
  const entries = partSigns(part, data.alphabet);
  if (entries.length) {
    for (const e of entries) {
      const examples = (e.examples || []).map((id) => dict[id]).filter(Boolean);
      cards.append(h('div', { class: 'word-card sign-card', dataset: { sign: e.tib } },
        h('div', { class: 'word-card-head' },
          h('span', { class: 'tib big' }, e.tib),
          signAudio(ctx, e.tib),
          h('span', { class: 'sign-name' }, e.name),
          e.tone ? h('span', { class: 'tone-badge ' + e.tone.toLowerCase() }, t(`alphabet.tone${e.tone}`)) : null,
        ),
        h('div', { class: 'wylie' }, t('alphabet.wylieLabel'), ': ', e.wylie),
        h('div', { class: 'tr' }, soundText(e, ctx.lang)),
        examples.length ? h('div', { class: 'sign-examples' }, ...examples.map((w) => h('div', { class: 'example' }, h('span', { class: 'tib' }, w.tib), h('span', { class: 'tr' }, `${w.wylie} · ${pickTr(w.tr, ctx.lang).text}`)))) : null,
      ));
    }
  } else {
    // syllables and words: a handful of worked examples
    const items = partNewItems(part, data.alphabet, dict, data.sets).slice(0, 6);
    const byTib = new Map(Object.values(dict).filter((w) => !w.service).map((w) => [w.tib, w]));
    for (const x of items) {
      const w = byTib.get(x.tib) || byTib.get(x.tib + '་');
      cards.append(h('div', { class: 'word-card sign-card' },
        h('div', { class: 'word-card-head' }, h('span', { class: 'tib big' }, x.tib), signAudio(ctx, x.tib)),
        h('div', { class: 'wylie' }, t('alphabet.wylieLabel'), ': ', x.wylie),
        w ? h('div', { class: 'tr' }, pickTr(w.tr, ctx.lang).text) : null,
      ));
    }
  }
  const step = unitStep(store.get(), unit);
  const go = () => {
    store.update((q) => (unitStep(q, unit) === 1 ? setUnitStep(q, unit.id, 2) : q));
    ctx.navigate(step === 1 ? `course/${unit.id}/train` : `course/${unit.id}`);
  };
  root.append(h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
    h('div', { class: 'label' }, unitName(ctx, unit)),
    h('h2', { class: 'prompt' }, `${part.n}. ${t(`alphabet.parts.${part.n}`)}`),
    h('p', { class: 'helper read-text' }, tibText(text)),
    cards,
    h('div', { class: 'buttons' },
      h('button', { type: 'button', class: 'action primary', id: 'words-next', onClick: go }, step === 1 ? t('alphabet.introNext') : t('course.toUnit')),
      h('a', { class: 'action', href: `#/course/${unit.id}` }, t('course.toUnit')),
    ),
  )));
  return () => {};
}

/** Step 1 of the last part: the first sentences of lesson 1 with Wylie and translation. */
function renderFirstSentences(root, ctx, unit, part) {
  const { store, data, t } = ctx;
  const dict = data.words;
  const intro = (data.alphabet.intros || {})[String(part.n)] || {};
  const text = intro[ctx.lang] || intro.en || '';
  const list = h('div', { class: 'word-cards sign-cards' });
  for (const s of firstSentences(ctx)) {
    const tib = renderTib(s.words, dict);
    list.append(h('div', { class: 'word-card sign-card' },
      h('div', { class: 'word-card-head' }, h('span', { class: 'tib big' }, tib), audioButton(ctx, s.id, { small: true })),
      h('div', { class: 'wylie' }, toWylie(tib)),
      h('div', { class: 'tr' }, pickTr(s.tr, ctx.lang).text),
    ));
  }
  const step = unitStep(store.get(), unit);
  const go = () => {
    store.update((q) => (unitStep(q, unit) === 1 ? setUnitStep(q, unit.id, 2) : q));
    ctx.navigate(step === 1 ? `course/${unit.id}/train` : `course/${unit.id}`);
  };
  root.append(h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
    h('div', { class: 'label' }, unitName(ctx, unit)),
    h('h2', { class: 'prompt' }, `${part.n}. ${t(`alphabet.parts.${part.n}`)}`),
    h('p', { class: 'helper read-text' }, tibText(text)),
    list,
    h('div', { class: 'buttons' },
      h('button', { type: 'button', class: 'action primary', id: 'words-next', onClick: go }, step === 1 ? t('alphabet.introNext') : t('course.toUnit')),
      h('a', { class: 'action', href: `#/course/${unit.id}` }, t('course.toUnit')),
    ),
  )));
  return () => {};
}

// ---- a unit ----

function renderUnit(root, ctx, unit) {
  const { store, data, t } = ctx;
  store.update((p) => setCurrentUnit(p, unit.id));
  const p = store.get();
  const step = unitStep(p, unit);
  const rec = p.course.units[unit.id];
  const passed = step >= PASSED;
  const allKnown = unitAllKnown(p, unit);
  const next = nextUnit(data.course, unit);
  const canCheck = step === STEPS.length || passed || allKnown;

  const words = unit.words.map((id) => data.words[id]).filter(Boolean);
  const wordLine = h('div', { class: 'unit-wordline' }, ...words.map((w) => h('span', { class: 'tib' }, w.tib)));

  const ladder = h('div', { class: 'ladder' });
  const theoryRow = theoryLadderRow(ctx, p, unit);
  if (theoryRow) ladder.append(theoryRow);
  const theoryFirst = Boolean(theoryRow && theoryRow.classList.contains('current'));
  STEPS.forEach((name, i) => {
    const n = i + 1;
    const isDone = passed || n < step;
    const isCur = !passed && n === step && !(n === 1 && theoryFirst);
    const href = `#/course/${unit.id}/${name}`;
    let action = null;
    if (name === 'check') {
      if (canCheck) action = h('a', { class: 'action small' + (isCur || allKnown && !passed ? ' primary' : ''), href }, passed ? t('course.checkAgain') : t('course.startCheck'));
    } else if (isCur) {
      action = h('a', { class: 'action small primary', href }, rec && rec.done && rec.done.length ? t('course.continue') : t('course.start'));
    } else if (isDone) {
      action = h('a', { class: 'action small', href: name === 'words' ? href : `${href}/again` }, t('course.repeatStep'));
    }
    let state = t('course.ahead');
    if (isDone) state = t('course.passedState');
    else if (isCur && rec && rec.done && rec.done.length && name !== 'words') state = t('course.solvedOf', { n: rec.done.length, total: unit.sentences.length });
    else if (isCur) state = t('course.currentState');
    ladder.append(h('div', { class: 'ladder-row' + (isDone ? ' done' : '') + (isCur ? ' current' : ''), dataset: { step: name } },
      h('span', { class: 'ladder-num' }, isDone ? '✓' : String(n)),
      h('div', { class: 'ladder-main' }, h('div', { class: 'ladder-title' }, t(`course.steps.${name}`)), h('div', { class: 'stage-state' + (isDone ? ' passed' : '') }, state)),
      action,
    ));
  });

  const body = h('div', { class: 'panel-body' },
    h('div', { class: 'label' }, moduleName(ctx, unit.module)),
    h('h2', { class: 'prompt' }, unitName(ctx, unit)),
    h('p', { class: 'helper' }, t('course.unitSummary', { words: unit.words.length, sentences: unit.sentences.length })),
    wordLine,
    passed ? h('p', { class: 'feedback good unit-passed' }, t('course.unitPassed', { best: rec ? rec.best : 0, total: Math.min(CHECK_SIZE, unit.sentences.length) })) : null,
    !passed && allKnown ? h('div', { class: 'cold-note' }, t('course.allKnown')) : null,
    ladder,
    h('div', { class: 'buttons' },
      passed && next ? h('a', { class: 'action next', href: unitHref(next) }, t('course.nextUnit')) : null,
      h('a', { class: 'action', href: '#/course' }, t('course.toMap')),
    ),
  );
  root.append(h('section', { class: 'panel' }, body));
  return () => {};
}

// ---- step 1: the words ----

function renderWords(root, ctx, unit) {
  const { store, data, t } = ctx;
  const dict = data.words;
  const byId = new Map(data.sentences.map((s) => [s.id, s]));
  const sentences = unit.sentences.map((id) => byId.get(id)).filter(Boolean);

  // the lesson's remarks on these sentences, each once
  const notes = [];
  const seenNote = new Set();
  for (const s of sentences) {
    if (!s.note || !s.note.en || seenNote.has(s.note.en)) continue;
    seenNote.add(s.note.en);
    notes.push({ note: s.note, example: s });
  }

  const intro = notes.length ? h('div', { class: 'unit-notes' },
    h('div', { class: 'label' }, t('course.notesLabel')),
    ...notes.map((e) => h('div', { class: 'note-row' },
      h('p', { class: 'note-text' }, tibText(pickTr(e.note, ctx.lang).text)),
      h('div', { class: 'example' }, h('span', { class: 'tib' }, renderTib(e.example.words, dict)), h('span', { class: 'tr' }, pickTr(e.example.tr, ctx.lang).text)),
    )),
  ) : null;

  const p = store.get();
  const cards = h('div', { class: 'word-cards' });
  for (const id of unit.words) {
    const w = dict[id];
    if (!w) continue;
    const example = sentences.find((s) => contentWords(s, dict).includes(id));
    const st = wordStatus(p, id);
    cards.append(h('div', { class: 'word-card', dataset: { word: id } },
      h('div', { class: 'word-card-head' },
        h('span', { class: 'tib big' }, w.tib),
        audioButton(ctx, `w-${id}`, { small: true }),
        h('span', { class: `status-dot ${st}`, title: t(`status.${st}`) }),
      ),
      h('div', { class: 'wylie' }, w.wylie, ' · ', w.pos),
      h('div', { class: 'tr' }, pickTr(w.tr, ctx.lang).text),
      example ? h('div', { class: 'example' }, h('span', { class: 'tib' }, renderTib(example.words, dict)), h('span', { class: 'tr' }, pickTr(example.tr, ctx.lang).text)) : null,
    ));
  }

  const step = unitStep(p, unit);
  const go = () => {
    store.update((q) => {
      let r = seeUnitWords(q, unit.words);
      if (unitStep(r, unit) === 1) r = setUnitStep(r, unit.id, 2);
      return r;
    });
    ctx.navigate(step === 1 ? `course/${unit.id}/tiles` : `course/${unit.id}`);
  };

  root.append(h('section', { class: 'panel' }, h('div', { class: 'panel-body' },
    h('div', { class: 'label' }, unitName(ctx, unit)),
    h('h2', { class: 'prompt' }, t('course.steps.words')),
    h('p', { class: 'helper' }, t('course.wordsIntro', { n: unit.words.length })),
    intro,
    cards,
    h('div', { class: 'buttons' },
      h('button', { type: 'button', class: 'action primary', id: 'words-next', onClick: go }, step === 1 ? t('course.wordsNext') : t('course.toUnit')),
      h('a', { class: 'action', href: `#/course/${unit.id}` }, t('course.toUnit')),
    ),
  )));
  return () => {};
}

// ---- the end of the course ----

function renderDone(root, ctx) {
  const { store, data, t } = ctx;
  const p = store.get();
  const { passed, total } = courseProgress(data.course, p);
  if (passed < total) { ctx.navigate('course'); return () => {}; }
  const known = Object.keys(data.words).filter((id) => !data.words[id].service && wordStatus(p, id) === STATUS.KNOWN).length;
  const solved = Object.values(p.sentences).reduce((n, s) => n + (s.solved || 0), 0);
  const days = new Set(Object.values(p.course.units).map((u) => u.passedAt && u.passedAt.slice(0, 10)).filter(Boolean)).size;
  const due = dueCount(p, data.words);
  root.append(h('section', { class: 'panel' }, h('div', { class: 'panel-body course-done' },
    h('h2', { class: 'prompt' }, t('course.doneTitle')),
    h('p', { class: 'big-tib' }, 'ལེགས་སོ། ཐུགས་རྗེ་ཆེ།'),
    h('p', {}, t('course.doneText')),
    h('div', { class: 'stat-grid' },
      h('div', { class: 'stat' }, h('div', { class: 'num' }, String(known)), h('div', { class: 'cap' }, t('stats.known'))),
      h('div', { class: 'stat' }, h('div', { class: 'num' }, String(solved)), h('div', { class: 'cap' }, t('stats.solved'))),
      h('div', { class: 'stat' }, h('div', { class: 'num' }, String(days)), h('div', { class: 'cap' }, t('course.doneDays'))),
      h('div', { class: 'stat' }, h('div', { class: 'num' }, String(effectiveStreak(p.streak, localDay()))), h('div', { class: 'cap' }, t('stats.streak'))),
    ),
    h('p', { class: 'helper', style: 'margin-top:12px' }, due ? t('course.dueText', { n: due }) : t('course.doneNoDue')),
    h('div', { class: 'buttons' },
      due ? h('a', { class: 'action primary', href: '#/course/review' }, t('course.review', { n: due })) : null,
      h('a', { class: 'action', href: '#/play' }, t('course.practiceLink')),
      h('a', { class: 'action', href: '#/course' }, t('course.toMap')),
    ),
  )));
  return () => {};
}

/** Where the course would send the learner next; used by the play screen after a step. */
export function unitRoute(unit) { return `course/${unit.id}`; }

/** Hook for the stats screen: units passed over all. */
export { courseProgress, allUnits };

export function toastStepDone(ctx) { toast(ctx.t('course.stepDone')); }
