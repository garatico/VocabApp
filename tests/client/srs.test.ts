/**
 * srs.test.ts — the Leitner-box review schedule (src/client/utils/srs.ts).
 *
 * Node environment with an in-memory localStorage stub, same pattern as
 * session-history.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

const {
  bumpSrs, srsEntry, srsDueWords, srsDueCount, clearSrs, BOX_INTERVAL_DAYS, MAX_BOX,
} = await import('../../src/client/utils/srs.js');

beforeEach(() => store.clear());

const DAY_MS = 24 * 60 * 60 * 1000;

describe('bumpSrs', () => {
  it('a never-quizzed word has no entry and is not due', () => {
    expect(srsEntry('spanish', 'casa')).toBeNull();
    expect(srsDueWords('spanish')).toEqual([]);
  });

  it('a miss puts a word at box 0, due immediately', () => {
    const now = Date.now();
    bumpSrs('spanish', ['casa']);
    const entry = srsEntry('spanish', 'casa');
    expect(entry?.box).toBe(0);
    expect(entry?.dueAt).toBeLessThanOrEqual(now + 1000);
    expect(srsDueWords('spanish')).toEqual(['casa']);
  });

  it('a correct answer on a fresh word advances it to box 1, due in the future', () => {
    const now = Date.now();
    bumpSrs('spanish', [], ['casa']);
    const entry = srsEntry('spanish', 'casa');
    expect(entry?.box).toBe(1);
    expect(entry?.dueAt).toBeGreaterThan(now);
    // Not due right now — box 1's interval is > 0 days.
    expect(srsDueWords('spanish')).toEqual([]);
  });

  it('repeated correct answers climb boxes and cap at MAX_BOX', () => {
    for (let i = 0; i < BOX_INTERVAL_DAYS.length + 3; i++) {
      bumpSrs('spanish', [], ['casa']);
    }
    expect(srsEntry('spanish', 'casa')?.box).toBe(MAX_BOX);
  });

  it('a miss resets an advanced word back to box 0', () => {
    bumpSrs('spanish', [], ['casa']);
    bumpSrs('spanish', [], ['casa']);
    expect(srsEntry('spanish', 'casa')?.box).toBeGreaterThan(0);

    bumpSrs('spanish', ['casa']);
    expect(srsEntry('spanish', 'casa')?.box).toBe(0);
  });

  it('keeps languages separate', () => {
    bumpSrs('spanish', ['casa']);
    expect(srsEntry('french', 'casa')).toBeNull();
  });
});

describe('srsDueWords', () => {
  it('orders most-overdue first', () => {
    const base = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(base);
    bumpSrs('spanish', ['a']);
    vi.spyOn(Date, 'now').mockReturnValue(base + 5000);
    bumpSrs('spanish', ['b']);
    vi.restoreAllMocks();

    // Both due by "now"; 'a' became due earlier, so it's more overdue.
    expect(srsDueWords('spanish', base + 10000)).toEqual(['a', 'b']);
  });

  it('excludes a word not yet due', () => {
    bumpSrs('spanish', [], ['casa']); // box 1, due in the future
    expect(srsDueWords('spanish')).not.toContain('casa');
  });

  it('a word becomes due again once its interval elapses', () => {
    const base = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(base);
    bumpSrs('spanish', [], ['casa']); // box 1
    vi.restoreAllMocks();

    const box1Days = BOX_INTERVAL_DAYS[1];
    expect(srsDueWords('spanish', base + box1Days * DAY_MS - 1)).toEqual([]);
    expect(srsDueWords('spanish', base + box1Days * DAY_MS + 1)).toEqual(['casa']);
  });

  it('srsDueCount matches srsDueWords length', () => {
    bumpSrs('spanish', ['a', 'b', 'c']);
    expect(srsDueCount('spanish')).toBe(3);
  });
});

describe('clearSrs', () => {
  it('removes the schedule for that language only', () => {
    bumpSrs('spanish', ['casa']);
    bumpSrs('french', ['maison']);
    clearSrs('spanish');
    expect(srsEntry('spanish', 'casa')).toBeNull();
    expect(srsEntry('french', 'maison')).not.toBeNull();
  });
});
