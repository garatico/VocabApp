/**
 * VocabApp Backend — server entry point
 *
 * Creates the Express app and starts listening.
 * App logic lives in src/app.js so tests can import it without binding a port.
 */

import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app.js';
import { preloadAll, closeDatabase } from './lib/vocab-loader.js';
import { ensureSvgDirs } from './lib/svg-loader.js';

const PORT     = process.env.API_PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const app    = createApp({ nodeEnv: NODE_ENV });
const server = app.listen(PORT, async () => {
  console.log(`
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
    console.log('✅ SVG directories ready');

    await preloadAll();
    console.log('✅ All vocabularies loaded from SQLite');
  } catch (error) {
    console.error('\n⚠️  Warning: Could not pre-load vocabularies:', error.message);
    console.error('App will still start; vocabulary loads on first request.');
  }
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => { closeDatabase(); process.exit(0); });
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close(() => { closeDatabase(); process.exit(0); });
});
