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
    reader.onload = () => {
      try {
        if (!confirm('Restoring replaces the data currently in this browser with the backup. Continue?')) return;
        const n = applyFullBackup(String(reader.result));
        showToast(`Restored ${n} items — reloading…`, 'success', 2000);
        window.setTimeout(() => location.reload(), 1200);
      } catch (err) {
        logger.warn('full restore failed', err);
        alert((err as Error).message || 'Could not read that backup file.');
      } finally {
        input.value = '';
      }
    };
    reader.readAsText(file);
  });
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
