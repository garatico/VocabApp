// @vitest-environment jsdom
/**
 * i18n-dictionary.test.ts — the Spanish dictionary is a separate chunk, so
 * loading it can fail (a tab left open across a deploy asks for a hashed file
 * that is gone). ensureDictionary() must say so, retry once on its own, and
 * not remember the failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function load() {
  return import('../../src/client/i18n/index.js');
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('../../src/client/i18n/es.ts');
});

describe('ensureDictionary', () => {
  it('is true straight away for English — there is nothing to load', async () => {
    const { ensureDictionary } = await load();
    expect(await ensureDictionary()).toBe(true);
  });

  it('loads the Spanish dictionary and then translates with it', async () => {
    localStorage.setItem('s_ui_language', 'spanish');
    vi.doMock('../../src/client/i18n/es.ts', () => ({ es: { 'nav.test': 'Hola' } }));
    const { ensureDictionary, t } = await load();
    expect(t('nav.test', 'Hi')).toBe('Hi');            // not loaded yet: English fallback
    expect(await ensureDictionary()).toBe(true);
    expect(t('nav.test', 'Hi')).toBe('Hola');
  });

  it('retries once on its own when the chunk fails the first time', async () => {
    localStorage.setItem('s_ui_language', 'spanish');
    let calls = 0;
    vi.doMock('../../src/client/i18n/es.ts', () => {
      calls++;
      if (calls === 1) throw new Error('chunk gone');
      return { es: { 'nav.test': 'Hola' } };
    });
    const { ensureDictionary, t } = await load();
    const result = ensureDictionary();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe(true);
    expect(t('nav.test', 'Hi')).toBe('Hola');
  });

  it('reports false when it still fails, and tries again on the next call', async () => {
    localStorage.setItem('s_ui_language', 'spanish');
    vi.spyOn(console, 'error').mockImplementation(() => { /* the logged failure is expected */ });
    let works = false;
    vi.doMock('../../src/client/i18n/es.ts', () => {
      if (!works) throw new Error('chunk gone');
      return { es: { 'nav.test': 'Hola' } };
    });
    const { ensureDictionary, t } = await load();

    const first = ensureDictionary();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await first).toBe(false);
    expect(t('nav.test', 'Hi')).toBe('Hi');            // still English, and says so rather than pretending

    works = true;                                       // the network comes back
    expect(await ensureDictionary()).toBe(true);
    expect(t('nav.test', 'Hi')).toBe('Hola');
  });
});
