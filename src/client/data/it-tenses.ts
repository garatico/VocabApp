/**
 * it-tenses.ts — the Italian tenses the database doesn't carry, worked out from the ones it does.
 *
 * Italian rows hold present / passato remoto / imperfect / future / conditional / present subjunctive.
 * What Spanish has beyond those, and Italian can be built from the row:
 *   - affirmative imperative = tu: 3rd-singular present for -are verbs, 2nd-singular otherwise; Lei and
 *                              Loro: the subjunctive; noi and voi: the present. Essere, avere and sapere
 *                              take the subjunctive for voi; a handful of verbs have a short tu form.
 *   - negative imperative    = the same, except tu, which is the infinitive ("non parlare"); the "non" is
 *                              left off, as Spanish leaves off its "no".
 *   - imperfect subjunctive  = the imperfect indicative's stem + -ssi, -ssi, -sse, -ssimo, -ste, -ssero
 *   - gerund / past participle = the regular endings, with the irregular participles by ending or list
 *
 * Italian has no future subjunctive, so that tense has no equivalent. A form the row already has is never
 * replaced.
 */

type Forms = Record<string, string[] | string>;

const IMPF_SUBJ = ['ssi', 'ssi', 'sse', 'ssimo', 'ste', 'ssero'];

/** tu imperative forms that are not the 2nd/3rd-singular present. */
const TU_IMPERATIVE: Record<string, string> = {
  essere: 'sii', avere: 'abbi', sapere: 'sappi', volere: 'vogli', andare: "va'", fare: "fa'", dare: "da'", stare: "sta'", dire: "di'",
};
/** voi imperatives that are the subjunctive, not the present. */
const SUBJUNCTIVE_VOI = new Set(['essere', 'avere', 'sapere', 'volere']);
/** Imperfect subjunctive stems that the imperfect indicative can't supply. */
const IMPF_SUBJ_STEM: Record<string, string> = { essere: 'fo', dare: 'de', stare: 'ste' };

/** Irregular participles listed whole; the ones that follow an ending are in `ENDING_PARTICIPLES`. */
const IRREGULAR_PARTICIPLE: Record<string, string> = {
  essere: 'stato', stare: 'stato', fare: 'fatto', dire: 'detto', bere: 'bevuto', vivere: 'vissuto', rimanere: 'rimasto',
  morire: 'morto', nascere: 'nato', rinascere: 'rinato', piacere: 'piaciuto', tacere: 'taciuto', giacere: 'giaciuto',
  dispiacere: 'dispiaciuto', cuocere: 'cotto', rompere: 'rotto', vincere: 'vinto', correre: 'corso', perdere: 'perso',
  chiedere: 'chiesto', chiudere: 'chiuso', decidere: 'deciso', uccidere: 'ucciso', dividere: 'diviso', spendere: 'speso',
  accendere: 'acceso', scendere: 'sceso', spegnere: 'spento', rispondere: 'risposto', nascondere: 'nascosto',
  piangere: 'pianto', spingere: 'spinto', dipingere: 'dipinto', giungere: 'giunto', stringere: 'stretto',
  scegliere: 'scelto', togliere: 'tolto', cogliere: 'colto', raccogliere: 'raccolto', sciogliere: 'sciolto',
  porgere: 'porto', sorgere: 'sorto', volgere: 'volto', muovere: 'mosso', mordere: 'morso', offendere: 'offeso',
  difendere: 'difeso', prendere: 'preso', mettere: 'messo', vedere: 'visto', leggere: 'letto', scrivere: 'scritto',
  aprire: 'aperto', coprire: 'coperto', scoprire: 'scoperto', offrire: 'offerto', soffrire: 'sofferto',
  esprimere: 'espresso', succedere: 'successo', discutere: 'discusso', assumere: 'assunto', tradurre: 'tradotto',
  porre: 'posto', trarre: 'tratto', venire: 'venuto',
};
/** [ending, replacement of that ending] — for compounds (comprendere, permettere, produrre, scoprire …). */
const ENDING_PARTICIPLES: [string, string][] = [
  ['fare', 'fatto'], ['scrivere', 'scritto'], ['prendere', 'preso'], ['mettere', 'messo'], ['vedere', 'visto'], ['durre', 'dotto'],
  ['porre', 'posto'], ['trarre', 'tratto'], ['leggere', 'letto'], ['reggere', 'retto'], ['teggere', 'tetto'],
  ['chiedere', 'chiesto'], ['chiudere', 'chiuso'], ['scendere', 'sceso'], ['cidere', 'ciso'], ['videre', 'viso'],
  ['correre', 'corso'], ['spendere', 'speso'], ['rompere', 'rotto'], ['vincere', 'vinto'], ['giungere', 'giunto'],
  ['stringere', 'stretto'], ['cogliere', 'colto'], ['togliere', 'tolto'], ['scegliere', 'scelto'], ['muovere', 'mosso'],
  ['rispondere', 'risposto'], ['nascondere', 'nascosto'], ['aprire', 'aperto'], ['coprire', 'coperto'],
  ['offrire', 'offerto'], ['soffrire', 'sofferto'], ['cuocere', 'cotto'], ['tenere', 'tenuto'], ['venire', 'venuto'],
  ['scere', 'sciuto'], ['cere', 'ciuto'],
];

const AVERE: Record<string, string[]> = {
  present:               ['ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno'],
  imperfect:             ['avevo', 'avevi', 'aveva', 'avevamo', 'avevate', 'avevano'],
  future:                ['avrò', 'avrai', 'avrà', 'avremo', 'avrete', 'avranno'],
  conditional:           ['avrei', 'avresti', 'avrebbe', 'avremmo', 'avreste', 'avrebbero'],
  subjunctive:           ['abbia', 'abbia', 'abbia', 'abbiamo', 'abbiate', 'abbiano'],
  imperfect_subjunctive: ['avessi', 'avessi', 'avesse', 'avessimo', 'aveste', 'avessero'],
};
const ESSERE: Record<string, string[]> = {
  present:               ['sono', 'sei', 'è', 'siamo', 'siete', 'sono'],
  imperfect:             ['ero', 'eri', 'era', 'eravamo', 'eravate', 'erano'],
  future:                ['sarò', 'sarai', 'sarà', 'saremo', 'sarete', 'saranno'],
  conditional:           ['sarei', 'saresti', 'sarebbe', 'saremmo', 'sareste', 'sarebbero'],
  subjunctive:           ['sia', 'sia', 'sia', 'siamo', 'siate', 'siano'],
  imperfect_subjunctive: ['fossi', 'fossi', 'fosse', 'fossimo', 'foste', 'fossero'],
};
/** compound key → the tense of the auxiliary it takes. */
const IT_COMPOUNDS: [key: string, aux: string][] = [
  ['present_perfect',        'present'],
  ['pluperfect',             'imperfect'],
  ['future_perfect',         'future'],
  ['conditional_perfect',    'conditional'],
  ['subjunctive_perfect',    'subjunctive'],
  ['pluperfect_subjunctive', 'imperfect_subjunctive'],
];

/**
 * Verbs that take "essere" (mostly intransitive verbs of motion and change of state). Anything not listed takes
 * "avere" — right for every transitive verb, which is most of them. A "ri-" prefix and the -venire compounds
 * follow their base; reflexive (-si) verbs are not derived at all (they would need the clitic as well).
 */
const ESSERE_VERBS = new Set([
  'essere', 'stare', 'andare', 'venire', 'arrivare', 'partire', 'entrare', 'uscire', 'tornare', 'restare', 'rimanere',
  'nascere', 'morire', 'diventare', 'divenire', 'salire', 'scendere', 'cadere', 'piacere', 'dispiacere', 'sembrare',
  'parere', 'bastare', 'accadere', 'succedere', 'avvenire', 'costare', 'esistere', 'sorgere', 'scappare', 'fuggire',
  'giungere', 'crescere', 'apparire', 'sparire', 'svenire', 'dimagrire', 'ingrassare', 'guarire', 'mancare', 'occorrere',
  'capitare', 'decadere', 'cascare', 'riuscire', 'costare',
]);
export function italianUsesEssere(inf: string): boolean {
  if (ESSERE_VERBS.has(inf)) return true;
  if (inf.startsWith('ri') && ESSERE_VERBS.has(inf.slice(2))) return true;
  return /venire$/.test(inf) && inf !== 'prevenire';
}
/** "andato" → "andati": the participle agrees with the subject, and with an essere verb the plural slots show it. */
const pluralParticiple = (p: string): string => (p.endsWith('o') ? p.slice(0, -1) + 'i' : p.endsWith('a') ? p.slice(0, -1) + 'e' : p);

const isInfinitive = (inf: string): boolean => /^[a-zà-ù]+(are|ere|ire|rre)$/.test(inf);
const isSix = (v: unknown): v is string[] => Array.isArray(v) && v.length >= 6;

export function italianGerundOf(inf: string, imperfect: string[] | undefined): string {
  if (inf === 'essere') return 'essendo';
  // The imperfect carries an irregular stem (fare → facevo → facendo, dire → dicevo → dicendo, bere → bevendo) and is
  // just as good for regular verbs (parlavo → parlando), so it is the source whenever the row has one.
  const im = imperfect?.[0];
  if (im && im.endsWith('vo')) return im.slice(0, -2) + 'ndo';
  return inf.slice(0, -3) + (inf.endsWith('are') ? 'ando' : 'endo');
}

export function italianParticipleOf(inf: string): string {
  if (IRREGULAR_PARTICIPLE[inf]) return IRREGULAR_PARTICIPLE[inf];
  for (const [ending, to] of ENDING_PARTICIPLES) {
    if (inf.endsWith(ending) && inf.length > ending.length) return inf.slice(0, inf.length - ending.length) + to;
  }
  const stem = inf.slice(0, -3);
  if (inf.endsWith('are')) return stem + 'ato';
  if (inf.endsWith('ere')) return stem + 'uto';
  if (inf.endsWith('ire')) return stem + 'ito';
  return '';
}

/** `forms` plus every derivable tense it lacks. Returns the same object for anything that isn't a plain infinitive. */
export function deriveItalianTenses(forms: Forms, infinitive: string): Forms {
  const inf = infinitive.toLowerCase();
  if (!isInfinitive(inf)) return forms;
  const out: Forms = { ...forms };
  const present = forms['present'];
  const subj = forms['subjunctive'];
  const imperfect = forms['imperfect'];

  if (!out['gerund']) out['gerund'] = italianGerundOf(inf, isSix(imperfect) ? imperfect : undefined);
  if (!out['past_participle']) {
    const p = italianParticipleOf(inf);
    if (p) out['past_participle'] = p;
  }

  if (isSix(present) && isSix(subj)) {
    const voi = SUBJUNCTIVE_VOI.has(inf) ? subj[4] : present[4];
    const tu = TU_IMPERATIVE[inf] ?? (inf.endsWith('are') ? present[2] : present[1]);
    if (!out['imperative_affirmative']) out['imperative_affirmative'] = ['', tu, subj[2], present[3], voi, subj[5]];
    if (!out['imperative_negative'])    out['imperative_negative']    = ['', inf, subj[2], present[3], voi, subj[5]];
  }

  if (!out['imperfect_subjunctive'] && isSix(imperfect)) {
    const stem = IMPF_SUBJ_STEM[inf] ?? (imperfect[0].endsWith('vo') ? imperfect[0].slice(0, -2) : '');
    if (stem) out['imperfect_subjunctive'] = IMPF_SUBJ.map(e => stem + e);
  }

  // Compound tenses: avere / essere in the right tense + the past participle (masculine; plural slots agree).
  const participle = typeof out['past_participle'] === 'string' ? out['past_participle'] : '';
  if (participle) {
    const essere = italianUsesEssere(inf);
    const aux = essere ? ESSERE : AVERE;
    for (const [key, tense] of IT_COMPOUNDS) {
      if (out[key]) continue;
      out[key] = aux[tense].map((a, i) => `${a} ${essere && i >= 3 ? pluralParticiple(participle) : participle}`);
    }
  }
  return out;
}
