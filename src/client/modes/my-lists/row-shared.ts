/**
 * row-shared.ts — pieces shared between word-list.ts (single-language) and
 * multi-panel.ts (cross-language), so the same word row and the same "N
 * Words" / "N Mastered" stat chips don't drift into two almost-identical
 * implementations that quietly disagree.
 */

import { getMasteryLevel, setMasteryLevel, MASTERY_LEVELS } from './mastery.ts';
import { quizStrength, wordTally } from '../../utils/session-history.ts';

/** Compact fill-level glyphs for the mastery scale, 0..MAX_MASTERY_LEVEL. */
export const MASTERY_GLYPHS = ['○', '◔', '◑', '◕', '●'];

export interface MasteryControls {
  masteryBtn: HTMLButtonElement;
  /** Read-only — reflects quiz history, not a control. */
  quizBadge: HTMLSpanElement;
}

/**
 * The mastery-scale button and the read-only quiz-history badge that sit at
 * the end of every word row.
 *
 * `lang` is the *word's own* language — for a cross-language list that's
 * `entry.language`, not the sidebar's `ctx.lang`, since mastery.ts and
 * session-history.ts are both keyed by the word's actual language.
 * `onChange` re-renders whatever list the row belongs to.
 */
export function buildMasteryControls(lang: string, word: string, onChange: () => void): MasteryControls {
  const level = getMasteryLevel(lang, word);
  const masteryBtn = document.createElement('button');
  masteryBtn.type = 'button';
  masteryBtn.className = 'ml-mastery-btn';
  masteryBtn.dataset.level = String(level);
  masteryBtn.title = `Your level: ${MASTERY_LEVELS[level]} — click to advance, shift-click to reset`;
  masteryBtn.textContent = MASTERY_GLYPHS[level];
  masteryBtn.addEventListener('click', e => {
    e.stopPropagation();
    const cur  = getMasteryLevel(lang, word);
    const next = e.shiftKey ? 0 : (cur + 1) % MASTERY_LEVELS.length;
    setMasteryLevel(lang, word, next);
    onChange();
  });

  const strength = quizStrength(lang, word);
  const tally    = wordTally(lang, word);
  const quizBadge = document.createElement('span');
  quizBadge.className = 'ml-quiz-badge';
  quizBadge.dataset.strength = String(strength);
  if (strength === 0) {
    quizBadge.textContent = '–';
    quizBadge.title = 'No quiz history yet for this word';
  } else {
    const total = tally.correct + tally.wrong;
    const pct   = Math.round((tally.correct / total) * 100);
    quizBadge.textContent = pct + '%';
    quizBadge.title = `Quiz record: ${tally.correct} correct, ${tally.wrong} missed (${pct}%)`;
  }

  return { masteryBtn, quizBadge };
}

/**
 * The "N Words" chip — always shown, even at zero ("No Words"), so an empty
 * list's stats row reads as "this is empty" rather than looking broken next
 * to a Mastered chip that's still there (see appendMasteredChip below).
 */
export function appendCountChip(statsRow: HTMLElement, total: number): void {
  const chip = document.createElement('span');
  chip.className = 'ml-stat-chip ml-stat-chip--count';
  chip.textContent = total > 0 ? `${total} Word${total === 1 ? '' : 's'}` : 'No Words';
  statsRow.appendChild(chip);
}

/** The "N Mastered" chip — same "always shown" reasoning as the count chip. */
export function appendMasteredChip(statsRow: HTMLElement, masteredCount: number): void {
  const chip = document.createElement('span');
  chip.className = 'ml-stat-chip ml-stat-chip--mastered'
    + (masteredCount === 0 ? ' ml-stat-chip--mastered-empty' : '');
  chip.textContent = masteredCount > 0 ? `${masteredCount} Mastered` : 'None Mastered';
  statsRow.appendChild(chip);
}
