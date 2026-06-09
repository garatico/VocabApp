/**
 * admin.routes.ts
 *
 * Thin router that gates all admin routes behind three checks:
 *   1. NODE_ENV must be 'development'
 *   2. Request must originate from localhost
 *   3. Bearer token must match ADMIN_SECRET (if set in env)
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

const router = express.Router();

function isDevelopment(_req: Request, res: Response, next: NextFunction): void {
  if (process.env['NODE_ENV'] !== 'development') {
    res.status(403).json({ error: 'Admin panel only available in development mode' });
    return;
  }
  next();
}

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

router.use(isDevelopment);
router.use(localhostOnly);
router.use(adminAuth);
router.use(wordRoutes);
router.use(dbRoutes);
router.use(exportRoutes);

export default router;
