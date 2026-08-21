/**
 * app.ts
 *
 * Express application factory — no server.listen() here.
 * Imported by index.ts (production) and by tests.
 *
 * `nodeEnv` is authoritative. Everything environment-dependent — CORS, rate
 * limiting, error detail, cache lifetimes, the admin gate — is built from the
 * value passed here and nothing re-reads `process.env.NODE_ENV` behind its
 * back. Before, five collaborators did exactly that, so `createApp({ nodeEnv })`
 * described only the parts of the app that happened to be listening.
 */

import express          from 'express';
import path             from 'path';
import compression      from 'compression';
import helmet           from 'helmet';
import { fileURLToPath } from 'url';

import { makePublicRoutes }     from './routes/public.js';
import { makeAdminRoutes }      from './routes/admin.routes.js';
import { makeCorsMiddleware }   from './middleware/cors.js';
import { dataDir }              from './lib/paths.js';
import { makeVocabRateLimiter } from './middleware/rate-limit.js';
import { makeErrorHandler }     from './middleware/error-handler.js';
import { flatStatic }           from './lib/flat-static.js';
import { logger }               from './lib/logger.js';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const projectRoot = path.join(__dirname, '../..');

export interface AppOptions {
  /** 'development' | 'test' | 'production'. Defaults to NODE_ENV. */
  nodeEnv?: string;
  /**
   * Serve the built SPA and its catch-all route.
   *
   * Off under test, where a catch-all would swallow 404 assertions. Separate
   * from `nodeEnv` on purpose: a test app is a *development* app that doesn't
   * serve static files, and conflating the two is what forced the test helper
   * to lie about the environment to reach the admin routes.
   */
  serveStatic?: boolean;
}

export function createApp({
  nodeEnv = process.env['NODE_ENV'] || 'development',
  serveStatic = nodeEnv !== 'test',
}: AppOptions = {}) {
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
  app.use(makeCorsMiddleware(nodeEnv));

  if (nodeEnv === 'development') {
    app.use((req, _res, next) => {
      logger.debug(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  app.use('/api/vocab', makeVocabRateLimiter(nodeEnv));
  app.use('/api', makePublicRoutes(nodeEnv));
  app.use('/api/admin', makeAdminRoutes(nodeEnv));

  app.use('/svgs', express.static(path.join(dataDir, 'svgs')));

  // Domain-partitioned on disk, flat in the URL space — see flat-static.ts for
  // why this is not a stack of express.static mounts.
  app.use('/emoji',  flatStatic(path.join(dataDir, 'emoji')));
  app.use('/images', flatStatic(path.join(dataDir, 'images')));

  if (serveStatic) {
    if (nodeEnv === 'production') {
      app.use(express.static(path.join(projectRoot, 'dist')));
      app.get('/admin', (_req, res) => res.sendFile(path.join(projectRoot, 'dist', 'admin.html')));
      app.get('*', (_req, res) => res.sendFile(path.join(projectRoot, 'dist', 'index.html')));
    } else {
      app.use(express.static(path.join(projectRoot, 'public')));
      app.get('*', (_req, res) => res.sendFile(path.join(projectRoot, 'index.html')));
    }
  }

  app.use(makeErrorHandler(nodeEnv));

  return app;
}
