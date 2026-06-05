/**
 * Public API Routes
 *
 * GET /api/vocab/:language  — serve vocabulary
 * GET /api/health           — health check
 */

import { Router } from 'express';
import { loadVocabFile } from '../lib/vocab-loader.js';

const router = Router();

// GET /api/vocab/:language
router.get('/vocab/:language', (req, res, next) => {
  try {
    // loadVocabFile normalises + validates the language; throws 404 for unknowns
    const vocab = loadVocabFile(req.params.language);

    // Cache vocab responses — data only changes on admin word edits
    const maxAge = process.env.NODE_ENV === 'production' ? 3600 : 300;
    res.set('Cache-Control', `public, max-age=${maxAge}`);

    res.json({
      success:  true,
      language: vocab.language,
      count:    vocab.words.length,
      metadata: { timestamp: new Date().toISOString(), cacheAge: vocab.cacheAge || 0 },  // cacheAge in ms
      data:     vocab.words,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/health
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

export default router;
