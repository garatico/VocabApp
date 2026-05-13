import { renderTableMode } from './table-mode.js';

let tableController = null;

export function setTableController(controller) {
  tableController = controller;
}

export function bindTableControls() {
  const tableSubmit   = document.getElementById('tableSubmit');
  const tableReset    = document.getElementById('tableReset');
  const tableExport   = document.getElementById('tableExport');
  const tableFeedback = document.getElementById('tableFeedback');
  const colsSelect    = document.getElementById('colsSelect');

  tableSubmit?.addEventListener('click', () => {
    if (!tableController) return;
    const results = tableController.checkAll();
    const correct = results.filter(r => r.ok).length;
    tableFeedback.textContent = `Checked ${results.length} — correct: ${correct}, incorrect: ${results.length - correct}`;
  });

  tableReset?.addEventListener('click', () => {
    const results = tableController?.giveUp();
    if (!results) return;
    const correct = results.filter(r => r.ok).length;
    const missed  = results.length - correct;
    const pct     = results.length ? Math.round((correct / results.length) * 100) : 0;
    const el      = document.getElementById('tableSummary');
    if (el) {
      el.style.display = 'flex';
      el.innerHTML = `
        <span class="summary-correct">✓ ${correct} correct</span>
        <span class="summary-missed">✗ ${missed} missed</span>
        <span class="summary-pct">${pct}%</span>
      `;
    }
  });

  tableExport?.addEventListener('click', () => {
    if (!tableController) return;
    // Export the words from the active controller if possible,
    // otherwise fall back to whatever the caller injected
    const data = tableController.words ?? [];
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'table_words.json';
    a.click();
  });

  colsSelect?.addEventListener('change', () => {
    if (!tableController) return;
    const wrap = document.getElementById('tableWrap');
    wrap.innerHTML = '';
    const cols = Math.max(1, Math.min(5, Number(colsSelect.value)));
    tableController = renderTableMode({
      words: tableController.words,
      container: wrap,
      columns: cols
    });
  });
}