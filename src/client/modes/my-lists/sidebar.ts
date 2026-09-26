/**
 * sidebar.ts — the left pane: language, and the four kinds of list.
 *
 * Four sections, each the same shape (a head row with "+ New", then one card
 * per item with name/meta on top and Copy/Rename/Delete below) but backed by
 * a different store and driving a different right-pane renderer:
 *
 *   Single-Language Lists  →  panel.ts           (word arrays, per ctx.lang)
 *   Smart Lists             →  smart-panel.ts     (saved queries)
 *   Cross-Language Lists    →  multi-panel.ts     (word+language pairs)
 *   Testing Profiles        →  profile-panel.ts   (saved filter bundles)
 *
 * Keeping the shapes identical is deliberate — a learner who has found Copy/
 * Rename/Delete on one kind of list shouldn't have to relearn where they live
 * on the next.
 *
 * Backup and restore live up here next to the title because they operate on
 * every list in every language, not on the one that happens to be open.
 */

import { getListNames } from '../../utils/word-lists.ts';
import { seedStarterLists } from './starter-lists.ts';
import { closeAllChipDropdowns } from './chip-dropdown.ts';
import { logger } from '../../utils/logger.ts';
import { BROWSE_ALL_LIST, type ListsCtx } from './context.ts';
import { migrateMastery } from './mastery.ts';
import { closePopover } from './move-popover.ts';
import { showUndo } from './undo-toast.ts';
import { downloadBackup, applyBackup } from './backup.ts';
import { LANGUAGES } from '../../data/languages.ts';
import { Settings } from '../../settings.ts';
import type { SidebarKit } from './sidebar-kit.ts';
import { SIDEBAR_SECTIONS, isSectionCollapsed, setSectionCollapsed } from './sidebar-state.ts';
import type { SidebarSectionId } from './sidebar-state.ts';
import { createMenuKit } from './sidebar-menu.ts';
import { createPickerKit } from './sidebar-pickers.ts';
import { createDndKit } from './sidebar-dnd.ts';
import { createFolderKit } from './sidebar-folders.ts';
import { createSingleSection } from './sidebar-single.ts';
import { createSmartSection } from './sidebar-smart.ts';
import { createMultiSection } from './sidebar-multi.ts';
import { createProfilesSection } from './sidebar-profiles.ts';
import { createVisualSection } from './sidebar-visual.ts';

// createSidebar() runs fresh on every visit to My Lists (see my-lists-mode.ts's
// renderMyLists, called from app.ts's mode-activation dispatcher) — a plain
// `document.addEventListener` in its body would add one more listener per
// visit with nothing ever removing the previous ones. Removed-then-reassigned
// each call instead, same convention as the equivalent handler in
// panel.ts/multi-panel.ts/browse-panel.ts.
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;

export interface SidebarUI {
  /** The whole left pane, ready to append. */
  leftPane: HTMLElement;
  /** Redraw. See ListsCtx.renderSidebar for what `rerenderPanel` is for. */
  render(rerenderPanel?: boolean): void;
}

export function createSidebar(ctx: ListsCtx): SidebarUI {
  const leftPane = document.createElement('div');
  leftPane.className = 'ml-left-pane';

  // ── Language ───────────────────────────────────────────────────────────────

  const langRow = document.createElement('div');
  langRow.className = 'ml-lang-row';
  const langLabel = document.createElement('span');
  langLabel.className = 'ml-lang-label';
  langLabel.textContent = 'Language';
  const langSel = document.createElement('select');
  langSel.className = 'ml-lang-select';
  langSel.setAttribute('aria-label', 'Language');
  LANGUAGES.forEach(({ name, label }) => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = label;
    opt.selected = name === ctx.lang; langSel.appendChild(opt);
  });
  langSel.addEventListener('change', () => {
    ctx.lang = langSel.value; migrateMastery(ctx.lang);
    ctx.selectedList = getListNames(ctx.lang)[0] ?? '';
    closePopover(); render();
  });
  langRow.appendChild(langLabel); langRow.appendChild(langSel);
  leftPane.appendChild(langRow);

  // ── Header: title, backup, restore ──────────────────────────────────────────

  const header = document.createElement('div');
  header.className = 'ml-header';
  const titleSpan = document.createElement('span');
  titleSpan.className = 'ml-sidebar-title'; titleSpan.textContent = 'Lists';

  const backupBtn = document.createElement('button');
  backupBtn.type = 'button'; backupBtn.className = 'ml-icon-btn ml-text-btn ml-backup-btn';
  backupBtn.title = 'Download a backup of every list, in every language';
  // ⭳ (U+2B73) has no glyph in the default font on a lot of mobile browsers —
  // it rendered as an invisible box there, making the button look unlabeled.
  // ↓ is in every font.
  backupBtn.innerHTML = '<span aria-hidden="true">↓</span> Backup';
  backupBtn.addEventListener('click', () => downloadBackup());

  const restoreBtn = document.createElement('button');
  restoreBtn.type = 'button'; restoreBtn.className = 'ml-icon-btn ml-text-btn ml-restore-btn';
  restoreBtn.title = 'Restore lists from a backup file (merges, never overwrites)';
  restoreBtn.innerHTML = '<span aria-hidden="true">↑</span> Restore';

  const restoreInput = document.createElement('input');
  restoreInput.type = 'file'; restoreInput.accept = 'application/json,.json';
  restoreInput.hidden = true;
  restoreBtn.addEventListener('click', () => restoreInput.click());
  restoreInput.addEventListener('change', () => {
    const file = restoreInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const summary = applyBackup(String(reader.result));
        ctx.updateBadge(); render();
        // Restore is additive, so there is nothing meaningful to undo.
        showUndo(summary, null, 6000);
      } catch (err) {
        logger.warn('list restore failed', err);
        alert((err as Error).message || 'Could not read that backup file.');
      }
      restoreInput.value = '';
    };
    reader.readAsText(file);
  });

  // Collapse All / Expand All — toggles every section at once. Labeled by
  // what it's about to do (Collapse All while anything is open, Expand All
  // once everything already is), rather than a fixed label plus a separate
  // "currently expanded/collapsed" indicator.
  const collapseAllBtn = document.createElement('button');
  collapseAllBtn.type = 'button';
  collapseAllBtn.className = 'ml-icon-btn ml-text-btn ml-collapse-all-btn';
  collapseAllBtn.addEventListener('click', () => {
    const collapseAll = !SIDEBAR_SECTIONS.every(isSectionCollapsed);
    SIDEBAR_SECTIONS.forEach(id => setSectionCollapsed(id, collapseAll));
    // In place — flips each section body's `hidden` and its caret. This used
    // to call render(), which rebuilt every card in every section *and* the
    // whole right-hand panel (renderPanel) just to hide some <ul>s.
    ctx.listNav.querySelectorAll<HTMLElement>('.ml-section-body[data-section]').forEach(body => {
      const id = body.dataset.section as SidebarSectionId;
      body.hidden = isSectionCollapsed(id);
      const caret = ctx.listNav.querySelector(`.ml-section-toggle-btn[data-section="${id}"] .ml-section-caret`);
      if (caret) caret.textContent = isSectionCollapsed(id) ? '▸' : '▾';
    });
    syncCollapseAllLabel();
  });
  function syncCollapseAllLabel(): void {
    collapseAllBtn.textContent = SIDEBAR_SECTIONS.every(isSectionCollapsed) ? 'Expand All' : 'Collapse All';
  }

  // Browse All Words — the whole vocabulary, not a list, so it lives up here
  // with the other whole-sidebar controls rather than as a card of its own.
  const browseBtn = document.createElement('button');
  browseBtn.type = 'button';
  browseBtn.className = 'ml-icon-btn ml-text-btn ml-browse-btn';
  browseBtn.title = "Browse this language's whole vocabulary";
  browseBtn.innerHTML = '<span aria-hidden="true">📖</span> Browse All Words';
  browseBtn.addEventListener('click', () => {
    ctx.selectedList = BROWSE_ALL_LIST;
    ctx.selectedSmart = null; ctx.selectedMultiList = null; ctx.selectedProfile = null; ctx.selectedVisual = null;
    closePopover(); render(); ctx.renderPanel();
  });

  header.appendChild(titleSpan);
  header.appendChild(browseBtn);
  header.appendChild(collapseAllBtn);
  header.appendChild(backupBtn); header.appendChild(restoreBtn);
  leftPane.appendChild(header);
  leftPane.appendChild(restoreInput);
  leftPane.appendChild(ctx.listNav);

  // ── The shared layers and the sections ──────────────────────────────────────
  //
  // createSidebar() used to hold every one of these as a nested function inside a single
  // 1,680-line closure. Each is now its own module (sidebar-*.ts), built here from the layer
  // beneath it and handed only what it uses. `render` and `syncCollapseAllLabel` are function
  // declarations further down, so they can be passed from here.

  const { buildActionMenu, closeAllActionMenus, emojiSpan } = createMenuKit();
  const { emojiItem, openFolderStylePicker, openHideFromPicker } =
    createPickerKit({ render, closeAllActionMenus });
  const { makeListDraggable, makeFolderDropTarget } = createDndKit({ render });
  const { sectionHead, renderEmptyFolderPlaceholders, buildFolderGroup, renderSection } = createFolderKit({
    ctx, render, syncCollapseAllLabel, buildActionMenu, emojiSpan,
    makeFolderDropTarget, openFolderStylePicker, openHideFromPicker,
  });
  const kit: SidebarKit = {
    ctx, render, sectionHead, buildActionMenu, emojiSpan, emojiItem,
    makeListDraggable, renderEmptyFolderPlaceholders, buildFolderGroup,
  };
  const { renderNav: renderSingleNav }         = createSingleSection(kit);
  const { renderNav: renderSmartNav }          = createSmartSection(kit);
  const { renderNav: renderMultiNav }          = createMultiSection(kit);
  const { renderNav: renderProfilesNav }       = createProfilesSection(kit);
  const { renderNav: renderVisualProfilesNav } = createVisualSection(kit);

  // Closes a folder's "Hide From" dropdown (see buildFolderGroup) on an
  // outside click — same convention as the same dropdown family in
  // panel.ts/multi-panel.ts/browse-panel.ts. closeAllChipDropdowns()
  // re-queries the DOM live, so this needs no updating as render() rebuilds
  // which dropdowns currently exist — it only needs registering once per
  // createSidebar() call (see the module-level outsideClickHandler note above).
  if (outsideClickHandler) document.removeEventListener('click', outsideClickHandler, true);
  outsideClickHandler = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (!t.closest('.ml-chip-dropdown')) closeAllChipDropdowns();
    if (!t.closest('.ml-menu-wrap, .ml-action-menu')) closeAllActionMenus();
  };
  document.addEventListener('click', outsideClickHandler, true);

  // ── Keyboard navigation ──────────────────────────────────────────────────────
  //
  // Every card across all four sections got tabIndex=0 in render() above, so
  // Tab/Shift+Tab already move between them in DOM order for free. This adds
  // the arrow-key shorthand a sighted mouse user gets from scanning the list
  // visually — Up/Down to the next card (skipping section heads and hints,
  // which aren't cards), Home/End to the first/last, Enter/Space to open
  // whichever card has focus. Bound once on the stable listNav container
  // (event delegation), so it survives every render() rebuilding the <li>s.
  ctx.listNav.addEventListener('keydown', e => {
    // An inline rename/create row's text input or mode <select> lives inside
    // listNav too — leave arrow keys alone there (moving a text cursor,
    // changing a select) rather than hijacking them to move between cards.
    if ((e.target as HTMLElement).matches('input, select, textarea')) return;

    const cards = [...ctx.listNav.querySelectorAll<HTMLElement>('.ml-list-item')];
    const active = document.activeElement as HTMLElement | null;
    const idx = active ? cards.indexOf(active) : -1;

    switch (e.key) {
      case 'ArrowDown':
        if (cards.length === 0) return;
        e.preventDefault();
        cards[idx === -1 ? 0 : Math.min(idx + 1, cards.length - 1)].focus();
        break;
      case 'ArrowUp':
        if (cards.length === 0) return;
        e.preventDefault();
        cards[idx === -1 ? cards.length - 1 : Math.max(idx - 1, 0)].focus();
        break;
      case 'Home':
        if (cards.length === 0) return;
        e.preventDefault();
        cards[0].focus();
        break;
      case 'End':
        if (cards.length === 0) return;
        e.preventDefault();
        cards[cards.length - 1].focus();
        break;
      case 'Enter':
      case ' ':
        // Only when the card itself has focus — an inline rename input or an
        // action button inside it handles its own Enter/Space, and this
        // would otherwise re-fire on top of that.
        if (active && idx !== -1 && active === e.target) {
          e.preventDefault();
          active.click();
        }
        break;
    }
  });

  function render(rerenderPanel = true): void {
    // render() rebuilds every <li> from scratch, which would otherwise drop
    // keyboard focus back to document.body on every arrow-key move (selecting
    // a card re-renders the sidebar to show it as .active) — losing exactly
    // the thing keyboard navigation is for. Only restores it when the
    // keyboard was actually driving (focus already inside listNav), so this
    // never steals focus from something else re-rendering the sidebar in the
    // background (e.g. a word add/remove elsewhere calling renderSidebar(false)).
    const hadFocus = ctx.listNav.contains(document.activeElement);

    ctx.listNav.innerHTML = '';
    seedStarterLists(ctx.lang);
    browseBtn.classList.toggle('ml-browse-btn--active', ctx.selectedList === BROWSE_ALL_LIST);
    renderSection('single', renderSingleNav);
    renderSection('smart', renderSmartNav);
    renderSection('multi', renderMultiNav);
    renderSection('profiles', renderProfilesNav);
    if (Settings.getShowVisualProfiles()) renderSection('visual', renderVisualProfilesNav);
    // Every card, whichever of the four sections it belongs to, is a
    // keyboard-navigable stop — see the listNav keydown handler below.
    // Collapsed rows are `hidden` (see renderSection above) rather than
    // removed, so this still tags them — nothing to keyboard-navigate to
    // while hidden, but they're ready the moment their section reopens.
    ctx.listNav.querySelectorAll<HTMLElement>('.ml-list-item').forEach(li => {
      // Focusable for arrow-key navigation, but deliberately not role=button:
      // each card holds its own real buttons (menu, folder toggles), and a
      // button may not contain interactive content.
      li.tabIndex = 0;
    });
    if (hadFocus) ctx.listNav.querySelector<HTMLElement>('.ml-list-item.active')?.focus();
    syncCollapseAllLabel();
    if (rerenderPanel) ctx.renderPanel();
  }

  return { leftPane, render };
}
