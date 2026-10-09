/**
 * compound-tenses.test.ts — Portuguese's personal infinitive and the compound tenses of Portuguese and
 * Italian, derived from the row's participle and the auxiliary (pt-tenses.ts, it-tenses.ts).
 */
import { describe, it, expect } from 'vitest';
import { derivePortugueseTenses, personalInfinitiveOf } from '../../src/client/data/pt-tenses.ts';
import { deriveItalianTenses, italianUsesEssere } from '../../src/client/data/it-tenses.ts';

const ptFalar = {
  present:     ['falo', 'falas', 'fala', 'falamos', 'falais', 'falam'],
  preterite:   ['falei', 'falaste', 'falou', 'falámos', 'falastes', 'falaram'],
  subjunctive: ['fale', 'fales', 'fale', 'falemos', 'faleis', 'falem'],
};
const itParlare = {
  present:     ['parlo', 'parli', 'parla', 'parliamo', 'parlate', 'parlano'],
  imperfect:   ['parlavo', 'parlavi', 'parlava', 'parlavamo', 'parlavate', 'parlavano'],
  subjunctive: ['parli', 'parli', 'parli', 'parliamo', 'parliate', 'parlino'],
};
const itAndare = {
  present:     ['vado', 'vai', 'va', 'andiamo', 'andate', 'vanno'],
  imperfect:   ['andavo', 'andavi', 'andava', 'andavamo', 'andavate', 'andavano'],
  subjunctive: ['vada', 'vada', 'vada', 'andiamo', 'andiate', 'vadano'],
};

describe('Portuguese personal infinitive', () => {
  it('is the infinitive plus -, -es, -, -mos, -des, -em', () => {
    expect(personalInfinitiveOf('falar')).toEqual(['falar', 'falares', 'falar', 'falarmos', 'falardes', 'falarem']);
    expect(personalInfinitiveOf('ser')).toEqual(['ser', 'seres', 'ser', 'sermos', 'serdes', 'serem']);
  });
  it('pôr loses its circumflex before an ending', () => {
    expect(personalInfinitiveOf('pôr')).toEqual(['pôr', 'pores', 'pôr', 'pormos', 'pordes', 'porem']);
  });
  it('is added to the row', () => {
    expect(derivePortugueseTenses(ptFalar, 'falar')['personal_infinitive']).toEqual(
      ['falar', 'falares', 'falar', 'falarmos', 'falardes', 'falarem']);
  });
});

describe('Portuguese compound tenses', () => {
  const out = derivePortugueseTenses(ptFalar, 'falar');
  it('are ter + the participle', () => {
    expect(out['present_perfect']).toEqual(['tenho falado', 'tens falado', 'tem falado', 'temos falado', 'tendes falado', 'têm falado']);
    expect(out['pluperfect']![0]).toBe('tinha falado');
    expect(out['future_perfect']![0]).toBe('terei falado');
    expect(out['conditional_perfect']![0]).toBe('teria falado');
    expect(out['subjunctive_perfect']![0]).toBe('tenha falado');
    expect(out['pluperfect_subjunctive']![3]).toBe('tivéssemos falado');
  });
  it('use the short irregular participle', () => {
    expect(derivePortugueseTenses(ptFalar, 'fazer')['present_perfect']![0]).toBe('tenho feito');
  });
  it('never replace a form the row already has', () => {
    const mine = { ...ptFalar, present_perfect: ['x', 'x', 'x', 'x', 'x', 'x'] };
    expect(derivePortugueseTenses(mine, 'falar')['present_perfect']).toEqual(['x', 'x', 'x', 'x', 'x', 'x']);
  });
});

describe('Italian compound tenses', () => {
  it('take avere for a transitive verb', () => {
    const out = deriveItalianTenses(itParlare, 'parlare');
    expect(out['present_perfect']).toEqual(['ho parlato', 'hai parlato', 'ha parlato', 'abbiamo parlato', 'avete parlato', 'hanno parlato']);
    expect(out['pluperfect']![0]).toBe('avevo parlato');
    expect(out['future_perfect']![2]).toBe('avrà parlato');
    expect(out['conditional_perfect']![0]).toBe('avrei parlato');
    expect(out['subjunctive_perfect']![0]).toBe('abbia parlato');
    expect(out['pluperfect_subjunctive']![0]).toBe('avessi parlato');
  });
  it('take essere, with the participle agreeing in the plural, for a verb of motion', () => {
    const out = deriveItalianTenses(itAndare, 'andare');
    expect(out['present_perfect']).toEqual(['sono andato', 'sei andato', 'è andato', 'siamo andati', 'siete andati', 'sono andati']);
    expect(out['pluperfect_subjunctive']![0]).toBe('fossi andato');
  });
  it.each([['andare', true], ['arrivare', true], ['ritornare', true], ['riuscire', true], ['diventare', true],
    ['convenire', true], ['prevenire', false], ['parlare', false], ['mangiare', false], ['avere', false]])(
    'essere for %s → %s', (inf, expected) => expect(italianUsesEssere(inf)).toBe(expected));
  it('leaves a reflexive infinitive alone', () => {
    expect(deriveItalianTenses(itParlare, 'lavarsi')).toBe(itParlare);
  });
});
