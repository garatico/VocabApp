/**
 * conjugation-missing-slots.test.ts — missingDataSlots().
 *
 * Reproduces a reported bug: Conjugation mode's tracking bar could never
 * reach 100% for a verb missing one specific pronoun's form (e.g. no
 * vosotros in the source data) — that slot stayed enabled and counted, but
 * its expected answer was an empty string nothing typed could ever match.
 * missingDataSlots() is what index.ts now folds into the same
 * conj-row-tense-hidden treatment as a tense-wide gap (see
 * hiddenPronounSlots), so the slot is excluded rather than uncompletable.
 */

import { describe, it, expect } from 'vitest';
import { missingDataSlots } from '../../src/client/modes/conjugation/index.ts';
import type { Word } from '../../src/client/types.ts';

const PRONOUNS = ['yo', 'tú', 'él', 'nosotros', 'vosotros', 'ellos'];

function verb(conjugations: Record<string, (string | null)[] | string | null>): Word {
  return {
    word: 'hablar', translation: 'to speak', pos: 'verb', glosses: ['to speak'],
    examples: [], svg_url: null, emoji: null, domains: [],
    linguistic: { conjugations } as unknown as Word['linguistic'],
  } as Word;
}

describe('missingDataSlots', () => {
  it('is empty when every pronoun has a form', () => {
    const w = verb({ present: ['hablo', 'hablas', 'habla', 'hablamos', 'habláis', 'hablan'] });
    expect(missingDataSlots(w, 'present', PRONOUNS).size).toBe(0);
  });

  it('flags a slot the array is simply missing (e.g. no vosotros)', () => {
    const w = verb({ present: ['hablo', 'hablas', 'habla', 'hablamos', undefined as unknown as string, 'hablan'] });
    expect([...missingDataSlots(w, 'present', PRONOUNS)]).toEqual([4]);
  });

  it('flags a slot that is an empty string the same as a missing one', () => {
    const w = verb({ present: ['hablo', 'hablas', 'habla', 'hablamos', '', 'hablan'] });
    expect([...missingDataSlots(w, 'present', PRONOUNS)]).toEqual([4]);
  });

  it('flags a short array\'s trailing slots as missing', () => {
    const w = verb({ present: ['hablo', 'hablas', 'habla'] });
    expect([...missingDataSlots(w, 'present', PRONOUNS)]).toEqual([3, 4, 5]);
  });

  it('is empty for a single-form tense — no pronoun paradigm to have holes in', () => {
    const w = verb({ gerund: 'hablando' });
    expect(missingDataSlots(w, 'gerund', PRONOUNS).size).toBe(0);
  });

  it('is empty when the tense has no data at all — a whole-tense gap is handled upstream (buildCards\' tensesForVerb), not per-slot here', () => {
    const w = verb({});
    expect(missingDataSlots(w, 'present', PRONOUNS).size).toBe(0);
  });
});
