/**
 * visual-profiles.ts — named, saveable bundles of *display* preferences,
 * shown as a sub-section right under Testing Profiles in the sidebar
 * (sidebar.ts's renderProfilesNav) rather than mixed into PresetBundle
 * (presets.ts) — a Testing Profile is what to quiz on (filters, word pool,
 * direction), a Visual Profile is what the app looks like while you do it.
 * The two are independent: switching either never touches the other.
 *
 * Deliberately a small starting set — Theme and Font Size, both with a
 * simple, already-exported apply function (theme-toggle.ts's applyTheme,
 * settings.ts's applyFontSize) that repaints immediately with no further
 * wiring. Settings with their own live-refresh path (the Multi-language
 * table indicator, the streak widget's emoji/number layout, ...) are left
 * for a later pass rather than chasing down every repaint call site here.
 */

import { readString, writeString, remove as removeKey, readJson, writeJson, isRecord } from '../utils/storage.ts';
import { applyTheme, type ThemeValue } from '../ui/theme-toggle.ts';
import { Settings, applyFontSize, type FontSize } from '../settings.ts';
import {
  VISUAL_SETTINGS, captureVisualSettings, applyVisualSetting, visualSettingValueLabel, type VisualSettingValues,
} from './visual-settings.ts';

export interface VisualProfile {
  theme?:    ThemeValue;
  fontSize?: FontSize;
  /** Other display settings (visual-settings.ts), keyed by their `key`. Only what the profile sets. */
  settings?: VisualSettingValues;
  /** Shown before the name in My Lists, like a list's own emoji. */
  emoji?:    string;
  /** Folders it is filed under (scope `visual_profiles`, see folders.ts). Not a display setting. */
  folders?:  string[];
}

export const THEME_LABELS: Record<ThemeValue, string> = { light: 'Light', dark: 'Dark', system: 'System' };
export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  xs: 'Extra Small', small: 'Small', medium: 'Medium', large: 'Large', xl: 'Extra Large',
};

/** One line saying what applying it does, e.g. "Dark theme · Large text". */
export function describeVisualProfile(profile: VisualProfile): string {
  const parts: string[] = [];
  if (profile.theme) parts.push(`${THEME_LABELS[profile.theme]} Theme`);
  if (profile.fontSize) parts.push(`${FONT_SIZE_LABELS[profile.fontSize]} Text`);
  const others = VISUAL_SETTINGS.filter(d => profile.settings?.[d.key] !== undefined && visualSettingValueLabel(d, profile.settings[d.key]) !== undefined).length;
  if (others > 0) parts.push(`${others} More Setting${others === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : 'Changes Nothing Yet — Choose a Theme, a Font Size or Another Setting';
}

function isVisualProfile(v: unknown): v is VisualProfile {
  return isRecord(v);
}

type VisualProfileStore = Record<string, VisualProfile>;

function isStore(v: unknown): v is VisualProfileStore {
  return isRecord(v) && Object.values(v).every(isVisualProfile);
}

const STORE_KEY = 'vq_visual_profiles';

function loadStore(): VisualProfileStore {
  return readJson<VisualProfileStore>(STORE_KEY, {}, isStore);
}
function saveStore(store: VisualProfileStore): void {
  writeJson(STORE_KEY, store);
}

export function listVisualProfiles(): string[] {
  return Object.keys(loadStore()).sort((a, b) => a.localeCompare(b));
}

export function getVisualProfile(name: string): VisualProfile | undefined {
  return loadStore()[name];
}

export function saveVisualProfile(name: string, profile: VisualProfile): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const store = loadStore();
  store[trimmed] = profile;
  saveStore(store);
}

/** A copy under a new name; false if `newName` is taken or `name` doesn't exist. */
export function duplicateVisualProfile(name: string, newName: string): boolean {
  const store = loadStore();
  const trimmed = newName.trim();
  if (!trimmed || !store[name] || store[trimmed]) return false;
  store[trimmed] = structuredClone(store[name]);
  saveStore(store);
  return true;
}

export function deleteVisualProfile(name: string): void {
  const store = loadStore();
  delete store[name];
  saveStore(store);
}

export function renameVisualProfile(oldName: string, newName: string): boolean {
  const store = loadStore();
  const trimmed = newName.trim();
  if (!trimmed || !store[oldName] || store[trimmed]) return false;
  store[trimmed] = store[oldName];
  delete store[oldName];
  saveStore(store);
  return true;
}

/** 'theme' is stored bare (no key at all means 'system') — see theme-toggle.ts. */
export function captureCurrentVisualProfile(): VisualProfile {
  return {
    theme:    (readString('theme') ?? 'system') as ThemeValue,
    fontSize: Settings.getFontSize(),
    settings: captureVisualSettings(),
  };
}

export function applyVisualProfile(profile: VisualProfile): void {
  if (profile.theme) {
    if (profile.theme === 'system') removeKey('theme'); else writeString('theme', profile.theme);
    applyTheme(profile.theme);
  }
  if (profile.fontSize) {
    Settings.setFontSize(profile.fontSize);
    applyFontSize(profile.fontSize);
  }
  for (const [key, value] of Object.entries(profile.settings ?? {})) applyVisualSetting(key, value);
}
