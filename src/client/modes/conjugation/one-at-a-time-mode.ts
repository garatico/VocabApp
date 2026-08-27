/**
 * conjugation/one-at-a-time-mode.ts — one verb/tense/pronoun blank at a time.
 *
 * Grid and Full Conjugation both show every selected verb (and its whole
 * paradigm) at once. This is the flashcard-style alternative: one blank to
 * fill in, then the next. Every Order choice except Shuffle walks one verb's
 * whole paradigm (its selected tenses and pronouns, in their natural order)
 * before moving to the next verb — Rank, A-Z and the rest are about *which
 * verb* comes next, not about scrambling the middle of one. Shuffle is the
 * one choice a learner actually expects to be unpredictable, so it shuffles
 * every individual blank together instead: the next card can be a different
 * tense of a different verb from the one before it, "yo conozco" then "él
 * tiene" rather than every form of "conocer" before "tener" ever comes up.
 *
 * Reuses conjugation.css's existing classes (.conj-verb-spanish,
 * .conj-drill-input, .conj-giveup-btn, .conj-reveal-btn, etc.) and
 * index.ts's own eligibility helpers (isOwnInfinitive, hasAnyForms,
 * regularityOf, isSingleForm, verbKey) so a verb is included/excluded and
 * scored the same way here as in the Grid.
 */
import type { Word } from '../../types.js';
import { PRONOUNS, TENSE_DEFS } from './data.js';
import { activeTenses, activeRegularities, unionTenseDefs, activePronounIndices } from './controls.js';
import {
  isOwnInfinitive, hasAnyForms, regularityOf, isSingleForm, verbKey, hiddenPronounSlots,
} from './index.js';
import { foldKey as normalize } from '../../utils/match.js';
import { shuffle } from '../../utils/shuffle.js';
import {
  orderWords, WORD_ORDER_LABELS, saveSession, recordOutcome, type WordOrder,
} from '../../utils/session-history.js';
import { readString, writeString } from '../../utils/storage.js';
import { createStopwatch } from '../../ui/stopwatch.js';
import { showSummary, clearSummary, summaryChip, percent } from '../../ui/quiz-summary.js';
import { buildScorePills, scorePct } from '../../ui/score-pills.js';
import { applyAutofillAttr } from '../../settings.js';

export interface ConjOneAtATimeOptions {
  words:      Word[];
  container:  HTMLElement;
  lang?:      string;
  extraLangs?: string[];
}

interface QueueItem {
  verb:       Word;
  verbLang:   string;
  tenseKey:   string;
  tenseLabel: string;
  slot:       number | 'single';
  pronoun:    string;
}

type ItemResult = 'correct' | 'revealed' | 'missed';

export function renderConjOneAtATime({
  words,
  container,
  lang = 'spanish',
  extraLangs = [],
}: ConjOneAtATimeOptions): void {
  container.innerHTML = '';
  clearSummary('conjugation');

  const primaryLang = lang.split('+')[0];

  const regs     = activeRegularities();
  const everyReg = regs.length >= 4;
  const verbEntries = words.filter(w => w.pos === 'verb' && isOwnInfinitive(w));
  const rawVerbs = verbEntries.filter(hasAnyForms);
  const allVerbs = everyReg
    ? rawVerbs
    : rawVerbs.filter(w => {
        const cls = w.linguistic?.conjugation_class ?? null;
        return cls == null || regs.includes(regularityOf(cls).key);
      });

  if (allVerbs.length === 0) {
    container.innerHTML = `<div class="conj-empty">
      <p>No verbs available to drill one at a time.</p>
      <p class="conj-empty-hint">Check the Tense &amp; Forms and Regularity filters, then hit Start Quiz again.</p>
    </div>`;
    return;
  }

  const tenseDefs = unionTenseDefs(primaryLang, extraLangs);
  function selectedTenses(): string[] {
    const picked = activeTenses().filter(k => tenseDefs.some(d => d.key === k));
    return picked.length ? picked : [tenseDefs[0].key];
  }
  const tenses = selectedTenses();
  // Read once per Start Quiz — matches how `tenses`/`regs` are already
  // snapshotted above rather than re-read live from the DOM per verb.
  const activePronouns = activePronounIndices();

  let verbOrder: WordOrder =
    (readString('vq_conj_oat_order') as WordOrder | null) ?? 'rank';

  function flattenVerb(verb: Word): QueueItem[] {
    const verbLang = verb.language ?? lang;
    const verbTenseDefs = TENSE_DEFS[verbLang] ?? TENSE_DEFS.spanish;
    const tensesForVerb = tenses.filter(t => verbTenseDefs.some(d => d.key === t));
    const items: QueueItem[] = [];
    tensesForVerb.forEach(tenseKey => {
      const tenseLabel = verbTenseDefs.find(d => d.key === tenseKey)?.label ?? tenseKey;
      if (isSingleForm(tenseKey)) {
        items.push({ verb, verbLang, tenseKey, tenseLabel, slot: 'single', pronoun: '' });
      } else {
        const noForm = hiddenPronounSlots(tenseKey);
        (PRONOUNS[verbLang] ?? PRONOUNS.spanish).forEach((p, i) => {
          if (!activePronouns.has(i) || noForm.has(i)) return;
          items.push({ verb, verbLang, tenseKey, tenseLabel, slot: i, pronoun: p });
        });
      }
    });
    return items;
  }

  function buildQueue(): QueueItem[] {
    if (verbOrder === 'shuffle') {
      // Flatten first, *then* shuffle the whole thing — shuffling the verb
      // list and flattening afterwards (what every other Order choice does)
      // would still walk each verb's full paradigm in sequence, just in a
      // random verb order. That's not what "Shuffle" promises.
      return shuffle(allVerbs.flatMap(flattenVerb));
    }
    const ordered = orderWords(allVerbs, verbOrder, w => w.language ?? lang);
    return ordered.flatMap(flattenVerb);
  }

  let queue = buildQueue();
  if (queue.length === 0) {
    container.innerHTML = `<div class="conj-empty">
      <p>No forms to drill for the current Tense &amp; Forms selection.</p>
    </div>`;
    return;
  }

  function answerFor(item: QueueItem): string | null {
    const conj = item.verb.linguistic?.conjugations as Record<string, unknown> | null | undefined;
    if (!conj) return null;
    const raw = conj[item.tenseKey];
    if (item.slot === 'single') return typeof raw === 'string' ? raw : null;
    return Array.isArray(raw) ? ((raw[item.slot] as string | undefined) ?? null) : null;
  }

  const results: (ItemResult | null)[] = queue.map(() => null);
  let idx = 0;
  let finished = false;

  // ── Layout ───────────────────────────────────────────────────────────────

  const wrap = document.createElement('div');
  wrap.className = 'coat-wrap';

  const orderRow = document.createElement('div');
  orderRow.className = 'conj-order-row';
  const orderLabel = document.createElement('span');
  orderLabel.className = 'conj-order-label';
  orderLabel.textContent = 'Order';
  const orderSel = document.createElement('select');
  orderSel.className = 'conj-order-select';
  WORD_ORDER_LABELS.forEach(([value, label]) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label; o.selected = value === verbOrder;
    orderSel.appendChild(o);
  });
  const stopwatchEl = document.createElement('span');
  stopwatchEl.className = 'quiz-stopwatch';
  const giveUpBtn = document.createElement('button');
  giveUpBtn.type = 'button';
  giveUpBtn.className = 'conj-giveup-btn';
  giveUpBtn.textContent = 'Give Up';
  orderRow.append(orderLabel, orderSel, stopwatchEl, giveUpBtn);

  const clock = createStopwatch(stopwatchEl);
  clock.start();

  const progressWrap = document.createElement('div');
  progressWrap.className = 'progressWrap';
  const track  = document.createElement('div'); track.className  = 'progress';
  const green  = document.createElement('div'); green.className  = 'bar';
  const yellow = document.createElement('div'); yellow.className = 'bar-revealed';
  const red    = document.createElement('div'); red.className    = 'bar-missed';
  track.append(green, yellow, red);
  const stat = document.createElement('div');
  stat.className = 'small';
  progressWrap.append(track, stat);
  const scoreEl = document.createElement('div');
  scoreEl.className = 'quiz-score';

  const nav = document.createElement('div');
  nav.className = 'tv-nav coat-nav';
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button'; prevBtn.className = 'tv-nav-btn'; prevBtn.textContent = '← Back';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button'; nextBtn.className = 'tv-nav-btn'; nextBtn.textContent = 'Next →';
  const counter = document.createElement('div');
  counter.className = 'tv-counter';
  nav.append(prevBtn, counter, nextBtn);

  const card = document.createElement('div');
  card.className = 'coat-card';
  const verbEl    = document.createElement('div'); verbEl.className    = 'conj-verb-spanish';
  const tenseEl   = document.createElement('div'); tenseEl.className   = 'conj-card-tense coat-tense';
  const pronounEl = document.createElement('div'); pronounEl.className = 'conj-pronoun coat-pronoun';

  const inputRow = document.createElement('div');
  inputRow.className = 'coat-input-row';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'conj-drill-input coat-input';
  applyAutofillAttr(inp);
  inp.setAttribute('autocorrect', 'off');
  inp.setAttribute('autocapitalize', 'off');
  inp.spellcheck = false;
  inp.placeholder = 'Type conjugation…';
  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.className = 'conj-reveal-btn';
  revealBtn.textContent = '?';
  revealBtn.title = 'Reveal (counts as missed)';
  inputRow.append(inp, revealBtn);

  card.append(verbEl, tenseEl, pronounEl, inputRow);

  wrap.append(orderRow, progressWrap, scoreEl, nav, card);
  container.appendChild(wrap);

  // ── Rendering ────────────────────────────────────────────────────────────

  function renderItem(i: number): void {
    const item  = queue[i];
    const prior = results[i];

    counter.textContent = `${i + 1} / ${queue.length}`;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i >= queue.length - 1 && results.some(r => r === null);
    giveUpBtn.disabled = finished;

    verbEl.textContent = item.verb.word;
    tenseEl.textContent = item.tenseLabel;
    pronounEl.textContent = item.slot === 'single' ? '' : item.pronoun;
    pronounEl.style.visibility = item.slot === 'single' ? 'hidden' : 'visible';

    // Drives --tense-hue/--pronoun-hue (conjugation.css) — same hues the
    // Tense/Forms filter chips, Random Table and Full Conjugation use, so a
    // card here reads as the same tense/person everywhere else it appears.
    card.dataset.tense = item.tenseKey;
    if (item.slot === 'single') delete card.dataset.pi;
    else card.dataset.pi = String(item.slot);

    inp.classList.remove('correct', 'revealed', 'missed');
    if (prior) {
      inp.value = answerFor(item) ?? '';
      inp.disabled = true;
      inp.classList.add(prior);
    } else {
      inp.value = '';
      inp.disabled = finished;
    }
    revealBtn.hidden = prior !== null || finished;
    if (!inp.disabled) inp.focus();
  }

  inp.addEventListener('input', () => {
    if (finished || results[idx] !== null) return;
    const answer = answerFor(queue[idx]);
    if (!answer) return;
    if (normalize(inp.value) === normalize(answer)) {
      inp.value = answer;
      inp.disabled = true;
      inp.classList.add('correct');
      results[idx] = 'correct';
      updateProgress();
      setTimeout(() => advance(), 500);
    }
  });

  revealBtn.addEventListener('click', () => {
    if (finished || results[idx] !== null) return;
    const item = queue[idx];
    inp.value = answerFor(item) ?? '';
    inp.disabled = true;
    inp.classList.add('revealed');
    results[idx] = 'revealed';
    revealBtn.hidden = true;
    updateProgress();
  });

  function advance(): void {
    if (finished) return;
    const nextUnanswered = results.findIndex((r, i) => r === null && i > idx);
    const anyLeft = results.some(r => r === null);
    if (!anyLeft) { finish(); return; }
    idx = nextUnanswered >= 0 ? nextUnanswered : results.findIndex(r => r === null);
    renderItem(idx);
  }

  prevBtn.addEventListener('click', () => { if (idx > 0) { idx--; renderItem(idx); } });
  nextBtn.addEventListener('click', () => {
    if (idx < queue.length - 1) { idx++; renderItem(idx); }
    else if (results.every(r => r !== null)) finish();
  });

  orderSel.addEventListener('change', () => {
    verbOrder = orderSel.value as WordOrder;
    writeString('vq_conj_oat_order', verbOrder);
    // Re-ordering restarts the run — answers live in the flat queue above,
    // rebuilt from scratch, rather than a per-verb state map to preserve.
    queue = buildQueue();
    results.length = 0;
    queue.forEach(() => results.push(null));
    idx = 0;
    finished = false;
    giveUpBtn.disabled = false;
    updateProgress();
    renderItem(idx);
  });

  // ── Progress ─────────────────────────────────────────────────────────────

  function updateProgress(): void {
    const total    = queue.length;
    const correct  = results.filter(r => r === 'correct').length;
    const revealed = results.filter(r => r === 'revealed').length;
    const missed   = results.filter(r => r === 'missed').length;
    const g = scorePct(correct, total), y = scorePct(revealed, total), r = scorePct(missed, total);
    const done = correct + revealed + missed;

    green.style.width  = g + '%';
    yellow.style.left  = g + '%';       yellow.style.width = y + '%';
    red.style.left     = (g + y) + '%'; red.style.width    = r + '%';
    stat.textContent = total > 0 ? `${done}/${total} Answered` : '';
    scoreEl.innerHTML = buildScorePills({ correct, revealed, missed, left: total - done, total });

    giveUpBtn.disabled = total > 0 && done === total;
  }

  // ── Session end ──────────────────────────────────────────────────────────

  function recordSession(): void {
    interface Acc { word: string; language: string; total: number; correct: number; }
    const perVerb = new Map<string, Acc>();
    queue.forEach((item, i) => {
      const key = verbKey(item.verb.word, item.verbLang);
      const acc = perVerb.get(key) ?? { word: item.verb.word, language: item.verbLang, total: 0, correct: 0 };
      acc.total++;
      if (results[i] === 'correct') acc.correct++;
      perVerb.set(key, acc);
    });

    interface Bucket { correct: string[]; missed: string[]; }
    const byLang = new Map<string, Bucket>();
    function bucketFor(wl: string): Bucket {
      let b = byLang.get(wl);
      if (!b) { b = { correct: [], missed: [] }; byLang.set(wl, b); }
      return b;
    }
    perVerb.forEach(acc => {
      bucketFor(acc.language)[acc.correct === acc.total ? 'correct' : 'missed'].push(acc.word);
    });

    const seconds = clock.elapsedSeconds();
    const langs = [...byLang.keys()];
    for (const [wl, b] of byLang) {
      recordOutcome(wl, b.missed, b.correct);
      saveSession(wl, {
        at: new Date().toISOString(),
        mode: 'conjugation',
        total: b.correct.length + b.missed.length,
        correct: b.correct.length,
        unassisted: b.correct.length,
        hints: 0,
        revealed: b.missed.length,
        seconds,
        lang: wl,
        langs: langs.length > 1 ? langs : undefined,
      });
    }
  }

  function finish(): void {
    if (finished) return;
    finished = true;
    clock.stop();
    results.forEach((r, i) => { if (r === null) results[i] = 'missed'; });
    giveUpBtn.disabled = true;
    updateProgress();
    recordSession();
    renderItem(idx);

    const total = queue.length;
    const correct = results.filter(r => r === 'correct').length;
    showSummary('conjugation',
      summaryChip('correct', `✓ ${correct} / ${total} forms`) +
      summaryChip('pct',     `${percent(correct, total)}%`),
      total > 0 && correct === total,
    );
  }

  giveUpBtn.addEventListener('click', finish);

  renderItem(idx);
  updateProgress();
}
