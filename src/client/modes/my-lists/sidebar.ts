/**
 * sidebar.ts — the left pane: language, ordinary lists, smart lists.
 *
 * Smart lists get their own section rather than sitting in the same run as
 * ordinary ones. They behave differently enough — read-only, membership
 * computed on open, deleting one destroys no words — that mixing them would
 * make the delete button mean two different things in one list.
 *
 * Backup and restore live up here next to "+ New" because they operate on
 * every list in every language, not on the one that happens to be open.
 */

import {
  getListNames, getList, createList, deleteList, renameList, addToList,
  getMultiListNames, getMultiList, getMultiListLanguages, getMultiListCount,
  createMultiList, deleteMultiList, renameMultiList, addToMultiList,
} from '../../utils/word-lists.ts';
import { logger } from '../../utils/logger.ts';
import type { ListsCtx } from './context.ts';
import { migrateMastery } from './mastery.ts';
import { closePopover } from './move-popover.ts';
import { showUndo } from './undo-toast.ts';
import { downloadBackup, applyBackup } from './backup.ts';
import {
  getSmartNames, getSmartLists, saveSmartRule, deleteSmartList,
  describeSmart, DEFAULT_SMART_RULE,
} from './smart-lists.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { LANGUAGES } from '../../data/languages.ts';

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

  // ── Header: title, backup, restore, new ────────────────────────────────────

  const header = document.createElement('div');
  header.className = 'ml-header';
  const titleSpan = document.createElement('span');
  titleSpan.className = 'ml-sidebar-title'; titleSpan.textContent = 'Lists';
  const newListBtn = document.createElement('button');
  newListBtn.type = 'button'; newListBtn.className = 'ml-new-list-btn';
  newListBtn.title = 'Create new list'; newListBtn.textContent = '+ New';
  newListBtn.addEventListener('click', () => startCreateList());

  const backupBtn = document.createElement('button');
  backupBtn.type = 'button'; backupBtn.className = 'ml-icon-btn ml-text-btn ml-backup-btn';
  backupBtn.title = 'Download a backup of every list, in every language';
  backupBtn.textContent = '⭳ Backup';
  backupBtn.addEventListener('click', () => downloadBackup());

  const restoreBtn = document.createElement('button');
  restoreBtn.type = 'button'; restoreBtn.className = 'ml-icon-btn ml-text-btn ml-restore-btn';
  restoreBtn.title = 'Restore lists from a backup file (merges, never overwrites)';
  restoreBtn.textContent = '⭱ Restore';

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

  header.appendChild(titleSpan);
  header.appendChild(backupBtn); header.appendChild(restoreBtn);
  header.appendChild(newListBtn);
  leftPane.appendChild(header);
  leftPane.appendChild(restoreInput);
  leftPane.appendChild(ctx.listNav);

  // ── Ordinary lists ─────────────────────────────────────────────────────────

  function render(rerenderPanel = true): void {
    ctx.listNav.innerHTML = '';
    const names = getListNames(ctx.lang);

    // Smart lists and cross-language lists aren't scoped to ctx.lang and must
    // render regardless of whether *ordinary* lists exist — an early return
    // here used to skip both sections entirely whenever names was empty,
    // which is the common case for someone who only uses cross-language
    // lists, or hasn't made an ordinary list yet.
    if (names.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ml-list-empty'; empty.textContent = 'No lists yet.';
      ctx.listNav.appendChild(empty); ctx.selectedList = '';
      renderSmartNav();
      renderMultiNav();
      if (rerenderPanel) ctx.renderPanel();
      return;
    }

    if (!names.includes(ctx.selectedList)) ctx.selectedList = names[0];

    names.forEach(name => {
      const li = document.createElement('li');
      li.className = 'ml-list-item' + (name === ctx.selectedList ? ' active' : '');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'ml-list-name'; nameSpan.textContent = name; nameSpan.title = name;

      const countSpan = document.createElement('span');
      countSpan.className = 'ml-list-count';
      countSpan.textContent = String(getList(ctx.lang, name).length);

      const actions = document.createElement('span');
      actions.className = 'ml-list-actions';

      const dupBtn = document.createElement('button');
      dupBtn.type = 'button'; dupBtn.className = 'ml-icon-btn';
      dupBtn.title = 'Duplicate list'; dupBtn.textContent = '⧉';
      dupBtn.addEventListener('click', e => {
        e.stopPropagation();
        ctx.selectedList = duplicateList(ctx.lang, name);
        ctx.updateBadge(); render();
      });

      const renameBtn = document.createElement('button');
      renameBtn.type = 'button'; renameBtn.className = 'ml-icon-btn';
      renameBtn.title = 'Rename'; renameBtn.textContent = '✏';
      renameBtn.addEventListener('click', e => {
        e.stopPropagation(); startRenameList(name, li, nameSpan);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button'; deleteBtn.className = 'ml-icon-btn ml-icon-btn--danger';
      deleteBtn.title = 'Delete list'; deleteBtn.textContent = '🗑';
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (window.confirm(`Delete list "${name}" and all its words?`)) {
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
        }
      });

      actions.appendChild(dupBtn); actions.appendChild(renameBtn); actions.appendChild(deleteBtn);
      li.appendChild(nameSpan); li.appendChild(countSpan); li.appendChild(actions);
      li.addEventListener('click', () => {
        ctx.selectedList = name; ctx.selectedSmart = null; ctx.selectedMultiList = null;
        closePopover(); render(); ctx.renderPanel();
      });
      ctx.listNav.appendChild(li);
    });

    renderSmartNav();
    renderMultiNav();
    if (rerenderPanel) ctx.renderPanel();
  }

  // ── Smart lists ────────────────────────────────────────────────────────────

  function renderSmartNav(): void {
    const smartNames = getSmartNames(ctx.lang);

    const head = document.createElement('li');
    head.className = 'ml-smart-head';
    const headLabel = document.createElement('span');
    headLabel.textContent = 'Smart lists';
    const addSmart = document.createElement('button');
    addSmart.type = 'button'; addSmart.className = 'ml-new-list-btn';
    addSmart.title = 'Create a smart list — a saved query that stays current';
    addSmart.textContent = '+ New';
    addSmart.addEventListener('click', () => {
      const name = window.prompt('Name this smart list:', 'New words to learn');
      if (!name?.trim()) return;
      saveSmartRule(ctx.lang, name.trim(), { ...DEFAULT_SMART_RULE });
      ctx.selectedList = ''; ctx.selectedSmart = name.trim(); ctx.selectedMultiList = null;
      render();
    });
    head.append(headLabel, addSmart);
    ctx.listNav.appendChild(head);

    if (smartNames.length === 0) {
      const hint = document.createElement('li');
      hint.className = 'ml-list-empty ml-smart-hint';
      hint.textContent = 'e.g. "B1 verbs I haven’t learned"';
      ctx.listNav.appendChild(hint);
      return;
    }

    smartNames.forEach(name => {
      const rule = getSmartLists(ctx.lang)[name];
      const li = document.createElement('li');
      li.className = 'ml-list-item ml-smart-item'
        + (name === ctx.selectedSmart ? ' active' : '');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'ml-list-name';
      nameSpan.textContent = '⚡ ' + name;
      nameSpan.title = describeSmart(rule);

      const del = document.createElement('button');
      del.type = 'button'; del.className = 'ml-icon-btn ml-icon-btn--danger';
      del.title = 'Delete this smart list'; del.textContent = '🗑';
      del.addEventListener('click', e => {
        e.stopPropagation();
        if (!window.confirm(`Delete smart list "${name}"? The words themselves are untouched.`)) return;
        deleteSmartList(ctx.lang, name);
        if (ctx.selectedSmart === name) ctx.selectedSmart = null;
        render();
      });

      const actions = document.createElement('span');
      actions.className = 'ml-list-actions';
      actions.appendChild(del);

      li.append(nameSpan, actions);
      li.addEventListener('click', () => {
        ctx.selectedSmart = name; ctx.selectedMultiList = null; closePopover(); render();
      });
      ctx.listNav.appendChild(li);
    });
  }

  // ── Cross-language lists ────────────────────────────────────────────────────
  //
  // Not scoped to ctx.lang — a cross-language list holds words from however
  // many languages have been added to it via the star-button picker. This
  // section mirrors renderSmartNav()'s shape (head row with "+ New", one li
  // per list) but drives multi-panel.ts instead of panel.ts/smart-panel.ts.

  function renderMultiNav(): void {
    const names = getMultiListNames();

    const head = document.createElement('li');
    head.className = 'ml-smart-head';
    const headLabel = document.createElement('span');
    headLabel.textContent = 'Cross-Language Lists';
    const addMulti = document.createElement('button');
    addMulti.type = 'button'; addMulti.className = 'ml-new-list-btn';
    addMulti.title = 'Create a list that can hold words from any language';
    addMulti.textContent = '+ New';
    addMulti.addEventListener('click', () => {
      const name = window.prompt('Name this cross-language list:', 'Hard words');
      if (!name?.trim()) return;
      if (!createMultiList(name.trim())) { alert(`A cross-language list named "${name.trim()}" already exists.`); return; }
      ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedMultiList = name.trim();
      render();
    });
    head.append(headLabel, addMulti);
    ctx.listNav.appendChild(head);

    if (names.length === 0) {
      const hint = document.createElement('li');
      hint.className = 'ml-list-empty ml-smart-hint';
      hint.textContent = 'Add words to one from the ★ button on any word';
      ctx.listNav.appendChild(hint);
      return;
    }

    names.forEach(name => {
      const li = document.createElement('li');
      li.className = 'ml-list-item' + (name === ctx.selectedMultiList ? ' active' : '');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'ml-list-name'; nameSpan.textContent = name; nameSpan.title = name;

      const countSpan = document.createElement('span');
      countSpan.className = 'ml-list-count';
      countSpan.textContent = String(getMultiListCount(name));

      const badge = buildLangBadge(getMultiListLanguages(name));

      const actions = document.createElement('span');
      actions.className = 'ml-list-actions';

      const renameBtn = document.createElement('button');
      renameBtn.type = 'button'; renameBtn.className = 'ml-icon-btn';
      renameBtn.title = 'Rename'; renameBtn.textContent = '✏';
      renameBtn.addEventListener('click', e => {
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

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button'; deleteBtn.className = 'ml-icon-btn ml-icon-btn--danger';
      deleteBtn.title = 'Delete list'; deleteBtn.textContent = '🗑';
      deleteBtn.addEventListener('click', e => {
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
      });

      actions.appendChild(renameBtn); actions.appendChild(deleteBtn);
      li.append(nameSpan, badge, countSpan, actions);
      li.addEventListener('click', () => {
        ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedMultiList = name;
        closePopover(); render();
      });
      ctx.listNav.appendChild(li);
    });
  }

  // ── Create / rename / duplicate ────────────────────────────────────────────

  /** Copy a list under a name that is free. Returns the name used. */
  function duplicateList(lang: string, sourceName: string): string {
    const names = getListNames(lang);
    let newName = sourceName + ' (copy)';
    let n = 2;
    while (names.includes(newName)) newName = `${sourceName} (${n++})`;
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
      createList(ctx.lang, name); ctx.selectedList = name; ctx.updateBadge(); render();
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
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') done();
    });
    nameSpan.replaceWith(inp);
    const actionsEl = li.querySelector('.ml-list-actions');
    if (actionsEl) li.insertBefore(okBtn, actionsEl);
    inp.focus(); inp.select();
  }

  return { leftPane, render };
}
