import { getListNames, getMultiListNames, getListMeta, setListMeta, getMultiListMeta, setMultiListMeta, metaFolders } from '../../utils/word-lists.ts';
import { getFolderRegistry, addFolder, getFolderStyle } from './folders.ts';
import { type ListsCtx } from './context.ts';
import { getSmartNames, getSmartLists, saveSmartRule } from './smart-lists.ts';
import type { MenuItem } from './sidebar-menu.ts';
import type { BulkHideFrom } from './sidebar-pickers.ts';
import { type SidebarSectionId, isSectionCollapsed, setSectionCollapsed, isFolderCollapsed, setFolderCollapsed } from './sidebar-state.ts';

/**
 * sidebar-folders.ts — the structure around the list cards: section heads, the collapsible
 * folder boxes, and the pass that turns each section's freshly appended rows into a
 * collapsible section with its folders.
 */

export interface CreateFolderKitDeps {
  ctx: ListsCtx;
  render: (rerenderPanel?: boolean) => void;
  syncCollapseAllLabel: () => void;
  buildActionMenu: (items: MenuItem[]) => HTMLElement;
  emojiSpan: (emoji: string | undefined) => HTMLElement | null;
  makeFolderDropTarget: (head: HTMLElement, sectionId: SidebarSectionId, folderKey: string) => void;
  openFolderStylePicker: (anchor: HTMLElement, scope: string, folder: string) => void;
  openHideFromPicker: (anchor: HTMLElement, bulk: BulkHideFrom) => void;
}

export function createFolderKit(deps: CreateFolderKitDeps) {
  const { ctx, render, syncCollapseAllLabel, buildActionMenu, emojiSpan, makeFolderDropTarget, openFolderStylePicker, openHideFromPicker } = deps;

  // ── Shared row-building helpers ─────────────────────────────────────────────

  /** A section head: label + optional "+ New" and "+ Folder". Shared shape
   *  across all four sections so the sidebar reads as one family of lists. */
  function sectionHead(
    cls: string, label: string, newTitle?: string, onNew?: () => void,
    folderScope?: string | (() => void),
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
        // A function scope means the caller needs more than a name (Testing
        // Profiles asks which mode the folder belongs to) and drives it itself.
        if (typeof folderScope === 'function') { folderScope(); return; }
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

  /**
   * Builds one collapsible folder box: a header bar (caret + 📁 + name, plus
   * a bulk "Hide From" dropdown when `bulkHideFrom` applies) atop a nested
   * `<ul>` that owns everything inside it. Toggling collapse is a single
   * `hidden` flip on that `<ul>` rather than one per row — see the perf note
   * on renderSection() below, which this exists to serve twice over (its own
   * generic folder pass, and renderProfilesNav's bespoke per-mode one).
   */
  function folderScopeFor(sectionId: SidebarSectionId): string | null {
    if (sectionId === 'single') return `single_${ctx.lang}`;
    if (sectionId === 'smart') return `smart_${ctx.lang}`;
    if (sectionId === 'multi') return 'multi';
    return null; // Testing Profiles passes its per-mode scope explicitly
  }

  function buildFolderGroup(
    sectionId: SidebarSectionId, folderKey: string, label: string, bulkHideFrom?: BulkHideFrom,
    style?: { scope: string; folder: string },
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
    const look = style ? getFolderStyle(style.scope, style.folder) : {};
    icon.textContent = '📁'; // always the folder glyph; the emoji is its own span below
    if (look.color) { head.classList.add('ml-folder-head--colored'); head.style.setProperty('--folder-color', look.color); }
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ml-section-toggle-btn';
    toggle.append(arrow, icon);
    const folderEmoji = emojiSpan(look.emoji);
    if (folderEmoji) toggle.append(document.createTextNode(' '), folderEmoji);
    toggle.append(document.createTextNode(' ' + label));
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

    const folderItems: MenuItem[] = [];
    if (style) {
      folderItems.push({
        glyph: '🎨', label: 'Emoji & Colour', title: "Set this folder's emoji and colour", tone: 'emoji',
        onClick: anchor => openFolderStylePicker(anchor, style.scope, style.folder),
      });
    }
    if (bulkHideFrom) {
      folderItems.push({
        glyph: '🚫', label: 'Hide From', title: 'Hide every list in this folder from chosen modes', tone: 'hide',
        onClick: anchor => openHideFromPicker(anchor, bulkHideFrom),
      });
    }
    if (folderItems.length > 0) head.appendChild(buildActionMenu(folderItems));

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
    // The header <li> sits directly in a div (listNav), not a list; the
    // section's own <ul> body below is the real list, so this is presentational.
    head.setAttribute('role', 'presentation');

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

    toggleBtn.dataset.section = id;
    const body = document.createElement('ul');
    body.className = `ml-section-body ml-section-body--${id}`;
    body.dataset.section = id;
    body.hidden = collapsed;
    head.insertAdjacentElement('afterend', body);

    toggleBtn.addEventListener('click', e => {
      e.stopPropagation();
      const next = !isSectionCollapsed(id);
      setSectionCollapsed(id, next);
      arrow.textContent = next ? '▸' : '▾';
      body.hidden = next;
      syncCollapseAllLabel();
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
      const scope = folderScopeFor(id);
      const group = buildFolderGroup(
        id, folder, folder, bulkHideFromFor(id, folder), scope ? { scope, folder } : undefined,
      );
      const folderBody = group.querySelector<HTMLUListElement>('.ml-folder-body')!;
      body.appendChild(group);
      rows.filter(r => (r.dataset.folder || '') === folder).forEach(row => {
        row.classList.add('ml-folder-row');
        folderBody.appendChild(row);
      });
    });
    rows.filter(r => !r.dataset.folder).forEach(row => body.appendChild(row));
  }

  return { sectionHead, renderEmptyFolderPlaceholders, buildFolderGroup, renderSection };
}
