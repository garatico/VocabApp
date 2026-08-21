/**
 * Rate limiting middleware
 *
 * Applied to the public vocab endpoint to prevent scripted abuse.
 * Intentionally generous — the quiz app makes 1–2 requests per session
 * and caches the response, so normal usage never comes close to the limit.
 *
 * Only production is limited; test and development are skipped, which keeps
 * the suite fast and dev friction-free. That decision is made once, from the
 * environment `createApp` was given, rather than re-read from `process.env` on
 * every request.
 */

import rateLimit, { type Options } from 'express-rate-limit';

/** 120 requests / minute per IP on /api/vocab/:lang */
export function makeVocabRateLimiter(nodeEnv: string) {
  const enabled = nodeEnv === 'production';
  return rateLimit({
    windowMs:        60 * 1000,
    max:             120,
    standardHeaders: true,   // Return rate limit info in RateLimit-* headers
    legacyHeaders:   false,
    message:         { error: 'Too many requests — please slow down.' },
    skip:            () => !enabled,
  } satisfies Partial<Options>);
}
