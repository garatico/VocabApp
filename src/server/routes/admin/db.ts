/**
 * routes/admin/db.ts
 *
 * Database management:
 *   GET  /stats        — per-language word counts and coverage
 *   GET  /meta         — available POS values, domains, CEFR bands
 *   POST /cache/clear  — invalidate the in-memory vocab cache (keeps DB connection open)
 *   POST /db/reload    — close + reopen DB from disk; use after replacing vocabulary.db
 */

import { Router }                                                  from 'express';
import { getDb, clearCache, reloadDb, getSupportedLanguages }      from '../../lib/vocab-loader.js';
import { logger }                                                  from '../../lib/logger.js';

const router = Router();

// GET /stats
router.get('/stats', (req, res) => {
  try {
    const db    = getDb();
    const stats: Record<string, unknown> = {};

    for (const lang of getSupportedLanguages()) {
      const total    = (db.prepare('SELECT COUNT(*) AS n FROM words WHERE language=?').get(lang) as { n: number }).n;
      const withIPA  = (db.prepare("SELECT COUNT(*) AS n FROM words WHERE language=? AND ipa IS NOT NULL AND ipa!=''").get(lang) as { n: number }).n;
      const withEx   = (db.prepare('SELECT COUNT(DISTINCT we.word_id) AS n FROM word_examples we JOIN words w ON we.word_id=w.id WHERE w.language=?').get(lang) as { n: number }).n;
      const withConj = (db.prepare(`
        SELECT COUNT(*) AS n FROM words WHERE language=?
          AND (conjugation_class IS NOT NULL
               OR (conjugations IS NOT NULL AND conjugations != ''))
      `).get(lang) as { n: number }).n;
      const withGender = (db.prepare("SELECT COUNT(*) AS n FROM words WHERE language=? AND gender IS NOT NULL AND gender!=''").get(lang) as { n: number }).n;

      const posRows = db.prepare("SELECT pos, COUNT(*) AS n FROM words WHERE language=? AND pos IS NOT NULL GROUP BY pos ORDER BY n DESC").all(lang) as { pos: string; n: number }[];
      const posBreakdown: Record<string, number> = Object.fromEntries(posRows.map(r => [r.pos, r.n]));

      const domainRows = db.prepare("SELECT domains FROM words WHERE language=? AND domains IS NOT NULL AND domains!='[]'").all(lang) as { domains: string }[];
      const domainCounts: Record<string, number> = {};
      for (const { domains } of domainRows) {
        try {
          const parsed = JSON.parse(domains) as string[];
          for (const d of parsed) {
            domainCounts[d] = (domainCounts[d] || 0) + 1;
          }
        } catch (_) { /* malformed JSON — skip */ }
      }
      const topDomains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([domain, count]) => ({ domain, count }));

      const nouns = posBreakdown['noun'] || 0;
      const verbs = posBreakdown['verb'] || 0;

      stats[lang] = {
        total,
        withExamples:     withEx,
        withIPA,
        withConjugations: withConj,
        withGender,
        posBreakdown,
        topDomains,
        coverage: {
          examples:     total ? Math.round((withEx      / total) * 100) : 0,
          ipa:          total ? Math.round((withIPA     / total) * 100) : 0,
          conjugations: verbs ? Math.round((withConj    / verbs) * 100) : 0,
          gender:       nouns ? Math.round((withGender  / nouns) * 100) : 0,
        },
      };
    }

    res.json({ success: true, stats });
  } catch (err) {
    logger.error('GET /admin/stats:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /meta
router.get('/meta', (_req, res) => {
  try {
    const db  = getDb();
    const pos = (db.prepare("SELECT DISTINCT pos FROM words WHERE pos IS NOT NULL ORDER BY pos")
      .all() as { pos: string }[]).map(r => r.pos);

    const domainRows = db.prepare("SELECT DISTINCT domains FROM words WHERE domains IS NOT NULL AND domains!='[]' AND domains!=''").all() as { domains: string }[];
    const domainSet  = new Set<string>();
    for (const r of domainRows) {
      try {
        (JSON.parse(r.domains) as string[]).forEach(d => domainSet.add(d));
      } catch (_) {
        logger.warn('GET /admin/meta: malformed domains JSON:', r.domains?.slice(0, 80));
      }
    }

    const bands = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    res.json({ success: true, pos, domains: [...domainSet].sort(), bands });
  } catch (err) {
    logger.error('GET /admin/meta:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /cache/clear
router.post('/cache/clear', (req, res) => {
  try {
    const lang = (req.body as { lang?: string } | undefined)?.lang || null;
    clearCache(lang ?? undefined);
    const msg = lang ? `Cache cleared for ${lang}` : 'All language caches cleared';
    logger.info('[admin]', msg);
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /db/reload
router.post('/db/reload', (_req, res) => {
  try {
    reloadDb();
    logger.info('[admin] DB connection reset — will reopen on next request');
    res.json({ success: true, message: 'DB connection reset. Cache cleared. Will reopen on next request.' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
