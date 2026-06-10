/**
 * Rate limiting middleware
 *
 * Applied to the public vocab endpoint to prevent scripted abuse.
 * Intentionally generous — the quiz app makes 1–2 requests per session
 * and caches the response, so normal usage never comes close to the limit.
 */

import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';

/** 120 requests / minute per IP on /api/vocab/:lang */
export const vocabRateLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             120,
  standardHeaders: true,   // Return rate limit info in RateLimit-* headers
  legacyHeaders:   false,
  message:         { error: 'Too many requests — please slow down.' },
  skip: (_req: Request) => {
    // Never rate-limit in test or development — keeps tests fast and dev friction-free
    return process.env['NODE_ENV'] !== 'production';
  },
} satisfies Partial<Options>);
