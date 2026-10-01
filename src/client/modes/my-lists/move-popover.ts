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

import {
  getListNames, addToList, removeFromList,
  getMultiListNames, getMultiListLanguages, addToMultiList, removeFromMultiList,
} from '../../utils/word-lists.ts';
import { positionPopover } from '../../utils/popover-position.ts';
import { createFlagImg } from '../../ui/flag-icon.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { LANGUAGES } from '../../data/languages.ts';
import { buildListSection } from '../../ui/list-sections.ts';
import type { ListsCtx } from './context.ts';
import '../../styles-lazy/my-lists.css';

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
 *
 * @param opts.copyOnly Hides the Move/Copy tabs and fixes the mode to
 * 'copy' — for a word that isn't a member of any particular list to begin
 * with (Browse All Words' own rows), where "move" has no source list to
 * remove the word from and would just be a confusing option to offer.
 * @param opts.sourceLang The word's own language, when it isn't `ctx.lang` —
 * a Cross-Language list's own row (multi-panel.ts) passes the entry's own
 * language here, since a mixed-language list has no single `ctx.lang` of its
 * own. Defaults to `ctx.lang`. Every single-language destination offered is
 * in this language — a word can't join a single-language list of a language
 * it isn't in.
 * @param opts.sourceMulti The Cross-Language list name, when moving/copying
 * out of one (multi-panel.ts) rather than out of `ctx.selectedList` — 'move'
 * removes from this list instead, and it is excluded from the Cross-Language
 * destinations offered (nothing moves into the list it's already in).
 */
export function openMovePopover(
  ctx: ListsCtx, anchorBtn: HTMLElement, words: string[],
  onDone: (mode: 'move' | 'copy', listName: string) => void,
  opts: { copyOnly?: boolean; sourceLang?: string; sourceMulti?: string } = {},
): void {
  closePopover();
  let mode: 'move' | 'copy' = opts.copyOnly ? 'copy' : 'move';
  const lang = opts.sourceLang ?? ctx.lang;
  // Excluding the source itself only makes sense for 'move' — a word being
  // copied (or one with no single source list to begin with) can freely be
  // added to every list, including the one it's already sitting in.
  const excludeSingle = !opts.copyOnly && !opts.sourceMulti ? ctx.selectedList : null;
  const singleTargets = getListNames(lang).filter(n => n !== excludeSingle);
  const multiTargets = getMultiListNames().filter(n => n !== opts.sourceMulti);

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

  if (opts.copyOnly) {
    const label = document.createElement('div');
    label.className = 'ml-move-popover-label';
    label.textContent = 'Add to:';
    popover.appendChild(label);
  } else {
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
  }

  function commit(listName: string, addWord: (word: string) => void): void {
    words.forEach(word => {
      if (mode === 'move') {
        if (opts.sourceMulti) removeFromMultiList(opts.sourceMulti, word, lang);
        else removeFromList(lang, ctx.selectedList, word);
      }
      addWord(word);
    });
    onDone(mode, listName);
    closePopover();
  }

  function buildItem(listName: string, flag: HTMLElement, addWord: (word: string) => void): HTMLButtonElement {
    const item = document.createElement('button');
    item.type = 'button'; item.className = 'ml-move-popover-item';
    item.append(flag, document.createTextNode(listName));
    item.addEventListener('click', e => { e.stopPropagation(); commit(listName, addWord); });
    return item;
  }

  // A word can't join a single-language list of a language it isn't in, so
  // every single-language row shows the same flag — still worth showing,
  // since it's what tells the two groups apart from a Cross-Language list's
  // own (possibly several) flags right below.
  const singleLangInfo = LANGUAGES.find(l => l.name === lang);

  // A section folding changes the popover's height, so it is placed again.
  const reposition = (): void => positionPopover(popover, anchorBtn, { alignRight: true });

  if (singleTargets.length === 0 && multiTargets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ml-move-popover-empty'; empty.textContent = 'No other lists';
    popover.appendChild(empty);
  } else {
    if (singleTargets.length > 0) {
      popover.appendChild(buildListSection('single', 'Single-Language Lists', singleTargets.map(listName => {
        const flag = singleLangInfo
          ? createFlagImg(singleLangInfo.flagCountry, singleLangInfo.label)
          : document.createElement('span');
        return buildItem(listName, flag, word => addToList(lang, listName, word));
      }), reposition));
    }
    if (multiTargets.length > 0) {
      popover.appendChild(buildListSection('multi', 'Cross-Language Lists', multiTargets.map(listName => {
        const flag = buildLangBadge(getMultiListLanguages(listName));
        return buildItem(listName, flag, word => addToMultiList(listName, word, lang));
      }), reposition));
    }
  }

  document.body.appendChild(popover);
  // Positioned after appending, so it can be measured rather than guessed at.
  // The old code aligned its right edge against a hardcoded 160px while the
  // CSS max-width was 200px, which hung it off the side of a narrow screen.
  positionPopover(popover, anchorBtn, { alignRight: true });
  activePopover = popover;
}
