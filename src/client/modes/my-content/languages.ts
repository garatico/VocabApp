import { LANGUAGES, type LanguageInfo } from '../../data/languages.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { openLanguagePicker } from '../../ui/language-picker.ts';
import { readString, readJson, writeJson, isStringArray } from '../../utils/storage.ts';
import { el } from './shared.ts';

/**
 * my-content/languages.ts — which languages My Content's forms and lists show:
 * the saved selection and its picker.
 */

// ── Language selection ──────────────────────────────────────────────────────
//
// Which languages the add forms show a row for. Shared across Words/Trivia —
// it's "which languages am I working in right now" for the whole tab, not a
// per-section choice — and persisted so it doesn't need re-picking on every
// visit. Defaults to just the language currently selected in the main
// controls bar, rather than all seven, since most learners only study one or
// two at a time.

const LANG_SELECTION_KEY = 'vq_mycontent_langs';

export function getSelectedLangs(currentLang: string): Set<string> {
  // No key at all means "never chosen yet" — default to the current study
  // language. A key holding `[]` means the learner deliberately deselected
  // every chip, which has to stay empty rather than snapping back to the
  // default on the next render (languageRows' own empty-state placeholder
  // covers that case).
  if (readString(LANG_SELECTION_KEY) === null) return new Set([currentLang]);
  const stored = readJson<string[]>(LANG_SELECTION_KEY, [], isStringArray)
    .filter(name => LANGUAGES.some(info => info.name === name));
  return new Set(stored);
}

function setSelectedLangs(langs: Set<string>): void {
  writeJson(LANG_SELECTION_KEY, [...langs]);
}

/** "Choose languages…" empty, a couple of names spelled out, or a count past
 *  that — same shape as table mode's own languagePickerLabel (ui/
 *  language-picker.ts), minus its "+ " prefix: that reads as "add a
 *  language" there, but this button already sits right after a spelled-out
 *  "Add content in" label, so the label doesn't need to repeat "add". */
function myContentLangLabel(selected: Set<string>): string {
  if (selected.size === 0) return 'Choose languages…';
  const labels = [...selected].map(name => LANGUAGES.find(l => l.name === name)?.label ?? name);
  if (labels.length <= 2) return labels.join(', ');
  return `${labels.length} languages`;
}

/**
 * "Add content in" trigger button + popover — which languages the forms
 * below show a row for. Reuses table mode's own multi-language popover
 * (ui/language-picker.ts) rather than a bespoke one, so this looks and
 * behaves like the "+ Languages" control learners already know from there.
 *
 * `onApply` — the full tab rebuild every other change in this file uses —
 * runs on the popover's onClose, not its onChange: onChange fires on every
 * single checkbox click while the popover is still open, and that popover
 * is appended to document.body, outside this tab's own container. Rebuilding
 * the container on every click would tear out and replace this very button
 * (the popover's anchor) out from under it while the learner is still
 * picking languages, leaving a floating popover pointed at a button that no
 * longer exists. Deferring to onClose also reads better: pick everything
 * you want, then see the rows update once, instead of a rebuild per click.
 */
export function buildLanguagePicker(selected: Set<string>, onApply: () => void): HTMLElement {
  const wrap = el('div', 'mc-lang-dropdown');
  wrap.appendChild(el('span', 'mc-lang-picker-label', 'Add content in'));
  const btn = el('button', 'mc-btn mc-btn--secondary mc-lang-dropdown-btn') as HTMLButtonElement;
  btn.type = 'button';

  function syncLabel(): void {
    btn.textContent = `${myContentLangLabel(selected)} ▾`;
  }
  syncLabel();

  btn.addEventListener('click', () => {
    // Snapshotted so onClose can skip onApply's rebuild entirely if the
    // learner opened this, changed nothing, and clicked away — the same
    // form elsewhere on the tab that made deferring to onClose necessary
    // in the first place shouldn't lose its half-typed contents to a
    // rebuild that had nothing to apply.
    const before = [...selected].sort().join(',');
    let changed = false;
    openLanguagePicker({
      anchorEl: btn,
      exclude:  '', // nothing excluded — every language is a valid pick here
      selected,
      onChange: updated => {
        setSelectedLangs(updated);
        syncLabel();
        changed = [...updated].sort().join(',') !== before;
      },
      onClose: () => { if (changed) onApply(); },
    });
  });

  wrap.appendChild(btn);
  return wrap;
}

/**
 * One row per selected language, each labeled and holding whatever
 * per-language input(s) `makeRow` builds — the shared shape every "add"
 * form's language section uses. `currentLang` gets a highlighted row, since
 * that's the language the learner is most likely filling in first. `makeRow`
 * returns both the element to place in the row (a single input, or a
 * wrapper `<div>` around several) and whatever value the caller needs back
 * to read the row's input(s) on submit.
 */
export function languageRows<T>(
  currentLang: string,
  selectedLangs: Set<string>,
  makeRow: (info: LanguageInfo) => { el: HTMLElement; value: T },
): { rows: HTMLElement; values: Map<string, T> } {
  const rows = el('div', 'mc-lang-rows');
  const values = new Map<string, T>();
  const langs = LANGUAGES.filter(info => selectedLangs.has(info.name));
  if (langs.length === 0) {
    rows.appendChild(el('p', 'mc-empty', 'Choose at least one language above to add content.'));
    return { rows, values };
  }
  for (const info of langs) {
    const row = el('div', 'mc-lang-row');
    if (info.name === currentLang) row.classList.add('mc-lang-row--current');
    row.appendChild(buildLangBadge([info.name]));
    row.appendChild(el('span', 'mc-lang-row-label', info.label));
    const { el: inputEl, value } = makeRow(info);
    row.appendChild(inputEl);
    values.set(info.name, value);
    rows.appendChild(row);
  }
  return { rows, values };
}
