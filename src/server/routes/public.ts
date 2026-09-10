/**
 * Public API Routes
 *
 * GET /api/vocab/:language       — serve vocabulary
 * GET /api/trivia/:language      — serve trivia questions
 * GET /api/guess-blank/:language — serve Guess the Blank questions
 * GET /api/languages             — languages with rows in the database
 * GET /api/health                — health check
 */

import { Router }          from 'express';
import { loadVocabFile, getSupportedLanguages } from '../lib/vocab-loader.js';
import { loadTriviaQuestions, loadGuessBlankQuestions } from '../lib/content-loader.js';

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

  // GET /api/trivia/:language
  //
  // Same envelope/cache-control shape as /api/vocab/:language above. The
  // underlying table is optional (see content-loader.ts) — a language, or a
  // whole database, with no trivia rows yet returns `data: []`, not an error.
  router.get('/trivia/:language', (req, res, next) => {
    try {
      const language = req.params['language'].toLowerCase();
      const data = loadTriviaQuestions(language);

      res.set('Cache-Control', `public, max-age=${vocabMaxAge}`);

      res.json({ success: true, language, count: data.length, data });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/guess-blank/:language
  //
  // Same shape as /api/trivia/:language above, for the guess_blank_questions
  // table.
  router.get('/guess-blank/:language', (req, res, next) => {
    try {
      const language = req.params['language'].toLowerCase();
      const data = loadGuessBlankQuestions(language);

      res.set('Cache-Control', `public, max-age=${vocabMaxAge}`);

      res.json({ success: true, language, count: data.length, data });
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
