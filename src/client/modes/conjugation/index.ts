/**
 * conjugation/index.ts
 */

import type { Word } from '../../types.js';
import { foldKey as normalize } from '../../utils/match.ts';
import { orderWords, WORD_ORDER_LABELS, saveSession, recordOutcome,
         type WordOrder } from '../../utils/session-history.ts';
import { PRONOUNS, TENSE_DEFS } from './data.js';
import { activeTenses } from './controls.js';
import {
  setProgressCallback,
  applyAllPronounToggles,
} from './controls.js';
import { buildGlossDisplay } from '../../utils/utils.js';
import { buildScorePills, scorePct } from '../../ui/score-pills.js';
import { Settings } from '../../settings.js';

export interface ConjugationModeOptions {
  words:     Word[];
  container: HTMLElement;
  lang?:     string;
}

interface CardController {
  card:          HTMLElement;
  updateHeader:  () => void;
  updateInputs:  () => void;
  /**
   * Fill in every unanswered form. `mark` decides how they're scored:
   * 'revealed' (peeked, yellow) or 'missed' (given up, red).
   */
  revealAnswers: (mark?: 'revealed' | 'missed') => void;
}

let _cleanup: (() => void) | null = null;

const SINGLE_FORM_TENSES = new Set(['past_participle', 'gerund']);

/**
 * Tense key -> display label, flattened across languages.
 *
 * buildCard is a module-level function with no access to the per-language
 * tenseDefs, and the keys are shared across all four languages even where the
 * labels differ, so the first definition wins.
 */
const TENSE_LABELS: Record<string, string> = Object.values(TENSE_DEFS)
  .flat()
  .reduce<Record<string, string>>((acc, def) => {
    if (!(def.key in acc)) acc[def.key] = def.label;
    return acc;
  }, {});

function isSingleForm(key: string): boolean {
  return SINGLE_FORM_TENSES.has(key);
}

const SINGLE_FORM_ROW_LABEL: Record<string, string> = {
  past_participle: 'participio',
  gerund:          'gerundio',
};

function clearConjSummary(): void {
  ['conjSummaryTop', 'conjSummaryBottom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  });
}

function showConjSummary(completeVerbs: number, nVerbs: number, correctForms: number, totalForms: number): void {
  const verbPct  = nVerbs     ? Math.round((completeVerbs / nVerbs)    * 100) : 0;
  const formPct  = totalForms ? Math.round((correctForms  / totalForms) * 100) : 0;
  const pct      = Math.round((verbPct + formPct) / 2);
  const html =
    '<span class="summary-correct">✓ ' + completeVerbs + ' / ' + nVerbs + ' verbs</span>' +
    '<span class="summary-correct">✓ ' + correctForms + ' / ' + totalForms + ' forms</span>' +
    '<span class="summary-pct">' + pct + '%</span>';
  ['conjSummaryTop', 'conjSummaryBottom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'flex'; el.innerHTML = html; }
  });
}

export function renderConjugationMode({ words, container, lang = 'spanish' }: ConjugationModeOptions): void {
  if (_cleanup) { _cleanup(); _cleanup = null; }
  setProgressCallback(null);
  clearConjSummary();

  container.innerHTML = '';

  // Order lives with the quiz, as it does in recall and table mode, so it can
  // be changed without restarting. Shared implementation, so 'shuffle' and
  // 'words I keep missing' behave identically in all three.
  let verbOrder: WordOrder =
    (localStorage.getItem('vq_conj_order') as WordOrder | null) ?? 'rank';
  const allVerbs = words.filter(w => w.pos === 'verb');
  let verbs = orderWords(allVerbs, verbOrder, lang);

  if (verbs.length === 0) {
    container.innerHTML = `
      <div class="conj-empty">
        <p>No verbs in the current word list.</p>
        <p class="conj-empty-hint">Make sure "Verbs" is checked in the class filter, then hit Start Quiz again.</p>
      </div>`;
    return;
  }

  const pronouns  = PRONOUNS[lang]   ?? PRONOUNS.spanish;
  const tenseDefs = TENSE_DEFS[lang] ?? TENSE_DEFS.spanish;

  const displayToggle = document.getElementById('conjDisplayToggle');

  /** Tenses to drill, always at least one. */
  function selectedTenses(): string[] {
    const picked = activeTenses().filter(k => tenseDefs.some(d => d.key === k));
    return picked.length ? picked : [tenseDefs[0].key];
  }

  function tenseLabel(key: string): string {
    return tenseDefs.find(d => d.key === key)?.label ?? key;
  }

  function getDisplayMode(): string {
    return displayToggle?.querySelector<HTMLElement>('.conj-toggle-btn.active')?.dataset.mode ?? 'both';
  }

  function syncPronounRowVisibility(): void {
    // Hidden only when *every* selected tense is a single-form one
    // (participle, gerund) — those have no pronouns to filter.
    const allSingle  = selectedTenses().every(isSingleForm);
    const pronounRow = document.getElementById('conjPronounRow');
    if (pronounRow) pronounRow.hidden = allSingle;
  }

  // ── Progress: same segmented bar + score pills as table mode ───────────────
  // ── Order control ─────────────────────────────────────────────────────────
  const orderRow = document.createElement('div');
  orderRow.className = 'conj-order-row';
  const orderLabel = document.createElement('span');
  orderLabel.className = 'conj-order-label';
  orderLabel.textContent = 'Order';
  const orderSel = document.createElement('select');
  orderSel.className = 'conj-order-select';
  orderSel.title = 'Order of the verbs in this quiz';
  WORD_ORDER_LABELS.forEach(([value, label]) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label; o.selected = value === verbOrder;
    orderSel.appendChild(o);
  });
  const orderCount = document.createElement('span');
  orderCount.className = 'conj-order-count';
  function describeSet(): string {
    const t = selectedTenses().length;
    const v = verbs.length;
    return t > 1
      ? `${v} verb${v === 1 ? '' : 's'} × ${t} tenses = ${v * t} cards`
      : `${v} verb${v === 1 ? '' : 's'}`;
  }
  orderCount.textContent = describeSet();
  orderRow.append(orderLabel, orderSel, orderCount);

  const progressSection = document.createElement('div');
  progressSection.className = 'conj-progress-section';

  const progressBlock = document.createElement('div');
  progressBlock.className = 'conj-progress-block';

  /**
   * One labelled progress group: heading, three-segment bar, side stat and a
   * row of score pills — the same anatomy table mode uses.
   */
  function makeProgressGroup(labelText: string, hint: string): {
    green: HTMLElement; yellow: HTMLElement; red: HTMLElement;
    stat: HTMLElement; pills: HTMLElement;
  } {
    const group = document.createElement('div');
    group.className = 'quiz-progress-group';

    const label = document.createElement('div');
    label.className   = 'progress-group-label';
    label.textContent = labelText;
    label.title       = hint;

    const wrap = document.createElement('div');
    wrap.className = 'progressWrap';

    const track = document.createElement('div');
    track.className = 'progress';
    const green  = document.createElement('div'); green.className  = 'bar';
    const yellow = document.createElement('div'); yellow.className = 'bar-revealed';
    const red    = document.createElement('div'); red.className    = 'bar-missed';
    track.append(green, yellow, red);

    const stat = document.createElement('div');
    stat.className = 'small';
    wrap.append(track, stat);

    const pills = document.createElement('div');
    pills.className = 'quiz-score';

    group.append(label, wrap, pills);
    progressBlock.appendChild(group);
    return { green, yellow, red, stat, pills };
  }

  const formsBar = makeProgressGroup('Forms', 'Progress across every individual conjugation');
  const verbsBar = makeProgressGroup('Verbs', 'Progress across whole verbs — a verb counts once all its forms are done');

  const giveUpBtn = document.createElement('button');
  giveUpBtn.className   = 'conj-giveup-btn';
  giveUpBtn.textContent = 'Give Up';

  progressSection.append(progressBlock, giveUpBtn);

  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'conj-cards-grid';

  interface Counts { correct: number; revealed: number; missed: number; left: number; total: number }

  /**
   * Tally at both levels. A verb is scored by its weakest form: all correct →
   * correct; otherwise fully answered with a missed form → missed, with only
   * peeks → revealed; anything still blank → left.
   */
  function tally(): { forms: Counts; verbs: Counts } {
    const forms: Counts = { correct: 0, revealed: 0, missed: 0, left: 0, total: 0 };
    const verbs: Counts = { correct: 0, revealed: 0, missed: 0, left: 0, total: 0 };

    cardsGrid.querySelectorAll('.conj-card').forEach(card => {
      let cardTotal = 0, cardCorrect = 0, cardRevealed = 0, cardMissed = 0;

      card.querySelectorAll('.conj-row:not(.conj-row-hidden)').forEach(row => {
        const inp = row.querySelector<HTMLInputElement>('.conj-drill-input');
        if (!inp) return;
        cardTotal++;
        if (inp.classList.contains('correct'))       cardCorrect++;
        else if (inp.classList.contains('revealed')) cardRevealed++;
        else if (inp.classList.contains('missed'))   cardMissed++;
      });

      forms.total    += cardTotal;
      forms.correct  += cardCorrect;
      forms.revealed += cardRevealed;
      forms.missed   += cardMissed;

      if (cardTotal === 0) return;
      verbs.total++;
      if      (cardCorrect === cardTotal)                        verbs.correct++;
      else if (cardCorrect + cardRevealed + cardMissed < cardTotal) verbs.left++;
      else if (cardMissed > 0)                                   verbs.missed++;
      else                                                       verbs.revealed++;
    });

    forms.left = forms.total - forms.correct - forms.revealed - forms.missed;
    return { forms, verbs };
  }

  function paint(
    bar: { green: HTMLElement; yellow: HTMLElement; red: HTMLElement; stat: HTMLElement; pills: HTMLElement },
    c: Counts,
    statText: string,
  ): void {
    const greenPct  = scorePct(c.correct,  c.total);
    const yellowPct = scorePct(c.revealed, c.total);
    const redPct    = scorePct(c.missed,   c.total);

    bar.green.style.width  = greenPct + '%';
    bar.yellow.style.left  = greenPct + '%';
    bar.yellow.style.width = yellowPct + '%';
    bar.red.style.left     = (greenPct + yellowPct) + '%';
    bar.red.style.width    = redPct + '%';

    bar.stat.textContent = statText;
    bar.pills.innerHTML  = buildScorePills(c);
  }

  function updateProgress(): void {
    const { forms, verbs } = tally();

    paint(formsBar, forms, `${forms.correct + forms.revealed + forms.missed}/${forms.total} answered`);
    paint(verbsBar, verbs, `${verbs.correct}/${verbs.total} fully conjugated`);

    if (forms.total > 0 && forms.correct === forms.total) {
      recordConjSession();
      showConjSummary(verbs.correct, verbs.total, forms.correct, forms.total);
    }
  }

  let cardUpdaters: CardController[] = [];

  /** (Re)build every card from `verbs`, in the current order. */
  /** Tenses the cards currently on screen were built from. */
  let builtTenses: string[] = [];

  function buildCards(): void {
    cardsGrid.innerHTML = '';
    cardUpdaters = [];
    const tenses = selectedTenses();
    builtTenses = [...tenses];

    verbs.forEach(verb => {
      tenses.forEach(tenseKey => {
        const updater = buildCard(verb, pronouns, tenseKey, getDisplayMode, updateProgress);
        // Needed to attribute a card's outcome back to its verb when the
        // session is recorded. Several cards can share a verb now, so the
        // recorder scores a verb correct only if every one of its cards is.
        updater.card.dataset.verb  = verb.word;
        updater.card.dataset.tense = tenseKey;

        cardsGrid.appendChild(updater.card);
        cardUpdaters.push(updater);
      });
    });
  }

  const conjSessionStart = Date.now();
  let conjRecorded = false;

  /**
   * Record the session once it finishes or is given up on.
   *
   * A verb counts as correct only when every one of its visible forms is
   * correct — the same rule the verb-level progress bar uses.
   */
  function recordConjSession(): void {
    if (conjRecorded) return;
    conjRecorded = true;

    // A verb can now have several cards, one per selected tense. It counts as
    // correct only when every one of them is fully correct — otherwise
    // knowing the present tense would mask not knowing the subjunctive.
    const perVerb = new Map<string, { cards: number; clean: number }>();
    cardsGrid.querySelectorAll<HTMLElement>('.conj-card').forEach(card => {
      const word = card.dataset.verb;
      if (!word) return;
      const rows = card.querySelectorAll('.conj-row:not(.conj-row-hidden)');
      let total = 0, correct = 0;
      rows.forEach(row => {
        const inp = row.querySelector<HTMLInputElement>('.conj-drill-input');
        if (!inp) return;
        total++;
        if (inp.classList.contains('correct')) correct++;
      });
      if (total === 0) return;
      const acc = perVerb.get(word) ?? { cards: 0, clean: 0 };
      acc.cards++;
      if (correct === total) acc.clean++;
      perVerb.set(word, acc);
    });

    const correctWords: string[] = [];
    const missedWords:  string[] = [];
    perVerb.forEach((acc, word) => {
      (acc.clean === acc.cards ? correctWords : missedWords).push(word);
    });
    if (correctWords.length === 0 && missedWords.length === 0) return;

    recordOutcome(lang, missedWords, correctWords);
    saveSession(lang, {
      at: new Date().toISOString(),
      mode: 'conjugation',
      total: correctWords.length + missedWords.length,
      correct: correctWords.length,
      unassisted: correctWords.length,
      hints: 0,
      revealed: missedWords.length,
      seconds: Math.max(1, Math.round((Date.now() - conjSessionStart) / 1000)),
    });
  }
  buildCards();
  updateTenseSummary();

  orderSel.addEventListener('change', () => {
    verbOrder = orderSel.value as WordOrder;
    localStorage.setItem('vq_conj_order', verbOrder);
    verbs = orderWords(allVerbs, verbOrder, lang);
    // Answers live in the DOM here rather than a state map, so re-ordering
    // restarts the cards. Warn rather than silently discarding work.
    const answered = cardUpdaters.some(u => u.card.querySelector('input:disabled'));
    if (answered && !window.confirm('Re-ordering rebuilds the cards and clears answers so far. Continue?')) {
      orderSel.value = verbOrder = (localStorage.getItem('vq_conj_order') as WordOrder) ?? 'rank';
      return;
    }
    buildCards();
    if (!selectedTenses().every(isSingleForm)) applyAllPronounToggles(cardsGrid);
    syncPronounRowVisibility();
    updateProgress();
  });

  container.append(orderRow, progressSection, cardsGrid);

  // Only apply pronoun toggles for conjugation tenses — skipping it in
  // single-form mode prevents applyAllPronounToggles from re-showing the
  // pronoun rows that buildCard already hid via setSingleMode(true).
  if (!selectedTenses().every(isSingleForm)) {
    applyAllPronounToggles(cardsGrid);
  }
  syncPronounRowVisibility();

  setProgressCallback(updateProgress);
  updateProgress();

  giveUpBtn.addEventListener('click', () => {
    cardUpdaters.forEach(u => u.revealAnswers('missed'));
    giveUpBtn.disabled = true;
    updateProgress();
    // Show a summary when giving up (progress may not be 100%)
    const { forms, verbs } = tally();
    showConjSummary(verbs.correct, verbs.total, forms.correct, forms.total);
  });

  const handleTenseChange = (): void => {
    // Deliberately does NOT rebuild the cards.
    //
    // It used to, and with a few hundred cards on screen every chip click tore
    // down and re-created the whole grid — which is what made the chips feel
    // laggy. The selection is a choice about the *next* quiz, so it is only
    // applied on Start Quiz. The summary line says so, otherwise the chips
    // would look broken.
    syncPronounRowVisibility();
    updateTenseSummary(true);
  };

  /**
   * Describe the current tense selection, and whether it differs from what is
   * actually on screen.
   */
  function updateTenseSummary(pending = false): void {
    const el = document.getElementById('conjTenseSummary');
    if (!el) return;
    const names = selectedTenses().map(tenseLabel);
    const shown = names.length <= 2 ? names.join(', ') : `${names.length} tenses`;
    const differs = pending && !sameSet(selectedTenses(), builtTenses);
    el.textContent = differs
      ? `${shown} — press Start Quiz to apply`
      : shown;
    el.classList.toggle('conj-tf-summary--pending', differs);
  }

  function sameSet(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every(x => b.includes(x));
  }

  const handleDisplayClick = (e: Event): void => {
    const btn = (e.target as Element).closest<HTMLElement>('.conj-toggle-btn');
    if (!btn || !displayToggle?.contains(btn)) return;
    displayToggle.querySelectorAll('.conj-toggle-btn')
      .forEach(b => b.classList.toggle('active', b === btn));
    cardUpdaters.forEach(u => u.updateHeader());
  };

  // ── Verb-to-verb navigation ────────────────────────────────────────────────
  // Tab walks the forms within a verb; Ctrl/Cmd + ↓ or ↑ jumps whole verbs
  // (ser → estar → haber), landing on the first form still to be filled.
  const handleCardNav = (e: KeyboardEvent): void => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

    const cards = Array.from(cardsGrid.querySelectorAll<HTMLElement>('.conj-card'));
    if (cards.length === 0) return;

    const active  = document.activeElement as HTMLElement | null;
    const current = active?.closest<HTMLElement>('.conj-card') ?? null;
    const idx     = current ? cards.indexOf(current) : -1;

    e.preventDefault();
    const step   = e.key === 'ArrowDown' ? 1 : -1;
    const next   = idx === -1
      ? cards[step === 1 ? 0 : cards.length - 1]
      : cards[(idx + step + cards.length) % cards.length];

    const target =
      next.querySelector<HTMLInputElement>('.conj-row:not(.conj-row-hidden) .conj-drill-input:not(:disabled)')
      ?? next.querySelector<HTMLInputElement>('.conj-row:not(.conj-row-hidden) .conj-drill-input');
    target?.focus();
    next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const tenseChips = document.getElementById('conjTenseChips');
  // Chips, All and None all change the selection, so listen on the
  // container and on the two buttons that sit outside it.
  tenseChips?.addEventListener('click', handleTenseChange);
  document.getElementById('conjTensesAll')?.addEventListener('click', handleTenseChange);
  document.getElementById('conjTensesNone')?.addEventListener('click', handleTenseChange);
  displayToggle?.addEventListener('click', handleDisplayClick);
  document.addEventListener('keydown', handleCardNav);

  _cleanup = (): void => {
    tenseChips?.removeEventListener('click', handleTenseChange);
    document.getElementById('conjTensesAll')?.removeEventListener('click', handleTenseChange);
    document.getElementById('conjTensesNone')?.removeEventListener('click', handleTenseChange);
    displayToggle?.removeEventListener('click', handleDisplayClick);
    document.removeEventListener('keydown', handleCardNav);
    setProgressCallback(null);
  };
}

// ── Card builder ──────────────────────────────────────────────────────────────

function buildCard(
  verb:           Word,
  pronouns:       string[],
  tenseKey:       string,
  getDisplayMode: () => string,
  onProgress:     () => void,
): CardController {
  // One card drills one tense. Multiple selected tenses produce multiple
  // cards for the same verb rather than one card with several sections —
  // the card's answer checking, pronoun toggles and progress tally are all
  // written around a single tense, and splitting them would have meant
  // rewriting all three.
  const getTenseKey = (): string => tenseKey;
  const card = document.createElement('div');
  card.className = 'conj-card';

  // Header is a two-column row: the verb and its meaning on the left, the
  // tense and the reveal control on the right. The right half used to be
  // empty, which on a half-width card is a lot of wasted space.
  const header = document.createElement('div');
  header.className = 'conj-card-header';

  const headMain = document.createElement('div');
  headMain.className = 'conj-head-main';
  const targetEl  = document.createElement('div');
  targetEl.className = 'conj-verb-spanish';
  const englishEl = document.createElement('div');
  englishEl.className = 'conj-verb-english';
  headMain.append(targetEl, englishEl);

  const headSide = document.createElement('div');
  headSide.className = 'conj-head-side';

  // Tense name, always shown — it is the one thing that distinguishes two
  // cards for the same verb.
  const tenseEl = document.createElement('span');
  tenseEl.className = 'conj-card-tense';
  headSide.appendChild(tenseEl);

  // Frequency band, if we have one. Free context in space that was empty.
  const bandEl = document.createElement('span');
  bandEl.className = 'conj-card-band';
  const band = verb.frequency?.band ?? null;
  if (band) bandEl.textContent = band; else bandEl.hidden = true;
  headSide.appendChild(bandEl);

  const revealAllBtn = document.createElement('button');
  revealAllBtn.type      = 'button';
  revealAllBtn.className = 'conj-reveal-all-btn';
  revealAllBtn.textContent = 'Reveal all';
  revealAllBtn.title = 'Fill in every form for this verb (scored as revealed)';
  revealAllBtn.addEventListener('click', () => {
    revealAnswers('revealed');
    revealAllBtn.disabled = true;
  });
  headSide.appendChild(revealAllBtn);

  header.append(headMain, headSide);

  function updateHeader(): void {
    const mode = getDisplayMode();
    targetEl.textContent  = verb.word;
    englishEl.textContent = buildGlossDisplay(verb);
    targetEl.hidden  = mode === 'english';
    englishEl.hidden = mode === 'target';
    tenseEl.textContent = TENSE_LABELS[tenseKey] ?? tenseKey;
  }

  const innerGrid = document.createElement('div');
  innerGrid.className = 'conj-inner-grid';

  const inputs: HTMLInputElement[] = [];
  const pronounRows: HTMLElement[] = [];

  // Reveal buttons mirror table mode: hidden entirely when hints are off,
  // otherwise a ? that fills the answer in and scores it as revealed.
  const hintMode = Settings.getHintMode();

  function makeRevealBtn(onReveal: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'reveal-btn conj-reveal-btn';
    btn.textContent = '?';
    btn.title       = 'Reveal answer (counts as revealed)';
    btn.tabIndex    = -1;      // Tab stays on the inputs
    btn.hidden      = hintMode === 'none';
    btn.addEventListener('click', onReveal);
    return btn;
  }

  const revealBtns: HTMLButtonElement[] = [];

  pronouns.forEach((pronoun, i) => {
    const row = document.createElement('div');
    row.className  = 'conj-row';
    row.dataset.pi = String(i);

    const label = document.createElement('span');
    label.className   = 'conj-pronoun';
    label.textContent = pronoun;

    const inp = document.createElement('input');
    inp.type           = 'text';
    inp.className      = 'conj-drill-input';
    inp.autocomplete   = 'off';
    inp.setAttribute("autocorrect", "off");
    inp.setAttribute("autocapitalize", "off");
    inp.spellcheck     = false;
    inp.placeholder    = 'Type conjugation…';

    const revealBtn = makeRevealBtn(() => { revealOne(i); });
    revealBtns.push(revealBtn);

    row.append(label, inp, revealBtn);
    innerGrid.appendChild(row);
    inputs.push(inp);
    pronounRows.push(row);
  });

  // Single-form row (past_participle / gerund)
  const singleFormRow = document.createElement('div');
  singleFormRow.className  = 'conj-row conj-row-hidden';
  singleFormRow.dataset.pi = 'single';

  const singleLabel = document.createElement('span');
  singleLabel.className = 'conj-pronoun';

  let singleInp = document.createElement('input');
  singleInp.type           = 'text';
  singleInp.className      = 'conj-drill-input';
  singleInp.autocomplete   = 'off';
  singleInp.setAttribute("autocorrect", "off");
  singleInp.setAttribute("autocapitalize", "off");
  singleInp.spellcheck     = false;
  singleInp.placeholder    = 'Type conjugation…';

  const singleRevealBtn = makeRevealBtn(() => { revealOne('single'); });

  singleFormRow.append(singleLabel, singleInp, singleRevealBtn);
  innerGrid.appendChild(singleFormRow);

  card.append(header, innerGrid);

  function addNav(inp: HTMLInputElement, i: number): void {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        let n = (i + 1) % inputs.length;
        while (inputs[n].disabled && n !== i) n = (n + 1) % inputs.length;
        inputs[n].focus();
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        let p = (i - 1 + inputs.length) % inputs.length;
        while (inputs[p].disabled && p !== i) p = (p - 1 + inputs.length) % inputs.length;
        inputs[p].focus();
      }
    });
  }

  function attachChecking(): void {
    const tenseKey = getTenseKey();

    if (isSingleForm(tenseKey)) {
      const answer = verb.linguistic?.conjugations?.[tenseKey] as string | null ?? null;

      const fresh = singleInp.cloneNode(true) as HTMLInputElement;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      singleInp.parentNode!.replaceChild(fresh, singleInp); // parentNode is non-null: element is attached to the DOM
      singleInp = fresh;

      fresh.addEventListener('input', () => {
        if (!answer) return;
        const correct = normalize(fresh.value) === normalize(answer);
        const was     = fresh.classList.contains('correct');
        fresh.classList.toggle('correct', correct);
        if (correct && !was) {
          fresh.value    = answer;
          fresh.disabled = true;
          onProgress();
        }
      });

    } else {
      const answers = (verb.linguistic?.conjugations as Record<string, string[]> | null)
        ?.[tenseKey] ?? null;

      inputs.forEach((inp, i) => {
        const fresh = inp.cloneNode(true) as HTMLInputElement;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        inp.parentNode!.replaceChild(fresh, inp); // parentNode is non-null: element is attached to the DOM
        inputs[i] = fresh;

        addNav(fresh, i);

        fresh.addEventListener('input', () => {
          if (!answers) return;
          const expected = Array.isArray(answers) ? (answers[i] ?? '') : '';
          const correct  = normalize(fresh.value) === normalize(expected);
          const was      = fresh.classList.contains('correct');
          fresh.classList.toggle('correct', correct);

          if (correct && !was) {
            fresh.value    = expected;
            fresh.disabled = true;
            let n = (i + 1) % inputs.length;
            while (inputs[n].disabled && n !== i) n = (n + 1) % inputs.length;
            if (n !== i) inputs[n].focus();
            onProgress();
          }
        });
      });
    }
  }

  function setSingleMode(single: boolean): void {
    pronounRows.forEach(row => row.classList.toggle('conj-row-hidden', single));
    singleFormRow.classList.toggle('conj-row-hidden', !single);
    if (single) {
      singleLabel.textContent = SINGLE_FORM_ROW_LABEL[getTenseKey()] ?? getTenseKey();
    }
  }

  function updateInputs(): void {
    const single = isSingleForm(getTenseKey());

    inputs.forEach((inp, i) => {
      inp.value    = '';
      inp.disabled = false;
      inp.classList.remove('correct', 'revealed', 'missed');
      const btn = revealBtns[i];
      if (btn) { btn.hidden = hintMode === 'none'; btn.textContent = '?'; }
    });

    singleInp.value = '';
    singleInp.disabled = false;
    singleInp.classList.remove('correct', 'revealed', 'missed');
    singleRevealBtn.hidden      = hintMode === 'none';
    singleRevealBtn.textContent = '?';

    setSingleMode(single);
    attachChecking();
  }

  /** The answer for one slot — index for a pronoun row, 'single' for the odd ones. */
  function answerFor(slot: number | 'single'): string | null {
    const tenseKey = getTenseKey();
    if (slot === 'single') {
      return (verb.linguistic?.conjugations?.[tenseKey] as string | null) ?? null;
    }
    const answers = (verb.linguistic?.conjugations as Record<string, string[]> | null)
      ?.[tenseKey] ?? null;
    return (Array.isArray(answers) ? answers[slot] : null) ?? null;
  }

  function fill(
    inp: HTMLInputElement,
    btn: HTMLButtonElement | undefined,
    answer: string | null,
    mark: 'revealed' | 'missed',
  ): void {
    if (inp.classList.contains('correct') ||
        inp.classList.contains('revealed') ||
        inp.classList.contains('missed')) return;
    inp.value = answer ?? '—';
    inp.classList.add(mark);
    inp.disabled = true;
    if (btn) btn.hidden = true;
  }

  /** Reveal one form via its ? button — scored as revealed, not missed. */
  function revealOne(slot: number | 'single'): void {
    const single = slot === 'single';
    const inp    = single ? singleInp       : inputs[slot];
    const btn    = single ? singleRevealBtn : revealBtns[slot];
    const answer = answerFor(slot);

    // First-letter mode gives one nudge before handing over the full answer.
    if (hintMode === 'first-letter' && btn?.textContent === '?' && answer) {
      inp.value       = answer[0];
      inp.placeholder = `${answer.length} letters`;
      inp.focus();
      btn.textContent = '??';
      btn.title       = 'Reveal full answer';
      return;
    }

    fill(inp, btn, answer, 'revealed');
    onProgress();
  }

  function revealAnswers(mark: 'revealed' | 'missed' = 'missed'): void {
    if (isSingleForm(getTenseKey())) {
      fill(singleInp, singleRevealBtn, answerFor('single'), mark);
    } else {
      inputs.forEach((inp, i) => fill(inp, revealBtns[i], answerFor(i), mark));
    }
  }

  setSingleMode(isSingleForm(getTenseKey()));
  updateHeader();
  attachChecking();

  return { card, updateHeader, updateInputs, revealAnswers };
}
