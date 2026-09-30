/**
 * dialog.ts — the app's confirmation dialog, in place of window.confirm.
 *
 * `askChoice` asks "which of these?" with real, named buttons — window.confirm only offers OK / Cancel,
 * which can't say "delete the folder only" versus "delete the folder and everything in it". It resolves
 * to the chosen `value`, or null if the learner cancels (Cancel, Escape, or a click outside).
 * `askText` is the in-app stand-in for window.prompt, which a packaged desktop webview can't be relied on
 * to show. `confirmDialog` is the yes/no case: one named action (say what it does — "Delete list", not "OK")
 * and Cancel, resolving to a boolean. Both are styled by public/styles/app/dialog.css.
 */

export interface DialogChoice<T> {
  label: string;
  /** One line under the label saying what it will do. */
  detail?: string;
  value: T;
  /** Drawn as the destructive option. */
  danger?: boolean;
}

export function askChoice<T>(opts: { title: string; message?: string; choices: DialogChoice<T>[] }): Promise<T | null> {
  return new Promise(resolve => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay';
    const box = document.createElement('div');
    box.className = 'app-dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const title = document.createElement('h3');
    title.className = 'app-dialog-title';
    title.id = 'appDialogTitle';
    title.textContent = opts.title;
    box.setAttribute('aria-labelledby', title.id);
    box.appendChild(title);
    if (opts.message) {
      const p = document.createElement('p');
      p.className = 'app-dialog-message';
      p.textContent = opts.message;
      box.appendChild(p);
    }

    const done = (value: T | null): void => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      previouslyFocused?.focus?.();
      resolve(value);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); done(null); }
    };

    const buttons = document.createElement('div');
    buttons.className = 'app-dialog-choices';
    opts.choices.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'app-dialog-choice' + (c.danger ? ' app-dialog-choice--danger' : '');
      const label = document.createElement('span');
      label.className = 'app-dialog-choice-label';
      label.textContent = c.label;
      b.appendChild(label);
      if (c.detail) {
        const d = document.createElement('span');
        d.className = 'app-dialog-choice-detail';
        d.textContent = c.detail;
        b.appendChild(d);
      }
      b.addEventListener('click', () => done(c.value));
      buttons.appendChild(b);
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'app-dialog-cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => done(null));
    buttons.appendChild(cancel);
    box.appendChild(buttons);

    overlay.appendChild(box);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) done(null); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    (box.querySelector('.app-dialog-choice') as HTMLElement | null)?.focus();
  });
}

/** A yes/no question. `confirmLabel` names the action; `danger` draws it as destructive. */
export async function confirmDialog(opts: {
  title: string; message?: string; confirmLabel?: string; danger?: boolean;
}): Promise<boolean> {
  const answer = await askChoice<true>({
    title: opts.title,
    message: opts.message,
    choices: [{ label: opts.confirmLabel ?? 'OK', value: true, danger: opts.danger }],
  });
  return answer === true;
}

/** Asks for one line of text. Resolves to the trimmed text, or null if cancelled (or left blank). */
export function askText(opts: {
  title: string; message?: string; initial?: string; placeholder?: string; confirmLabel?: string;
}): Promise<string | null> {
  return new Promise(resolve => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay';
    const box = document.createElement('div');
    box.className = 'app-dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const title = document.createElement('h3');
    title.className = 'app-dialog-title';
    title.id = 'appDialogTitle';
    title.textContent = opts.title;
    box.setAttribute('aria-labelledby', title.id);
    box.appendChild(title);
    if (opts.message) {
      const p = document.createElement('p');
      p.className = 'app-dialog-message';
      p.textContent = opts.message;
      box.appendChild(p);
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'app-dialog-input';
    input.value = opts.initial ?? '';
    input.placeholder = opts.placeholder ?? '';
    input.setAttribute('aria-labelledby', title.id);
    box.appendChild(input);

    const done = (value: string | null): void => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      previouslyFocused?.focus?.();
      resolve(value);
    };
    const submit = (): void => { const v = input.value.trim(); done(v || null); };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.stopPropagation(); done(null); }
      else if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); submit(); }
    };

    const buttons = document.createElement('div');
    buttons.className = 'app-dialog-choices app-dialog-choices--row';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'app-dialog-choice';
    const okLabel = document.createElement('span');
    okLabel.className = 'app-dialog-choice-label';
    okLabel.textContent = opts.confirmLabel ?? 'OK';
    ok.appendChild(okLabel);
    ok.addEventListener('click', submit);
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'app-dialog-cancel';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => done(null));
    buttons.append(ok, cancel);
    box.appendChild(buttons);

    overlay.appendChild(box);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) done(null); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}
