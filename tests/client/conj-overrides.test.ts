/**
 * conj-overrides.test.ts — a learner's own corrections to a verb's conjugation table (My Content).
 */
import { describe, it, expect, beforeEach } from 'vitest';

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
  getConjOverride, getConjOverrides, setConjOverrideTense, clearConjOverride,
  applyConjOverrideRecord, pickConjOverride, applyUserContentImport,
} = await import('../../src/client/data/user-content.js');

beforeEach(() => store.clear());

const verb = (conj?: Record<string, string[] | string>) => ({
  word: 'hablar', translation: 'to speak', pos: 'verb', difficulty: null, notes: '', glosses: ['to speak'],
  examples: [], svg_url: null, emoji: null, linguistic: conj ? { conjugations: conj } : null, frequency: null,
}) as never;

describe('conjugation overrides', () => {
  it('stores one tense at a time, case-insensitively by word, and drops a verb left with none', () => {
    setConjOverrideTense('spanish', 'Hablar', 'present', ['a', 'b', 'c', 'd', 'e', 'f']);
    setConjOverrideTense('spanish', 'hablar', 'gerund', 'hablando');
    expect(Object.keys(getConjOverride('spanish', 'HABLAR')!)).toEqual(['present', 'gerund']);
    setConjOverrideTense('spanish', 'hablar', 'present', null);
    expect(getConjOverride('spanish', 'hablar')).toEqual({ gerund: 'hablando' });
    setConjOverrideTense('spanish', 'hablar', 'gerund', null);
    expect(getConjOverrides('spanish')).toEqual({});
  });

  it('is kept per language and clearable', () => {
    setConjOverrideTense('spanish', 'ser', 'present', ['1', '2', '3', '4', '5', '6']);
    setConjOverrideTense('french', 'ser', 'present', ['x', 'y', 'z', 'u', 'v', 'w']);
    clearConjOverride('spanish', 'ser');
    expect(getConjOverride('spanish', 'ser')).toBeNull();
    expect(getConjOverride('french', 'ser')).not.toBeNull();
  });

  it('lays only the changed tenses over the verb, leaving every other form alone', () => {
    const base = { present: ['hablo', 'hablas', 'habla', 'hablamos', 'habláis', 'hablan'], gerund: 'hablando', future: ['a', 'b', 'c', 'd', 'e', 'f'] };
    const out = applyConjOverrideRecord(verb(base), { present: ['H', 'B', 'L', 'N', 'V', 'E'] });
    const conj = (out as { linguistic: { conjugations: Record<string, unknown> } }).linguistic.conjugations;
    expect(conj.present).toEqual(['H', 'B', 'L', 'N', 'V', 'E']);
    expect(conj.gerund).toBe('hablando');
    expect(conj.future).toEqual(base.future);
  });

  it('works on a word with no table yet, and does nothing without an override', () => {
    const out = applyConjOverrideRecord(verb(), { gerund: 'hablando' });
    expect((out as { linguistic: { conjugations: unknown } }).linguistic.conjugations).toEqual({ gerund: 'hablando' });
    const w = verb({ present: [] as string[] });
    expect(applyConjOverrideRecord(w, null)).toBe(w);
    expect(applyConjOverrideRecord(w, {})).toBe(w);
  });

  it('picks a word\'s override out of an already-read record without matching inherited keys', () => {
    const rec = getConjOverrides('spanish');
    expect(pickConjOverride(rec, 'constructor')).toBeNull();
  });

  it('round-trips through a My Content export', () => {
    const file = JSON.stringify({ version: 1, exportedAt: 'x', words: {}, trivia: {}, pictures: {},
      conjOverrides: { spanish: { hablar: { present: ['1', '2', '3', '4', '5', '6'] } } } });
    expect(applyUserContentImport(file)).toContain('1 conjugation override');
    expect(getConjOverride('spanish', 'hablar')).toEqual({ present: ['1', '2', '3', '4', '5', '6'] });
  });
});
