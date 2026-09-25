import { listVisualProfiles, getVisualProfile, saveVisualProfile, deleteVisualProfile, renameVisualProfile, captureCurrentVisualProfile, applyVisualProfile } from '../../filters/visual-profiles.ts';
import type { SidebarKit } from './sidebar-kit.ts';

/**
 * sidebar-visual.ts — the Visual Profiles section (saved Theme and Font Size bundles). Unlike
 * every other section a row has no panel of its own: clicking one applies it.
 */

export function createVisualSection(kit: SidebarKit) {
  const { ctx, render, sectionHead, buildActionMenu } = kit;

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

      topRow.append(buildActionMenu([
        { glyph: '✏', label: 'Rename', title: 'Rename', tone: 'rename', onClick: () => startRenameVisualProfile(name) },
        { glyph: '🗑', label: 'Delete', title: 'Delete visual profile', tone: 'delete', onClick: () => {
          if (!window.confirm(`Delete visual profile "${name}"?`)) return;
          deleteVisualProfile(name);
          render();
        } },
      ]));

      li.append(topRow);
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

  return { renderNav: renderVisualProfilesNav };
}
