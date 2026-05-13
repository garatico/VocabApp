/**
 * VocabApp Backend
 *
 * Lightweight Express server serving vocabulary API and admin tools
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.routes.js';

// Import middleware
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';

// Import vocab loader
import { preloadAll, closeDatabase } from './lib/vocab-loader.js';

// Get __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Configuration
const PORT = process.env.API_PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(corsMiddleware);

// Request logging middleware (development only)
if (NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// API Routes
app.use('/api', publicRoutes);

// Admin API Routes (development only)
if (NODE_ENV === 'development') {
  app.use('/api/admin', adminRoutes);
}

// Serve static files (vocab-practice SPA)
app.use(express.static(path.join(projectRoot, 'public')));

// Admin panel (development mode)
if (NODE_ENV === 'development') {
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(projectRoot, 'public', 'admin.html'));
  });
}

// Admin tools routes (placeholder for Phase 7)
app.get('/admin/corpus-builder', (req, res) => {
  res.sendFile(path.join(projectRoot, 'admin', 'corpus-builder', 'index.html'));
});

app.get('/admin/data-processor', (req, res) => {
  res.sendFile(path.join(projectRoot, 'admin', 'data-processor', 'index.html'));
});

// Serve admin tool assets
app.use('/admin/corpus-builder', express.static(path.join(projectRoot, 'admin', 'corpus-builder')));
app.use('/admin/data-processor', express.static(path.join(projectRoot, 'admin', 'data-processor')));

// SPA fallback - serve index.html for all routes not matched above
app.get('*', (req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'index.html'));
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
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
  ├─ GET  http://localhost:${PORT}/                      → Vocab Practice App
  ├─ GET  http://localhost:${PORT}/admin                 → Admin Panel
  ├─ GET  http://localhost:${PORT}/api/vocab/:lang       → Vocabulary API
  ├─ GET  http://localhost:${PORT}/admin/corpus-builder  → Corpus Builder
  └─ GET  http://localhost:${PORT}/admin/data-processor  → Data Processor

  `);

  // Pre-load all vocabularies from SQLite database
  try {
    await preloadAll();
    console.log('\n✅ All vocabularies loaded from SQLite');
  } catch (error) {
    console.error('\n⚠️  Warning: Could not pre-load vocabularies:', error.message);
    console.error('App will still start; vocabulary loads on first request.');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => { closeDatabase(); process.exit(0); });
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close(() => { closeDatabase(); process.exit(0); });
});
