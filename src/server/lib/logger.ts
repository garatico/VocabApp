/**
 * logger.ts
 *
 * Tiny zero-dependency leveled logger for server code.
 *
 * The active level comes from the LOG_LEVEL env var, falling back to a
 * sensible default per NODE_ENV: quiet in tests, info in production,
 * debug in development. Set LOG_LEVEL=silent to disable all output.
 *
 * Usage:
 *   import { logger } from './lib/logger.js';
 *   logger.info('Connected to SQLite');
 *   logger.error('Boom:', err);
 */

type Level = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const PRIORITY: Record<Level, number> = {
  debug:  10,
  info:   20,
  warn:   30,
  error:  40,
  silent: 100,
};

function isLevel(value: string): value is Level {
  return Object.prototype.hasOwnProperty.call(PRIORITY, value);
}

function defaultLevel(): Level {
  switch (process.env['NODE_ENV']) {
    case 'test':       return 'warn';
    case 'production': return 'info';
    default:           return 'debug';
  }
}

function resolveLevel(): Level {
  const raw = (process.env['LOG_LEVEL'] || '').toLowerCase();
  return isLevel(raw) ? raw : defaultLevel();
}

// Resolved once at import. The server is long-lived; the env won't change
// underneath us, and resolving lazily would add a lookup to every log call.
const threshold = PRIORITY[resolveLevel()];

function emit(level: Exclude<Level, 'silent'>, args: unknown[]): void {
  if (PRIORITY[level] < threshold) return;
  // error/warn go to stderr; debug/info to stdout.
  const sink = level === 'error' ? console.error
             : level === 'warn'  ? console.warn
             : /* debug | info */   console.log;
  sink(...args);
}

export const logger = {
  debug: (...args: unknown[]): void => emit('debug', args),
  info:  (...args: unknown[]): void => emit('info', args),
  warn:  (...args: unknown[]): void => emit('warn', args),
  error: (...args: unknown[]): void => emit('error', args),
};

export default logger;
