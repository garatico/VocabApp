/**
 * move-popover.ts — the per-word "move or copy to another list" bubble.
 *
 * Move and copy share one popover with a tab, rather than two buttons on every
 * row: the choice is between two verbs applied to the same target, and a row
 * already carries three buttons.
 *
 * `activePopover` is module state rather than context state because at most one
 * can be open at a time and it outlives the render that created it — a redraw
 * of the word list must be able to close a popover it did not open.
 */

import { getListNames, addToList, removeFromList } from '../../utils/word-lists.ts';
import { positionPopover } from '../../utils/popover-position.ts';
import type { ListsCtx } from './context.ts';

let activePopover: HTMLElement | null = null;

export function closePopover(): void {
  activePopover?.remove();
  activePopover = null;
}

/** True if the click landed outside the open popover (so it should close). */
export function clickedOutsidePopover(target: Node): boolean {
  return activePopover !== null && !activePopover.contains(target);
}

/**
 * @param words One word (a row's own ⇥ button) or several (the bulk toolbar's
 * "Move to…", anchored to that button instead of any one row) — same
 * popover either way, since the only thing that changes is how many words
 * get removeFromList/addToList'd per click. Used to be bulk-only: a plain
 * window.prompt() dumping every other list name as text for the user to
 * retype exactly (case- and whitespace-sensitive — a trailing space or a
 * capitalization slip silently did nothing, with no error), while the very
 * same action on a single row already had this click-to-pick popover. Bulk
 * now gets the same one.
 */
export function openMovePopover(
  ctx: ListsCtx, anchorBtn: HTMLElement, words: string[],
  onDone: (mode: 'move' | 'copy', listName: string) => void,
): void {
  closePopover();
  let mode: 'move' | 'copy' = 'move';
  const otherLists = getListNames(ctx.lang).filter(n => n !== ctx.selectedList);

  const popover = document.createElement('div');
  popover.className = 'ml-move-popover';

  // Only worth naming when it's not obvious from context — a row's own ⇥
  // button is right next to the word it acts on, but the bulk toolbar's
  // button is anchored to itself, not to any particular row.
  if (words.length > 1) {
    const label = document.createElement('div');
    label.className = 'ml-move-popover-label';
    label.textContent = `${words.length} words selected`;
    popover.appendChild(label);
  }

  // Mode tabs
  const tabs = document.createElement('div');
  tabs.className = 'ml-move-popover-tabs';
  (['move', 'copy'] as const).forEach(m => {
    const tab = document.createElement('button');
    tab.type = 'button'; tab.className = 'ml-move-tab' + (m === mode ? ' active' : '');
    tab.textContent = m === 'move' ? '⇥ Move' : '+ Copy';
    tab.addEventListener('click', () => {
      mode = m;
      tabs.querySelectorAll('.ml-move-tab').forEach((t, i) =>
        t.classList.toggle('active', i === (m === 'move' ? 0 : 1)));
    });
    tabs.appendChild(tab);
  });
  popover.appendChild(tabs);

  if (otherLists.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ml-move-popover-empty'; empty.textContent = 'No other lists';
    popover.appendChild(empty);
  } else {
    otherLists.forEach(listName => {
      const item = document.createElement('button');
      item.type = 'button'; item.className = 'ml-move-popover-item';
      item.textContent = listName;
      item.addEventListener('click', e => {
        e.stopPropagation();
        words.forEach(word => {
          if (mode === 'move') removeFromList(ctx.lang, ctx.selectedList, word);
          addToList(ctx.lang, listName, word);
        });
        onDone(mode, listName);
        closePopover();
      });
      popover.appendChild(item);
    });
  }

  document.body.appendChild(popover);
  // Positioned after appending, so it can be measured rather than guessed at.
  // The old code aligned its right edge against a hardcoded 160px while the
  // CSS max-width was 200px, which hung it off the side of a narrow screen.
  positionPopover(popover, anchorBtn, { alignRight: true });
  activePopover = popover;
}
