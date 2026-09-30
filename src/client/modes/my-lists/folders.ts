/**
 * folders.ts — folders are first-class, named entities, not just a tag
 * derived from whichever lists currently happen to carry it.
 *
 * A folder created here (the sidebar's "+ Folder" button) shows up as its
 * own collapsible row in the sidebar even with nothing in it yet, and stays
 * there until explicitly deleted — same "create it, then populate it later"
 * flow every other list-like entity in this app already gets.
 *
 * One registry per "section scope" — single-language lists and smart lists
 * are further scoped per language (folders are meaningless across a
 * language switch the way the lists themselves are), cross-language lists
 * and each Testing Profile mode are their own single global scope. Callers
 * build the scope key (see sidebar.ts's folderScopeFor helpers) rather than
 * this module knowing about languages/modes itself.
 *
 * Folders nest. A folder's name is its whole path, levels joined by "/"
 * ("Spanish/Verbs/Irregular"), so the registry stays a flat string[] and every
 * list's `folders` array keeps meaning the same thing — no stored data changes
 * shape. The parent of "A/B" is "A"; a parent need not be registered itself
 * (the tree fills in the missing levels), and renaming or deleting one carries
 * its whole subtree with it.
 */

import { readJson, writeJson, isStringArray } from '../../utils/storage.ts';

const PREFIX = 'ml_folders_';

function key(scope: string): string {
  return PREFIX + scope;
}

export function getFolderRegistry(scope: string): string[] {
  return readJson<string[]>(key(scope), [], isStringArray);
}

// ── Nesting ─────────────────────────────────────────────────────────────────

export const FOLDER_SEP = '/';

/** Tidies a typed path: each level trimmed, empty levels dropped ("A/ /B/" → "A/B"). */
export function normalizeFolderPath(name: string): string {
  return name.split(FOLDER_SEP).map(p => p.trim()).filter(Boolean).join(FOLDER_SEP);
}

/** The last level — what a folder is called on screen. */
export function folderLeaf(path: string): string {
  return path.slice(path.lastIndexOf(FOLDER_SEP) + 1);
}

/** The enclosing folder's path, '' for a top-level folder. */
export function folderParent(path: string): string {
  const i = path.lastIndexOf(FOLDER_SEP);
  return i < 0 ? '' : path.slice(0, i);
}

/** `path` is `root` itself or somewhere beneath it. */
export function isInFolderTree(path: string, root: string): boolean {
  return path === root || path.startsWith(root + FOLDER_SEP);
}

/** Every path given plus each level above it, so a folder holding only subfolders still exists. */
export function withAncestors(paths: Iterable<string>): string[] {
  const all = new Set<string>();
  for (const p of paths) {
    if (!p) continue;
    let cur = p;
    while (cur && !all.has(cur)) { all.add(cur); cur = folderParent(cur); }
  }
  return [...all];
}

/** The folders directly under `parent` ('' for the top level), alphabetical by name. */
export function childFolders(all: readonly string[], parent: string): string[] {
  return all.filter(p => folderParent(p) === parent)
    .sort((a, b) => folderLeaf(a).localeCompare(folderLeaf(b)));
}

/** No-op if the name already exists (case-sensitive — same as every other
 *  named entity in this app, list names included). */
export function addFolder(scope: string, name: string): boolean {
  const trimmed = normalizeFolderPath(name);
  if (!trimmed) return false;
  const folders = getFolderRegistry(scope);
  if (folders.includes(trimmed)) return false;
  writeJson(key(scope), [...folders, trimmed].sort((a, b) => a.localeCompare(b)));
  return true;
}

/**
 * Renames a folder in the registry and carries its emoji/colour over. False (nothing written) if
 * `newName` is blank, unchanged, or already taken. This alone does not touch any list/rule/profile
 * that names the folder in its own `folders` array — that rename goes through each section's own
 * store (see sidebar-folders.ts's renameFolderReferences), since this module has no notion of what a
 * "scope" actually holds.
 */
export function renameFolder(scope: string, oldName: string, newName: string): boolean {
  const trimmed = normalizeFolderPath(newName);
  if (!trimmed || trimmed === oldName) return false;
  const folders = getFolderRegistry(scope);
  // Moving a folder inside itself would orphan it; a taken name would merge two folders.
  if (isInFolderTree(trimmed, oldName) || folders.includes(trimmed)) return false;
  if (!folders.some(f => isInFolderTree(f, oldName))) return false; // not a folder at all
  writeJson(key(scope), folders.map(f => moveFolderPath(f, oldName, trimmed)).sort((a, b) => a.localeCompare(b)));
  const styles = readStyles(scope);
  const moved: Record<string, FolderStyle> = {};
  for (const [name, style] of Object.entries(styles)) moved[moveFolderPath(name, oldName, trimmed)] = style;
  writeJson(STYLE_PREFIX + scope, moved);
  return true;
}

/** `path` with its `from` prefix replaced by `to` — the one rule every rename applies, to the
 *  registry, styles and each list's `folders`, so the folder and its subtree move together. */
export function moveFolderPath(path: string, from: string, to: string): string {
  return isInFolderTree(path, from) ? to + path.slice(from.length) : path;
}

/** Removing a folder only retires it from the registry — it does not touch
 *  any list/rule/profile that still names it in its own `folders` array
 *  (those just fall back to rendering under an ad-hoc, unregistered group
 *  the next time one of them is read — see sidebar.ts's allFoldersFor,
 *  which unions the registry with whatever's actually still in use). */
export function removeFolder(scope: string, name: string): void {
  writeJson(key(scope), getFolderRegistry(scope).filter(f => !isInFolderTree(f, name)));
  const styles = readStyles(scope);
  const kept = Object.fromEntries(Object.entries(styles).filter(([f]) => !isInFolderTree(f, name)));
  if (Object.keys(kept).length !== Object.keys(styles).length) writeJson(STYLE_PREFIX + scope, kept);
}

// ── Folder appearance ───────────────────────────────────────────────────────
//
// An optional emoji and accent colour per folder, stored beside the registry
// (`ml_folder_style_<scope>`, name → style) rather than inside it so the
// registry stays a plain string[] that older data and backups already read.

export interface FolderStyle { emoji?: string; color?: string; }

/** Swatches offered in the folder style picker. */
export const FOLDER_COLORS: readonly string[] = [
  '#c0392b', '#d9822b', '#c9a227', '#3d8b5a', '#0f7d94', '#2f6fd0', '#7c5cbf', '#b0479a', '#6b6b6b',
];

const STYLE_PREFIX = 'ml_folder_style_';

function isStyleMap(v: unknown): v is Record<string, FolderStyle> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readStyles(scope: string): Record<string, FolderStyle> {
  return readJson<Record<string, FolderStyle>>(STYLE_PREFIX + scope, {}, isStyleMap);
}

export function getFolderStyle(scope: string, name: string): FolderStyle {
  const s = readStyles(scope)[name];
  return {
    emoji: typeof s?.emoji === 'string' ? s.emoji : undefined,
    color: typeof s?.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(s.color) ? s.color : undefined,
  };
}

/** Empty fields clear that part; a style with neither is dropped entirely. */
export function setFolderStyle(scope: string, name: string, style: FolderStyle): void {
  const all = readStyles(scope);
  const emoji = style.emoji?.trim() || undefined;
  const color = style.color || undefined;
  if (emoji || color) all[name] = { emoji, color }; else delete all[name];
  writeJson(STYLE_PREFIX + scope, all);
}
