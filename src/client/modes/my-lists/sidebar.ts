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

import {
  getListNames, getList, createList, deleteList, renameList, addToList,
  getMultiListNames, getMultiList, getMultiListLanguages, getMultiListCount,
  createMultiList, deleteMultiList, renameMultiList, addToMultiList,
  getListMeta, setListMeta, getMultiListMeta, setMultiListMeta, metaFolders,
} from '../../utils/word-lists.ts';
import { getFolderRegistry, addFolder } from './folders.ts';
import { buildChecklistDropdown, closeAllChipDropdowns } from './chip-dropdown.ts';
import { readString, writeString } from '../../utils/storage.ts';
import { logger } from '../../utils/logger.ts';
import { BROWSE_ALL_LIST, type ListsCtx } from './context.ts';
import { migrateMastery } from './mastery.ts';
import { closePopover } from './move-popover.ts';
import { showUndo } from './undo-toast.ts';
import { downloadBackup, applyBackup } from './backup.ts';
import {
  getSmartNames, getSmartLists, saveSmartRule, deleteSmartList, renameSmartList,
  evaluateSmart, DEFAULT_SMART_RULE, type SmartRule,
} from './smart-lists.ts';
import { cachedVocab, fetchVocab } from './vocab-cache.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { LANGUAGES } from '../../data/languages.ts';
import { createFlagImg } from '../../ui/flag-icon.ts';
import {
  modesWithPresets, listPresets, getPreset, deletePreset, renamePreset,
  duplicatePreset, savePreset, BLANK_BUNDLE,
} from '../../filters/presets.ts';
import { SCOPE_LABELS, FILTER_SCOPES, type FilterScope } from '../../filters/filter-scope.ts';
import { Settings } from '../../settings.ts';
import {
  listVisualProfiles, getVisualProfile, saveVisualProfile, deleteVisualProfile,
  renameVisualProfile, captureCurrentVisualProfile, applyVisualProfile,
} from '../../filters/visual-profiles.ts';

const PROFILE_MODES: FilterScope[] = ['table', 'picture', 'conjugation'];

// createSidebar() runs fresh on every visit to My Lists (see my-lists-mode.ts's
// renderMyLists, called from app.ts's mode-activation dispatcher) — a plain
// `document.addEventListener` in its body would add one more listener per
// visit with nothing ever removing the previous ones. Removed-then-reassigned
// each call instead, same convention as the equivalent handler in
// panel.ts/multi-panel.ts/browse-panel.ts.
let outsideClickHandler: ((e: MouseEvent) => void) | null = null;

// ── Collapsible sections ──────────────────────────────────────────────────
//
// The four multi-row sections (Single-Language/Smart/Cross-Language Lists,
// Testing Profiles) — not Browse All Words, which is a single static entry
// with nothing to collapse. Persisted per section so a learner who's parked
// a section closed (e.g. Smart Lists they rarely touch) keeps it that way
// across visits, same convention as profile-panel.ts's own field-group
// collapse state (`ml_profile_group_open_<id>`).
// 'visual' (Visual Profiles) only actually renders when
// Settings.getShowVisualProfiles() is on — included here regardless so
// Collapse All/Expand All still remembers its state for whenever it's
// switched on.
const SIDEBAR_SECTIONS = ['single', 'smart', 'multi', 'profiles', 'visual'] as const;
type SidebarSectionId = (typeof SIDEBAR_SECTIONS)[number];

function isSectionCollapsed(id: SidebarSectionId): boolean {
  return readString(`ml_sidebar_section_collapsed_${id}`) === 'true';
}
function setSectionCollapsed(id: SidebarSectionId, collapsed: boolean): void {
  writeString(`ml_sidebar_section_collapsed_${id}`, String(collapsed));
}

/** Same idea, one level deeper — a folder within a section (see
 *  renderSection()'s own folder regrouping). Keyed by section + folder name
 *  so two sections can each have a same-named folder collapsed independently. */
function isFolderCollapsed(sectionId: SidebarSectionId, folder: string): boolean {
  return readString(`ml_sidebar_folder_collapsed_${sectionId}_${folder}`) === 'true';
}
function setFolderCollapsed(sectionId: SidebarSectionId, folder: string, collapsed: boolean): void {
  writeString(`ml_sidebar_folder_collapsed_${sectionId}_${folder}`, String(collapsed));
}

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
    render();
  });

  header.appendChild(titleSpan);
  header.appendChild(collapseAllBtn);
  header.appendChild(backupBtn); header.appendChild(restoreBtn);
  leftPane.appendChild(header);
  leftPane.appendChild(restoreInput);
  leftPane.appendChild(ctx.listNav);

  // Closes a folder's "Hide From" dropdown (see buildFolderGroup) on an
  // outside click — same convention as the same dropdown family in
  // panel.ts/multi-panel.ts/browse-panel.ts. closeAllChipDropdowns()
  // re-queries the DOM live, so this needs no updating as render() rebuilds
  // which dropdowns currently exist — it only needs registering once per
  // createSidebar() call (see the module-level outsideClickHandler note above).
  if (outsideClickHandler) document.removeEventListener('click', outsideClickHandler, true);
  outsideClickHandler = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.ml-chip-dropdown')) closeAllChipDropdowns();
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

  // ── Shared row-building helpers ─────────────────────────────────────────────

  /** A section head: label + optional "+ New" and "+ Folder". Shared shape
   *  across all four sections so the sidebar reads as one family of lists. */
  function sectionHead(
    cls: string, label: string, newTitle?: string, onNew?: () => void, folderScope?: string,
  ): HTMLLIElement {
    const head = document.createElement('li');
    head.className = cls;
    const headLabel = document.createElement('span');
    headLabel.textContent = label;
    head.appendChild(headLabel);

    // Both buttons share one flex group so `justify-content: space-between`
    // on the head (label vs. actions) doesn't also spread the two buttons
    // apart from *each other* — they used to end up on opposite ends of the
    // row instead of side by side.
    const btnGroup = document.createElement('span');
    btnGroup.className = 'ml-section-head-btns';
    // "+ Folder" before "+ New" — creating an (initially empty) folder to
    // drop things into reads as the more structural action of the two.
    if (folderScope) {
      const folderBtn = document.createElement('button');
      folderBtn.type = 'button'; folderBtn.className = 'ml-new-list-btn ml-new-folder-btn';
      folderBtn.title = 'Create a new folder'; folderBtn.textContent = '+ Folder';
      folderBtn.addEventListener('click', () => {
        const name = window.prompt('New folder name:');
        if (!name?.trim()) return;
        if (!addFolder(folderScope, name)) { alert(`A folder named "${name.trim()}" already exists.`); return; }
        render();
      });
      btnGroup.appendChild(folderBtn);
    }
    if (onNew) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button'; addBtn.className = 'ml-new-list-btn';
      addBtn.title = newTitle ?? 'Create new'; addBtn.textContent = '+ New';
      addBtn.addEventListener('click', onNew);
      btnGroup.appendChild(addBtn);
    }
    if (btnGroup.children.length > 0) head.appendChild(btnGroup);
    return head;
  }

  /** One Copy/Rename/Delete (or a subset) button, in the shared labeled style. */
  function actionBtn(
    glyph: string, label: string, title: string, onClick: (e: MouseEvent) => void, danger = false,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ml-icon-btn ml-icon-btn--labeled' + (danger ? ' ml-icon-btn--danger' : '');
    btn.title = title;
    btn.innerHTML = `<span aria-hidden="true">${glyph}</span> ${label}`;
    btn.addEventListener('click', onClick);
    return btn;
  }

  /**
   * "⚙ Settings" — a gear button that toggles an inline panel (Folder, and
   * optionally Hide-from-mode checkboxes or a language-lock checkbox) below
   * a card, same expand-in-place pattern as My Content's own row editors
   * rather than a separate popover. Shared by all four sections so Folder
   * means the same thing and lives in the same place on every kind of card.
   */
  function buildSettingsToggle(panel: HTMLElement): HTMLButtonElement {
    // Every card this panel sits inside is itself a big click target (click
    // anywhere on the card to select it) — without this, clicking the
    // folder input or a checkbox inside the open panel would bubble up and
    // re-select/re-render the card out from under the very control just
    // clicked.
    panel.addEventListener('click', e => e.stopPropagation());
    const btn = actionBtn('⚙', 'Settings', 'Folder and visibility settings', e => {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
    });
    return btn;
  }

  /**
   * Folder membership — a checkbox per folder registered in `scope` (see
   * folders.ts), so a list/rule/profile can belong to any number of them at
   * once, plus an inline "+ new folder" creator. `current` is this item's
   * own `folders` array; `onChange` receives the full replacement array on
   * every toggle.
   */
  function buildFoldersRow(current: string[], scope: string, onChange: (folders: string[]) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ml-settings-row ml-settings-row--hide';
    const label = document.createElement('span');
    label.className = 'ml-settings-label';
    label.textContent = 'Folders';
    row.appendChild(label);

    const allFolders = [...new Set([...getFolderRegistry(scope), ...current])].sort((a, b) => a.localeCompare(b));
    allFolders.forEach(folder => {
      const cbLabel = document.createElement('label');
      cbLabel.className = 'ml-settings-hide-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = current.includes(folder);
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', () => {
        const next = cb.checked ? [...current, folder] : current.filter(f => f !== folder);
        onChange(next);
        render();
      });
      cbLabel.append(cb, document.createTextNode(folder));
      row.appendChild(cbLabel);
    });

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'ml-icon-btn';
    newBtn.textContent = '+ new…';
    newBtn.addEventListener('click', e => {
      e.stopPropagation();
      const name = window.prompt('New folder name:');
      if (!name?.trim()) return;
      addFolder(scope, name);
      onChange([...current, name.trim()]);
      render();
    });
    row.appendChild(newBtn);
    return row;
  }

  /** The "Hide from" checkbox row — every FilterScope this list/smart list
   *  can be excluded from as a filter option (still addable-to regardless). */
  function buildHideModesRow(hiddenModes: FilterScope[], onChange: (modes: FilterScope[]) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ml-settings-row ml-settings-row--hide';
    const label = document.createElement('span');
    label.className = 'ml-settings-label';
    label.textContent = 'Hide From';
    row.appendChild(label);
    FILTER_SCOPES.forEach(scope => {
      const cbLabel = document.createElement('label');
      cbLabel.className = 'ml-settings-hide-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = hiddenModes.includes(scope);
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', () => {
        const next = cb.checked ? [...hiddenModes, scope] : hiddenModes.filter(s => s !== scope);
        onChange(next);
      });
      cbLabel.append(cb, document.createTextNode(SCOPE_LABELS[scope]));
      row.appendChild(cbLabel);
    });
    return row;
  }


  // ── Browse All Words ─────────────────────────────────────────────────────
  // A single static entry, not a section — there's nothing to create, copy,
  // rename or delete here, just the language's whole vocabulary to look at,
  // so it skips sectionHead's "+ New" and every card's action row.

  function renderBrowseNav(): void {
    const li = document.createElement('li');
    li.className = 'ml-list-item ml-browse-item'
      + (ctx.selectedList === BROWSE_ALL_LIST ? ' active' : '');
    li.textContent = '📖 Browse All Words';
    li.addEventListener('click', () => {
      ctx.selectedList = BROWSE_ALL_LIST;
      ctx.selectedSmart = null; ctx.selectedMultiList = null; ctx.selectedProfile = null;
      closePopover(); render(); ctx.renderPanel();
    });
    ctx.listNav.appendChild(li);
  }

  /**
   * A folder registered in `scope` (folders.ts) but with no list currently
   * tagged into it (`usedFolders`) would otherwise never appear at all —
   * renderSection()'s generic folder pass only discovers folders from rows'
   * own `data-folder`. One empty placeholder `<li>` per such folder gives it
   * that same `data-folder` tag, so an intentionally-created-but-not-yet-
   * populated folder still shows up as its own collapsible row.
   */
  function renderEmptyFolderPlaceholders(scope: string, usedFolders: string[]): void {
    const used = new Set(usedFolders);
    getFolderRegistry(scope).filter(f => !used.has(f)).forEach(folder => {
      const li = document.createElement('li');
      li.className = 'ml-list-empty';
      li.textContent = 'No lists in this folder yet.';
      li.dataset.folder = folder;
      ctx.listNav.appendChild(li);
    });
  }

  // ── Single-Language Lists ───────────────────────────────────────────────────

  function renderSingleNav(): void {
    const folderScope = `single_${ctx.lang}`;
    ctx.listNav.appendChild(sectionHead(
      'ml-single-head', 'Single-Language Lists', 'Create a new list', () => startCreateList(), folderScope,
    ));

    const names = getListNames(ctx.lang);
    if (names.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ml-list-empty'; empty.textContent = 'No lists yet.';
      ctx.listNav.appendChild(empty);
      // Leaves BROWSE_ALL_LIST alone — Browse All Words doesn't need any
      // real list to exist, so having none yet shouldn't bump it back to ''.
      if (ctx.selectedList !== BROWSE_ALL_LIST) ctx.selectedList = '';
      renderEmptyFolderPlaceholders(folderScope, []);
      return;
    }
    if (ctx.selectedList !== BROWSE_ALL_LIST && !names.includes(ctx.selectedList)) ctx.selectedList = names[0];

    const usedFolders = new Set<string>();

    // A list belonging to more than one folder gets one row per folder (plus
    // one ungrouped row if it belongs to none) — every row acts on the same
    // underlying list, so editing/deleting from any one of them is correct.
    names.forEach(name => {
      const meta = getListMeta(ctx.lang, name);
      const folders = metaFolders(meta);
      folders.forEach(f => usedFolders.add(f));
      const instances = folders.length > 0 ? folders : [''];

      instances.forEach(folder => {
        const li = document.createElement('li');
        li.className = 'ml-list-item ml-list-item--full ml-single-item'
          + (name === ctx.selectedList ? ' active' : '');
        li.dataset.folder = folder;
        makeListDraggable(li, { kind: 'single', lang: ctx.lang, name });

        const topRow = document.createElement('div');
        topRow.className = 'ml-list-row-top';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'ml-list-name'; nameSpan.textContent = name; nameSpan.title = name;
        const countSpan = document.createElement('span');
        countSpan.className = 'ml-list-count';
        const n = getList(ctx.lang, name).length;
        countSpan.textContent = `${n} word${n === 1 ? '' : 's'}`;
        topRow.append(nameSpan, countSpan);

        const actions = document.createElement('span');
        actions.className = 'ml-list-actions ml-list-actions--full';

        // Folder membership and Hide-from-mode are edited from the Part of
        // Speech/Level dropdown row in panel.ts now, next to this list's own
        // word filters, rather than a separate "⚙ Settings" gear here.
        const dupBtn = actionBtn('⧉', 'Copy', 'Duplicate list', e => {
          e.stopPropagation();
          const copied = startCopyList(ctx.lang, name);
          if (copied) { ctx.selectedList = copied; ctx.updateBadge(); render(); }
        });
        const renameBtn = actionBtn('✏', 'Rename', 'Rename', e => {
          e.stopPropagation(); startRenameList(name, li, nameSpan);
        });
        const deleteBtn = actionBtn('🗑', 'Delete', 'Delete list', e => {
          e.stopPropagation();
          if (!window.confirm(`Delete list "${name}" and all its words?`)) return;
          // Snapshot before deleting so the whole list can come back intact.
          const words       = [...getList(ctx.lang, name)];
          const wasSelected = ctx.selectedList === name;

          deleteList(ctx.lang, name);
          if (wasSelected) ctx.selectedList = '';
          ctx.updateBadge(); render();

          showUndo(`Deleted "${name}" (${words.length} words)`, () => {
            createList(ctx.lang, name);
            words.forEach(w => addToList(ctx.lang, name, w));
            if (wasSelected) ctx.selectedList = name;
            ctx.updateBadge(); render();
          });
        }, true);

        actions.append(dupBtn, renameBtn, deleteBtn);
        li.append(topRow, actions);
        li.addEventListener('click', () => {
          ctx.selectedList = name; ctx.selectedSmart = null;
          ctx.selectedMultiList = null; ctx.selectedProfile = null;
          closePopover(); render(); ctx.renderPanel();
        });
        ctx.listNav.appendChild(li);
      });
    });

    renderEmptyFolderPlaceholders(folderScope, [...usedFolders]);
  }

  // ── Smart lists ────────────────────────────────────────────────────────────

  function renderSmartNav(): void {
    const folderScope = `smart_${ctx.lang}`;
    const head = sectionHead(
      'ml-smart-head', 'Smart Lists', 'Create a smart list — a saved query that stays current',
      () => startCreateSmart(head), folderScope,
    );
    ctx.listNav.appendChild(head);

    const smartNames = getSmartNames(ctx.lang);
    if (smartNames.length === 0) {
      const hint = document.createElement('li');
      hint.className = 'ml-list-empty ml-smart-hint';
      hint.textContent = 'e.g. "B1 verbs I haven’t learned"';
      ctx.listNav.appendChild(hint);
      renderEmptyFolderPlaceholders(folderScope, []);
      return;
    }

    // How many words each rule currently matches — computed against whatever
    // vocabulary is cached right now, then refreshed in place (not a full
    // re-render — that would re-trigger this same fetch and loop) once it
    // finishes loading for a language that wasn't cached yet.
    const smartCountEls: { el: HTMLElement; rule: SmartRule }[] = [];
    function paintSmartCount(el: HTMLElement, rule: SmartRule, vocab = cachedVocab(ctx.lang)): void {
      const n = evaluateSmart(ctx.lang, rule, vocab).length;
      el.textContent = `${n} word${n === 1 ? '' : 's'}`;
    }

    const usedFolders = new Set<string>();

    smartNames.forEach(name => {
      const rule = getSmartLists(ctx.lang)[name];
      const folders = rule.folders ?? [];
      folders.forEach(f => usedFolders.add(f));
      const instances = folders.length > 0 ? folders : [''];

      instances.forEach(folder => {
      const li = document.createElement('li');
      li.className = 'ml-list-item ml-list-item--full ml-smart-item'
        + (name === ctx.selectedSmart ? ' active' : '');
      li.dataset.folder = folder;
      makeListDraggable(li, { kind: 'smart', lang: ctx.lang, name });

      const topRow = document.createElement('div');
      topRow.className = 'ml-list-row-top';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'ml-list-name';
      nameSpan.textContent = name;
      const countSpan = document.createElement('span');
      countSpan.className = 'ml-list-count';
      paintSmartCount(countSpan, rule);
      smartCountEls.push({ el: countSpan, rule });
      topRow.append(nameSpan, countSpan);

      const actions = document.createElement('span');
      actions.className = 'ml-list-actions ml-list-actions--full';

      const settingsPanel = document.createElement('div');
      settingsPanel.className = 'ml-settings-panel';
      settingsPanel.hidden = true;
      settingsPanel.appendChild(buildFoldersRow(rule.folders ?? [], folderScope, next => {
        saveSmartRule(ctx.lang, name, { ...rule, folders: next, folder: undefined });
      }));
      settingsPanel.appendChild(buildHideModesRow(rule.hiddenModes ?? [], modes => {
        saveSmartRule(ctx.lang, name, { ...rule, hiddenModes: modes });
      }));
      const settingsBtn = buildSettingsToggle(settingsPanel);

      const dupBtn = actionBtn('⧉', 'Copy', 'Duplicate smart list', e => {
        e.stopPropagation();
        const proposed = suggestSmartCopyName(ctx.lang, name);
        const input = window.prompt(`Name for the copy of "${name}":`, proposed);
        if (input === null) return;
        const newName = input.trim();
        if (!newName) return;
        if (getSmartNames(ctx.lang).includes(newName)) {
          alert(`A smart list named "${newName}" already exists.`); return;
        }
        saveSmartRule(ctx.lang, newName, { ...rule });
        ctx.selectedSmart = newName; ctx.selectedList = ''; ctx.selectedMultiList = null; ctx.selectedProfile = null;
        render();
      });
      const renameBtn = actionBtn('✏', 'Rename', 'Rename', e => {
        e.stopPropagation(); startRenameSmart(name, li, nameSpan);
      });
      const deleteBtn = actionBtn('🗑', 'Delete', 'Delete this smart list', e => {
        e.stopPropagation();
        if (!window.confirm(`Delete smart list "${name}"? The words themselves are untouched.`)) return;
        deleteSmartList(ctx.lang, name);
        if (ctx.selectedSmart === name) ctx.selectedSmart = null;
        render();
      }, true);

      actions.append(settingsBtn, dupBtn, renameBtn, deleteBtn);
      li.append(topRow, actions, settingsPanel);
      li.addEventListener('click', () => {
        ctx.selectedSmart = name; ctx.selectedMultiList = null; ctx.selectedProfile = null;
        closePopover(); render();
      });
      ctx.listNav.appendChild(li);
      });
    });

    renderEmptyFolderPlaceholders(folderScope, [...usedFolders]);

    if (cachedVocab(ctx.lang).length === 0) {
      fetchVocab(ctx.lang).then(vocab => {
        smartCountEls.forEach(({ el, rule }) => paintSmartCount(el, rule, vocab));
      }).catch(() => {});
    }
  }

  function suggestSmartCopyName(lang: string, sourceName: string): string {
    const names = getSmartNames(lang);
    let candidate = sourceName + ' (copy)';
    let n = 2;
    while (names.includes(candidate)) candidate = `${sourceName} (${n++})`;
    return candidate;
  }

  /** Inline creation row, the same shape startCreateList/startCreateProfile
   *  use — this used to be a window.prompt() with no collision check at all,
   *  so naming a new smart list the same as an existing one silently
   *  overwrote that list's rule with a fresh default one. */
  function startCreateSmart(afterHead: HTMLElement): void {
    const li = document.createElement('li');
    li.className = 'ml-list-item ml-list-item--editing';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'Smart list name...'; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'ml-icon-btn'; cancelBtn.textContent = '✕';
    function confirmCreate(): void {
      const name = inp.value.trim(); if (!name) { li.remove(); return; }
      if (getSmartNames(ctx.lang).includes(name)) {
        alert(`A smart list named "${name}" already exists.`); return;
      }
      saveSmartRule(ctx.lang, name, { ...DEFAULT_SMART_RULE });
      ctx.selectedList = ''; ctx.selectedMultiList = null; ctx.selectedProfile = null;
      ctx.selectedSmart = name;
      render();
    }
    okBtn.addEventListener('click', confirmCreate);
    cancelBtn.addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') li.remove();
    });
    li.append(inp, okBtn, cancelBtn);
    afterHead.insertAdjacentElement('afterend', li);
    inp.focus();
  }

  function startRenameSmart(oldName: string, li: HTMLElement, nameSpan: HTMLElement): void {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = oldName; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    function confirmRename(): void {
      const newName = inp.value.trim();
      if (!newName || newName === oldName) { done(); return; }
      if (renameSmartList(ctx.lang, oldName, newName)) {
        if (ctx.selectedSmart === oldName) ctx.selectedSmart = newName;
        render();
      } else { alert(`A smart list named "${newName}" already exists.`); inp.focus(); }
    }
    function done(): void { inp.replaceWith(nameSpan); okBtn.remove(); }
    okBtn.addEventListener('click', confirmRename);
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') done();
    });
    nameSpan.replaceWith(inp);
    li.querySelector('.ml-list-row-top')?.appendChild(okBtn);
    inp.focus(); inp.select();
  }

  // ── Cross-language lists ────────────────────────────────────────────────────
  //
  // Not scoped to ctx.lang — a cross-language list holds words from however
  // many languages have been added to it, either from the star-button picker
  // on a word elsewhere, or from its own Add Vocabulary box (multi-panel.ts).

  function renderMultiNav(): void {
    const folderScope = 'multi';
    const head = sectionHead(
      'ml-multi-head', 'Cross-Language Lists', 'Create a list that can hold words from any language',
      () => startCreateMulti(head), folderScope,
    );
    ctx.listNav.appendChild(head);

    const names = getMultiListNames();
    if (names.length === 0) {
      const hint = document.createElement('li');
      hint.className = 'ml-list-empty ml-smart-hint';
      hint.textContent = 'Add words from its own panel, or the ★ button on any word';
      ctx.listNav.appendChild(hint);
      ctx.selectedMultiList = null;
      renderEmptyFolderPlaceholders(folderScope, []);
      return;
    }
    // Same fallback the single-language list section runs above:
    // removeFromMultiList deletes a cross-language list the instant its last
    // word leaves (same as an ordinary list), so the one just emptied can
    // vanish out from under whichever list happened to be selected. Without
    // this, the sidebar dropped it from the nav entirely while the panel on
    // the right kept rendering it as still selected — a "0 words" ghost of a
    // list that no longer existed in storage.
    if (ctx.selectedMultiList && !names.includes(ctx.selectedMultiList)) ctx.selectedMultiList = null;

    const usedFolders = new Set<string>();

    names.forEach(name => {
      const meta = getMultiListMeta(name);
      const folders = metaFolders(meta);
      folders.forEach(f => usedFolders.add(f));
      const instances = folders.length > 0 ? folders : [''];

      instances.forEach(folder => {
      const li = document.createElement('li');
      li.className = 'ml-list-item ml-list-item--full ml-multi-item'
        + (name === ctx.selectedMultiList ? ' active' : '');
      li.dataset.folder = folder;
      makeListDraggable(li, { kind: 'multi', name });

      // Name on its own line — the flags can run to several, and a word
      // count next to a long name plus several flags was cramped onto one
      // line together.
      const topRow = document.createElement('div');
      topRow.className = 'ml-list-row-top';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'ml-list-name'; nameSpan.textContent = name; nameSpan.title = name;
      topRow.appendChild(nameSpan);

      const metaRow = document.createElement('div');
      metaRow.className = 'ml-list-row-meta';
      const badge = buildLangBadge(getMultiListLanguages(name));
      const countSpan = document.createElement('span');
      countSpan.className = 'ml-list-count';
      const n = getMultiListCount(name);
      countSpan.textContent = `${n} word${n === 1 ? '' : 's'}`;
      metaRow.append(badge, countSpan);

      const actions = document.createElement('span');
      actions.className = 'ml-list-actions ml-list-actions--full';

      // Folder membership and Hide-from-mode are edited from the Part of
      // Speech/Level dropdown row in multi-panel.ts now, not a "⚙ Settings"
      // gear here.
      const dupBtn = actionBtn('⧉', 'Copy', 'Duplicate cross-language list', e => {
        e.stopPropagation();
        const proposed = suggestMultiCopyName(name);
        const input = window.prompt(`Name for the copy of "${name}":`, proposed);
        if (input === null) return;
        const newName = input.trim();
        if (!newName) return;
        if (!createMultiList(newName)) { alert(`A cross-language list named "${newName}" already exists.`); return; }
        for (const entry of getMultiList(name)) addToMultiList(newName, entry.word, entry.language);
        ctx.selectedMultiList = newName; ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedProfile = null;
        render();
      });
      const renameBtn = actionBtn('✏', 'Rename', 'Rename', e => {
        e.stopPropagation();
        const newName = window.prompt('Rename cross-language list:', name);
        if (!newName?.trim() || newName.trim() === name) return;
        if (renameMultiList(name, newName.trim())) {
          if (ctx.selectedMultiList === name) ctx.selectedMultiList = newName.trim();
          render();
        } else {
          alert(`A cross-language list named "${newName.trim()}" already exists.`);
        }
      });
      const deleteBtn = actionBtn('🗑', 'Delete', 'Delete list', e => {
        e.stopPropagation();
        if (!window.confirm(`Delete cross-language list "${name}" and all its words?`)) return;
        const entries      = getMultiList(name);
        const wasSelected  = ctx.selectedMultiList === name;

        deleteMultiList(name);
        if (wasSelected) ctx.selectedMultiList = null;
        render();

        showUndo(`Deleted "${name}" (${entries.length} words)`, () => {
          createMultiList(name);
          entries.forEach(e => addToMultiList(name, e.word, e.language));
          if (wasSelected) ctx.selectedMultiList = name;
          render();
        });
      }, true);

      actions.append(dupBtn, renameBtn, deleteBtn);
      li.append(topRow, metaRow, actions);
      li.addEventListener('click', () => {
        ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedProfile = null;
        ctx.selectedMultiList = name;
        closePopover(); render();
      });
      ctx.listNav.appendChild(li);
      });
    });

    renderEmptyFolderPlaceholders(folderScope, [...usedFolders]);
  }

  function suggestMultiCopyName(sourceName: string): string {
    const names = getMultiListNames();
    let candidate = sourceName + ' (copy)';
    let n = 2;
    while (names.includes(candidate)) candidate = `${sourceName} (${n++})`;
    return candidate;
  }

  /** Inline creation row, the same shape startCreateList/startCreateProfile
   *  use — this used to be a window.prompt(). */
  function startCreateMulti(afterHead: HTMLElement): void {
    const li = document.createElement('li');
    li.className = 'ml-list-item ml-list-item--editing';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'List name...'; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'ml-icon-btn'; cancelBtn.textContent = '✕';
    function confirmCreate(): void {
      const name = inp.value.trim(); if (!name) { li.remove(); return; }
      if (!createMultiList(name)) { alert(`A cross-language list named "${name}" already exists.`); return; }
      ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedProfile = null;
      ctx.selectedMultiList = name;
      render();
    }
    okBtn.addEventListener('click', confirmCreate);
    cancelBtn.addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') li.remove();
    });
    li.append(inp, okBtn, cancelBtn);
    afterHead.insertAdjacentElement('afterend', li);
    inp.focus();
  }

  // ── Testing Profiles ──────────────────────────────────────────────────────
  //
  // Not scoped to ctx.lang (a profile can apply to any language it was saved
  // under — see presets.ts) and not tied to a word list at all, but otherwise
  // the same shape as every other section: select a row to open it in the
  // main panel (profile-panel.ts), Copy/Rename/Delete below each row.
  // Grouped by the mode the profile belongs to (Table/Picture/Conjugation),
  // since a name is only unique within its own mode.

  function renderProfilesNav(): void {
    const head = sectionHead(
      'ml-profile-head', 'Testing Profiles', 'Create a new testing profile', () => startCreateProfile(head),
    );
    ctx.listNav.appendChild(head);

    const modes = modesWithPresets();
    if (modes.length === 0) {
      const hint = document.createElement('li');
      hint.className = 'ml-list-empty ml-smart-hint';
      hint.textContent = 'Create one here, or save one from the Profiles button on Table, Picture Quiz or Conjugation';
      ctx.listNav.appendChild(hint);
      return;
    }

    modes.forEach(mode => {
      // Folder sub-grouping, scoped to this mode — a "Vocabulary" folder in
      // Table shouldn't merge with a same-named one in Picture Quiz. Handled
      // locally rather than through renderSection()'s generic folder pass
      // (which has no notion of a mode boundary), so profile rows never get
      // `data-folder` — see buildProfileRow below. A profile in more than
      // one folder is listed under each (same "appears everywhere it's
      // labeled" model the live Lists filter box uses).
      const profileFolderScope = `profiles_${mode}`;

      const modeHead = document.createElement('li');
      modeHead.className = 'ml-profile-mode-head';
      const modeLabel = document.createElement('span');
      modeLabel.textContent = SCOPE_LABELS[mode];
      modeHead.appendChild(modeLabel);
      const modeFolderBtn = document.createElement('button');
      modeFolderBtn.type = 'button'; modeFolderBtn.className = 'ml-new-list-btn ml-new-folder-btn';
      modeFolderBtn.title = `Create a new folder for ${SCOPE_LABELS[mode]} profiles`;
      modeFolderBtn.textContent = '+ Folder';
      modeFolderBtn.addEventListener('click', () => {
        const name = window.prompt('New folder name:');
        if (!name?.trim()) return;
        if (!addFolder(profileFolderScope, name)) { alert(`A folder named "${name.trim()}" already exists.`); return; }
        render();
      });
      modeHead.appendChild(modeFolderBtn);
      ctx.listNav.appendChild(modeHead);

      const names = listPresets(mode);
      // Locked to the sidebar's current language via a bundle a learner set
      // "only show for [language]" on (see the language-lock checkbox
      // below) — filtered out here so switching languages actually hides
      // it, not just informational. Unlocked profiles (the vast majority)
      // are unaffected regardless of `language` — that field alone is only
      // a default pool source, per PresetBundle's own doc comment.
      const visibleNames = names.filter(name => {
        const bundle = getPreset(mode, name);
        return !(bundle?.languageLocked && bundle.language && bundle.language !== ctx.lang);
      });

      const byFolder = new Map<string, string[]>();
      visibleNames.forEach(name => {
        const bundle = getPreset(mode, name);
        const folders = bundle?.folders ?? [];
        const instances = folders.length > 0 ? folders : [''];
        instances.forEach(folder => byFolder.set(folder, [...(byFolder.get(folder) ?? []), name]));
      });

      function buildProfileRow(name: string, target: HTMLElement = ctx.listNav): void {
        const bundle = getPreset(mode, name);
        const selected = ctx.selectedProfile?.mode === mode && ctx.selectedProfile.name === name;
        const li = document.createElement('li');
        li.className = 'ml-list-item ml-list-item--full ml-profile-item' + (selected ? ' active' : '');

        const topRow = document.createElement('div');
        topRow.className = 'ml-list-row-top';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'ml-list-name';
        nameSpan.textContent = name;
        topRow.appendChild(nameSpan);
        // Informational whenever a default language is set, regardless of
        // whether it's locked — a quick visual cue for what this profile is
        // "for" even when it can still be applied anywhere.
        if (bundle?.language) {
          const lang = LANGUAGES.find(l => l.name === bundle.language);
          if (lang) topRow.appendChild(createFlagImg(lang.flagCountry, lang.label));
        }

        const actions = document.createElement('span');
        actions.className = 'ml-list-actions ml-list-actions--full';

        const settingsPanel = document.createElement('div');
        settingsPanel.className = 'ml-settings-panel';
        settingsPanel.hidden = true;
        settingsPanel.appendChild(buildFoldersRow(bundle?.folders ?? [], profileFolderScope, next => {
          if (bundle) savePreset(mode, name, { ...bundle, folders: next, folder: undefined });
        }));
        if (bundle?.language) {
          const lockRow = document.createElement('div');
          lockRow.className = 'ml-settings-row';
          const lockLabel = document.createElement('label');
          lockLabel.className = 'ml-settings-hide-item';
          const lockCb = document.createElement('input');
          lockCb.type = 'checkbox';
          lockCb.checked = !!bundle.languageLocked;
          lockCb.addEventListener('click', e => e.stopPropagation());
          lockCb.addEventListener('change', () => {
            savePreset(mode, name, { ...bundle, languageLocked: lockCb.checked });
            render();
          });
          const langLabel = LANGUAGES.find(l => l.name === bundle.language)?.label ?? bundle.language;
          lockLabel.append(lockCb, document.createTextNode(`Only show for ${langLabel}`));
          lockRow.appendChild(lockLabel);
          settingsPanel.appendChild(lockRow);
        }
        const settingsBtn = buildSettingsToggle(settingsPanel);

        const dupBtn = actionBtn('⧉', 'Copy', 'Duplicate profile', e => {
          e.stopPropagation();
          const proposed = suggestProfileCopyName(mode, name);
          const input = window.prompt(`Name for the copy of "${name}":`, proposed);
          if (input === null) return;
          const newName = input.trim();
          if (!newName) return;
          if (!duplicatePreset(mode, name, newName)) {
            alert(`A profile named "${newName}" already exists for ${SCOPE_LABELS[mode]}.`); return;
          }
          ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedMultiList = null;
          ctx.selectedProfile = { mode, name: newName };
          render();
        });
        const renameBtn = actionBtn('✏', 'Rename', 'Rename', e => {
          e.stopPropagation(); startRenameProfile(mode, name, li, nameSpan);
        });
        const deleteBtn = actionBtn('🗑', 'Delete', 'Delete profile', e => {
          e.stopPropagation();
          if (!window.confirm(`Delete profile "${name}"?`)) return;
          deletePreset(mode, name);
          if (selected) ctx.selectedProfile = null;
          render();
        }, true);

        actions.append(settingsBtn, dupBtn, renameBtn, deleteBtn);
        li.append(topRow, actions, settingsPanel);
        li.addEventListener('click', () => {
          ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedMultiList = null;
          ctx.selectedProfile = { mode, name };
          closePopover(); render();
        });
        target.appendChild(li);
      }

      // Folders first (see renderSection()'s own folders-before-ungrouped
      // ordering), then whatever hasn't been filed into one.
      // Registered-but-empty folders (this mode's "+ Folder" above, or the
      // "+ new…" from inside a profile's own settings panel — see
      // buildFoldersRow) are unioned in here so a freshly-created one still
      // shows up with nothing in it yet.
      const allModeFolders = new Set([...byFolder.keys(), ...getFolderRegistry(profileFolderScope)]);
      [...allModeFolders].filter(Boolean).sort().forEach(folder => {
        const folderId = `profiles:${mode}:${folder}`;
        const group = buildFolderGroup('profiles', folderId, folder);
        const folderBody = group.querySelector<HTMLUListElement>('.ml-folder-body')!;
        ctx.listNav.appendChild(group);

        const namesInFolder = byFolder.get(folder) ?? [];
        if (namesInFolder.length === 0) {
          const empty = document.createElement('li');
          empty.className = 'ml-list-empty';
          empty.textContent = 'No profiles in this folder yet.';
          folderBody.appendChild(empty);
        }
        namesInFolder.forEach(name => buildProfileRow(name, folderBody));
      });
      (byFolder.get('') ?? []).forEach(name => buildProfileRow(name));
    });
  }

  function suggestProfileCopyName(mode: FilterScope, sourceName: string): string {
    const names = listPresets(mode);
    let candidate = sourceName + ' (copy)';
    let n = 2;
    while (names.includes(candidate)) candidate = `${sourceName} (${n++})`;
    return candidate;
  }

  // ── Visual Profiles ──────────────────────────────────────────────────────
  // Saved display preferences (Theme, Font Size — see visual-profiles.ts),
  // shown right under Testing Profiles when Settings.getShowVisualProfiles()
  // is on. Unlike every other section, a row has no right-hand panel of its
  // own to select into — clicking one applies it immediately, since "look at
  // this Visual Profile" isn't a meaningful action separate from "use it".

  function renderVisualProfilesNav(): void {
    const head = sectionHead(
      'ml-profile-head', 'Visual Profiles',
      'Save your current Theme and Font Size as a reusable profile',
      () => startCreateVisualProfile(),
    );
    ctx.listNav.appendChild(head);

    const names = listVisualProfiles();
    if (names.length === 0) {
      const hint = document.createElement('li');
      hint.className = 'ml-list-empty ml-smart-hint';
      hint.textContent = 'Save your current Theme and Font Size as a reusable profile';
      ctx.listNav.appendChild(hint);
      return;
    }

    names.forEach(name => {
      const li = document.createElement('li');
      li.className = 'ml-list-item ml-list-item--full ml-profile-item';
      li.title = `Click to apply "${name}"`;

      const topRow = document.createElement('div');
      topRow.className = 'ml-list-row-top';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'ml-list-name';
      nameSpan.textContent = name;
      topRow.appendChild(nameSpan);

      const actions = document.createElement('span');
      actions.className = 'ml-list-actions ml-list-actions--full';
      const renameBtn = actionBtn('✏', 'Rename', 'Rename', e => {
        e.stopPropagation(); startRenameVisualProfile(name);
      });
      const deleteBtn = actionBtn('🗑', 'Delete', 'Delete visual profile', e => {
        e.stopPropagation();
        if (!window.confirm(`Delete visual profile "${name}"?`)) return;
        deleteVisualProfile(name);
        render();
      }, true);
      actions.append(renameBtn, deleteBtn);

      li.append(topRow, actions);
      li.addEventListener('click', () => {
        const profile = getVisualProfile(name);
        if (profile) applyVisualProfile(profile);
      });
      ctx.listNav.appendChild(li);
    });
  }

  function startCreateVisualProfile(): void {
    const name = window.prompt('Name this Visual Profile (captures your current Theme and Font Size):');
    if (!name?.trim()) return;
    if (listVisualProfiles().includes(name.trim())) {
      alert(`A visual profile named "${name.trim()}" already exists.`); return;
    }
    saveVisualProfile(name.trim(), captureCurrentVisualProfile());
    render();
  }

  function startRenameVisualProfile(name: string): void {
    const newName = window.prompt('Rename visual profile:', name);
    if (!newName?.trim() || newName.trim() === name) return;
    if (!renameVisualProfile(name, newName.trim())) {
      alert(`A visual profile named "${newName.trim()}" already exists.`);
      return;
    }
    render();
  }

  /** Inline "mode + name" creation row, inserted right after the section
   *  head — the same "+ New" shape every other section uses, widened by one
   *  field since a profile name is only unique within its own mode. */
  function startCreateProfile(afterHead: HTMLElement): void {
    const li = document.createElement('li');
    li.className = 'ml-list-item ml-list-item--editing ml-list-item--editing-wide';

    const modeSel = document.createElement('select');
    modeSel.className = 'ml-list-name-input';
    PROFILE_MODES.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = SCOPE_LABELS[m];
      modeSel.appendChild(opt);
    });

    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'Profile name...'; inp.className = 'ml-list-name-input';

    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'ml-icon-btn'; cancelBtn.textContent = '✕';

    function confirmCreate(): void {
      const name = inp.value.trim(); if (!name) { li.remove(); return; }
      const mode = modeSel.value as FilterScope;
      if (getPreset(mode, name)) {
        alert(`A profile named "${name}" already exists for ${SCOPE_LABELS[mode]}.`); return;
      }
      savePreset(mode, name, { ...BLANK_BUNDLE });
      ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedMultiList = null;
      ctx.selectedProfile = { mode, name };
      render();
    }
    okBtn.addEventListener('click', confirmCreate);
    cancelBtn.addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') li.remove();
    });

    li.append(modeSel, inp, okBtn, cancelBtn);
    afterHead.insertAdjacentElement('afterend', li);
    inp.focus();
  }

  function startRenameProfile(mode: FilterScope, oldName: string, li: HTMLElement, nameSpan: HTMLElement): void {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = oldName; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    function confirmRename(): void {
      const newName = inp.value.trim();
      if (!newName || newName === oldName) { done(); return; }
      if (renamePreset(mode, oldName, newName)) {
        if (ctx.selectedProfile?.mode === mode && ctx.selectedProfile.name === oldName) {
          ctx.selectedProfile = { mode, name: newName };
        }
        render();
      } else {
        alert(`A profile named "${newName}" already exists for this tab.`);
        inp.focus();
      }
    }
    function done(): void { inp.replaceWith(nameSpan); okBtn.remove(); }
    okBtn.addEventListener('click', confirmRename);
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') done();
    });
    nameSpan.replaceWith(inp);
    li.querySelector('.ml-list-row-top')?.appendChild(okBtn);
    inp.focus(); inp.select();
  }

  // ── Top-level render ─────────────────────────────────────────────────────────

  /** Bulk "Hide From" access for every member of one folder, at once — see
   *  buildFolderGroup's `bulkHideFrom` param. `get` reads the *union* of every
   *  member's own `hiddenModes` (a mode shows checked if any member already
   *  hides from it) since members can disagree; `set` overwrites every
   *  member's `hiddenModes` to match, which is the point — one action instead
   *  of opening each list's own Hide From dropdown in turn. */
  interface BulkHideFrom { get(): FilterScope[]; set(modes: FilterScope[]): void; }

  function bulkHideFromFor(sectionId: SidebarSectionId, folder: string): BulkHideFrom | undefined {
    if (sectionId === 'single') {
      const names = getListNames(ctx.lang).filter(n => metaFolders(getListMeta(ctx.lang, n)).includes(folder));
      return {
        get: () => [...new Set(names.flatMap(n => getListMeta(ctx.lang, n).hiddenModes ?? []))],
        set: modes => names.forEach(n => setListMeta(ctx.lang, n, { ...getListMeta(ctx.lang, n), hiddenModes: modes })),
      };
    }
    if (sectionId === 'smart') {
      const rules = getSmartLists(ctx.lang);
      const names = getSmartNames(ctx.lang).filter(n => (rules[n].folders ?? []).includes(folder));
      return {
        get: () => [...new Set(names.flatMap(n => rules[n].hiddenModes ?? []))],
        set: modes => names.forEach(n => saveSmartRule(ctx.lang, n, { ...getSmartLists(ctx.lang)[n], hiddenModes: modes })),
      };
    }
    if (sectionId === 'multi') {
      const names = getMultiListNames().filter(n => metaFolders(getMultiListMeta(n)).includes(folder));
      return {
        get: () => [...new Set(names.flatMap(n => getMultiListMeta(n).hiddenModes ?? []))],
        set: modes => names.forEach(n => setMultiListMeta(n, { ...getMultiListMeta(n), hiddenModes: modes })),
      };
    }
    // Testing Profiles has no Hide-From-mode concept — a profile already
    // belongs to exactly one mode, so "hide this profile from mode X" isn't
    // a meaningful action the way it is for a list that can be offered
    // across several modes.
    return undefined;
  }

  // ── Drag-and-drop: a list card onto a folder header ─────────────────────
  //
  // The first drag-and-drop in this codebase, so kept as small as the HTML5
  // DnD API allows: a same-page drag needs nothing serialized through
  // DataTransfer, since dragstart and drop both run in this same closure —
  // `draggedItem` carries the payload directly, DataTransfer.setData is only
  // called because Firefox refuses to start a drag without at least one.
  //
  // Scoped to Single-Language, Smart and Cross-Language Lists — the three
  // kinds whose folder grouping already goes through the generic
  // renderSection()/buildFolderGroup() pass below with a plain folder-name
  // `sectionId` ('single'/'smart'/'multi'). Testing Profiles builds its own
  // per-mode folder boxes directly (see renderProfilesNav) and would need
  // the profile's mode threaded through the drop payload too, which is a
  // bigger, separate change; its rows are simply never made draggable here,
  // so a drop on one of its folder headers has nothing to accept.
  //
  // Additive, not exclusive: dropping onto a folder adds it to that item's
  // `folders` array alongside whatever it already belongs to, the same
  // semantics buildFoldersRow's own checkboxes already use — a list you
  // dropped in the wrong folder by mistake is still just one unchecked box
  // away from being fixed, not a second drag-it-back-out gesture.
  type DraggedListItem =
    | { kind: 'single'; lang: string; name: string }
    | { kind: 'smart';  lang: string; name: string }
    | { kind: 'multi';  name: string };

  let draggedItem: DraggedListItem | null = null;

  function makeListDraggable(li: HTMLElement, item: DraggedListItem): void {
    li.draggable = true;
    li.addEventListener('dragstart', e => {
      draggedItem = item;
      li.classList.add('ml-list-item--dragging');
      e.dataTransfer?.setData('text/plain', item.name);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('ml-list-item--dragging');
      draggedItem = null;
    });
  }

  /** Adds `item` to `folder`, a no-op if it's already there. */
  function addDraggedItemToFolder(item: DraggedListItem, folder: string): void {
    if (item.kind === 'single') {
      const meta = getListMeta(item.lang, item.name);
      const folders = metaFolders(meta);
      if (folders.includes(folder)) return;
      setListMeta(item.lang, item.name, { ...meta, folders: [...folders, folder], folder: undefined });
    } else if (item.kind === 'multi') {
      const meta = getMultiListMeta(item.name);
      const folders = metaFolders(meta);
      if (folders.includes(folder)) return;
      setMultiListMeta(item.name, { ...meta, folders: [...folders, folder], folder: undefined });
    } else {
      const rule = getSmartLists(item.lang)[item.name];
      if (!rule) return;
      const folders = rule.folders ?? [];
      if (folders.includes(folder)) return;
      saveSmartRule(item.lang, item.name, { ...rule, folders: [...folders, folder], folder: undefined });
    }
  }

  /** Wires `head` (a folder box's header bar) to accept a drop from
   *  makeListDraggable above — only from a dragged item of the matching
   *  kind, which `sectionId` conveniently already spells the same way
   *  ('single'/'smart'/'multi') as DraggedListItem['kind']. */
  function makeFolderDropTarget(head: HTMLElement, sectionId: SidebarSectionId, folderKey: string): void {
    head.addEventListener('dragover', e => {
      if (!draggedItem || draggedItem.kind !== sectionId) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      head.classList.add('ml-folder-head--drop-target');
    });
    head.addEventListener('dragleave', () => {
      head.classList.remove('ml-folder-head--drop-target');
    });
    head.addEventListener('drop', e => {
      head.classList.remove('ml-folder-head--drop-target');
      if (!draggedItem || draggedItem.kind !== sectionId) return;
      e.preventDefault();
      addDraggedItemToFolder(draggedItem, folderKey);
      draggedItem = null;
      render();
    });
  }

  /**
   * Builds one collapsible folder box: a header bar (caret + 📁 + name, plus
   * a bulk "Hide From" dropdown when `bulkHideFrom` applies) atop a nested
   * `<ul>` that owns everything inside it. Toggling collapse is a single
   * `hidden` flip on that `<ul>` rather than one per row — see the perf note
   * on renderSection() below, which this exists to serve twice over (its own
   * generic folder pass, and renderProfilesNav's bespoke per-mode one).
   */
  function buildFolderGroup(
    sectionId: SidebarSectionId, folderKey: string, label: string, bulkHideFrom?: BulkHideFrom,
  ): HTMLLIElement {
    const collapsed = isFolderCollapsed(sectionId, folderKey);
    const group = document.createElement('li');
    group.className = 'ml-folder-group';

    const head = document.createElement('div');
    head.className = 'ml-folder-head';
    const arrow = document.createElement('span');
    arrow.className = 'ml-section-caret';
    arrow.textContent = collapsed ? '▸' : '▾';
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '📁';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ml-section-toggle-btn';
    toggle.append(arrow, icon, document.createTextNode(' ' + label));
    head.appendChild(toggle);
    makeFolderDropTarget(head, sectionId, folderKey);

    const body = document.createElement('ul');
    body.className = 'ml-folder-body';
    body.hidden = collapsed;

    toggle.addEventListener('click', e => {
      e.stopPropagation();
      const next = !isFolderCollapsed(sectionId, folderKey);
      setFolderCollapsed(sectionId, folderKey, next);
      arrow.textContent = next ? '▸' : '▾';
      body.hidden = next;
    });

    if (bulkHideFrom) {
      const selected = new Set(bulkHideFrom.get());
      const dropdown = buildChecklistDropdown(
        'Hide From', FILTER_SCOPES.map(s => ({ value: s, label: SCOPE_LABELS[s] })), selected,
        () => bulkHideFrom!.set([...selected] as FilterScope[]),
      );
      dropdown.wrap.classList.add('ml-folder-hide-from');
      head.appendChild(dropdown.wrap);
    }

    group.append(head, body);
    return group;
  }

  /**
   * Runs one of the four render*Nav functions below, then retroactively
   * turns whatever it just appended to ctx.listNav into a collapsible
   * section — the head (always the first element appended) gets a caret
   * toggle wrapped around its existing label, and every row after it
   * (empty-state hint included) moves into one nested `<ul>` that owns the
   * section's collapsed state. Done here, once, rather than inside each
   * render*Nav function, since this is the one place that already knows
   * exactly which of listNav's freshly-appended children belong to which
   * section — those functions themselves just keep calling
   * `ctx.listNav.appendChild(...)` exactly as before.
   *
   * Collapsing used to walk every row in the section (and every row in every
   * folder inside it) setting `.hidden` one at a time, then call a full
   * render() on top — the visible lag the user reported on a section with
   * more than a handful of cards. Nesting rows inside one real `<ul>` per
   * section (and one more per folder) turns that into a single `hidden`
   * flip on the container, with no re-render at all.
   */
  function renderSection(id: SidebarSectionId, fn: () => void): void {
    const before = ctx.listNav.children.length;
    fn();
    const added = [...ctx.listNav.children] as HTMLElement[];
    const newOnes = added.slice(before);
    if (newOnes.length === 0) return;
    const [head, ...rows] = newOnes;

    const labelSpan = head.querySelector('span');
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'ml-section-toggle-btn';
    const collapsed = isSectionCollapsed(id);
    const arrow = document.createElement('span');
    arrow.className = 'ml-section-caret';
    arrow.textContent = collapsed ? '▸' : '▾';
    toggleBtn.appendChild(arrow);
    if (labelSpan) toggleBtn.appendChild(labelSpan);
    head.insertBefore(toggleBtn, head.firstChild);

    const body = document.createElement('ul');
    body.className = 'ml-section-body';
    body.hidden = collapsed;
    head.insertAdjacentElement('afterend', body);

    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      const next = !isSectionCollapsed(id);
      setSectionCollapsed(id, next);
      arrow.textContent = next ? '▸' : '▾';
      body.hidden = next;
    });

    // Testing Profiles manages its own folder sub-grouping (renderProfilesNav)
    // scoped per mode — a "Vocabulary" folder in Table and one in Picture
    // Quiz must never merge, which this generic pass (with no notion of a
    // mode boundary) can't express. Its rows are already nested into their
    // own folder boxes (and already ordered folders-first) by the time they
    // arrive here (see buildFolderGroup above), so there's nothing left for
    // this pass to do beyond moving them into the section body.
    if (id === 'profiles') {
      rows.forEach(row => body.appendChild(row));
      return;
    }

    // Folders first (alphabetical), each holding its own rows in their
    // original order, then every ungrouped row after — a learner sees the
    // structure (what's been organized into folders) before the flat list of
    // whatever hasn't been, rather than folders scattered wherever their
    // first row happened to fall.
    const folderNames = [...new Set(rows.map(r => r.dataset.folder || '').filter(Boolean))].sort();
    folderNames.forEach(folder => {
      const group = buildFolderGroup(id, folder, folder, bulkHideFromFor(id, folder));
      const folderBody = group.querySelector<HTMLUListElement>('.ml-folder-body')!;
      body.appendChild(group);
      rows.filter(r => (r.dataset.folder || '') === folder).forEach(row => {
        row.classList.add('ml-folder-row');
        folderBody.appendChild(row);
      });
    });
    rows.filter(r => !r.dataset.folder).forEach(row => body.appendChild(row));
  }

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
    renderBrowseNav();
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
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
    });
    if (hadFocus) ctx.listNav.querySelector<HTMLElement>('.ml-list-item.active')?.focus();
    collapseAllBtn.textContent = SIDEBAR_SECTIONS.every(isSectionCollapsed) ? 'Expand All' : 'Collapse All';
    if (rerenderPanel) ctx.renderPanel();
  }

  // ── Create / rename / duplicate (Single-Language Lists) ─────────────────────

  /** The name a fresh copy would get, before the user has a chance to rename it. */
  function suggestCopyName(lang: string, sourceName: string): string {
    const names = getListNames(lang);
    let candidate = sourceName + ' (copy)';
    let n = 2;
    while (names.includes(candidate)) candidate = `${sourceName} (${n++})`;
    return candidate;
  }

  /**
   * Prompt for a name before copying — cancelling the prompt cancels the copy
   * entirely, rather than silently creating "X (copy)" and leaving the user to
   * notice and rename it after the fact.
   */
  function startCopyList(lang: string, sourceName: string): string | null {
    const proposed = suggestCopyName(lang, sourceName);
    const input = window.prompt(`Name for the copy of "${sourceName}":`, proposed);
    if (input === null) return null;               // Cancelled
    const newName = input.trim();
    if (!newName) return null;
    if (getListNames(lang).includes(newName)) {
      alert(`A list named "${newName}" already exists.`);
      return null;
    }
    createList(lang, newName);
    for (const w of getList(lang, sourceName)) addToList(lang, newName, w);
    return newName;
  }

  function startCreateList(): void {
    const li = document.createElement('li');
    li.className = 'ml-list-item ml-list-item--editing';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'List name...'; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'ml-icon-btn'; cancelBtn.textContent = '✕';
    function confirmCreate(): void {
      const name = inp.value.trim(); if (!name) { li.remove(); return; }
      if (!createList(ctx.lang, name)) {
        alert(`A list named "${name}" already exists.`); return;
      }
      ctx.selectedList = name; ctx.updateBadge(); render();
    }
    okBtn.addEventListener('click', confirmCreate);
    cancelBtn.addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') li.remove();
    });
    li.appendChild(inp); li.appendChild(okBtn); li.appendChild(cancelBtn);
    ctx.listNav.prepend(li); inp.focus();
  }

  function startRenameList(oldName: string, li: HTMLElement, nameSpan: HTMLElement): void {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = oldName; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    function confirmRename(): void {
      const newName = inp.value.trim();
      if (!newName || newName === oldName) { done(); return; }
      if (renameList(ctx.lang, oldName, newName)) {
        if (ctx.selectedList === oldName) ctx.selectedList = newName;
        ctx.updateBadge(); render();
      } else { alert(`A list named "${newName}" already exists.`); inp.focus(); }
    }
    function done(): void { inp.replaceWith(nameSpan); okBtn.remove(); }
    okBtn.addEventListener('click', confirmRename);
    // The list item itself has a click listener that selects it and
    // re-renders the sidebar — without this, clicking inside the input to
    // place the caret (rather than just typing over the select-all) bubbled
    // up and wiped the rename out from under the user before they could edit.
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') done();
    });
    nameSpan.replaceWith(inp);
    li.querySelector('.ml-list-row-top')?.appendChild(okBtn);
    inp.focus(); inp.select();
  }

  return { leftPane, render };
}
