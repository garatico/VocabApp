/**
 * language-picker.ts
 *
 * Renders a small popover near the "+ Languages" button in table mode's
 * controls bar, letting the user check any number of additional languages to
 * merge into the table alongside the primary #langSelect. One box checked
 * behaves like a simple two-language compare; more than one gives a full
 * multi-language table — both are the same underlying feature, so there is
 * one widget rather than two.
 *
 * Modeled directly on list-picker.ts's anchored-popover pattern (used today
 * for the "add to list" star button) — same positioning helper, same
 * outside-click/Escape handling, same CSS chrome (.list-picker-popover), so
 * only the row markup here is new.
 */

import { positionPopover } from '../utils/popover-position.ts';
import { LANGUAGES } from '../data/languages.ts';

export interface LanguagePickerOptions {
  anchorEl: HTMLElement;
  /** The primary language — not offered again as an "extra". */
  exclude:  string;
  /** Currently-checked extra languages. */
  selected: Set<string>;
  /** Fired on every checkbox toggle, with the updated set. */
  onChange: (selected: Set<string>) => void;
  /**
   * Which languages the database actually has rows for — same meaning as
   * app.ts's `markEmptyLanguages`. A language outside this set is offered
   * disabled with "no data yet", same wording as the primary select. Null
   * (the default, before that check has resolved) leaves everything enabled.
   */
  available?: Set<string> | null;
}

export function openLanguagePicker({ anchorEl, exclude, selected, onChange, available = null }: LanguagePickerOptions): void {
  closeExistingPicker();

  const picker = document.createElement('div');
  picker.className = 'list-picker-popover';
  picker.id        = 'languagePickerPopover';

  // One offered language per checkbox — kept so "All"/"None" can sync every
  // box's visual state without re-reading the DOM.
  const checkboxes: { lang: string; cb: HTMLInputElement; missing: boolean }[] = [];

  const actions = document.createElement('div');
  actions.className = 'list-picker-actions';
  const allBtn = document.createElement('button');
  allBtn.type = 'button'; allBtn.className = 'ui-btn-mini'; allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => {
    checkboxes.forEach(({ lang, cb, missing }) => {
      if (missing) return;
      cb.checked = true;
      selected.add(lang);
    });
    onChange(new Set(selected));
  });
  const noneBtn = document.createElement('button');
  noneBtn.type = 'button'; noneBtn.className = 'ui-btn-mini'; noneBtn.textContent = 'None';
  noneBtn.addEventListener('click', () => {
    checkboxes.forEach(({ cb }) => { cb.checked = false; });
    selected.clear();
    onChange(new Set(selected));
  });
  actions.append(allBtn, noneBtn);
  picker.appendChild(actions);

  for (const lang of LANGUAGES) {
    if (lang.name === exclude) continue;
    const missing = available !== null && !available.has(lang.name);

    const row     = document.createElement('label');
    row.className = 'list-picker-row';
    if (missing) row.classList.add('list-picker-row--disabled');

    const cb   = document.createElement('input');
    cb.type     = 'checkbox';
    cb.checked  = selected.has(lang.name);
    cb.disabled = missing;
    cb.addEventListener('change', () => {
      if (cb.checked) selected.add(lang.name);
      else            selected.delete(lang.name);
      onChange(new Set(selected));
    });
    checkboxes.push({ lang: lang.name, cb, missing });

    const label       = document.createElement('span');
    label.textContent = missing ? `${lang.label} — no data yet` : lang.label;

    row.appendChild(cb);
    row.appendChild(label);
    picker.appendChild(row);
  }

  document.body.appendChild(picker);
  positionNear(picker, anchorEl);

  function onOutside(e: MouseEvent): void {
    if (!picker.contains(e.target as Node) && e.target !== anchorEl) close();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  function close(): void {
    picker.remove();
    document.removeEventListener('mousedown', onOutside, true);
    document.removeEventListener('keydown', onKey,       true);
  }

  (picker as HTMLElement & { _close?: () => void })._close = close;

  setTimeout(() => {
    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey,       true);
  }, 0);
}

function closeExistingPicker(): void {
  const existing = document.getElementById('languagePickerPopover') as (HTMLElement & { _close?: () => void }) | null;
  if (existing?._close) existing._close();
  else existing?.remove();
}

function positionNear(picker: HTMLElement, anchor: HTMLElement): void {
  positionPopover(picker, anchor);
  picker.style.zIndex = '9999';
}

/**
 * The trigger button's label, reflecting the current selection —
 * "+ Languages" empty, the language name(s) for a few, a count past that so
 * the button doesn't grow unbounded.
 */
export function languagePickerLabel(selected: Set<string>): string {
  if (selected.size === 0) return '+ Languages';
  const labels = [...selected]
    .map(name => LANGUAGES.find(l => l.name === name)?.label ?? name);
  if (labels.length <= 3) return `+ ${labels.join(', ')}`;
  return `+ ${labels.length} languages`;
}
