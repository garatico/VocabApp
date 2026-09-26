/**
 * visual-settings.ts — the display preferences a Visual Profile can carry beyond Theme and Font
 * Size: column count, row density, which badges show, and so on.
 *
 * Each is one Settings-screen control (a `.sort-order-toggle` of buttons). A profile stores only
 * the values it was told to set, keyed by `key`, so an older profile — or one that leaves a setting
 * alone — changes nothing about it.
 *
 * Applying a value *clicks the real Settings button*, exactly as ui/level-picker.ts does for the
 * Words controls: the control's own handler persists it and repaints whatever depends on it, so this
 * list never has to know how a given setting refreshes the screen. Only when the button isn't in the
 * DOM (e.g. a page without the Settings screen) does it write the stored value directly.
 */

import { get, set } from '../settings.ts';

export type VisualGroupId = 'appearance' | 'layout' | 'badges' | 'extras';

/** The panel's cards, in order. Theme and Font Size are not in VISUAL_SETTINGS (they predate it
 *  and have their own fields) but sit in 'appearance' alongside these. */
export const VISUAL_GROUPS: ReadonlyArray<{ id: VisualGroupId; title: string; hint: string }> = [
  { id: 'appearance', title: 'Appearance',    hint: 'Colours and Text Size' },
  { id: 'layout',     title: 'Table Layout',  hint: 'How Much Fits on Screen' },
  { id: 'badges',     title: 'Word Cells',    hint: 'What Is Marked on Each Word' },
  { id: 'extras',     title: 'Header Extras', hint: 'Small Readouts' },
];

export interface VisualSettingDef {
  /** Key in VisualProfile.settings. Never rename one — profiles are saved under it. */
  key: string;
  label: string;
  /** Which card it sits in within the profile panel (see VISUAL_GROUPS). */
  group: VisualGroupId;
  /** The Settings control's id, and the data attribute each of its buttons carries the value in. */
  controlId: string;
  dataAttr: string;
  /** Settings storage key (see settings.ts's `get`/`set`) and its default. */
  storageKey: string;
  fallback: string;
  options: ReadonlyArray<readonly [value: string, label: string]>;
}

const ON_OFF = [['true', 'On'], ['false', 'Off']] as const;

export const VISUAL_SETTINGS: readonly VisualSettingDef[] = [
  { key: 'tableCols', label: 'Columns', group: 'layout', controlId: 'settingCols', dataAttr: 'cols',
    storageKey: 'table_cols', fallback: '2', options: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']] },
  { key: 'rowDensity', label: 'Row Density', group: 'layout', controlId: 'settingTableRowDensity', dataAttr: 'density',
    storageKey: 'table_row_density', fallback: 'comfortable',
    options: [['comfortable', 'Comfortable'], ['compact', 'Compact'], ['ultra', 'Ultra Compact']] },
  { key: 'showRank', label: 'Frequency Rank Badge', group: 'badges', controlId: 'settingTableShowRank', dataAttr: 'show',
    storageKey: 'table_show_rank', fallback: 'true', options: ON_OFF },
  { key: 'showMarkers', label: 'Word History Markers', group: 'badges', controlId: 'settingTableShowMarkers', dataAttr: 'show',
    storageKey: 'table_show_word_markers', fallback: 'true', options: ON_OFF },
  { key: 'genderIndicator', label: 'Gender Indicator', group: 'badges', controlId: 'settingGenderIndicatorStyle', dataAttr: 'style',
    storageKey: 'gender_indicator_style', fallback: 'off',
    options: [['off', 'Off'], ['dot', 'Dot'], ['word-bg', 'Word Background'], ['box-bg', 'Box Background']] },
  { key: 'langIndicator', label: 'Language Indicator', group: 'badges', controlId: 'settingLangIndicator', dataAttr: 'indicator',
    storageKey: 'lang_indicator', fallback: 'color', options: [['off', 'Off'], ['color', 'Color'], ['flag', 'Flag']] },
  { key: 'showTimer', label: 'Timer', group: 'extras', controlId: 'settingShowTimer', dataAttr: 'show',
    storageKey: 'table_show_timer', fallback: 'true', options: ON_OFF },
  { key: 'streakWidget', label: 'Streak Counter', group: 'extras', controlId: 'settingShowStreakWidget', dataAttr: 'show',
    storageKey: 'show_streak_widget', fallback: 'true', options: ON_OFF },
];

export type VisualSettingValues = Record<string, string>;

export function visualSettingDef(key: string): VisualSettingDef | undefined {
  return VISUAL_SETTINGS.find(d => d.key === key);
}

/** The label for a stored value, or undefined if this app no longer offers it. */
export function visualSettingValueLabel(def: VisualSettingDef, value: string): string | undefined {
  return def.options.find(([v]) => v === value)?.[1];
}

/** Every setting as it is right now. */
export function captureVisualSettings(): VisualSettingValues {
  return Object.fromEntries(VISUAL_SETTINGS.map(d => [d.key, get(d.storageKey, d.fallback)]));
}

/** Apply one value; an unknown key or a value the app doesn't offer is ignored, never written. */
export function applyVisualSetting(key: string, value: string): void {
  const def = visualSettingDef(key);
  if (!def || visualSettingValueLabel(def, value) === undefined) return;
  const button = document.querySelector<HTMLButtonElement>(`#${def.controlId} .sort-order-btn[data-${def.dataAttr}="${value}"]`);
  if (button) button.click();
  else set(def.storageKey, value);
}
