/**
 * answer-match.test.ts — every typing quiz grades the same way.
 *
 * Table, Picture and Single Word ask the learner to type an answer, and the
 * Settings panel offers one Flexible/Strict switch that promises "Strict
 * requires exact accents (e.g. está ≠ esta)". Only Table honoured it: Picture
 * had a private matcher that read no setting at all, so the same typo was
 * accepted in one tab and rejected in the next.
 *
 * `matchesAnswer` is now the single entry point all three call. These tests
 * pin the promise the settings copy makes.
 */

import { describe, it, expect } from 'vitest';
import { matchesAnswer } from '../../src/client/utils/utils.ts';
import type { Word } from '../../src/client/types.ts';

function word(overrides: Partial<Word> = {}): Word {
  return {
    word:        'está',
    translation: 'is',
    pos:         'verb',
    glosses:     ['to be'],
    examples:    [],
    svg_url:     null,
    emoji:       null,
    linguistic:  { infinitive: 'estar' },
    rank:        1,
    ...overrides,
  } as Word;
}

describe('matchesAnswer — en-target (type the foreign word)', () => {
  const w = word();

  it('accepts the exact form in both modes', () => {
    expect(matchesAnswer('está', w, 'en-target', 'fuzzy')).toBe(true);
    expect(matchesAnswer('está', w, 'en-target', 'strict')).toBe(true);
  });

  it('forgives a missing accent in fuzzy mode', () => {
    expect(matchesAnswer('esta', w, 'en-target', 'fuzzy')).toBe(true);
  });

  it('requires the accent in strict mode — the promise the settings copy makes', () => {
    expect(matchesAnswer('esta', w, 'en-target', 'strict')).toBe(false);
  });

  it('ignores case and surrounding whitespace in both modes', () => {
    expect(matchesAnswer('  ESTÁ ', w, 'en-target', 'strict')).toBe(true);
    expect(matchesAnswer('  ESTA ', w, 'en-target', 'fuzzy')).toBe(true);
  });

  it('accepts the infinitive for an inflected form', () => {
    // Picture mode's old local matcher compared against `word` only, so this
    // was rejected there and accepted in Table for the same entry.
    expect(matchesAnswer('estar', w, 'en-target', 'fuzzy')).toBe(true);
  });

  it('rejects an empty answer, so an untouched box is never "correct"', () => {
    expect(matchesAnswer('', w, 'en-target', 'fuzzy')).toBe(false);
    expect(matchesAnswer('   ', w, 'en-target', 'strict')).toBe(false);
  });

  it('rejects a different word', () => {
    expect(matchesAnswer('hablar', w, 'en-target', 'fuzzy')).toBe(false);
  });
});

describe('matchesAnswer — target-en (type the English)', () => {
  const w = word({ glosses: ['to speak', 'to talk'] });

  it('accepts any listed gloss', () => {
    expect(matchesAnswer('to speak', w, 'target-en', 'fuzzy')).toBe(true);
    expect(matchesAnswer('to talk',  w, 'target-en', 'fuzzy')).toBe(true);
  });

  it('accepts a bare infinitive as well as the "to" form', () => {
    expect(matchesAnswer('speak', w, 'target-en', 'fuzzy')).toBe(true);
  });

  it('splits comma-separated alternatives', () => {
    const article = word({ glosses: ['a, an'], pos: 'article' });
    expect(matchesAnswer('a',  article, 'target-en', 'fuzzy')).toBe(true);
    expect(matchesAnswer('an', article, 'target-en', 'fuzzy')).toBe(true);
  });

  it('strips parenthetical usage notes', () => {
    const w2 = word({ glosses: ['you (indirect obj.)'], pos: 'pronoun' });
    expect(matchesAnswer('you', w2, 'target-en', 'fuzzy')).toBe(true);
  });

  it('rejects an unrelated answer', () => {
    expect(matchesAnswer('to eat', w, 'target-en', 'fuzzy')).toBe(false);
  });
});

describe('matchesAnswer — default mode', () => {
  it('defaults to fuzzy, matching the app default', () => {
    const w = word();
    expect(matchesAnswer('esta', w, 'en-target')).toBe(true);
  });
});
