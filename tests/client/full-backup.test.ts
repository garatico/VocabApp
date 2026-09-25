/**
 * full-backup.test.ts — the whole-learner-data snapshot (utils/full-backup.ts).
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

const { buildFullBackup, applyFullBackup, isDataKey, backupReminderDue, snoozeBackupReminder, REMINDER_DAYS } =
  await import('../../src/client/utils/full-backup.js');

const DAY = 24 * 60 * 60 * 1000;
beforeEach(() => store.clear());

describe('isDataKey', () => {
  it('accepts the app prefixes and theme, rejects strangers and bookkeeping', () => {
    for (const k of ['s_x', 'vq_srs_spanish', 'ml_lists_spanish', 'uc_words', 'theme']) expect(isDataKey(k)).toBe(true);
    for (const k of ['random', 's_last_backup_at', 's_backup_first_seen']) expect(isDataKey(k)).toBe(false);
  });
});

describe('build / apply round trip', () => {
  it('restores what was backed up and ignores foreign keys', () => {
    store.set('vq_srs_spanish', '{"casa":{"box":2,"dueAt":1}}');
    store.set('theme', 'dark');
    store.set('unrelated', 'x');
    const raw = JSON.stringify(buildFullBackup());
    expect(JSON.parse(raw).data.unrelated).toBeUndefined();

    store.clear();
    expect(applyFullBackup(raw)).toBe(2);
    expect(store.get('vq_srs_spanish')).toContain('casa');
    expect(store.get('theme')).toBe('dark');
  });

  it('refuses files that are not ours, and never writes foreign keys from a hand-edited one', () => {
    expect(() => applyFullBackup('not json')).toThrow(/valid JSON/);
    expect(() => applyFullBackup('{"lists":{}}')).toThrow(/full backup/);
    const sneaky = JSON.stringify({ format: 'vocabapp-full-backup', version: 1, data: { evil: 'x', vq_ok: 'y' } });
    expect(applyFullBackup(sneaky)).toBe(1);
    expect(store.has('evil')).toBe(false);
  });

  it('rejects a backup from a newer version', () => {
    const future = JSON.stringify({ format: 'vocabapp-full-backup', version: 99, data: {} });
    expect(() => applyFullBackup(future)).toThrow(/newer/);
  });
});

describe('backupReminderDue', () => {
  it('stays quiet with no learner data', () => {
    expect(backupReminderDue()).toBe(false);
  });

  it('starts the clock on first sight, then fires after the period', () => {
    store.set('vq_srs_spanish', '{}');
    const t0 = 1_000_000_000_000;
    expect(backupReminderDue(t0)).toBe(false);
    expect(backupReminderDue(t0 + (REMINDER_DAYS - 1) * DAY)).toBe(false);
    expect(backupReminderDue(t0 + (REMINDER_DAYS + 1) * DAY)).toBe(true);
  });

  describe('what counts as something worth backing up', () => {
    const t0 = 1_000_000_000_000;
    const firstSeen = (): string | undefined => store.get('s_backup_first_seen');

    it.each([
      ['a starter list the app made by itself', { ml_starter_seeded_spanish: 'true', vq_smart_spanish: '{"Starter":{}}' }],
      ['a folder look the app set up', { ml_folders_smart_spanish: '["Starter Lists"]', ml_folder_style_smart_spanish: '{}' }],
      ['where panels were left', { ml_sidebar_section_collapsed_smart: 'true', ml_browse_sort: 'rank', vq_history_collapsed: '["trouble"]' }],
      ['choices in the main controls', { vq_mode: 'table', vq_size: '250', s_simple_mode: 'false', theme: 'dark' }],
    ])('%s is not learner data: no clock starts and no reminder ever fires', (_what, keys) => {
      for (const [k, v] of Object.entries(keys)) store.set(k, v);
      expect(backupReminderDue(t0)).toBe(false);
      expect(firstSeen()).toBeUndefined();
      expect(backupReminderDue(t0 + 90 * DAY)).toBe(false);
    });

    it.each([
      ['a list you made', { vq_lists_spanish: '{"Known":["casa"]}' }],
      ['a mastered word', { vq_mastery_spanish: '["casa"]' }],
      ['a quiz you took', { vq_history_spanish: '[]' }],
      ['My Content you wrote', { uc_words_spanish: '[]' }],
      ['a Testing Profile', { vq_presets_table: '{}' }],
      ['an old-layout "known words" set not yet migrated', { vq_known_spanish: '["casa"]' }],
    ])('%s is: the clock starts and the reminder fires after the period', (_what, keys) => {
      for (const [k, v] of Object.entries(keys)) store.set(k, v);
      expect(backupReminderDue(t0)).toBe(false);
      expect(firstSeen()).toBe(String(t0));
      expect(backupReminderDue(t0 + (REMINDER_DAYS + 1) * DAY)).toBe(true);
    });

    it('real work beside app-made files still counts', () => {
      store.set('ml_starter_seeded_spanish', 'true');
      store.set('vq_mastery_spanish', '["casa"]');
      backupReminderDue(t0);
      expect(firstSeen()).toBe(String(t0));
    });
  });

  it('snoozing restarts the period', () => {
    store.set('vq_srs_spanish', '{}');
    const t0 = 1_000_000_000_000;
    snoozeBackupReminder(t0);
    expect(backupReminderDue(t0 + DAY)).toBe(false);
    expect(backupReminderDue(t0 + (REMINDER_DAYS + 1) * DAY)).toBe(true);
  });
});
