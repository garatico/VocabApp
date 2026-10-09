/**
 * conjugation/data.ts
 *
 * Static pronoun and tense data per language.
 * Imported by controls.ts and index.ts.
 */
import { t } from '../../i18n/index.ts';

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
  present:                'Present',
  preterite:              'Preterite',
  imperfect:              'Imperfect',
  future:                 'Future',
  conditional:            'Conditional',
  subjunctive:            'Present subjunctive',
  past_participle:        'Past participle',
  gerund:                 'Gerund',
  imperative_affirmative: 'Imperative (affirmative)',
  imperative_negative:    'Imperative (negative)',
  imperfect_subjunctive:  'Imperfect subjunctive',
  future_subjunctive:     'Future subjunctive',
  personal_infinitive:    'Personal infinitive',
  present_perfect:        'Present perfect',
  pluperfect:             'Pluperfect',
  future_perfect:         'Future perfect',
  conditional_perfect:    'Conditional perfect',
  subjunctive_perfect:    'Perfect subjunctive',
  pluperfect_subjunctive: 'Pluperfect subjunctive',
};

/**
 * TENSE_EN's English name for a tense, translated for the app's current
 * interface language. A function rather than a second static map so it
 * always reflects whichever language is active right now, not whichever
 * was active when this module first loaded.
 */
export function tenseEnLabel(tenseKey: string): string {
  const fallback = TENSE_EN[tenseKey];
  if (fallback === undefined) return '';
  return t('conj.tenseEn.' + tenseKey, fallback);
}

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
  imperative_affirmative:
    'Imperative (affirmative) — direct commands telling someone to do '
    + 'something. "¡Habla!" = Speak! No "yo" form — you cannot command yourself.',
  imperative_negative:
    'Imperative (negative) — direct commands telling someone not to do '
    + 'something. "¡No hables!" = Do not speak! Uses the present subjunctive '
    + 'forms, not the affirmative imperative\'s. No "yo" form either.',
  imperfect_subjunctive:
    'Imperfect subjunctive — the subjunctive mood set in the past: wishes, '
    + 'doubt or emotion about something that already happened, or a polite '
    + '"if only". "que hablara" = that I spoke / if I spoke.',
  future_subjunctive:
    'Future subjunctive — a rarely-used, mostly archaic/legal form for a '
    + 'hypothetical future condition. "si hablare" = if he/she should speak. '
    + 'Modern Spanish almost always uses the present subjunctive instead.',
  personal_infinitive:
    'Personal infinitive — Portuguese\'s own form: the infinitive with a person ending, used after '
    + 'prepositions. "para eu falar", "para nós falarmos" = (in order) for me to speak, for us to speak.',
  present_perfect:
    'Present perfect — the auxiliary in the present + the past participle. Italian: "ho parlato" = I spoke / '
    + 'I have spoken, the everyday past. Portuguese: "tenho falado" = I have been speaking (repeatedly, up to now).',
  pluperfect:
    'Pluperfect — what had already happened before another past moment: the auxiliary in the imperfect + '
    + 'the past participle. "avevo parlato" / "tinha falado" = I had spoken.',
  future_perfect:
    'Future perfect — what will have happened by some future moment, or a guess about the past. '
    + '"avrò parlato" / "terei falado" = I will have spoken.',
  conditional_perfect:
    'Conditional perfect — what would have happened. "avrei parlato" / "teria falado" = I would have spoken.',
  subjunctive_perfect:
    'Perfect subjunctive — the subjunctive for something already done: the auxiliary in the present '
    + 'subjunctive + the past participle. "che abbia parlato" / "que tenha falado" = that he has spoken.',
  pluperfect_subjunctive:
    'Pluperfect subjunctive — the subjunctive for something that had already happened, or "if only … had": '
    + 'the auxiliary in the imperfect subjunctive + the past participle. "se avessi parlato" / '
    + '"se tivesse falado" = if I had spoken.',
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
  // German and Dutch have three persons singular and three plural like the
  // Romance five, but the polite form is the 3rd person plural rather than a
  // separate slot, so it is shown alongside it: Sie and u sit where they are
  // actually conjugated rather than implying a seventh cell that does not exist.
  german:     ['ich', 'du', 'er / sie / es', 'wir', 'ihr',    'sie / Sie'],
  dutch:      ['ik',  'jij', 'hij / zij',    'wij', 'jullie', 'zij'],
};

export const TENSE_DEFS: Record<string, TenseDef[]> = {
  spanish: [
    { key: 'present',         label: 'Presente' },
    { key: 'preterite',       label: 'Preterito Indefinido' },
    { key: 'imperfect',       label: 'Preterito Imperfecto' },
    { key: 'future',          label: 'Futuro' },
    { key: 'conditional',     label: 'Condicional' },
    { key: 'subjunctive',     label: 'Subjuntivo Presente' },
    { key: 'imperative_affirmative', label: 'Imperativo Afirmativo' },
    { key: 'imperative_negative',    label: 'Imperativo Negativo' },
    { key: 'imperfect_subjunctive',  label: 'Subjuntivo Imperfecto' },
    { key: 'future_subjunctive',     label: 'Subjuntivo Futuro' },
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
    { key: 'imperative_affirmative', label: 'Imperativo Afirmativo' },
    { key: 'imperative_negative',    label: 'Imperativo Negativo' },
    { key: 'imperfect_subjunctive',  label: 'Subjuntivo Imperfeito' },
    { key: 'future_subjunctive',     label: 'Subjuntivo Futuro' },
    { key: 'past_participle', label: 'Participio Passado' },
    { key: 'gerund',          label: 'Gerundio' },
    { key: 'personal_infinitive',    label: 'Infinitivo Pessoal' },
    { key: 'present_perfect',        label: 'Preterito Perfeito Composto' },
    { key: 'pluperfect',             label: 'Mais-que-perfeito Composto' },
    { key: 'future_perfect',         label: 'Futuro Composto' },
    { key: 'conditional_perfect',    label: 'Condicional Composto' },
    { key: 'subjunctive_perfect',    label: 'Subjuntivo Perfeito' },
    { key: 'pluperfect_subjunctive', label: 'Subjuntivo Mais-que-perfeito' },
  ],
  italian: [
    { key: 'present',         label: 'Presente' },
    { key: 'preterite',       label: 'Passato Remoto' },
    { key: 'imperfect',       label: 'Imperfetto' },
    { key: 'future',          label: 'Futuro Semplice' },
    { key: 'conditional',     label: 'Condizionale' },
    { key: 'subjunctive',     label: 'Congiuntivo Presente' },
    { key: 'imperfect_subjunctive',  label: 'Congiuntivo Imperfetto' },
    { key: 'imperative_affirmative', label: 'Imperativo Affermativo' },
    { key: 'imperative_negative',    label: 'Imperativo Negativo' },
    { key: 'past_participle', label: 'Participio Passato' },
    { key: 'gerund',          label: 'Gerundio' },
    { key: 'present_perfect',        label: 'Passato Prossimo' },
    { key: 'pluperfect',             label: 'Trapassato Prossimo' },
    { key: 'future_perfect',         label: 'Futuro Anteriore' },
    { key: 'conditional_perfect',    label: 'Condizionale Passato' },
    { key: 'subjunctive_perfect',    label: 'Congiuntivo Passato' },
    { key: 'pluperfect_subjunctive', label: 'Congiuntivo Trapassato' },
  ],
  french: [
    { key: 'present',         label: 'Present' },
    { key: 'imperfect',       label: 'Imparfait' },
    { key: 'future',          label: 'Futur Simple' },
    { key: 'conditional',     label: 'Conditionnel' },
    { key: 'subjunctive',     label: 'Subjonctif Present' },
    { key: 'imperative_affirmative', label: 'Imperatif' },
    { key: 'past_participle', label: 'Participe Passe' },
    { key: 'gerund',          label: 'Gerondif' },
  ],
  // German and Dutch start with present, simple past and the perfect
  // participle. Those three are what a learner needs to say anything about the
  // past: the everyday past in both languages is the perfect, which is the
  // participle plus a conjugated auxiliary, so the participle earns its place
  // more than the Präteritum does. The compound tenses are built from these
  // rather than being separate forms to memorise, so they are not yet offered.
  german: [
    { key: 'present',         label: 'Präsens' },
    { key: 'preterite',       label: 'Präteritum' },
    { key: 'past_participle', label: 'Partizip II' },
  ],
  dutch: [
    { key: 'present',         label: 'Tegenwoordige Tijd' },
    { key: 'preterite',       label: 'Verleden Tijd' },
    { key: 'past_participle', label: 'Voltooid Deelwoord' },
  ],
};
