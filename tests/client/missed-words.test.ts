import { describe, it, expect, beforeEach } from 'vitest';
import { setLastMissed, getLastMissed, clearLastMissed } from '../../src/client/utils/missed-words.ts';

beforeEach(() => clearLastMissed());

describe('missed-words', () => {
  it('starts empty', () => {
    expect(getLastMissed()).toBeNull();
  });

  it('keeps the language and de-duplicates words', () => {
    setLastMissed('spanish', ['casa', 'perro', 'casa']);
    expect(getLastMissed()).toEqual({ lang: 'spanish', words: ['casa', 'perro'] });
  });

  it('an empty miss set means there is nothing to offer, replacing any earlier one', () => {
    setLastMissed('spanish', ['casa']);
    setLastMissed('spanish', []);
    expect(getLastMissed()).toBeNull();
  });

  it('clear forgets it', () => {
    setLastMissed('french', ['maison']);
    clearLastMissed();
    expect(getLastMissed()).toBeNull();
  });
});
