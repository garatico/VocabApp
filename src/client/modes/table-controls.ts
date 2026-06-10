import { renderTableMode, type TableController, type TableDirection, type InputSnapshot, type CheckResult } from './table-mode.ts';
import { Settings } from '../settings.ts';
import type { Word } from '../types.js';

let tableController:  TableController | null = null;
let resolvedDirection: TableDirection         = 'target-en';
let lastMissedWords:   Word[]                 = [];
let lastMissedResults: CheckResult[]          = [];

export function setTableController(controller: TableController): void {
  tableController = controller;
}

export function getDirection(): TableDirection {
  return resolvedDirection;
}

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

// ── Summaries ─────────────────────────────────────────────────────────────────

function hideSummaries(): void {
  ['tableSummary', 'tableSummaryTop'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  });
}

function showSummaries(html: string, perfect = false): void {
  ['tableSummary', 'tableSummaryTop'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'flex';
    el.innerHTML = html;
    el.classList.toggle('quiz-summary--perfect', perfect);
  });
}

function buildSummaryHtml(results: CheckResult[]): string {
  const correct = results.filter(r => r.ok).length;
  const total   = results.length;
  const missed  = results.filter(r => !r.ok && r.word && r.expected);
  const pct     = total ? Math.round((correct / total) * 100) : 0;

  let html =
    `<span class="summary-correct">✓ ${correct} correct</span>` +
    `<span class="summary-missed">✗ ${total - correct} missed</span>`;

  if (missed.length > 0) {
    html +=
      `<button class="summary-retry-btn">↺ Practice ${missed.length}</button>` +
      `<button class="summary-export-btn">↓ Export</button>`;
  }

  html += `<span class="summary-pct">${pct}%</span>`;
  return html;
}

// ── State snapshot (for preserving progress across column changes) ─────────────

function snapshotState(): Map<string, InputSnapshot> {
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return new Map();
  const snap = new Map<string, InputSnapshot>();
  wrap.querySelectorAll<HTMLInputElement>('input[data-word]').forEach(inp => {
    const word = inp.dataset.word;
    if (!word) return;
    const knownBtn = inp.closest('td')?.querySelector<HTMLButtonElement>('.known-btn');
    const stateClass =
      inp.classList.contains('correct')   ? 'correct'   as const :
      inp.classList.contains('peeked')    ? 'peeked'    as const :
      inp.classList.contains('incorrect') ? 'incorrect' as const : '' as const;
    snap.set(word, {
      value:           inp.value,
      disabled:        inp.disabled,
      stateClass,
      dir:             (inp.dataset.dir ?? 'target-en') as 'target-en' | 'en-target',
      knownBtnVisible: knownBtn ? !knownBtn.hidden : false,
      knownBtnActive:  knownBtn?.classList.contains('known-btn--active') ?? false,
    });
  });
  return snap;
}

// ── Table rebuild ─────────────────────────────────────────────────────────────

function getColCount(): number {
  return Settings.getTableCols();
}

function rebuildTable(cols: number, words?: Word[]): void {
  if (!tableController) return;
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return;
  // Snapshot before clearing — skip when retrying missed (fresh start)
  const snap = words ? undefined : snapshotState();
  wrap.innerHTML = '';
  hideSummaries();
  tableController = renderTableMode({
    words:        words ?? tableController.words,
    container:    wrap as HTMLElement,
    columns:      cols,
    direction:    resolvedDirection,
    initialState: snap,
  });
}

// ── Jump to first unanswered ────────────────────────────────────────────────────────────────────────────

function jumpToFirstUnanswered(): void {
  const first = document.querySelector<HTMLInputElement>('#tableWrap input[data-word]:not(:disabled)');
  if (first) {
    first.focus();
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ── After-summary button wiring ─────────────────────────────────────────────────────

function wireSummaryButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.summary-retry-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!tableController || lastMissedWords.length === 0) return;
      rebuildTable(getColCount(), lastMissedWords);
      lastMissedWords   = [];
      lastMissedResults = [];
    });
  });

  document.querySelectorAll<HTMLButtonElement>('.summary-export-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (lastMissedWords.length === 0) return;
      const blob = new Blob([JSON.stringify(lastMissedWords, null, 2)], { type: 'application/json' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = 'missed_words.json';
      a.click();
    });
  });
}

// ── Main bind ─────────────────────────────────────────────────────────────────────────────────

export function bindTableControls(): void {
  const tableReset   = document.getElementById('tableReset');
  const tableExport  = document.getElementById('tableExport');
  const tableJumpBtn = document.getElementById('tableJumpBtn');
  const dirToggle    = document.getElementById('directionToggle');

  // Give Up — reveal all, show richer summary with missed words
  tableReset?.addEventListener('click', () => {
    const results = tableController?.giveUp();
    if (!results) return;

    lastMissedResults = results.filter(r => !r.ok);
    lastMissedWords   = lastMissedResults
      .filter(r => r.word)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      .map(r => tableController!.words.find(w => w.word === r.word)) // tableController is set before a quiz session can complete
      .filter((w): w is Word => w !== undefined);

    const allCorrect = results.every(r => r.ok);
    showSummaries(buildSummaryHtml(results), allCorrect);
    wireSummaryButtons();
  });

  // Export all words
  tableExport?.addEventListener('click', () => {
    if (!tableController) return;
    const blob = new Blob([JSON.stringify(tableController.words, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'table_words.json';
    a.click();
  });

  // Jump to first unanswered — button
  tableJumpBtn?.addEventListener('click', jumpToFirstUnanswered);

  // Jump to first unanswered — Ctrl+/ global shortcut (only when table is active)
  document.addEventListener('keydown', e => {
    if (!tableController) return;
    const tableArea = document.getElementById('tableArea');
    if (!tableArea || tableArea.hidden) return;
    if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      jumpToFirstUnanswered();
    }
  });

  // Direction toggle — always full rebuild (mixed re-randomises per entry)
  dirToggle?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.conj-toggle-btn');
    if (!btn) return;
    dirToggle.querySelectorAll('.conj-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const val = btn.dataset.direction ?? 'target-en';
    resolvedDirection = val === 'mixed' ? 'mixed' : val === 'en-target' ? 'en-target' : 'target-en';
    if (tableController) rebuildTable(getColCount());
  });
}
