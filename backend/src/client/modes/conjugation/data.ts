/**
 * conjugation/data.ts
 *
 * Static pronoun and tense data per language.
 * Imported by controls.ts and index.ts.
 */

export interface TenseDef {
  key:   string;
  label: string;
}

export const PRONOUNS: Record<string, string[]> = {
  spanish:    ['yo', 'tú', 'él / ella', 'nosotros', 'vosotros', 'ellos / ellas'],
  portuguese: ['eu', 'tu', 'ele / ela', 'nós',      'vós',      'eles / elas'],
  italian:    ['io', 'tu', 'lui / lei', 'noi',      'voi',      'loro'],
  french:     ['je', 'tu', 'il / elle', 'nous',     'vous',     'ils / elles'],
};

export const TENSE_DEFS: Record<string, TenseDef[]> = {
  spanish: [
    { key: 'present',             label: 'Presente' },
    { key: 'preterite',           label: 'Pretérito Indefinido' },
    { key: 'imperfect',           label: 'Pretérito Imperfecto' },
    { key: 'future',              label: 'Futuro' },
    { key: 'conditional',         label: 'Condicional' },
    { key: 'subjunctive_present', label: 'Subjuntivo Presente' },
  ],
  portuguese: [
    { key: 'present',             label: 'Presente' },
    { key: 'preterite',           label: 'Pretérito Perfeito' },
    { key: 'imperfect',           label: 'Pretérito Imperfeito' },
    { key: 'future',              label: 'Futuro' },
    { key: 'conditional',         label: 'Condicional' },
    { key: 'subjunctive_present', label: 'Subjuntivo Presente' },
  ],
  italian: [
    { key: 'present',             label: 'Presente' },
    { key: 'imperfect',           label: 'Imperfetto' },
    { key: 'future',              label: 'Futuro Semplice' },
    { key: 'conditional',         label: 'Condizionale' },
    { key: 'subjunctive_present', label: 'Congiuntivo Presente' },
  ],
  french: [
    { key: 'present',             label: 'Présent' },
    { key: 'imperfect',           label: 'Imparfait' },
    { key: 'future',              label: 'Futur Simple' },
    { key: 'conditional',         label: 'Conditionnel' },
    { key: 'subjunctive_present', label: 'Subjonctif Présent' },
  ],
};
