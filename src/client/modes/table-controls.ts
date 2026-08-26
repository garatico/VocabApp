import {
  renderTableMode,
  revealTextFor,
  rowKey,
  type TableController,
  type TableDirection,
  type InputSnapshot,
  type CheckResult,
} from './table-mode.ts';
import { Settings, setOnPageSizeChange } from '../settings.ts';
// Mastery lives with the lists UI. Importing across modes is not lovely, but
// the alternative is a second copy of the storage rules, which is how the two
// disagreeing progress models got here in the first place.
import { markMastered } from './my-lists-mode.ts';
import { logger } from '../utils/logger.ts';
import { showSummary, clearSummary, summaryChip, percent } from '../ui/quiz-summary.ts';
import { readString, writeString } from '../utils/storage.ts';
import {
  saveSession, recordOutcome, orderWords, WORD_ORDER_LABELS,
  type WordOrder,
} from '../utils/session-history.ts';
import { buildScorePills, scorePct }     from '../ui/score-pills.ts';
import { createStopwatch } from '../ui/stopwatch.ts';
import type { Word } from '../types.js';

let tableController:  TableController | null = null;
let resolvedDirection: TableDirection         = 'target-en';
let lastMissedWords:   Word[]                 = [];
let lastMissedResults: CheckResult[]          = [];

// ── Quiz style (Standard / Recall / Double Recall — see table-recall-mode.ts) ──

export type TableQuizStyle = 'standard' | 'recall' | 'double';
let tableStyle: TableQuizStyle =
  (readString('vq_table_style') as TableQuizStyle | null) ?? 'standard';

export function getTableStyle(): TableQuizStyle {
  return tableStyle;
}

/**
 * Standard style owns #tableControls/#tableJumpTop/#tableJumpBottom (the
 * per-row-input pagination/CSV/jump bar) and #directionGroup (direction is
 * meaningless once the prompt word itself is blind). Recall/Double Recall
 * style render their own equivalent controls inside #tableWrap instead — see
 * table-recall-mode.ts — so this bar would otherwise sit above/below them
 * doing nothing.
 *
 * Only touches these elements while the Table tab is actually active —
 * ui-state.ts's updateModeUI already decides their visibility for every other
 * tab, and this must not fight that when called from onActivate.table.
 */
export function syncTableStyleUI(): void {
  const isTableTab = document.querySelector('.mode-tab.active')?.getAttribute('data-mode') === 'table';
  if (!isTableTab) return;
  const showStandardOnly = tableStyle === 'standard';
  ['tableControls', 'tableJumpTop', 'tableJumpBottom', 'directionGroup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = showStandardOnly ? '' : 'none';
  });
}

// ── Pagination state ──────────────────────────────────────────────────────────
//
// The table renders one page at a time, but the quiz is the whole word list.
// `sessionState` is the answer record for every word across every page — the
// live DOM only ever holds the current page, so it is merged back in here
// before any navigation, progress read, or scoring pass.

let allWords:    Word[]                    = [];
let pageIndex                              = 0;
let sessionState: Map<string, InputSnapshot> = new Map();
let quizColumns                            = 2;
let quizLang                               = 'spanish';
let onQuizComplete: (() => void) | null    = null;
// Lazy: table-pagination.test.ts and table-compare.test.ts import this module
// in a plain node environment (no `document`) to exercise the pure paging
// helpers below, so nothing at module scope may touch the DOM.
let stopwatch: ReturnType<typeof createStopwatch> | null = null;
function getStopwatch(): ReturnType<typeof createStopwatch> {
  if (!stopwatch) stopwatch = createStopwatch(document.getElementById('tableStopwatch'));
  return stopwatch;
}
let sessionRecorded                        = false;
let wordOrder: WordOrder =
  (readString('vq_table_order') as WordOrder | null) ?? 'rank';

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

/**
 * The end-of-quiz strip. Correct/missed counts deliberately live only in the
 * live score block under the progress bar — this strip carries the actions and
 * the final percentage.
 */
function buildSummaryHtml(results: CheckResult[]): string {
  const correct = results.filter(r => r.ok).length;
  const missed  = results.filter(r => !r.ok && r.word && r.expected);

  let html = '';

  if (missed.length > 0) {
    html +=
      `<button class="summary-retry-btn">↺ Practice ${missed.length}</button>` +
      `<button class="summary-export-btn">↓ Export</button>`;
  }

  html += summaryChip('pct', `${percent(correct, results.length)}%`);
  return html;
}

// ── State snapshot ────────────────────────────────────────────────────────────

function snapshotState(): Map<string, InputSnapshot> {
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return new Map();
  const snap = new Map<string, InputSnapshot>();
  wrap.querySelectorAll<HTMLInputElement>('input[data-word]').forEach(inp => {
    const word = inp.dataset.word;
    if (!word) return;
    // Composite rowKey (lang:word), not bare word text — a Compare-mode table
    // can hold the same spelling from two languages.
    const key = `${inp.dataset.lang ?? quizLang}:${word}`;
    const stateClass =
      inp.classList.contains('correct')   ? 'correct'   as const :
      inp.classList.contains('peeked')    ? 'peeked'    as const :
      inp.classList.contains('incorrect') ? 'incorrect' as const : '' as const;
    snap.set(key, {
      value:    inp.value,
      disabled: inp.disabled,
      stateClass,
      dir:      (inp.dataset.dir ?? 'target-en') as 'target-en' | 'en-target',
    });
  });
  return snap;
}

/** Fold whatever is on screen back into the cross-page answer record. */
function syncSessionState(): void {
  snapshotState().forEach((snap, word) => sessionState.set(word, snap));
}

// ── Pagination helpers ────────────────────────────────────────────────────────

function getPageSize(): number {
  return Settings.getTablePageSize();
}

export function getPageCount(): number {
  return pageCountFor(allWords.length, getPageSize());
}

/** Exported for tests — page count for a given word count and page size. */
export function pageCountFor(wordCount: number, pageSize: number): number {
  if (wordCount <= 0) return 1;
  if (!Number.isFinite(pageSize) || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(wordCount / pageSize));
}

/** Exported for tests — the slice of words shown on a given page. */
export function pageSlice<T>(words: T[], pageSize: number, index: number): T[] {
  if (!Number.isFinite(pageSize) || pageSize <= 0) return words.slice();
  const pages = pageCountFor(words.length, pageSize);
  const clamped = Math.min(Math.max(0, index), pages - 1);
  return words.slice(clamped * pageSize, clamped * pageSize + pageSize);
}

function currentPageWords(): Word[] {
  return pageSlice(allWords, getPageSize(), pageIndex);
}

// ── Progress (spans every page) ───────────────────────────────────────────────

export interface ProgressCounts {
  /** Answered correctly by typing. */
  correct:  number;
  /** Peeked at with the ? button. */
  revealed: number;
  /** Given up on, or checked and wrong. */
  missed:   number;
  /** Not yet touched. */
  left:     number;
  answered: number;
  total:    number;
}

/** Exported for tests — counts for a set of words against the answer record. */
export function countProgress(
  words: readonly { word: string; language?: string }[],
  state: ReadonlyMap<string, { disabled: boolean; stateClass: string }>,
  fallbackLang = 'spanish',
): ProgressCounts {
  let correct = 0, revealed = 0, missed = 0;
  for (const w of words) {
    const snap = state.get(rowKey(w, fallbackLang));
    if (!snap?.disabled) continue;
    if (snap.stateClass === 'correct')     correct++;
    else if (snap.stateClass === 'peeked') revealed++;
    else                                   missed++;
  }
  const total    = words.length;
  const answered = correct + revealed + missed;
  return { correct, revealed, missed, left: total - answered, answered, total };
}

function globalProgress(): ProgressCounts {
  return countProgress(allWords, sessionState, quizLang);
}

function renderProgress(): void {
  syncSessionState();
  const { correct, revealed, missed, left, answered, total } = globalProgress();
  const pct = (n: number): number => scorePct(n, total);
  const greenPct   = pct(correct);
  const yellowPct  = pct(revealed);
  const redPct     = pct(missed);
  // The label now lives inside the bar, so it carries the percentage too —
  // there used to be a separate summary block that appeared solely to say
  // "100%" once you finished.
  const donePct    = total > 0 ? Math.round((answered / total) * 100) : 0;
  const statsText  = total > 0 ? `${answered} / ${total}  ·  ${donePct}%` : '';
  const scoreHtml  = buildScorePills({ correct, revealed, missed, left, total });

  (['Top', 'Bottom'] as const).forEach(pos => {
    const bar       = document.getElementById('tableBar' + pos);
    const yellowBar = document.getElementById('tableBar' + pos + 'Revealed');
    const redBar    = document.getElementById('tableBar' + pos + 'Missed');
    const stats     = document.getElementById('tableStats' + pos);
    const score     = document.getElementById('tableScore' + pos);

    // Segments sit end to end — green, then yellow, then red — so the bar
    // reads as one continuous run.
    if (bar) bar.style.width = greenPct + '%';
    if (yellowBar) {
      yellowBar.style.left  = greenPct + '%';
      yellowBar.style.width = yellowPct + '%';
    }
    if (redBar) {
      redBar.style.left  = (greenPct + yellowPct) + '%';
      redBar.style.width = redPct + '%';
    }
    if (stats) {
      stats.textContent = statsText;
      stats.classList.toggle('progress-label--done', total > 0 && answered === total);
    }
    if (score) score.innerHTML = scoreHtml;
  });

  const giveUpBtn = document.getElementById('tableReset') as HTMLButtonElement | null;
  if (giveUpBtn) giveUpBtn.disabled = total > 0 && answered === total;
}

function isQuizComplete(): boolean {
  const { answered, total } = globalProgress();
  return total > 0 && answered === total;
}

// ── Pager UI ──────────────────────────────────────────────────────────────────

function updatePagers(): void {
  const pages   = getPageCount();
  const visible = pages > 1;

  // With pagination off the size is Infinity, which would poison the arithmetic
  // below — fall back to the full list length (a single page).
  const size  = Number.isFinite(getPageSize()) ? getPageSize() : allWords.length;
  const shown = currentPageWords().length;

  (['Top', 'Bottom'] as const).forEach(pos => {
    const pager = document.getElementById('tablePager' + pos);
    if (pager) pager.hidden = !visible;

    const status = document.getElementById('tablePagerStatus' + pos);
    if (status) {
      const first = pageIndex * size + 1;
      const last  = pageIndex * size + shown;
      // The total matters more than the slice — without it there is no way to
      // tell whether "Words 1–100" is most of the set or a fraction of it.
      status.textContent =
        `Words ${first}–${last} of ${allWords.length.toLocaleString()}`;
    }

    // Page jump. Rebuilt only when the page count changes, since a long list
    // can run to hundreds of options.
    const sel = document.getElementById('tablePagerSelect' + pos) as HTMLSelectElement | null;
    if (sel) {
      if (sel.options.length !== pages) {
        sel.innerHTML = '';
        for (let i = 0; i < pages; i++) {
          const opt = document.createElement('option');
          opt.value = String(i);
          const from = i * size + 1;
          const to   = Math.min((i + 1) * size, allWords.length);
          opt.textContent = `Page ${i + 1} of ${pages}  (${from}–${to})`;
          sel.appendChild(opt);
        }
      }
      sel.value = String(pageIndex);
    }

    const prev = pager?.querySelector<HTMLButtonElement>('[data-page="prev"]');
    const next = pager?.querySelector<HTMLButtonElement>('[data-page="next"]');
    if (prev) prev.disabled = pageIndex === 0;
    if (next) next.disabled = pageIndex >= pages - 1;
  });
}

/**
 * Fold a finished quiz back into mastery.
 *
 * Only words answered correctly count — 'peeked' means the answer was revealed
 * and 'incorrect' speaks for itself. Without this the ▶ Quiz button was a
 * dead end: you could quiz a list to death and its mastered count stayed at
 * zero unless you ticked every word by hand.
 */
function recordMastery(): void {
  // A quiz can report complete more than once as the last answers settle;
  // only the first pass should be written.
  if (sessionRecorded) return;
  sessionRecorded = true;

  syncSessionState();

  // Grouped by each word's actual language (falling back to quizLang for an
  // ordinary single-language quiz) rather than one bucket for the whole
  // session — a Compare-mode quiz mixing two languages must still write
  // mastery/history/session records into the right language's storage,
  // exactly as if it had been quizzed on its own.
  interface Bucket { correct: string[]; missed: string[]; revealed: number; }
  const byLang = new Map<string, Bucket>();
  for (const w of allWords) {
    const wl = w.language ?? quizLang;
    let bucket = byLang.get(wl);
    if (!bucket) { bucket = { correct: [], missed: [], revealed: 0 }; byLang.set(wl, bucket); }

    const cls = sessionState.get(rowKey(w, quizLang))?.stateClass;
    if (cls === 'correct')     bucket.correct.push(w.word);
    else if (cls === 'peeked') { bucket.revealed++; bucket.missed.push(w.word); }
    else                       bucket.missed.push(w.word);
  }

  getStopwatch().stop();
  const seconds = getStopwatch().elapsedSeconds();
  const langs = [...byLang.keys()];
  for (const [wl, { correct, missed, revealed }] of byLang) {
    if (correct.length > 0) {
      const added = markMastered(wl, correct);
      if (added > 0) logger.info(`mastery: +${added} from quiz (${correct.length} correct)`);
    }

    // Shared with recall mode: the miss tally drives the 'words I keep
    // missing' ordering and the repeat-offender marking in both.
    recordOutcome(wl, missed, correct);

    saveSession(wl, {
      at: new Date().toISOString(),
      mode: 'table',
      total: correct.length + missed.length,
      correct: correct.length,
      unassisted: correct.length,   // table has no hint-per-word concept
      hints: 0,
      revealed,
      seconds,
      lang: wl,
      langs: langs.length > 1 ? langs : undefined,
      direction: resolvedDirection,
    });
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderCurrentPage(): void {
  const wrap = document.getElementById('tableWrap');
  if (!wrap) return;

  wrap.innerHTML = '';
  tableController = renderTableMode({
    words:        currentPageWords(),
    container:    wrap as HTMLElement,
    columns:      quizColumns,
    direction:    resolvedDirection,
    lang:         quizLang,
    initialState: sessionState,
    onProgress:   () => {
      renderProgress();
      if (isQuizComplete() && onQuizComplete) {
        recordMastery();
        const cb = onQuizComplete;
        setTimeout(() => cb(), 300);
      }
    },
  });

  updatePagers();
  renderProgress();
}

/** Move to a page, keeping every answer entered so far. */
function goToPage(index: number): void {
  syncSessionState();
  const pages = getPageCount();
  const next  = Math.min(Math.max(0, index), pages - 1);
  if (next === pageIndex) return;
  pageIndex = next;
  renderCurrentPage();

  const area = document.getElementById('tableArea');
  area?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Begin a table quiz over `words`, paginated per the words-per-page setting.
 */
export function startTableQuiz({
  words, columns, direction, lang, onComplete,
}: {
  words:      Word[];
  columns:    number;
  direction:  TableDirection;
  lang:       string;
  onComplete?: (() => void) | null;
}): void {
  // Order is a user choice, shared with recall mode so 'shuffle' and
  // 'words I keep missing' mean the same thing in both. Resolved per word so
  // a Compare-mode list (mixed languages) still reads each word's own miss
  // tally rather than one language's.
  allWords         = orderWords(words, wordOrder, w => w.language ?? lang);
  quizColumns      = columns;
  quizLang         = lang;
  resolvedDirection = direction;
  onQuizComplete   = onComplete ?? null;
  sessionState     = new Map();
  pageIndex        = 0;
  getStopwatch().start();
  sessionRecorded  = false;
  lastMissedWords   = [];
  lastMissedResults = [];
  clearSummary('table');
  renderCurrentPage();
}

/** Restart with a new word set (retry-missed), resetting pagination. */
function restartWith(words: Word[]): void {
  allWords     = words;
  sessionState = new Map();
  pageIndex    = 0;
  clearSummary('table');
  renderCurrentPage();
}

export function setTableController(controller: TableController): void {
  tableController = controller;
}

// ── Scoring across every page ─────────────────────────────────────────────────

function directionFor(word: Word): 'target-en' | 'en-target' {
  const saved = sessionState.get(rowKey(word, quizLang))?.dir;
  if (saved) return saved;
  return resolvedDirection === 'en-target' ? 'en-target' : 'target-en';
}

/**
 * Reveal and score the entire quiz, not just the visible page. The current page
 * is revealed in the DOM; words on other pages are scored from the answer
 * record and marked revealed so they show as missed if navigated to.
 */
function giveUpAll(): CheckResult[] {
  tableController?.giveUp();
  syncSessionState();

  const results: CheckResult[] = [];
  for (const w of allWords) {
    const key  = rowKey(w, quizLang);
    const snap = sessionState.get(key);

    if (snap?.stateClass === 'correct') {
      results.push({ word: w.word, ok: true });
      continue;
    }

    const expected = snap?.disabled && snap.value
      ? snap.value
      : revealTextFor(w, directionFor(w));

    if (!snap?.disabled) {
      // Never answered (and possibly never rendered) — record it as revealed.
      sessionState.set(key, {
        value:      expected,
        disabled:   true,
        stateClass: 'incorrect',
        dir:        directionFor(w),
      });
    }

    results.push({ word: w.word, ok: false, expected });
  }

  renderProgress();
  return results;
}

// ── Jump to first unanswered ──────────────────────────────────────────────────

function jumpToFirstUnanswered(): void {
  const first = document.querySelector<HTMLInputElement>('#tableWrap input[data-word]:not(:disabled)');
  if (first) {
    first.focus();
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Nothing left on this page — jump to the first page that still has a gap.
  syncSessionState();
  const size = getPageSize();
  const idx  = allWords.findIndex(w => !sessionState.get(rowKey(w, quizLang))?.disabled);
  if (idx === -1 || !Number.isFinite(size)) return;
  goToPage(Math.floor(idx / size));
  document.querySelector<HTMLInputElement>('#tableWrap input[data-word]:not(:disabled)')?.focus();
}

// ── After-summary button wiring ───────────────────────────────────────────────

function wireSummaryButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.summary-retry-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (lastMissedWords.length === 0) return;
      restartWith(lastMissedWords);
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

// ── Main bind ─────────────────────────────────────────────────────────────────

export function bindTableControls(): void {
  const tableReset   = document.getElementById('tableReset');
  const tableExport  = document.getElementById('tableExport');
  const tableJumpBtn = document.getElementById('tableJumpBtn');
  const dirToggle    = document.getElementById('directionToggle');
  const styleToggle  = document.getElementById('tableStyleToggle');

  // Reflect whatever was persisted from a prior session — the HTML always
  // marks "Standard" active by default.
  styleToggle?.querySelectorAll<HTMLButtonElement>('.conj-toggle-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.style === tableStyle);
  });

  // Quiz Style — Standard / Recall / Double Recall. Only takes effect on the
  // next Start Quiz, same as every other pre-quiz toggle in this bar.
  styleToggle?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.conj-toggle-btn');
    if (!btn?.dataset.style) return;
    styleToggle.querySelectorAll('.conj-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    tableStyle = btn.dataset.style as TableQuizStyle;
    writeString('vq_table_style', tableStyle);
    syncTableStyleUI();
  });

  // Give Up — reveal the whole quiz, show summary with missed words
  tableReset?.addEventListener('click', () => {
    if (allWords.length === 0) return;
    const results = giveUpAll();

    // giveUpAll() pushes exactly one result per word, in allWords order — zip
    // by index rather than matching on word text, which could pick the wrong
    // word in a Compare-mode table where two languages share a spelling.
    lastMissedResults = [];
    lastMissedWords    = [];
    results.forEach((r, i) => {
      if (r.ok) return;
      lastMissedResults.push(r);
      lastMissedWords.push(allWords[i]);
    });

    const allCorrect = results.every(r => r.ok);
    showSummary('table', buildSummaryHtml(results), allCorrect);
    wireSummaryButtons();
  });

  // Export all words
  tableExport?.addEventListener('click', () => {
    if (allWords.length === 0) return;
    const blob = new Blob([JSON.stringify(allWords, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'table_words.json';
    a.click();
  });

  // Jump to first unanswered — button
  tableJumpBtn?.addEventListener('click', jumpToFirstUnanswered);

  // Jump to first unanswered — Ctrl+/ global shortcut (only when table is active)
  document.addEventListener('keydown', e => {
    const tableArea = document.getElementById('tableArea');
    if (!tableArea || tableArea.hidden) return;
    if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      jumpToFirstUnanswered();
    }
  });

  // Jump to top / bottom of the quiz
  ['tableJumpTop', 'tableJumpBottom'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('[data-jump]');
      if (!btn) return;
      const toTop = btn.dataset.jump === 'top';
      document.getElementById('tableArea')?.scrollIntoView({
        behavior: 'smooth',
        block: toTop ? 'start' : 'end',
      });
    });
  });

  // Page arrows (top and bottom)
  ['tablePagerTop', 'tablePagerBottom'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('[data-page]');
      if (!btn || btn.disabled) return;
      goToPage(pageIndex + (btn.dataset.page === 'next' ? 1 : -1));
    });
  });

  // Word order. Re-orders in place and rebuilds the current page; answers are
  // kept, since sessionState is keyed by word rather than position.
  const orderSel = document.getElementById('tableOrderSelect') as HTMLSelectElement | null;
  if (orderSel) {
    WORD_ORDER_LABELS.forEach(([value, label]) => {
      const o = document.createElement('option');
      o.value = value; o.textContent = label; o.selected = value === wordOrder;
      orderSel.appendChild(o);
    });
    orderSel.addEventListener('change', () => {
      wordOrder = orderSel.value as WordOrder;
      writeString('vq_table_order', wordOrder);
      if (allWords.length === 0) return;
      syncSessionState();
      allWords  = orderWords(allWords, wordOrder, w => w.language ?? quizLang);
      pageIndex = 0;
      renderCurrentPage();
    });
  }

  // Page jump dropdown (top and bottom)
  ['tablePagerSelectTop', 'tablePagerSelectBottom'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', e => {
      const sel = e.target as HTMLSelectElement;
      const idx = Number(sel.value);
      if (Number.isFinite(idx)) goToPage(idx);
    });
  });

  // Page-size setting changed while a quiz is on screen — re-paginate in place
  setOnPageSizeChange(() => {
    if (allWords.length === 0) return;
    syncSessionState();
    pageIndex = Math.min(pageIndex, getPageCount() - 1);
    renderCurrentPage();
  });

  // Direction toggle — rebuild the page in the new direction
  dirToggle?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.conj-toggle-btn');
    if (!btn) return;
    dirToggle.querySelectorAll('.conj-toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const val = btn.dataset.direction ?? 'target-en';
    resolvedDirection = val === 'mixed' ? 'mixed' : val === 'en-target' ? 'en-target' : 'target-en';

    if (allWords.length === 0) return;
    syncSessionState();
    // Drop snapshots for unanswered words so they pick up the new direction;
    // answered ones keep their original prompt.
    for (const [word, snap] of sessionState) {
      if (!snap.disabled) sessionState.delete(word);
    }
    renderCurrentPage();
  });
}
