/**
 * admin-db.ts
 *
 * DB Admin tab — cache management and CSV export.
 */

import { escapeHtml, showStatus } from './admin-api.js';
import { getAdminDataClient } from './admin-data-client.js';
import type { DbInfo } from './admin-data-client.js';
import { langFlagImgHtml } from './admin-languages.js';

// ── DB info card — connection status, schema/pipeline provenance, cache state ──

function formatAge(ageMs: number): string {
  const s = Math.round(ageMs / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

/** The pipeline stamps `builtAt` as a full ISO timestamp; only the date
 *  reads at a glance here, so drop the time/offset rather than wrap it. */
function formatBuiltAt(builtAt: string): string {
  return builtAt.includes('T') ? builtAt.split('T')[0] : builtAt;
}

async function refreshDbInfo(): Promise<void> {
  const card = document.getElementById('dbInfoCard');
  if (!card) return;

  let info: DbInfo | null;
  try {
    info = await getAdminDataClient().getDbInfo();
  } catch {
    card.hidden = true;
    return;
  }
  if (!info) { card.hidden = true; return; }

  card.hidden = false;

  if (info.status !== 'connected') {
    card.innerHTML = `<div class="status error">Database disconnected — reload it above once vocabulary.db is reachable.</div>`;
    return;
  }

  const items: string[] = [
    `<div class="db-info-item"><span class="db-info-label">Status</span><span class="db-info-value db-info-value--ok">Connected</span></div>`,
  ];

  if (info.data) {
    const { schemaVersion, pipelineVersion, builtAt, minimumSchema } = info.data;
    items.push(
      `<div class="db-info-item"><span class="db-info-label">Schema</span><span class="db-info-value">${escapeHtml(schemaVersion != null ? `v${schemaVersion}` : 'unstamped')} <span class="db-info-label" style="text-transform:none;">(min v${escapeHtml(String(minimumSchema))})</span></span></div>`,
      `<div class="db-info-item"><span class="db-info-label">Pipeline</span><span class="db-info-value">${escapeHtml(pipelineVersion ?? 'unstamped')}</span></div>`,
      `<div class="db-info-item"><span class="db-info-label">Built</span><span class="db-info-value">${escapeHtml(builtAt ? formatBuiltAt(builtAt) : 'unknown')}</span></div>`,
    );
  }

  items.push(
    `<div class="db-info-item"><span class="db-info-label">Cached languages</span><span class="db-info-value">${info.cachedLanguages ?? 0}</span></div>`,
    `<div class="db-info-item"><span class="db-info-label">Parse errors</span><span class="db-info-value ${info.parseErrors ? 'db-info-value--error' : ''}">${info.parseErrors ?? 0}</span></div>`,
  );

  let html = `<div class="db-info-grid">${items.join('')}</div>`;

  if (info.data?.warnings?.length) {
    html += `<div class="db-info-warnings">${
      info.data.warnings.map(w => `<div class="status warning">${escapeHtml(w)}</div>`).join('')
    }</div>`;
  }

  if (info.languages?.length) {
    html += `<div class="db-info-langs">${
      info.languages.map(l =>
        `<span class="db-info-lang-pill" data-lang="${escapeHtml(l.language)}">${langFlagImgHtml(l.language)} <strong>${escapeHtml(l.language)}</strong> · ${l.wordCount.toLocaleString()} words · cached ${formatAge(l.ageMs)}</span>`
      ).join('')
    }</div>`;
  }

  card.innerHTML = html;
}

// ── Cache clear ───────────────────────────────────────────────────────────────

async function clearCache(lang: string | null = null): Promise<string> {
  return getAdminDataClient().clearCache(lang ?? undefined);
}

// ── DB reload ─────────────────────────────────────────────────────────────────

async function reloadDb(): Promise<string> {
  return getAdminDataClient().reloadDb();
}

// ── CSV export ────────────────────────────────────────────────────────────────

async function exportCsv(lang: string): Promise<void> {
  const csv  = await getAdminDataClient().exportCsv(lang);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = `${lang}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Per-language buttons (Clear cache / Export) ────────────────────────────────

// admin.html used to hard-code these two groups to four languages. That list
// silently fell behind as languages were added to the DB — German, Dutch and
// Chinese vocab existed and were fully clearable/exportable through the API,
// but had no button here to reach them. Built from /api/admin/meta instead,
// so a language present in the DB always gets one.
async function buildLangButtons(): Promise<void> {
  const clearGroup  = document.getElementById('clearLangCacheGroup') as HTMLElement;
  const exportGroup = document.getElementById('exportGroup')         as HTMLElement;

  let languages: string[] = ['spanish', 'portuguese', 'italian', 'french'];
  try {
    const meta = await getAdminDataClient().getMeta();
    if (meta.languages?.length) languages = meta.languages;
  } catch { /* fall back to the default list above */ }

  clearGroup.innerHTML = languages.map(lang => {
    const label = lang.charAt(0).toUpperCase() + lang.slice(1);
    return `<button class="secondary clear-lang-cache-btn" data-lang="${escapeHtml(lang)}">${langFlagImgHtml(lang)} Clear ${escapeHtml(label)}</button>`;
  }).join('');

  exportGroup.innerHTML = languages.map(lang => {
    const label = lang.charAt(0).toUpperCase() + lang.slice(1);
    return `<button class="secondary export-btn" data-lang="${escapeHtml(lang)}">${langFlagImgHtml(lang)} ↓ ${escapeHtml(label)}</button>`;
  }).join('');

  // Clear per-language cache
  clearGroup.querySelectorAll<HTMLButtonElement>('.clear-lang-cache-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const lang  = btn.dataset.lang ?? '';
      const label = lang.charAt(0).toUpperCase() + lang.slice(1);
      // .innerHTML, not .textContent — the flag icon is markup, and
      // restoring via .textContent would silently drop it from the button
      // for good after the very first click.
      try {
        btn.disabled  = true;
        btn.innerHTML = 'Clearing…';
        const msg = await clearCache(lang);
        showStatus(msg, 'success');
        void refreshDbInfo();
      } catch (err) {
        showStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        btn.disabled  = false;
        btn.innerHTML = `${langFlagImgHtml(lang)} Clear ${escapeHtml(label)}`;
      }
    });
  });

  // Export CSV
  exportGroup.querySelectorAll<HTMLButtonElement>('.export-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const lang         = btn.dataset.lang ?? '';
      const originalHtml = btn.innerHTML;
      try {
        btn.disabled  = true;
        btn.innerHTML = 'Exporting…';
        await exportCsv(lang);
        showStatus(`Exported ${lang}.csv successfully`, 'success');
      } catch (err) {
        showStatus(`Export error: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        btn.disabled  = false;
        btn.innerHTML = originalHtml;
      }
    });
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initDbAdmin(): void {
  // Clear all caches
  const clearAllBtn = document.getElementById('clearAllCacheBtn') as HTMLButtonElement;
  clearAllBtn.addEventListener('click', async () => {
    try {
      clearAllBtn.disabled    = true;
      clearAllBtn.textContent = 'Clearing...';
      const msg = await clearCache();
      showStatus(msg, 'success');
      void refreshDbInfo();
    } catch (err) {
      showStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      clearAllBtn.disabled    = false;
      clearAllBtn.textContent = 'Clear All Caches';
    }
  });

  // Reload database (close + reopen from disk)
  const reloadBtn = document.getElementById('reloadDbBtn') as HTMLButtonElement;
  reloadBtn.addEventListener('click', async () => {
    try {
      reloadBtn.disabled    = true;
      reloadBtn.textContent = 'Reloading...';
      const msg = await reloadDb();
      showStatus(msg, 'success');
      void refreshDbInfo();
    } catch (err) {
      showStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      reloadBtn.disabled    = false;
      reloadBtn.textContent = 'Reload Database';
    }
  });

  void buildLangButtons();
  void refreshDbInfo();
}
