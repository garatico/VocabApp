import { getListMeta, setListMeta, getMultiListMeta, setMultiListMeta, metaFolders } from '../../utils/word-lists.ts';
import { getSmartLists, saveSmartRule } from './smart-lists.ts';
import { getVisualProfile, saveVisualProfile } from '../../filters/visual-profiles.ts';
import { type SidebarSectionId } from './sidebar-state.ts';
import { getPreset, savePreset } from '../../filters/presets.ts';
import type { FilterScope } from '../../filters/filter-scope.ts';
import { folderParent, isInFolderTree } from './folders.ts';
import '../../styles-lazy/my-lists.css';

/**
 * sidebar-dnd.ts — drag list cards and folders around the sidebar. See the comment inside for
 * what can go where and how the payload travels.
 */

export type DraggedListItem =
  | { kind: 'single'; lang: string; name: string }
  | { kind: 'smart';  lang: string; name: string }
  | { kind: 'multi';  name: string }
  | { kind: 'visual'; name: string }
  | { kind: 'profiles'; mode: FilterScope; name: string };

export interface CreateDndKitDeps {
  render: (rerenderPanel?: boolean) => void;
  /** Move the folder `path` (of the section whose folder keys start with `keyPrefix`) under
   *  `newParent` ('' = the top level), carrying its subtree. Provided by sidebar-folders.ts. */
  moveFolder: (sectionId: SidebarSectionId, keyPrefix: string, path: string, newParent: string) => void;
}

/** A folder being dragged: which section it is in, its path, and the prefix its collapse/drop
 *  keys carry (`profiles:<mode>:` for Testing Profiles, '' elsewhere). */
interface DraggedFolder { sectionId: SidebarSectionId; path: string; keyPrefix: string }

export function createDndKit(deps: CreateDndKitDeps) {
  const { render, moveFolder } = deps;

  // ── Drag-and-drop: list cards and folders ───────────────────────────────
  //
  // A same-page drag needs nothing serialized through DataTransfer, since dragstart and drop both
  // run in this same closure — `draggedItem` / `draggedFolder` carry the payload directly,
  // DataTransfer.setData is only called because Firefox refuses to start a drag without one.
  //
  // What can go where:
  //  - a list card onto a folder header — into that folder. A card dragged *out of* a folder moves
  //    (it leaves the folder it was dragged from); one dragged from the ungrouped list is added,
  //    since a list can sit in several folders at once.
  //  - a list card onto the section's own body (the strip that appears while dragging) — out of the
  //    folder it came from, back to ungrouped.
  //  - a folder header onto another folder header — nested inside it; onto the section body — back
  //    to the top level. A folder can't go inside itself or its own subfolders.
  //
  // Every kind of list can be dragged: Single-Language, Smart, Cross-Language, Visual Profiles and
  // Testing Profiles. The first four keep one folder tree per section, matched on `sectionId`.
  // Testing Profiles keep a tree per *mode* (see renderProfilesNav), keyed
  // `profiles:<mode>:<folder>`, so an item only goes to a folder of its own mode.

  let draggedItem: DraggedListItem | null = null;
  let draggedFrom = '';                       // folder path the dragged list card was inside, '' if none
  let draggedFolder: DraggedFolder | null = null;

  const stripKey = (sectionId: string, keyPrefix: string): string => `${sectionId}|${keyPrefix}`;

  /** While something is dragged, only the "move out" strip it could actually use shows (`key`
   *  names it), and only when the dragged thing is inside a folder — a strip anywhere else would
   *  push the folders below it out from under the pointer. Deferred a tick: changing the layout
   *  inside dragstart makes some browsers cancel the drag. */
  function setDragging(key: string | null): void {
    document.querySelectorAll('.ml-root-drop--armed').forEach(el => el.classList.remove('ml-root-drop--armed'));
    if (key === null) return;
    window.setTimeout(() => {
      if (!draggedItem && !draggedFolder) return;
      document.querySelectorAll(`.ml-root-drop[data-dnd-key="${key}"]`).forEach(el => el.classList.add('ml-root-drop--armed'));
    }, 0);
  }

  /** The folder a card is currently drawn inside (the innermost box), '' if it is ungrouped. */
  function folderOf(el: HTMLElement): string {
    const group = el.closest('.ml-folder-group');
    return group?.querySelector<HTMLElement>(':scope > .ml-folder-head')?.dataset.folderPath ?? '';
  }

  function makeListDraggable(li: HTMLElement, item: DraggedListItem): void {
    li.draggable = true;
    li.addEventListener('dragstart', e => {
      e.stopPropagation();
      draggedItem = item;
      draggedFrom = folderOf(li);
      li.classList.add('ml-list-item--dragging');
      e.dataTransfer?.setData('text/plain', item.name);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      const prefix = item.kind === 'profiles' ? profileFolderPrefix(item.mode) : '';
      setDragging(draggedFrom ? stripKey(item.kind, prefix) : null);
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('ml-list-item--dragging');
      draggedItem = null; draggedFrom = '';
      setDragging(null);
    });
  }

  /** Testing Profiles keep a folder tree per mode, keyed `profiles:<mode>:<folder>` (sidebar-profiles.ts). */
  const profileFolderPrefix = (mode: FilterScope): string => `profiles:${mode}:`;

  /** Can `item` be dropped in the section `sectionId` whose folder keys start with `keyPrefix`? A
   *  profile only goes into a folder of its own mode. */
  function accepts(item: DraggedListItem, sectionId: SidebarSectionId, keyPrefix: string): boolean {
    if (item.kind === 'profiles') return sectionId === 'profiles' && keyPrefix === profileFolderPrefix(item.mode);
    return item.kind === sectionId;
  }

  /** Applies `change` to the folders `item` is filed under, writing only if it altered them. */
  function changeItemFolders(item: DraggedListItem, change: (folders: string[]) => string[]): void {
    const apply = (folders: string[]): string[] | null => {
      const next = change(folders);
      return next.length === folders.length && next.every((f, i) => f === folders[i]) ? null : next;
    };
    if (item.kind === 'profiles') {
      const bundle = getPreset(item.mode, item.name);
      if (!bundle) return;
      const next = apply(bundle.folders ?? (bundle.folder ? [bundle.folder] : []));
      if (next) savePreset(item.mode, item.name, { ...bundle, folders: next, folder: undefined });
    } else if (item.kind === 'single') {
      const meta = getListMeta(item.lang, item.name);
      const next = apply(metaFolders(meta));
      if (next) setListMeta(item.lang, item.name, { ...meta, folders: next, folder: undefined });
    } else if (item.kind === 'multi') {
      const meta = getMultiListMeta(item.name);
      const next = apply(metaFolders(meta));
      if (next) setMultiListMeta(item.name, { ...meta, folders: next, folder: undefined });
    } else if (item.kind === 'visual') {
      const profile = getVisualProfile(item.name);
      if (!profile) return;
      const next = apply(profile.folders ?? []);
      if (next) saveVisualProfile(item.name, { ...profile, folders: next });
    } else {
      const rule = getSmartLists(item.lang)[item.name];
      if (!rule) return;
      const next = apply(rule.folders ?? []);
      if (next) saveSmartRule(item.lang, item.name, { ...rule, folders: next, folder: undefined });
    }
  }

  /** Files `item` into `to` ('' = out of any folder), leaving the folder it was dragged `from`. */
  function moveItem(item: DraggedListItem, from: string, to: string): void {
    changeItemFolders(item, folders => {
      let next = from && from !== to ? folders.filter(f => f !== from) : folders;
      if (to && !next.includes(to)) next = [...next, to];
      return next;
    });
  }

  const keyPrefixOf = (folderKey: string, path: string): string => folderKey.slice(0, folderKey.length - path.length);

  /** Can the dragged folder go under `newParent` in the section/prefix given? */
  function folderAccepts(sectionId: SidebarSectionId, keyPrefix: string, newParent: string): boolean {
    const f = draggedFolder;
    if (!f || f.sectionId !== sectionId || f.keyPrefix !== keyPrefix) return false;
    if (isInFolderTree(newParent, f.path)) return false;      // into itself or its own subfolder
    return folderParent(f.path) !== newParent;                 // already there
  }

  /** Makes a folder's header bar draggable, so the whole folder can be moved. */
  function makeFolderDraggable(head: HTMLElement, sectionId: SidebarSectionId, folderKey: string, path: string): void {
    head.draggable = true;
    head.addEventListener('dragstart', e => {
      e.stopPropagation();
      draggedFolder = { sectionId, path, keyPrefix: keyPrefixOf(folderKey, path) };
      head.classList.add('ml-folder-head--dragging');
      e.dataTransfer?.setData('text/plain', path);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      setDragging(folderParent(path) ? stripKey(sectionId, draggedFolder.keyPrefix) : null);
    });
    head.addEventListener('dragend', () => {
      head.classList.remove('ml-folder-head--dragging');
      draggedFolder = null;
      setDragging(null);
    });
  }

  /** Wires `head` (a folder box's header bar) to accept a drop — a list card (into the folder) or
   *  another folder (nested inside it). `path` is this folder's own path within its section. */
  function makeFolderDropTarget(head: HTMLElement, sectionId: SidebarSectionId, folderKey: string, path?: string): void {
    const target = path ?? folderKey;
    const prefix = path === undefined ? '' : keyPrefixOf(folderKey, path);
    const listOk   = (): boolean => !!draggedItem && accepts(draggedItem, sectionId, prefix);
    const folderOk = (): boolean => folderAccepts(sectionId, prefix, target);
    head.addEventListener('dragover', e => {
      if (!listOk() && !folderOk()) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      head.classList.add('ml-folder-head--drop-target');
    });
    head.addEventListener('dragleave', () => {
      head.classList.remove('ml-folder-head--drop-target');
    });
    head.addEventListener('drop', e => {
      head.classList.remove('ml-folder-head--drop-target');
      if (listOk() && draggedItem) {
        e.preventDefault(); e.stopPropagation();
        const item = draggedItem, from = draggedFrom;
        draggedItem = null;
        moveItem(item, from, target);
        render();
      } else if (folderOk() && draggedFolder) {
        e.preventDefault(); e.stopPropagation();
        const f = draggedFolder;
        draggedFolder = null;
        moveFolder(f.sectionId, f.keyPrefix, f.path, target);
      }
    });
  }

  /**
   * Makes `el` — a section's body, or one Testing Profile mode's — the place to drop things to take
   * them out of a folder: a card back to ungrouped, a folder back to the top level. A strip at its
   * bottom says so while a drag is on. Drops that land on a folder box are that box's own to handle.
   */
  function makeRootDropTarget(el: HTMLElement, sectionId: SidebarSectionId, keyPrefix: string): void {
    const strip = document.createElement('li');
    strip.className = 'ml-root-drop';
    strip.dataset.dndKey = stripKey(sectionId, keyPrefix);
    strip.textContent = '⤴ Drop here to move out of its folder';
    el.append(strip);

    const onFolderBox = (e: Event): boolean => {
      const box = (e.target as Element).closest('.ml-folder-group');
      return !!box && el.contains(box);
    };
    const listOk   = (): boolean => !!draggedItem && draggedFrom !== '' && accepts(draggedItem, sectionId, keyPrefix);
    const folderOk = (): boolean => folderAccepts(sectionId, keyPrefix, '');
    el.addEventListener('dragover', e => {
      if (onFolderBox(e) || (!listOk() && !folderOk())) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      strip.classList.add('ml-root-drop--over');
    });
    el.addEventListener('dragleave', e => {
      if (!el.contains(e.relatedTarget as Node | null)) strip.classList.remove('ml-root-drop--over');
    });
    el.addEventListener('drop', e => {
      strip.classList.remove('ml-root-drop--over');
      if (onFolderBox(e)) return;
      if (listOk() && draggedItem) {
        e.preventDefault();
        const item = draggedItem, from = draggedFrom;
        draggedItem = null;
        moveItem(item, from, '');
        render();
      } else if (folderOk() && draggedFolder) {
        e.preventDefault();
        const f = draggedFolder;
        draggedFolder = null;
        moveFolder(f.sectionId, f.keyPrefix, f.path, '');
      }
    });
  }

  return { makeListDraggable, makeFolderDropTarget, makeFolderDraggable, makeRootDropTarget };
}
