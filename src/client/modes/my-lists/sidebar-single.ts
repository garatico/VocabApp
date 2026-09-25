import { getListNames, getList, createList, deleteList, renameList, addToList, getListMeta, setListMeta, metaFolders } from '../../utils/word-lists.ts';
import { BROWSE_ALL_LIST } from './context.ts';
import { closePopover } from './move-popover.ts';
import { showUndo } from './undo-toast.ts';
import type { SidebarKit } from './sidebar-kit.ts';

/**
 * sidebar-single.ts — the Single-Language Lists section: its cards and the create / rename /
 * copy flows.
 */

export function createSingleSection(kit: SidebarKit) {
  const { ctx, render, sectionHead, buildActionMenu, emojiSpan, emojiItem, makeListDraggable, renderEmptyFolderPlaceholders } = kit;

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

        // Folder membership and Hide-from-mode are edited from the Part of
        // Speech/Level dropdown row in panel.ts now, next to this list's own
        // word filters, rather than in this card's gear menu.
        const menu = buildActionMenu([
          emojiItem(meta.emoji, emoji => setListMeta(ctx.lang, name, { ...getListMeta(ctx.lang, name), emoji })),
          { glyph: '⧉', label: 'Copy', title: 'Duplicate list', tone: 'copy', onClick: () => {
            const copied = startCopyList(ctx.lang, name);
            if (copied) { ctx.selectedList = copied; ctx.updateBadge(); render(); }
          } },
          { glyph: '✏', label: 'Rename', title: 'Rename', tone: 'rename', onClick: () => {
            startRenameList(name, li, nameSpan);
          } },
          { glyph: '🗑', label: 'Delete', title: 'Delete list', tone: 'delete', onClick: () => {
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
          } },
        ]);
        topRow.append(menu);
        const em = emojiSpan(meta.emoji); if (em) topRow.prepend(em);
        li.append(topRow);
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
    const rowTop = li.querySelector('.ml-list-row-top');
    rowTop?.insertBefore(okBtn, rowTop.querySelector('.ml-menu-wrap'));
    inp.focus(); inp.select();
  }

  return { renderNav: renderSingleNav };
}
