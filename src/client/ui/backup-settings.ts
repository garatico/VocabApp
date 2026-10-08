/**
 * backup-settings.ts — the Settings > Session History > Backup & Restore rows,
 * and the periodic "you haven't backed up in a while" reminder.
 *
 * Kept out of settings.ts (already the largest file in the app); the logic
 * itself lives in utils/full-backup.ts.
 */

import {
  downloadFullBackup, applyFullBackup, lastBackupAt,
  backupReminderDue, snoozeBackupReminder, REMINDER_DAYS,
} from '../utils/full-backup.ts';
import { showToast } from './toast.ts';
import { logger } from '../utils/logger.ts';
import { confirmDialog, askChoice } from './dialog.ts';
import { initAutoBackup, AUTO_BACKUP_FILE } from '../utils/auto-backup.ts';

function syncReadout(): void {
  const el = document.getElementById('backupLastReadout');
  if (!el) return;
  const at = lastBackupAt();
  el.textContent = at ? `Last backup: ${new Date(at).toLocaleDateString()}.` : 'Never backed up.';
}

export function bindBackupSettings(): void {
  syncReadout();

  document.getElementById('settingFullBackup')?.addEventListener('click', () => {
    downloadFullBackup();
    syncReadout();
    showToast('Backup downloaded.', 'success', 3000);
  });

  const input = document.getElementById('settingFullRestoreInput') as HTMLInputElement | null;
  document.getElementById('settingFullRestore')?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        if (!await confirmDialog({ title: 'Restore this backup?', message: 'Restoring replaces the data currently in this browser with the backup.', confirmLabel: 'Restore', danger: true })) return;
        const n = applyFullBackup(String(reader.result));
        showToast(`Restored ${n} items — reloading…`, 'success', 2000);
        window.setTimeout(() => location.reload(), 1200);
      } catch (err) {
        logger.warn('full restore failed', err);
        showToast((err as Error).message || 'Could not read that backup file.', 'error');
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file);
  });
}

/** Read a file the learner picks, as text; null if they back out. */
function pickBackupFile(): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      file.text().then(resolve, () => resolve(null));
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/**
 * The installed apps (Windows, Android) keep an automatic copy of everything in Documents/VocabApp, which
 * survives an uninstall, and offer it back on a fresh install (utils/auto-backup.ts). Does nothing in a
 * browser.
 */
export function startAutoBackup(): void {
  void initAutoBackup({
    offerFound: async (found, where) => {
      const when = found.exportedAt ? found.exportedAt.toLocaleString() : 'an earlier install';
      const choice = await askChoice({
        title: 'Restore your saved data?',
        message: `A backup from ${when} is in ${where}. It holds your lists, progress and settings.`,
        choices: [
          { label: 'Restore', detail: 'Bring everything back as it was', value: true },
          { label: 'Start fresh', detail: 'The old backup file is kept, untouched', value: false },
        ],
      });
      return choice === true;
    },
    askToPick: async where => {
      const choice = await askChoice({
        title: 'Had VocabApp before?',
        message: `Your earlier install left a backup in ${where} (${AUTO_BACKUP_FILE}). Choose it to bring back your lists, progress and settings.`,
        choices: [
          { label: 'Choose the backup file', value: 'pick' as const },
          { label: 'Start fresh', value: 'fresh' as const },
        ],
      });
      return choice === 'pick' ? pickBackupFile() : null;
    },
    restored: () => {
      showToast('Restored — reloading…', 'success', 2000);
      window.setTimeout(() => location.reload(), 1200);
    },
  }).then(name => {
    const el = document.getElementById('backupAutoReadout');
    if (el && name) { el.hidden = false; el.textContent = `This app also keeps a copy up to date automatically, in Documents/VocabApp/${name} — it survives uninstalling.`; }
  }).catch(err => logger.warn('auto-backup failed to start', err));
}

/** Once per launch, after the UI settles: nudge if a backup is overdue. */
export function maybeRemindBackup(): void {
  if (!backupReminderDue()) return;
  window.setTimeout(() => {
    showToast(
      `No backup in ${REMINDER_DAYS}+ days. Your progress only lives in this browser — `
      + 'Settings → Session History → Backup & Restore.',
      'warning', 10000,
    );
    snoozeBackupReminder();
  }, 4000);
}
