/**
 * gender.test.ts — Spanish gender/plural inference
 */
import { describe, it, expect } from 'vitest';
import { inferGender, inferPlural } from '../../src/client/utils/gender.js';

describe('inferGender', () => {
  it('returns null for non-Spanish languages', () => {
    expect(inferGender('maison', 'french')).toBeNull();
  });

  it('infers feminine for -a endings', () => {
    expect(inferGender('casa')).toBe('feminine');
    expect(inferGender('mesa')).toBe('feminine');
  });

  it('infers masculine for -o endings', () => {
    expect(inferGender('libro')).toBe('masculine');
    expect(inferGender('gato')).toBe('masculine');
  });

  it('handles masculine -a exceptions (Greek origin)', () => {
    expect(inferGender('problema')).toBe('masculine');
    expect(inferGender('mapa')).toBe('masculine');
    expect(inferGender('planeta')).toBe('masculine');
  });

  it('handles feminine -o exceptions', () => {
    expect(inferGender('mano')).toBe('feminine');
    expect(inferGender('foto')).toBe('feminine');
  });

  it('detects feminine suffixes', () => {
    expect(inferGender('canción')).toBe('feminine');
    expect(inferGender('ciudad')).toBe('feminine');
    expect(inferGender('libertad')).toBe('feminine');
    expect(inferGender('actitud')).toBe('feminine');
    expect(inferGender('costumbre')).toBe('feminine');
  });

  it('is case/whitespace insensitive', () => {
    expect(inferGender('  CASA ')).toBe('feminine');
  });

  it('returns null for ambiguous endings', () => {
    expect(inferGender('árbol')).toBeNull();
    expect(inferGender('mes')).toBeNull();
  });
});

describe('inferPlural', () => {
  it('returns null for non-Spanish languages', () => {
    expect(inferPlural('maison', 'french')).toBeNull();
  });

  it('-z → -ces', () => {
    expect(inferPlural('lápiz')).toBe('lápices');
    expect(inferPlural('voz')).toBe('voces');
  });

  it('accented vowel + n: drops accent, adds -es', () => {
    expect(inferPlural('razón')).toBe('razones');
    expect(inferPlural('jardín')).toBe('jardines');
  });

  it('accented vowel + s: drops accent, adds -es', () => {
    expect(inferPlural('inglés')).toBe('ingleses');
    expect(inferPlural('autobús')).toBe('autobuses');
  });

  it('polysyllabic unaccented -s/-x stays unchanged', () => {
    expect(inferPlural('lunes')).toBe('lunes');
    expect(inferPlural('crisis')).toBe('crisis');
  });

  it('vowel ending adds -s', () => {
    expect(inferPlural('casa')).toBe('casas');
    expect(inferPlural('café')).toBe('cafés');
  });

  it('consonant ending adds -es', () => {
    expect(inferPlural('árbol')).toBe('árboles');
    expect(inferPlural('ciudad')).toBe('ciudades');
  });
});
