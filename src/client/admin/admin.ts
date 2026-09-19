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
// isPackagedApp doc comment) — every tab below would otherwise fail its first
// request with admin-api.ts's generic "is the Express backend running?" error,
// which reads like something's broken rather than "this page can't work here."
// Tabs still initialise normally: a learner who opened this from a real server
// gets the ordinary per-request error, and nothing here should assume the
// packaged case is the only reason a fetch could fail.
if (isPackagedApp()) {
  document.getElementById('packagedWarning')?.removeAttribute('hidden');
}

// ── Initialise all modules ────────────────────────────────────────────────────

initEditor();
initStats();
initDbAdmin();
initConjugation();
initTable();

// Pre-load data for the default visible tabs
void loadMeta();
void loadStatistics();

logger.info('✓ Admin panel loaded');
