/**
 * toast.ts — a brief, dismissible notice for something that just happened.
 *
 * `public/styles/app/toast.css` already ships `.toast`/`.toast-success`/etc.
 * styling but nothing instantiated it — this is that missing piece, kept
 * generic (not "streak toast" or "goal toast") so any future one-off
 * notification reuses it instead of growing its own copy, the same reasoning
 * `my-lists/undo-toast.ts` gives for being message-agnostic.
 *
 * Multiple toasts can be visible at once (each with its own timer) rather
 * than one slot that the next call clobbers — a streak and a daily-goal
 * celebration can legitimately fire from the same session-end.
 */

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export function showToast(message: string, variant: ToastVariant = 'info', ms = 5000): void {
  const toast = document.createElement('div');
  toast.className = `toast toast-${variant}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;

  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), ms);
}
