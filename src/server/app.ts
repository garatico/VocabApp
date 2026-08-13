/**
 * app.ts
 *
 * Express application factory — no server.listen() here.
 * Imported by index.ts (production) and by tests.
 */

import express          from 'express';
import fs               from 'fs';
import path             from 'path';
import compression      from 'compression';
import helmet           from 'helmet';
import { fileURLToPath } from 'url';

import publicRoutes         from './routes/public.js';
import adminRoutes          from './routes/admin.routes.js';
import { corsMiddleware }       from './middleware/cors.js';
import { dataDir }              from './lib/paths.js';
import { vocabRateLimiter }    from './middleware/rate-limit.js';
import { errorHandler }     from './middleware/error-handler.js';
import { logger }           from './lib/logger.js';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const projectRoot = path.join(__dirname, '../..');

/** Return immediate subdirectory names under `dir`, or [] if it doesn't exist. */
function subDirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return [];
  }
}

export interface AppOptions {
  nodeEnv?: string;
}

export function createApp({ nodeEnv = process.env['NODE_ENV'] || 'development' }: AppOptions = {}) {
  const app = express();

  // Behind Render's proxy in production: trust the first X-Forwarded-For hop
  // so req.ip is the real client IP (rate limiting, localhost checks).
  if (nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }

  // Security headers. CSP is off for now — the SPA/admin HTML would need an
  // audit for inline scripts/styles before enabling it.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(corsMiddleware);

  if (nodeEnv === 'development') {
    app.use((_req, _res, next) => {
      logger.debug(`[${new Date().toISOString()}] ${_req.method} ${_req.path}`);
      next();
    });
  }

  app.use('/api/vocab', vocabRateLimiter);
  app.use('/api', publicRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/svgs', express.static(path.join(dataDir, 'svgs')));

  const dataRoot = dataDir;
  for (const domain of subDirs(path.join(dataRoot, 'emoji'))) {
    app.use('/emoji', express.static(path.join(dataRoot, 'emoji', domain)));
  }
  for (const domain of subDirs(path.join(dataRoot, 'images'))) {
    app.use('/images', express.static(path.join(dataRoot, 'images', domain)));
  }

  if (nodeEnv !== 'test') {
    if (nodeEnv === 'production') {
      app.use(express.static(path.join(projectRoot, 'dist')));
      app.get('/admin', (_req, res) => res.sendFile(path.join(projectRoot, 'dist', 'admin.html')));
      app.get('*', (_req, res) => res.sendFile(path.join(projectRoot, 'dist', 'index.html')));
    } else {
      app.use(express.static(path.join(projectRoot, 'public')));
      app.get('*', (_req, res) => res.sendFile(path.join(projectRoot, 'index.html')));
    }
  }

  app.use(errorHandler);

  return app;
}
