/**
 * word-info-popover.ts — click-to-open word info/actions popover, Table
 * mode's word cell.
 *
 * Same anchored-popover mechanics as list-picker.ts's openListPicker
 * (positionPopover, outside-click/Escape dismissal, the shared
 * .list-picker-popover CSS shell) — this is that same family of popover,
 * just with a different body. Same reveal-gating as the hover tooltip
 * (word-tooltip.ts) too, and for the same reason: the word is still being
 * tested mid-quiz, so a "look this word up" click must not hand over the
 * answer early — it only differs from the tooltip in being reachable by
 * click/tap (useful on touch devices, where hover never fires at all).
 * Its word detail reuses word-tooltip.ts's own content builder
 * (buildWordDetailContent) so the two can never drift apart.
 */

import type { Word } from '../types.ts';
import { buildWordDetailContent } from './word-tooltip.ts';
import { buildGlossDisplay } from './utils.ts';
import { openListPicker } from './list-picker.ts';
import { positionPopover } from './popover-position.ts';

export interface WordInfoPopoverOptions {
  anchorEl: HTMLElement;
  word:     Word;
  /** The word's own effective language (w.language ?? the quiz's language) —
   *  what glosses/conjugation render against, and what "Add to list" and
   *  copy actions use. */
  lang:     string;
  /** Whether this row has been answered, revealed, or given up on — gates
   *  the glosses/conjugation/relations section and the copy actions below,
   *  same as the hover tooltip's own isWordRevealed check. */
  revealed: boolean;
  /** True when this direction shows the English gloss as the prompt and
   *  the target word itself is the hidden answer (table-mode.ts's
   *  en-target direction) — same meaning as attachTooltips' own option of
   *  the same name. Swaps which of "Copy word" / the heading text is the
   *  one gated on `revealed`, since which side is the secret flips with it. */
  hideWordWhenUnrevealed?: boolean;
  onClose?: () => void;
}

export function openWordInfoPopover({
  anchorEl, word, lang, revealed, hideWordWhenUnrevealed = false, onClose,
}: WordInfoPopoverOptions): void {
  closeExistingPopover();

  const popover = document.createElement('div');
  popover.className = 'list-picker-popover word-info-popover';
  popover.id        = 'wordInfoPopover';

  // "Show all tenses" needs to grow *this* popover, not the hidden hover-
  // tooltip singleton buildConjSection resizes by default — otherwise the
  // wider multi-tense table overflows this box's own max-width untouched.
  popover.appendChild(buildWordDetailContent(word, lang, revealed, hideWordWhenUnrevealed, expanding => {
    popover.classList.toggle('word-info-popover--wide', expanding);
    positionPopover(popover, anchorEl);
  }));

  const actions = document.createElement('div');
  actions.className = 'word-info-actions';

  const addBtn = document.createElement('button');
  addBtn.type        = 'button';
  addBtn.className   = 'word-info-action-btn';
  addBtn.textContent = '☆ Add to list…';
  addBtn.addEventListener('click', () => {
    // Its own popover, anchored to this button rather than stacking inside
    // the word-info one — openListPicker already closes whatever list-picker
    // family popover is open (closeExistingPicker), which would otherwise
    // tear this one down out from under itself mid-click.
    openListPicker({ anchorEl: addBtn, lang, word: word.word });
  });
  actions.appendChild(addBtn);

  if (word.pos === 'verb') {
    const conjBtn = document.createElement('button');
    conjBtn.type        = 'button';
    conjBtn.className   = 'word-info-action-btn';
    conjBtn.textContent = '▶ Practice in Conjugation mode';
    conjBtn.addEventListener('click', () => {
      close();
      document.querySelector<HTMLButtonElement>('.mode-tab[data-mode="conjugation"]')?.click();
    });
    actions.appendChild(conjBtn);
  }

  // Only offer to copy whichever side is actually being shown — "Copy word"
  // is blocked exactly when the heading above is showing '???' instead of
  // the real word (hideWordWhenUnrevealed && !revealed); "Copy translation"
  // is blocked whenever the gloss section itself isn't shown (!revealed,
  // unconditionally — the gloss never appears in this popover otherwise).
  const wordIsHidden = hideWordWhenUnrevealed && !revealed;

  const copyWordBtn = document.createElement('button');
  copyWordBtn.type        = 'button';
  copyWordBtn.className   = 'word-info-action-btn';
  copyWordBtn.textContent = '⧉ Copy word';
  copyWordBtn.disabled    = wordIsHidden;
  copyWordBtn.title       = wordIsHidden ? 'Solve this word first' : '';
  copyWordBtn.addEventListener('click', () => { void navigator.clipboard?.writeText(word.word); });
  actions.appendChild(copyWordBtn);

  const copyGlossBtn = document.createElement('button');
  copyGlossBtn.type        = 'button';
  copyGlossBtn.className   = 'word-info-action-btn';
  copyGlossBtn.textContent = '⧉ Copy translation';
  copyGlossBtn.disabled    = !revealed;
  copyGlossBtn.title       = !revealed ? 'Solve this word first' : '';
  copyGlossBtn.addEventListener('click', () => { void navigator.clipboard?.writeText(buildGlossDisplay(word)); });
  actions.appendChild(copyGlossBtn);

  popover.appendChild(actions);

  document.body.appendChild(popover);
  positionPopover(popover, anchorEl);
  popover.style.zIndex = '9999';

  function onOutside(e: MouseEvent): void {
    if (!popover.contains(e.target as Node) && e.target !== anchorEl) close();
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }
  function close(): void {
    popover.remove();
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
  }
  (popover as HTMLElement & { _close?: () => void })._close = close;

  setTimeout(() => {
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
}

function closeExistingPopover(): void {
  const existing = document.getElementById('wordInfoPopover') as (HTMLElement & { _close?: () => void }) | null;
  if (existing?._close) existing._close();
  else existing?.remove();
}
