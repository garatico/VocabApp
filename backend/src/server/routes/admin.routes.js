/**
 * admin.routes.js
 *
 * Thin router that gates all admin routes behind a development-mode check
 * and delegates to the sub-routers in routes/admin/.
 *
 * Route map:
 *   /vocab, /vocab/:word  →  admin/words.js
 *   /stats, /meta,
 *   /cache/clear,
 *   /db/reload            →  admin/db.js
 *   /export               →  admin/export.js
 */

import express      from 'express';
import wordRoutes   from './admin/words.js';
import dbRoutes     from './admin/db.js';
import exportRoutes from './admin/export.js';

const router = express.Router();

function isDevelopment(req, res, next) {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Admin panel only available in development mode' });
  }
  next();
}

router.use(isDevelopment);
router.use(wordRoutes);
router.use(dbRoutes);
router.use(exportRoutes);

export default router;
