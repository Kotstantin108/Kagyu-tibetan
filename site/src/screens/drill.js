// A round of sign cards (a sign, four spellings; or a spelling, four signs).
// Runs the training and the check of an alphabet part, the alphabet exam, and
// the free trainer of the Reading section.
//   renderDrill(root, ctx, { kind: 'train'|'check'|'exam'|'free', part, unit, back, next })
//     back: href of the "back" link; next: { href, label } shown after a passed round

import { h, clear, popoverOpen, toast } from '../ui.js';
import { makeDrill, drillPass, partId, TRAIN_PASS, ALPHA_STEPS } from '../engine/alphabet.js';
import { recordReadingRound, setUnitStep, recordCheck, recordAlphabetExam } from '../engine/progress.js';
import { PASSED } from '../engine/course.js';

export function renderDrill(root, ctx, opts) {
  const { store, data, t } = ctx;
  const { kind, part } = opts;
  const unitId = part ? partId(part.n) : null;
  let cards = [];
  let index = 0;
  let score = 0;
  let answered = null;
  let finished = false;
  let timer = null;

  const counter = h('span', { class: 'counter' });
  const card = h('div', { class: 'read-card tib', 'aria-live': 'polite' });
  const promptEl = h('p', { class: 'helper' });
  const optionsEl = h('div', { class: 'options read-options', role: 'group' });
  const feedbackEl = h('p', { class: 'feedback', role: 'status' });
  const btnNext = h('button', { type: 'button', class: 'action next', id: 'read-next', hidden: true, onClick: next }, t('read.next'));
  const btnAgain = h('button', { type: 'button', class: 'action primary', id: 'read-again', hidden: true, onClick: () => deal() }, t('read.again'));
  const btnOn = opts.next ? h('a', { class: 'action next', id: 'drill-on', href: opts.next.href, hidden: true }, opts.next.label) : null;
  const btnBack = h('a', { class: 'action', href: opts.back }, opts.backLabel || t('read.back'));
  const result = h('div', { class: 'read-result', hidden: true });
  const title = opts.title || '';

  root.append(h('section', { class: 'panel' },
    h('div', { class: 'topbar' }, h('h2', { class: 'read-title' }, title), counter),
    h('div', { class: 'panel-body' },
      opts.intro ? h('p', { class: 'helper read-text' }, opts.intro) : null,
      card, promptEl, optionsEl, feedbackEl, result,
      h('div', { class: 'buttons' }, btnNext, btnAgain, btnOn, btnBack),
    ),
  ));

  function deal() {
    clearTimeout(timer);
    cards = makeDrill(kind, part, data.alphabet, data.words, data.sets);
    index = 0;
    score = 0;
    answered = null;
    finished = false;
    feedbackEl.textContent = '';
    feedbackEl.className = 'feedback';
    if (btnOn) btnOn.hidden = true;
    render();
  }

  function choose(opt) {
    if (answered || finished) return;
    answered = opt;
    if (opt.right) {
      score++;
      ctx.tashi?.say('correct');
      feedbackEl.textContent = t('read.right');
      feedbackEl.className = 'feedback good';
      timer = setTimeout(next, 650);
    } else {
      const cur = cards[index];
      feedbackEl.textContent = cur.reverse ? t('alphabet.wrongSign', { tib: cur.tib }) : t('read.wrongIs', { wylie: cur.wylie });
      feedbackEl.className = 'feedback bad';
      ctx.tashi?.say('wrong');
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
    if (index >= cards.length) finish();
    render();
  }

  function finish() {
    finished = true;
    const pass = drillPass(kind);
    const passed = score >= pass || score === cards.length;
    if (passed) ctx.tashi?.say('stepDone'); else if (kind === 'check' || kind === 'exam') ctx.tashi?.say('checkFailed');
    store.update((p) => {
      let q = p;
      if (kind === 'free' || kind === 'train') q = recordReadingRound(q, unitId, score);
      if (kind === 'train' && passed) {
        const r = q.course.units[unitId];
        if ((r ? r.step : 1) <= 2) q = setUnitStep(q, unitId, 3);
      }
      if (kind === 'check') q = recordCheck(q, unitId, { score, pass, wordIds: [] });
      if (kind === 'exam') q = recordAlphabetExam(q, score, pass);
      return q;
    });
    const msg = kind === 'exam'
      ? (passed ? t('alphabet.examPassed') : t('alphabet.examFailed', { score, total: cards.length, pass }))
      : t('read.result', { score, total: cards.length }) + ' ' + (passed
        ? (kind === 'check' ? t('alphabet.checkPassedPart') : kind === 'train' ? t('alphabet.trainPassed') : t('read.passed') + '.')
        : (kind === 'free' ? '' : t('alphabet.trainMore', { pass })));
    clear(result).append(h('p', { class: 'feedback ' + (passed ? 'good' : 'bad') }, msg));
    if (btnOn) btnOn.hidden = !passed;
    if (passed && kind !== 'free') toast(kind === 'exam' ? t('alphabet.examPassedShort') : t('course.stepDone'));
  }

  function render() {
    const cur = cards[index];
    counter.textContent = finished ? '' : t('read.card', { n: index + 1, total: cards.length });
    card.hidden = finished;
    promptEl.hidden = finished;
    optionsEl.hidden = finished;
    feedbackEl.hidden = finished || !feedbackEl.textContent;
    result.hidden = !finished;
    btnNext.hidden = finished || !answered || answered.right;
    btnAgain.hidden = !finished;
    if (finished) { (btnOn && !btnOn.hidden ? btnOn : btnAgain).focus(); return; }
    card.classList.toggle('reverse', Boolean(cur.reverse));
    card.classList.toggle('tib', !cur.reverse);
    card.classList.toggle('long', !cur.reverse && cur.tib.length > 7);
    card.textContent = cur.reverse ? cur.wylie : cur.tib;
    promptEl.textContent = cur.reverse ? t('alphabet.whichSign') : t('read.prompt');
    clear(optionsEl);
    cur.options.forEach((opt, i) => {
      const cls = 'option' + (answered && opt.right ? ' right' : '') + (answered === opt && !opt.right ? ' wrong' : '');
      optionsEl.append(h('button', { type: 'button', class: cls, disabled: Boolean(answered), onClick: () => choose(opt) },
        h('span', { class: 'option-num' }, String(i + 1)),
        cur.reverse ? h('span', { class: 'tib option-tib' }, opt.tib) : h('span', { class: 'option-wylie' }, opt.wylie)));
    });
    if (answered && !answered.right) btnNext.focus();
  }

  function onKey(e) {
    if (popoverOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^[1-4]$/.test(e.key) && !answered && !finished) {
      const opt = cards[index] && cards[index].options[Number(e.key) - 1];
      if (opt) { choose(opt); e.preventDefault(); }
    } else if (e.key === 'Enter') {
      if (finished) { if (btnOn && !btnOn.hidden) location.hash = btnOn.getAttribute('href'); else deal(); e.preventDefault(); }
      else if (answered && !answered.right) { next(); e.preventDefault(); }
    }
  }
  document.addEventListener('keydown', onKey);
  deal();
  return () => { clearTimeout(timer); document.removeEventListener('keydown', onKey); };
}

export { TRAIN_PASS, ALPHA_STEPS, PASSED };
