/**
 * conjugation/index.ts
 */

import type { Word } from '../../types.js';
import { showSummary, clearSummary, summaryChip, percent } from '../../ui/quiz-summary.ts';
import { readString, writeString } from '../../utils/storage.ts';
import { foldKey as normalize } from '../../utils/match.ts';
import { orderWords, WORD_ORDER_LABELS, saveSession, recordOutcome,
         type WordOrder } from '../../utils/session-history.ts';
import { PRONOUNS, TENSE_DEFS, TENSE_EN, TENSE_HELP, REGULARITY_HELP } from './data.js';
import { activeTenses, activeRegularities, unionTenseDefs } from './controls.js';
import {
  setProgressCallback,
  applyAllPronounToggles,
} from './controls.js';
import { buildGlossDisplay } from '../../utils/utils.js';
import { getWordLists } from '../../utils/word-lists.ts';
import { openListPicker } from '../../utils/list-picker.ts';
import { supportsConjugation, conjugationUnavailableReason, languageInfo } from '../../data/languages.js';
import { createFlagImg } from '../../ui/flag-icon.js';
import { createStopwatch } from '../../ui/stopwatch.js';
import { buildScorePills, scorePct } from '../../ui/score-pills.js';
import {
  Settings, applyConjDeselectedClass, setOnConjDeselectedChange, applyAutofillAttr,
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
function verbKey(word: string, verbLang: string): string {
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
}

let _cleanup: (() => void) | null = null;

const SINGLE_FORM_TENSES = new Set(['past_participle', 'gerund']);

/**
 * Bucket a conjugation_class into something a learner recognises.
 *
 * The data has 26 classes across four prefixes; "ortho-car" is a spelling
 * adjustment that keeps the sound (buscar -> busqué) and is regular in every
 * way that matters to a learner, so it reads as Regular with a note rather
 * than as Irregular.
 */
function regularityOf(cls: string | null): { key: string; label: string } {
  if (!cls)                        return { key: 'unknown',   label: '' };
  if (cls.startsWith('regular'))   return { key: 'regular',   label: 'Regular' };
  if (cls.startsWith('ortho'))     return { key: 'ortho',     label: 'Spelling' };
  if (cls.startsWith('stem'))      return { key: 'stem',      label: 'Stem-change' };
  return { key: 'irregular', label: 'Irregular' };
}

function isSingleForm(key: string): boolean {
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

/**
 * Is this entry a headword, or is it one form of some other verb?
 *
 * *hay* is a real vocabulary entry — rank 48, its own glosses and usage notes —
 * and belongs in Table, Recall and the lists. It is also the impersonal present
 * of *haber*, which it records in `linguistic.infinitive`, so offering it here
 * gave the learner a second card drilling one cell of a verb they already had.
 *
 * The test is the relationship, not the word, so anything else stored the same
 * way drops out too. Two things it must *not* drop:
 *
 *   - A verb with no recorded infinitive. That is the common case (3,364 of the
 *     3,373 verbs in the database) and it is its own headword.
 *   - A reflexive. *ducharse*, *quejarse* and six others record the bare stem
 *     in `infinitive` — `divertirse` → `divertir` — but they are headwords in
 *     their own right and conjugate differently from the bare verb. Romance
 *     languages attach the clitic to the end of the infinitive, so a form that
 *     *begins* with the whole infinitive is a derived headword; an inflected
 *     form of some other lemma is not (*hay* does not begin with *haber*).
 *
 * The `reflexive` column would be the honest way to ask this, but it is 0 on
 * every row in the database — nothing populates it.
 */
function isOwnInfinitive(w: Word): boolean {
  const inf = w.linguistic?.infinitive;
  if (!inf) return true;
  return normalize(w.word).startsWith(normalize(inf));
}

/**
 * Do we have anything to drill for this verb?
 *
 * A present-tense array of six empty strings is as useless as a null, and both
 * occur: an import that found the headword but no table leaves the shape behind
 * without the content. So the test is for a form with characters in it, not for
 * the key being present.
 */
function hasAnyForms(w: Word): boolean {
  const conj = w.linguistic?.conjugations as Record<string, unknown> | null | undefined;
  if (!conj) return false;
  return Object.values(conj).some(v =>
    typeof v === 'string'
      ? v.trim() !== ''
      : Array.isArray(v) && v.some(f => typeof f === 'string' && f.trim() !== ''));
}

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

export function renderConjugationMode({ words, container, lang = 'spanish', extraLangs = [] }: ConjugationModeOptions): void {
  if (_cleanup) { _cleanup(); _cleanup = null; }
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
    const base = t > 1
      ? `${v} verb${v === 1 ? '' : 's'} × ${t} tenses = ${v * t} cards`
      : `${v} verb${v === 1 ? '' : 's'}`;

    // Regularity breakdown of the verb set — how much of this quiz is the
    // easy kind is worth knowing before you start.
    const tally = { regular: 0, ortho: 0, stem: 0, irregular: 0, unknown: 0 };
    verbs.forEach(vb => {
      const k = regularityOf(vb.linguistic?.conjugation_class ?? null).key;
      tally[k as keyof typeof tally]++;
    });
    const irregularish = tally.stem + tally.irregular;
    const known        = v - tally.unknown;
    if (known === 0) return base;

    return `${base}  ·  ${tally.regular} regular, `
         + `${tally.ortho} spelling, ${irregularish} irregular`;
  }
  orderCount.textContent = describeSet();
  const stopwatchEl = document.createElement('span');
  stopwatchEl.className = 'quiz-stopwatch';
  stopwatchEl.title     = 'Time spent on this quiz';
  const stopwatch = createStopwatch(stopwatchEl);
  stopwatch.start();
  orderRow.append(orderLabel, orderSel, orderCount, stopwatchEl);

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

  const formsBar = makeProgressGroup('Forms', 'Progress across every individual conjugation');
  const verbsBar = makeProgressGroup('Verbs', 'Progress across whole verbs — a verb counts once all its forms are done');

  const giveUpBtn = document.createElement('button');
  giveUpBtn.className   = 'conj-giveup-btn';
  giveUpBtn.textContent = 'Give Up';

  progressSection.append(progressBlock, giveUpBtn);

  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'conj-cards-grid';
  // How a deselected pronoun's cell is shown. On the grid rather than per row
  // because it is one decision for the whole quiz, and the pronoun toggles
  // re-run across every row often.
  applyConjDeselectedClass(cardsGrid, Settings.getConjDeselected());

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

    paint(formsBar, forms, `${forms.correct + forms.revealed + forms.missed}/${forms.total} Answered`);
    paint(verbsBar, verbs, `${verbs.correct}/${verbs.total} Fully Conjugated`);

    // left, not correct === total: a session where every form has been
    // answered — correctly, revealed, or missed — is done, the same rule
    // table-controls.ts's isQuizComplete() uses. Requiring every form to be
    // *correct* meant revealing even one form left the quiz open forever:
    // recordConjSession() never ran, so the stopwatch kept ticking and the
    // session was never saved.
    if (forms.total > 0 && forms.left === 0) {
      recordConjSession();
      showConjSummary(verbs.correct, verbs.total, forms.correct, forms.total);
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
   * Full Conjugation is paged, not stepped.
   *
   * It used to show one verb with Prev/Next, which meant a click between every
   * verb and no way to see how far through you were. Table mode had already
   * answered this: a page of them, scrolled, with a pager. The only reason to
   * page at all rather than render all 249 is that a verb here is one card per
   * selected tense — eight tenses turns 249 verbs into 1,992 cards, each with
   * six inputs.
   */
  const CONJ_PAGE_SIZES = [5, 10, 25, 50] as const;
  const DEFAULT_PAGE_SIZE = 10;

  let fullPage = 0;
  let pageSize = (() => {
    const n = Number(readString('vq_conj_page_size'));
    return (CONJ_PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
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

  fullHeader.append(fullPrev, fullCount, sizeLabel, fullNext);

  function syncFullHeader(): void {
    fullHeader.hidden = viewMode !== 'full';
    cardsGrid.classList.toggle('conj-cards-grid--full', viewMode === 'full');
    if (viewMode !== 'full') return;
    const from = verbs.length === 0 ? 0 : pageStart() + 1;
    const to   = Math.min(pageStart() + pageSize, verbs.length);
    countLong.textContent =
      `Verbs ${from}–${to} of ${verbs.length}  ·  Page ${fullPage + 1} of ${pageCount()}`;
    countShort.textContent = `${from}–${to} / ${verbs.length}`;
    fullPrev.disabled = fullPage === 0;
    fullNext.disabled = fullPage >= pageCount() - 1;
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
    pageSize = Number(sizeSel.value) || DEFAULT_PAGE_SIZE;
    writeString('vq_conj_page_size', String(pageSize));
    // Stay near where you were rather than jumping to the top: the verb that
    // started the old page is the one you were working on.
    fullPage = Math.floor(pageStart() / pageSize);
    buildCards();
    applyAllPronounToggles(cardsGrid);
    syncDeselectedCells();
    updateProgress();
  });

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

    const head = document.createElement('div');
    head.className = 'conj-verb-block-head';

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

    head.append(word, star, gloss, rank);
    // Only present in a merged multi-language session — a single-language
    // one never has `.language` set, so this never appears there.
    if (verb.language) head.appendChild(createFlagImg(Settings.getLangFlag(verb.language), languageInfo(verb.language).label));

    const row = document.createElement('div');
    row.className = 'conj-verb-row';

    el.append(head, row);
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

    // The grid shows every verb, one card per verb per tense, flowing into
    // columns. Full Conjugation shows a page of verbs, each as its own block
    // with its tenses in a row. Same cards either way.
    const shown = viewMode === 'full' ? pageVerbs() : verbs;

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
  interface BankedVerb { word: string; language: string; }
  const banked = {
    correct: new Map<string, BankedVerb>(),
    missed:  new Map<string, BankedVerb>(),
  };

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
    if (viewMode !== 'full') return;

    interface Acc { word: string; language: string; total: number; correct: number; answered: number; }
    const perVerb = new Map<string, Acc>();

    cardsGrid.querySelectorAll<HTMLElement>('.conj-card').forEach(card => {
      const word = card.dataset.verb;
      if (!word) return;
      const verbLang = card.dataset.verbLang ?? lang;
      const key = verbKey(word, verbLang);
      const acc = perVerb.get(key) ?? { word, language: verbLang, total: 0, correct: 0, answered: 0 };
      card.querySelectorAll(VISIBLE_ROW).forEach(row => {
        const inp = row.querySelector<HTMLInputElement>('.conj-drill-input');
        if (!inp) return;
        acc.total++;
        if (inp.classList.contains('correct')) { acc.correct++; acc.answered++; }
        else if (inp.classList.contains('revealed') || inp.classList.contains('missed')) acc.answered++;
      });
      perVerb.set(key, acc);
    });

    perVerb.forEach((acc, key) => {
      if (acc.total === 0 || acc.answered === 0) return;
      const entry = { word: acc.word, language: acc.language };
      if (acc.correct === acc.total) banked.correct.set(key, entry);
      else                           banked.missed.set(key, entry);
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
    // the moment they were left.
    banked.correct.forEach(({ word, language }) => {
      const bucket = bucketFor(language);
      if (!bucket.missed.includes(word)) bucket.correct.push(word);
    });
    banked.missed.forEach(({ word, language }) => {
      const bucket = bucketFor(language);
      if (!bucket.correct.includes(word)) bucket.missed.push(word);
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

  container.append(orderRow, progressSection, fullHeader, cardsGrid);

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
    const next = btn.dataset.view === 'full' ? 'full' : 'grid';
    if (next === viewMode) return;

    // Leaving Full Conjugation banks the verbs on screen; the cards are about
    // to be rebuilt for every verb and their answers would go with them.
    bankVisibleVerbs();

    // The stored value and the active class belong to the handler in app.ts,
    // which is bound whether or not a quiz is running. This one only rebuilds.
    viewMode = next;

    // Entering Full Conjugation opens on the page holding the first verb not
    // already banked, so switching views mid-session picks up roughly where the
    // grid left off rather than sending you back to the start.
    if (viewMode === 'full') {
      const at = verbs.findIndex(v => {
        const key = verbKey(v.word, v.language ?? lang);
        return !banked.correct.has(key) && !banked.missed.has(key);
      });
      fullPage = at === -1 ? 0 : Math.floor(at / pageSize);
    }

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
  displayToggle?.addEventListener('click', handleDisplayClick);
  viewToggle?.addEventListener('click', handleViewClick);
  document.addEventListener('keydown', handleCardNav);

  _cleanup = (): void => {
    tenseChips?.removeEventListener('click', handleTenseChange);
    regChips?.removeEventListener('click', handleTenseChange);
    document.getElementById('conjTensesAll')?.removeEventListener('click', handleTenseChange);
    document.getElementById('conjTensesNone')?.removeEventListener('click', handleTenseChange);
    document.getElementById('conjRegAll')?.removeEventListener('click', handleTenseChange);
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
  if (!cls) regEl.hidden = true;
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
  tenseEnEl.textContent = TENSE_EN[tenseKey] ?? '';
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
    targetEl.textContent  = verb.word;
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
    pronounRows.forEach(row => row.classList.toggle('conj-row-tense-hidden', single));
    singleFormRow.classList.toggle('conj-row-tense-hidden', !single);
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

  return { card, updateHeader, updateInputs, revealAnswers, syncDeselected };
}
