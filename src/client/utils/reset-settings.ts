import { keys, remove, readString, writeString } from './storage.ts';
import { keyClass } from './storage-keys.ts';

/**
 * reset-settings.ts — put every preference back to its default, and take that back again.
 *
 * "Preference" means whatever storage-keys.ts classes as `settings` — the s_ family (toggles, colours)
 * and the theme — plus the daily goals, which are stored as data but are chosen on the Settings screen.
 * Learner data (lists, progress, history), UI memory such as which panels are open, and bookkeeping like
 * the last-backup date are different classes and are never touched. Removing a key rather than writing
 * the default is what "default" means here: each getter already falls back to its own default when the
 * key is absent, so nothing has to be kept in step.
 */

/** Stored as data, but set on the Settings screen: the goal targets. (Not `vq_daily_progress`.) */
const SETTINGS_LIKE_PREFIXES: readonly string[] = ['vq_daily_goal'];

export function isResettableKey(key: string): boolean {
  return keyClass(key) === 'settings' || SETTINGS_LIKE_PREFIXES.some(p => key.startsWith(p));
}

export type SettingsSnapshot = Record<string, string>;

/** Every resettable key and its value, as they are right now. */
export function snapshotSettings(): SettingsSnapshot {
  const snap: SettingsSnapshot = {};
  for (const k of keys().filter(isResettableKey)) {
    const v = readString(k);
    if (v !== null) snap[k] = v;
  }
  return snap;
}

/** Make the stored preferences exactly `snap`: drop what is there now, write what was there then. */
export function restoreSettingsSnapshot(snap: SettingsSnapshot): void {
  keys().filter(isResettableKey).forEach(remove);
  Object.entries(snap).forEach(([k, v]) => writeString(k, v));
}

export function resetAllSettings(): string[] {
  const doomed = keys().filter(isResettableKey);
  doomed.forEach(remove);
  return doomed;
}
