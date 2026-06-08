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

  // Clear per-language cache
  document.querySelectorAll<HTMLButtonElement>('.clear-lang-cache-btn').forEach(btn => {
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
  document.querySelectorAll<HTMLButtonElement>('.export-btn').forEach(btn => {
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
