/**
 * Admin authentication middleware
 *
 * Checks the Authorization: Bearer <token> header against ADMIN_SECRET.
 *
 * If ADMIN_SECRET is not set in the environment, the middleware passes through
 * (dev-machine convenience — no secret needed for purely local use).
 *
 * To enable auth, add to .env:
 *   ADMIN_SECRET=<any-random-string>
 *
 * Then every admin request must include:
 *   Authorization: Bearer <your-secret>
 */

import type { Request, Response, NextFunction } from 'express';

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env['ADMIN_SECRET'];

  // No secret configured → open (local dev only)
  if (!secret) {
    next();
    return;
  }

  const header = req.headers['authorization'] ?? '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (token !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
