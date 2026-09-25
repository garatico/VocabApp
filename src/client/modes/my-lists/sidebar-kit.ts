import type { ListsCtx } from './context.ts';
import type { MenuItem } from './sidebar-menu.ts';

/**
 * sidebar-kit.ts — what each sidebar section module is handed by createSidebar().
 *
 * The sections used to be nested functions inside one 1,680-line closure and reached each
 * other's helpers through it. This makes that dependency explicit: a section gets the shared
 * list context, the redraw, and the handful of row-building helpers — and nothing else.
 */
export interface SidebarKit {
  ctx: ListsCtx;
  /** Redraw the sidebar. See ListsCtx.renderSidebar for what `rerenderPanel` is for. */
  render(rerenderPanel?: boolean): void;
  /** A section head: label plus optional "+ New" and "+ Folder". */
  sectionHead(
    cls: string, label: string, newTitle?: string, onNew?: () => void,
    folderScope?: string | (() => void),
  ): HTMLLIElement;
  /** A card's ⚙ gear and its dropdown of actions. */
  buildActionMenu(items: MenuItem[]): HTMLElement;
  /** A list's own emoji, as a span for the front of its name row (or null). */
  emojiSpan(emoji: string | undefined): HTMLElement | null;
  /** The gear menu's "Emoji" entry. */
  emojiItem(current: string | undefined, save: (emoji: string | undefined) => void): MenuItem;
  /** Make a list card draggable onto a folder header. */
  makeListDraggable(li: HTMLElement, item: import('./sidebar-dnd.ts').DraggedListItem): void;
  /** One placeholder row per registered-but-empty folder. */
  renderEmptyFolderPlaceholders(scope: string, usedFolders: string[]): void;
  /** One collapsible folder box. */
  buildFolderGroup(
    sectionId: import('./sidebar-state.ts').SidebarSectionId, folderKey: string, label: string,
    bulkHideFrom?: import('./sidebar-pickers.ts').BulkHideFrom,
    style?: { scope: string; folder: string },
  ): HTMLLIElement;
}
