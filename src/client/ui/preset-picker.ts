/**
 * preset-picker.ts
 *
 * Anchored popover for applying/saving/deleting a "Testing Profile" —
 * presets.ts's saved filter+direction bundles. Modeled on
 * language-picker.ts's own copy of the same list-picker.ts pattern: same
 * popover CSS (.list-picker-popover), same outside-click/Escape handling.
 *
 * With Settings.getInlineProfileEditing() on, each row also gets a "+" that
 * expands the same field controls profile-panel.ts's full My Lists editor
 * uses (buildProfileEditorGroups) right here, inline. Unlike that editor,
 * every tweak here applies live (applyBundle — the same effect as clicking
 * through the real controls by hand) but is never written back to the saved
 * preset; "Save as new profile…" is the one explicit way to keep it. See
 * that setting's own doc comment for why this is opt-in and session-only.
 */

import { positionPopover } from '../utils/popover-position.ts';
import { type FilterScope } from '../filters/filter-scope.ts';
import {
  listPresets, savePreset, deletePreset, applyPreset, getPreset, applyBundle,
  BLANK_BUNDLE, type PresetBundle,
} from '../filters/presets.ts';
import { currentLangValue } from '../filters/filter-lang.ts';
import { Settings } from '../settings.ts';
import { buildProfileEditorGroups } from '../modes/my-lists/profile-panel.ts';

export interface PresetPickerOptions {
  anchorEl: HTMLElement;
  mode:     FilterScope;
  /** Called after a preset is applied, so the caller can refresh anything
   *  it caches from the filters (e.g. a size/pool estimate). Also called
   *  after every inline live tweak, for the same reason. */
  onApply?: () => void;
}

export function openPresetPicker({ anchorEl, mode, onApply }: PresetPickerOptions): void {
  closeExistingPicker();

  const picker = document.createElement('div');
  picker.className = 'list-picker-popover preset-picker-popover';
  picker.id        = 'presetPickerPopover';

  // Which profile (if any) has its inline editor open, and the in-memory
  // bundle it's currently editing — never read from or written to storage
  // except via the explicit "Save as new profile…" action below.
  let expandedName: string | null = null;
  let liveBundle: PresetBundle | null = null;

  function reposition(): void {
    positionPopover(picker, anchorEl);
  }

  function buildInlineEditor(name: string): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'preset-picker-inline-editor';
    if (!liveBundle) return wrap;

    // Rebase the live edit onto a different saved profile for this mode —
    // "choose from a subset of different preset testing profiles" without a
    // separate template concept, since the only profiles this app has are
    // whatever's already saved.
    const otherNames = listPresets(mode);
    if (otherNames.length > 1) {
      const startRow = document.createElement('label');
      startRow.className = 'preset-picker-inline-startfrom';
      startRow.appendChild(document.createTextNode('Start from '));
      const sel = document.createElement('select');
      otherNames.forEach(n => sel.appendChild(new Option(n, n)));
      sel.value = name;
      sel.addEventListener('change', () => {
        liveBundle = getPreset(mode, sel.value) ?? BLANK_BUNDLE;
        applyBundle(mode, liveBundle);
        onApply?.();
        render();
        reposition();
      });
      startRow.appendChild(sel);
      wrap.appendChild(startRow);
    }

    const groups = document.createElement('div');
    groups.className = 'preset-picker-inline-groups';
    groups.append(...buildProfileEditorGroups(liveBundle, mode, currentLangValue(), name, next => {
      liveBundle = next;
      applyBundle(mode, next);
      onApply?.();
      render();
      reposition();
    }));
    wrap.appendChild(groups);

    // The one explicit way an inline tweak becomes permanent — the profile
    // the "+" was opened on is never itself overwritten just by tweaking it.
    const saveAsRow = document.createElement('div');
    saveAsRow.className = 'preset-picker-save-row';
    const input = document.createElement('input');
    input.type        = 'text';
    input.placeholder = 'Save as new profile…';
    input.maxLength   = 60;
    const saveBtn = document.createElement('button');
    saveBtn.type        = 'button';
    saveBtn.className   = 'ui-btn-mini';
    saveBtn.textContent = 'Save as new';
    const doSaveAs = (): void => {
      const newName = input.value.trim();
      if (!newName || !liveBundle) return;
      savePreset(mode, newName, liveBundle);
      expandedName = null;
      liveBundle = null;
      render();
      reposition();
    };
    saveBtn.addEventListener('click', doSaveAs);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSaveAs(); });
    saveAsRow.append(input, saveBtn);
    wrap.appendChild(saveAsRow);

    return wrap;
  }

  function render(): void {
    picker.innerHTML = '';
    picker.classList.toggle('preset-picker-popover--editing', expandedName !== null);

    const names = listPresets(mode);
    if (names.length === 0) {
      const empty = document.createElement('p');
      empty.className   = 'list-picker-empty';
      empty.textContent = 'No profiles saved for this tab yet.';
      picker.appendChild(empty);
    }

    const inlineEditingOn = Settings.getInlineProfileEditing();

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
      row.appendChild(applyBtn);

      if (inlineEditingOn) {
        const editBtn = document.createElement('button');
        editBtn.type        = 'button';
        editBtn.className   = 'preset-picker-inline-toggle' + (expandedName === name ? ' active' : '');
        editBtn.textContent = expandedName === name ? '−' : '+';
        editBtn.title       = expandedName === name
          ? 'Close inline editor'
          : 'Tweak this profile’s parameters inline — applies live, doesn’t save over it';
        editBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (expandedName === name) {
            expandedName = null;
            liveBundle = null;
          } else {
            expandedName = name;
            liveBundle = getPreset(mode, name) ?? BLANK_BUNDLE;
          }
          render();
          reposition();
        });
        row.appendChild(editBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.type        = 'button';
      delBtn.className   = 'preset-picker-delete';
      delBtn.textContent = '×';
      delBtn.title       = `Delete "${name}"`;
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!window.confirm(`Delete profile "${name}"?`)) return;
        deletePreset(mode, name);
        if (expandedName === name) { expandedName = null; liveBundle = null; }
        render();
        reposition();
      });
      row.appendChild(delBtn);

      picker.appendChild(row);
      if (expandedName === name && liveBundle) picker.appendChild(buildInlineEditor(name));
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
