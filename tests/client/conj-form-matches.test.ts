/**
 * conj-form-matches.test.ts — what a conjugation cell accepts (modes/conjugation/helpers.ts conjFormMatches):
 * every "a / b" alternative, Latin letters for Russian, no stress marks to type, and Sudden Death's prefix
 * question answered the same way.
 */
import { describe, it, expect } from 'vitest';
import { conjFormMatches } from '../../src/client/modes/conjugation/helpers.js';
import { PRONOUNS, TENSE_DEFS, TENSE_EN } from '../../src/client/modes/conjugation/data.js';
import { LANGUAGES } from '../../src/client/data/languages.js';

describe('conjFormMatches', () => {
  it('matches a single form, accents and case aside, as before', () => {
    expect(conjFormMatches('hablo', 'hablo', 'spanish', true)).toBe(true);
    expect(conjFormMatches('Hablé', 'hablé', 'spanish', true)).toBe(true);
    expect(conjFormMatches('hable', 'hablé', 'spanish', true)).toBe(true);
    expect(conjFormMatches('hablas', 'hablo', 'spanish', true)).toBe(false);
  });

  it('accepts either side of a gendered Russian past', () => {
    const cell = 'писа́л / писа́ла';
    expect(conjFormMatches('писал', cell, 'russian', true)).toBe(true);
    expect(conjFormMatches('писала', cell, 'russian', true)).toBe(true);
    expect(conjFormMatches('писало', cell, 'russian', true)).toBe(false);
    expect(conjFormMatches('писал / писала', cell, 'russian', true)).toBe(false);   // one answer, not the cell
    expect(conjFormMatches('писало', 'писа́л / писа́ла / писа́ло', 'russian', true)).toBe(true);
  });

  it('never needs the stress mark typed', () => {
    expect(conjFormMatches('пишу', 'пишу́', 'russian', true)).toBe(true);
    expect(conjFormMatches('идешь', 'идёшь', 'russian', true)).toBe(true);
  });

  it('accepts Russian in Latin letters, full and while typing', () => {
    expect(conjFormMatches('pishu', 'пишу́', 'russian', true)).toBe(true);
    expect(conjFormMatches('pisala', 'писа́л / писа́ла', 'russian', true)).toBe(true);
    expect(conjFormMatches('budu pisat', 'бу́ду писа́ть', 'russian', true)).toBe(true);
    expect(conjFormMatches('pi', 'пишу́', 'russian', false)).toBe(true);
    expect(conjFormMatches('pisa', 'писа́л / писа́ла', 'russian', false)).toBe(true);
    expect(conjFormMatches('pk', 'пишу́', 'russian', false)).toBe(false);
  });

  it('does not take Latin letters for a language without them', () => {
    expect(conjFormMatches('pishu', 'пишу́', 'spanish', true)).toBe(false);
  });

  it('answers Sudden Death per alternative: a prefix of either side can still be right', () => {
    expect(conjFormMatches('писа', 'писа́л / писа́ла', 'russian', false)).toBe(true);
    expect(conjFormMatches('писали', 'писа́л / писа́ла', 'russian', false)).toBe(false);
    expect(conjFormMatches('', 'пишу́', 'russian', false)).toBe(true);
    expect(conjFormMatches('', 'пишу́', 'russian', true)).toBe(false);
  });

  it('takes a Romanian form with its particle as written', () => {
    expect(conjFormMatches('să scriu', 'să scriu', 'romanian', true)).toBe(true);
    expect(conjFormMatches('sa scriu', 'să scriu', 'romanian', true)).toBe(true);
    expect(conjFormMatches('am scris', 'am scris', 'romanian', true)).toBe(true);
  });
});

describe('every language with conjugations has its grid', () => {
  for (const lang of LANGUAGES.filter(l => l.hasConjugations)) {
    it(`${lang.name}: six pronouns and named tenses`, () => {
      expect(PRONOUNS[lang.name]).toHaveLength(6);
      const defs = TENSE_DEFS[lang.name];
      expect(defs.length).toBeGreaterThan(0);
      for (const d of defs) expect(TENSE_EN[d.key], `${lang.name} ${d.key}`).toBeTruthy();
    });
  }
});
