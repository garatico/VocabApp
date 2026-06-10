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
  spanish:    ['yo', 'tu', 'el / ella', 'nosotros', 'vosotros', 'ellos / ellas'],
  portuguese: ['eu', 'tu', 'ele / ela', 'nos',      'vos',      'eles / elas'],
  italian:    ['io', 'tu', 'lui / lei', 'noi',      'voi',      'loro'],
  french:     ['je', 'tu', 'il / elle', 'nous',     'vous',     'ils / elles'],
};

export const TENSE_DEFS: Record<string, TenseDef[]> = {
  spanish: [
    { key: 'present',         label: 'Presente' },
    { key: 'preterite',       label: 'Preterito Indefinido' },
    { key: 'imperfect',       label: 'Preterito Imperfecto' },
    { key: 'future',          label: 'Futuro' },
    { key: 'conditional',     label: 'Condicional' },
    { key: 'subjunctive',     label: 'Subjuntivo Presente' },
    { key: 'past_participle', label: 'Participio Pasado' },
    { key: 'gerund',          label: 'Gerundio' },
  ],
  portuguese: [
    { key: 'present',         label: 'Presente' },
    { key: 'preterite',       label: 'Preterito Perfeito' },
    { key: 'imperfect',       label: 'Preterito Imperfeito' },
    { key: 'future',          label: 'Futuro' },
    { key: 'conditional',     label: 'Condicional' },
    { key: 'subjunctive',     label: 'Subjuntivo Presente' },
    { key: 'past_participle', label: 'Participio Passado' },
    { key: 'gerund',          label: 'Gerundio' },
  ],
  italian: [
    { key: 'present',         label: 'Presente' },
    { key: 'imperfect',       label: 'Imperfetto' },
    { key: 'future',          label: 'Futuro Semplice' },
    { key: 'conditional',     label: 'Condizionale' },
    { key: 'subjunctive',     label: 'Congiuntivo Presente' },
    { key: 'past_participle', label: 'Participio Passato' },
    { key: 'gerund',          label: 'Gerundio' },
  ],
  french: [
    { key: 'present',         label: 'Present' },
    { key: 'imperfect',       label: 'Imparfait' },
    { key: 'future',          label: 'Futur Simple' },
    { key: 'conditional',     label: 'Conditionnel' },
    { key: 'subjunctive',     label: 'Subjonctif Present' },
    { key: 'past_participle', label: 'Participe Passe' },
    { key: 'gerund',          label: 'Gerondif' },
  ],
};
