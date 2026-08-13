/**
 * logger.ts — browser-safe leveled logger for client code.
 *
 * In production builds (Vite sets `import.meta.env.PROD`) debug/info are
 * silenced to keep the console clean for end users; warnings and errors
 * always surface. Zero dependencies.
 *
 * Usage:
 *   import { logger } from '../utils/logger.js';
 *   logger.info('✓ UI mounted');
 *   logger.warn('could not parse JSON', err);
 */

const isDev = import.meta.env.DEV;

export const logger = {
  debug: (...args: unknown[]): void => { if (isDev) console.debug(...args); },
  info:  (...args: unknown[]): void => { if (isDev) console.info(...args); },
  warn:  (...args: unknown[]): void => { console.warn(...args); },
  error: (...args: unknown[]): void => { console.error(...args); },
};

export default logger;
