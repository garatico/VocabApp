import { describe, it, expect } from 'vitest';
import { derivePortugueseTenses, gerundOf, participleOf } from '../../src/client/data/pt-tenses.ts';

const fazer = {
  present:     ['faço', 'fazes', 'faz', 'fazemos', 'fazeis', 'fazem'],
  preterite:   ['fiz', 'fizeste', 'fez', 'fizemos', 'fizestes', 'fizeram'],
  subjunctive: ['faça', 'faças', 'faça', 'façamos', 'façais', 'façam'],
};
const falar = {
  present:     ['falo', 'falas', 'fala', 'falamos', 'falais', 'falam'],
  preterite:   ['falei', 'falaste', 'falou', 'falámos', 'falastes', 'falaram'],
  subjunctive: ['fale', 'fales', 'fale', 'falemos', 'faleis', 'falem'],
};

describe('derivePortugueseTenses', () => {
  it('derives the subjunctive and imperative tenses for an irregular verb', () => {
    const f = derivePortugueseTenses(fazer, 'fazer');
    expect(f['imperfect_subjunctive']).toEqual(['fizesse', 'fizesses', 'fizesse', 'fizéssemos', 'fizésseis', 'fizessem']);
    expect(f['future_subjunctive']).toEqual(['fizer', 'fizeres', 'fizer', 'fizermos', 'fizerdes', 'fizerem']);
    expect(f['imperative_negative']).toEqual(['', 'faças', 'faça', 'façamos', 'façais', 'façam']);
    expect(f['imperative_affirmative']).toEqual(['', 'faz', 'faça', 'façamos', 'fazei', 'façam']);
    expect(f['past_participle']).toBe('feito');
    expect(f['gerund']).toBe('fazendo');
  });

  it('derives them for a regular -ar verb', () => {
    const f = derivePortugueseTenses(falar, 'falar');
    expect(f['imperfect_subjunctive']).toEqual(['falasse', 'falasses', 'falasse', 'falássemos', 'falásseis', 'falassem']);
    expect(f['future_subjunctive']).toEqual(['falar', 'falares', 'falar', 'falarmos', 'falardes', 'falarem']);
    expect(f['imperative_affirmative']?.[4]).toBe('falai');
  });

  it('never replaces a form the row already has', () => {
    const f = derivePortugueseTenses({ ...falar, gerund: 'FALANDO' }, 'falar');
    expect(f['gerund']).toBe('FALANDO');
  });

  it('leaves a non-infinitive alone', () => {
    expect(derivePortugueseTenses(falar, 'falar-se')).toBe(falar);
  });
});

describe('gerund and participle', () => {
  it.each([['falar', 'falando'], ['comer', 'comendo'], ['partir', 'partindo'], ['ser', 'sendo'], ['ir', 'indo'],
    ['vir', 'vindo'], ['pôr', 'pondo'], ['compor', 'compondo']])('%s → %s', (inf, g) => expect(gerundOf(inf)).toBe(g));

  it.each([['falar', 'falado'], ['comer', 'comido'], ['partir', 'partido'], ['sair', 'saído'], ['construir', 'construído'],
    ['seguir', 'seguido'], ['fazer', 'feito'], ['dizer', 'dito'], ['pôr', 'posto'], ['compor', 'composto'], ['ver', 'visto'],
    ['abrir', 'aberto'], ['ser', 'sido'], ['ir', 'ido'], ['ler', 'lido']])('%s → %s', (inf, p) => expect(participleOf(inf)).toBe(p));
});
