import { getMultiListNames, getMultiList, getMultiListLanguages, getMultiListCount, createMultiList, deleteMultiList, renameMultiList, addToMultiList, getMultiListMeta, setMultiListMeta, metaFolders } from '../../utils/word-lists.ts';
import { closePopover } from './move-popover.ts';
import { showUndo } from './undo-toast.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import type { SidebarKit } from './sidebar-kit.ts';

/**
 * sidebar-multi.ts — the Cross-Language Lists section: its cards and the create / copy flows.
 */

export function createMultiSection(kit: SidebarKit) {
  const { ctx, render, sectionHead, buildActionMenu, emojiSpan, emojiItem, makeListDraggable, renderEmptyFolderPlaceholders } = kit;

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

      const badge = buildLangBadge(getMultiListLanguages(name));
      const countSpan = document.createElement('span');
      countSpan.className = 'ml-list-count';
      const n = getMultiListCount(name);
      countSpan.textContent = `${n} word${n === 1 ? '' : 's'}`;
      // Flag(s) then count, top-right beside the gear; name top-left.
      topRow.append(badge, countSpan);

      // Folder membership and Hide-from-mode are edited from the Part of
      // Speech/Level dropdown row in multi-panel.ts now, not this gear menu.
      topRow.append(buildActionMenu([
        emojiItem(meta.emoji, emoji => setMultiListMeta(name, { ...getMultiListMeta(name), emoji })),
        { glyph: '⧉', label: 'Copy', title: 'Duplicate cross-language list', tone: 'copy', onClick: () => {
          const proposed = suggestMultiCopyName(name);
          const input = window.prompt(`Name for the copy of "${name}":`, proposed);
          if (input === null) return;
          const newName = input.trim();
          if (!newName) return;
          if (!createMultiList(newName)) { alert(`A cross-language list named "${newName}" already exists.`); return; }
          for (const entry of getMultiList(name)) addToMultiList(newName, entry.word, entry.language);
          ctx.selectedMultiList = newName; ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedProfile = null; ctx.selectedVisual = null;
          render();
        } },
        { glyph: '✏', label: 'Rename', title: 'Rename', tone: 'rename', onClick: () => {
          const newName = window.prompt('Rename cross-language list:', name);
          if (!newName?.trim() || newName.trim() === name) return;
          if (renameMultiList(name, newName.trim())) {
            if (ctx.selectedMultiList === name) ctx.selectedMultiList = newName.trim();
            render();
          } else {
            alert(`A cross-language list named "${newName.trim()}" already exists.`);
          }
        } },
        { glyph: '🗑', label: 'Delete', title: 'Delete list', tone: 'delete', onClick: () => {
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
        } },
      ]));
      const em = emojiSpan(meta.emoji); if (em) topRow.prepend(em);
      li.append(topRow);
      li.addEventListener('click', () => {
        ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedProfile = null; ctx.selectedVisual = null;
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
      ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedProfile = null; ctx.selectedVisual = null;
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

  return { renderNav: renderMultiNav };
}
