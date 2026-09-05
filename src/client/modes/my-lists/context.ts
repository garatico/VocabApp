/**
 * context.ts — the state the My Lists panes share, and the redraws they trigger.
 *
 * My Lists is two panes that talk to each other constantly: picking a list in
 * the sidebar redraws the panel, adding a word in the panel updates the count
 * in the sidebar. That used to be expressed as one very large closure, where
 * every function could see every variable and the call graph was invisible.
 *
 * The state now lives in one object that is passed explicitly. Modules take
 * `ctx` and mutate the fields they own, which makes the coupling greppable:
 * searching for `ctx.selectedList` finds everything that depends on which list
 * is open.
 *
 * `renderSidebar` and `renderPanel` are slots rather than imports because the
 * two call each other. They are filled in by renderMyLists() once both exist;
 * the defaults are no-ops so a partially-wired context cannot throw.
 */

import type { SortMode } from './types.ts';
import type { FilterScope } from '../../filters/filter-scope.ts';

/**
 * Reserved sentinel for `selectedList` meaning "Browse All Words" is open,
 * not any real list — chosen so it can never collide with a name a learner
 * could actually type (list names come from free text; this can't, since it
 * carries a NUL either side). Lets the browse view slot into the exact same
 * selectedList/selectedSmart/selectedMultiList/selectedProfile mutual-
 * exclusivity every existing "switch to X" click handler already
 * maintains — see sidebar.ts's renderBrowseNav — rather than adding a fifth
 * field every one of those handlers would also have to remember to clear.
 */
export const BROWSE_ALL_LIST = '\u0000browse-all\u0000';

export interface ListsCtx {
  // ── Selection state ────────────────────────────────────────────────────────
  /** The language whose lists are shown. Owned by the sidebar's picker. */
  lang: string;
  /** Name of the open ordinary list, or '' when none exists. */
  selectedList: string;
  /** Name of the open smart list, or null. Never set alongside selectedList. */
  selectedSmart: string | null;
  /**
   * Name of the open cross-language list, or null. Never set alongside
   * selectedList/selectedSmart — a cross-language list isn't scoped to
   * `lang` at all, so it gets its own render path (multi-panel.ts) rather
   * than reusing panel.ts's single-language assumptions.
   */
  selectedMultiList: string | null;
  /** The open Testing Profile, or null. Never set alongside the selections
   *  above — a profile isn't a word list at all, so it gets its own render
   *  path (profile-panel.ts) rather than reusing panel.ts's assumptions. */
  selectedProfile: { mode: FilterScope; name: string } | null;
  sortMode: SortMode;
  /** The one word whose detail row is open, or null. */
  expandedWord: string | null;
  hideMastered: boolean;
  /** Empty means "no filter", not "nothing matches". */
  readonly selectedPos: Set<string>;
  readonly selectedBands: Set<string>;

  // ── DOM roots ──────────────────────────────────────────────────────────────
  readonly listNav: HTMLUListElement;
  readonly panel: HTMLElement;

  // ── Redraws ────────────────────────────────────────────────────────────────
  /**
   * Redraw the sidebar.
   *
   * `rerenderPanel` defaults to true, but callers that only changed the
   * *contents* of the current list — adding, removing, moving a word — must
   * pass false. renderPanel() clears the panel and rebuilds every control from
   * scratch, which wiped the add-search box (and its results, and the filter
   * text) out from under the user mid-interaction.
   */
  renderSidebar(rerenderPanel?: boolean): void;
  /** Rebuild the right-hand pane from scratch for the current selection. */
  renderPanel(): void;
  /** Refresh the header word count and the quiz filter dropdown. */
  updateBadge(): void;
}

export function createContext(
  lang: string, listNav: HTMLUListElement, panel: HTMLElement,
): ListsCtx {
  return {
    lang,
    selectedList:  '',
    selectedSmart: null,
    selectedMultiList: null,
    selectedProfile: null,
    sortMode:      'alpha-asc',
    expandedWord:  null,
    hideMastered:  false,
    selectedPos:   new Set<string>(),
    selectedBands: new Set<string>(),
    listNav,
    panel,
    renderSidebar: () => {},
    renderPanel:   () => {},
    updateBadge:   () => {},
  };
}
