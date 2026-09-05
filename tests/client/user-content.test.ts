/**
 * user-content.test.ts — the My Content tab's storage layer
 * (src/client/data/user-content.ts): custom words/trivia/Guess-the-Blank
 * questions, picture and word overrides, and backup import.
 *
 * Node environment with an in-memory localStorage stub, same pattern as
 * mastery.test.ts. downloadUserContent()/buildUserContentBackup() are not
 * covered here — they only assemble the same getters tested below and then
 * hand off to Blob/URL/document, which is DOM plumbing rather than logic.
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
  getUserWords, addUserWord, removeUserWord, toWord,
  getUserTriviaQuestions, addUserTriviaQuestion,
  getUserGuessBlankQuestions, addUserGuessBlankQuestion,
  getPictureOverrides, getPictureOverride, setPictureOverride, removePictureOverride, isImageOverride,
  getWordOverride, getWordOverrides, setWordFields, setGlossHidden, setGlossOrderOverride,
  addGlossOverride, removeAddedGloss, removeWordOverride, applyGlossOrder, applyWordOverride,
  setGlossMeaningNote,
  applyUserContentImport,
} = await import('../../src/client/data/user-content.js');

let n = 0;
/** A fresh language per test, so no test can see another's stored keys. */
function lang(): string { return `lang${n++}`; }

const baseWord = {
  word: 'perro', translation: 'dog', extraGlosses: [], pos: 'noun',
  domains: [], notes: '', examples: [], difficulty: null, tags: [],
  synonyms: [], antonyms: [], disambiguator: '', meaningDisambiguators: {},
};

beforeEach(() => store.clear());

// ── Words ────────────────────────────────────────────────────────────────────

describe('user words', () => {
  it('round-trips through add/get, assigning an id', () => {
    const l = lang();
    const added = addUserWord(l, baseWord);
    expect(added.id).toMatch(/^w-/);
    expect(getUserWords(l)).toEqual([added]);
  });

  it('removes by id and leaves the rest', () => {
    const l = lang();
    const a = addUserWord(l, baseWord);
    const b = addUserWord(l, { ...baseWord, word: 'gato', translation: 'cat' });
    removeUserWord(l, a.id);
    expect(getUserWords(l)).toEqual([b]);
  });

  it('is scoped per language', () => {
    const a = lang(), b = lang();
    addUserWord(a, baseWord);
    expect(getUserWords(b)).toEqual([]);
  });

  it('normalizes a record missing newer fields instead of trusting it', () => {
    const l = lang();
    store.set(`uc_words_${l}`, JSON.stringify([{ id: 'w-1', word: 'perro', translation: 'dog' }]));
    expect(getUserWords(l)).toEqual([{
      id: 'w-1', word: 'perro', translation: 'dog',
      extraGlosses: [], pos: null, domains: [], notes: '', examples: [],
      difficulty: null, tags: [], synonyms: [], antonyms: [],
      disambiguator: '', meaningDisambiguators: {},
    }]);
  });

  it('returns nothing for a corrupt store rather than throwing', () => {
    const l = lang();
    store.set(`uc_words_${l}`, '{not json');
    expect(getUserWords(l)).toEqual([]);
  });
});

describe('toWord', () => {
  it('leads glosses with the primary translation, then extras', () => {
    const w = toWord({ ...baseWord, extraGlosses: ['canine', 'hound'] });
    expect(w.glosses).toEqual(['dog', 'canine', 'hound']);
  });

  it('drops falsy extra glosses', () => {
    const w = toWord({ ...baseWord, extraGlosses: ['', 'canine'] });
    expect(w.glosses).toEqual(['dog', 'canine']);
  });

  it('always ranks a custom word at 0, ahead of every real word', () => {
    expect(toWord(baseWord).rank).toBe(0);
  });

  it('turns empty disambiguators into undefined, not empty strings/objects', () => {
    const w = toWord(baseWord);
    expect(w.disambiguator).toBeUndefined();
    expect(w.meaningDisambiguators).toBeUndefined();
  });

  it('carries a non-empty meaningDisambiguators map through', () => {
    const w = toWord({ ...baseWord, meaningDisambiguators: { dog: 'canine' } });
    expect(w.meaningDisambiguators).toEqual({ dog: 'canine' });
  });

  it('omits relations entirely when there are no synonyms or antonyms', () => {
    expect(toWord(baseWord).relations).toBeUndefined();
  });

  it('builds relations once either synonyms or antonyms are given', () => {
    const w = toWord({ ...baseWord, antonyms: ['gato'] });
    expect(w.relations).toEqual({ synonyms: [], antonyms: ['gato'] });
  });
});

// ── Trivia / Guess the Blank ─────────────────────────────────────────────────

describe('user trivia and guess-the-blank questions', () => {
  it('normalizes a legacy trivia question missing English fields', () => {
    const l = lang();
    store.set(`uc_trivia_${l}`, JSON.stringify([
      { id: 'tq-1', questionTarget: '¿Qué?', answersTarget: ['algo'] },
    ]));
    const [q] = getUserTriviaQuestions(l);
    expect(q.questionEn).toBe('¿Qué?');   // falls back to the target text
    expect(q.answersEn).toEqual(['algo']);
    expect(q.category).toBe('pop-culture');
    expect(q.difficulty).toBe('medium');
  });

  it('adds and reads back a trivia question with a fresh id', () => {
    const l = lang();
    const added = addUserTriviaQuestion(l, {
      questionTarget: '¿Qué?', answersTarget: ['algo'], questionEn: 'What?', answersEn: ['something'],
      category: 'history', difficulty: 'easy', readingDifficulty: 'easy', readingLength: 'short', answerType: 'thing', domains: [],
    });
    expect(added.id).toMatch(/^tq-/);
    expect(getUserTriviaQuestions(l)).toEqual([added]);
  });

  it('normalizes a legacy guess-the-blank question missing English fields', () => {
    const l = lang();
    store.set(`uc_guessblank_${l}`, JSON.stringify([
      { id: 'gb-1', answerTarget: 'perro', cluesTarget: ['ladra'] },
    ]));
    const [q] = getUserGuessBlankQuestions(l);
    expect(q.answerEn).toBe('perro');
    expect(q.cluesEn).toEqual([]);
    expect(q.category).toBe('object');
  });

  it('adds a guess-the-blank question with a fresh id', () => {
    const l = lang();
    const added = addUserGuessBlankQuestion(l, {
      answerTarget: 'perro', answerEn: 'dog', cluesTarget: ['ladra'], cluesEn: ['barks'],
      category: 'animal', difficulty: 'easy',
    });
    expect(added.id).toMatch(/^gb-/);
  });
});

// ── Picture overrides ────────────────────────────────────────────────────────

describe('picture overrides', () => {
  it('round-trips and normalizes the lookup key (trim + lowercase)', () => {
    const l = lang();
    setPictureOverride(l, '  Perro ', '🐶');
    expect(getPictureOverride(l, 'perro')).toBe('🐶');
    expect(getPictureOverride(l, 'PERRO')).toBe('🐶');
  });

  it('is null for a word with no override', () => {
    expect(getPictureOverride(lang(), 'perro')).toBeNull();
  });

  it('removes only the given word', () => {
    const l = lang();
    setPictureOverride(l, 'perro', '🐶');
    setPictureOverride(l, 'gato', '🐱');
    removePictureOverride(l, 'perro');
    expect(getPictureOverrides(l)).toEqual({ gato: '🐱' });
  });

  it('does not resolve a word that shadows an Object.prototype member', () => {
    // Regression guard for the exact bug ownGet() exists to prevent: a plain
    // {} parsed from JSON still has Object.prototype behind it, so bracket
    // access on an absent "constructor"/"toString" key isn't really absent.
    expect(getPictureOverride(lang(), 'constructor')).toBeNull();
    expect(getPictureOverride(lang(), 'toString')).toBeNull();
  });

  it('still finds a real override stored under such a key', () => {
    const l = lang();
    setPictureOverride(l, 'constructor', '🏗️');
    expect(getPictureOverride(l, 'constructor')).toBe('🏗️');
  });
});

describe('isImageOverride', () => {
  it.each([
    ['https://example.com/x.png', true],
    ['http://example.com/x.png', true],
    ['/local/path.svg', true],
    ['data:image/png;base64,AAAA', true],
    ['🐶', false],
    ['', false],
  ])('%s -> %s', (value, expected) => {
    expect(isImageOverride(value)).toBe(expected);
  });
});

// ── Word overrides ───────────────────────────────────────────────────────────

describe('word overrides', () => {
  it('is null for a word with no override', () => {
    expect(getWordOverride(lang(), 'perro')).toBeNull();
  });

  it('setWordFields sets and can clear a field by omitting it', () => {
    const l = lang();
    setWordFields(l, 'perro', { translation: 'doggo', notes: 'informal' });
    expect(getWordOverride(l, 'perro')).toEqual({ translation: 'doggo', notes: 'informal' });

    // Editing "notes" back to the real value means the caller stops passing
    // it — that un-overrides just that field, per setWordFields' own doc.
    setWordFields(l, 'perro', { translation: 'doggo' });
    expect(getWordOverride(l, 'perro')).toEqual({ translation: 'doggo' });
  });

  it('setWordFields does not disturb hiddenGlosses/glossOrder/addedGlosses set another way', () => {
    const l = lang();
    setGlossHidden(l, 'perro', 'canine', true);
    setWordFields(l, 'perro', { translation: 'doggo' });
    expect(getWordOverride(l, 'perro')).toEqual({ translation: 'doggo', hiddenGlosses: ['canine'] });
  });

  it('setGlossHidden toggles membership without disturbing other hidden glosses', () => {
    const l = lang();
    setGlossHidden(l, 'perro', 'canine', true);
    setGlossHidden(l, 'perro', 'hound', true);
    setGlossHidden(l, 'perro', 'canine', false);
    expect(getWordOverride(l, 'perro')?.hiddenGlosses).toEqual(['hound']);
  });

  it('addGlossOverride trims, and ignores a blank or duplicate addition', () => {
    const l = lang();
    addGlossOverride(l, 'perro', '  mutt  ');
    addGlossOverride(l, 'perro', '   ');
    addGlossOverride(l, 'perro', 'mutt');
    expect(getWordOverride(l, 'perro')?.addedGlosses).toEqual(['mutt']);
  });

  it('removeAddedGloss removes one added gloss and no-ops if there were none', () => {
    const l = lang();
    expect(() => removeAddedGloss(l, 'perro', 'mutt')).not.toThrow();
    addGlossOverride(l, 'perro', 'mutt');
    addGlossOverride(l, 'perro', 'pooch');
    removeAddedGloss(l, 'perro', 'mutt');
    expect(getWordOverride(l, 'perro')?.addedGlosses).toEqual(['pooch']);
  });

  it('setGlossMeaningNote sets one gloss\'s note without disturbing another\'s', () => {
    const l = lang();
    setGlossMeaningNote(l, 'perro', 'dog', 'generic');
    setGlossMeaningNote(l, 'perro', 'canine', 'formal');
    expect(getWordOverride(l, 'perro')?.meaningDisambiguators).toEqual({ dog: 'generic', canine: 'formal' });
  });

  it('setGlossMeaningNote clears a note by blanking it, leaving others intact', () => {
    const l = lang();
    setGlossMeaningNote(l, 'perro', 'dog', 'generic');
    setGlossMeaningNote(l, 'perro', 'canine', 'formal');
    setGlossMeaningNote(l, 'perro', 'dog', '   ');
    expect(getWordOverride(l, 'perro')?.meaningDisambiguators).toEqual({ canine: 'formal' });
  });

  it('removeWordOverride clears the whole entry', () => {
    const l = lang();
    setWordFields(l, 'perro', { translation: 'doggo' });
    removeWordOverride(l, 'perro');
    expect(getWordOverride(l, 'perro')).toBeNull();
  });

  it('migrates a legacy glossorder-only key into the word-override record', () => {
    const l = lang();
    store.set(`uc_glossorder_${l}`, JSON.stringify({ perro: ['b', 'a'] }));
    expect(getWordOverrides(l)).toEqual({ perro: { glossOrder: ['b', 'a'] } });
    expect(store.has(`uc_glossorder_${l}`)).toBe(false); // one-way
  });

  it('legacy migration merges into an override that already exists, rather than replacing it', () => {
    const l = lang();
    setWordFields(l, 'perro', { translation: 'doggo' });
    store.set(`uc_glossorder_${l}`, JSON.stringify({ perro: ['b', 'a'] }));
    expect(getWordOverrides(l)).toEqual({ perro: { translation: 'doggo', glossOrder: ['b', 'a'] } });
  });
});

describe('applyGlossOrder', () => {
  it('sorts known glosses by the saved order and appends unknown ones after', () => {
    expect(applyGlossOrder(['a', 'b', 'c'], ['c', 'a'])).toEqual(['c', 'a', 'b']);
  });

  it('drops order entries for glosses that no longer exist', () => {
    expect(applyGlossOrder(['a', 'b'], ['gone', 'b', 'a'])).toEqual(['b', 'a']);
  });

  it('is a no-op for an empty order', () => {
    expect(applyGlossOrder(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('applyWordOverride', () => {
  const word = {
    word: 'perro', translation: 'dog', pos: 'noun', difficulty: 2, notes: '',
    glosses: ['dog', 'canine'], examples: [], svg_url: null, emoji: null,
    linguistic: null, frequency: 100, domains: ['animals'], tags: [], rank: 5,
  };

  it('returns the word unchanged when there is no override', () => {
    expect(applyWordOverride(lang(), word)).toEqual(word);
  });

  it('applies a translation/notes/domains override on top of the original', () => {
    const l = lang();
    setWordFields(l, 'perro', { translation: 'doggo', notes: 'informal', domains: ['pets'] });
    const result = applyWordOverride(l, word);
    expect(result.translation).toBe('doggo');
    expect(result.notes).toBe('informal');
    expect(result.domains).toEqual(['pets']);
    expect(result.pos).toBe('noun'); // untouched field keeps its original value
  });

  it('an explicit pos:null override is honored, unlike a missing override', () => {
    const l = lang();
    setWordFields(l, 'perro', { pos: null });
    expect(applyWordOverride(l, word).pos).toBeNull();
  });

  it('an explicit difficulty:null override is honored, unlike a missing override', () => {
    const l = lang();
    setWordFields(l, 'perro', { difficulty: null });
    expect(applyWordOverride(l, word).difficulty).toBeNull();
  });

  it('hides glosses before reordering, so glossOrder never has to name a hidden one', () => {
    const l = lang();
    setGlossHidden(l, 'perro', 'dog', true);
    setGlossOrderOverride(l, 'perro', ['dog', 'canine']); // 'dog' is hidden, so ignored
    expect(applyWordOverride(l, word).glosses).toEqual(['canine']);
  });

  it('appends added glosses before hide/reorder run, so they can be hidden or ordered too', () => {
    const l = lang();
    addGlossOverride(l, 'perro', 'mutt');
    setGlossOrderOverride(l, 'perro', ['mutt', 'dog', 'canine']);
    expect(applyWordOverride(l, word).glosses).toEqual(['mutt', 'dog', 'canine']);
  });

  it('overrides relations only for the side actually given', () => {
    const l = lang();
    setWordFields(l, 'perro', { synonyms: ['can'] });
    expect(applyWordOverride(l, word).relations).toEqual({ synonyms: ['can'], antonyms: undefined });
  });

  it('merges per-gloss meaning notes rather than replacing the whole map', () => {
    const l = lang();
    const wordWithNote = { ...word, meaningDisambiguators: { dog: 'generic' } };
    setGlossMeaningNote(l, 'perro', 'canine', 'formal');
    // 'dog' keeps the word's own note; 'canine' gets the override's — neither
    // side had to repeat what the other already said.
    expect(applyWordOverride(l, wordWithNote).meaningDisambiguators).toEqual({ dog: 'generic', canine: 'formal' });
  });

  it('an override note for a gloss replaces the word\'s own note for it', () => {
    const l = lang();
    const wordWithNote = { ...word, meaningDisambiguators: { dog: 'generic' } };
    setGlossMeaningNote(l, 'perro', 'dog', 'overridden');
    expect(applyWordOverride(l, wordWithNote).meaningDisambiguators).toEqual({ dog: 'overridden' });
  });
});

// ── Import ───────────────────────────────────────────────────────────────────

describe('applyUserContentImport', () => {
  it('rejects a file with none of the expected top-level keys', () => {
    expect(() => applyUserContentImport(JSON.stringify({ foo: 'bar' })))
      .toThrow(/does not look like/);
  });

  it('rejects unparsable JSON', () => {
    expect(() => applyUserContentImport('{not json')).toThrow();
  });

  it('imports words under fresh ids, even if the export carried old ones', () => {
    const l = lang();
    const preexisting = addUserWord(l, baseWord);
    applyUserContentImport(JSON.stringify({
      version: 1, words: { [l]: [{ id: preexisting.id, word: 'gato', translation: 'cat' }] },
    }));
    const words = getUserWords(l);
    expect(words).toHaveLength(2);
    expect(words[1].id).not.toBe(preexisting.id);
    expect(words[1].word).toBe('gato');
  });

  it('skips a word entry with no word text', () => {
    const l = lang();
    const summary = applyUserContentImport(JSON.stringify({
      version: 1, words: { [l]: [{ translation: 'cat' }] },
    }));
    expect(getUserWords(l)).toEqual([]);
    expect(summary).toContain('0 words');
  });

  it('importing the same file twice duplicates rather than collides', () => {
    const l = lang();
    const payload = JSON.stringify({ version: 1, words: { [l]: [{ word: 'gato', translation: 'cat' }] } });
    applyUserContentImport(payload);
    applyUserContentImport(payload);
    expect(getUserWords(l)).toHaveLength(2);
  });

  it('merges imported pictures with what is already stored, not replacing it', () => {
    const l = lang();
    setPictureOverride(l, 'perro', '🐶');
    applyUserContentImport(JSON.stringify({ version: 1, pictures: { [l]: { gato: '🐱' } } }));
    expect(getPictureOverrides(l)).toEqual({ perro: '🐶', gato: '🐱' });
  });

  it('merges imported word overrides with what is already stored', () => {
    const l = lang();
    setWordFields(l, 'perro', { translation: 'doggo' });
    applyUserContentImport(JSON.stringify({
      version: 1, wordOverrides: { [l]: { gato: { translation: 'kitty' } } },
    }));
    expect(getWordOverrides(l)).toEqual({
      perro: { translation: 'doggo' },
      gato: { translation: 'kitty' },
    });
  });

  it('folds a legacy glossOrders-only export into word overrides', () => {
    const l = lang();
    applyUserContentImport(JSON.stringify({
      version: 1, glossOrders: { [l]: { perro: ['b', 'a'] } },
    }));
    expect(getWordOverrides(l)).toEqual({ perro: { glossOrder: ['b', 'a'] } });
  });

  it('imports trivia and guess-the-blank questions, skipping malformed entries', () => {
    const l = lang();
    const summary = applyUserContentImport(JSON.stringify({
      version: 1,
      trivia: { [l]: [{ questionTarget: '¿Qué?', answersTarget: ['algo'] }, { bad: true }] },
      guessBlank: { [l]: [{ answerTarget: 'perro', cluesTarget: ['ladra'] }, {}] },
    }));
    expect(getUserTriviaQuestions(l)).toHaveLength(1);
    expect(getUserGuessBlankQuestions(l)).toHaveLength(1);
    expect(summary).toContain('1 trivia question');
    expect(summary).toContain('1 Guess the Blank question');
  });

  it('summarizes counts with correct singular/plural wording', () => {
    const l = lang();
    const summary = applyUserContentImport(JSON.stringify({
      version: 1, words: { [l]: [{ word: 'gato', translation: 'cat' }] },
    }));
    expect(summary).toBe('Imported 1 word, 0 trivia questions, 0 Guess the Blank questions, 0 pictures, 0 word overrides');
  });
});
