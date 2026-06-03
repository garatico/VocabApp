/**
 * app.js
 *
 * Express application factory — no server.listen() here.
 * Imported by index.js (production) and by tests.
 */

import express     from 'express';
import path        from 'path';
import compression from 'compression';
import { fileURLToPath } from 'url';

import publicRoutes  from './routes/public.js';
import adminRoutes   from './routes/admin.routes.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler }  from './middleware/error-handler.js';

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const projectRoot  = path.join(__dirname, '../..');

export function createApp({ nodeEnv = process.env.NODE_ENV || 'development' } = {}) {
  const app = express();

  app.use(compression());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(corsMiddleware);

  // Request logging — skip in test to keep output clean
  if (nodeEnv === 'development') {
    app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  // Public API
  app.use('/api', publicRoutes);

  // Admin API (always mounted — guard is NODE_ENV check inside the route file)
  app.use('/api/admin', adminRoutes);

  // SVG files from data/svgs/ (one level above backend/)
  app.use('/svgs', express.static(path.join(projectRoot, '..', 'data', 'svgs')));

  // OpenMoji emoji SVGs — organised into domain subfolders (data/emoji/animals/, etc.)
  // Each subfolder is mounted at /emoji so existing URLs like /emoji/1F401.svg still work.
  for (const domain of ['animals']) {
    app.use('/emoji', express.static(path.join(projectRoot, '..', 'data', 'emoji', domain)));
  }

  // Wikipedia photos — organised into domain subfolders (data/images/animals/, food/, nature/)
  // Each subfolder is mounted at /images so existing URLs like /images/ant.jpg still work.
  for (const domain of ['animals', 'food', 'nature']) {
    app.use('/images', express.static(path.join(projectRoot, '..', 'data', 'images', domain)));
  }

  // Static files + SPA fallback (skip in test — we only need the API)
  if (nodeEnv !== 'test') {
    if (nodeEnv === 'production') {
      // Serve Vite build output; index.html is inside dist/
      app.use(express.static(path.join(projectRoot, 'dist')));
      app.get('*', (_req, res) => res.sendFile(path.join(projectRoot, 'dist', 'index.html')));
    } else {
      // Dev: Vite handles the JS/TS; Express just serves public/ assets
      app.use(express.static(path.join(projectRoot, 'public')));
      app.get('/admin', (_req, res) => res.sendFile(path.join(projectRoot, 'public', 'admin.html')));
      app.get('*', (_req, res) => res.sendFile(path.join(projectRoot, 'index.html')));
    }
  }

  app.use(errorHandler);

  return app;
}
