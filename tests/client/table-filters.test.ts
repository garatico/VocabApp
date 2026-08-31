/**
 * table-filters.test.ts — Table mode's List/Domain/Class filters, alone and
 * combined.
 *
 * Reproduces two reported bugs directly against the real modules (not just
 * the storage keys), the same style filter-chain.test.ts uses:
 *
 *   1. "EspanolSaboVerbos" holds only "ser". List filter Active + Focus on
 *      just that list should leave nothing but "ser" in the quiz pool —
 *      words outside the focused list were leaking through.
 *   2. The Domains filter read a module-level cache that only refreshed on
 *      specific UI events (a mode switch, a language change). Reading it
 *      from a fresh scope without one of those happening first — exactly
 *      what Start Quiz does — returned a stale selection, which is
 *      indistinguishable from "the domain filter does nothing".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Word } from '../../src/client/types.ts';

// ── A localStorage and just enough DOM for the filters to run ────────────────

class FakeStorage {
  map = new Map<string, string>();
  get length(): number { return this.map.size; }
  key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
}

let store: FakeStorage;
let language = 'spanish';

function stubDom(): void {
  (globalThis as Record<string, unknown>).document = {
    getElementById: (id: string) => (id === 'langSelect' ? { value: language } : null),
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

beforeEach(() => {
  vi.resetModules();
  store = new FakeStorage();
  language = 'spanish';
  (globalThis as Record<string, unknown>).localStorage = store;
  stubDom();
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
  delete (globalThis as Record<string, unknown>).document;
});

/** Switch mode the way the tab handler does: write vq_mode. */
function switchTo(mode: string): void {
  store.setItem('vq_mode', mode);
}

function word(overrides: Partial<Word> = {}): Word {
  return {
    word:        'palabra',
    translation: 'word',
    pos:         null,
    glosses:     ['word'],
    examples:    [],
    svg_url:     null,
    emoji:       null,
    linguistic:  null,
    domains:     [],
    ...overrides,
  } as Word;
}

const WORDS: Word[] = [
  word({ word: 'ser',  pos: 'verb' }),
  word({ word: 'casa', pos: 'noun' }),
  word({ word: 'hola', pos: 'interjection' }),
  word({ word: 'rojo', pos: 'adjective' }),
];

async function load() {
  const wf     = await import('../../src/client/filters/word-filters.ts');
  const wl     = await import('../../src/client/utils/word-lists.ts');
  const domain = await import('../../src/client/filters/domain-filter.ts');
  const cls    = await import('../../src/client/filters/class-filter.ts');
  return { wf, wl, domain, cls };
}

describe('List filter — Focus on a single-word list, in Table mode', () => {
  it('leaves only the words that are actually in the focused list', async () => {
    const { wf, wl } = await load();
    switchTo('table');

    wl.createList('spanish', 'EspanolSaboVerbos');
    wl.addToList('spanish', 'EspanolSaboVerbos', 'ser');

    wl.saveListFilterState('spanish', {
      active: true,
      mode: 'focus',
      selected: [wl.qualifyListName('spanish', 'EspanolSaboVerbos')],
    });

    const result = wf.filterWords(WORDS);
    expect(result.map(w => w.word)).toEqual(['ser']);
  });

  it('Hide mode removes exactly the focused list\'s words and keeps the rest', async () => {
    const { wf, wl } = await load();
    switchTo('table');

    wl.createList('spanish', 'EspanolSaboVerbos');
    wl.addToList('spanish', 'EspanolSaboVerbos', 'ser');

    wl.saveListFilterState('spanish', {
      active: true,
      mode: 'hide',
      selected: [wl.qualifyListName('spanish', 'EspanolSaboVerbos')],
    });

    const result = wf.filterWords(WORDS);
    expect(result.map(w => w.word)).toEqual(['casa', 'hola', 'rojo']);
  });

  it('an inactive filter changes nothing, even with a list selected', async () => {
    const { wf, wl } = await load();
    switchTo('table');

    wl.createList('spanish', 'EspanolSaboVerbos');
    wl.addToList('spanish', 'EspanolSaboVerbos', 'ser');

    wl.saveListFilterState('spanish', {
      active: false,
      mode: 'focus',
      selected: [wl.qualifyListName('spanish', 'EspanolSaboVerbos')],
    });

    const result = wf.filterWords(WORDS);
    expect(result.map(w => w.word)).toEqual(WORDS.map(w => w.word));
  });

  it('normalizes a legacy unqualified entry instead of leaking its whole list into Focus', async () => {
    // Reproduces a real bug: a list name saved without the qualifyListName()
    // prefix (profile-panel.ts used to do this) can never be recognized by
    // the checkbox UI's qualified-string comparisons — it can't render as
    // checked and can't be unchecked, so it sits there forever silently
    // widening Focus/Hide to include that whole other list's words, while
    // the checkboxes on screen look like only one thing is selected.
    const { wf, wl } = await load();
    switchTo('table');

    wl.createList('spanish', 'EspanolSaboVerbos');
    wl.addToList('spanish', 'EspanolSaboVerbos', 'ser');
    wl.createList('spanish', 'Ghost');
    ['casa', 'hola'].forEach(w => wl.addToList('spanish', 'Ghost', w));

    // Written the way a pre-fix bug would have: 'Ghost' unqualified,
    // 'EspanolSaboVerbos' qualified the way a real checkbox click would.
    wl.saveListFilterState('spanish', {
      active: true,
      mode: 'focus',
      selected: ['Ghost', wl.qualifyListName('spanish', 'EspanolSaboVerbos')],
    });

    // The very next read should already see both entries in the same
    // (qualified) form — this is what the checkbox UI's `selectedSet.has(...)`
    // checks against, so a normalized entry is one that can finally be seen
    // and unchecked, instead of an invisible permanent leak.
    const state = wl.getListFilterState('spanish');
    expect(state.selected).toEqual([
      wl.qualifyListName('spanish', 'Ghost'),
      wl.qualifyListName('spanish', 'EspanolSaboVerbos'),
    ]);

    // And filterWords() correctly treats it as "Focus on Ghost AND
    // EspanolSaboVerbos" — not a silent invisible union the UI can't show.
    const result = wf.filterWords(WORDS);
    expect(result.map(w => w.word).sort()).toEqual(['casa', 'hola', 'ser']);
  });

  it('does not leak a different mode\'s list selection into Table\'s own bucket', async () => {
    const { wf, wl } = await load();
    const state = await import('../../src/client/filters/filter-state.ts');

    // Unlink Picture and set it up to focus on a big list.
    switchTo('picture');
    state.toggleChain('list', (from, to) => wl.copyListFilterState('spanish', from, to));
    wl.createList('spanish', 'Everything');
    ['ser', 'casa', 'hola', 'rojo'].forEach(w => wl.addToList('spanish', 'Everything', w));
    wl.saveListFilterState('spanish', {
      active: true,
      mode: 'focus',
      selected: [wl.qualifyListName('spanish', 'Everything')],
    });

    // Table, still on the shared/own bucket, gets its own narrow list.
    switchTo('table');
    wl.createList('spanish', 'EspanolSaboVerbos');
    wl.addToList('spanish', 'EspanolSaboVerbos', 'ser');
    wl.saveListFilterState('spanish', {
      active: true,
      mode: 'focus',
      selected: [wl.qualifyListName('spanish', 'EspanolSaboVerbos')],
    }, 'table');

    const result = wf.filterWords(WORDS);
    expect(result.map(w => w.word)).toEqual(['ser']);
  });
});

describe('List filter — smart lists', () => {
  it('folds a smart list\'s live matches into Focus, same as a stored list', async () => {
    // getCachedWords is a synchronous read of data-loader's in-memory cache —
    // filterWords can't await a fetch mid-filter, so a smart-list branch has
    // to work from whatever's already loaded. Stub it directly rather than
    // going through the real (async, fetch-based) loader. Registered before
    // load() dynamically imports word-filters.ts, so its static import of
    // data-loader.ts resolves to this mock rather than the real module.
    vi.doMock('../../src/client/data/data-loader.ts', () => ({
      getCachedWords: (lang: string) => (lang === 'spanish' ? WORDS : null),
    }));
    const { wf, wl } = await load();
    const smart = await import('../../src/client/modes/my-lists/smart-lists.ts');
    switchTo('table');

    smart.saveSmartRule('spanish', 'Verbs only', { ...smart.DEFAULT_SMART_RULE, pos: ['verb'] });
    wl.saveListFilterState('spanish', {
      active: true,
      mode: 'focus',
      selected: [wl.qualifySmartListName('spanish', 'Verbs only')],
    });

    const result = wf.filterWords(WORDS);
    expect(result.map(w => w.word)).toEqual(['ser']);
  });

  it('a smart list for a language with no cached vocab contributes nothing, and does not throw', async () => {
    vi.doMock('../../src/client/data/data-loader.ts', () => ({
      getCachedWords: () => null,
    }));
    const { wf, wl } = await load();
    const smart = await import('../../src/client/modes/my-lists/smart-lists.ts');
    switchTo('table');

    smart.saveSmartRule('spanish', 'Verbs only', { ...smart.DEFAULT_SMART_RULE, pos: ['verb'] });
    wl.saveListFilterState('spanish', {
      active: true,
      mode: 'focus',
      selected: [wl.qualifySmartListName('spanish', 'Verbs only')],
    });

    // Focus with an empty match set (nothing loaded to evaluate against)
    // correctly narrows to nothing, rather than throwing or falling through
    // to "everything" — same as Focus on an empty stored list would.
    expect(() => wf.filterWords(WORDS)).not.toThrow();
    expect(wf.filterWords(WORDS)).toEqual([]);
  });
});

describe('Domains filter — read freshly, not from a stale in-memory cache', () => {
  it('getSelectedDomains reflects storage for the current scope even when loadFromBucket() was never called for it', async () => {
    const { domain } = await load();
    const { writeJson } = await import('../../src/client/utils/storage.ts');
    const { bucketFor } = await import('../../src/client/filters/filter-state.ts');

    switchTo('table');
    const bucket = bucketFor('domain');
    writeJson(`vq_domainfilter_spanish__${bucket}`, { active: true, selected: ['food'] });

    // Nothing has called loadFromBucket()/updateDomainFilter() in this test —
    // simulating Start Quiz reading the filter cold, the way start-handler.ts
    // does, rather than through a mode-switch or language-change handler.
    expect(domain.getSelectedDomains()).toEqual(['food']);
  });

  it('reflects "off" immediately too, not just a selection', async () => {
    const { domain } = await load();
    const { writeJson } = await import('../../src/client/utils/storage.ts');
    const { bucketFor } = await import('../../src/client/filters/filter-state.ts');

    switchTo('table');
    const bucket = bucketFor('domain');
    writeJson(`vq_domainfilter_spanish__${bucket}`, { active: false, selected: ['food'] });

    expect(domain.getSelectedDomains()).toEqual([]);
  });

  it('an unlinked mode keeps its own selection separate from a linked one', async () => {
    const { domain } = await load();
    const { writeJson, readJson } = await import('../../src/client/utils/storage.ts');
    const state = await import('../../src/client/filters/filter-state.ts');

    // Unlink Picture, then give it its own domain selection.
    switchTo('picture');
    state.toggleChain('domain', (from, to) => {
      writeJson(`vq_domainfilter_spanish__${to}`, readJson(`vq_domainfilter_spanish__${from}`, { active: true, selected: [] }));
    });
    writeJson('vq_domainfilter_spanish__picture', { active: true, selected: ['travel'] });

    // Table, still on the shared bucket, gets a different selection.
    switchTo('table');
    writeJson(`vq_domainfilter_spanish__${state.bucketFor('domain')}`, { active: true, selected: ['food'] });
    expect(domain.getSelectedDomains()).toEqual(['food']);

    switchTo('picture');
    expect(domain.getSelectedDomains()).toEqual(['travel']);
  });
});

describe('applyDomainFilter — shared by the base list, "N New" top-up and verbs/illustrated top-up', () => {
  it('passes everything through when nothing is selected', async () => {
    const { domain } = await load();
    expect(domain.applyDomainFilter(WORDS, [])).toEqual(WORDS);
  });

  it('keeps a word tagged with any selected domain (OR, not AND)', async () => {
    const { domain } = await load();
    const words = [
      word({ word: 'a', domains: ['food'] }),
      word({ word: 'b', domains: ['travel'] }),
      word({ word: 'c', domains: ['food', 'travel'] }),
      word({ word: 'd', domains: ['sports'] }),
    ];
    const result = domain.applyDomainFilter(words, ['food', 'travel']);
    expect(result.map(w => w.word)).toEqual(['a', 'b', 'c']);
  });

  it('drops a word that carries no domain data at all — untagged is not a free pass', async () => {
    // Regression: this used to let every untagged word through regardless of
    // selection, so picking a single domain out of a language where most
    // words simply aren't tagged with anything surfaced thousands of
    // unrelated words instead of narrowing the pool.
    const { domain } = await load();
    const words = [word({ word: 'undomained', domains: [] }), word({ word: 'tagged', domains: ['food'] })];
    const result = domain.applyDomainFilter(words, ['travel']);
    expect(result.map(w => w.word)).toEqual([]);
  });
});

describe('Combined filters in Table mode', () => {
  it('class + domain + list filters all narrow the pool together', async () => {
    const { wf, wl, domain, cls } = await load();
    switchTo('table');

    // Class filter: verbs and nouns only.
    cls.applyClassSelection(['verb', 'noun'], true);

    // Domain filter: 'greeting' only.
    domain.applyDomainSelection(['greeting'], true);

    // List filter: Focus on a list holding casa and hola.
    wl.createList('spanish', 'Practice');
    wl.addToList('spanish', 'Practice', 'casa');
    wl.addToList('spanish', 'Practice', 'hola');
    wl.saveListFilterState('spanish', {
      active: true,
      mode: 'focus',
      selected: [wl.qualifyListName('spanish', 'Practice')],
    });

    // Class + domain are applied by start-handler.ts, not filterWords() —
    // filterWords() only owns the list (and swear) filter. Assert each layer
    // narrows correctly and that they compose to the same intersection
    // start-handler.ts would compute.
    const afterList = wf.filterWords(WORDS);
    expect(afterList.map(w => w.word)).toEqual(['casa', 'hola']);

    expect(cls.getSelectedClasses()).toEqual(['verb', 'noun']);
    expect(domain.getSelectedDomains()).toEqual(['greeting']);

    // Class filtering happens upstream of Start Quiz (app.ts's base-list pool
    // slice); domain filtering is start-handler.ts's applyDomainFilter(); both
    // compose with the list filter exactly the way Start Quiz chains them.
    const wordsWithDomains: Word[] = WORDS.map(w => ({ ...w, domains: w.word === 'casa' ? ['greeting'] : ['other'] }));
    const selectedClasses = cls.getSelectedClasses();
    const afterListWithDomains = wf.filterWords(wordsWithDomains);
    const afterDomain = domain.applyDomainFilter(afterListWithDomains, domain.getSelectedDomains());
    const afterAll    = afterDomain.filter(w => selectedClasses.length === 0 || selectedClasses.includes(w.pos ?? ''));
    // Only 'casa' is in the focused list AND tagged 'greeting' AND a noun.
    expect(afterAll.map(w => w.word)).toEqual(['casa']);
  });
});
