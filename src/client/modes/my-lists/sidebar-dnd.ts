import { getListMeta, setListMeta, getMultiListMeta, setMultiListMeta, metaFolders } from '../../utils/word-lists.ts';
import { getSmartLists, saveSmartRule } from './smart-lists.ts';
import { getVisualProfile, saveVisualProfile } from '../../filters/visual-profiles.ts';
import { type SidebarSectionId } from './sidebar-state.ts';
import { getPreset, savePreset } from '../../filters/presets.ts';
import type { FilterScope } from '../../filters/filter-scope.ts';

/**
 * sidebar-dnd.ts — drag a list card onto a folder header. See the comment inside for why it
 * is scoped to three of the four sections and how the payload travels.
 */

export type DraggedListItem =
  | { kind: 'single'; lang: string; name: string }
  | { kind: 'smart';  lang: string; name: string }
  | { kind: 'multi';  name: string }
  | { kind: 'visual'; name: string }
  | { kind: 'profiles'; mode: FilterScope; name: string };

export interface CreateDndKitDeps {
  render: (rerenderPanel?: boolean) => void;
}

export function createDndKit(deps: CreateDndKitDeps) {
  const { render } = deps;

  // ── Drag-and-drop: a list card onto a folder header ─────────────────────
  //
  // The first drag-and-drop in this codebase, so kept as small as the HTML5
  // DnD API allows: a same-page drag needs nothing serialized through
  // DataTransfer, since dragstart and drop both run in this same closure —
  // `draggedItem` carries the payload directly, DataTransfer.setData is only
  // called because Firefox refuses to start a drag without at least one.
  //
  // Every kind of list can be dragged: Single-Language, Smart, Cross-Language, Visual Profiles and
  // Testing Profiles. The first four keep one folder box per section, so a drop is matched on
  // `sectionId`. Testing Profiles build a folder box per *mode* (see renderProfilesNav), keyed
  // `profiles:<mode>:<folder>`, so a profile carries its mode and is only accepted by a folder of that
  // mode — see accepts() below.
  //
  // Additive, not exclusive: dropping onto a folder adds it to that item's
  // `folders` array alongside whatever it already belongs to, the same
  // semantics buildFoldersRow's own checkboxes already use — a list you
  // dropped in the wrong folder by mistake is still just one unchecked box
  // away from being fixed, not a second drag-it-back-out gesture.

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

  /** Testing Profiles keep a folder box per mode, keyed `profiles:<mode>:<folder>` (sidebar-profiles.ts). */
  const profileFolderPrefix = (mode: FilterScope): string => `profiles:${mode}:`;

  /** Can `item` be dropped on the folder header `folderKey` of section `sectionId`? A profile only
   *  goes into a folder of its own mode. */
  function accepts(item: DraggedListItem, sectionId: SidebarSectionId, folderKey: string): boolean {
    if (item.kind === 'profiles') return sectionId === 'profiles' && folderKey.startsWith(profileFolderPrefix(item.mode));
    return item.kind === sectionId;
  }

  /** Adds `item` to the folder named by `folderKey`, a no-op if it's already there. */
  function addDraggedItemToFolder(item: DraggedListItem, folderKey: string): void {
    if (item.kind === 'profiles') {
      const bundle = getPreset(item.mode, item.name);
      if (!bundle) return;
      const folder = folderKey.slice(profileFolderPrefix(item.mode).length);
      const folders = bundle.folders ?? (bundle.folder ? [bundle.folder] : []);
      if (!folder || folders.includes(folder)) return;
      savePreset(item.mode, item.name, { ...bundle, folders: [...folders, folder], folder: undefined });
      return;
    }
    const folder = folderKey;
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
    } else if (item.kind === 'visual') {
      const profile = getVisualProfile(item.name);
      if (!profile) return;
      const folders = profile.folders ?? [];
      if (folders.includes(folder)) return;
      saveVisualProfile(item.name, { ...profile, folders: [...folders, folder] });
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
      if (!draggedItem || !accepts(draggedItem, sectionId, folderKey)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      head.classList.add('ml-folder-head--drop-target');
    });
    head.addEventListener('dragleave', () => {
      head.classList.remove('ml-folder-head--drop-target');
    });
    head.addEventListener('drop', e => {
      head.classList.remove('ml-folder-head--drop-target');
      if (!draggedItem || !accepts(draggedItem, sectionId, folderKey)) return;
      e.preventDefault();
      addDraggedItemToFolder(draggedItem, folderKey);
      draggedItem = null;
      render();
    });
  }

  return { makeListDraggable, makeFolderDropTarget };
}
