/**
 * quiz-summary.ts — the end-of-quiz strip, for every mode that has one.
 *
 * Table, Picture and Conjugation each grew their own `show…Summary` /
 * `clear…Summary` pair. All three did the same three things — look up a fixed
 * pair of element IDs, flip `display` between `flex` and `none`, and write some
 * `.summary-*` markup — and all three had to be found and edited together
 * whenever the strip changed. They had already drifted: only Table's variant
 * knew about the `quiz-summary--perfect` class.
 *
 * So the placement is here and the content stays with the mode, which is the
 * same split `score-pills.ts` uses: this module knows nothing about what a
 * quiz counts, and the modes know nothing about where the strip lives.
 */

import { getLastMissed, clearLastMissed } from '../utils/missed-words.ts';
import { openBulkListPicker } from '../utils/list-picker.ts';

/** The element IDs a mode paints its summary into, top and bottom. */
export interface SummarySlots {
  readonly ids: readonly string[];
}

export const SUMMARY_SLOTS = {
  table:       { ids: ['tableSummary', 'tableSummaryTop'] },
  picture:     { ids: ['pictureSummaryTop', 'pictureSummaryBottom'] },
  conjugation: { ids: ['conjSummaryTop', 'conjSummaryBottom'] },
  trivia:      { ids: ['triviaSummaryTop', 'triviaSummaryBottom'] },
  guessBlank:  { ids: ['guessBlankSummaryTop', 'guessBlankSummaryBottom'] },
  sentenceScramble: { ids: ['sentenceScrambleSummaryTop', 'sentenceScrambleSummaryBottom'] },
  // word-choice-mode.ts is parked (not wired to any tab) — these ids don't
  // exist in index.html yet; showSummary/clearSummary tolerate that already.
  wordChoice:  { ids: ['wordChoiceSummaryTop', 'wordChoiceSummaryBottom'] },
} as const satisfies Record<string, SummarySlots>;

export type SummaryMode = keyof typeof SUMMARY_SLOTS;

function slotsFor(mode: SummaryMode): readonly string[] {
  return SUMMARY_SLOTS[mode].ids;
}

/**
 * Show the strip in every slot the mode owns.
 *
 * `perfect` adds `quiz-summary--perfect`, the flourish for a clean sweep. It
 * used to exist in table mode only; passing `false` is the same as not having
 * it, so the other modes can opt in when they want it without a second
 * function.
 */
export function showSummary(mode: SummaryMode, html: string, perfect = false): void {
  // Every mode that ends a word quiz gets "add the misses to a list" for free.
  const missed = getLastMissed();
  const addBtn = missed
    ? `<button type="button" class="summary-add-missed" data-add-missed>`
      + `+ Add ${missed.words.length} missed to a list</button>`
    : '';
  for (const id of slotsFor(mode)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.style.display = 'flex';
    el.innerHTML     = html + addBtn;
    el.classList.toggle('quiz-summary--perfect', perfect);
  }
}

/** Hide and empty the strip. Safe to call when it was never shown. */
export function clearSummary(mode: SummaryMode): void {
  clearLastMissed();
  for (const id of slotsFor(mode)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.style.display = 'none';
    el.innerHTML     = '';
    el.classList.remove('quiz-summary--perfect');
  }
}

// ── Content helpers ──────────────────────────────────────────────────────────
//
// Small pieces the modes assemble themselves, so the wording of a count stays
// with the mode that knows what it counted.

/** `<span class="summary-correct">✓ 12 correct</span>` and friends. */
export function summaryChip(kind: 'correct' | 'missed' | 'pct', text: string): string {
  return `<span class="summary-${kind}">${text}</span>`;
}

/** Whole-number percentage, guarding the empty-quiz divide. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

// ── "Add missed to a list" ───────────────────────────────────────────────────

let missedClickBound = false;

/** One delegated handler for every strip's button; call once at startup. */
export function initMissedAdd(): void {
  if (missedClickBound) return;
  missedClickBound = true;
  document.addEventListener('click', e => {
    const btn = (e.target as Element | null)?.closest<HTMLElement>('[data-add-missed]');
    const missed = getLastMissed();
    if (!btn || !missed) return;
    openBulkListPicker({
      anchorEl:     btn,
      words:        missed.words.map(word => ({ word })),
      fallbackLang: missed.lang,
    });
  });
}
