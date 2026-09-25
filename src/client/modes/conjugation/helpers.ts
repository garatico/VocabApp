import type { Word } from '../../types.js';
import { showSummary, clearSummary, summaryChip, percent } from '../../ui/quiz-summary.ts';
import { isOwnInfinitive, hasAnyForms, regularityOf } from './verb-filters.js';

/**
 * conjugation/helpers.ts — what every Conjugation view shares: the options type, a
 * verb's identity key, which pronoun slots a tense or verb has no form for,
 * single-form tenses, and the end-of-quiz summary.
 *
 * Split out of index.ts so the other views (One at a Time, Random Table, Card
 * Match) import small helpers from here instead of pulling in the whole grid
 * mode's render function to reach them.
 */

// Re-exported — one-at-a-time-mode.ts, random-table-mode.ts and
// card-match-mode.ts import these three from here, not from verb-filters.ts
// directly (they predate the split).
export { isOwnInfinitive, hasAnyForms, regularityOf };

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

export interface CardController {
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


const SINGLE_FORM_TENSES = new Set(['past_participle', 'gerund']);

// The two imperative moods have five persons, not six — there's no such
// thing as commanding yourself, so "yo" doesn't exist here at all. Different
// from SINGLE_FORM_TENSES (no pronoun row at all): these still have five of
// the normal six, just missing one.
const NO_YO_TENSES = new Set(['imperative_affirmative', 'imperative_negative']);
export const EMPTY_SLOTS: ReadonlySet<number> = new Set();

/** Pronoun slot indices a tense simply has no form for — currently only "yo"
 *  (index 0) for the imperative moods. Shared with one-at-a-time-mode.ts,
 *  random-table-mode.ts and card-match-mode.ts, which have no grid rows to
 *  hide and instead use this to skip the slot before ever building one. */
export function hiddenPronounSlots(tenseKey: string): Set<number> {
  return NO_YO_TENSES.has(tenseKey) ? new Set([0]) : new Set();
}

/**
 * Pronoun slots a *specific verb* has no data for in a tense, on top of
 * whatever hiddenPronounSlots already excludes for every verb sharing that
 * tense (imperative's "yo"). A verb sourced without, say, a vosotros form
 * used to leave that slot enabled and counted anyway — its expected answer
 * was an empty string nothing typed could ever match, so a learner could
 * fill in every real form and still never reach 100%. Shared by buildCard
 * (which folds this into the same conj-row-tense-hidden/conj-row-no-form
 * treatment as a tense-wide gap) and quizFormsTotal (which needs the count
 * for pages not currently rendered).
 */
export function missingDataSlots(verb: Word, tenseKey: string, pronouns: readonly string[]): ReadonlySet<number> {
  if (isSingleForm(tenseKey)) return EMPTY_SLOTS;
  const answers = (verb.linguistic?.conjugations as Record<string, string[]> | null)?.[tenseKey] ?? null;
  if (!Array.isArray(answers)) return EMPTY_SLOTS;
  const missing = new Set<number>();
  for (let i = 0; i < pronouns.length; i++) if (!answers[i]) missing.add(i);
  return missing;
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
export const VISIBLE_ROW = '.conj-row:not(.conj-row-hidden):not(.conj-row-tense-hidden)';

export const SINGLE_FORM_ROW_LABEL: Record<string, string> = {
  past_participle: 'participio',
  gerund:          'gerundio',
};

export function clearConjSummary(): void {
  clearSummary('conjugation');
}

export function showConjSummary(completeVerbs: number, nVerbs: number, correctForms: number, totalForms: number): void {
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
