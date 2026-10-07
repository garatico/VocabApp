import { getListNames, getMultiListNames, getListMeta, setListMeta, getMultiListMeta, setMultiListMeta, metaFolders, deleteList, deleteMultiList } from '../../utils/word-lists.ts';
import {
  getFolderRegistry, addFolder, renameFolder, removeFolder, getFolderStyle,
  folderLeaf, folderParent, isInFolderTree, moveFolderPath, withAncestors, childFolders, FOLDER_SEP,
} from './folders.ts';
import { type ListsCtx } from './context.ts';
import { askChoice } from '../../ui/dialog.ts';
import { getSmartNames, getSmartLists, saveSmartRule, deleteSmartList } from './smart-lists.ts';
import { listVisualProfiles, getVisualProfile, saveVisualProfile, deleteVisualProfile } from '../../filters/visual-profiles.ts';
import { listPresets, getPreset, savePreset, deletePreset } from '../../filters/presets.ts';
import type { FilterScope } from '../../filters/filter-scope.ts';
import type { MenuItem } from './sidebar-menu.ts';
import type { BulkHideFrom } from './sidebar-pickers.ts';
import { type SidebarSectionId, isSectionCollapsed, setSectionCollapsed, isFolderCollapsed, setFolderCollapsed } from './sidebar-state.ts';
import '../../styles-lazy/my-lists.css';

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
  makeFolderDropTarget: (head: HTMLElement, sectionId: SidebarSectionId, folderKey: string, path?: string) => void;
  makeFolderDraggable: (head: HTMLElement, sectionId: SidebarSectionId, folderKey: string, path: string) => void;
  makeRootDropTarget: (el: HTMLElement, sectionId: SidebarSectionId, keyPrefix: string) => void;
  openFolderStylePicker: (anchor: HTMLElement, scope: string, folder: string) => void;
  openHideFromPicker: (anchor: HTMLElement, bulk: BulkHideFrom) => void;
}

export function createFolderKit(deps: CreateFolderKitDeps) {
  const {
    ctx, render, syncCollapseAllLabel, buildActionMenu, emojiSpan, makeFolderDropTarget, makeFolderDraggable,
    makeRootDropTarget, openFolderStylePicker, openHideFromPicker,
  } = deps;

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
    const used = new Set(withAncestors(usedFolders));
    getFolderRegistry(scope).filter(f => !used.has(f)).forEach(folder => {
      const li = document.createElement('li');
      li.className = 'ml-list-empty';
      li.textContent = 'No lists in this folder yet.';
      li.dataset.folder = folder;
      ctx.listNav.appendChild(li);
    });
  }

  /** Smart Lists and Starter Lists share one store; a rule's `starter` flag says which section shows it. */
  function smartNamesIn(sectionId: 'smart' | 'starter'): string[] {
    const rules = getSmartLists(ctx.lang);
    return getSmartNames(ctx.lang).filter(n => !!rules[n].starter === (sectionId === 'starter'));
  }

  function bulkHideFromFor(sectionId: SidebarSectionId, folder: string): BulkHideFrom | undefined {
    if (sectionId === 'single') {
      const names = getListNames(ctx.lang).filter(n => metaFolders(getListMeta(ctx.lang, n)).some(f => isInFolderTree(f, folder)));
      return {
        get: () => [...new Set(names.flatMap(n => getListMeta(ctx.lang, n).hiddenModes ?? []))],
        set: modes => names.forEach(n => setListMeta(ctx.lang, n, { ...getListMeta(ctx.lang, n), hiddenModes: modes })),
      };
    }
    if (sectionId === 'smart' || sectionId === 'starter') {
      const rules = getSmartLists(ctx.lang);
      const names = smartNamesIn(sectionId).filter(n => (rules[n].folders ?? []).some(f => isInFolderTree(f, folder)));
      return {
        get: () => [...new Set(names.flatMap(n => rules[n].hiddenModes ?? []))],
        set: modes => names.forEach(n => saveSmartRule(ctx.lang, n, { ...getSmartLists(ctx.lang)[n], hiddenModes: modes })),
      };
    }
    if (sectionId === 'multi') {
      const names = getMultiListNames().filter(n => metaFolders(getMultiListMeta(n)).some(f => isInFolderTree(f, folder)));
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
   * Renaming a folder (folders.ts's renameFolder) only moves the registry entry and its style — it
   * has no notion of what a "scope" actually holds. This is the other half: walk every list/rule/
   * profile that could be filed under `oldName` in this section's own store and swap the name in its
   * `folders` array (and the legacy singular `folder`, folded in the same way metaFolders() does).
   * `scope` is whatever buildFolderGroup's caller already computed — for Testing Profiles that is
   * `profiles_<mode>`, which is where the mode this rename applies to comes from.
   */
  function renameFolderReferences(sectionId: SidebarSectionId, scope: string, oldName: string, newName: string): void {
    const swap = (folders: string[]): string[] => folders.map(f => moveFolderPath(f, oldName, newName));
    const touches = (folders: string[]): boolean => folders.some(f => isInFolderTree(f, oldName));
    if (sectionId === 'single') {
      getListNames(ctx.lang).forEach(n => {
        const meta = getListMeta(ctx.lang, n);
        const folders = metaFolders(meta);
        if (touches(folders)) setListMeta(ctx.lang, n, { ...meta, folders: swap(folders), folder: undefined });
      });
    } else if (sectionId === 'smart' || sectionId === 'starter') {
      const rules = getSmartLists(ctx.lang);
      smartNamesIn(sectionId).forEach(n => {
        const folders = rules[n].folders ?? [];
        if (touches(folders)) saveSmartRule(ctx.lang, n, { ...rules[n], folders: swap(folders), folder: undefined });
      });
    } else if (sectionId === 'multi') {
      getMultiListNames().forEach(n => {
        const meta = getMultiListMeta(n);
        const folders = metaFolders(meta);
        if (touches(folders)) setMultiListMeta(n, { ...meta, folders: swap(folders), folder: undefined });
      });
    } else if (sectionId === 'visual') {
      listVisualProfiles().forEach(n => {
        const profile = getVisualProfile(n);
        const folders = profile?.folders ?? [];
        if (profile && touches(folders)) saveVisualProfile(n, { ...profile, folders: swap(folders) });
      });
    } else if (sectionId === 'profiles') {
      const mode = scope.slice('profiles_'.length) as FilterScope;
      listPresets(mode).forEach(n => {
        const bundle = getPreset(mode, n);
        const folders = bundle?.folders ?? (bundle?.folder ? [bundle.folder] : []);
        if (bundle && touches(folders)) savePreset(mode, n, { ...bundle, folders: swap(folders), folder: undefined });
      });
    }
  }

  /**
   * The other half of deleting a folder: `removeFolder` (folders.ts) only
   * retires the registry entry and its style. Every list/rule/profile still
   * naming `folder` in its own `folders` array either loses just that one
   * tag (falls back to ungrouped — `alsoDeleteMembers` false) or is deleted
   * outright along with it (`alsoDeleteMembers` true), same per-section
   * dispatch as renameFolderReferences above.
   */
  function deleteFolderReferences(
    sectionId: SidebarSectionId, scope: string, folder: string, alsoDeleteMembers: boolean,
  ): void {
    const drop = (folders: string[]): string[] => folders.filter(f => !isInFolderTree(f, folder));
    const inside = (folders: string[]): boolean => folders.some(f => isInFolderTree(f, folder));
    if (sectionId === 'single') {
      getListNames(ctx.lang).forEach(n => {
        const meta = getListMeta(ctx.lang, n);
        if (!inside(metaFolders(meta))) return;
        if (alsoDeleteMembers) { deleteList(ctx.lang, n); return; }
        setListMeta(ctx.lang, n, { ...meta, folders: drop(metaFolders(meta)), folder: undefined });
      });
    } else if (sectionId === 'smart' || sectionId === 'starter') {
      const rules = getSmartLists(ctx.lang);
      smartNamesIn(sectionId).forEach(n => {
        const folders = rules[n].folders ?? [];
        if (!inside(folders)) return;
        if (alsoDeleteMembers) { deleteSmartList(ctx.lang, n); return; }
        saveSmartRule(ctx.lang, n, { ...rules[n], folders: drop(folders), folder: undefined });
      });
    } else if (sectionId === 'multi') {
      getMultiListNames().forEach(n => {
        const meta = getMultiListMeta(n);
        if (!inside(metaFolders(meta))) return;
        if (alsoDeleteMembers) { deleteMultiList(n); return; }
        setMultiListMeta(n, { ...meta, folders: drop(metaFolders(meta)), folder: undefined });
      });
    } else if (sectionId === 'visual') {
      listVisualProfiles().forEach(n => {
        const profile = getVisualProfile(n);
        const folders = profile?.folders ?? [];
        if (!profile || !inside(folders)) return;
        if (alsoDeleteMembers) { deleteVisualProfile(n); return; }
        saveVisualProfile(n, { ...profile, folders: drop(folders) });
      });
    } else if (sectionId === 'profiles') {
      const mode = scope.slice('profiles_'.length) as FilterScope;
      listPresets(mode).forEach(n => {
        const bundle = getPreset(mode, n);
        const folders = bundle?.folders ?? (bundle?.folder ? [bundle.folder] : []);
        if (!bundle || !inside(folders)) return;
        if (alsoDeleteMembers) { deletePreset(mode, n); return; }
        savePreset(mode, n, { ...bundle, folders: drop(folders), folder: undefined });
      });
    }
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
    if (sectionId === 'starter') return `starter_${ctx.lang}`;
    if (sectionId === 'multi') return 'multi';
    if (sectionId === 'visual') return 'visual_profiles';
    return null; // Testing Profiles passes its per-mode scope explicitly
  }

  /**
   * Drag-and-drop's folder move: `path` goes under `newParent` ('' = top level), taking its
   * subfolders, their looks and every list filed inside along, exactly as a rename to the new path.
   * `keyPrefix` says whose folders these are (Testing Profiles: `profiles:<mode>:`).
   */
  function moveFolder(sectionId: SidebarSectionId, keyPrefix: string, path: string, newParent: string): void {
    const scope = sectionId === 'profiles' ? `profiles_${keyPrefix.split(':')[1]}` : folderScopeFor(sectionId);
    if (!scope) return;
    const leaf = folderLeaf(path);
    const dest = newParent ? newParent + FOLDER_SEP + leaf : leaf;
    if (dest === path || isInFolderTree(newParent, path)) return;
    addFolder(scope, path); // a level that only exists as someone's parent isn't registered yet
    if (!renameFolder(scope, path, dest)) {
      alert(`A folder named "${leaf}" already exists there.`);
      return;
    }
    renameFolderReferences(sectionId, scope, path, dest);
    setFolderCollapsed(sectionId, keyPrefix + dest, isFolderCollapsed(sectionId, keyPrefix + path));
    if (newParent) setFolderCollapsed(sectionId, keyPrefix + newParent, false); // show where it landed
    render();
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
    // The path is what a drag reads to know which folder this bar is (its label is only the last level).
    if (style) {
      head.dataset.folderPath = style.folder;
      makeFolderDraggable(head, sectionId, folderKey, style.folder);
    }
    makeFolderDropTarget(head, sectionId, folderKey, style?.folder);

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
      // A prompt, not the inline-input rename every list card uses — the head is a mix of caret, icon,
      // emoji and text rather than one discrete name element, same reasoning as "+ Folder"'s own prompt.
      folderItems.push({
        glyph: '✏', label: 'Rename', title: 'Rename', tone: 'rename',
        onClick: () => {
          // Only the last level is edited; the folder stays under the same parent.
          const input = window.prompt('Rename folder:', folderLeaf(style.folder));
          const leaf = input?.trim().split(FOLDER_SEP).join('-');
          if (!leaf || leaf === folderLeaf(style.folder)) return;
          const parent = folderParent(style.folder);
          const renamed = parent ? parent + FOLDER_SEP + leaf : leaf;
          // A level that only exists because a subfolder sits under it isn't registered yet.
          addFolder(style.scope, style.folder);
          if (!renameFolder(style.scope, style.folder, renamed)) {
            alert(`A folder named "${leaf}" already exists here.`);
            return;
          }
          renameFolderReferences(sectionId, style.scope, style.folder, renamed);
          // Carries the collapsed/expanded state over to the new key so renaming doesn't also re-open it.
          setFolderCollapsed(sectionId, folderKey.slice(0, folderKey.length - style.folder.length) + renamed, collapsed);
          render();
        },
      });
      folderItems.push({
        glyph: '📁', label: 'Add Subfolder', title: 'Create a folder inside this one', tone: 'copy',
        onClick: () => {
          const input = window.prompt(`New folder inside "${folderLeaf(style.folder)}":`);
          const leaf = input?.trim().split(FOLDER_SEP).join('-');
          if (!leaf) return;
          if (!addFolder(style.scope, style.folder + FOLDER_SEP + leaf)) {
            alert(`A folder named "${leaf}" already exists here.`);
            return;
          }
          setFolderCollapsed(sectionId, folderKey, false);
          render();
        },
      });
      folderItems.push({
        glyph: '🎨', label: 'Emoji & Colour', title: "Set this folder's emoji and colour", tone: 'emoji',
        onClick: anchor => openFolderStylePicker(anchor, style.scope, style.folder),
      });
      folderItems.push({
        glyph: '🗑', label: 'Delete', title: 'Delete this folder', tone: 'delete',
        onClick: () => {
          const nested = getFolderRegistry(style.scope).some(f => f !== style.folder && isInFolderTree(f, style.folder));
          const inside = nested ? ' and its subfolders' : '';
          void askChoice<'folder' | 'all'>({
            title: `Delete "${folderLeaf(style.folder)}"?`,
            choices: [
              { label: nested ? 'Delete folders only' : 'Delete folder only', value: 'folder',
                detail: `Removes the folder${inside}. Its lists stay, ungrouped.` },
              { label: nested ? 'Delete folders and all lists inside' : 'Delete folder and all lists inside', value: 'all', danger: true,
                detail: `Removes the folder${inside} and every list in ${nested ? 'them' : 'it'}. This can't be undone.` },
            ],
          }).then(choice => {
            if (!choice) return;
            deleteFolderReferences(sectionId, style.scope, style.folder, choice === 'all');
            removeFolder(style.scope, style.folder);
            render();
          });
        },
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
   * Draws `paths` (every folder in play, ancestors filled in) as nested folder boxes into
   * `container`: each level's subfolders first, then that folder's own rows via `fillFolder`.
   * `keyFor` is the collapsed-state / drop-target key for a path, which differs per section
   * (Testing Profiles key theirs by mode).
   */
  function renderFolderTree(o: {
    sectionId: SidebarSectionId; container: HTMLElement; paths: Iterable<string>; scope: string | null;
    keyFor: (path: string) => string;
    bulkFor?: (path: string) => BulkHideFrom | undefined;
    fillFolder: (path: string, body: HTMLUListElement) => void;
  }): void {
    const all = withAncestors(o.paths);
    const build = (parent: string, into: HTMLElement): void => {
      childFolders(all, parent).forEach(path => {
        const group = buildFolderGroup(
          o.sectionId, o.keyFor(path), folderLeaf(path), o.bulkFor?.(path),
          o.scope ? { scope: o.scope, folder: path } : undefined,
        );
        const body = group.querySelector<HTMLUListElement>('.ml-folder-body');
        if (!body) return;
        into.appendChild(group);
        build(path, body);
        o.fillFolder(path, body);
      });
    };
    build('', o.container);
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
    renderFolderTree({
      sectionId: id, container: body, scope: folderScopeFor(id),
      paths: rows.map(r => r.dataset.folder || '').filter(Boolean),
      keyFor: path => path,
      bulkFor: path => bulkHideFromFor(id, path),
      fillFolder: (path, folderBody) => {
        rows.filter(r => (r.dataset.folder || '') === path).forEach(row => {
          row.classList.add('ml-folder-row');
          folderBody.appendChild(row);
        });
      },
    });
    rows.filter(r => !r.dataset.folder).forEach(row => body.appendChild(row));
    // Last, so the strip it adds at the bottom shows without moving anything above it.
    makeRootDropTarget(body, id, '');
  }

  return { sectionHead, renderEmptyFolderPlaceholders, buildFolderGroup, renderFolderTree, renderSection, moveFolder };
}
