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
import { logger } from '../utils/logger.js';

// ── Theme ─────────────────────────────────────────────────────────────────────

const themeToggle = document.getElementById('themeToggle');

if (localStorage.getItem('admin-theme') === 'dark') {
  document.documentElement.classList.add('dark');
}

themeToggle?.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem(
    'admin-theme',
    document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );
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

// ── Initialise all modules ────────────────────────────────────────────────────

initEditor();
initStats();
initDbAdmin();
initConjugation();

// Pre-load data for the default visible tabs
void loadMeta();
void loadStatistics();

logger.info('✓ Admin panel loaded');
