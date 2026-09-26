/**
 * reset-settings.test.ts — "Reset all to defaults" removes preferences and nothing else.
 */
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const { resetAllSettings, snapshotSettings, restoreSettingsSnapshot, isResettableKey } = await import('../../src/client/utils/reset-settings.js');

beforeEach(() => store.clear());

describe('resetAllSettings', () => {
  it('removes preferences — toggles, colours, goals, the theme', () => {
    for (const k of ['s_table_cols', 's_table_row_density', 's_list_color_profile', 's_gender_color_masculine', 's_daily_goal_words', 'theme']) store.set(k, 'x');
    const removed = resetAllSettings();
    expect(removed.sort()).toEqual(['s_daily_goal_words', 's_gender_color_masculine', 's_list_color_profile', 's_table_cols', 's_table_row_density', 'theme']);
    expect(store.size).toBe(0);
  });

  it('leaves learner data, saved profiles, panel memory, bookkeeping and foreign keys alone', () => {
    const keep = [
      'vq_lists_spanish', 'vq_srs_spanish', 'vq_presets_table', 'vq_visual_profiles', 'ml_folders_smart_spanish',
      's_onboarding_seen', 's_section_open_settingsBodyTable', 's_last_backup_at', 's_backup_first_seen', 'somebody_elses_key',
    ];
    keep.forEach(k => store.set(k, 'keep'));
    store.set('s_table_cols', '3');
    expect(resetAllSettings()).toEqual(['s_table_cols']);
    expect([...store.keys()].sort()).toEqual([...keep].sort());
  });

  it('does nothing on a browser with no preferences', () => {
    expect(resetAllSettings()).toEqual([]);
  });
});

describe('goals and undo', () => {
  it('treats the daily goals as settings, but not the progress toward them', () => {
    expect(isResettableKey('vq_daily_goal')).toBe(true);
    expect(isResettableKey('vq_daily_goal_spanish')).toBe(true);
    expect(isResettableKey('vq_daily_progress')).toBe(false);
    expect(isResettableKey('vq_streak_count')).toBe(false);
  });

  it('a snapshot taken before a reset puts every preference back exactly', () => {
    store.set('s_table_cols', '4');
    store.set('theme', 'dark');
    store.set('vq_daily_goal', '{"words":25}');
    store.set('vq_lists_spanish', 'keep');
    const snap = snapshotSettings();
    expect(Object.keys(snap).sort()).toEqual(['s_table_cols', 'theme', 'vq_daily_goal']);

    resetAllSettings();
    expect([...store.keys()]).toEqual(['vq_lists_spanish']);

    restoreSettingsSnapshot(snap);
    expect(store.get('s_table_cols')).toBe('4');
    expect(store.get('theme')).toBe('dark');
    expect(store.get('vq_daily_goal')).toBe('{"words":25}');
    expect(store.get('vq_lists_spanish')).toBe('keep');
  });

  it('restoring drops preferences that were set after the snapshot', () => {
    store.set('s_table_cols', '4');
    const snap = snapshotSettings();
    store.set('s_table_row_density', 'ultra');
    restoreSettingsSnapshot(snap);
    expect(store.has('s_table_row_density')).toBe(false);
    expect(store.get('s_table_cols')).toBe('4');
  });
});

