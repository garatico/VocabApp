/**
 * admin.routes.ts
 *
 * Thin router that gates all admin routes behind three checks:
 *   1. The app's environment must be 'development'
 *   2. Request must originate from localhost
 *   3. Bearer token must match ADMIN_SECRET (if set in env)
 *
 * Check 1 reads the environment `createApp` was given. It used to read
 * `process.env.NODE_ENV` directly, which is why the test helper had to set
 * that variable to 'development' while telling `createApp` it was 'test' —
 * one app claiming to be in two environments at once.
 *
 * Route map:
 *   /vocab, /vocab/:word  →  admin/words.ts
 *   /stats, /meta,
 *   /cache/clear,
 *   /db/reload            →  admin/db.ts
 *   /export               →  admin/export.ts
 */

import express, { Request, Response, NextFunction } from 'express';
import wordRoutes   from './admin/words.js';
import dbRoutes     from './admin/db.js';
import exportRoutes from './admin/export.js';
import { adminAuth } from '../middleware/admin-auth.js';

function localhostOnly(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket.remoteAddress ?? '';
  // Accept IPv4 loopback, IPv6 loopback, and IPv4-mapped IPv6 loopback
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!isLocal) {
    res.status(403).json({ error: 'Admin panel only accessible from localhost' });
    return;
  }
  next();
}

export function makeAdminRoutes(nodeEnv: string): express.Router {
  const router = express.Router();

  function developmentOnly(_req: Request, res: Response, next: NextFunction): void {
    if (nodeEnv !== 'development') {
      res.status(403).json({ error: 'Admin panel only available in development mode' });
      return;
    }
    next();
  }

  router.use(developmentOnly);
  router.use(localhostOnly);
  router.use(adminAuth);
  router.use(wordRoutes);
  router.use(dbRoutes);
  router.use(exportRoutes);

  return router;
}
