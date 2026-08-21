/**
 * storage.test.ts — the localStorage wrapper.
 *
 * The point of the module is that it cannot throw, so most of these tests are
 * about hostile storage rather than happy paths: a browser that refuses access
 * (Safari private mode), a full quota, and half-written JSON left behind by an
 * interrupted write. Every one of those used to take a page down.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── A localStorage stand-in we can break on purpose ──────────────────────────

class FakeStorage {
  private map = new Map<string, string>();
  failWrites = false;
  failAll    = false;

  get length(): number {
    if (this.failAll) throw new DOMException('denied');
    return this.map.size;
  }
  key(i: number): string | null {
    if (this.failAll) throw new DOMException('denied');
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    if (this.failAll) throw new DOMException('denied');
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.failAll || this.failWrites) throw new DOMException('quota', 'QuotaExceededError');
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    if (this.failAll) throw new DOMException('denied');
    this.map.delete(k);
  }
  /** Bypass the failure switches, for arranging fixtures. */
  seed(k: string, v: string): void { this.map.set(k, v); }
}

let store: FakeStorage;

// `isAvailable` memoises its probe, so each test needs a fresh module instance
// as well as a fresh store.
async function loadStorage() {
  return import('../../src/client/utils/storage.ts');
}

beforeEach(() => {
  vi.resetModules();
  store = new FakeStorage();
  (globalThis as unknown as { localStorage: FakeStorage }).localStorage = store;
});

afterEach(() => {
  delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
});

describe('readString / writeString', () => {
  it('round-trips a value', async () => {
    const s = await loadStorage();
    expect(s.writeString('k', 'v')).toBe(true);
    expect(s.readString('k')).toBe('v');
  });

  it('returns the fallback for a missing key', async () => {
    const s = await loadStorage();
    expect(s.readString('nope', 'fallback')).toBe('fallback');
    expect(s.readString('nope')).toBeNull();
  });

  it('returns the fallback instead of throwing when storage is denied', async () => {
    const s = await loadStorage();
    store.failAll = true;
    expect(() => s.readString('k', 'fallback')).not.toThrow();
    expect(s.readString('k', 'fallback')).toBe('fallback');
  });

  it('reports a dropped write rather than throwing on a full quota', async () => {
    const s = await loadStorage();
    store.failWrites = true;
    expect(s.writeString('k', 'v')).toBe(false);
  });
});

describe('readJson', () => {
  it('parses a stored value', async () => {
    const s = await loadStorage();
    s.writeJson('k', { a: 1 });
    expect(s.readJson('k', {})).toEqual({ a: 1 });
  });

  it('falls back on truncated JSON rather than throwing', async () => {
    const s = await loadStorage();
    store.seed('k', '{"a":1,');            // an interrupted write
    expect(s.readJson('k', { fallback: true })).toEqual({ fallback: true });
  });

  it('falls back when the guard rejects the shape', async () => {
    const s = await loadStorage();
    store.seed('k', '"a string where an array belongs"');
    expect(s.readJson<string[]>('k', [], s.isStringArray)).toEqual([]);
  });

  it('accepts a value the guard approves', async () => {
    const s = await loadStorage();
    store.seed('k', '["a","b"]');
    expect(s.readJson<string[]>('k', [], s.isStringArray)).toEqual(['a', 'b']);
  });

  it('treats an array as failing isRecord', async () => {
    const s = await loadStorage();
    store.seed('k', '[1,2]');
    expect(s.readJson('k', { ok: true }, s.isRecord)).toEqual({ ok: true });
  });

  it('rejects a record holding non-numbers when isNumberRecord is asked for', async () => {
    const s = await loadStorage();
    store.seed('k', '{"a":1,"b":"two"}');
    expect(s.readJson('k', {}, s.isNumberRecord)).toEqual({});
  });
});

describe('writeJson', () => {
  it('does not throw on a circular structure', async () => {
    const s = await loadStorage();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(s.writeJson('k', circular)).toBe(false);
  });
});

describe('keys', () => {
  it('lists every key as a snapshot, so deleting while iterating is safe', async () => {
    const s = await loadStorage();
    store.seed('a', '1'); store.seed('b', '2'); store.seed('c', '3');

    const seen: string[] = [];
    for (const k of s.keys()) { seen.push(k); s.remove(k); }

    // An index walk over a live localStorage would have skipped 'b' here.
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(s.keys()).toEqual([]);
  });

  it('returns an empty list rather than throwing when storage is denied', async () => {
    const s = await loadStorage();
    store.failAll = true;
    expect(s.keys()).toEqual([]);
  });
});

describe('isAvailable', () => {
  it('is false when a write throws', async () => {
    const s = await loadStorage();
    store.failWrites = true;
    expect(s.isAvailable()).toBe(false);
  });

  it('is true for working storage, and leaves no probe behind', async () => {
    const s = await loadStorage();
    expect(s.isAvailable()).toBe(true);
    expect(s.keys()).toEqual([]);
  });
});
