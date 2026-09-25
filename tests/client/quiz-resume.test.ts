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

const { saveResume, loadResume, clearResume, answeredCount, resolveWords, RESUME_MAX_AGE_MS } =
  await import('../../src/client/utils/quiz-resume.js');

beforeEach(() => store.clear());

const base = {
  savedAt: 1_000_000, lang: 'spanish', columns: 2, direction: 'target-en', pageIndex: 1, elapsed: 42,
  words: [{ word: 'casa' }, { word: 'perro' }],
  state: [
    ['spanish:casa', { value: 'house', disabled: true, stateClass: 'correct' }],
    ['spanish:perro', { value: '', disabled: false }],
  ] as [string, Record<string, unknown>][],
};

describe('save / load', () => {
  it('round-trips a quiz', () => {
    expect(saveResume(base)).toBe(true);
    expect(loadResume(base.savedAt + 1000)).toMatchObject({ lang: 'spanish', pageIndex: 1, elapsed: 42, words: base.words });
    // (base.state has no dir, so it is filtered out on load — see the shape test below)
  });

  it('offers nothing when nothing was saved, or after clear', () => {
    expect(loadResume()).toBeNull();
    saveResume(base);
    clearResume();
    expect(loadResume(base.savedAt)).toBeNull();
  });

  it('drops (and forgets) a save older than a day', () => {
    saveResume(base);
    expect(loadResume(base.savedAt + RESUME_MAX_AGE_MS + 1)).toBeNull();
    expect(loadResume(base.savedAt)).toBeNull();   // it was removed, not just skipped
  });

  it('drops answers that are not shaped the way the quiz reads them', () => {
    saveResume({
      ...base,
      state: [
        ['ok', { value: 'x', disabled: true, stateClass: 'correct', dir: 'target-en' }],
        ['bad-class', { value: 'x', disabled: true, stateClass: 'weird', dir: 'target-en' }],
        ['no-dir', { value: 'x', disabled: true, stateClass: '' }],
      ],
    });
    expect(loadResume(base.savedAt)?.state.map(([k]) => k)).toEqual(['ok']);
  });

  it('ignores a corrupt or foreign value instead of throwing', () => {
    store.set('vq_resume_table', '{"v":99,"nope":true}');
    expect(loadResume()).toBeNull();
    store.set('vq_resume_table', 'not json');
    expect(loadResume()).toBeNull();
  });
});

describe('answeredCount', () => {
  it('counts locked or non-empty answers only', () => {
    expect(answeredCount(base)).toBe(1);
    expect(answeredCount({ state: [['a', { value: 'x' }], ['b', {}]] })).toBe(1);
  });
});

describe('resolveWords', () => {
  const vocab = new Map([
    ['spanish', [{ word: 'casa', rank: 1 }, { word: 'perro', rank: 2 }]],
    ['french',  [{ word: 'maison', rank: 1 }]],
  ]);

  it('keeps the saved order and drops words that no longer exist', () => {
    const { words, missing } = resolveWords([{ word: 'perro' }, { word: 'gone' }, { word: 'casa' }], vocab, 'spanish');
    expect(words.map(w => w.word)).toEqual(['perro', 'casa']);
    expect(missing).toBe(1);
  });

  it('resolves Compare-mode words against their own language', () => {
    const { words } = resolveWords([{ word: 'casa' }, { word: 'maison', language: 'french' }], vocab, 'spanish');
    expect(words.map(w => [w.word, (w as { language?: string }).language]))
      .toEqual([['casa', undefined], ['maison', 'french']]);
  });
});
