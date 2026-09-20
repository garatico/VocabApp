/**
 * admin-data-client.ts — how admin modules reach the vocabulary data,
 * without caring whether that's a live Express API (web/dev) or Tauri's
 * local SQLite copy (packaged desktop).
 *
 * admin.ts picks the implementation once at startup (initAdminDataClient)
 * based on isPackagedApp() + whether Tauri's local db actually came up —
 * see its own hasReachableBackend/canRunAdminHere gate — and every other
 * admin module calls getAdminDataClient() rather than apiCall directly.
 */
import { apiCall } from './admin-api.js';
import type { Word } from '../../shared/types.js';
import type { WordUpdateBody, BatchUpdateItem } from '../../shared/vocab/write.js';
import type { LangStat } from '../../shared/vocab/stats.js';

export interface AdminMeta {
  pos:       string[];
  domains:   string[];
  languages?: string[];
  disambiguatorSupported?: boolean;
}

export interface AdminVocabPageParams {
  lang:    string;
  limit?:  number;
  page?:   number;
  search?: string;
  pos?:    string;
  band?:   string;
  domain?: string;
}

export interface AdminVocabPage {
  words: Word[];
  total: number;
  page:  number;
  pages: number;
}

export interface AdminDataClient {
  getMeta(): Promise<AdminMeta>;
  getVocabPage(params: AdminVocabPageParams): Promise<AdminVocabPage>;
  updateWord(word: string, lang: string, data: WordUpdateBody): Promise<{ word: Word }>;
  batchUpdate(lang: string, updates: BatchUpdateItem[]): Promise<{ updated: number }>;
  getStats(): Promise<Record<string, LangStat>>;
  /** No-op on Tauri — there's no separate in-memory cache to clear when every read queries SQLite directly. */
  clearCache(lang?: string): Promise<string>;
  /** No-op on Tauri, for the same reason as clearCache. */
  reloadDb(): Promise<string>;
  /** Returns the CSV text; callers handle the Blob/download themselves (same either way). */
  exportCsv(lang: string): Promise<string>;
}

const httpAdminDataClient: AdminDataClient = {
  async getMeta() {
    return apiCall('/meta') as Promise<AdminMeta>;
  },

  async getVocabPage(params) {
    const qs = new URLSearchParams();
    qs.set('lang', params.lang);
    qs.set('limit', String(params.limit ?? 100));
    if (params.page)   qs.set('page',   String(params.page));
    if (params.search) qs.set('search', params.search);
    if (params.pos)    qs.set('pos',    params.pos);
    if (params.band)   qs.set('band',   params.band);
    if (params.domain) qs.set('domain', params.domain);
    return apiCall('/vocab?' + qs.toString()) as Promise<AdminVocabPage>;
  },

  async updateWord(word, lang, data) {
    return apiCall(`/vocab/${encodeURIComponent(word)}?lang=${encodeURIComponent(lang)}`, 'POST', data) as Promise<{ word: Word }>;
  },

  async batchUpdate(lang, updates) {
    return apiCall(`/vocab?lang=${encodeURIComponent(lang)}`, 'POST', { updates }) as Promise<{ updated: number }>;
  },

  async getStats() {
    const { stats } = await apiCall('/stats') as { stats: Record<string, LangStat> };
    return stats;
  },

  async clearCache(lang) {
    const { message } = await apiCall('/cache/clear', 'POST', lang ? { lang } : {});
    return message as string;
  },

  async reloadDb() {
    const { message } = await apiCall('/db/reload', 'POST', {});
    return message as string;
  },

  async exportCsv(lang) {
    const response = await fetch('/api/admin/export', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ lang }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((err as { error: string }).error || response.statusText);
    }
    return response.text();
  },
};

let client: AdminDataClient = httpAdminDataClient;

/**
 * Call once at admin startup, before any module calls getAdminDataClient().
 * Which implementation to use is admin.ts's decision (selectAdminDataSource),
 * not re-derived here — a real backend is preferred whenever one is
 * reachable, packaged app or not, so this only takes the already-made
 * decision rather than checking isPackagedApp() a second time and risking
 * disagreeing with it.
 */
export async function initAdminDataClient(useTauriSql: boolean): Promise<void> {
  if (useTauriSql) {
    const { createTauriAdminDataClient } = await import('../tauri/admin-data-client.js');
    client = await createTauriAdminDataClient();
  } else {
    client = httpAdminDataClient;
  }
}

export function getAdminDataClient(): AdminDataClient {
  return client;
}
