/**
 * word-lists-multi.test.ts — cross-language lists, the additive parallel
 * store alongside the existing per-language one (src/client/utils/word-lists.ts).
 *
 * Runs in the node environment with a minimal in-memory localStorage stub,
 * same pattern as session-history.test.ts / table-compare.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem:    (k: string) => store.get(k) ?? null,
  setItem:    (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear:      () => { store.clear(); },
};

// addToList/renameList/deleteList refresh a few DOM badges; there is no page here.
(globalThis as Record<string, unknown>).document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
};

const {
  getMultiListNames, getMultiList, getMultiListLanguages, getMultiListCount,
  isInMultiList, addToMultiList, removeFromMultiList,
  createMultiList, deleteMultiList, renameMultiList,
  qualifyListName, qualifyMultiListName, qualifySmartListName, parseSelected,
  addToList, renameList, deleteList, setMultiSources, getMultiSources, getMultiListOwn,
  getList, getListOwn, getDerivedWords, setListSources, getListSources, getListSourceCandidates, removeFromList, getListNames,
  setListMinus, getListMinus, createList, getListCount,
} = await import('../../src/client/utils/word-lists.js');

beforeEach(() => store.clear());

describe('createMultiList / getMultiListNames', () => {
  it('creates an empty list', () => {
    expect(createMultiList('Hard words')).toBe(true);
    expect(getMultiListNames()).toEqual(['Hard words']);
    expect(getMultiList('Hard words')).toEqual([]);
  });

  it('refuses to create a list that already exists', () => {
    createMultiList('Hard words');
    expect(createMultiList('Hard words')).toBe(false);
    expect(getMultiListNames()).toEqual(['Hard words']);
  });
});

describe('addToMultiList / removeFromMultiList / isInMultiList', () => {
  beforeEach(() => { createMultiList('Hard words'); });

  it('adds a word tagged with its language', () => {
    addToMultiList('Hard words', 'casa', 'spanish');
    expect(isInMultiList('Hard words', 'casa', 'spanish')).toBe(true);
    expect(getMultiList('Hard words')).toEqual([{ word: 'casa', language: 'spanish' }]);
  });

  it('keeps two languages sharing a spelling independent', () => {
    addToMultiList('Hard words', 'actor', 'spanish');
    addToMultiList('Hard words', 'actor', 'portuguese');
    expect(isInMultiList('Hard words', 'actor', 'spanish')).toBe(true);
    expect(isInMultiList('Hard words', 'actor', 'portuguese')).toBe(true);
    expect(getMultiListCount('Hard words')).toBe(2);

    removeFromMultiList('Hard words', 'actor', 'spanish');
    expect(isInMultiList('Hard words', 'actor', 'spanish')).toBe(false);
    expect(isInMultiList('Hard words', 'actor', 'portuguese')).toBe(true);
  });

  it('does not add the same (word, language) pair twice', () => {
    addToMultiList('Hard words', 'casa', 'spanish');
    addToMultiList('Hard words', 'casa', 'spanish');
    expect(getMultiListCount('Hard words')).toBe(1);
  });

  it('is false for a word/language pair never added', () => {
    expect(isInMultiList('Hard words', 'casa', 'french')).toBe(false);
  });
});

describe('getMultiListLanguages', () => {
  it('is empty for a list with no words yet', () => {
    createMultiList('Empty');
    expect(getMultiListLanguages('Empty')).toEqual([]);
  });

  it('is a single language when every word shares one', () => {
    createMultiList('Spanish only');
    addToMultiList('Spanish only', 'casa', 'spanish');
    addToMultiList('Spanish only', 'perro', 'spanish');
    expect(getMultiListLanguages('Spanish only')).toEqual(['spanish']);
  });

  it('lists every distinct language present, once each', () => {
    createMultiList('Mixed');
    addToMultiList('Mixed', 'casa', 'spanish');
    addToMultiList('Mixed', 'casa', 'portuguese');
    addToMultiList('Mixed', 'chat', 'french');
    expect(getMultiListLanguages('Mixed').sort()).toEqual(['french', 'portuguese', 'spanish']);
  });
});

describe('deleteMultiList / renameMultiList', () => {
  it('deletes a list', () => {
    createMultiList('Temp');
    addToMultiList('Temp', 'casa', 'spanish');
    deleteMultiList('Temp');
    expect(getMultiListNames()).toEqual([]);
  });

  it('renames a list, keeping its words', () => {
    createMultiList('Old name');
    addToMultiList('Old name', 'casa', 'spanish');
    expect(renameMultiList('Old name', 'New name')).toBe(true);
    expect(getMultiListNames()).toEqual(['New name']);
    expect(getMultiList('New name')).toEqual([{ word: 'casa', language: 'spanish' }]);
  });

  it('refuses to rename onto an existing name', () => {
    createMultiList('A'); createMultiList('B');
    expect(renameMultiList('A', 'B')).toBe(false);
    expect(getMultiListNames().sort()).toEqual(['A', 'B']);
  });
});

describe('qualifySmartListName / parseSelected — the three-way qualifier scheme', () => {
  it('round-trips a smart-list qualifier back to its language and name', () => {
    const qualified = qualifySmartListName('spanish', 'Weak verbs');
    expect(parseSelected(qualified, 'french')).toEqual({
      kind: 'smart', lang: 'spanish', name: 'Weak verbs',
    });
  });

  it('still round-trips single and multi qualifiers alongside smart ones', () => {
    expect(parseSelected(qualifyListName('spanish', 'Known'), 'french'))
      .toEqual({ kind: 'single', lang: 'spanish', name: 'Known' });
    expect(parseSelected(qualifyMultiListName('Hard words'), 'french'))
      .toEqual({ kind: 'multi', name: 'Hard words' });
  });

  it('a smart-list name that itself contains the separator still round-trips', () => {
    // qualifySmartListName has one more split than qualifyMultiListName
    // (sentinel, lang, name) — the name segment has to be reassembled from
    // everything after the second separator, not just split on the first.
    const trickyName = 'A␟B';
    const qualified  = qualifySmartListName('spanish', trickyName);
    expect(parseSelected(qualified, 'french')).toEqual({
      kind: 'smart', lang: 'spanish', name: trickyName,
    });
  });

  it('falls back to a legacy unqualified single entry for a plain name', () => {
    expect(parseSelected('Known', 'french')).toEqual({ kind: 'single', lang: 'french', name: 'Known' });
  });
});

describe('aggregate lists (made of single-language lists)', () => {
  beforeEach(() => {
    addToList('spanish', 'Food', 'pan');
    addToList('spanish', 'Food', 'queso');
    addToList('french', 'Food', 'pain');
    createMultiList('All food');
  });

  it("counts and lists its sources' words live, tagged with where they came from", () => {
    setMultiSources('All food', [{ lang: 'spanish', list: 'Food' }, { lang: 'french', list: 'Food' }]);
    expect(getMultiListCount('All food')).toBe(3);
    expect(getMultiList('All food').find(e => e.word === 'pain')).toEqual({ word: 'pain', language: 'french', via: 'Food' });
    addToList('spanish', 'Food', 'leche');
    expect(getMultiListCount('All food')).toBe(4);
    expect(getMultiListOwn('All food')).toEqual([]);
  });

  it('a source word counts as a member for quizzes', () => {
    setMultiSources('All food', [{ lang: 'spanish', list: 'Food' }]);
    expect(isInMultiList('All food', 'pan', 'spanish')).toBe(true);
    expect(isInMultiList('All food', 'pan', 'french')).toBe(false);
  });

  it('does not double-count a word that is also added directly', () => {
    addToMultiList('All food', 'pan', 'spanish');
    setMultiSources('All food', [{ lang: 'spanish', list: 'Food' }]);
    expect(getMultiList('All food').filter(e => e.word === 'pan')).toHaveLength(1);
  });

  it('survives losing its last own word, and follows a renamed or deleted source', () => {
    addToMultiList('All food', 'x', 'spanish');
    setMultiSources('All food', [{ lang: 'spanish', list: 'Food' }]);
    removeFromMultiList('All food', 'x', 'spanish');
    expect(getMultiListNames()).toContain('All food');

    renameList('spanish', 'Food', 'Comida');
    expect(getMultiSources('All food')).toEqual([{ lang: 'spanish', list: 'Comida' }]);
    expect(getMultiListCount('All food')).toBe(2);

    deleteList('spanish', 'Comida');
    expect(getMultiSources('All food')).toEqual([]);
    expect(getMultiListCount('All food')).toBe(0);
  });
});

describe('single-language lists made of other lists', () => {
  beforeEach(() => {
    addToList('spanish', 'Food', 'pan');
    addToList('spanish', 'Food', 'queso');
    addToList('spanish', 'Meals', 'cena');
  });

  it('includes the sources live and says where each word came from', () => {
    setListSources('spanish', 'Meals', [{ lang: 'spanish', list: 'Food' }]);
    expect(getList('spanish', 'Meals')).toEqual(['cena', 'pan', 'queso']);
    expect(getListOwn('spanish', 'Meals')).toEqual(['cena']);
    expect([...getDerivedWords('spanish', 'Meals')]).toEqual([['pan', 'Food'], ['queso', 'Food']]);
    addToList('spanish', 'Food', 'leche');
    expect(getList('spanish', 'Meals')).toContain('leche');
  });

  it('follows sources through other aggregates, and a cycle cannot loop', () => {
    addToList('spanish', 'Menu', 'plato');
    setListSources('spanish', 'Meals', [{ lang: 'spanish', list: 'Food' }]);
    setListSources('spanish', 'Menu', [{ lang: 'spanish', list: 'Meals' }]);
    expect(getList('spanish', 'Menu')).toEqual(['plato', 'cena', 'pan', 'queso']);
    setListSources('spanish', 'Food', [{ lang: 'spanish', list: 'Menu' }]);   // would close a loop
    expect(getList('spanish', 'Menu').sort()).toEqual(['cena', 'pan', 'plato', 'queso']);
  });

  it("offers only lists that wouldn't make a loop", () => {
    setListSources('spanish', 'Meals', [{ lang: 'spanish', list: 'Food' }]);
    expect(getListSourceCandidates('spanish', 'Meals')).toEqual(['Food']);
    expect(getListSourceCandidates('spanish', 'Food')).toEqual([]);   // Meals is made of Food already
    addToList('spanish', 'Other', 'x');
    expect(getListSourceCandidates('spanish', 'Food')).toEqual(['Other']);
  });

  it('is not deleted when its own words run out, and follows a renamed source', () => {
    setListSources('spanish', 'Meals', [{ lang: 'spanish', list: 'Food' }]);
    removeFromList('spanish', 'Meals', 'cena');
    expect(getListNames('spanish')).toContain('Meals');
    renameList('spanish', 'Food', 'Comida');
    expect(getListSources('spanish', 'Meals')).toEqual([{ lang: 'spanish', list: 'Comida' }]);
    expect(getList('spanish', 'Meals')).toEqual(['pan', 'queso']);
  });

  it('a cross-language list made of an aggregate list sees the whole thing', () => {
    setListSources('spanish', 'Meals', [{ lang: 'spanish', list: 'Food' }]);
    createMultiList('All');
    setMultiSources('All', [{ lang: 'spanish', list: 'Meals' }]);
    expect(getMultiListCount('All')).toBe(3);
    expect(isInMultiList('All', 'pan', 'spanish')).toBe(true);
  });
});

describe('difference lists (minus)', () => {
  function seed(): void {
    createList('spanish', 'Reading');
    createList('spanish', 'Writing');
    createList('spanish', 'To write');
    for (const w of ['hablar', 'comer', 'vivir', 'casa']) addToList('spanish', 'Reading', w);
    for (const w of ['hablar', 'casa']) addToList('spanish', 'Writing', w);
    setListSources('spanish', 'To write', [{ lang: 'spanish', list: 'Reading' }]);
    setListMinus('spanish', 'To write', [{ lang: 'spanish', list: 'Writing' }]);
  }

  it('Made of Reading, minus Writing, is what Reading has that Writing doesn\'t', () => {
    seed();
    expect(getList('spanish', 'To write')).toEqual(['comer', 'vivir']);
    expect(getListCount('spanish', 'To write')).toBe(2);
  });

  it('shrinks as Writing catches up, and grows as Reading does', () => {
    seed();
    addToList('spanish', 'Writing', 'comer');
    addToList('spanish', 'Reading', 'perro');
    expect(getList('spanish', 'To write')).toEqual(['vivir', 'perro']);
  });

  it('takes the subtracted words out of its own words too', () => {
    seed();
    addToList('spanish', 'To write', 'casa');   // in Writing: subtracted
    addToList('spanish', 'To write', 'gato');
    expect(getList('spanish', 'To write').sort()).toEqual(['comer', 'gato', 'vivir']);
  });

  it('used as another list\'s source, contributes the difference', () => {
    seed();
    createList('spanish', 'Everything to practise');
    setListSources('spanish', 'Everything to practise', [{ lang: 'spanish', list: 'To write' }]);
    expect(getList('spanish', 'Everything to practise')).toEqual(['comer', 'vivir']);
  });

  it('a list that is both a source and a minus subtracts itself away (made of B, minus B: nothing)', () => {
    createList('spanish', 'B'); createList('spanish', 'C');
    addToList('spanish', 'B', 'uno');
    setListSources('spanish', 'C', [{ lang: 'spanish', list: 'B' }]);
    setListMinus('spanish', 'C', [{ lang: 'spanish', list: 'B' }]);
    expect(getList('spanish', 'C')).toEqual([]);
  });

  it('a cycle (A minus B, B minus A) ends rather than looping', () => {
    createList('spanish', 'A'); createList('spanish', 'B');
    addToList('spanish', 'A', 'uno'); addToList('spanish', 'A', 'dos');
    addToList('spanish', 'B', 'dos');
    setListMinus('spanish', 'A', [{ lang: 'spanish', list: 'B' }]);
    setListMinus('spanish', 'B', [{ lang: 'spanish', list: 'A' }]);
    expect(() => getList('spanish', 'A')).not.toThrow();
    expect(getList('spanish', 'A')).toEqual(['uno']);
  });

  it('follows a renamed minus list, and a deleted one subtracts nothing', () => {
    seed();
    renameList('spanish', 'Writing', 'Written');
    expect(getListMinus('spanish', 'To write')).toEqual([{ lang: 'spanish', list: 'Written' }]);
    expect(getList('spanish', 'To write')).toEqual(['comer', 'vivir']);
    deleteList('spanish', 'Written');
    expect(getListMinus('spanish', 'To write')).toEqual([]);
    expect(getList('spanish', 'To write')).toEqual(['hablar', 'comer', 'vivir', 'casa']);
  });
});
