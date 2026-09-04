/**
 * admin-db.ts
 *
 * DB Admin tab — cache management and CSV export.
 */

import { apiCall, escapeHtml } from './admin-api.js';

// ── Local status bar (targets #dbStatus, not the editor's #statusMessage) ─────

function showDbStatus(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const el = document.getElementById('dbStatus');
  if (!el) return;
  el.innerHTML = `<div class="status ${type}">${escapeHtml(message)}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, type === 'error' ? 5000 : 3000);
}

// ── Cache clear ───────────────────────────────────────────────────────────────

async function clearCache(lang: string | null = null): Promise<string> {
  const { message } = await apiCall('/cache/clear', 'POST', lang ? { lang } : {});
  return message as string;
}

// ── DB reload ─────────────────────────────────────────────────────────────────

async function reloadDb(): Promise<string> {
  const { message } = await apiCall('/db/reload', 'POST', {});
  return message as string;
}

// ── CSV export ────────────────────────────────────────────────────────────────

async function exportCsv(lang: string): Promise<void> {
  const response = await fetch('/api/admin/export', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ lang }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((err as { error: string }).error || response.statusText);
  }

  const csv  = await response.text();
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
    const meta = await apiCall('/meta') as { languages?: string[] };
    if (meta.languages?.length) languages = meta.languages;
  } catch { /* fall back to the default list above */ }

  clearGroup.innerHTML = languages.map(lang => {
    const label = lang.charAt(0).toUpperCase() + lang.slice(1);
    return `<button class="secondary clear-lang-cache-btn" data-lang="${escapeHtml(lang)}">Clear ${escapeHtml(label)}</button>`;
  }).join('');

  exportGroup.innerHTML = languages.map(lang => {
    const label = lang.charAt(0).toUpperCase() + lang.slice(1);
    return `<button class="secondary export-btn" data-lang="${escapeHtml(lang)}">↓ ${escapeHtml(label)}</button>`;
  }).join('');

  // Clear per-language cache
  clearGroup.querySelectorAll<HTMLButtonElement>('.clear-lang-cache-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const lang  = btn.dataset.lang ?? '';
      const label = lang.charAt(0).toUpperCase() + lang.slice(1);
      try {
        btn.disabled    = true;
        btn.textContent = 'Clearing...';
        const msg = await clearCache(lang);
        showDbStatus(msg, 'success');
      } catch (err) {
        showDbStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        btn.disabled    = false;
        btn.textContent = `Clear ${label}`;
      }
    });
  });

  // Export CSV
  exportGroup.querySelectorAll<HTMLButtonElement>('.export-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const lang         = btn.dataset.lang ?? '';
      const originalText = btn.textContent ?? '';
      try {
        btn.disabled    = true;
        btn.textContent = 'Exporting...';
        await exportCsv(lang);
        showDbStatus(`Exported ${lang}.csv successfully`, 'success');
      } catch (err) {
        showDbStatus(`Export error: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        btn.disabled    = false;
        btn.textContent = originalText;
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
      showDbStatus(msg, 'success');
    } catch (err) {
      showDbStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
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
      showDbStatus(msg, 'success');
    } catch (err) {
      showDbStatus(`Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      reloadBtn.disabled    = false;
      reloadBtn.textContent = 'Reload Database';
    }
  });

  void buildLangButtons();
}
