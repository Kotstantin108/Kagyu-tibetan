// Reading course: the script before the sentences. #/read lists the stages,
// #/read/<stage> runs a round of cards (a syllable, four Wylie spellings).

import { h, clear, popoverOpen, tibText } from '../ui.js';
import { STAGE_IDS, ROUND_SIZE, PASS_SCORE, stageItems, makeRound, stagePassed } from '../engine/letters.js';
import { recordReadingRound } from '../engine/progress.js';

export function renderRead(root, ctx) {
  const { store, data, t } = ctx;
  const [stageParam, from] = (ctx.param || '').split('/');
  const stageId = STAGE_IDS.includes(stageParam) ? stageParam : null;
  if (!stageId) return renderList(root, ctx);
  const fromCourse = from === 'course';

  const items = stageItems(stageId, data.words, data.sets);
  const total = Math.min(ROUND_SIZE, items.length);
  let round = [];
  let index = 0;
  let score = 0;
  let answered = null; // the chosen option of the current card, null while open
  let finished = false;
  let timer = null;

  const counter = h('span', { class: 'counter' });
  const card = h('div', { class: 'read-card tib', 'aria-live': 'polite' });
  const promptEl = h('p', { class: 'helper' }, t('read.prompt'));
  const optionsEl = h('div', { class: 'options read-options', role: 'group' });
  const feedbackEl = h('p', { class: 'feedback', role: 'status' });
  const btnNext = h('button', { type: 'button', class: 'action next', id: 'read-next', hidden: true, onClick: next }, t('read.next'));
  const btnAgain = h('button', { type: 'button', class: 'action primary', id: 'read-again', hidden: true, onClick: () => deal() }, t('read.again'));
  const nextStage = STAGE_IDS[STAGE_IDS.indexOf(stageId) + 1];
  const btnNextStage = nextStage ? h('a', { class: 'action', href: `#/read/${nextStage}${fromCourse ? '/course' : ''}`, hidden: true }, t('read.nextStage')) : null;
  const btnBack = h('a', { class: 'action', href: fromCourse ? '#/course' : '#/read' }, fromCourse ? t('course.toMap') : t('read.back'));
  const result = h('div', { class: 'read-result', hidden: true });

  root.append(h('section', { class: 'panel' },
    h('div', { class: 'topbar' }, h('h2', { class: 'read-title' }, t(`read.stages.${stageId}.title`)), counter),
    h('div', { class: 'panel-body' },
      h('p', { class: 'helper read-text' }, tibText(t(`read.stages.${stageId}.text`))),
      card, promptEl, optionsEl, feedbackEl, result,
      h('div', { class: 'buttons' }, btnNext, btnAgain, btnNextStage, btnBack),
    ),
  ));

  function deal() {
    clearTimeout(timer);
    round = makeRound(items, ROUND_SIZE);
    index = 0;
    score = 0;
    answered = null;
    finished = false;
    feedbackEl.textContent = '';
    feedbackEl.className = 'feedback';
    render();
  }

  function choose(opt) {
    if (answered || finished) return;
    answered = opt;
    if (opt.right) {
      score++;
      feedbackEl.textContent = t('read.right');
      feedbackEl.className = 'feedback good';
      timer = setTimeout(next, 650);
    } else {
      feedbackEl.textContent = t('read.wrongIs', { wylie: round[index].wylie });
      feedbackEl.className = 'feedback bad';
    }
    render();
  }

  function next() {
    clearTimeout(timer);
    if (finished || !answered) return;
    answered = null;
    feedbackEl.textContent = '';
    feedbackEl.className = 'feedback';
    index++;
    if (index >= round.length) {
      finished = true;
      store.update((p) => recordReadingRound(p, stageId, score));
    }
    render();
  }

  function render() {
    const cur = round[index];
    counter.textContent = finished ? '' : t('read.card', { n: index + 1, total: round.length });
    card.hidden = finished;
    promptEl.hidden = finished;
    optionsEl.hidden = finished;
    feedbackEl.hidden = finished || !feedbackEl.textContent;
    result.hidden = !finished;
    btnNext.hidden = finished || !answered || answered.right;
    btnAgain.hidden = !finished;
    if (btnNextStage) btnNextStage.hidden = !finished;
    if (finished) {
      const passed = score >= PASS_SCORE || score === round.length;
      clear(result).append(
        h('p', { class: 'feedback ' + (passed ? 'good' : '') }, t('read.result', { score, total: round.length }), passed ? ' ' + t('read.passed') + '.' : ''),
      );
      btnAgain.focus();
      return;
    }
    card.textContent = cur.tib;
    card.classList.toggle('long', cur.tib.length > 7);
    clear(optionsEl);
    cur.options.forEach((opt, i) => {
      const cls = 'option' + (answered && opt.right ? ' right' : '') + (answered === opt && !opt.right ? ' wrong' : '');
      optionsEl.append(h('button', { type: 'button', class: cls, disabled: Boolean(answered), onClick: () => choose(opt) },
        h('span', { class: 'option-num' }, String(i + 1)), h('span', { class: 'option-wylie' }, opt.wylie)));
    });
    if (answered && !answered.right) btnNext.focus();
  }

  function onKey(e) {
    if (popoverOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^[1-4]$/.test(e.key) && !answered && !finished) {
      const opt = round[index] && round[index].options[Number(e.key) - 1];
      if (opt) { choose(opt); e.preventDefault(); }
    } else if (e.key === 'Enter') {
      if (finished) { deal(); e.preventDefault(); } else if (answered && !answered.right) { next(); e.preventDefault(); }
    }
  }
  document.addEventListener('keydown', onKey);
  deal();
  return () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); };
}

function renderList(root, ctx) {
  const { store, data, t } = ctx;
  const p = store.get();
  const body = h('div', { class: 'panel-body' },
    h('p', { class: 'helper read-intro' }, t('read.intro')),
    h('p', { class: 'fine' }, t('read.wylieNote')),
  );
  for (const id of STAGE_IDS) {
    const items = stageItems(id, data.words, data.sets);
    const rec = p.reading[id];
    const passed = stagePassed(p, id);
    const state = rec ? t('read.best', { score: rec.best, total: Math.min(ROUND_SIZE, items.length) }) + (passed ? ' · ' + t('read.passed') : '') : t('read.notYet');
    const table = items.length > 60 ? null : h('details', {},
      h('summary', {}, t('read.table')),
      h('div', { class: 'wylie-table' }, ...items.map((x) => h('span', { class: 'cell' }, h('span', { class: 'tib' }, x.tib), h('span', {}, x.wylie)))),
    );
    body.append(h('div', { class: 'stage' + (passed ? ' passed' : ''), dataset: { stage: id } },
      h('h3', {}, t(`read.stages.${id}.title`)),
      h('p', { class: 'helper read-text' }, tibText(t(`read.stages.${id}.text`))),
      h('div', { class: 'stage-row' },
        h('span', { class: 'stage-state' + (passed ? ' passed' : '') }, state),
        h('a', { class: 'action primary small', href: `#/read/${id}` }, t('read.practise')),
      ),
      table,
    ));
  }
  root.append(h('section', { class: 'panel' }, body));
  return () => {};
}
