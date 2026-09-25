import { getListMeta, setListMeta, getMultiListMeta, setMultiListMeta, metaFolders } from '../../utils/word-lists.ts';
import { getSmartLists, saveSmartRule } from './smart-lists.ts';
import { type SidebarSectionId } from './sidebar-state.ts';

/**
 * sidebar-dnd.ts — drag a list card onto a folder header. See the comment inside for why it
 * is scoped to three of the four sections and how the payload travels.
 */

export type DraggedListItem =
  | { kind: 'single'; lang: string; name: string }
  | { kind: 'smart';  lang: string; name: string }
  | { kind: 'multi';  name: string };

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
  // Scoped to Single-Language, Smart and Cross-Language Lists — the three
  // kinds whose folder grouping already goes through the generic
  // renderSection()/buildFolderGroup() pass below with a plain folder-name
  // `sectionId` ('single'/'smart'/'multi'). Testing Profiles builds its own
  // per-mode folder boxes directly (see renderProfilesNav) and would need
  // the profile's mode threaded through the drop payload too, which is a
  // bigger, separate change; its rows are simply never made draggable here,
  // so a drop on one of its folder headers has nothing to accept.
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

  /** Adds `item` to `folder`, a no-op if it's already there. */
  function addDraggedItemToFolder(item: DraggedListItem, folder: string): void {
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
      if (!draggedItem || draggedItem.kind !== sectionId) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      head.classList.add('ml-folder-head--drop-target');
    });
    head.addEventListener('dragleave', () => {
      head.classList.remove('ml-folder-head--drop-target');
    });
    head.addEventListener('drop', e => {
      head.classList.remove('ml-folder-head--drop-target');
      if (!draggedItem || draggedItem.kind !== sectionId) return;
      e.preventDefault();
      addDraggedItemToFolder(draggedItem, folderKey);
      draggedItem = null;
      render();
    });
  }

  return { makeListDraggable, makeFolderDropTarget };
}
