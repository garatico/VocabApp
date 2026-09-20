import type { StorageAdapter } from '../storage/types.js';

/**
 * stats.ts — the per-language coverage metrics behind the admin Statistics
 * tab, ported off a synchronous better-sqlite3 connection onto StorageAdapter
 * so Tauri's local SQLite copy can compute the same numbers. Logic unchanged
 * from src/server/routes/admin/db.ts's GET /stats (lines 19-77).
 */

export interface DomainEntry { domain: string; count: number; }

export interface LangStat {
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

async function computeOne(adapter: StorageAdapter, lang: string): Promise<LangStat> {
  const total    = (await adapter.get<{ n: number }>('SELECT COUNT(*) AS n FROM words WHERE language=?', [lang]))?.n ?? 0;
  const withIPA  = (await adapter.get<{ n: number }>("SELECT COUNT(*) AS n FROM words WHERE language=? AND ipa IS NOT NULL AND ipa!=''", [lang]))?.n ?? 0;
  const withEx   = (await adapter.get<{ n: number }>('SELECT COUNT(DISTINCT we.word_id) AS n FROM word_examples we JOIN words w ON we.word_id=w.id WHERE w.language=?', [lang]))?.n ?? 0;
  const withConj = (await adapter.get<{ n: number }>(`
    SELECT COUNT(*) AS n FROM words WHERE language=?
      AND (conjugation_class IS NOT NULL
           OR (conjugations IS NOT NULL AND conjugations != ''))
  `, [lang]))?.n ?? 0;
  const withGender = (await adapter.get<{ n: number }>("SELECT COUNT(*) AS n FROM words WHERE language=? AND gender IS NOT NULL AND gender!=''", [lang]))?.n ?? 0;

  const posRows = await adapter.all<{ pos: string; n: number }>(
    'SELECT pos, COUNT(*) AS n FROM words WHERE language=? AND pos IS NOT NULL GROUP BY pos ORDER BY n DESC', [lang]
  );
  const posBreakdown: Record<string, number> = Object.fromEntries(posRows.map(r => [r.pos, r.n]));

  const domainRows = await adapter.all<{ domains: string }>(
    "SELECT domains FROM words WHERE language=? AND domains IS NOT NULL AND domains!='[]'", [lang]
  );
  const domainCounts: Record<string, number> = {};
  for (const { domains } of domainRows) {
    try {
      const parsed = JSON.parse(domains) as string[];
      for (const d of parsed) domainCounts[d] = (domainCounts[d] || 0) + 1;
    } catch { /* malformed JSON — skip */ }
  }
  const topDomains = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => ({ domain, count }));

  const nouns = posBreakdown['noun'] || 0;
  const verbs = posBreakdown['verb'] || 0;

  return {
    total,
    withExamples:     withEx,
    withIPA,
    withConjugations: withConj,
    withGender,
    posBreakdown,
    topDomains,
    coverage: {
      examples:     total ? Math.round((withEx     / total) * 100) : 0,
      ipa:          total ? Math.round((withIPA    / total) * 100) : 0,
      conjugations: verbs ? Math.round((withConj   / verbs) * 100) : 0,
      gender:       nouns ? Math.round((withGender / nouns) * 100) : 0,
    },
  };
}

export async function computeStats(adapter: StorageAdapter, languages: string[]): Promise<Record<string, LangStat>> {
  const stats: Record<string, LangStat> = {};
  for (const lang of languages) {
    stats[lang] = await computeOne(adapter, lang);
  }
  return stats;
}
