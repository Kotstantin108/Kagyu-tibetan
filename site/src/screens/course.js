// The course: #/course is the map (continue, review, modules and units),
// #/course/<module>/<n> a unit with its ladder of steps, #/course/<module>/<n>/words
// the first step; the other steps and the review run on the play screen in
// course mode. #/course/done is the end of the course.

import { h, popover, tibText, audioButton, toast } from '../ui.js';
import { pickTr } from '../i18n/index.js';
import { renderPlay } from './play.js';
import { needsOnboarding, showOnboarding } from './onboarding.js';
import { courseModules, allUnits, findUnit, unitStep, unitPassed, unitAllKnown, courseProgress, moduleProgress, currentUnit, nextUnit, dueCount, STEPS, PASSED, READING_MODULE, CHECK_SIZE } from '../engine/course.js';
import { startCourse, setCanRead, setCurrentUnit, seeUnitWords, setUnitStep, setSetting, wordStatus, STATUS } from '../engine/progress.js';
import { stagePassed } from '../engine/letters.js';
import { contentWords } from '../engine/next.js';
import { effectiveStreak, localDay } from '../engine/streak.js';
import { renderTib } from '../engine/tib.js';

export function renderCourse(root, ctx) {
  const parts = (ctx.param || '').split('/').filter(Boolean);
  if (!parts.length) return renderMap(root, ctx);
  if (parts[0] === 'review') return renderPlay(root, ctx, { kind: 'review' });
  if (parts[0] === 'done') return renderDone(root, ctx);
  const unit = findUnit(ctx.data.course, `${parts[0]}/${parts[1] || ''}`);
  if (!unit || unit.stage) { ctx.navigate('course'); return () => {}; }
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
  if (moduleId === READING_MODULE) return ctx.t('course.reading');
  const set = ctx.data.sets.find((s) => s.id === moduleId);
  return set ? pickTr(set.name, ctx.lang).text : moduleId;
}

/** "Lesson 2 · part 3" (or the stage title for a reading unit). */
export function unitName(ctx, unit) {
  if (unit.stage) return ctx.t(`read.stages.${unit.stage}.title`);
  const module = courseModules(ctx.data.course).find((m) => m.id === unit.module);
  const n = unit.id.split('/')[1];
  return `${shortModuleName(ctx, unit.module)} · ${ctx.t('course.part', { n, total: module ? module.units.length : n })}`;
}

/** The set name up to the first period: "Lesson 2" of "Lesson 2. Verbs". */
function shortModuleName(ctx, moduleId) {
  return moduleName(ctx, moduleId).split(/\.\s/)[0];
}

function unitHref(unit) {
  return unit.stage ? `#/read/${unit.stage}/course` : `#/course/${unit.id}`;
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
    if (store.get().course.canRead === null) {
      const q = store.get();
      const reads = Object.values(q.words).some((w) => w.status === STATUS.KNOWN) || Object.keys(q.reading).some((id) => stagePassed(q, id));
      if (reads) store.update((p) => setCanRead(p, true));
      else { askCanRead(ctx, draw); return; }
    }
    draw();
  }

  function draw() {
    const p = store.get();
    const cur = currentUnit(course, p);
    const { passed, total } = courseProgress(course, p);
    const due = dueCount(p, data.words);

    const top = h('div', { class: 'panel-body' });
    if (cur) {
      const step = unitStep(p, cur);
      const where = cur.stage ? t('course.readingStage') : t(`course.steps.${STEPS[step - 1]}`);
      top.append(
        h('div', { class: 'label' }, t('course.continueLabel')),
        h('h2', { class: 'prompt course-next' }, unitName(ctx, cur)),
        h('p', { class: 'helper' }, where),
        h('div', { class: 'buttons' }, h('a', { class: 'action primary', id: 'course-continue', href: unitHref(cur) }, t('course.continue'))),
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
        else if (!u.stage && step > 1) state = t('course.stepOf', { n: step, total: STEPS.length });
        const words = u.words ? u.words.slice(0, 3).map((id) => data.words[id] && data.words[id].tib).filter(Boolean).join(' ') : '';
        return h('div', { class: 'unit-row' + (done ? ' passed' : '') + (isCur ? ' current' : ''), dataset: { unit: u.id } },
          h('div', { class: 'unit-main' },
            h('div', { class: 'unit-title' }, u.stage ? t(`read.stages.${u.stage}.title`) : t('course.part', { n: u.id.split('/')[1], total: m.units.length })),
            words ? h('div', { class: 'unit-words tib' }, words, u.words.length > 3 ? ' …' : '') : null,
            h('div', { class: 'stage-state' + (done ? ' passed' : '') }, state),
          ),
          h('a', { class: 'action small' + (isCur ? ' primary' : ''), href: unitHref(u) }, done ? t('course.open') : isCur ? t('course.continue') : t('course.open')),
        );
      });
      list.append(h('details', { class: 'module' + (mp.passed === mp.total ? ' passed' : ''), open: open || undefined, dataset: { module: m.id } },
        h('summary', {},
          h('span', { class: 'module-name' }, moduleName(ctx, m.id)),
          h('span', { class: 'counter' }, `${mp.passed}/${mp.total}`),
          h('span', { class: 'meter' }, h('span', { style: `width:${mp.total ? Math.round((100 * mp.passed) / mp.total) : 0}%` })),
        ),
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

/** "Do you read the Tibetan script?" */
function askCanRead(ctx, onDone) {
  const { store, t } = ctx;
  let close = null;
  const answer = (v) => { store.update((p) => setCanRead(p, v)); close(); onDone(); };
  close = popover(h('div', { class: 'onboarding' },
    h('h2', {}, t('course.canReadTitle')),
    h('p', {}, t('course.canReadText')),
    h('div', { class: 'buttons' },
      h('button', { type: 'button', class: 'action primary', id: 'can-read-yes', onClick: () => answer(true) }, t('common.yes')),
      h('button', { type: 'button', class: 'action', id: 'can-read-no', onClick: () => answer(false) }, t('course.canReadNo')),
    ),
  ), { onDismiss: () => answer(false) });
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
  STEPS.forEach((name, i) => {
    const n = i + 1;
    const isDone = passed || n < step;
    const isCur = !passed && n === step;
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
    if (notes.length >= 4) break;
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
