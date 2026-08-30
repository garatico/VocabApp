/**
 * preset-picker.ts
 *
 * Anchored popover for applying/saving/deleting a "Testing Profile" —
 * presets.ts's saved filter+direction bundles. Modeled on
 * language-picker.ts's own copy of the same list-picker.ts pattern: same
 * popover CSS (.list-picker-popover), same outside-click/Escape handling.
 */

import { positionPopover } from '../utils/popover-position.ts';
import { type FilterScope } from '../filters/filter-scope.ts';
import { listPresets, savePreset, deletePreset, applyPreset } from '../filters/presets.ts';

export interface PresetPickerOptions {
  anchorEl: HTMLElement;
  mode:     FilterScope;
  /** Called after a preset is applied, so the caller can refresh anything
   *  it caches from the filters (e.g. a size/pool estimate). */
  onApply?: () => void;
}

export function openPresetPicker({ anchorEl, mode, onApply }: PresetPickerOptions): void {
  closeExistingPicker();

  const picker = document.createElement('div');
  picker.className = 'list-picker-popover preset-picker-popover';
  picker.id        = 'presetPickerPopover';

  function render(): void {
    picker.innerHTML = '';

    const names = listPresets(mode);
    if (names.length === 0) {
      const empty = document.createElement('p');
      empty.className   = 'list-picker-empty';
      empty.textContent = 'No profiles saved for this tab yet.';
      picker.appendChild(empty);
    }

    names.forEach(name => {
      const row = document.createElement('div');
      row.className = 'list-picker-row preset-picker-row';

      const applyBtn = document.createElement('button');
      applyBtn.type        = 'button';
      applyBtn.className   = 'preset-picker-apply';
      applyBtn.textContent = name;
      applyBtn.addEventListener('click', () => {
        if (applyPreset(mode, name)) {
          onApply?.();
          close();
        }
      });

      const delBtn = document.createElement('button');
      delBtn.type        = 'button';
      delBtn.className   = 'preset-picker-delete';
      delBtn.textContent = '×';
      delBtn.title       = `Delete "${name}"`;
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!window.confirm(`Delete profile "${name}"?`)) return;
        deletePreset(mode, name);
        render();
      });

      row.append(applyBtn, delBtn);
      picker.appendChild(row);
    });

    const saveRow = document.createElement('div');
    saveRow.className = 'preset-picker-save-row';

    const input = document.createElement('input');
    input.type        = 'text';
    input.placeholder = 'Save current filters as…';
    input.maxLength   = 60;

    const saveBtn = document.createElement('button');
    saveBtn.type        = 'button';
    saveBtn.className   = 'ui-btn-mini';
    saveBtn.textContent = 'Save';
    const doSave = (): void => {
      const name = input.value.trim();
      if (!name) return;
      savePreset(mode, name);
      input.value = '';
      render();
    };
    saveBtn.addEventListener('click', doSave);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });

    saveRow.append(input, saveBtn);
    picker.appendChild(saveRow);
  }

  render();
  document.body.appendChild(picker);
  positionPopover(picker, anchorEl);
  picker.style.zIndex = '9999';

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
  const existing = document.getElementById('presetPickerPopover') as (HTMLElement & { _close?: () => void }) | null;
  if (existing?._close) existing._close();
  else existing?.remove();
}
