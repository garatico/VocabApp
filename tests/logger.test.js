/**
 * tests/logger.test.js
 *
 * Unit tests for the server-side leveled logger (src/server/lib/logger.ts).
 *
 * The logger resolves its threshold ONCE at import time, so every test has to
 * set the environment first and then pull in a fresh copy of the module via
 * vi.resetModules() + dynamic import. `loadLogger()` below does both.
 *
 * Sinks: error → console.error, warn → console.warn, debug/info → console.log.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

let spies;

/**
 * Set env vars, reset the module registry, and import a fresh logger.
 * Passing `undefined` for a key deletes it so the fallback path is exercised.
 */
async function loadLogger(env = {}) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  const mod = await import('../src/server/lib/logger.js');
  return mod.logger;
}

beforeEach(() => {
  spies = {
    log:   vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn:  vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };
});

afterEach(() => {
  for (const spy of Object.values(spies)) spy.mockRestore();
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

/** Total console writes across every sink. */
const totalCalls = () =>
  spies.log.mock.calls.length + spies.warn.mock.calls.length + spies.error.mock.calls.length;

// ── Explicit LOG_LEVEL ───────────────────────────────────────────────────────

describe('LOG_LEVEL override', () => {
  it('debug lets every level through', async () => {
    const logger = await loadLogger({ LOG_LEVEL: 'debug', NODE_ENV: 'test' });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(spies.log).toHaveBeenCalledTimes(2); // debug + info
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
  });

  it('warn suppresses debug and info but keeps warn and error', async () => {
    const logger = await loadLogger({ LOG_LEVEL: 'warn', NODE_ENV: 'development' });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledWith('w');
    expect(spies.error).toHaveBeenCalledWith('e');
  });

  it('error suppresses everything below error', async () => {
    const logger = await loadLogger({ LOG_LEVEL: 'error', NODE_ENV: 'development' });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.warn).not.toHaveBeenCalled();
    expect(spies.error).toHaveBeenCalledTimes(1);
  });

  it('silent suppresses every level, including error', async () => {
    const logger = await loadLogger({ LOG_LEVEL: 'silent', NODE_ENV: 'development' });

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(totalCalls()).toBe(0);
  });

  it('is case-insensitive', async () => {
    const logger = await loadLogger({ LOG_LEVEL: 'SILENT', NODE_ENV: 'development' });

    logger.error('e');

    expect(totalCalls()).toBe(0);
  });
});

// ── NODE_ENV fallbacks ───────────────────────────────────────────────────────

describe('NODE_ENV defaults when LOG_LEVEL is unset', () => {
  it('test defaults to warn', async () => {
    const logger = await loadLogger({ LOG_LEVEL: undefined, NODE_ENV: 'test' });

    logger.info('i');
    logger.warn('w');

    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledTimes(1);
  });

  it('production defaults to info', async () => {
    const logger = await loadLogger({ LOG_LEVEL: undefined, NODE_ENV: 'production' });

    logger.debug('d');
    logger.info('i');

    expect(spies.log).toHaveBeenCalledTimes(1);
    expect(spies.log).toHaveBeenCalledWith('i');
  });

  it('development defaults to debug', async () => {
    const logger = await loadLogger({ LOG_LEVEL: undefined, NODE_ENV: 'development' });

    logger.debug('d');

    expect(spies.log).toHaveBeenCalledWith('d');
  });

  it('an unrecognised NODE_ENV falls back to debug', async () => {
    const logger = await loadLogger({ LOG_LEVEL: undefined, NODE_ENV: 'staging' });

    logger.debug('d');

    expect(spies.log).toHaveBeenCalledWith('d');
  });
});

// ── Malformed input ──────────────────────────────────────────────────────────

describe('invalid LOG_LEVEL', () => {
  it('falls back to the NODE_ENV default rather than silencing output', async () => {
    const logger = await loadLogger({ LOG_LEVEL: 'chatty', NODE_ENV: 'production' });

    logger.debug('d'); // below the production default of info
    logger.info('i');

    expect(spies.log).toHaveBeenCalledTimes(1);
    expect(spies.log).toHaveBeenCalledWith('i');
  });

  it('treats an empty LOG_LEVEL as unset', async () => {
    const logger = await loadLogger({ LOG_LEVEL: '', NODE_ENV: 'test' });

    logger.info('i');
    logger.warn('w');

    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledTimes(1);
  });
});

// ── Sink routing and argument passthrough ────────────────────────────────────

describe('sink routing', () => {
  it('sends warn to console.warn and error to console.error, never to stdout', async () => {
    const logger = await loadLogger({ LOG_LEVEL: 'debug', NODE_ENV: 'development' });

    logger.warn('w');
    logger.error('e');

    expect(spies.log).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledWith('w');
    expect(spies.error).toHaveBeenCalledWith('e');
  });

  it('forwards every argument verbatim', async () => {
    const logger = await loadLogger({ LOG_LEVEL: 'debug', NODE_ENV: 'development' });
    const err = new Error('boom');
    const meta = { statusCode: 500 };

    logger.error('failed:', err, meta);

    expect(spies.error).toHaveBeenCalledWith('failed:', err, meta);
  });

  it('handles being called with no arguments', async () => {
    const logger = await loadLogger({ LOG_LEVEL: 'debug', NODE_ENV: 'development' });

    expect(() => logger.info()).not.toThrow();
    expect(spies.log).toHaveBeenCalledWith();
  });
});
