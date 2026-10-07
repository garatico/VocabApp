/**
 * storage-warning.ts — say so when the app can't save.
 *
 * storage.ts drops a write it can't make and returns false, and nearly every caller ignores that. Fine
 * for a preference; not for a list or a mastery mark, which looked saved and was gone after a reload.
 * The first failed write in a page load shows one error toast saying what is happening and what to do;
 * later ones in the same load stay quiet, since a full or blocked storage fails every write after it.
 */

import { onWriteFailure } from '../utils/storage.ts';
import { showToast } from './toast.ts';

export const STORAGE_FULL_MESSAGE =
  "Couldn't save your last change: this browser's storage for VocabApp is full. Download a backup "
  + '(Settings → Session History), then lower "Sessions to keep" there to free space.';
export const STORAGE_BLOCKED_MESSAGE =
  "This browser isn't letting VocabApp save anything (private browsing, or site data blocked), so "
  + 'your lists and progress will be lost when this tab closes.';

export function initStorageWarning(notify: (message: string) => void = m => showToast(m, 'error', 12000)): void {
  let warned = false;
  onWriteFailure((_key, quota) => {
    if (warned) return;
    warned = true;
    notify(quota ? STORAGE_FULL_MESSAGE : STORAGE_BLOCKED_MESSAGE);
  });
}
