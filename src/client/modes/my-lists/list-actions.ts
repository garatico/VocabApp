/**
 * list-actions.ts — the header controls every list panel shares: "↓ Export"
 * (with its format picker) and "▶ Quiz". Built once here so Single-Language,
 * Cross-Language and Smart lists offer them identically.
 */

import { readString } from '../../utils/storage.ts';
import { saveListFilterState, refreshFilterSelect } from '../../utils/word-lists.ts';
import type { FilterScope } from '../../filters/filter-scope.ts';
import type { ExportFormat } from './types.ts';

/** `[button, label, format select]`, ready to append to a title group. */
export function buildExportControls(onExport: (format: ExportFormat) => void): HTMLElement[] {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'ml-export-btn';
  btn.textContent = '↓ Export';

  const label = document.createElement('span');
  label.className = 'ml-export-format-label'; label.textContent = 'Export Format:';

  const sel = document.createElement('select');
  sel.className = 'ml-export-format-sel';
  sel.title = 'Export format';
  ([
    ['with-translation', 'Word + Translation'],
    ['words-only',       'Words Only'],
  ] as const).forEach(([value, text]) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = text;
    sel.appendChild(opt);
  });

  btn.addEventListener('click', () => onExport(sel.value as ExportFormat));
  return [btn, label, sel];
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
