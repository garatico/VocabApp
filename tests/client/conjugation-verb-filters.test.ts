/**
 * conjugation-verb-filters.test.ts — dropRedundantReflexives().
 *
 * Reproduces a reported bug: "divertirse" showed up as its own Conjugation
 * drill target right alongside "divertir", even though the two conjugate
 * identically apart from the reflexive clitic. Most reflexive verbs
 * (ducharse, quejarse, …) have no non-reflexive counterpart in the database
 * at all and must stay their own headword — only the specific shape "word is
 * exactly infinitive + 'se', AND that bare infinitive is also present in the
 * same pool" is redundant, so the fix has to be scoped that narrowly rather
 * than dropping every reflexive verb.
 */

import { describe, it, expect } from 'vitest';
import { dropRedundantReflexives } from '../../src/client/modes/conjugation/verb-filters.ts';
import type { Word } from '../../src/client/types.ts';

function verb(word: string, infinitive: string, overrides: Partial<Word> = {}): Word {
  return {
    word,
    translation: word,
    pos: 'verb',
    glosses: [word],
    examples: [],
    svg_url: null,
    emoji: null,
    linguistic: { infinitive } as Word['linguistic'],
    domains: [],
    ...overrides,
  } as Word;
}

describe('dropRedundantReflexives', () => {
  it('drops the reflexive twin when the bare infinitive is also present', () => {
    const words = [verb('divertir', 'divertir'), verb('divertirse', 'divertir')];
    const result = dropRedundantReflexives(words);
    expect(result.map(w => w.word)).toEqual(['divertir']);
  });

  it('keeps a reflexive-only verb with no bare-infinitive counterpart in the pool', () => {
    const words = [verb('ducharse', 'duchar'), verb('quejarse', 'quejar')];
    const result = dropRedundantReflexives(words);
    expect(result.map(w => w.word)).toEqual(['ducharse', 'quejarse']);
  });

  it('does not touch verbs with no infinitive recorded at all', () => {
    const words = [verb('hablar', 'hablar'), verb('comer', 'comer')];
    const result = dropRedundantReflexives(words);
    expect(result.map(w => w.word)).toEqual(['hablar', 'comer']);
  });

  it('is order-independent — the bare infinitive can appear after its reflexive twin', () => {
    const words = [verb('divertirse', 'divertir'), verb('divertir', 'divertir')];
    const result = dropRedundantReflexives(words);
    expect(result.map(w => w.word)).toEqual(['divertir']);
  });
});
