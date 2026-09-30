/**
 * list-actions.ts — what every list offers: "▶ Quiz" in its panel header, and the two Export
 * entries in its card's ⚙ menu. Built once here so Single-Language, Cross-Language and Smart lists
 * offer them identically.
 */

import { readString } from '../../utils/storage.ts';
import { saveListFilterState, refreshFilterSelect } from '../../utils/word-lists.ts';
import type { FilterScope } from '../../filters/filter-scope.ts';
import { exportRows, type ExportRow } from './export-list.ts';
import type { MenuItem } from './sidebar-menu.ts';

/** A list card's ⚙ "Export" entry, which opens a submenu of the two ways to export it — a study sheet
 *  (word + translation) or bare words. `getRows` is asked at click time, so it can load the vocabulary
 *  first and reads the list as it is then. Returned as an array so a menu can spread it in. */
export function exportMenuItems(getRows: () => Promise<ExportRow[]>, baseName: string): MenuItem[] {
  return [{
    glyph: '\u2193', label: 'Export', title: 'Download this list as a .txt file', tone: 'export',
    onClick: () => {},
    submenu: ([
      ['with-translation', 'Word + Translation', 'Download a .txt study sheet — each word with its translation'],
      ['words-only',       'Words Only',         'Download a .txt with just the words, one per line'],
    ] as const).map(([format, label, title]) => ({
      glyph: '\u2193', label, title, tone: 'export' as const,
      onClick: () => { void getRows().then(rows => exportRows(rows, baseName, format)); },
    })),
  }];
}

/**
 * "▶ Quiz": focus the list filter on `getSelected()` (an entry as the list
 * filter stores it — see word-lists.ts's qualify*ListName) and start a quiz.
 */
export function buildQuizButton(lang: string, getSelected: () => string | null): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ml-quiz-btn';
  btn.title = 'Focus this list and start a quiz';
  btn.textContent = '▶ Quiz';
  btn.addEventListener('click', () => {
    const selected = getSelected();
    if (!selected) return;
    // Quizzing from here means leaving this tab, so pick the mode the user was
    // last in — but only if it's actually a mode this list filter can reach.
    // Trivia has no vocabulary-list concept (its own question bank, not
    // `list`) and My Lists/Settings/History have no quiz at all, so landing
    // on any of those left Start Quiz doing nothing. Same allowlist as
    // history-mode.ts's own "quiz these" action.
    const savedMode = readString('vq_mode');
    const usableModes = new Set(['table', 'picture']);
    const targetMode = savedMode && usableModes.has(savedMode) ? savedMode : 'table';
    // The list filter is per mode, so this has to be written for the mode we
    // are about to switch to. Writing it for My Lists would set up a filter on
    // the tab we are leaving and land on an unfiltered quiz.
    saveListFilterState(
      lang,
      { active: true, mode: 'focus', selected: [selected] },
      targetMode as FilterScope,
    );
    refreshFilterSelect(lang);
    document.querySelector<HTMLElement>(`.mode-tab[data-mode="${targetMode}"]`)?.click();
    (document.getElementById('startBtn') as HTMLButtonElement | null)?.click();
  });
  return btn;
}
