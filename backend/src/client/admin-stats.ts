/**
 * admin-stats.ts
 *
 * Statistics tab -- per-language coverage metrics with tab switching.
 */

import { apiCall, showStatus } from './admin-api.js';

interface DomainEntry { domain: string; count: number; }

interface LangStat {
  total:            number;
  withExamples:     number;
  withIPA:          number;
  withConjugations: number;
  withGender:       number;
  posBreakdown:     Record<string, number>;
  topDomains:       DomainEntry[];
  coverage: {
    examples:     number;
    ipa:          number;
    conjugations: number;
    gender:       number;
  };
}

// Spanish first, then alphabetical
const LANG_ORDER = ['spanish', 'french', 'italian', 'portuguese'];
function sortLangs(pairs: [string, LangStat][]): [string, LangStat][] {
  return [...pairs].sort((a, b) => {
    const ai = LANG_ORDER.indexOf(a[0]);
    const bi = LANG_ORDER.indexOf(b[0]);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a[0].localeCompare(b[0]);
  });
}

const refreshStatsBtn = document.getElementById('refreshStatsBtn') as HTMLButtonElement;
const statsContainer  = document.getElementById('statsContainer')  as HTMLElement;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function coverageBar(pct: number, color = 'var(--accent)'): string {
  return (
    '<div class="coverage-bar">' +
      '<div class="coverage-track">' +
        '<div class="coverage-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
      '</div>' +
      '<span class="coverage-pct">' + pct + '%</span>' +
    '</div>'
  );
}

function buildSection(lang: string, s: LangStat): HTMLElement {
  const div = document.createElement('div');
  div.className = 'stat-lang-section';
  div.dataset.lang = lang;

  const nouns = s.posBreakdown?.noun || 0;
  const verbs = s.posBreakdown?.verb || 0;

  const posOrder = ['noun','verb','adjective','adverb','pronoun','preposition','conjunction','article','interjection','other'];
  const posRows = posOrder
    .filter(pos => (s.posBreakdown?.[pos] || 0) > 0)
    .map(pos => {
      const n   = s.posBreakdown[pos];
      const pct = s.total ? Math.round((n / s.total) * 100) : 0;
      return (
        '<div class="pos-row">' +
          '<span class="pos-name">' + esc(pos) + '</span>' +
          '<span class="pos-count">' + n.toLocaleString() + '</span>' +
          coverageBar(pct) +
        '</div>'
      );
    }).join('');

  const SKIP = new Set(['general', 'essential']);
  const specific   = (s.topDomains || []).filter(d => !SKIP.has(d.domain));
  const maxCount   = specific[0]?.count || 1;
  const domainRows = specific.slice(0, 20).map(({ domain, count }) => {
    const pct = Math.round((count / maxCount) * 100);
    return (
      '<div class="domain-row">' +
        '<span class="domain-name">' + esc(domain) + '</span>' +
        '<span class="domain-count">' + count + '</span>' +
        coverageBar(pct, 'var(--info)') +
      '</div>'
    );
  }).join('');

  const generalCount   = s.topDomains?.find(d => d.domain === 'general')?.count   || 0;
  const essentialCount = s.topDomains?.find(d => d.domain === 'essential')?.count || 0;
  const domainSubtitle = [
    generalCount   > 0 ? generalCount.toLocaleString()   + ' general'   : '',
    essentialCount > 0 ? essentialCount.toLocaleString() + ' essential' : '',
  ].filter(Boolean).join(', ');

  div.innerHTML =
    '<div class="stats-grid">' +

      '<div class="stat-card">' +
        '<div class="stat-label">Total Words</div>' +
        '<div class="stat-value">' + s.total.toLocaleString() + '</div>' +
      '</div>' +

      '<div class="stat-card">' +
        '<div class="stat-label">Examples</div>' +
        '<div class="stat-value">' + s.withExamples.toLocaleString() + '</div>' +
        coverageBar(s.coverage.examples) +
      '</div>' +

      '<div class="stat-card">' +
        '<div class="stat-label">IPA</div>' +
        '<div class="stat-value">' + s.withIPA.toLocaleString() + '</div>' +
        coverageBar(s.coverage.ipa) +
      '</div>' +

      '<div class="stat-card">' +
        '<div class="stat-label">Conjugations <span class="stat-sublabel">(of ' + verbs + ' verbs)</span></div>' +
        '<div class="stat-value">' + s.withConjugations.toLocaleString() + '</div>' +
        coverageBar(s.coverage.conjugations, verbs > 0 ? 'var(--accent)' : 'var(--border)') +
      '</div>' +

      '<div class="stat-card">' +
        '<div class="stat-label">Gender <span class="stat-sublabel">(of ' + nouns.toLocaleString() + ' nouns)</span></div>' +
        '<div class="stat-value">' + s.withGender.toLocaleString() + '</div>' +
        coverageBar(s.coverage.gender, nouns > 0 ? 'var(--accent)' : 'var(--border)') +
      '</div>' +

    '</div>' +

    '<div class="stat-section-row">' +

      '<div class="stat-subsection">' +
        '<div class="stat-subsection-title">Part of Speech</div>' +
        '<div class="pos-breakdown">' + (posRows || '<span class="stat-empty">No data</span>') + '</div>' +
      '</div>' +

      '<div class="stat-subsection">' +
        '<div class="stat-subsection-title">Domains' +
          (domainSubtitle ? ' <span class="stat-sublabel">+ ' + esc(domainSubtitle) + '</span>' : '') +
        '</div>' +
        '<div class="domain-breakdown">' + (domainRows || '<span class="stat-empty">No domain data</span>') + '</div>' +
      '</div>' +

    '</div>';

  return div;
}

function buildTabs(langs: string[], activeLang: string): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'stat-lang-tabs';

  langs.forEach(lang => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stat-lang-tab' + (lang === activeLang ? ' active' : '');
    btn.textContent = lang.charAt(0).toUpperCase() + lang.slice(1);
    btn.dataset.lang = lang;
    bar.appendChild(btn);
  });

  return bar;
}

function switchTab(container: HTMLElement, lang: string): void {
  // Update tab buttons
  container.querySelectorAll<HTMLButtonElement>('.stat-lang-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  // Show/hide sections
  container.querySelectorAll<HTMLElement>('.stat-lang-section').forEach(sec => {
    sec.hidden = sec.dataset.lang !== lang;
  });
}

export async function loadStatistics(): Promise<void> {
  try {
    refreshStatsBtn.disabled    = true;
    refreshStatsBtn.textContent = 'Loading...';

    const { stats } = await apiCall('/stats');

    const sorted = sortLangs(Object.entries(stats as Record<string, LangStat>));
    const langs  = sorted.map(([l]) => l);
    const active = langs[0] ?? '';

    statsContainer.innerHTML = '';

    // Tab bar
    const tabs = buildTabs(langs, active);
    tabs.addEventListener('click', e => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('.stat-lang-tab');
      if (btn?.dataset.lang) switchTab(statsContainer, btn.dataset.lang);
    });
    statsContainer.appendChild(tabs);

    // Language sections
    sorted.forEach(([lang, s]) => {
      const section = buildSection(lang, s);
      section.hidden = lang !== active;
      statsContainer.appendChild(section);
    });

    showStatus('Statistics loaded', 'success');
  } catch (err) {
    showStatus('Stats error: ' + (err instanceof Error ? err.message : String(err)), 'error');
  } finally {
    refreshStatsBtn.disabled    = false;
    refreshStatsBtn.textContent = 'Refresh Statistics';
  }
}

export function initStats(): void {
  refreshStatsBtn.addEventListener('click', loadStatistics);
}
