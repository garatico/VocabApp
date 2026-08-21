/**
 * Public API Routes
 *
 * GET /api/vocab/:language  — serve vocabulary
 * GET /api/languages        — languages with rows in the database
 * GET /api/health           — health check
 */

import { Router }          from 'express';
import { loadVocabFile, getSupportedLanguages } from '../lib/vocab-loader.js';

export function makePublicRoutes(nodeEnv: string): Router {
  const router = Router();

  // Long in production, short in development so a pipeline re-sync shows up
  // without hunting for the reload button. Decided once, from the environment
  // the app was built with, rather than re-read per request.
  const vocabMaxAge = nodeEnv === 'production' ? 3600 : 300;

  // GET /api/vocab/:language
  router.get('/vocab/:language', (req, res, next) => {
    try {
      const vocab = loadVocabFile(req.params['language']);

      res.set('Cache-Control', `public, max-age=${vocabMaxAge}`);

      res.json({
        success:  true,
        language: vocab.language,
        count:    vocab.words.length,
        metadata: { timestamp: new Date().toISOString(), cacheAge: vocab.cacheAge || 0 },
        data:     vocab.words,
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/languages
  //
  // Which languages actually have rows in the database. The client offers a
  // fixed list (data/languages.ts) but a language only becomes usable once the
  // pipeline has mined and synced it, so this is what lets the dropdown say
  // "German — no data yet" instead of failing on selection.
  router.get('/languages', (_req, res, next) => {
    try {
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ success: true, languages: getSupportedLanguages() });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/health
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
  });

  return router;
}
