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

export interface VisualProfile {
  theme?:    ThemeValue;
  fontSize?: FontSize;
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
}
