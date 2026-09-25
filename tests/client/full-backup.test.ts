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

  it('snoozing restarts the period', () => {
    store.set('vq_srs_spanish', '{}');
    const t0 = 1_000_000_000_000;
    snoozeBackupReminder(t0);
    expect(backupReminderDue(t0 + DAY)).toBe(false);
    expect(backupReminderDue(t0 + (REMINDER_DAYS + 1) * DAY)).toBe(true);
  });
});
