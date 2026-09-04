/**
 * smart-lists.test.ts — old rules on disk must not crash new code.
 *
 * Regression for a real incident: a rule saved before `domains` existed on
 * SmartRule had no `domains` field in storage. evaluateSmart() indexed into
 * it unconditionally (`rule.domains.length`), which threw for every such
 * rule and — because the sidebar renders Cross-Language Lists and Testing
 * Profiles *after* the Smart Lists loop in the same function — silently took
 * those sections down with it on every reload.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { VocabEntry } from '../../src/client/modes/my-lists/types.ts';

class FakeStorage {
  map = new Map<string, string>();
  get length(): number { return this.map.size; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
}

let store: FakeStorage;

beforeEach(() => {
  store = new FakeStorage();
  (globalThis as Record<string, unknown>).localStorage = store;
});

function entry(overrides: Partial<VocabEntry> = {}): VocabEntry {
  return {
    word: 'casa', translation: 'house', pos: 'noun', rank: 10, band: 'A1',
    glosses: [], examples: [], domains: ['home'], ipa: null, audioUrl: null,
    disambiguator: null, meaningDisambiguator: null,
    ...overrides,
  };
}

describe('a rule saved before domains/wordStartsWith/meaningContains existed', () => {
  it('getSmartLists fills in defaults rather than returning the partial shape', async () => {
    const smart = await import('../../src/client/modes/my-lists/smart-lists.ts');

    // Written the way a pre-domains version of the app would have: just the
    // fields that existed on SmartRule at the time.
    store.setItem('vq_smart_spanish', JSON.stringify({
      'Old Rule': { bands: ['A1'], pos: [], mastered: 'no', listed: 'any', due: 'any', limit: 0, sort: 'rank' },
    }));

    const rule = smart.getSmartLists('spanish')['Old Rule'];
    expect(rule.domains).toEqual([]);
    expect(rule.wordStartsWith).toBe('');
    expect(rule.meaningContains).toBe('');
    expect(rule.bands).toEqual(['A1']); // fields that did exist are preserved
  });

  it('evaluateSmart does not throw and treats the missing fields as "any"', async () => {
    const smart = await import('../../src/client/modes/my-lists/smart-lists.ts');

    store.setItem('vq_smart_spanish', JSON.stringify({
      'Old Rule': { bands: [], pos: [], mastered: 'any', listed: 'any', due: 'any', limit: 0, sort: 'rank' },
    }));

    const rule = smart.getSmartLists('spanish')['Old Rule'];
    const vocab = [entry({ word: 'casa' }), entry({ word: 'perro', domains: ['animals'] })];

    expect(() => smart.evaluateSmart('spanish', rule, vocab)).not.toThrow();
    expect(smart.evaluateSmart('spanish', rule, vocab).sort()).toEqual(['casa', 'perro']);
  });
});
