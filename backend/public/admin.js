/**
 * admin.js  —  entry point (ES module)
 *
 * Thin orchestrator: imports the four feature modules, wires up
 * theme toggle + tab navigation, then initialises everything.
 */

import { loadMeta, initEditor } from './src/admin-editor.js';
import { loadStatistics, initStats } from './src/admin-stats.js';
import { initDbAdmin } from './src/admin-db.js';
import { initConjugation } from './src/admin-conjugation.js';

// ── Theme ─────────────────────────────────────────────────────────────────────

const themeToggle = document.getElementById('themeToggle');

if (localStorage.getItem('admin-theme') === 'dark') {
  document.documentElement.classList.add('dark');
}

themeToggle.addEventListener('click', () => {
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
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// ── Initialise all modules ────────────────────────────────────────────────────

initEditor();
initStats();
initDbAdmin();
initConjugation();

// Pre-load data for the default visible tabs
loadMeta();
loadStatistics();

console.log('✓ Admin panel loaded (SQLite edition)');
