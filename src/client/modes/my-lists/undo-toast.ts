/**
 * undo-toast.ts — the transient "Undo" strip.
 *
 * Lists live only in localStorage, so a mis-click used to be unrecoverable.
 * The caller supplies a closure that puts things back; this module only handles
 * the timing and teardown, which is why it knows nothing about lists or words.
 *
 * Passing `null` for `onUndo` hides the button and leaves a plain notice — used
 * for actions that are additive and so have nothing meaningful to reverse.
 */

let undoTimer: number | null = null;

export function showUndo(message: string, onUndo: (() => void) | null, ms = 9000): void {
  dismissUndo();

  const toast = document.createElement('div');
  toast.className = 'ml-undo-toast';
  toast.setAttribute('role', 'status');

  const msg = document.createElement('span');
  msg.className = 'ml-undo-msg'; msg.textContent = message;

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'ml-undo-btn'; btn.textContent = 'Undo';
  btn.hidden = onUndo === null;
  btn.addEventListener('click', () => { dismissUndo(); onUndo?.(); });

  const close = document.createElement('button');
  close.type = 'button'; close.className = 'ml-undo-close';
  close.title = 'Dismiss'; close.textContent = '×';
  close.addEventListener('click', dismissUndo);

  toast.append(msg, btn, close);
  document.body.appendChild(toast);
  undoTimer = window.setTimeout(dismissUndo, ms);
}

export function dismissUndo(): void {
  if (undoTimer !== null) { clearTimeout(undoTimer); undoTimer = null; }
  document.querySelectorAll('.ml-undo-toast').forEach(el => el.remove());
}
