/**
 * admin.routes.ts
 *
 * Thin router that gates all admin routes behind a development-mode check
 * and delegates to the sub-routers in routes/admin/.
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

const router = express.Router();

function isDevelopment(req: Request, res: Response, next: NextFunction): void {
  if (process.env['NODE_ENV'] !== 'development') {
    res.status(403).json({ error: 'Admin panel only available in development mode' });
    return;
  }
  next();
}

router.use(isDevelopment);
router.use(wordRoutes);
router.use(dbRoutes);
router.use(exportRoutes);

export default router;
