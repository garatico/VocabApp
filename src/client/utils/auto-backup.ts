/**
 * auto-backup.ts — in the installed apps, a copy of everything kept where uninstalling can't reach it.
 *
 * The Windows and Android apps keep lists, progress and settings in their WebView's storage, which an
 * uninstall deletes (Android always; Windows when "delete app data" is ticked). So they also keep the full
 * backup (full-backup.ts) as a file in the user's Documents folder — Documents/VocabApp/vocabapp-backup.json —
 * rewritten at start, every few minutes while open, and whenever the app goes to the background.
 *
 * A fresh install that finds that file offers to restore it. On Windows the app reads it itself. Android
 * (11 and later) won't let a reinstalled app read a file its earlier install wrote, so there the app asks
 * the learner to pick it in the system file picker — and since it can't overwrite that file either, this
 * install writes its own copy beside it (vocabapp-backup-<date>.json).
 *
 * Nothing is written until the first-start check is settled (restored, declined, or there was nothing to
 * find): a fresh, empty install must never overwrite the backup it is about to offer. `s_auto_backup_file`
 * records the file this install writes to, and that the check is done (bookkeeping, never backed up).
 *
 * The web app has no Documents folder to write to; it keeps the manual download in Settings.
 */

import { buildFullBackup, applyFullBackup, hasLearnerData } from './full-backup.ts';
import { readString, writeString } from './storage.ts';
import { logger } from './logger.ts';

export const AUTO_BACKUP_KEY = 's_auto_backup_file';
export const AUTO_BACKUP_DIR = 'VocabApp';
export const AUTO_BACKUP_FILE = 'vocabapp-backup.json';
const EVERY_MS = 5 * 60 * 1000;

export interface BackupDriver {
  /** Where the file lives, for the learner to read ("Documents\VocabApp"). */
  where: string;
  /** The file's text, or null when it is missing or this install may not read it. */
  read(name: string): Promise<string | null>;
  /** Throws when the file can't be written (Android: it belongs to an earlier install). */
  write(name: string, text: string): Promise<void>;
  /** Android only: whether this install can read files an earlier one left (it can't on 11+). */
  canReadOthers: boolean;
}

type Globals = typeof globalThis & {
  __TAURI_INTERNALS__?: unknown;
  Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
};

/** The driver for this app, or null in a browser. */
export async function backupDriver(): Promise<BackupDriver | null> {
  const g = globalThis as Globals;
  if (g.__TAURI_INTERNALS__) {
    const fs = await import('@tauri-apps/plugin-fs');
    const baseDir = fs.BaseDirectory.Document;
    return {
      where: 'Documents\\VocabApp', canReadOthers: true,
      async read(name) {
        const p = `${AUTO_BACKUP_DIR}/${name}`;
        return await fs.exists(p, { baseDir }) ? fs.readTextFile(p, { baseDir }) : null;
      },
      async write(name, text) {
        await fs.mkdir(AUTO_BACKUP_DIR, { baseDir, recursive: true });
        await fs.writeTextFile(`${AUTO_BACKUP_DIR}/${name}`, text, { baseDir });
      },
    };
  }
  if (g.Capacitor?.isNativePlatform?.()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const path = (name: string): string => `${AUTO_BACKUP_DIR}/${name}`;
    return {
      where: 'Documents/VocabApp', canReadOthers: false,
      async read(name) {
        try {
          const r = await Filesystem.readFile({ path: path(name), directory: Directory.Documents, encoding: Encoding.UTF8 });
          return typeof r.data === 'string' ? r.data : null;
        } catch { return null; }
      },
      async write(name, text) {
        await Filesystem.writeFile({ path: path(name), data: text, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
      },
    };
  }
  return null;
}

/** What a found backup holds, for the restore question. Null when it isn't a usable one. */
export function describeBackup(text: string | null): { keys: number; exportedAt: Date | null } | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { format?: unknown; data?: unknown; exportedAt?: unknown };
    if (parsed.format !== 'vocabapp-full-backup' || !parsed.data || typeof parsed.data !== 'object') return null;
    const keys = Object.keys(parsed.data).length;
    if (keys === 0) return null;
    const at = typeof parsed.exportedAt === 'string' ? new Date(parsed.exportedAt) : null;
    return { keys, exportedAt: at && !Number.isNaN(at.getTime()) ? at : null };
  } catch { return null; }
}

/**
 * Is this storage fresh — nothing a learner made, and fewer kept values than the found backup? Then a
 * found backup is worth offering. (Settings-only learners count: the backup holding more is the signal.)
 */
export function worthOffering(found: { keys: number } | null): boolean {
  if (!found) return false;
  if (hasLearnerData()) return false;
  return Object.keys(buildFullBackup().data).length < found.keys;
}

/** The name this install writes to when the shared one belongs to an earlier install (Android). */
export function ownFileName(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  return `vocabapp-backup-${stamp}.json`;
}

export interface AutoBackupUi {
  /** "Restore it?" for a backup the app found itself. Resolves true to restore. */
  offerFound(found: { keys: number; exportedAt: Date | null }, where: string): Promise<boolean>;
  /** Android, after a reinstall: ask the learner to pick the file. Resolves to its text, or null to start fresh. */
  askToPick(where: string): Promise<string | null>;
  /** After a restore: reload into the restored data. */
  restored(): void;
}

/**
 * Settle the first-start check, then keep the file current. Safe to call in a browser (does nothing).
 * Returns the file name in use, or null when there is none (browser, or the app could not write at all).
 */
export async function initAutoBackup(ui: AutoBackupUi, driver?: BackupDriver | null): Promise<string | null> {
  const d = driver === undefined ? await backupDriver() : driver;
  if (!d) return null;

  let name = readString(AUTO_BACKUP_KEY);
  if (!name) {
    const text = await d.read(AUTO_BACKUP_FILE).catch(() => null);
    const found = describeBackup(text);
    if (found && text && worthOffering(found)) {
      if (await ui.offerFound(found, d.where)) {
        applyFullBackup(text);
        writeString(AUTO_BACKUP_KEY, AUTO_BACKUP_FILE);
        ui.restored();
        return AUTO_BACKUP_FILE;
      }
      // Declined: start fresh, but leave the old file alone (a mis-tap shouldn't cost it) — write beside it.
      name = ownFileName();
      writeString(AUTO_BACKUP_KEY, name);
    }
  }
  if (!name) {
    // Probe the shared name. On Android a write that fails means an earlier install's file is there.
    name = AUTO_BACKUP_FILE;
    try {
      await d.write(AUTO_BACKUP_FILE, JSON.stringify(buildFullBackup()));
    } catch {
      name = ownFileName();
      if (!d.canReadOthers && !hasLearnerData()) {
        const picked = await ui.askToPick(d.where);
        if (picked) {
          try {
            applyFullBackup(picked);
            writeString(AUTO_BACKUP_KEY, name);
            ui.restored();
            return name;
          } catch (err) { logger.warn('auto-backup: the picked file could not be restored', err); }
        }
      }
    }
    writeString(AUTO_BACKUP_KEY, name);
  }

  const fileName = name;
  let last = '';
  const save = async (): Promise<void> => {
    const snapshot = buildFullBackup();
    const body = JSON.stringify(snapshot.data);
    if (body === last) return;                       // nothing changed since the last write
    try {
      await d.write(fileName, JSON.stringify(snapshot));
      last = body;
    } catch (err) { logger.warn('auto-backup: could not write', err); }
  };
  await save();
  window.setInterval(() => { void save(); }, EVERY_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void save(); });
  window.addEventListener('pagehide', () => { void save(); });
  return fileName;
}
