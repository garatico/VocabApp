/**
 * my-lists-mode.ts — My Lists tab entry point.
 *
 * Two panes: a sidebar of lists on the left, and on the right either an
 * ordinary list (panel.ts) or a smart list (smart-panel.ts). This file builds
 * the shell, creates the shared context, and wires the two panes to each
 * other's redraws. Everything else lives in ./my-lists/.
 *
 * The whole tab used to be a single 1,500-line function. It is split because
 * the pieces have genuinely different jobs — mastery and backup are storage
 * with no DOM, the word list is rendering with no storage — and because the
 * one thing that really is shared, "which list is open", is now a named object
 * rather than a variable forty closures happened to capture.
 *
 * ./my-lists/
 *   context.ts      the shared selection state and the redraw hooks
 *   types.ts        VocabEntry, sort modes, POS/CEFR label tables
 *   vocab-cache.ts  the vocabulary every part of the pane reads
 *   mastery.ts      which words are known (also used by the quiz modes)
 *   smart-lists.ts  saved queries: storage and evaluation
 *   backup.ts       export/import of every list in every language
 *   sidebar.ts      left pane
 *   panel.ts        right pane for an ordinary list
 *   smart-panel.ts  right pane for a smart list
 *   multi-panel.ts  right pane for a cross-language list (view/remove only)
 *   word-list.ts    rows, chunked rendering, multi-select and bulk actions
 *   add-search.ts   the "search vocabulary to add" box
 *   bulk-import.ts  paste or drop a list of words
 *   move-popover.ts move/copy a word to another list
 *   undo-toast.ts   the transient Undo strip
 *   export-list.ts  write a list out as .txt
 */

import { getListNames, getTotalListedCount, refreshFilterSelect } from '../utils/word-lists.ts';
import { createContext } from './my-lists/context.ts';
import { createSidebar } from './my-lists/sidebar.ts';
import { renderPanel } from './my-lists/panel.ts';
import { migrateMastery } from './my-lists/mastery.ts';

// Mastery is read by the quiz modes through this module, which is where it
// lived before the split; re-exported so those imports did not have to move.
export { markMastered, isMastered } from './my-lists/mastery.ts';
export type { SmartRule } from './my-lists/smart-lists.ts';

/** Refresh the header word count and the quiz filter dropdown. */
function updateBadge(): void {
  // Reads the *global* language picker, not the pane's own: the badge and the
  // quiz filter belong to the page, and follow the language being studied.
  const gl = (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
  const el = document.getElementById('knownWordCount');
  if (el) el.textContent = String(getTotalListedCount(gl));
  refreshFilterSelect(gl);
}

export function renderMyLists(container: HTMLElement): void {
  container.innerHTML = '';

  const lang =
    (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
  migrateMastery(lang);

  const listNav = document.createElement('ul');
  listNav.className = 'ml-list-nav';

  const panel = document.createElement('div');
  panel.className = 'ml-panel';

  const ctx = createContext(lang, listNav, panel);
  ctx.selectedList = getListNames(lang)[0] ?? '';

  const sidebar = createSidebar(ctx);

  // The two panes call each other, so the hooks are filled in once both exist.
  ctx.renderSidebar = (rerenderPanel = true) => sidebar.render(rerenderPanel);
  ctx.renderPanel   = () => renderPanel(ctx);
  ctx.updateBadge   = updateBadge;

  container.appendChild(sidebar.leftPane);
  container.appendChild(panel);

  sidebar.render();
}
