import { describe, it, expect } from 'vitest';
import { deriveFrenchTenses, frenchParticipleOf } from '../../src/client/data/fr-tenses.ts';
import { deriveItalianTenses, italianParticipleOf, italianGerundOf } from '../../src/client/data/it-tenses.ts';

describe('French', () => {
  const parler = {
    present:     ['parle', 'parles', 'parle', 'parlons', 'parlez', 'parlent'],
    subjunctive: ['parle', 'parles', 'parle', 'parlions', 'parliez', 'parlent'],
  };
  const finir = {
    present:     ['finis', 'finis', 'finit', 'finissons', 'finissez', 'finissent'],
    subjunctive: ['finisse', 'finisses', 'finisse', 'finissions', 'finissiez', 'finissent'],
  };
  const etre = {
    present:     ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'],
    subjunctive: ['sois', 'sois', 'soit', 'soyons', 'soyez', 'soient'],
  };

  it('imperative: -er drops the s of tu, -ir keeps it, être uses the subjunctive', () => {
    expect(deriveFrenchTenses(parler, 'parler')['imperative_affirmative']).toEqual(['', 'parle', '', 'parlons', 'parlez', '']);
    expect(deriveFrenchTenses(finir, 'finir')['imperative_affirmative']).toEqual(['', 'finis', '', 'finissons', 'finissez', '']);
    expect(deriveFrenchTenses(etre, 'être')['imperative_affirmative']).toEqual(['', 'sois', '', 'soyons', 'soyez', '']);
  });

  it('present participle from the nous form', () => {
    expect(deriveFrenchTenses(parler, 'parler')['gerund']).toBe('parlant');
    expect(deriveFrenchTenses(finir, 'finir')['gerund']).toBe('finissant');
    expect(deriveFrenchTenses(etre, 'être')['gerund']).toBe('étant');
  });

  it.each([['parler', 'parlé'], ['finir', 'fini'], ['vendre', 'vendu'], ['faire', 'fait'], ['prendre', 'pris'],
    ['comprendre', 'compris'], ['permettre', 'permis'], ['ouvrir', 'ouvert'], ['offrir', 'offert'], ['écrire', 'écrit'],
    ['décrire', 'décrit'], ['conduire', 'conduit'], ['revenir', 'revenu'], ['peindre', 'peint'], ['paraître', 'paru'],
    ['revoir', 'revu'], ['recevoir', 'reçu'], ['courir', 'couru'], ['parcourir', 'parcouru'], ['relire', 'relu']])(
    'participle %s → %s', (inf, p) => expect(frenchParticipleOf(inf)).toBe(p));

  it('gives nothing for an unlisted -oir verb rather than a guess', () => {
    expect(frenchParticipleOf('chaloir')).toBe('');
  });

  it('leaves a reflexive infinitive alone', () => {
    expect(deriveFrenchTenses(parler, 'se lever')).toBe(parler);
  });
});

describe('Italian', () => {
  const parlare = {
    present:     ['parlo', 'parli', 'parla', 'parliamo', 'parlate', 'parlano'],
    imperfect:   ['parlavo', 'parlavi', 'parlava', 'parlavamo', 'parlavate', 'parlavano'],
    subjunctive: ['parli', 'parli', 'parli', 'parliamo', 'parliate', 'parlino'],
  };
  const vedere = {
    present:     ['vedo', 'vedi', 'vede', 'vediamo', 'vedete', 'vedono'],
    imperfect:   ['vedevo', 'vedevi', 'vedeva', 'vedevamo', 'vedevate', 'vedevano'],
    subjunctive: ['veda', 'veda', 'veda', 'vediamo', 'vediate', 'vedano'],
  };
  const essere = {
    present:     ['sono', 'sei', 'è', 'siamo', 'siete', 'sono'],
    imperfect:   ['ero', 'eri', 'era', 'eravamo', 'eravate', 'erano'],
    subjunctive: ['sia', 'sia', 'sia', 'siamo', 'siate', 'siano'],
  };

  it('imperative: -are tu is the 3rd singular, -ere tu is the 2nd, essere borrows the subjunctive for voi', () => {
    expect(deriveItalianTenses(parlare, 'parlare')['imperative_affirmative']).toEqual(['', 'parla', 'parli', 'parliamo', 'parlate', 'parlino']);
    expect(deriveItalianTenses(vedere, 'vedere')['imperative_affirmative']).toEqual(['', 'vedi', 'veda', 'vediamo', 'vedete', 'vedano']);
    expect(deriveItalianTenses(essere, 'essere')['imperative_affirmative']).toEqual(['', 'sii', 'sia', 'siamo', 'siate', 'siano']);
  });

  it('negative imperative uses the infinitive for tu', () => {
    expect(deriveItalianTenses(parlare, 'parlare')['imperative_negative']).toEqual(['', 'parlare', 'parli', 'parliamo', 'parlate', 'parlino']);
  });

  it('imperfect subjunctive', () => {
    expect(deriveItalianTenses(parlare, 'parlare')['imperfect_subjunctive']).toEqual(['parlassi', 'parlassi', 'parlasse', 'parlassimo', 'parlaste', 'parlassero']);
    expect(deriveItalianTenses(essere, 'essere')['imperfect_subjunctive']?.[0]).toBe('fossi');
    const fare = { ...parlare, imperfect: ['facevo', 'facevi', 'faceva', 'facevamo', 'facevate', 'facevano'] };
    expect(deriveItalianTenses(fare, 'fare')['imperfect_subjunctive']?.[2]).toBe('facesse');
  });

  it.each([['parlare', 'parlando'], ['vedere', 'vedendo'], ['essere', 'essendo']])('gerund %s → %s', (inf, g) =>
    expect(italianGerundOf(inf, inf === 'vedere' ? vedere.imperfect : undefined)).toBe(g));
  it('gerund of an irregular stem follows the imperfect', () => {
    expect(italianGerundOf('fare', ['facevo', 'facevi', 'faceva', 'facevamo', 'facevate', 'facevano'])).toBe('facendo');
  });

  it.each([['parlare', 'parlato'], ['vendere', 'venduto'], ['finire', 'finito'], ['fare', 'fatto'], ['essere', 'stato'],
    ['scrivere', 'scritto'], ['descrivere', 'descritto'], ['prendere', 'preso'], ['comprendere', 'compreso'],
    ['permettere', 'permesso'], ['produrre', 'prodotto'], ['scoprire', 'scoperto'], ['conoscere', 'conosciuto'],
    ['dividere', 'diviso'], ['decidere', 'deciso'], ['correggere', 'corretto'], ['rileggere', 'riletto'],
    ['potere', 'potuto'], ['venire', 'venuto'], ['bere', 'bevuto']])('participle %s → %s', (inf, p) =>
    expect(italianParticipleOf(inf)).toBe(p));
});
