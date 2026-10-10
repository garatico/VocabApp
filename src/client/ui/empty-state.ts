/**
 * empty-state.ts — what a screen shows when it has nothing to show yet.
 *
 * A line of grey italic text tells a new learner nothing about what to do next. This draws an icon, a
 * short title, one sentence of why, and (where there is an obvious next step) a button that does it.
 * Styled once, in shared/components.css, so every screen's empty state looks the same.
 */

export interface EmptyAction {
  label: string;
  onClick: () => void;
  /** The one action that is the point of the screen; the others are quiet. Default: the first. */
  primary?: boolean;
}

export interface EmptyStateOptions {
  icon: string;
  title: string;
  body?: string;
  actions?: EmptyAction[];
  /** Inside a small panel (a list of matches) rather than a whole screen: less padding, no big icon. */
  compact?: boolean;
}

export function emptyState(o: EmptyStateOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'empty-state' + (o.compact ? ' empty-state--compact' : '');

  const icon = document.createElement('div');
  icon.className = 'empty-state-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = o.icon;

  const title = document.createElement('p');
  title.className = 'empty-state-title';
  title.textContent = o.title;

  root.append(icon, title);

  if (o.body) {
    const body = document.createElement('p');
    body.className = 'empty-state-body';
    body.textContent = o.body;
    root.append(body);
  }

  if (o.actions?.length) {
    const row = document.createElement('div');
    row.className = 'empty-state-actions';
    const hasExplicit = o.actions.some(a => a.primary);
    o.actions.forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'empty-state-btn' + ((hasExplicit ? a.primary : i === 0) ? ' empty-state-btn--primary' : '');
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      row.append(b);
    });
    root.append(row);
  }
  return root;
}

/** Switch to a mode by clicking its tab, as a learner would (works whichever way the tabs are shown). */
export function goToMode(mode: string): void {
  document.querySelector<HTMLElement>(`.mode-tab[data-mode="${mode}"]`)?.click();
}
