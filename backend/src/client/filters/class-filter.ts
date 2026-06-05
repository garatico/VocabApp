/**
 * class-filter.ts
 *
 * POS (part-of-speech) filter — pill toggle chip UI.
 * "All" chip active (nothing selected) means no filtering.
 * Selecting individual chips narrows the quiz word pool to those POS types.
 */

const selected = new Set<string>();

function syncUI(): void {
  const container = document.getElementById('classFilter');
  if (!container) return;

  const isAll = selected.size === 0;
  container.querySelector<HTMLElement>('.pos-chip-all')
    ?.classList.toggle('active', isAll);

  container.querySelectorAll<HTMLButtonElement>('.pos-chip[data-pos]').forEach(btn => {
    btn.classList.toggle('active', selected.has(btn.dataset.pos!));
  });
}

export function bindClassFilter(): void {
  const container = document.getElementById('classFilter');
  if (!container) return;

  container.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!btn) return;

    if (btn.classList.contains('pos-chip-all')) {
      selected.clear();
    } else if (btn.dataset.pos) {
      const pos = btn.dataset.pos;
      if (selected.has(pos)) selected.delete(pos);
      else                    selected.add(pos);
    }

    syncUI();
    // Bubble a change event so app.ts can trigger loadAndBuildFilters
    container.dispatchEvent(new Event('change', { bubbles: true }));
  });

  syncUI();
}

/** Returns selected POS values, or [] when "All" is active (no filtering). */
export function getSelectedClasses(): string[] {
  return selected.size === 0 ? [] : [...selected];
}
