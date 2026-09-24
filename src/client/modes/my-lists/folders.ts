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
 */

import { readJson, writeJson, isStringArray } from '../../utils/storage.ts';

const PREFIX = 'ml_folders_';

function key(scope: string): string {
  return PREFIX + scope;
}

export function getFolderRegistry(scope: string): string[] {
  return readJson<string[]>(key(scope), [], isStringArray);
}

/** No-op if the name already exists (case-sensitive — same as every other
 *  named entity in this app, list names included). */
export function addFolder(scope: string, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const folders = getFolderRegistry(scope);
  if (folders.includes(trimmed)) return false;
  writeJson(key(scope), [...folders, trimmed].sort((a, b) => a.localeCompare(b)));
  return true;
}

/** Removing a folder only retires it from the registry — it does not touch
 *  any list/rule/profile that still names it in its own `folders` array
 *  (those just fall back to rendering under an ad-hoc, unregistered group
 *  the next time one of them is read — see sidebar.ts's allFoldersFor,
 *  which unions the registry with whatever's actually still in use). */
export function removeFolder(scope: string, name: string): void {
  writeJson(key(scope), getFolderRegistry(scope).filter(f => f !== name));
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
