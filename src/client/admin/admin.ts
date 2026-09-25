/**
 * admin.ts  —  entry point (Vite build)
 *
 * Thin orchestrator: imports the four feature modules, wires up
 * theme toggle + tab navigation, then initialises everything.
 */

import { hasReachableBackend } from './backend-probe.ts';
import { loadMeta, initEditor, isFormDirty, discardFormChanges } from './admin-editor.js';
import { loadStatistics, initStats } from './admin-stats.js';
import { initDbAdmin } from './admin-db.js';
import { initConjugation } from './admin-conjugation.js';
import { initTable, ensureTableLoaded, isTableDirty, discardTableChanges } from './admin-table.js';
import { logger } from '../utils/logger.js';
import { readString, writeString } from '../utils/storage.ts';
import { isPackagedApp } from '../data/vocab-source.js';
import { initAdminDataClient } from './admin-data-client.js';

// ── Theme ─────────────────────────────────────────────────────────────────────

const themeToggle = document.getElementById('themeToggle');
const themeButtons = themeToggle?.querySelectorAll<HTMLButtonElement>('[data-theme]') ?? [];

function applyTheme(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
  themeButtons.forEach(btn => btn.classList.toggle('active', (btn.dataset.theme === 'dark') === dark));
}

applyTheme(readString('admin-theme') === 'dark');

themeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const dark = btn.dataset.theme === 'dark';
    applyTheme(dark);
    writeString('admin-theme', dark ? 'dark' : 'light');
  });
});

// ── Language flags ───────────────────────────────────────────────────────────
// Show/hide every .flag-icon admin-wide (language selects, DB Admin's
// per-language buttons, Statistics' tabs) — one class on <html> rather than
// each module re-checking a setting itself, same shape as the theme toggle
// right above.

const flagsToggle = document.getElementById('flagsToggle');
const flagsButtons = flagsToggle?.querySelectorAll<HTMLButtonElement>('[data-flags]') ?? [];

function applyFlagsVisible(visible: boolean): void {
  document.documentElement.classList.toggle('hide-lang-flags', !visible);
  flagsButtons.forEach(btn => btn.classList.toggle('active', (btn.dataset.flags === 'on') === visible));
}

applyFlagsVisible(readString('admin-show-flags') !== 'off');

flagsButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const visible = btn.dataset.flags === 'on';
    applyFlagsVisible(visible);
    writeString('admin-show-flags', visible ? 'on' : 'off');
  });
});

// ── Tab navigation ────────────────────────────────────────────────────────────

// [data-tab] excludes the "Back to App" link — it shares .tab-btn's look for
// visual consistency in the tab row, but it's a real navigation away from
// this page, not a panel switch, so it should neither steal the active
// state nor hide whatever tab-content is currently showing before the
// browser unloads the page.
document.querySelectorAll<HTMLElement>('.tab-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const tabId = btn.dataset.tab;
    if (tabId) document.getElementById(tabId)?.classList.add('active');
  });
});

// ── Words sub-view toggle (Word Editor / Table View) ─────────────────────────
// Both views live under the one "Words" tab now — see admin.html's
// #wordsEditorView/#wordsTableView — so switching between them is a class
// toggle here rather than the generic .tab-btn[data-tab] handling above.

// One toggle lives in each sub-view's own filter bar (admin.html) rather
// than a single shared row above both, so all of them need to move together.
const wordsViewButtons = document.querySelectorAll<HTMLButtonElement>('[data-words-view-toggle] [data-view]');
const wordsEditorView  = document.getElementById('wordsEditorView');
const wordsTableView   = document.getElementById('wordsTableView');

function applyWordsView(view: string): void {
  wordsEditorView?.toggleAttribute('hidden', view !== 'editor');
  wordsTableView?.toggleAttribute('hidden', view !== 'table');
  wordsViewButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  if (view === 'table') ensureTableLoaded();
}

function currentWordsView(): string {
  return wordsEditorView?.hasAttribute('hidden') ? 'table' : 'editor';
}

// "Save or discard before switching" — a mid-edit Word Editor form or a
// Table View page with unsaved cell edits would otherwise vanish the moment
// the other view's data replaces it, with no warning either was ever there.
// Same discard-and-continue shape loadPage() already uses for its own
// "load a different page with edits pending" case (admin-table.ts).
wordsViewButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.view ?? 'editor';
    if (target === currentWordsView()) return;

    if (isFormDirty() || isTableDirty()) {
      if (!window.confirm('You have unsaved changes. Discard them and switch?')) return;
      discardFormChanges();
      void discardTableChanges();
    }

    applyWordsView(target);
  });
});

// ── No usable data source: bounce back to the app, don't strand anyone here ──
//
// This whole panel is dead weight without either a real Express process
// behind it or (in a packaged build) its own local SQLite copy. It used to
// gate this on isPackagedApp() (Tauri/Capacitor never ship a server) and
// either show a banner explaining that, or later, redirect immediately. Both
// were wrong in the same way: isPackagedApp() only tells you "this is a
// Tauri/Capacitor webview," not whether *this* instance has a server behind
// it — `tauri dev` points its webview at the exact same Vite dev server a
// browser would use (see tauri.conf.json's devUrl), proxying `/api/*` to a
// real Express process the same way, so a developer running that alongside
// `npm run dev:api` in another terminal has a perfectly working backend that
// isPackagedApp() can't see.
//
// So the real backend is always tried first, packaged or not — that's the
// live, shared VocabApp-Data database, strictly more authoritative than a
// Tauri build's frozen local copy, and it's what a developer running the
// normal dev workflow expects to be editing. Local SQLite is only reached
// for as a fallback, and only in a packaged app, for the case that used to
// just redirect away: no server anywhere.
async function selectAdminDataSource(): Promise<'http' | 'tauri-sqlite' | null> {
  if (await hasReachableBackend()) return 'http';
  if (isPackagedApp()) {
    const { initTauriVocabSource, isTauriSqlReady } = await import('../tauri/bootstrap.js');
    try {
      await initTauriVocabSource();
    } catch (err) {
      logger.error('Failed to initialize local SQLite for admin:', err);
    }
    if (isTauriSqlReady()) return 'tauri-sqlite';
  }
  return null;
}

const dataSource = await selectAdminDataSource();

if (dataSource) {
  await initAdminDataClient(dataSource === 'tauri-sqlite');

  // ── Initialise all modules ──────────────────────────────────────────────
  initEditor();
  initStats();
  initDbAdmin();
  initConjugation();
  initTable();

  // Pre-load data for the default visible tabs
  void loadMeta();
  void loadStatistics();
} else {
  window.location.replace('./');
}

logger.info('✓ Admin panel loaded');
