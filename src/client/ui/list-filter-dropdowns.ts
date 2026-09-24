/**
 * list-filter-dropdowns.ts — choose lists for a Lists filter from a few
 * dropdowns instead of one flat wall of checkboxes.
 *
 * One dropdown per kind of list (Lists, Cross-Language, Smart Lists), each
 * searchable and scrollable, with folders as sub-headings inside it — so a
 * learner with dozens of lists sees three compact buttons, not dozens of
 * pills. Shared by the live Lists filter (Table/Picture/…) and a Testing
 * Profile's own Lists section, which used to keep two copies of the same
 * checkbox layout.
 */

import { buildChecklistDropdown, closeAllChipDropdowns } from '../modes/my-lists/chip-dropdown.ts';
import type { ChipDropdownOption } from '../modes/my-lists/chip-dropdown.ts';
import type { FilterableListRow } from '../utils/word-lists.ts';
import { buildLangBadge } from './lang-badge.ts';
import { getFolderRegistry } from '../modes/my-lists/folders.ts';

export interface ListFilterDropdownsOptions {
  /** The full current selection (qualified names) — read fresh on every change. */
  getSelected: () => string[];
  /** Called with the full replacement selection whenever a box is ticked/unticked. */
  setSelected: (next: string[]) => void;
  emptyText?: string;
  /** Languages whose folders should be offered (for folders with no lists yet). */
  languages?: string[];
}

const KINDS: readonly { group: FilterableListRow['group']; label: string; cls: string }[] = [
  { group: 'single', label: 'Lists',          cls: 'single' },
  { group: 'multi',  label: 'Cross-Language', cls: 'multi' },
  { group: 'smart',  label: 'Smart Lists',    cls: 'smart' },
];

/** Where each kind's folders are registered (see my-lists/folders.ts). */
function folderScopes(group: FilterableListRow['group'], languages: string[]): string[] {
  if (group === 'multi') return ['multi'];
  const prefix = group === 'single' ? 'single' : 'smart';
  return languages.map(l => `${prefix}_${l}`);
}

let outsideClickBound = false;
/** Once per page: a click anywhere outside an open dropdown closes it. */
function bindOutsideClick(): void {
  if (outsideClickBound) return;
  outsideClickBound = true;
  document.addEventListener('click', e => {
    if (!(e.target as HTMLElement).closest('.ml-chip-dropdown')) closeAllChipDropdowns();
  }, true);
}

/** Ungrouped lists first, then each folder as a heading — a list in two
 *  folders appears under both, and ticks in both. */
function optionsFor(rows: FilterableListRow[]): ChipDropdownOption[] {
  const toOption = (r: FilterableListRow, group?: string): ChipDropdownOption => ({
    value: r.qualified, label: r.displayName, group,
    hint: r.count === null ? '≈' : String(r.count),
    badge: () => buildLangBadge(r.badgeLangs),
  });
  const out: ChipDropdownOption[] = rows.filter(r => r.folders.length === 0).map(r => toOption(r));
  [...new Set(rows.flatMap(r => r.folders))].sort().forEach(folder => {
    rows.filter(r => r.folders.includes(folder)).forEach(r => out.push(toOption(r, `📁 ${folder}`)));
  });
  return out;
}

export function buildListFilterDropdowns(
  rows: FilterableListRow[], opts: ListFilterDropdownsOptions,
): HTMLElement {
  bindOutsideClick();
  const wrap = document.createElement('div');
  wrap.className = 'list-filter-dropdowns';

  if (rows.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'list-filter-empty';
    empty.textContent = opts.emptyText ?? 'No lists yet — create one in My Lists';
    wrap.appendChild(empty);
    return wrap;
  }

  const current = new Set(opts.getSelected());
  KINDS.forEach(({ group, label, cls }) => {
    const kindRows = rows.filter(r => r.group === group);
    if (kindRows.length === 0) return;
    const values = new Set(kindRows.map(r => r.qualified));
    // This dropdown's own slice of the selection; every other entry (other
    // kinds, or lists of a language not active right now) is carried over.
    const mine = new Set([...current].filter(v => values.has(v)));
    const languages = opts.languages ?? [...new Set(rows.flatMap(r => r.badgeLangs))];
    const usedFolders = new Set(kindRows.flatMap(r => r.folders));
    const emptyFolders = [...new Set(folderScopes(group, languages).flatMap(getFolderRegistry))]
      .filter(f => !usedFolders.has(f)).sort();
    const dd = buildChecklistDropdown(label, optionsFor(kindRows), mine, () => {
      const others = opts.getSelected().filter(v => !values.has(v));
      opts.setSelected([...others, ...mine]);
    }, undefined, { emptyGroups: emptyFolders });
    dd.wrap.classList.add('list-filter-dd', `list-filter-dd--${cls}`);
    wrap.appendChild(dd.wrap);
  });
  return wrap;
}
