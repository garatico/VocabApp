/**
 * visual-panel.ts — the right-hand pane for a Visual Profile.
 *
 * Same shape as profile-panel.ts: a header with the name, what applying it does and an explicit
 * "Apply" button, the Folders control, then a field editor that saves on every change. Selecting a
 * Visual Profile in the sidebar only opens it here — applying is the button's job, so a profile can
 * be looked at and edited without the whole app changing colour under you.
 */

import type { ListsCtx } from './context.ts';
import {
  getVisualProfile, saveVisualProfile, applyVisualProfile, captureCurrentVisualProfile, describeVisualProfile,
  THEME_LABELS, FONT_SIZE_LABELS, type VisualProfile,
} from '../../filters/visual-profiles.ts';
import { VISUAL_SETTINGS, VISUAL_GROUPS, visualSettingValueLabel } from '../../filters/visual-settings.ts';
import type { ThemeValue } from '../../ui/theme-toggle.ts';
import type { FontSize } from '../../settings.ts';
import { buildChecklistDropdown } from './chip-dropdown.ts';
import { getFolderRegistry } from './folders.ts';
import { showToast } from '../../ui/toast.ts';

/** A labelled dropdown whose first entry means "this profile doesn't touch that setting". */
function fieldSection<T extends string>(
  key: string, label: string, options: ReadonlyArray<readonly [T, string]>, value: T | undefined, onChange: (next: T | undefined) => void,
): HTMLElement {
  const el = document.createElement('label');
  el.className = 'ml-vp-row';
  el.dataset.paramKey = key;

  const labelEl = document.createElement('span');
  labelEl.className = 'ml-vp-row-label';
  labelEl.textContent = label;

  const select = document.createElement('select');
  select.className = 'ml-profile-editor-select ml-vp-select';
  select.setAttribute('aria-label', label);
  select.append(new Option('No change', ''));
  options.forEach(([v, text]) => select.append(new Option(text, v)));
  select.value = value ?? '';
  select.addEventListener('change', () => onChange(select.value ? select.value as T : undefined));

  el.append(labelEl, select);
  return el;
}

export function renderVisualPanel(ctx: ListsCtx, name: string): void {
  const profile = getVisualProfile(name);
  if (!profile) { ctx.selectedVisual = null; ctx.renderPanel(); return; }

  ctx.panel.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'ml-panel-header ml-visual-panel';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'ml-panel-title-group';
  const tag = document.createElement('span');
  tag.className = 'ml-profile-mode-tag';
  tag.textContent = 'Visual';
  const title = document.createElement('h2');
  title.className = 'ml-panel-title';
  title.textContent = (profile.emoji ? profile.emoji + ' ' : '') + name;

  // Editing only writes to storage; nothing repaints until this is pressed.
  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'ml-export-btn';
  applyBtn.textContent = '→ Apply Now';
  applyBtn.title = 'Switch the app to this profile’s display settings';
  applyBtn.addEventListener('click', () => {
    applyVisualProfile(profile);
    showToast(`Applied "${name}"`, 'success');
  });
  titleGroup.append(tag, title, applyBtn);
  header.appendChild(titleGroup);

  const desc = document.createElement('p');
  desc.className = 'ml-smart-desc';
  desc.textContent = describeVisualProfile(profile);
  header.appendChild(desc);

  // Folders — the same control a list's or Testing Profile's own panel has. New folders are made
  // from the sidebar's "+ Folder".
  const membershipRow = document.createElement('div');
  membershipRow.className = 'ml-filter-dropdowns-row';
  const folderSelected = new Set(profile.folders ?? []);
  const folderDropdown = buildChecklistDropdown(
    'Folders', getFolderRegistry('visual_profiles').map(f => ({ value: f, label: f })), folderSelected,
    () => {
      saveVisualProfile(name, { ...profile, folders: [...folderSelected] });
      ctx.renderSidebar(false);
    },
  );
  membershipRow.appendChild(folderDropdown.wrap);
  header.appendChild(membershipRow);

  /** Save and redraw through renderPanel(), for the same reason profile-panel.ts does: calling this
   *  function again directly would stack a second editor under the first. */
  function persist(next: VisualProfile): void {
    saveVisualProfile(name, next);
    ctx.renderPanel();
  }

  const editor = document.createElement('div');
  editor.className = 'ml-smart-editor ml-profile-editor';

  const currentBtn = document.createElement('button');
  currentBtn.type = 'button';
  currentBtn.className = 'ml-export-btn ml-vp-current';
  currentBtn.textContent = 'Use What the App Looks Like Now';
  currentBtn.title = 'Fill in every setting below from how the app is set up right now';
  currentBtn.addEventListener('click', () => {
    const now = captureCurrentVisualProfile();
    persist({ ...profile, theme: now.theme, fontSize: now.fontSize, settings: now.settings });
  });

  const entries = <K extends string>(labels: Record<K, string>): Array<readonly [K, string]> =>
    (Object.keys(labels) as K[]).map(k => [k, labels[k]] as const);

  /** One setting from visual-settings.ts. A stored value this app no longer offers reads as unset. */
  const settingField = (def: (typeof VISUAL_SETTINGS)[number]): HTMLElement => {
    const stored = profile.settings?.[def.key];
    const value = stored !== undefined && visualSettingValueLabel(def, stored) !== undefined ? stored : undefined;
    return fieldSection(`setting:${def.key}`, def.label, def.options, value, next => {
      const settings = { ...profile.settings };
      if (next === undefined) delete settings[def.key]; else settings[def.key] = next;
      persist({ ...profile, settings });
    });
  };
  /** A card: a title and its settings, one per line. Cards sit side by side when there is room. */
  const card = (id: string, title: string, hint: string, ...fields: HTMLElement[]): HTMLElement => {
    const g = document.createElement('section');
    g.className = 'ml-vp-card';
    g.dataset.group = id;
    const h = document.createElement('h3');
    h.className = 'ml-vp-card-title';
    h.textContent = title;
    const sub = document.createElement('span');
    sub.className = 'ml-vp-card-hint';
    sub.textContent = hint;
    h.append(sub);
    g.append(h, ...fields);
    return g;
  };
  const appearance = [
    fieldSection<ThemeValue>('theme', 'Theme', entries(THEME_LABELS), profile.theme, theme => persist({ ...profile, theme })),
    fieldSection<FontSize>('fontSize', 'Font Size', entries(FONT_SIZE_LABELS), profile.fontSize, fontSize => persist({ ...profile, fontSize })),
  ];
  const grid = document.createElement('div');
  grid.className = 'ml-vp-grid';
  grid.append(...VISUAL_GROUPS.map(g => card(
    g.id, g.title, g.hint,
    ...(g.id === 'appearance' ? appearance : []),
    ...VISUAL_SETTINGS.filter(d => d.group === g.id).map(settingField),
  )));

  editor.append(currentBtn, grid);
  header.appendChild(editor);
  ctx.panel.appendChild(header);
}
