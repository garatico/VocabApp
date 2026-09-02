/**
 * conjugation/index.ts
 */

import type { Word } from '../../types.js';
import { showSummary, clearSummary, summaryChip, percent } from '../../ui/quiz-summary.ts';
import { readString, writeString } from '../../utils/storage.ts';
import { foldKey as normalize } from '../../utils/match.ts';
import { orderWords, getWordOrderLabels, saveSession, recordOutcome,
         type WordOrder } from '../../utils/session-history.ts';
import { PRONOUNS, TENSE_DEFS, tenseEnLabel, TENSE_HELP, REGULARITY_HELP } from './data.js';
import { activeTenses, activeRegularities, unionTenseDefs } from './controls.js';
import {
  setProgressCallback,
  applyAllPronounToggles,
  activePronounIndices,
} from './controls.js';
import { isOwnInfinitive, hasAnyForms, regularityOf } from './verb-filters.js';
// Re-exported — one-at-a-time-mode.ts, random-table-mode.ts and
// card-match-mode.ts import these three from here, not from verb-filters.ts
// directly (they predate the split).
export { isOwnInfinitive, hasAnyForms, regularityOf };
import { buildGlossDisplay, displayWord } from '../../utils/utils.js';
import { getWordLists } from '../../utils/word-lists.ts';
import { openListPicker } from '../../utils/list-picker.ts';
import { supportsConjugation, conjugationUnavailableReason, languageInfo } from '../../data/languages.js';
import { createFlagImg } from '../../ui/flag-icon.js';
import { createStopwatch } from '../../ui/stopwatch.js';
import { buildScorePills, scorePct } from '../../ui/score-pills.js';
import {
  Settings, applyConjDeselectedClass, setOnConjDeselectedChange, applyAutofillAttr,
  setOnShowTimerChange,
} from '../../settings.js';

export interface ConjugationModeOptions {
  words:      Word[];
  container:  HTMLElement;
  lang?:      string;
  /** Extra languages merged in via the "+ Languages" picker — see app.ts. */
  extraLangs?: string[];
}

/**
 * A verb's identity for session state: two languages can share a spelling
 * (Spanish "no"/Italian "no", Spanish "amar" / Portuguese "amar") once
 * merged, so keying purely by word text — which card.dataset.verb used to do
 * — would fold two different verbs' answers into one tally. Mirrors
 * table-mode.ts's rowKey() / recall-mode.ts's cellKey().
 */
export function verbKey(word: string, verbLang: string): string {
  return `${verbLang}:${word}`;
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
  /**
   * Put the right content in the cells of deselected pronouns.
   *
   * Only 'answer' mode needs it — the other three are pure CSS — but the clear
   * half has to run whatever the mode, or an answer left over from a previous
   * setting stays in the box after the pronoun is switched back on.
   */
  syncDeselected: () => void;
  /**
   * Re-apply previously banked outcomes to a freshly built card — turning a
   * page, changing page size, or switching Grid/Full always rebuilds every
   * card from scratch, so without this a verb that comes back on screen
   * (paging back, or switching the view and back) showed blank inputs even
   * though bankVisibleVerbs() had already scored it. See buildCards()'s own
   * call site for where the banked slots come from.
   */
  restoreBanked: (states: ReadonlyMap<number | 'single', 'correct' | 'revealed' | 'missed'>) => void;
}

let _cleanup: (() => void) | null = null;

// setOnShowTimerChange has no "already registered" guard of its own — it's a
// plain listener list — so without this a listener would pile up on every
// single Start Quiz click. syncConjTimerVisibility looks its target element
// up by id on every call rather than closing over it, so any one registered
// copy behaves identically to any other; this just keeps there from being a
// growing pile of them.
let _timerVisibilityRegistered = false;

const SINGLE_FORM_TENSES = new Set(['past_participle', 'gerund']);

// The two imperative moods have five persons, not six — there's no such
// thing as commanding yourself, so "yo" doesn't exist here at all. Different
// from SINGLE_FORM_TENSES (no pronoun row at all): these still have five of
// the normal six, just missing one.
const NO_YO_TENSES = new Set(['imperative_affirmative', 'imperative_negative']);
const EMPTY_SLOTS: ReadonlySet<number> = new Set();

/** Pronoun slot indices a tense simply has no form for — currently only "yo"
 *  (index 0) for the imperative moods. Shared with one-at-a-time-mode.ts,
 *  random-table-mode.ts and card-match-mode.ts, which have no grid rows to
 *  hide and instead use this to skip the slot before ever building one. */
export function hiddenPronounSlots(tenseKey: string): Set<number> {
  return NO_YO_TENSES.has(tenseKey) ? new Set([0]) : new Set();
}

export function isSingleForm(key: string): boolean {
  return SINGLE_FORM_TENSES.has(key);
}

/**
 * A pronoun row can be hidden for two unrelated reasons, so each owns a class.
 *
 *   conj-row-hidden        the pronoun is toggled off. Global, set by the
 *                          pronoun toggles, and applies to every card at once.
 *   conj-row-tense-hidden  this card drills a single-form tense (gerund,
 *                          participle), which has no pronouns at all. Per card,
 *                          set by setSingleMode.
 *
 * They used to share `conj-row-hidden`, and applyAllPronounToggles would clear
 * it on every pronoun that was toggled *on* — re-showing the six empty pronoun
 * boxes on a gerund card that setSingleMode had just hidden. It was worked
 * around by skipping applyAllPronounToggles when every selected tense was
 * single-form, which held only until multi-tense drilling made "Gerundio and
 * Presente" a normal thing to pick: the guard sees a non-single tense in the
 * selection and lets the toggles run over the gerund cards anyway.
 *
 * Separate classes mean neither mechanism can clear the other's decision.
 */
const VISIBLE_ROW = '.conj-row:not(.conj-row-hidden):not(.conj-row-tense-hidden)';

const SINGLE_FORM_ROW_LABEL: Record<string, string> = {
  past_participle: 'participio',
  gerund:          'gerundio',
};

function clearConjSummary(): void {
  clearSummary('conjugation');
}

function showConjSummary(completeVerbs: number, nVerbs: number, correctForms: number, totalForms: number): void {
  // Verbs and forms weigh equally: finishing half the verbs perfectly and
  // half-finishing all of them are the same score, which is the honest reading
  // of a grid you are filling in.
  const pct = Math.round((percent(completeVerbs, nVerbs) + percent(correctForms, totalForms)) / 2);
  showSummary('conjugation',
    summaryChip('correct', `✓ ${completeVerbs} / ${nVerbs} verbs`) +
    summaryChip('correct', `✓ ${correctForms} / ${totalForms} forms`) +
    summaryChip('pct',     `${pct}%`),
    totalForms > 0 && correctForms === totalForms,
  );
}

/**
 * Tears down the previous render's global listeners (document-level keydown,
 * tense/regularity chip clicks). Grid/Full call this themselves on their own
 * next render, but One at a Time / Random Table / Card Match bypass
 * renderConjugationMode entirely — start-handler.ts calls this directly
 * before routing to any of those three, so switching away from Grid/Full
 * never leaves a stale document keydown handler (or stale chip listeners
 * closing over a torn-down session) running underneath a different view.
 */
export function cleanupConjugationMode(): void {
  if (_cleanup) { _cleanup(); _cleanup = null; }
}

export function renderConjugationMode({ words, container, lang = 'spanish', extraLangs = [] }: ConjugationModeOptions): void {
  cleanupConjugationMode();
  setProgressCallback(null);
  clearConjSummary();

  container.innerHTML = '';

  // `lang` is a combined "spanish+italian"-style id when a multi-language
  // session is active (see app.ts's getFullLang), same convention Table and
  // Recall mode already receive — every merged word carries its own real
  // `.language`, so `lang` itself is read as a *fallback* everywhere below.
  // The one place the raw primary name is needed on its own — the
  // conjugation-support gate and the chip-union builder, neither of which is
  // a per-word fallback — `lang`'s first segment is always it.
  const primaryLang = lang.split('+')[0];

  // The tab is disabled for languages with no conjugation data, so this should
  // be unreachable from the UI — but a stale saved mode or a direct call would
  // otherwise render a grid of empty cards with nothing to check answers
  // against, which looks like a bug rather than a missing feature.
  if (!supportsConjugation(primaryLang)) {
    const box = document.createElement('div');
    box.className = 'conj-empty';
    const head = document.createElement('p');
    head.textContent = 'Conjugation practice is not available for this language yet.';
    const why = document.createElement('p');
    why.className   = 'conj-empty-hint';
    why.textContent = conjugationUnavailableReason(primaryLang);
    box.append(head, why);
    container.appendChild(box);
    return;
  }

  // Order lives with the quiz, as it does in recall and table mode, so it can
  // be changed without restarting. Shared implementation, so 'shuffle' and
  // 'words I keep missing' behave identically in all three.
  let verbOrder: WordOrder =
    (readString('vq_conj_order') as WordOrder | null) ?? 'rank';
  // Regularity filter, from the chips in the Tense & Forms box. Applied here
  // rather than at card-build time so the count in the order row, the progress
  // bars and the session record all agree on what the quiz contains.
  const regs      = activeRegularities();
  const everyReg  = regs.length >= 4;
  const verbEntries = words.filter(w => w.pos === 'verb' && isOwnInfinitive(w));

  // Only verbs we actually have forms for. Spanish generates them from rules so
  // this is a no-op there, but the imported languages are patchy — 41 of
  // French's 1,337 verbs carry a table, and German and Dutch carry none until
  // the conjugations pipeline step has been run. Without this the mode built a
  // card per missing verb whose every cell was blank and whose every answer was
  // null: uncompletable, and counted against the learner in the progress bars.
  const rawVerbs = verbEntries.filter(hasAnyForms);
  const noFormsCount = verbEntries.length - rawVerbs.length;

  const allVerbs  = everyReg
    ? rawVerbs
    // A verb with no recorded class has no bucket to be filtered into, so it
    // survives — dropping it would silently hide most non-Spanish verbs.
    : rawVerbs.filter(w => {
        const cls = w.linguistic?.conjugation_class ?? null;
        return cls == null || regs.includes(regularityOf(cls).key);
      });
  let verbs = orderWords(allVerbs, verbOrder, w => w.language ?? lang);

  if (verbs.length === 0) {
    const why = rawVerbs.length > 0
      ? `<p>No verbs match the current Regularity filter.</p>
         <p class="conj-empty-hint">${rawVerbs.length} verb${rawVerbs.length === 1 ? '' : 's'} in the list — widen Regularity in the Tense &amp; Forms box, then hit Start Quiz again.</p>`
      : noFormsCount > 0
        ? `<p>No conjugation data for the verbs in this list.</p>
           <p class="conj-empty-hint">${noFormsCount} verb${noFormsCount === 1 ? '' : 's'} found, but none has a conjugation table yet. Run <code>npm run data:conjugations</code> to fetch them, then reload.</p>`
        : `<p>No verbs in the current word list.</p>
           <p class="conj-empty-hint">Make sure "Verbs" is checked in the class filter, then hit Start Quiz again.</p>`;
    container.innerHTML = `<div class="conj-empty">${why}</div>`;
    return;
  }

  // The union across every active language — matches the chip row
  // initConjControls() builds, so selectedTenses() below validates a ticked
  // chip against the same universe it was drawn from. Rendering a card still
  // narrows to *this verb's own* language's tenses — see buildCards().
  const tenseDefs = unionTenseDefs(primaryLang, extraLangs);

  const displayToggle = document.getElementById('conjDisplayToggle');
  const viewToggle    = document.getElementById('conjViewToggle');

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

  // Nothing to drill: every selected tense has a pronoun paradigm (not
  // gerund/participle), and Forms → None switched off every pronoun. One at a
  // Time / Random Table / Card Match already guard this exact case with the
  // same message (their own queue/rows/rounds end up empty); Grid and Full
  // Conjugation build one card per verb regardless — pronoun toggles only
  // hide rows via CSS — so without this they silently rendered a grid of
  // fully-disabled cards with nothing to type into, and one that could never
  // register as complete (qForms.total is 0, so the "every form answered"
  // check that ends the quiz never fires).
  if (!selectedTenses().some(isSingleForm) && activePronounIndices().size === 0) {
    container.innerHTML = `<div class="conj-empty">
      <p>No forms to drill for the current Tense &amp; Forms selection.</p>
      <p class="conj-empty-hint">Turn at least one pronoun back on in Forms, then hit Start Quiz again.</p>
    </div>`;
    return;
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
  getWordOrderLabels().forEach(([value, label]) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label; o.selected = value === verbOrder;
    orderSel.appendChild(o);
  });
  const orderCount = document.createElement('span');
  orderCount.className = 'conj-order-count';
  /**
   * Fills `orderCount` with the base "N verbs × T tenses = C cards" text plus
   * a regularity breakdown — how much of this quiz is the easy kind is worth
   * knowing before you start. The breakdown renders as colored pill badges
   * (one per bucket, zero-count buckets omitted) using the same three colors
   * the Regularity filter chips above use for 'active', rather than plain
   * text, so the two stay visually tied together. Stem-change is folded into
   * the "irregular" pill, same as the plain-text version this replaced —
   * it's still one of only three numbers reported, not four.
   */
  function renderSetSummary(): void {
    orderCount.innerHTML = '';
    const t = selectedTenses().length;
    const v = verbs.length;
    const base = document.createElement('span');
    base.className = 'conj-set-summary-base';
    base.textContent = t > 1
      ? `${v} verb${v === 1 ? '' : 's'} × ${t} tenses = ${v * t} cards`
      : `${v} verb${v === 1 ? '' : 's'}`;
    orderCount.appendChild(base);

    const tally = { regular: 0, ortho: 0, stem: 0, irregular: 0, unknown: 0 };
    verbs.forEach(vb => {
      const k = regularityOf(vb.linguistic?.conjugation_class ?? null).key;
      tally[k as keyof typeof tally]++;
    });
    const irregularish = tally.stem + tally.irregular;
    const known         = v - tally.unknown;
    if (known === 0) return;

    const pills = document.createElement('span');
    pills.className = 'conj-set-summary-pills';
    ([
      ['regular',   tally.regular,   'regular'],
      ['ortho',     tally.ortho,     'spelling'],
      ['irregular', irregularish,    'irregular'],
    ] as const).forEach(([reg, count, label]) => {
      if (count === 0) return;
      const pill = document.createElement('span');
      pill.className = 'conj-set-pill';
      pill.dataset.reg = reg;
      pill.textContent = `${count} ${label}`;
      pills.appendChild(pill);
    });
    orderCount.appendChild(pills);
  }
  renderSetSummary();
  orderRow.append(orderLabel, orderSel, orderCount);

  // Timer — stopwatch + Start/Pause + Reset, same markup/classes as Table
  // mode's #tableTimerGroup/.timer-btn (controls-bar.css) so it is styled
  // and behaves identically; lives in progressSection rather than orderRow
  // so it rides along in the sticky bar next to Give Up, the same place
  // Table keeps its own timer group.
  const stopwatchEl = document.createElement('span');
  stopwatchEl.className = 'quiz-stopwatch';
  stopwatchEl.title     = 'Time spent on this quiz';
  const stopwatch = createStopwatch(stopwatchEl);
  stopwatch.start();

  const timerGroup = document.createElement('div');
  timerGroup.className = 'timer-group';
  timerGroup.id        = 'conjTimerGroup';

  const timerToggle = document.createElement('button');
  timerToggle.type      = 'button';
  timerToggle.className = 'timer-btn';

  const timerReset = document.createElement('button');
  timerReset.type      = 'button';
  timerReset.className = 'timer-btn';
  timerReset.title     = 'Reset timer';
  timerReset.setAttribute('aria-label', 'Reset timer');
  timerReset.textContent = '↺';

  function syncTimerToggleIcon(): void {
    const running = stopwatch.isRunning();
    timerToggle.textContent = running ? '⏸' : '▶';
    timerToggle.title = running ? 'Pause timer' : 'Resume timer';
    timerToggle.setAttribute('aria-label', running ? 'Pause timer' : 'Resume timer');
  }
  syncTimerToggleIcon();

  timerToggle.addEventListener('click', () => {
    if (stopwatch.isRunning()) stopwatch.stop();
    else stopwatch.resume();
    syncTimerToggleIcon();
  });
  timerReset.addEventListener('click', () => stopwatch.reset());

  timerGroup.append(stopwatchEl, timerToggle, timerReset);

  // "Show timer" is one Settings toggle shared with Table mode — read it now
  // for this render's initial state, and again whenever it changes while a
  // quiz is on screen (setOnShowTimerChange supports more than one listener
  // precisely so Table's own registration isn't displaced by this one).
  function syncConjTimerVisibility(): void {
    const group = document.getElementById('conjTimerGroup');
    if (group) group.hidden = !Settings.getConjShowTimer();
  }
  syncConjTimerVisibility();
  if (!_timerVisibilityRegistered) {
    _timerVisibilityRegistered = true;
    setOnShowTimerChange(syncConjTimerVisibility);
  }

  const progressSection = document.createElement('div');
  progressSection.className = 'conj-progress-section';

  const progressBlock = document.createElement('div');
  progressBlock.className = 'conj-progress-block';

  // The two bars stack, and both sets of score pills sit on one row beneath
  // them. Keeping each group's pills directly under its own bar pushed the
  // Verbs bar a full pill-row away from the Forms bar it is meant to be read
  // against, and made the header block twice as tall as it needed to be.
  const barsWrap = document.createElement('div');
  barsWrap.className = 'conj-progress-bars';

  const pillsRow = document.createElement('div');
  pillsRow.className = 'conj-progress-pills';

  progressBlock.append(barsWrap, pillsRow);

  /**
   * One labelled progress group: heading, three-segment bar and a side stat,
   * plus a labelled cell of score pills on the shared row below.
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

    group.append(label, wrap);
    barsWrap.appendChild(group);

    // The pills lose their neighbouring bar, so they carry the group name.
    const cell = document.createElement('div');
    cell.className = 'conj-pills-cell';
    const cellLabel = document.createElement('span');
    cellLabel.className   = 'progress-group-label';
    cellLabel.textContent = labelText;
    cellLabel.title       = hint;

    const pills = document.createElement('div');
    pills.className = 'quiz-score';

    cell.append(cellLabel, pills);
    pillsRow.appendChild(cell);

    return { green, yellow, red, stat, pills };
  }

  // Full Quiz / This Page — which scope the bars below paint. The completion
  // check further down always uses the whole quiz regardless of this toggle;
  // it only controls what's displayed.
  let progressScope: 'quiz' | 'page' = 'quiz';

  const scopeToggle = document.createElement('div');
  scopeToggle.className = 'sort-order-toggle conj-progress-scope-toggle';
  const scopeQuizBtn = document.createElement('button');
  scopeQuizBtn.type        = 'button';
  scopeQuizBtn.className   = 'sort-order-btn active';
  scopeQuizBtn.textContent = 'Full Quiz';
  scopeQuizBtn.title       = 'Show progress across every page of this quiz';
  const scopePageBtn = document.createElement('button');
  scopePageBtn.type        = 'button';
  scopePageBtn.className   = 'sort-order-btn';
  scopePageBtn.textContent = 'This Page';
  scopePageBtn.title       = 'Show progress for only the page currently on screen';
  scopeToggle.append(scopeQuizBtn, scopePageBtn);
  scopeToggle.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    scopeToggle.querySelectorAll('.sort-order-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    progressScope = btn === scopePageBtn ? 'page' : 'quiz';
    updateProgress();
  });
  progressBlock.appendChild(scopeToggle);

  const formsBar = makeProgressGroup('Forms', 'Progress across every individual conjugation');
  const verbsBar = makeProgressGroup('Verbs', 'Progress across whole verbs — a verb counts once all its forms are done');

  const giveUpBtn = document.createElement('button');
  giveUpBtn.className   = 'conj-giveup-btn';
  giveUpBtn.textContent = 'Give Up';

  progressSection.append(progressBlock, timerGroup, giveUpBtn);

  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'conj-cards-grid';
  // How a deselected pronoun's cell is shown. On the grid rather than per row
  // because it is one decision for the whole quiz, and the pronoun toggles
  // re-run across every row often.
  applyConjDeselectedClass(cardsGrid, Settings.getConjDeselected());

  interface Counts { correct: number; revealed: number; missed: number; left: number; total: number }

  /**
   * Tally at both levels, from whatever's currently rendered in cardsGrid —
   * i.e. only the page on screen right now. A verb is scored by its weakest
   * form: all correct → correct; otherwise fully answered with a missed
   * form → missed, with only peeks → revealed; anything still blank → left.
   *
   * Note this counts one "verb" unit per `.conj-card` — one per verb per
   * selected tense — not per distinct verb, so a verb drilled across several
   * tenses contributes more than one unit here. tallyQuiz() below counts
   * differently (one unit per actual verb); this scope's own numbers are
   * kept as they already were rather than changed alongside it.
   */
  function tallyPage(): { forms: Counts; verbs: Counts } {
    const forms: Counts = { correct: 0, revealed: 0, missed: 0, left: 0, total: 0 };
    const verbs: Counts = { correct: 0, revealed: 0, missed: 0, left: 0, total: 0 };

    cardsGrid.querySelectorAll('.conj-card').forEach(card => {
      let cardTotal = 0, cardCorrect = 0, cardRevealed = 0, cardMissed = 0;

      card.querySelectorAll(VISIBLE_ROW).forEach(row => {
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

  /**
   * Rows a single (tense, verb-language) card produces once pronoun toggles
   * are applied — the same rule buildCard/VISIBLE_ROW ends up with, computed
   * without building a card. A tense's row layout depends only on the tense
   * and the verb's language (isSingleForm, hiddenPronounSlots), never on the
   * individual verb's own conjugation data.
   */
  function formsPerTenseCard(tenseKey: string, verbLang: string, activeIdx: ReadonlySet<number>): number {
    if (isSingleForm(tenseKey)) return 1;
    const hidden   = hiddenPronounSlots(tenseKey);
    const pronouns = PRONOUNS[verbLang] ?? PRONOUNS.spanish;
    let n = 0;
    for (let i = 0; i < pronouns.length; i++) if (activeIdx.has(i) && !hidden.has(i)) n++;
    return n;
  }

  /**
   * Exact whole-quiz forms total, without rendering every page.
   *
   * Forms-per-verb is constant within one language — buildCards' own
   * tensesForVerb filter depends only on the verb's language, never on its
   * data — so this is one pass per distinct language among `verbs`, not per
   * verb-tense pair.
   */
  function quizFormsTotal(tenses: string[], activeIdx: ReadonlySet<number>): number {
    const perLang = new Map<string, number>();
    let total = 0;
    for (const verb of verbs) {
      const verbLang = verb.language ?? lang;
      let forms = perLang.get(verbLang);
      if (forms === undefined) {
        const verbTenseDefs = TENSE_DEFS[verbLang] ?? TENSE_DEFS.spanish;
        const tensesForVerb = tenses.filter(t => verbTenseDefs.some(d => d.key === t));
        forms = tensesForVerb.reduce((sum, t) => sum + formsPerTenseCard(t, verbLang, activeIdx), 0);
        perLang.set(verbLang, forms);
      }
      total += forms;
    }
    return total;
  }

  /**
   * Whole-quiz tally — every page, not just the one on screen.
   *
   * Forms: a live DOM pass over whatever's on screen right now, plus
   * `banked`'s per-verb totals for everything scored and left behind on an
   * earlier page — skipping any banked entry for a verb currently in
   * cardsGrid, so a revisited page's live state isn't double-counted
   * against its own stale banked copy.
   *
   * Verbs: one unit per actual verb (merging every tense-card a verb has —
   * the same grouping `banked` already uses for session recording), unlike
   * tallyPage()'s one-unit-per-card, which over-counts a verb once more
   * than one tense is selected.
   */
  function tallyQuiz(): { forms: Counts; verbs: Counts } {
    const tenses    = selectedTenses();
    const activeIdx = activePronounIndices();
    const forms: Counts      = { correct: 0, revealed: 0, missed: 0, left: 0, total: quizFormsTotal(tenses, activeIdx) };
    const verbCounts: Counts = { correct: 0, revealed: 0, missed: 0, left: 0, total: verbs.length };

    interface FormAcc { total: number; correct: number; revealed: number; missed: number; }
    function classify(acc: FormAcc): 'correct' | 'revealed' | 'missed' | 'left' {
      if (acc.correct + acc.revealed + acc.missed === 0) return 'left';
      if (acc.correct === acc.total)                     return 'correct';
      if (acc.missed > 0)                                return 'missed';
      return 'revealed';
    }
    function fold(acc: FormAcc): void {
      forms.correct  += acc.correct;
      forms.revealed += acc.revealed;
      forms.missed   += acc.missed;
      const outcome = classify(acc);
      if (outcome !== 'left') verbCounts[outcome]++;
    }

    const onScreen = new Set<string>();
    const live = new Map<string, FormAcc>();
    cardsGrid.querySelectorAll<HTMLElement>('.conj-card').forEach(card => {
      const word = card.dataset.verb;
      if (!word) return;
      const verbLang = card.dataset.verbLang ?? lang;
      const key = verbKey(word, verbLang);
      onScreen.add(key);
      const acc = live.get(key) ?? { total: 0, correct: 0, revealed: 0, missed: 0 };
      card.querySelectorAll(VISIBLE_ROW).forEach(row => {
        const inp = row.querySelector<HTMLInputElement>('.conj-drill-input');
        if (!inp) return;
        acc.total++;
        if (inp.classList.contains('correct'))       acc.correct++;
        else if (inp.classList.contains('revealed')) acc.revealed++;
        else if (inp.classList.contains('missed'))   acc.missed++;
      });
      live.set(key, acc);
    });

    live.forEach(fold);
    banked.forEach((acc, key) => { if (!onScreen.has(key)) fold(acc); });

    forms.left      = Math.max(0, forms.total      - forms.correct      - forms.revealed      - forms.missed);
    verbCounts.left = Math.max(0, verbCounts.total  - verbCounts.correct - verbCounts.revealed  - verbCounts.missed);

    return { forms, verbs: verbCounts };
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
    // The completion check always uses the whole quiz, regardless of which
    // scope is on screen — ending the quiz is a global event, not something
    // that should fire early just because "This Page" happens to be fully
    // answered. The display itself follows progressScope.
    const quizTally = tallyQuiz();
    const { forms, verbs } = progressScope === 'page' ? tallyPage() : quizTally;

    paint(formsBar, forms, `${forms.correct + forms.revealed + forms.missed}/${forms.total} Answered`);
    paint(verbsBar, verbs, `${verbs.correct}/${verbs.total} Fully Conjugated`);

    const { forms: qForms, verbs: qVerbs } = quizTally;

    // left, not correct === total: a session where every form has been
    // answered — correctly, revealed, or missed — is done, the same rule
    // table-controls.ts's isQuizComplete() uses. Requiring every form to be
    // *correct* meant revealing even one form left the quiz open forever:
    // recordConjSession() never ran, so the stopwatch kept ticking and the
    // session was never saved.
    if (qForms.total > 0 && qForms.left === 0) {
      recordConjSession();
      showConjSummary(qVerbs.correct, qVerbs.total, qForms.correct, qForms.total);
    }
  }

  // ── Full Conjugation ───────────────────────────────────────────────────────
  //
  // One verb, every selected tense side by side, so the patterns that run
  // *across* tenses are visible: the future and conditional share a stem, the
  // imperfect is regular for all but three verbs in Spanish. A grid of cards
  // sorted by verb can never show that, because the two tenses being compared
  // are in different rows.
  //
  // Implemented as the same cards in a scrolling row rather than as a new
  // widget. Answer checking, scoring, reveal, the pronoun toggles and the
  // deselected-pronoun modes are all card behaviour, and a second
  // implementation of them would be a second set of bugs.

  let viewMode: 'grid' | 'full' =
    readString('vq_conj_view') === 'full' ? 'full' : 'grid';

  /**
   * Both Grid and Full Conjugation are paged, not rendered all at once.
   *
   * Full used to show one verb with Prev/Next, which meant a click between
   * every verb and no way to see how far through you were. Table mode had
   * already answered this: a page of them, scrolled, with a pager. The reason
   * to page at all rather than render every verb is that a verb here is one
   * card per selected tense — with twelve tenses available and no cap, a
   * merged multi-language session's few hundred verbs turns into several
   * thousand cards, each with up to six inputs, which is slow enough to build
   * and lay out that "Start Quiz" visibly hangs. Grid used to render
   * everything unpaged (its cards flow into columns rather than stacking per
   * verb, so there was no per-page "block" to hide the rest behind) — same
   * pager, same page size, shared below, now applies to both.
   */
  const CONJ_PAGE_SIZES = [5, 10, 25, 50] as const;

  // Named for Full Conjugation, which is where paging started — shared with
  // Grid now, which has no per-verb "page" of its own.
  let fullPage = 0;
  // Settings.getConjPageSize() is only the *starting* default (10 out of the
  // box) — once vq_conj_page_size holds a value the quiz's own Per Page
  // selector wrote, that wins, same as before this was configurable.
  let pageSize = (() => {
    const n = Number(readString('vq_conj_page_size'));
    return (CONJ_PAGE_SIZES as readonly number[]).includes(n) ? n : Settings.getConjPageSize();
  })();

  const pageCount = (): number => Math.max(1, Math.ceil(verbs.length / pageSize));
  const pageStart = (): number => fullPage * pageSize;
  const pageVerbs = (): Word[] => verbs.slice(pageStart(), pageStart() + pageSize);

  // ── Pager ──
  const fullHeader = document.createElement('div');
  fullHeader.className = 'conj-full-header';

  const fullPrev = document.createElement('button');
  fullPrev.type = 'button';
  fullPrev.className = 'conj-full-nav';
  fullPrev.textContent = '◀ Prev';

  const fullNext = document.createElement('button');
  fullNext.type = 'button';
  fullNext.className = 'conj-full-nav';
  fullNext.textContent = 'Next ▶';

  // Two labels, one shown at a time by CSS. "Verbs 1–10 of 249 · Page 1 of 25"
  // does not fit on a phone beside two buttons and a select, and truncating it
  // loses the numbers that are the whole point of a pager.
  const fullCount = document.createElement('span');
  fullCount.className = 'conj-full-count';
  const countLong = document.createElement('span');
  countLong.className = 'conj-full-count--long';
  const countShort = document.createElement('span');
  countShort.className = 'conj-full-count--short';
  fullCount.append(countLong, countShort);

  const sizeLabel = document.createElement('label');
  sizeLabel.className = 'conj-full-size-label';
  sizeLabel.textContent = 'Per page';

  const sizeSel = document.createElement('select');
  sizeSel.className = 'conj-order-select conj-full-size';
  sizeSel.title = 'Verbs shown at once. Each verb is one card per selected tense.';
  CONJ_PAGE_SIZES.forEach(n => {
    const o = document.createElement('option');
    o.value = String(n); o.textContent = String(n); o.selected = n === pageSize;
    sizeSel.appendChild(o);
  });
  sizeLabel.appendChild(sizeSel);

  // Collapse/expand every verb block on the current page at once — only
  // meaningful in Full Conjugation, which is the only view with per-verb
  // blocks to fold. Toggling never touches the cards themselves (just their
  // container's visibility), so it cannot lose an answer in progress the way
  // a rebuild would.
  const collapseAllBtn = document.createElement('button');
  collapseAllBtn.type      = 'button';
  collapseAllBtn.className = 'conj-full-nav conj-collapse-all-btn';
  collapseAllBtn.textContent = 'Collapse all';
  collapseAllBtn.addEventListener('click', () => {
    const blocks = Array.from(cardsGrid.querySelectorAll<HTMLElement>('.conj-verb-block'));
    if (blocks.length === 0) return;
    const collapse = blocks.some(b => !b.classList.contains('conj-verb-block--collapsed'));
    blocks.forEach(b => setBlockCollapsed(b, collapse));
    collapseAllBtn.textContent = collapse ? 'Expand all' : 'Collapse all';
  });

  fullHeader.append(fullPrev, fullCount, sizeLabel, collapseAllBtn, fullNext);

  function syncFullHeader(): void {
    // Shown for both views now — only the layout (stacked blocks vs. cards
    // flowing into columns) differs between them.
    cardsGrid.classList.toggle('conj-cards-grid--full', viewMode === 'full');
    const from = verbs.length === 0 ? 0 : pageStart() + 1;
    const to   = Math.min(pageStart() + pageSize, verbs.length);
    countLong.textContent =
      `Verbs ${from}–${to} of ${verbs.length}  ·  Page ${fullPage + 1} of ${pageCount()}`;
    countShort.textContent = `${from}–${to} / ${verbs.length}`;
    fullPrev.disabled = fullPage === 0;
    fullNext.disabled = fullPage >= pageCount() - 1;
    // Grid has no verb blocks to fold.
    collapseAllBtn.hidden = viewMode !== 'full';
    collapseAllBtn.textContent = 'Collapse all';
  }

  /**
   * Turn to another page.
   *
   * The page being left is banked first. Cards hold their answers in their
   * inputs, so rebuilding for the next page destroys them — without banking,
   * working through several pages would record only the last.
   */
  function gotoPage(index: number): void {
    const target = Math.max(0, Math.min(index, pageCount() - 1));
    if (target === fullPage) return;
    bankVisibleVerbs();
    fullPage = target;
    buildCards();
    applyAllPronounToggles(cardsGrid);
    syncDeselectedCells();
    updateProgress();
    cardsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  fullPrev.addEventListener('click', () => gotoPage(fullPage - 1));
  fullNext.addEventListener('click', () => gotoPage(fullPage + 1));

  sizeSel.addEventListener('change', () => {
    bankVisibleVerbs();
    pageSize = Number(sizeSel.value) || Settings.getConjPageSize();
    writeString('vq_conj_page_size', String(pageSize));
    // Stay near where you were rather than jumping to the top: the verb that
    // started the old page is the one you were working on.
    fullPage = Math.floor(pageStart() / pageSize);
    buildCards();
    applyAllPronounToggles(cardsGrid);
    syncDeselectedCells();
    updateProgress();
  });

  // Which verbs are folded shut in Full Conjugation, keyed by verbKey() so a
  // collapse choice survives paging back and forth (a page rebuild loses the
  // DOM node, not the decision to keep it closed).
  const collapsedVerbs = new Set<string>();

  /** Apply (or clear) the collapsed look on one verb block, keeping its
   *  toggle button's glyph/label/aria state in sync — shared by the per-verb
   *  button and "Collapse/Expand all". */
  function setBlockCollapsed(block: HTMLElement, collapsed: boolean): void {
    block.classList.toggle('conj-verb-block--collapsed', collapsed);
    const row = block.querySelector<HTMLElement>('.conj-verb-row');
    if (row) row.hidden = collapsed;
    const btn = block.querySelector<HTMLButtonElement>('.conj-verb-collapse-btn');
    if (btn) {
      btn.textContent = collapsed ? '▸' : '▾';
      btn.title       = collapsed ? 'Expand this verb' : 'Collapse this verb';
      btn.setAttribute('aria-expanded', String(!collapsed));
    }
    const key = block.dataset.verbKey;
    if (!key) return;
    if (collapsed) collapsedVerbs.add(key); else collapsedVerbs.delete(key);
  }

  /**
   * One verb's block in the paged view: a header, then its tense cards.
   *
   * The header is what the old single-verb view had at the top of the screen —
   * name, gloss and the add-to-list star — repeated per verb now that several
   * are on screen. The cards themselves still hide their own copy of it.
   */
  function buildVerbBlock(verb: Word): { el: HTMLElement; row: HTMLElement } {
    const verbLang = verb.language ?? lang;
    const el = document.createElement('section');
    el.className = 'conj-verb-block';
    el.dataset.verbBlock = verb.word;
    el.dataset.verbKey   = verbKey(verb.word, verbLang);

    const head = document.createElement('div');
    head.className = 'conj-verb-block-head';

    const collapseBtn = document.createElement('button');
    collapseBtn.type      = 'button';
    collapseBtn.className = 'known-btn conj-verb-collapse-btn';
    collapseBtn.tabIndex   = -1;
    collapseBtn.addEventListener('click', e => {
      e.stopPropagation();
      setBlockCollapsed(el, !el.classList.contains('conj-verb-block--collapsed'));
    });

    const word = document.createElement('span');
    word.className = 'conj-full-word';
    word.textContent = verb.word;

    const star = document.createElement('button');
    star.type = 'button';
    star.tabIndex = -1;
    star.textContent = '★';

    function syncStar(): void {
      const lists = getWordLists(verbLang, verb.word);
      star.className = 'known-btn conj-full-star'
        + (lists.length > 0 ? ' known-btn--active' : '');
      star.title = lists.length > 0 ? 'In lists: ' + lists.join(', ') : 'Add to a list';
    }
    syncStar();
    star.addEventListener('click', e => {
      e.stopPropagation();
      openListPicker({ anchorEl: star, lang: verbLang, word: verb.word, onClose: syncStar });
    });

    const gloss = document.createElement('span');
    gloss.className = 'conj-full-gloss';
    gloss.textContent = buildGlossDisplay(verb);

    const rank = document.createElement('span');
    rank.className = 'conj-full-rank';
    if (verb.rank != null) rank.textContent = '#' + verb.rank;
    else rank.hidden = true;

    // Regularity (Regular/Irregular/Stem-change/Spelling) is a per-verb
    // classification, not per-tense — verb-rules.ts generates every tense
    // from one conjugation_class — so it belongs here, once, rather than
    // repeated identically on every tense card below (buildCard hides its
    // own copy when hideVerbName is set).
    const reg = document.createElement('span');
    const cls = verb.linguistic?.conjugation_class ?? null;
    const kind = regularityOf(cls);
    reg.className = `conj-card-reg conj-card-reg--${kind.key}`;
    reg.textContent = kind.label;
    reg.title = (REGULARITY_HELP[kind.key] ?? '') + (cls ? `\n\nconjugation class: ${cls}` : '');
    if (!cls) reg.hidden = true;

    head.append(collapseBtn, word, star, gloss, reg, rank);
    // Only present in a merged multi-language session — a single-language
    // one never has `.language` set, so this never appears there.
    if (verb.language) head.appendChild(createFlagImg(Settings.getLangFlag(verb.language), languageInfo(verb.language).label));

    // The whole bar toggles collapse, not just the arrow — word/gloss/
    // regularity/rank are all plain text with nothing else to click there.
    // The star already stops propagation (it opens the list picker instead),
    // and collapseBtn's own handler stops it too so this doesn't double-fire
    // and cancel itself out on the button's own click.
    head.classList.add('conj-verb-block-head--clickable');
    head.addEventListener('click', () => {
      setBlockCollapsed(el, !el.classList.contains('conj-verb-block--collapsed'));
    });

    const row = document.createElement('div');
    row.className = 'conj-verb-row';

    el.append(head, row);
    setBlockCollapsed(el, collapsedVerbs.has(el.dataset.verbKey ?? ''));
    return { el, row };
  }

  // The active class is kept in step by app.ts, which also owns the stored
  // value; this render just reads it.

  let cardUpdaters: CardController[] = [];

  /** (Re)build every card from `verbs`, in the current order. */
  /** Tenses the cards currently on screen were built from. */
  let builtTenses: string[] = [];
  /** Regularity buckets the current verb set was filtered to. */
  const builtRegs: string[] = [...regs];

  function buildCards(): void {
    cardsGrid.innerHTML = '';
    cardUpdaters = [];
    const tenses = selectedTenses();
    builtTenses = [...tenses];

    // Grid shows a page of verbs, one card per verb per tense, flowing into
    // columns. Full Conjugation shows the same page, each verb as its own
    // block with its tenses in a row instead. Same cards, same page, either
    // way — see pageVerbs() above for why both are paged at all.
    const shown = pageVerbs();

    shown.forEach(verb => {
      const verbLang = verb.language ?? lang;
      // A globally-ticked tense this verb's own language doesn't have (e.g.
      // 'imperfect' ticked while German is merged in, which only has three
      // tenses) contributes no card for it — the alternative is a card with
      // every field blank and nothing to check it against.
      const verbTenseDefs = TENSE_DEFS[verbLang] ?? TENSE_DEFS.spanish;
      const tensesForVerb = tenses.filter(t => verbTenseDefs.some(d => d.key === t));
      if (tensesForVerb.length === 0) return;

      const block = viewMode === 'full' ? buildVerbBlock(verb) : null;

      tensesForVerb.forEach(tenseKey => {
        const updater = buildCard({
          verb, lang: verbLang, pronouns: PRONOUNS[verbLang] ?? PRONOUNS.spanish,
          tenseKey,
          tenseNativeLabel: verbTenseDefs.find(d => d.key === tenseKey)?.label ?? tenseKey,
          getDisplayMode, onProgress: updateProgress,
          hideVerbName: viewMode === 'full',
        });
        // Needed to attribute a card's outcome back to its verb when the
        // session is recorded. Several cards can share a verb now, so the
        // recorder scores a verb correct only if every one of its cards is.
        // verbLang alongside the bare word: two languages can share a
        // spelling once merged (see verbKey()), so the word alone isn't a
        // safe key any more.
        updater.card.dataset.verb     = verb.word;
        updater.card.dataset.verbLang = verbLang;
        updater.card.dataset.tense    = tenseKey;

        // A verb coming back on screen (paging back, switching Grid ↔ Full,
        // changing page size) gets a brand new, blank card — restore
        // whatever bankVisibleVerbs() scored for this exact tense last time
        // it was banked, or the rebuild would silently throw away answered
        // forms the learner already got right.
        const bankedSlots = banked.get(verbKey(verb.word, verbLang))?.slots;
        if (bankedSlots) {
          const forThisTense = new Map<number | 'single', 'correct' | 'revealed' | 'missed'>();
          bankedSlots.forEach((state, slotKey) => {
            const sep = slotKey.lastIndexOf(':');
            if (slotKey.slice(0, sep) !== tenseKey) return;
            const slot = slotKey.slice(sep + 1);
            forThisTense.set(slot === 'single' ? 'single' : Number(slot), state);
          });
          if (forThisTense.size > 0) updater.restoreBanked(forThisTense);
        }

        (block ? block.row : cardsGrid).appendChild(updater.card);
        cardUpdaters.push(updater);
      });

      if (block) cardsGrid.appendChild(block.el);
    });

    syncFullHeader();
  }

  let conjRecorded = false;

  /**
   * Outcomes for verbs no longer on screen.
   *
   * Full Conjugation rebuilds the cards for each verb, and a card's answers
   * live in its inputs, so the evidence is destroyed on every navigation. Each
   * verb is scored as it is left instead.
   */
  // Keyed by verbKey() rather than bare word — two languages can share a
  // spelling once merged, so recall-mode.ts/table-mode.ts's word-collision
  // fix applies here too.
  // total/correct/revealed/missed are form-level counts, merged across every
  // card the verb has (one per selected tense) — the granularity tallyQuiz()
  // and recordConjSession need to say whether the verb as a whole is done,
  // not just one of its tenses.
  interface BankedVerb {
    word: string; language: string; total: number; correct: number; revealed: number; missed: number;
    /**
     * Per-form outcome, keyed `${tenseKey}:${slot}` (slot is a pronoun index
     * or 'single') — lets buildCards() restore exactly what a verb's fresh,
     * blank card should show when it comes back on screen, rather than only
     * feeding the aggregate counts above into the whole-quiz tally while the
     * rebuilt inputs themselves stay empty.
     */
    slots: Map<string, 'correct' | 'revealed' | 'missed'>;
  }
  const banked = new Map<string, BankedVerb>();

  /**
   * Score every verb currently on screen and remember the results.
   *
   * Called when the page is about to be rebuilt: turning a page, changing the
   * page size, or leaving the view. Each verb is scored across all of its
   * cards, so knowing the present tense does not mask not knowing the
   * subjunctive — the same rule recordConjSession applies.
   *
   * A verb that was not touched at all is not banked either way: scrolling past
   * something is not the same as getting it wrong, and recording it as missed
   * would poison the "words I keep missing" order.
   */
  function bankVisibleVerbs(): void {
    // Both views are paged now (see pageVerbs() above), so both need whatever
    // page is about to be torn down scored and remembered before it goes —
    // this used to be a no-op for Grid, back when Grid rendered every verb at
    // once and had nothing left off-screen to lose.
    interface Acc {
      word: string; language: string; total: number; correct: number; revealed: number; missed: number; answered: number;
      slots: Map<string, 'correct' | 'revealed' | 'missed'>;
    }
    const perVerb = new Map<string, Acc>();

    cardsGrid.querySelectorAll<HTMLElement>('.conj-card').forEach(card => {
      const word = card.dataset.verb;
      if (!word) return;
      const verbLang  = card.dataset.verbLang ?? lang;
      const cardTense = card.dataset.tense ?? '';
      const key = verbKey(word, verbLang);
      const acc = perVerb.get(key) ?? { word, language: verbLang, total: 0, correct: 0, revealed: 0, missed: 0, answered: 0, slots: new Map() };
      card.querySelectorAll<HTMLElement>(VISIBLE_ROW).forEach(row => {
        const inp = row.querySelector<HTMLInputElement>('.conj-drill-input');
        if (!inp) return;
        acc.total++;
        const slotKey = `${cardTense}:${row.dataset.pi}`;
        if (inp.classList.contains('correct'))       { acc.correct++;  acc.answered++; acc.slots.set(slotKey, 'correct'); }
        else if (inp.classList.contains('revealed')) { acc.revealed++; acc.answered++; acc.slots.set(slotKey, 'revealed'); }
        else if (inp.classList.contains('missed'))   { acc.missed++;   acc.answered++; acc.slots.set(slotKey, 'missed'); }
      });
      perVerb.set(key, acc);
    });

    perVerb.forEach((acc, key) => {
      if (acc.total === 0 || acc.answered === 0) return;
      banked.set(key, {
        word: acc.word, language: acc.language,
        total: acc.total, correct: acc.correct, revealed: acc.revealed, missed: acc.missed,
        slots: acc.slots,
      });
    });
  }

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
    interface Acc { word: string; language: string; cards: number; clean: number; }
    const perVerb = new Map<string, Acc>();
    cardsGrid.querySelectorAll<HTMLElement>('.conj-card').forEach(card => {
      const word = card.dataset.verb;
      if (!word) return;
      const verbLang = card.dataset.verbLang ?? lang;
      const rows = card.querySelectorAll(VISIBLE_ROW);
      let total = 0, correct = 0;
      rows.forEach(row => {
        const inp = row.querySelector<HTMLInputElement>('.conj-drill-input');
        if (!inp) return;
        total++;
        if (inp.classList.contains('correct')) correct++;
      });
      if (total === 0) return;
      const key = verbKey(word, verbLang);
      const acc = perVerb.get(key) ?? { word, language: verbLang, cards: 0, clean: 0 };
      acc.cards++;
      if (correct === total) acc.clean++;
      perVerb.set(key, acc);
    });

    // Grouped by each verb's actual language (falling back to the render's
    // primary `lang` for an ordinary single-language session) rather than one
    // flat list — a merged Conjugation session must still write history/
    // misses into each verb's real language, exactly as table-controls.ts's
    // recordMastery() does for Table mode's own Compare feature.
    interface Bucket { correct: string[]; missed: string[]; }
    const byLang = new Map<string, Bucket>();
    function bucketFor(wl: string): Bucket {
      let b = byLang.get(wl);
      if (!b) { b = { correct: [], missed: [] }; byLang.set(wl, b); }
      return b;
    }
    perVerb.forEach(acc => {
      bucketFor(acc.language)[acc.clean === acc.cards ? 'correct' : 'missed'].push(acc.word);
    });

    // Verbs already navigated past in Full Conjugation. Their cards are long
    // gone — rebuilt over for the next verb — so their outcome was banked at
    // the moment they were left. Live-page results (above) win over a stale
    // banked copy of the same verb — same precedence as before this was one
    // merged map instead of two.
    banked.forEach(({ word, language, total, correct }) => {
      const bucket = bucketFor(language);
      if (correct === total) { if (!bucket.missed.includes(word))  bucket.correct.push(word); }
      else                   { if (!bucket.correct.includes(word)) bucket.missed.push(word); }
    });

    stopwatch.stop();
    const seconds = stopwatch.elapsedSeconds();
    const langs = [...byLang.entries()]
      .filter(([, b]) => b.correct.length > 0 || b.missed.length > 0)
      .map(([wl]) => wl);
    for (const [wl, bucket] of byLang) {
      if (bucket.correct.length === 0 && bucket.missed.length === 0) continue;
      recordOutcome(wl, bucket.missed, bucket.correct);
      saveSession(wl, {
        at: new Date().toISOString(),
        mode: 'conjugation',
        total: bucket.correct.length + bucket.missed.length,
        correct: bucket.correct.length,
        unassisted: bucket.correct.length,
        hints: 0,
        revealed: bucket.missed.length,
        seconds,
        lang: wl,
        langs: langs.length > 1 ? langs : undefined,
      });
    }
  }
  buildCards();
  updateTenseSummary();

  orderSel.addEventListener('change', () => {
    verbOrder = orderSel.value as WordOrder;
    writeString('vq_conj_order', verbOrder);
    verbs = orderWords(allVerbs, verbOrder, w => w.language ?? lang);
    // Answers live in the DOM here rather than a state map, so re-ordering
    // restarts the cards. Warn rather than silently discarding work.
    const answered = cardUpdaters.some(u => u.card.querySelector('input:disabled'));
    if (answered && !window.confirm('Re-ordering rebuilds the cards and clears answers so far. Continue?')) {
      orderSel.value = verbOrder = (readString('vq_conj_order') as WordOrder) ?? 'rank';
      return;
    }
    // Re-ordering makes the old position meaningless — page 3 holds different
    // verbs now — so Full Conjugation restarts at the top of the new order.
    bankVisibleVerbs();
    fullPage = 0;
    buildCards();
    applyAllPronounToggles(cardsGrid);
    syncDeselectedCells();
    syncPronounRowVisibility();
    updateProgress();
  });

  // Order, progress/timer/Give Up, and the pager all ride together in one
  // sticky card — previously progressSection and fullHeader were each
  // independently `position: sticky; top: 0`, which (once both were pinned
  // at the same scroll position) fought over the same spot instead of
  // stacking. orderRow used to just scroll away, losing the verb-order
  // control and the "N verbs · regular/spelling/irregular" summary the
  // moment you scrolled a card grid taller than one screen.
  const stickyBar = document.createElement('div');
  stickyBar.className = 'conj-sticky-bar';
  stickyBar.append(orderRow, progressSection, fullHeader);

  container.append(stickyBar, cardsGrid);

  /** Refresh what sits in the cells of deselected pronouns, on every card. */
  function syncDeselectedCells(): void {
    cardUpdaters.forEach(u => u.syncDeselected());
  }

  // Unconditional: the pronoun toggles and the single-form tenses own separate
  // classes now (see VISIBLE_ROW), so this can no longer un-hide the pronoun
  // rows of a gerund or participle card.
  applyAllPronounToggles(cardsGrid);
  syncDeselectedCells();
  syncPronounRowVisibility();

  // Toggling a pronoun re-runs the toggles and then this callback, which is
  // where 'answer' mode gets its answers filled in or cleared again.
  setProgressCallback(() => { syncDeselectedCells(); updateProgress(); });
  setOnConjDeselectedChange(syncDeselectedCells);
  updateProgress();

  giveUpBtn.addEventListener('click', () => {
    cardUpdaters.forEach(u => u.revealAnswers('missed'));
    bankVisibleVerbs();

    // Give Up ends the whole quiz, not just the page on screen. Two kinds of
    // gap need covering, for every verb not currently visible:
    //   - never visited at all (nothing banked) — counts fully missed.
    //   - visited earlier but left with some forms still blank — bankVisibleVerbs()
    //     banks whatever was touched at the moment a page is left, but a verb
    //     answered halfway (say, present tense done, subjunctive still blank)
    //     stays banked at that partial total forever otherwise, silently
    //     leaving its remaining forms out of "150/150" instead of counting
    //     them as missed the way this same verb's blanks would be if it were
    //     still the page on screen.
    // Both use the same exact per-language forms count quizFormsTotal() relies
    // on, rather than building cards for pages that were never opened.
    const tenses    = selectedTenses();
    const activeIdx = activePronounIndices();
    const onScreen  = new Set(
      Array.from(cardsGrid.querySelectorAll<HTMLElement>('.conj-card'))
        .map(card => card.dataset.verb ? verbKey(card.dataset.verb, card.dataset.verbLang ?? lang) : null)
        .filter((k): k is string => k !== null),
    );
    verbs.forEach(verb => {
      const verbLang = verb.language ?? lang;
      const key = verbKey(verb.word, verbLang);
      if (onScreen.has(key)) return;
      const verbTenseDefs = TENSE_DEFS[verbLang] ?? TENSE_DEFS.spanish;
      const tensesForVerb = tenses.filter(t => verbTenseDefs.some(d => d.key === t));
      const total = tensesForVerb.reduce((sum, t) => sum + formsPerTenseCard(t, verbLang, activeIdx), 0);
      if (total === 0) return;
      const existing  = banked.get(key);
      const soFar     = existing ? existing.correct + existing.revealed + existing.missed : 0;
      const remaining = total - soFar;
      if (remaining <= 0) return;
      banked.set(key, {
        word: verb.word, language: verbLang, total,
        correct:  existing?.correct  ?? 0,
        revealed: existing?.revealed ?? 0,
        missed:   (existing?.missed  ?? 0) + remaining,
        // Give Up ends the quiz — nothing rebuilds a card after this, so
        // there is no rebuilt-card restore to feed; carry over whatever slot
        // detail an earlier partial visit already recorded rather than
        // discarding it.
        slots: existing?.slots ?? new Map(),
      });
    });

    giveUpBtn.disabled = true;
    updateProgress();
    // Show a summary when giving up (progress may not be 100%)
    const { forms, verbs: quizVerbs } = tallyQuiz();
    showConjSummary(quizVerbs.correct, quizVerbs.total, forms.correct, forms.total);
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

    // Regularity is only worth naming when it is actually narrowing things.
    const nowRegs  = activeRegularities();
    const regNote  = nowRegs.length >= 4 ? '' : ` · ${nowRegs.length} of 4 kinds`;

    const differs = pending
      && (!sameSet(selectedTenses(), builtTenses) || !sameSet(nowRegs, builtRegs));
    el.textContent = differs
      ? `${shown}${regNote} — press Start Quiz to apply`
      : shown + regNote;
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

  const handleViewClick = (e: Event): void => {
    const btn = (e.target as Element).closest<HTMLElement>('.conj-toggle-btn');
    if (!btn?.dataset.view || !viewToggle?.contains(btn)) return;
    const clicked = btn.dataset.view;
    // Grid and Full share this module's own live rebuild below. One at a
    // Time / Random Table / Card Match are separate renderers only reached
    // through Start Quiz (see start-handler.ts) — nothing here to rebuild,
    // and treating an unrecognized value as "grid" used to yank the screen
    // back to Grid the moment one of those was clicked while Full was up.
    if (clicked !== 'grid' && clicked !== 'full') return;
    const next = clicked;
    if (next === viewMode) return;

    // Leaving the current view banks the verbs on screen; the cards are about
    // to be rebuilt and their answers would go with them. Both views share
    // the same page cursor now, so this matters switching either direction.
    bankVisibleVerbs();

    // The stored value and the active class belong to the handler in app.ts,
    // which is bound whether or not a quiz is running. This one only rebuilds.
    viewMode = next;

    // Land on the page holding the first verb not already banked, so
    // switching views mid-session picks up roughly where the other one left
    // off rather than sending you back to the start.
    const at = verbs.findIndex(v => {
      const key = verbKey(v.word, v.language ?? lang);
      return !banked.has(key);
    });
    fullPage = at === -1 ? 0 : Math.floor(at / pageSize);

    buildCards();
    applyAllPronounToggles(cardsGrid);
    syncDeselectedCells();
    updateProgress();
  };

  // ── Verb-to-verb navigation ────────────────────────────────────────────────
  // Tab walks the forms within a verb; Ctrl/Cmd + ↓ or ↑ jumps whole verbs
  // (ser → estar → haber), landing on the first form still to be filled.
  const handleCardNav = (e: KeyboardEvent): void => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;

    // No special case for Full Conjugation any more. It used to hold a single
    // verb, so stepping between cards would have cycled that verb's tenses for
    // ever; a page holds many verbs, so walking the cards walks the verbs too.
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
      next.querySelector<HTMLInputElement>(`${VISIBLE_ROW} .conj-drill-input:not(:disabled)`)
      ?? next.querySelector<HTMLInputElement>(`${VISIBLE_ROW} .conj-drill-input`);
    target?.focus();
    next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const tenseChips = document.getElementById('conjTenseChips');
  const regChips   = document.getElementById('conjRegChips');
  // Chips, All and None all change the selection, so listen on the
  // container and on the buttons that sit outside it. The regularity chips
  // change the verb set rather than the tenses, but they are applied at the
  // same moment — on Start Quiz — so they share the handler.
  tenseChips?.addEventListener('click', handleTenseChange);
  regChips?.addEventListener('click', handleTenseChange);
  document.getElementById('conjTensesAll')?.addEventListener('click', handleTenseChange);
  document.getElementById('conjTensesNone')?.addEventListener('click', handleTenseChange);
  document.getElementById('conjRegAll')?.addEventListener('click', handleTenseChange);
  document.getElementById('conjRegNone')?.addEventListener('click', handleTenseChange);
  displayToggle?.addEventListener('click', handleDisplayClick);
  viewToggle?.addEventListener('click', handleViewClick);
  document.addEventListener('keydown', handleCardNav);

  _cleanup = (): void => {
    tenseChips?.removeEventListener('click', handleTenseChange);
    regChips?.removeEventListener('click', handleTenseChange);
    document.getElementById('conjTensesAll')?.removeEventListener('click', handleTenseChange);
    document.getElementById('conjTensesNone')?.removeEventListener('click', handleTenseChange);
    document.getElementById('conjRegAll')?.removeEventListener('click', handleTenseChange);
    document.getElementById('conjRegNone')?.removeEventListener('click', handleTenseChange);
    displayToggle?.removeEventListener('click', handleDisplayClick);
    viewToggle?.removeEventListener('click', handleViewClick);
    document.removeEventListener('keydown', handleCardNav);
    setProgressCallback(null);
    setOnConjDeselectedChange(null);
    stopwatch.stop();
  };
}

// ── Card builder ──────────────────────────────────────────────────────────────

interface BuildCardOptions {
  verb:             Word;
  lang:             string;
  pronouns:         string[];
  tenseKey:         string;
  /**
   * This tense's name in `verb`'s own language — not the flattened,
   * Spanish-biased TENSE_LABELS module map, which would show "Presente" on
   * a German card. Resolved by the caller (buildCards()), which already
   * knows the verb's own language.
   */
  tenseNativeLabel: string;
  getDisplayMode:   () => string;
  onProgress:       () => void;
  /**
   * Full Conjugation stacks one card per tense for a single verb, where the
   * verb name and its star are already in the view header — repeating them on
   * every card would be six copies of the same line.
   */
  hideVerbName?:    boolean;
}

function buildCard({
  verb, lang, pronouns, tenseKey, tenseNativeLabel, getDisplayMode, onProgress, hideVerbName = false,
}: BuildCardOptions): CardController {
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

  // Frequency rank. Same badge as table mode — bare number, no '#', same
  // corner and same type, so a word reads identically in both modes.
  const rankEl = document.createElement('span');
  rankEl.className = 'conj-card-rank';
  if (verb.rank != null) rankEl.textContent = String(verb.rank);
  else rankEl.hidden = true;
  // In Full Conjugation the verb block header already carries the rank —
  // same reasoning as targetEl/englishEl above.
  if (hideVerbName) rankEl.hidden = true;
  card.appendChild(rankEl);

  const targetEl  = document.createElement('div');
  targetEl.className = 'conj-verb-spanish';
  const englishEl = document.createElement('div');
  englishEl.className = 'conj-verb-english';

  // Add to a list, the same star and the same picker as Table and Recall.
  // A verb you cannot conjugate is exactly the verb you want to save, and
  // until now the only way to do that was to leave the mode and find it again.
  const starBtn = document.createElement('button');
  starBtn.type      = 'button';
  starBtn.textContent = '★';
  // Tab moves input → input through the conjugation grid; the star is still
  // reachable by click, matching how table mode keeps it out of the run.
  starBtn.tabIndex  = -1;

  function syncStar(): void {
    const lists = getWordLists(lang, verb.word);
    starBtn.className = 'known-btn conj-card-star'
      + (lists.length > 0 ? ' known-btn--active' : '');
    starBtn.title = lists.length > 0
      ? 'In lists: ' + lists.join(', ')
      : 'Add to a list';
  }
  syncStar();

  starBtn.addEventListener('click', e => {
    e.stopPropagation();
    openListPicker({ anchorEl: starBtn, lang, word: verb.word, onClose: syncStar });
  });

  const titleRow = document.createElement('div');
  titleRow.className = 'conj-verb-title-row';
  titleRow.append(targetEl, starBtn);
  titleRow.hidden = hideVerbName;
  headMain.append(titleRow, englishEl);
  if (hideVerbName) englishEl.hidden = true;

  const headSide = document.createElement('div');
  headSide.className = 'conj-head-side';

  // Band, regularity and tense are all one-word labels, so they share a line
  // instead of stacking three deep. That was three rows of header above a
  // six-row conjugation table, which made every card taller than its content.
  const metaRow = document.createElement('div');
  metaRow.className = 'conj-head-meta';

  // Frequency band, if we have one.
  const bandEl = document.createElement('span');
  bandEl.className = 'conj-card-band';
  const band = verb.frequency?.band ?? null;
  if (band) bandEl.textContent = band; else bandEl.hidden = true;
  metaRow.appendChild(bandEl);

  // Only present in a merged multi-language session — a single-language one
  // never has `.language` set, so no card ever pays for this otherwise.
  if (verb.language) metaRow.appendChild(createFlagImg(Settings.getLangFlag(verb.language), languageInfo(verb.language).label));

  // Regularity. conjugation_class encodes it: regular-*, ortho-* (spelling
  // change only), stem-* (stem-changing) and irregular-*. Grouped into three
  // buckets, because "ortho-car" means nothing to someone learning.
  const regEl = document.createElement('span');
  const cls   = verb.linguistic?.conjugation_class ?? null;
  const kind  = regularityOf(cls);
  regEl.className   = `conj-card-reg conj-card-reg--${kind.key}`;
  regEl.textContent = kind.label;
  // Explanation first, raw class second — the class name is only useful once
  // you already know what the bucket means.
  regEl.title       = (REGULARITY_HELP[kind.key] ?? '')
                    + (cls ? `\n\nconjugation class: ${cls}` : '');
  // In Full Conjugation the verb block header already carries this pill,
  // computed once per verb rather than repeated identically on every one
  // of its tense cards.
  if (!cls || hideVerbName) regEl.hidden = true;
  metaRow.appendChild(regEl);

  // Tense name, always shown — it is the one thing that distinguishes two
  // cards for the same verb.
  const tenseEl = document.createElement('span');
  tenseEl.className = 'conj-card-tense';
  tenseEl.title     = TENSE_HELP[tenseKey] ?? '';
  metaRow.appendChild(tenseEl);

  headSide.appendChild(metaRow);

  // English tense name and Reveal all share the second line.
  const footRow = document.createElement('div');
  footRow.className = 'conj-head-foot';

  const tenseEnEl = document.createElement('span');
  tenseEnEl.className = 'conj-card-tense-en';
  tenseEnEl.textContent = tenseEnLabel(tenseKey);
  if (!tenseEnEl.textContent) tenseEnEl.hidden = true;
  footRow.appendChild(tenseEnEl);

  const revealAllBtn = document.createElement('button');
  revealAllBtn.type      = 'button';
  revealAllBtn.className = 'conj-reveal-all-btn';
  revealAllBtn.textContent = 'Reveal all';
  revealAllBtn.title = 'Fill in every form for this verb (scored as revealed)';
  revealAllBtn.addEventListener('click', () => {
    revealAnswers('revealed');
    revealAllBtn.disabled = true;
  });
  footRow.appendChild(revealAllBtn);

  headSide.appendChild(footRow);

  header.append(headMain, headSide);

  function updateHeader(): void {
    const mode = getDisplayMode();
    targetEl.textContent  = displayWord(verb);
    englishEl.textContent = buildGlossDisplay(verb);
    // In Full Conjugation the view header carries the verb, so the card's copy
    // stays hidden whatever the target/english toggle says.
    targetEl.hidden  = hideVerbName || mode === 'english';
    englishEl.hidden = hideVerbName || mode === 'target';
    tenseEl.textContent = tenseNativeLabel;
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
    applyAutofillAttr(inp);
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
  // conj-row-tense-hidden, matching what setSingleMode toggles. It used to
  // start with conj-row-hidden, which setSingleMode no longer touches — so the
  // row stayed hidden forever and a gerund card had no input at all.
  singleFormRow.className  = 'conj-row conj-row-tense-hidden';
  singleFormRow.dataset.pi = 'single';

  const singleLabel = document.createElement('span');
  singleLabel.className = 'conj-pronoun';

  let singleInp = document.createElement('input');
  singleInp.type           = 'text';
  singleInp.className      = 'conj-drill-input';
  applyAutofillAttr(singleInp);
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
    // conj-row-tense-hidden, not conj-row-hidden — see VISIBLE_ROW. The pronoun
    // toggles own the other class and would undo this on their next pass.
    const hiddenSlots = single ? EMPTY_SLOTS : hiddenPronounSlots(getTenseKey());
    pronounRows.forEach((row, i) => {
      row.classList.toggle('conj-row-tense-hidden', single || hiddenSlots.has(i));
      // Distinguishes "imperative has no yo" (row still takes its normal
      // place in the paradigm, just empty) from "this whole card is a
      // single-form tense" (there is no paradigm here at all) — both carry
      // conj-row-tense-hidden for VISIBLE_ROW/scoring purposes, but only the
      // former also gets this marker, which Full view uses to keep the row's
      // vertical space reserved so tú-through-ellos still lines up with the
      // neighboring tense columns instead of sliding up to fill yo's slot.
      row.classList.toggle('conj-row-no-form', !single && hiddenSlots.has(i));
    });
    singleFormRow.classList.toggle('conj-row-tense-hidden', !single);
    if (single) {
      singleLabel.textContent = SINGLE_FORM_ROW_LABEL[getTenseKey()] ?? getTenseKey();
    }
  }

  function updateInputs(): void {
    const single = isSingleForm(getTenseKey());
    const hiddenSlots = single ? EMPTY_SLOTS : hiddenPronounSlots(getTenseKey());

    inputs.forEach((inp, i) => {
      inp.value    = '';
      // A slot the tense has no form for (imperative's "yo") stays disabled —
      // same as a pronoun the Forms toggle switched off — so Tab navigation
      // (addNav, below) never lands on a row that's hidden via CSS.
      inp.disabled = hiddenSlots.has(i);
      inp.classList.remove('correct', 'revealed', 'missed');
      const btn = revealBtns[i];
      if (btn) { btn.hidden = hintMode === 'none' || hiddenSlots.has(i); btn.textContent = '?'; }
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
    mark: 'correct' | 'revealed' | 'missed',
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

  /**
   * Re-paint a freshly built, still-blank card with what bankVisibleVerbs()
   * scored for it last time — see buildCards()'s call site. Reuses fill()
   * (now taking 'correct' too), which already no-ops on a slot that somehow
   * carries a scoring class already, so this is safe to call before or after
   * attachChecking() has wired the inputs up.
   */
  function restoreBanked(states: ReadonlyMap<number | 'single', 'correct' | 'revealed' | 'missed'>): void {
    states.forEach((state, slot) => {
      const inp = slot === 'single' ? singleInp       : inputs[slot];
      const btn = slot === 'single' ? singleRevealBtn : revealBtns[slot];
      if (inp) fill(inp, btn, answerFor(slot), state);
    });
  }

  function syncDeselected(): void {
    const showAnswer = Settings.getConjDeselected() === 'answer';
    pronounRows.forEach((row, i) => {
      const inp = inputs[i];
      if (!inp) return;
      const off = row.classList.contains('conj-row-hidden');

      if (off && showAnswer) {
        // Never overwrite something the learner typed before switching the
        // pronoun off — only an empty box, or one we filled ourselves.
        if (inp.value === '' || inp.dataset.deselectedFill === '1') {
          inp.value = answerFor(i) ?? '—';
          inp.dataset.deselectedFill = '1';
        }
        return;
      }

      if (inp.dataset.deselectedFill === '1') {
        inp.value = '';
        delete inp.dataset.deselectedFill;
      }
    });
  }

  setSingleMode(isSingleForm(getTenseKey()));
  updateHeader();
  attachChecking();

  return { card, updateHeader, updateInputs, revealAnswers, syncDeselected, restoreBanked };
}
