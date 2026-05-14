/**
 * admin-stats.js
 *
 * Statistics tab — fetches per-language coverage metrics and renders them.
 */

import { apiCall, showStatus } from './admin-api.js';

const refreshStatsBtn = document.getElementById('refreshStatsBtn');
const statsContainer  = document.getElementById('statsContainer');

function renderLanguageStat(lang, s) {
  const div = document.createElement('div');
  div.innerHTML = `
    <h3 style="margin-top:1.5rem;margin-bottom:1rem;color:var(--accent);">
      ${lang.charAt(0).toUpperCase() + lang.slice(1)}
    </h3>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Words</div>
        <div class="stat-value">${s.total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">With Examples</div>
        <div class="stat-value">${s.withExamples}</div>
        <div class="coverage-bar">
          <div class="bar"><div class="bar-fill" style="width:${s.coverage.examples}%"></div></div>
          <div class="bar-label">${s.coverage.examples}%</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">With IPA</div>
        <div class="stat-value">${s.withIPA}</div>
        <div class="coverage-bar">
          <div class="bar"><div class="bar-fill" style="width:${s.coverage.ipa}%"></div></div>
          <div class="bar-label">${s.coverage.ipa}%</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Verbs</div>
        <div class="stat-value">${s.verbs}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Nouns</div>
        <div class="stat-value">${s.nouns}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Adjectives</div>
        <div class="stat-value">${s.adjectives}</div>
      </div>
    </div>
  `;
  return div;
}

export async function loadStatistics() {
  try {
    refreshStatsBtn.disabled    = true;
    refreshStatsBtn.textContent = '🔄 Loading...';

    const { stats } = await apiCall('/stats');

    statsContainer.innerHTML = '';
    Object.entries(stats).forEach(([lang, s]) => {
      statsContainer.appendChild(renderLanguageStat(lang, s));
    });

    showStatus('Statistics loaded', 'success');
  } catch (err) {
    showStatus(`Stats error: ${err.message}`, 'error');
  } finally {
    refreshStatsBtn.disabled    = false;
    refreshStatsBtn.textContent = '🔄 Refresh Statistics';
  }
}

export function initStats() {
  refreshStatsBtn.addEventListener('click', loadStatistics);
}
