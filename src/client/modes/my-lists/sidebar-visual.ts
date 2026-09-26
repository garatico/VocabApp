import { closePopover } from './move-popover.ts';
import {
  listVisualProfiles, getVisualProfile, saveVisualProfile, deleteVisualProfile, renameVisualProfile,
  duplicateVisualProfile, captureCurrentVisualProfile, describeVisualProfile,
} from '../../filters/visual-profiles.ts';
import type { SidebarKit } from './sidebar-kit.ts';

/**
 * sidebar-visual.ts — the Visual Profiles section (saved Theme and Font Size bundles). A row
 * behaves like every other list card: selecting it opens it in the main panel (visual-panel.ts),
 * where it is edited and applied; the gear menu has Emoji, Copy, Rename and Delete, and folders
 * work as they do elsewhere.
 */

export function createVisualSection(kit: SidebarKit) {
  const { ctx, render, sectionHead, buildActionMenu, emojiSpan, emojiItem, makeListDraggable, renderEmptyFolderPlaceholders } = kit;

  // ── Visual Profiles ──────────────────────────────────────────────────────
  // Saved display preferences (Theme, Font Size — see visual-profiles.ts),
  // shown right under Testing Profiles when Settings.getShowVisualProfiles()
  // is on. Folders are scoped to the section as a whole ('visual_profiles').

  const FOLDER_SCOPE = 'visual_profiles';

  function select(name: string): void {
    ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedMultiList = null; ctx.selectedProfile = null;
    ctx.selectedVisual = name;
  }

  function renderVisualProfilesNav(): void {
    const head = sectionHead(
      'ml-profile-head ml-visual-head', 'Visual Profiles',
      'Save your current Theme and Font Size as a reusable profile',
      () => startCreateVisualProfile(head), FOLDER_SCOPE,
    );
    ctx.listNav.appendChild(head);

    const names = listVisualProfiles();
    if (names.length === 0) {
      const hint = document.createElement('li');
      hint.className = 'ml-list-empty ml-smart-hint';
      hint.textContent = 'Save your current Theme and Font Size as a reusable profile';
      ctx.listNav.appendChild(hint);
      renderEmptyFolderPlaceholders(FOLDER_SCOPE, []);
      return;
    }

    const usedFolders = new Set<string>();

    names.forEach(name => {
      const profile = getVisualProfile(name) ?? {};
      const folders = profile.folders ?? [];
      folders.forEach(f => usedFolders.add(f));
      // A profile in more than one folder is listed under each, like every other kind of list.
      const instances = folders.length > 0 ? folders : [''];

      instances.forEach(folder => {
        const li = document.createElement('li');
        li.className = 'ml-list-item ml-list-item--full ml-profile-item ml-visual-item'
          + (name === ctx.selectedVisual ? ' active' : '');
        li.dataset.folder = folder;
        li.title = describeVisualProfile(profile);
        makeListDraggable(li, { kind: 'visual', name });

        const topRow = document.createElement('div');
        topRow.className = 'ml-list-row-top';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'ml-list-name';
        nameSpan.textContent = name;
        topRow.appendChild(nameSpan);

        topRow.append(buildActionMenu([
          emojiItem(profile.emoji, emoji => {
            const current = getVisualProfile(name);
            if (current) saveVisualProfile(name, { ...current, emoji });
          }),
          { glyph: '⧉', label: 'Copy', title: 'Duplicate visual profile', tone: 'copy', onClick: () => {
            const input = window.prompt(`Name for the copy of "${name}":`, suggestCopyName(name));
            if (input === null) return;
            const newName = input.trim();
            if (!newName) return;
            if (!duplicateVisualProfile(name, newName)) {
              alert(`A visual profile named "${newName}" already exists.`); return;
            }
            select(newName);
            render();
          } },
          { glyph: '✏', label: 'Rename', title: 'Rename', tone: 'rename', onClick: () => startRenameVisualProfile(name, li, nameSpan) },
          { glyph: '🗑', label: 'Delete', title: 'Delete visual profile', tone: 'delete', onClick: () => {
            if (!window.confirm(`Delete visual profile "${name}"?`)) return;
            deleteVisualProfile(name);
            if (ctx.selectedVisual === name) ctx.selectedVisual = null;
            render();
          } },
        ]));
        const em = emojiSpan(profile.emoji); if (em) topRow.prepend(em);
        li.append(topRow);
        li.addEventListener('click', () => {
          select(name);
          closePopover(); render();
        });
        ctx.listNav.appendChild(li);
      });
    });

    renderEmptyFolderPlaceholders(FOLDER_SCOPE, [...usedFolders]);
  }

  function suggestCopyName(sourceName: string): string {
    const names = listVisualProfiles();
    let candidate = sourceName + ' (copy)';
    let n = 2;
    while (names.includes(candidate)) candidate = `${sourceName} (${n++})`;
    return candidate;
  }

  /** Inline creation row, the same shape every other section uses. The new profile starts from how
   *  the app looks right now, and is opened so it can be adjusted straight away. */
  function startCreateVisualProfile(afterHead: HTMLElement): void {
    const li = document.createElement('li');
    li.className = 'ml-list-item ml-list-item--editing';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'Visual profile name...'; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'ml-icon-btn'; cancelBtn.textContent = '✕';
    function confirmCreate(): void {
      const name = inp.value.trim(); if (!name) { li.remove(); return; }
      if (listVisualProfiles().includes(name)) {
        alert(`A visual profile named "${name}" already exists.`); return;
      }
      saveVisualProfile(name, captureCurrentVisualProfile());
      select(name);
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

  function startRenameVisualProfile(oldName: string, li: HTMLElement, nameSpan: HTMLElement): void {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = oldName; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    function confirmRename(): void {
      const newName = inp.value.trim();
      if (!newName || newName === oldName) { done(); return; }
      if (renameVisualProfile(oldName, newName)) {
        if (ctx.selectedVisual === oldName) ctx.selectedVisual = newName;
        render();
      } else { alert(`A visual profile named "${newName}" already exists.`); inp.focus(); }
    }
    function done(): void { inp.replaceWith(nameSpan); okBtn.remove(); }
    okBtn.addEventListener('click', confirmRename);
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') done();
    });
    nameSpan.replaceWith(inp);
    const rowTop = li.querySelector('.ml-list-row-top');
    rowTop?.insertBefore(okBtn, rowTop.querySelector('.ml-menu-wrap'));
    inp.focus(); inp.select();
  }

  return { renderNav: renderVisualProfilesNav };
}
