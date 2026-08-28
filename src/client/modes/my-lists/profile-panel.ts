/**
 * profile-panel.ts — the right-hand pane for a Testing Profile.
 *
 * Same shape as smart-panel.ts: a field editor that saves and redraws on
 * every change, no separate Save button to forget to press. A profile has no
 * word list of its own to preview underneath — it is filter settings, not
 * vocabulary — so this is the editor and nothing else.
 *
 * Previously this editor only existed inline in the sidebar (toggled open by
 * a ⚙ button next to each row). Selecting a profile now opens it here like
 * every other kind of list, and the sidebar keeps Copy/Rename/Delete only —
 * the same split every other list kind uses.
 */

import type { ListsCtx } from './context.ts';
import { getListNames } from '../../utils/word-lists.ts';
import {
  getPreset, savePreset, describePreset, type PresetBundle,
} from '../../filters/presets.ts';
import { SCOPE_LABELS, type FilterScope } from '../../filters/filter-scope.ts';
import { POS_CHIPS } from './types.ts';

export function renderProfilePanel(ctx: ListsCtx, mode: FilterScope, name: string): void {
  const bundle = getPreset(mode, name);
  if (!bundle) { ctx.selectedProfile = null; ctx.renderPanel(); return; }

  ctx.panel.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'ml-panel-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'ml-panel-title-group';
  const modeTag = document.createElement('span');
  modeTag.className = 'ml-profile-mode-tag';
  modeTag.textContent = SCOPE_LABELS[mode];
  const title = document.createElement('h2');
  title.className = 'ml-panel-title';
  title.textContent = name;
  titleGroup.append(modeTag, title);
  header.appendChild(titleGroup);

  const desc = document.createElement('p');
  desc.className = 'ml-smart-desc';
  desc.textContent = describePreset(bundle);
  header.appendChild(desc);

  const editor = document.createElement('div');
  editor.className = 'ml-smart-editor ml-profile-editor';

  /** Save and redraw — same "re-enter through renderPanel" reasoning as
   *  smart-panel.ts's persist(): calling renderProfilePanel again directly
   *  would stack a second copy of the editor under the first. */
  function persist(next: PresetBundle): void {
    savePreset(mode, name, next);
    ctx.renderPanel();
  }

  // Part of speech
  const classSection = document.createElement('div');
  classSection.className = 'ml-profile-editor-section';
  const classLabel = document.createElement('div');
  classLabel.className = 'ml-profile-editor-label';
  classLabel.textContent = 'Part of Speech';
  const classRow = document.createElement('div');
  classRow.className = 'ml-profile-editor-chips';
  POS_CHIPS.filter(c => c.value).forEach(({ value, label }) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pos-chip' + (bundle.classes.includes(value) ? ' active' : '');
    chip.dataset.pos = value;
    chip.textContent = label;
    chip.addEventListener('click', () => {
      const classes = bundle.classes.includes(value)
        ? bundle.classes.filter(c => c !== value)
        : [...bundle.classes, value];
      persist({ ...bundle, classes });
    });
    classRow.appendChild(chip);
  });
  classSection.append(classLabel, classRow);

  // Domains — free-form, comma separated. Per-language and dynamic, so
  // unlike POS there's no fixed list to offer as checkboxes.
  const domainSection = document.createElement('div');
  domainSection.className = 'ml-profile-editor-section';
  const domainLabel = document.createElement('div');
  domainLabel.className = 'ml-profile-editor-label';
  domainLabel.textContent = 'Domains (comma-separated)';
  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.className = 'ml-profile-editor-text';
  domainInput.value = bundle.domains.join(', ');
  domainInput.addEventListener('change', () => {
    const domains = domainInput.value.split(',').map(d => d.trim()).filter(Boolean);
    persist({ ...bundle, domains });
  });
  domainSection.append(domainLabel, domainInput);

  // Lists — Hide/Focus + which of ctx.lang's lists
  const listSection = document.createElement('div');
  listSection.className = 'ml-profile-editor-section';
  const listLabel = document.createElement('div');
  listLabel.className = 'ml-profile-editor-label';
  listLabel.textContent = `Lists (${ctx.lang})`;
  const listModeRow = document.createElement('div');
  listModeRow.className = 'ml-profile-editor-chips';
  const hideLabel = document.createElement('label');
  hideLabel.className = 'ml-profile-editor-chip';
  const hideRadio = document.createElement('input');
  hideRadio.type = 'radio'; hideRadio.name = `ml-profile-listmode-${mode}-${name}`;
  hideRadio.checked = bundle.listFilter.mode !== 'focus';
  hideRadio.addEventListener('change', () => {
    persist({ ...bundle, listFilter: { ...bundle.listFilter, mode: 'hide' } });
  });
  hideLabel.append(hideRadio, document.createTextNode('Hide'));
  const focusLabel = document.createElement('label');
  focusLabel.className = 'ml-profile-editor-chip';
  const focusRadio = document.createElement('input');
  focusRadio.type = 'radio'; focusRadio.name = `ml-profile-listmode-${mode}-${name}`;
  focusRadio.checked = bundle.listFilter.mode === 'focus';
  focusRadio.addEventListener('change', () => {
    persist({ ...bundle, listFilter: { ...bundle.listFilter, mode: 'focus' } });
  });
  focusLabel.append(focusRadio, document.createTextNode('Focus'));
  listModeRow.append(hideLabel, focusLabel);

  const listNamesRow = document.createElement('div');
  listNamesRow.className = 'ml-profile-editor-chips';
  const availableLists = getListNames(ctx.lang);
  if (availableLists.length === 0) {
    const none = document.createElement('span');
    none.className = 'ml-profile-editor-hint';
    none.textContent = `No lists yet in ${ctx.lang}`;
    listNamesRow.appendChild(none);
  }
  availableLists.forEach(listName => {
    const chipLabel = document.createElement('label');
    chipLabel.className = 'ml-profile-editor-chip';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = bundle.listFilter.selected.includes(listName);
    input.addEventListener('change', () => {
      const selected = input.checked
        ? [...bundle.listFilter.selected, listName]
        : bundle.listFilter.selected.filter(n => n !== listName);
      persist({ ...bundle, listFilter: { ...bundle.listFilter, selected } });
    });
    chipLabel.append(input, document.createTextNode(listName));
    listNamesRow.appendChild(chipLabel);
  });
  listSection.append(listLabel, listModeRow, listNamesRow);

  // Direction
  const dirSection = document.createElement('div');
  dirSection.className = 'ml-profile-editor-section';
  const dirLabel = document.createElement('div');
  dirLabel.className = 'ml-profile-editor-label';
  dirLabel.textContent = 'Direction';
  const dirRow = document.createElement('div');
  dirRow.className = 'ml-profile-editor-chips';
  const dirOptions: { value: PresetBundle['direction']; label: string }[] = [
    { value: 'target-en', label: 'Word → Meaning' },
    { value: 'en-target', label: 'Meaning → Word' },
    { value: 'mixed',     label: 'Mixed' },
  ];
  dirOptions.forEach(({ value, label }) => {
    const chipLabel = document.createElement('label');
    chipLabel.className = 'ml-profile-editor-chip';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = `ml-profile-direction-${mode}-${name}`;
    input.checked = bundle.direction === value;
    input.addEventListener('change', () => persist({ ...bundle, direction: value }));
    chipLabel.append(input, document.createTextNode(label));
    dirRow.appendChild(chipLabel);
  });
  dirSection.append(dirLabel, dirRow);

  editor.append(classSection, domainSection, listSection, dirSection);
  header.appendChild(editor);
  ctx.panel.appendChild(header);
}
