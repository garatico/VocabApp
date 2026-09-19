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

// ── Packaged builds: bounce back to the app, don't strand the learner here ──
//
// A Tauri/Capacitor build ships no Express process at all (see vocab-source.ts's
// isPackagedApp doc comment), so this whole panel is dead weight there — every
// tab's init function ultimately funnels into admin-api.ts's apiCall, and
// there is nothing else for this panel to do. This used to show a banner
// explaining that and then just sit there; the banner was accurate, but it
// still left whoever opened admin.html looking at a page that can never do
// anything, however they got here (there's no in-app link to it in a
// packaged build — see app.ts's DEV-only unhide of a.admin-tab — so reaching
// it at all means a manual navigation, e.g. through devtools). Redirecting
// straight back to the main app is the same information acted on rather than
// just stated: nothing to explain if there's nothing left to look at.
if (isPackagedApp()) {
  window.location.replace('./');
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
