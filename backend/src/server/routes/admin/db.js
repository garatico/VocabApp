/**
 * routes/admin/db.js
 *
 * Database management:
 *   GET  /stats        — per-language word counts and coverage
 *   GET  /meta         — available POS values, domains, CEFR bands
 *   POST /cache/clear  — invalidate the in-memory vocab cache (keeps DB connection open)
 *   POST /db/reload    — close + reopen DB from disk; use after replacing vocabulary.db
 */

import { Router }                      from 'express';
import { getDb, clearCache, reloadDb } from '../../lib/vocab-loader.js';
import { SUPPORTED_LANGUAGES }         from './_utils.js';

const router = Router();

// GET /stats
router.get('/stats', (req, res) => {
  try {
    const db    = getDb();
    const stats = {};

    for (const lang of SUPPORTED_LANGUAGES) {
      const total   = db.prepare('SELECT COUNT(*) AS n FROM words WHERE language=?').get(lang).n;
      const withIPA = db.prepare("SELECT COUNT(*) AS n FROM words WHERE language=? AND ipa IS NOT NULL AND ipa!=''").get(lang).n;
      const withEx  = db.prepare('SELECT COUNT(DISTINCT we.word_id) AS n FROM word_examples we JOIN words w ON we.word_id=w.id WHERE w.language=?').get(lang).n;
      const verbs   = db.prepare("SELECT COUNT(*) AS n FROM words WHERE language=? AND pos='verb'").get(lang).n;
      const nouns   = db.prepare("SELECT COUNT(*) AS n FROM words WHERE language=? AND pos='noun'").get(lang).n;
      const adjs    = db.prepare("SELECT COUNT(*) AS n FROM words WHERE language=? AND pos='adjective'").get(lang).n;

      stats[lang] = {
        total, withExamples: withEx, withIPA,
        verbs, nouns, adjectives: adjs,
        coverage: {
          examples: total ? Math.round((withEx  / total) * 100) : 0,
          ipa:      total ? Math.round((withIPA / total) * 100) : 0,
        },
      };
    }

    res.json({ success: true, stats });
  } catch (err) {
    console.error('GET /admin/stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /meta
router.get('/meta', (req, res) => {
  try {
    const db  = getDb();
    const pos = db.prepare("SELECT DISTINCT pos FROM words WHERE pos IS NOT NULL ORDER BY pos")
      .all().map(r => r.pos);

    const domainRows = db.prepare("SELECT DISTINCT domains FROM words WHERE domains IS NOT NULL AND domains!='[]' AND domains!=''").all();
    const domainSet  = new Set();
    for (const r of domainRows) {
      try { JSON.parse(r.domains).forEach(d => domainSet.add(d)); } catch (e) {
        console.warn('GET /admin/meta: malformed domains JSON:', r.domains?.slice(0, 80));
      }
    }

    const bands = db.prepare("SELECT DISTINCT band FROM words WHERE band IS NOT NULL ORDER BY band")
      .all().map(r => r.band);

    res.json({ success: true, pos, domains: [...domainSet].sort(), bands });
  } catch (err) {
    console.error('GET /admin/meta:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /cache/clear — clears in-memory vocab cache only; DB connection stays open
router.post('/cache/clear', (req, res) => {
  try {
    const lang = req.body?.lang || null;
    clearCache(lang);
    const msg = lang ? `Cache cleared for ${lang}` : 'All language caches cleared';
    console.log('[admin]', msg);
    res.json({ success: true, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /db/reload — closes and reopens the DB connection from disk.
// Call this after replacing vocabulary.db (e.g. after running sync_db.py).
router.post('/db/reload', (req, res) => {
  try {
    reloadDb();
    console.log('[admin] DB connection reset — will reopen on next request');
    res.json({ success: true, message: 'DB connection reset. Cache cleared. Next request will reopen vocabulary.db from disk.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
