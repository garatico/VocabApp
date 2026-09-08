/**
 * preset-picker.ts
 *
 * Anchored popover for applying/saving/deleting a "Testing Profile" —
 * presets.ts's saved filter+direction bundles. Modeled on
 * language-picker.ts's own copy of the same list-picker.ts pattern: same
 * popover CSS (.list-picker-popover), same outside-click/Escape handling.
 *
 * With Settings.getInlineProfileEditing() on, each row also gets a "Full
 * Profile" (and, once the profile has quick-edit fields marked, "⚡ Quick
 * Edit") button that expands the same field controls profile-panel.ts's
 * full My Lists editor uses (buildProfileEditorGroups) right here, inline.
 * Unlike that editor, every tweak here applies live (applyBundle — the same
 * effect as clicking through the real controls by hand) but is never
 * written back to storage on its own — "Update" (overwrites the profile
 * you opened) and "Save as new profile…" (forks a copy, leaving the
 * original untouched) are the two explicit ways to keep it. See
 * getInlineProfileEditing's own doc comment for why this is opt-in and,
 * short of one of those two actions, session-only.
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
  // except via "Update"/"Save as new profile…" below.
  let expandedName: string | null = null;
  let liveBundle: PresetBundle | null = null;

  // `name`'s own saved bundle at the moment its editor was opened, frozen as
  // JSON rather than re-read live — "Start from" below deliberately pivots
  // liveBundle to a different profile's bundle without touching this, so
  // "has anything changed" always means "differs from what's saved under
  // `name` right now", not "differs from whatever liveBundle last was".
  // Drives both "Reset" (revert to this) and "Update" (disabled when there's
  // nothing to write back) — a stringified snapshot rather than the object
  // itself since getPreset() hands back a fresh reconstruction on every
  // call, so two structurally-identical reads are never the same reference.
  let savedSnapshotJSON: string | null = null;

  // Whether the inline editor shows every field at once ('whole') or just
  // the field(s) this profile's own "⚡" quick-edit toggles marked
  // (PresetBundle.quickEditFields, set from profile-panel.ts's section()) —
  // for a profile you want identical to another except for whichever
  // settings you've pre-picked, changing just those without scrolling past
  // every other field to find them. Reset alongside expandedName/liveBundle
  // whenever a different profile's editor opens (or closes), so switching
  // profiles never leaves 'quick' selected for one that has nothing marked.
  let editScope: 'whole' | 'quick' = 'whole';

  function reposition(): void {
    positionPopover(picker, anchorEl);
  }

  /** Opens `name`'s inline editor in the given scope, (re)loading it fresh
   *  from storage — the one place liveBundle/savedSnapshotJSON are set
   *  together, so the two can never drift out of sync with each other. */
  function openEditor(targetName: string, scope: 'whole' | 'quick'): void {
    expandedName = targetName;
    const loaded = getPreset(mode, targetName) ?? BLANK_BUNDLE;
    liveBundle = loaded;
    savedSnapshotJSON = JSON.stringify(loaded);
    editScope = scope;
  }

  function closeEditor(): void {
    expandedName = null;
    liveBundle = null;
    savedSnapshotJSON = null;
    editScope = 'whole';
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

    // Built once per render regardless of scope below — every control's
    // onChange already closes over the real persist-live callback via
    // buildProfileEditorGroups' own `next` param, so moving one of these
    // section nodes into the "one setting" view instead of appending the
    // whole group doesn't disturb its wiring.
    const allGroups = buildProfileEditorGroups(liveBundle, mode, currentLangValue(), name, next => {
      liveBundle = next;
      applyBundle(mode, next);
      onApply?.();
      render();
      reposition();
    }, reposition);

    // Whole profile at once, or just the field(s) this profile's own "⚡"
    // toggles marked for quick edit (profile-panel.ts's section(), shared
    // by this popover's own "Full Profile" view and the full My Lists
    // editor) — see editScope's own doc comment above. Which of the two
    // shows here is decided entirely by which row button ("Full Profile" /
    // "Quick Edit") was clicked to open this editor — no second toggle
    // in here to switch between them, which would just be the same choice
    // asked twice. If quickEditFields is cleared out from under an editor
    // already open in quick mode (its last field unchecked), fall back to
    // the whole profile rather than rendering an empty view.
    const quickKeys = liveBundle.quickEditFields ?? [];
    const quickSections = quickKeys.length
      ? allGroups
          .flatMap(g => Array.from(g.querySelectorAll<HTMLElement>('.ml-profile-editor-section')))
          .filter(s => quickKeys.includes(s.dataset.paramKey ?? ''))
      : [];
    if (quickSections.length === 0) editScope = 'whole';

    const groups = document.createElement('div');
    groups.className = 'preset-picker-inline-groups';
    groups.append(...(editScope === 'quick' ? quickSections : allGroups));
    wrap.appendChild(groups);

    // Two ways an inline tweak becomes permanent — everything above this
    // point only ever applies live (applyBundle) and edits `liveBundle` in
    // memory, never storage on its own. Both "Reset" and "Update" below are
    // disabled together against the same isDirty check: with nothing to
    // write back there's equally nothing to discard.
    const isDirty = JSON.stringify(liveBundle) !== savedSnapshotJSON;

    // "Update" overwrites the profile `name` itself — the one destructive
    // option here, so it reads as replacing something rather than sitting
    // beside "Save as new" as an equally-safe pair. Deliberately its own
    // row, not grouped into saveAsRow below, so the two don't visually read
    // as interchangeable variants of "save."
    const updateRow = document.createElement('div');
    updateRow.className = 'preset-picker-update-row';

    // "Reset" — discards every live tweak since the editor opened, back to
    // `name`'s own last-saved bundle (savedSnapshotJSON, captured once by
    // openEditor() and never moved by "Start from" above pivoting
    // liveBundle to a different profile's starting point). A quiet sibling
    // of Update, not a second accent button — undoing a tweak that turned
    // out worse is the lower-stakes of the two actions here.
    const resetBtn = document.createElement('button');
    resetBtn.type        = 'button';
    resetBtn.className   = 'ui-btn-mini preset-picker-reset-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.title       = `Discard these changes and go back to "${name}"'s last saved filters`;
    resetBtn.disabled    = !isDirty;
    resetBtn.addEventListener('click', () => {
      if (!savedSnapshotJSON) return;
      liveBundle = JSON.parse(savedSnapshotJSON) as PresetBundle;
      applyBundle(mode, liveBundle);
      onApply?.();
      render();
      reposition();
    });
    updateRow.appendChild(resetBtn);

    const updateBtn = document.createElement('button');
    updateBtn.type        = 'button';
    updateBtn.className   = 'ui-btn-mini preset-picker-update-btn';
    updateBtn.textContent = `Update "${name}"`;
    updateBtn.title       = isDirty
      ? `Save these changes back into "${name}", replacing its current filters. Use "Save as new profile" below instead to keep both.`
      : 'Nothing to update — the profile hasn\'t changed since you opened it.';
    updateBtn.disabled    = !isDirty;
    updateBtn.addEventListener('click', () => {
      if (!liveBundle) return;
      savePreset(mode, name, liveBundle);
      closeEditor();
      render();
      reposition();
    });
    updateRow.appendChild(updateBtn);
    wrap.appendChild(updateRow);

    // "Save as new profile…" forks a copy instead — the profile the editor
    // was opened on is never touched by this one, unlike Update above.
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
      closeEditor();
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
        const isOpenWhole = expandedName === name && editScope === 'whole';
        const editBtn = document.createElement('button');
        editBtn.type        = 'button';
        editBtn.className   = 'preset-picker-inline-toggle' + (isOpenWhole ? ' active' : '');
        editBtn.textContent = 'Full Profile';
        editBtn.title       = isOpenWhole
          ? 'Close inline editor'
          : 'Edit every field of this profile inline — applies live, doesn’t save over it';
        editBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (isOpenWhole) closeEditor(); else openEditor(name, 'whole');
          render();
          reposition();
        });
        row.appendChild(editBtn);

        // A separate, direct route to just this profile's own "⚡"
        // quick-edit fields (PresetBundle.quickEditFields) — skips the
        // "Full Profile" button's default whole-profile view entirely
        // rather than opening it and then switching, for a profile where
        // you already know it's only ever the pre-picked field(s) you
        // touch. Only shown once there's actually at least one such field
        // marked; nothing to jump straight to otherwise. This and "Full
        // Profile" above are the only way to pick between the two views —
        // there's no second toggle repeating the same choice inside the
        // editor itself once it's open.
        const quickFields = getPreset(mode, name)?.quickEditFields ?? [];
        if (quickFields.length > 0) {
          const isOpenQuick = expandedName === name && editScope === 'quick';
          const quickBtn = document.createElement('button');
          quickBtn.type        = 'button';
          quickBtn.className   = 'preset-picker-inline-toggle' + (isOpenQuick ? ' active' : '');
          quickBtn.textContent = `⚡ Quick Edit (${quickFields.length})`;
          quickBtn.title       = isOpenQuick
            ? 'Close quick edit'
            : `Edit just this profile's quick-edit field${quickFields.length > 1 ? 's' : ''} inline, without opening every other field`;
          quickBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (isOpenQuick) closeEditor(); else openEditor(name, 'quick');
            render();
            reposition();
          });
          row.appendChild(quickBtn);
        }
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
        if (expandedName === name) closeEditor();
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
