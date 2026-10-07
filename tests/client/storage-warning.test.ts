/**
 * storage-warning.test.ts — a write that can't land is reported once (src/client/ui/storage-warning.ts
 * over storage.ts's onWriteFailure), worded for a full storage or a blocked one.
 *
 * Node environment with a localStorage stub whose setItem throws whatever the test asks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

let failWith: Error | null = null;
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { if (failWith) throw failWith; store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};
(globalThis as Record<string, unknown>).document = { getElementById: () => null, querySelector: () => null, createElement: () => ({}) };

const named = (name: string): Error => Object.assign(new Error(name), { name });

beforeEach(() => { vi.resetModules(); failWith = null; store.clear(); });

async function load() {
  const storage = await import('../../src/client/utils/storage.ts');
  const warning = await import('../../src/client/ui/storage-warning.ts');
  const notify = vi.fn();
  warning.initStorageWarning(notify);
  return { storage, warning, notify };
}

describe('storage warning', () => {
  it('says nothing while writes land', async () => {
    const { storage, notify } = await load();
    expect(storage.writeString('vq_lists_spanish', '{}')).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });

  it('a full storage says so, and what to do — once per page load', async () => {
    const { storage, warning, notify } = await load();
    failWith = named('QuotaExceededError');
    expect(storage.writeString('vq_lists_spanish', '{"x":1}')).toBe(false);
    expect(storage.writeJson('vq_mastery_spanish', ['casa'])).toBe(false);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(warning.STORAGE_FULL_MESSAGE);
  });

  it("recognises Firefox's name for a full storage too", async () => {
    const { storage, warning, notify } = await load();
    failWith = named('NS_ERROR_DOM_QUOTA_REACHED');
    storage.writeString('k', 'v');
    expect(notify).toHaveBeenCalledWith(warning.STORAGE_FULL_MESSAGE);
  });

  it('a blocked storage gets the other message', async () => {
    const { storage, warning, notify } = await load();
    failWith = named('SecurityError');
    storage.writeString('k', 'v');
    expect(notify).toHaveBeenCalledWith(warning.STORAGE_BLOCKED_MESSAGE);
  });

  it("a listener that throws doesn't break the write's caller", async () => {
    const storage = await import('../../src/client/utils/storage.ts');
    storage.onWriteFailure(() => { throw new Error('boom'); });
    failWith = named('QuotaExceededError');
    expect(() => storage.writeString('k', 'v')).not.toThrow();
    expect(storage.writeString('k', 'v')).toBe(false);
  });
});
