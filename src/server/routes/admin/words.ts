/**
 * routes/admin/words.ts
 *
 * Word CRUD:
 *   GET  /vocab          — paginated word list
 *   GET  /vocab/:word    — single word
 *   POST /vocab/:word    — update single word
 *   POST /vocab          — batch update
 */

import { Router }                             from 'express';
import { getDb, clearCache, supportsDisambiguator, getWordColumnFlags, shapeDeps } from '../../lib/vocab-loader.js';
import { createBetterSqlite3Adapter }         from '../../lib/storage/better-sqlite3-adapter.js';
import { applyWordUpdate, type WordUpdateBody, type BatchUpdateItem, type ApplyWordUpdateDeps } from '../../../shared/vocab/write.js';
import { getWordPage, getWord }               from '../../../shared/vocab/queries.js';
import { validateLanguage }                   from './_utils.js';
import { logger }                             from '../../lib/logger.js';

const router = Router();

/** applyWordUpdate's deps, built fresh per request since supportsDisambiguator()
 *  reflects the live connection's schema and can change across a db reload. */
function wordUpdateDeps(): ApplyWordUpdateDeps {
  return { supportsDisambiguator: supportsDisambiguator(), onWarning: (msg) => logger.warn(msg) };
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// GET /vocab
router.get('/vocab', async (req, res) => {
  try {
    const lang   = validateLanguage(req.query['lang'] as string | undefined) || 'spanish';
    const adapter = createBetterSqlite3Adapter(getDb());

    const result = await getWordPage(adapter, {
      language: lang,
      search:   (req.query['search'] as string) || undefined,
      pos:      (req.query['pos']    as string) || undefined,
      band:     (req.query['band']   as string) || undefined,
      domain:   (req.query['domain'] as string) || undefined,
      page:     req.query['page']  ? parseInt(req.query['page']  as string) : undefined,
      limit:    req.query['limit'] ? parseInt(req.query['limit'] as string) : undefined,
    }, getWordColumnFlags(), shapeDeps);

    res.json({ success: true, language: lang, ...result });
  } catch (err) {
    logger.error('GET /admin/vocab:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /vocab/:word
router.get('/vocab/:word', async (req, res) => {
  try {
    const lang    = validateLanguage(req.query['lang'] as string | undefined) || 'spanish';
    const adapter = createBetterSqlite3Adapter(getDb());
    const word    = await getWord(adapter, lang, req.params['word'], getWordColumnFlags(), shapeDeps);
    if (!word) return res.status(404).json({ error: 'Word not found' });
    res.json({ success: true, word });
  } catch (err) {
    logger.error('GET /admin/vocab/:word:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /vocab/:word  — update a single word (PATCH semantics: only sent fields are written)
router.post('/vocab/:word', async (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage(req.query['lang'] as string | undefined) || 'spanish';
    const body = req.body as WordUpdateBody | null;

    if (!body || typeof body !== 'object')
      return res.status(400).json({ error: 'Body must be a JSON object' });

    const errors: string[] = [];
    if (body.glosses  !== undefined && !Array.isArray(body.glosses))  errors.push('glosses must be an array');
    if (body.examples !== undefined && !Array.isArray(body.examples)) errors.push('examples must be an array');
    if (body.domains  !== undefined && !Array.isArray(body.domains))  errors.push('domains must be an array');
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const wordRow = db.prepare('SELECT id FROM words WHERE word = ? AND language = ?')
      .get(req.params['word'], lang) as { id: number } | undefined;
    if (!wordRow) return res.status(404).json({ error: 'Word not found' });

    const wordId  = wordRow.id;
    const adapter = createBetterSqlite3Adapter(db);
    await adapter.transaction(tx => applyWordUpdate(tx, wordId, req.params['word'], body, wordUpdateDeps()));

    clearCache(lang);
    const updated = await getWord(adapter, lang, req.params['word'], getWordColumnFlags(), shapeDeps);
    res.json({ success: true, message: 'Word updated', word: updated });
  } catch (err) {
    logger.error('POST /admin/vocab/:word:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /vocab  — batch update (PATCH semantics: only sent fields are written per word)
router.post('/vocab', async (req, res) => {
  try {
    const db   = getDb();
    const lang = validateLanguage(req.query['lang'] as string | undefined) || 'spanish';
    const { updates } = req.body as { updates: BatchUpdateItem[] };

    if (!Array.isArray(updates))
      return res.status(400).json({ error: 'updates must be an array' });

    let updated = 0;
    const adapter = createBetterSqlite3Adapter(db);
    const deps    = wordUpdateDeps();

    await adapter.transaction(async tx => {
      for (const { word, data } of updates) {
        if (!word || !data) continue;
        const row = db.prepare('SELECT id FROM words WHERE word = ? AND language = ?').get(word, lang) as { id: number } | undefined;
        if (!row) continue;

        await applyWordUpdate(tx, row.id, word, data, deps);
        updated++;
      }
    });

    clearCache(lang);
    res.json({ success: true, message: `Updated ${updated} of ${updates.length} words`, updated });
  } catch (err) {
    logger.error('POST /admin/vocab (batch):', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
