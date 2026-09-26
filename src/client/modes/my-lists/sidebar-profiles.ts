import { getFolderRegistry, addFolder } from './folders.ts';
import { closePopover } from './move-popover.ts';
import { LANGUAGES } from '../../data/languages.ts';
import { createFlagImg } from '../../ui/flag-icon.ts';
import { modesWithPresets, listPresets, getPreset, deletePreset, renamePreset, duplicatePreset, savePreset, BLANK_BUNDLE } from '../../filters/presets.ts';
import { SCOPE_LABELS, type FilterScope } from '../../filters/filter-scope.ts';
import type { SidebarKit } from './sidebar-kit.ts';
import { isFolderCollapsed, setFolderCollapsed } from './sidebar-state.ts';

/**
 * sidebar-profiles.ts — the Testing Profiles section: profiles grouped by mode and folder, and
 * the create / rename / copy flows.
 */

const PROFILE_MODES: FilterScope[] = ['table', 'picture', 'conjugation'];

export function createProfilesSection(kit: SidebarKit) {
  const { ctx, render, sectionHead, buildActionMenu, emojiSpan, emojiItem, buildFolderGroup } = kit;

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
      () => startCreateProfileFolder(head),
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

      // One collapsible group per mode: a caret head over a body <ul> that
      // owns the mode's folders and profiles, same single-`hidden`-flip
      // collapse as buildFolderGroup. Folders are created from the section
      // head's "+ Folder", which asks which mode it belongs to.
      const modeKey = `mode:${mode}`;
      const modeCollapsed = isFolderCollapsed('profiles', modeKey);
      const modeGroup = document.createElement('li');
      modeGroup.className = 'ml-profile-mode-group';
      const modeHead = document.createElement('div');
      modeHead.className = 'ml-profile-mode-head';
      const modeToggle = document.createElement('button');
      modeToggle.type = 'button';
      modeToggle.className = 'ml-section-toggle-btn';
      const modeArrow = document.createElement('span');
      modeArrow.className = 'ml-section-caret';
      modeArrow.textContent = modeCollapsed ? '▸' : '▾';
      modeToggle.append(modeArrow, document.createTextNode(' ' + SCOPE_LABELS[mode]));
      modeHead.appendChild(modeToggle);
      const modeBody = document.createElement('ul');
      modeBody.className = 'ml-profile-mode-body';
      modeBody.hidden = modeCollapsed;
      modeToggle.addEventListener('click', e => {
        e.stopPropagation();
        const next = !isFolderCollapsed('profiles', modeKey);
        setFolderCollapsed('profiles', modeKey, next);
        modeArrow.textContent = next ? '▸' : '▾';
        modeBody.hidden = next;
      });
      modeGroup.append(modeHead, modeBody);
      ctx.listNav.appendChild(modeGroup);

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

      function buildProfileRow(name: string, target: HTMLElement = modeBody): void {
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

        topRow.append(buildActionMenu([
          emojiItem(bundle?.emoji, emoji => {
            const b = getPreset(mode, name);
            if (b) savePreset(mode, name, { ...b, emoji });
          }),
          { glyph: '⧉', label: 'Copy', title: 'Duplicate profile', tone: 'copy', onClick: () => {
            const proposed = suggestProfileCopyName(mode, name);
            const input = window.prompt(`Name for the copy of "${name}":`, proposed);
            if (input === null) return;
            const newName = input.trim();
            if (!newName) return;
            if (!duplicatePreset(mode, name, newName)) {
              alert(`A profile named "${newName}" already exists for ${SCOPE_LABELS[mode]}.`); return;
            }
            ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedMultiList = null; ctx.selectedVisual = null;
            ctx.selectedProfile = { mode, name: newName };
            render();
          } },
          { glyph: '✏', label: 'Rename', title: 'Rename', tone: 'rename', onClick: () => {
            startRenameProfile(mode, name, li, nameSpan);
          } },
          { glyph: '🗑', label: 'Delete', title: 'Delete profile', tone: 'delete', onClick: () => {
            if (!window.confirm(`Delete profile "${name}"?`)) return;
            deletePreset(mode, name);
            if (selected) ctx.selectedProfile = null;
            render();
          } },
        ]));
        const em = emojiSpan(bundle?.emoji); if (em) topRow.prepend(em);
        li.append(topRow);
        li.addEventListener('click', () => {
          ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedMultiList = null; ctx.selectedVisual = null;
          ctx.selectedProfile = { mode, name };
          closePopover(); render();
        });
        target.appendChild(li);
      }

      // Folders first (see renderSection()'s own folders-before-ungrouped
      // ordering), then whatever hasn't been filed into one.
      // Registered-but-empty folders (created from the section head's
      // "+ Folder") are unioned in here so a freshly-created one still
      // shows up with nothing in it yet.
      const allModeFolders = new Set([...byFolder.keys(), ...getFolderRegistry(profileFolderScope)]);
      [...allModeFolders].filter(Boolean).sort().forEach(folder => {
        const folderId = `profiles:${mode}:${folder}`;
        const group = buildFolderGroup('profiles', folderId, folder, undefined, { scope: profileFolderScope, folder });
        const folderBody = group.querySelector<HTMLUListElement>('.ml-folder-body')!;
        modeBody.appendChild(group);

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
      ctx.selectedList = ''; ctx.selectedSmart = null; ctx.selectedMultiList = null; ctx.selectedVisual = null;
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

  /** Inline "mode + folder name" row for the Testing Profiles "+ Folder" —
   *  folders are scoped per mode (`profiles_<mode>`), so the mode is chosen
   *  here rather than by a second button inside each mode's own group. */
  function startCreateProfileFolder(afterHead: HTMLElement): void {
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
    inp.type = 'text'; inp.placeholder = 'Folder name...'; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'ml-icon-btn'; cancelBtn.textContent = '✕';

    function confirmCreate(): void {
      const name = inp.value.trim(); if (!name) { li.remove(); return; }
      const mode = modeSel.value as FilterScope;
      if (!addFolder(`profiles_${mode}`, name)) {
        alert(`A folder named "${name}" already exists for ${SCOPE_LABELS[mode]}.`); return;
      }
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
    const rowTop = li.querySelector('.ml-list-row-top');
    rowTop?.insertBefore(okBtn, rowTop.querySelector('.ml-menu-wrap'));
    inp.focus(); inp.select();
  }

  return { renderNav: renderProfilesNav };
}
