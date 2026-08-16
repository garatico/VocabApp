/**
 * conjugation/data.ts
 *
 * Static pronoun and tense data per language.
 * Imported by controls.ts and index.ts.
 */

export interface TenseDef {
  key:   string;
  /** Native-language name, e.g. "Preterito Indefinido". */
  label: string;
}

/**
 * English name for each tense, keyed by tense key.
 *
 * Kept separate from TENSE_DEFS rather than added to every entry: the keys are
 * shared across all four languages and the English name is the same for all of
 * them, so one map avoids repeating it four times.
 */
export const TENSE_EN: Record<string, string> = {
  present:         'Present',
  preterite:       'Preterite',
  imperfect:       'Imperfect',
  future:          'Future',
  conditional:     'Conditional',
  subjunctive:     'Present subjunctive',
  past_participle: 'Past participle',
  gerund:          'Gerund',
};

/**
 * What each tense is for, in one sentence with an example.
 *
 * Shown as the tooltip on the chip you pick and on the badge of every card it
 * produces. The native names differ per language but the job of the tense does
 * not, so like TENSE_EN this is one map rather than four. Examples are Spanish
 * because that is the only language with a hand-written rule engine, and they
 * read the same way in the other three.
 */
export const TENSE_HELP: Record<string, string> = {
  present:
    'Present — what is happening now, or happens habitually. '
    + '"hablo" = I speak / I am speaking.',
  preterite:
    'Preterite — a finished action at a definite point in the past. '
    + '"hablé" = I spoke (and it is over).',
  imperfect:
    'Imperfect — what used to happen, or was going on, in the past. '
    + '"hablaba" = I used to speak / I was speaking.',
  future:
    'Future — what will happen. "hablaré" = I will speak.',
  conditional:
    'Conditional — what would happen, if something else were true. '
    + '"hablaría" = I would speak.',
  subjunctive:
    'Present subjunctive — the mood for wishes, doubt, emotion and things '
    + 'not asserted as fact. "que hable" = that I speak.',
  past_participle:
    'Past participle — the -ed form, used with "have" and as an adjective. '
    + '"hablado" = spoken.',
  gerund:
    'Gerund — the -ing form, used for an action in progress. '
    + '"hablando" = speaking.',
};

/**
 * What each regularity bucket means. The raw data has 26 conjugation classes;
 * these are the four groups they collapse into, and they are the same four the
 * pill on each card uses.
 */
export const REGULARITY_HELP: Record<string, string> = {
  regular:
    'Regular — follows the standard -ar / -er / -ir endings with no surprises. '
    + 'Learn the pattern once and it applies. e.g. hablar, comer, vivir.',
  ortho:
    'Spelling change — regular to the ear, but the spelling shifts to keep the '
    + 'sound. buscar → busqué, llegar → llegué. Nothing new to memorise, just '
    + 'the spelling rule.',
  stem:
    'Stem-changing — the vowel in the stem changes when it is stressed, but the '
    + 'endings stay regular. poder → puedo, pedir → pido.',
  irregular:
    'Irregular — forms you have to learn individually; the pattern will not '
    + 'predict them. ser → soy/eres/es, ir → voy, tener → tengo.',
  unknown:
    'No conjugation class recorded for this verb.',
};

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
