/**
 * full-backup.ts — every piece of learner data in one file.
 *
 * my-lists/backup.ts covers lists and mastery. Everything else a learner has
 * built up — the spaced-repetition schedule, quiz history, miss tallies,
 * streaks, My Content edits, settings — lives in localStorage too, and was
 * lost together with it. This snapshots the raw keys by prefix (see
 * storage.ts's census), so a new feature that follows the existing prefixes is
 * covered without touching this file.
 *
 * Restore *replaces* the keys the file contains. That is the right call for
 * "move to a new device" and "recover after clearing site data"; the lists-only
 * backup remains the merge-style option for combining two browsers' lists.
 */

import { keys, readString, writeString, isRecord } from './storage.ts';
import { isBackedUp } from './storage-keys.ts';
import { CURRENT_SCHEMA, SCHEMA_KEY } from './storage-migrations.ts';

const FORMAT  = 'vocabapp-full-backup';
const VERSION = 1;

/** Bookkeeping about the backup itself — never part of one (the registry marks them too). */
const LAST_BACKUP_KEY  = 's_last_backup_at';
const FIRST_SEEN_KEY   = 's_backup_first_seen';

/** Remind after this long without a backup. */
export const REMINDER_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface FullBackup {
  format:     typeof FORMAT;
  version:    number;
  exportedAt: string;
  /**
   * The storage layout the data was in (see storage-migrations.ts). Absent on backups made
   * before layouts were versioned, which are read as layout 0 — the original one.
   */
  schema?:    number;
  data:       Record<string, string>;
}

/**
 * Whether a full backup carries this key. The answer comes from the key registry
 * (storage-keys.ts) rather than a hand-kept prefix list here: a registered key
 * follows its family, and an unknown key with one of the app's prefixes is kept
 * too, so data written by an older or newer version is never silently dropped.
 */
export function isDataKey(key: string): boolean {
  return isBackedUp(key);
}

export function buildFullBackup(now = new Date()): FullBackup {
  const data: Record<string, string> = {};
  for (const k of keys()) {
    if (!isDataKey(k)) continue;
    const v = readString(k);
    if (v !== null) data[k] = v;
  }
  return { format: FORMAT, version: VERSION, exportedAt: now.toISOString(), schema: CURRENT_SCHEMA, data };
}

/**
 * Validate and apply a backup. Returns how many keys were written.
 * Throws with a readable message on anything that isn't one of our files.
 */
export function applyFullBackup(raw: string): number {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('That file is not valid JSON.'); }
  if (!isRecord(parsed) || parsed.format !== FORMAT || !isRecord(parsed.data)) {
    throw new Error('That file does not look like a VocabApp full backup.');
  }
  if (typeof parsed.version === 'number' && parsed.version > VERSION) {
    throw new Error('That backup was made by a newer version of the app.');
  }
  const schema = typeof parsed.schema === 'number' && Number.isInteger(parsed.schema) && parsed.schema >= 0 ? parsed.schema : 0;
  if (schema > CURRENT_SCHEMA) {
    throw new Error('That backup was made by a newer version of the app.');
  }
  let written = 0;
  for (const [k, v] of Object.entries(parsed.data)) {
    if (typeof v !== 'string' || !isDataKey(k)) continue;
    if (writeString(k, v)) written++;
  }
  // The restored keys are in the layout the backup was taken at, not necessarily this browser's.
  // Put the version back to match so the migrations run over them on the next start. (Steps only
  // touch legacy-layout keys, so anything already current is left as it is.)
  writeString(SCHEMA_KEY, String(schema));
  return written;
}

export function downloadFullBackup(): void {
  const blob = new Blob([JSON.stringify(buildFullBackup())], { type: 'application/json;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `vocabapp-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  writeString(LAST_BACKUP_KEY, String(Date.now()));
}

export function lastBackupAt(): number | null {
  const n = Number(readString(LAST_BACKUP_KEY));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Does this browser hold anything worth losing? */
function hasLearnerData(): boolean {
  return keys().some(k => k.startsWith('vq_history_') || k.startsWith('vq_srs_')
    || k.startsWith('ml_') || k.startsWith('uc_'));
}

/**
 * Should the app nag about backing up? Only once there is data to lose, and
 * only after REMINDER_DAYS since the last backup — or since first noticing
 * data, for someone who has never backed up.
 */
export function backupReminderDue(now = Date.now()): boolean {
  if (!hasLearnerData()) return false;
  const last = lastBackupAt();
  if (last !== null) return now - last > REMINDER_DAYS * DAY_MS;
  const seen = Number(readString(FIRST_SEEN_KEY));
  if (!Number.isFinite(seen) || seen <= 0) {
    writeString(FIRST_SEEN_KEY, String(now));
    return false;
  }
  return now - seen > REMINDER_DAYS * DAY_MS;
}

/** After showing a reminder, wait another full period before the next. */
export function snoozeBackupReminder(now = Date.now()): void {
  writeString(LAST_BACKUP_KEY, String(now));
}
