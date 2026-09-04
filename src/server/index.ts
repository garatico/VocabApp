/**
 * VocabApp Backend — server entry point
 *
 * Creates the Express app and starts listening.
 * App logic lives in src/server/app.ts so tests can import it without binding a port.
 */

// Must be the first import: ESM hoists and evaluates every static import
// before this module's own top-level statements run, so a plain
// `import dotenv from 'dotenv'; dotenv.config();` here would call config()
// *after* './app.js' (and its transitive import of lib/paths.ts) already
// read DATA_DIR — too late, since paths.ts computes it once, at import time.
// `dotenv/config` runs its side effect during its own module evaluation, so
// declaring it first guarantees it runs before any other import.
import 'dotenv/config';

import { createApp }                          from './app.js';
import { preloadAll, closeDatabase }          from './lib/vocab-loader.js';
import { ensureSvgDirs }                      from './lib/svg-loader.js';
import { logger }                             from './lib/logger.js';

const PORT     = process.env['PORT'] || process.env['API_PORT'] || 3000;
const NODE_ENV = process.env['NODE_ENV'] || 'development';

const app    = createApp({ nodeEnv: NODE_ENV });
const server = app.listen(PORT, async () => {
  logger.info(`
╔════════════════════════════════════════════════════════════╗
║                     VocabApp Backend                       ║
║                   SQLite Edition                           ║
╚════════════════════════════════════════════════════════════╝

  Server:  http://localhost:${PORT}
  Env:     ${NODE_ENV}
  DB:      SQLite (vocabulary.db)

  Endpoints:
  ├─ GET  http://localhost:${PORT}/               → Vocab Practice App
  ├─ GET  http://localhost:${PORT}/admin          → Admin Panel
  └─ GET  http://localhost:${PORT}/api/vocab/:lang → Vocabulary API

  `);

  try {
    ensureSvgDirs();
    logger.info('✅ SVG directories ready');

    await preloadAll();
    logger.info('✅ All vocabularies loaded from SQLite');
  } catch (error) {
    logger.error('\n⚠️  Warning: Could not pre-load vocabularies:', (error as Error).message);
    logger.error('App will still start; vocabulary loads on first request.');
  }
});

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  server.close(() => { closeDatabase(); process.exit(0); });
});

process.on('SIGINT', () => {
  logger.info('\nShutting down...');
  server.close(() => { closeDatabase(); process.exit(0); });
});
