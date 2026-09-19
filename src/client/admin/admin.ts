/**
 * admin.ts  —  entry point (Vite build)
 *
 * Thin orchestrator: imports the four feature modules, wires up
 * theme toggle + tab navigation, then initialises everything.
 */

import { loadMeta, initEditor } from './admin-editor.js';
import { loadStatistics, initStats } from './admin-stats.js';
import { initDbAdmin } from './admin-db.js';
import { initConjugation } from './admin-conjugation.js';
import { initTable } from './admin-table.js';
import { logger } from '../utils/logger.js';
import { readString, writeString } from '../utils/storage.ts';
import { isPackagedApp } from '../data/vocab-source.ts';

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

// ── Tab navigation ────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const tabId = (btn as HTMLElement).dataset.tab;
    if (tabId) document.getElementById(tabId)?.classList.add('active');
  });
});

// ── Packaged-build warning ───────────────────────────────────────────────────
//
// A Tauri/Capacitor build ships no Express process at all (see vocab-source.ts's
// isPackagedApp doc comment). Every tab's init function ultimately funnels into
// admin-api.ts's apiCall (there's nothing else for this panel to do — it's
// purely a view onto server-side data), and either fires immediately
// (Word Editor's initEditor, Conjugation's initConjugation) or on first click
// (Table View). Left running, each one independently hits the same dead end
// and surfaces admin-api.ts's generic "is the Express backend running?" error
// — one per tab, worded like something's broken rather than "this page can't
// work here", even with the banner below already explaining exactly that.
// Skipping init entirely here means the banner is the only thing shown: no
// tab attempts a request that was never going to succeed, so there's nothing
// left to throw a second, more confusing error on top of it.
if (isPackagedApp()) {
  document.getElementById('packagedWarning')?.removeAttribute('hidden');
} else {
  // ── Initialise all modules ──────────────────────────────────────────────
  initEditor();
  initStats();
  initDbAdmin();
  initConjugation();
  initTable();

  // Pre-load data for the default visible tabs
  void loadMeta();
  void loadStatistics();
}

logger.info('✓ Admin panel loaded');
