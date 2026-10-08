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
    disambiguator: null, meaningDisambiguators: null, conjugations: null,
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

describe('In list / Not in list — the difference between two lists', () => {
  // word-lists.ts refreshes a few badges on write; there is no page here.
  const stubDocument = (): void => {
    (globalThis as Record<string, unknown>).document = {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    };
  };
  const vocab = [
    entry({ word: 'hablar', pos: 'verb', rank: 1 }), entry({ word: 'comer', pos: 'verb', rank: 2 }),
    entry({ word: 'vivir', pos: 'verb', rank: 3 }), entry({ word: 'casa', pos: 'noun', rank: 4 }),
    entry({ word: 'perro', pos: 'noun', rank: 5 }),
  ];
  async function setup() {
    stubDocument();
    const smart = await import('../../src/client/modes/my-lists/smart-lists.ts');
    const lists = await import('../../src/client/utils/word-lists.ts');
    lists.createList('spanish', 'Reading');
    lists.createList('spanish', 'Writing');
    for (const w of ['hablar', 'comer', 'vivir', 'casa']) lists.addToList('spanish', 'Reading', w);
    for (const w of ['hablar']) lists.addToList('spanish', 'Writing', w);
    const rule = (over: Partial<import('../../src/client/modes/my-lists/smart-lists.ts').SmartRule>) =>
      ({ ...smart.DEFAULT_SMART_RULE, mastered: 'any' as const, limit: 0, ...over });
    return { smart, lists, rule };
  }

  it('Reading minus Writing: what reading has that writing doesn\'t', async () => {
    const { smart, rule } = await setup();
    expect(smart.evaluateSmart('spanish', rule({ inLists: ['Reading'], notInLists: ['Writing'] }), vocab))
      .toEqual(['comer', 'vivir', 'casa']);
  });

  it('combines with the other rules: the verbs only', async () => {
    const { smart, rule } = await setup();
    expect(smart.evaluateSmart('spanish', rule({ inLists: ['Reading'], notInLists: ['Writing'], pos: ['verb'] }), vocab))
      .toEqual(['comer', 'vivir']);
  });

  it('ignores the default "not in any list" while In list is set (they can\'t both hold)', async () => {
    const { smart, rule } = await setup();
    expect(smart.evaluateSmart('spanish', rule({ listed: 'no', inLists: ['Reading'] }), vocab))
      .toEqual(['hablar', 'comer', 'vivir', 'casa']);
  });

  it('keeps up as the lists change', async () => {
    const { smart, lists, rule } = await setup();
    const r = rule({ inLists: ['Reading'], notInLists: ['Writing'] });
    lists.addToList('spanish', 'Writing', 'comer');
    expect(smart.evaluateSmart('spanish', r, vocab)).toEqual(['vivir', 'casa']);
  });

  it('a deleted In list leaves nothing, rather than widening to every word', async () => {
    const { smart, lists, rule } = await setup();
    lists.deleteList('spanish', 'Reading');
    expect(smart.evaluateSmart('spanish', rule({ inLists: ['Reading'] }), vocab)).toEqual([]);
  });

  it('follows a renamed list', async () => {
    const { smart, lists } = await setup();
    smart.saveSmartRule('spanish', 'To write', { ...smart.DEFAULT_SMART_RULE, inLists: ['Reading'], notInLists: ['Writing'] });
    lists.renameList('spanish', 'Writing', 'Written');
    const saved = smart.getSmartLists('spanish')['To write'];
    expect(saved.notInLists).toEqual(['Written']);
    expect(saved.inLists).toEqual(['Reading']);
  });
});
