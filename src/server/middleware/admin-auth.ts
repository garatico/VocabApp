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
 *
 * Comparison is constant-time (both values are hashed to equal length, then
 * compared with crypto.timingSafeEqual) so the secret can't be guessed
 * byte-by-byte via response timing.
 */

import { createHash, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

function safeCompare(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env['ADMIN_SECRET'];

  // No secret configured → open (local dev only; admin routes are also
  // gated to NODE_ENV=development and localhost)
  if (!secret) {
    next();
    return;
  }

  const header = req.headers['authorization'] ?? '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!safeCompare(token, secret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
