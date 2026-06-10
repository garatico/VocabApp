/**
 * CORS Middleware
 *
 * - Origins are parsed with `new URL()` and matched on exact hostname/origin —
 *   never substring checks (a substring check like `includes('localhost')`
 *   would match `http://localhost.evil.com`).
 * - `Access-Control-Allow-Credentials` is only sent when echoing a specific
 *   allowed origin, never alongside a wildcard.
 * - Requests without an Origin header are same-origin (or non-browser) and
 *   need no CORS headers at all.
 */

import { Request, Response, NextFunction } from 'express';

/** Exact origins allowed in production. Add the deployed URL here. */
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

/** Hostnames allowed in development (any port). */
const DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function originAllowed(rawOrigin: string): boolean {
  let url: URL;
  try {
    url = new URL(rawOrigin);
  } catch {
    return false; // malformed Origin header — deny
  }
  if (process.env.NODE_ENV === 'development') {
    return DEV_HOSTNAMES.has(url.hostname);
  }
  return ALLOWED_ORIGINS.has(url.origin);
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', [
      'Content-Type', 'Authorization', 'X-Requested-With',
      'X-Admin-Key', 'Accept', 'Origin',
    ].join(', '));
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
  } else {
    next();
  }
}

export default corsMiddleware;
