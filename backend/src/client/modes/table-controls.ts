import { renderTableMode, type TableController, type TableDirection } from './table-mode.ts';

let tableController:  TableController | null = null;
let resolvedDirection: TableDirection         = 'target-en';

export function setTableController(controller: TableController): void {
  tableController = controller;
}

/**
 * Returns the last direction that was resolved. Safe to call mid-session.
 */
export function getDirection(): TableDirection {
  return resolvedDirection;
}

/**
 * Reads the direction toggle and stores the result. 'mixed' is passed through
 * as-is so renderTableMode can assign a random direction per entry.
 * Call this once at Start Quiz time.
 */
export function resolveDirection(): TableDirection {
  const active = document.querySelector<HTMLButtonElement>('#directionToggle .conj-toggle-btn.active');
  const val    = active?.dataset.direction ?? 'target-en';

  if (val === 'mixed') {
    resolvedDirection = 'mixed';
  } else {
    resolvedDirection = val === 'en-target' ? 'en-target' : 'target-en';
  }
  return resolvedDirection;
}

/** Rebuild the table in the current wrap element. */
function hideSummaries(): void {
  ['tableSummary', 'tableSummaryTop'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  });
}

function showSummaries(html: string): void {
  ['tableSummary', 'tableSummaryTop'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'flex'; el.innerHTML = html; }
  });
}

function rebuildTable(cols: number): void {
  if (!tableController) return;
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  hideSummaries();
  tableController = renderTableMode({
    words:     tableController.words,
    container: wrap as HTMLElement,
    columns:   cols,
    direction: resolvedDirection,
  });
}

export function bindTableControls(): void {
  const tableSubmit   = document.getElementById('tableSubmit');
  const tableReset    = document.getElementById('tableReset');
  const tableExport   = document.getElementById('tableExport');
  const tableFeedback = document.getElementById('tableFeedback');
  const colsSelect    = document.getElementById('colsSelect')    as HTMLSelectElement | null;
  const dirToggle     = document.getElementById('directionToggle');

  tableSubmit?.addEventListener('click', () => {
    if (!tableController || !tableFeedback) return;
    const results = tableController.checkAll();
    const correct = results.filter(r => r.ok).length;
    tableFeedback.textContent =
      `Checked ${results.length} — correct: ${correct}, incorrect: ${results.length - correct}`;
  });

  tableReset?.addEventListener('click', () => {
    const results = tableController?.giveUp();
    if (!results) return;
    const correct = results.filter(r => r.ok).length;
    const missed  = results.length - correct;
    const pct     = results.length ? Math.round((correct / results.length) * 100) : 0;
    showSummaries(
      `<span class="summary-correct">✓ ${correct} correct</span>` +
      `<span class="summary-missed">✗ ${missed} missed</span>` +
      `<span class="summary-pct">${pct}%</span>`
    );
  });

  tableExport?.addEventListener('click', () => {
    if (!tableController) return;
    const data = tableController.words ?? [];
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'table_words.json';
    a.click();
  });

  // Rebuild when column count changes (preserves resolved direction)
  colsSelect?.addEventListener('change', () => {
    if (!tableController) return;
    const cols = Math.max(1, Math.min(5, Number(colsSelect.value)));
    rebuildTable(cols);
  });

  // Direction toggle — activate button and rebuild immediately.
  // Mixed re-randomises every entry on each rebuild.
  dirToggle?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.conj-toggle-btn');
    if (!btn) return;

    dirToggle.querySelectorAll('.conj-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const val = btn.dataset.direction ?? 'target-en';
    if (val === 'mixed') {
      resolvedDirection = 'mixed';
    } else {
      resolvedDirection = val === 'en-target' ? 'en-target' : 'target-en';
    }
    if (tableController) {
      const cols = Math.max(1, Math.min(5, Number(colsSelect?.value) || 2));
      rebuildTable(cols);
    }
  });
}
