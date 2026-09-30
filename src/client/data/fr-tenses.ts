/**
 * fr-tenses.ts — the French tenses the database doesn't carry, worked out from the ones it does.
 *
 * French rows hold present / imperfect / future / conditional / present subjunctive (the passé simple is
 * empty). What Spanish has beyond those, and French can be built reliably from the row:
 *   - imperative       = tu: 2nd-singular present (minus -s for -er verbs); nous / vous: present;
 *                        être, avoir, savoir, vouloir borrow the subjunctive. French has no 3rd-person
 *                        command, so those two slots stay empty. The negative imperative is the same
 *                        words with ne … pas around them, so it is not a separate tense here.
 *   - present participle (Gérondif) = the nous form of the present, -ons → -ant
 *   - past participle  = the regular endings plus the irregular ones, by ending where the pattern holds
 *
 * Not derived, because nothing in the row pins them down: the passé simple and the imperfect subjunctive
 * (both literary, and the second is built from the first). A form the row already has is never replaced.
 */

type Forms = Record<string, string[] | string>;

const IRREGULAR_PARTICIPLE: Record<string, string> = {
  être: 'été', avoir: 'eu', faire: 'fait', dire: 'dit', aller: 'allé', venir: 'venu', voir: 'vu', pouvoir: 'pu',
  vouloir: 'voulu', savoir: 'su', devoir: 'dû', prendre: 'pris', mettre: 'mis', écrire: 'écrit', lire: 'lu',
  boire: 'bu', croire: 'cru', vivre: 'vécu', suivre: 'suivi', connaître: 'connu', naître: 'né', renaître: 'rené',
  mourir: 'mort', tenir: 'tenu', plaire: 'plu', falloir: 'fallu', valoir: 'valu', pleuvoir: 'plu', asseoir: 'assis',
  rire: 'ri', sourire: 'souri', courir: 'couru', cuire: 'cuit', conclure: 'conclu', inclure: 'inclus', résoudre: 'résolu',
  coudre: 'cousu', acquérir: 'acquis', conquérir: 'conquis', cueillir: 'cueilli', vaincre: 'vaincu', taire: 'tu',
  nuire: 'nui', luire: 'lui', élire: 'élu', craindre: 'craint', peindre: 'peint', joindre: 'joint',
  plaindre: 'plaint', atteindre: 'atteint', éteindre: 'éteint', mouvoir: 'mû', recevoir: 'reçu', apercevoir: 'aperçu',
  concevoir: 'conçu', percevoir: 'perçu',
};

/** Imperatives that use the subjunctive instead of the present: [tu, nous, vous]. */
const SUBJUNCTIVE_IMPERATIVE = new Set(['être', 'avoir', 'savoir', 'vouloir']);
/** -ir verbs that take the -er pattern in the tu imperative: ouvre, offre, couvre … */
const ER_LIKE_IR = /(ouvrir|offrir|couvrir|souffrir|cueillir|accueillir|assaillir|tressaillir)$/;

const isInfinitive = (inf: string): boolean => /^[a-zà-üç]+(er|ir|re|oir)$/.test(inf);

/** The past participle, or '' when the ending gives no reliable answer. */
export function frenchParticipleOf(inf: string): string {
  if (IRREGULAR_PARTICIPLE[inf]) return IRREGULAR_PARTICIPLE[inf];
  const swap = (suffix: string, to: string): string => inf.slice(0, inf.length - suffix.length) + to;

  if (/mettre$/.test(inf)) return swap('mettre', 'mis');
  if (/prendre$/.test(inf)) return swap('prendre', 'pris');
  if (/faire$/.test(inf)) return swap('faire', 'fait');
  if (/crire$/.test(inf)) return swap('crire', 'crit');
  if (/dire$/.test(inf)) return swap('dire', 'dit');
  if (/(duire|struire)$/.test(inf)) return swap('ire', 'it');
  if (/tenir$/.test(inf)) return swap('tenir', 'tenu');
  if (/venir$/.test(inf)) return swap('venir', 'venu');
  if (/cevoir$/.test(inf)) return swap('cevoir', 'çu');
  if (/voir$/.test(inf)) return swap('oir', 'u');
  if (/(vr|fr)ir$/.test(inf)) return swap('rir', 'ert');
  if (/[aeo]indre$/.test(inf)) return swap('indre', 'int');
  if (/clure$/.test(inf)) return swap('re', 'u');
  if (/lire$/.test(inf)) return swap('ire', 'u');
  if (/ourir$/.test(inf)) return swap('ir', 'u');
  if (/aître$/.test(inf)) return swap('aître', 'u');
  if (inf.endsWith('oir')) return '';   // an -oir verb that isn't listed: better to show nothing than a guess
  if (inf.endsWith('er')) return swap('er', 'é');
  if (inf.endsWith('ir')) return swap('ir', 'i');
  if (inf.endsWith('re')) return swap('re', 'u');
  return '';   // an -oir verb that isn't listed: better to show nothing than a guess
}

export function frenchParticiplePresentOf(inf: string, present: string[] | undefined): string {
  if (inf === 'être') return 'étant';
  if (inf === 'avoir') return 'ayant';
  const nous = present?.[3];
  return nous && nous.endsWith('ons') ? nous.slice(0, -3) + 'ant' : '';
}

const isSix = (v: unknown): v is string[] => Array.isArray(v) && v.length >= 6;

/** `forms` plus every derivable tense it lacks. Returns the same object for anything that isn't a plain infinitive. */
export function deriveFrenchTenses(forms: Forms, infinitive: string): Forms {
  const inf = infinitive.toLowerCase();
  if (!isInfinitive(inf)) return forms;
  const out: Forms = { ...forms };
  const present = forms['present'];
  const subj = forms['subjunctive'];

  if (!out['gerund']) {
    const g = frenchParticiplePresentOf(inf, isSix(present) ? present : undefined);
    if (g) out['gerund'] = g;
  }
  if (!out['past_participle']) {
    const p = frenchParticipleOf(inf);
    if (p) out['past_participle'] = p;
  }

  if (!out['imperative_affirmative'] && isSix(present)) {
    let row: string[];
    if (SUBJUNCTIVE_IMPERATIVE.has(inf) && isSix(subj)) {
      row = inf === 'vouloir' ? ['', 'veuille', '', 'veuillons', 'veuillez', ''] : ['', subj[1], '', subj[3], subj[4], ''];
    } else {
      const tu = present[1];
      const dropS = (inf.endsWith('er') || ER_LIKE_IR.test(inf)) && tu.endsWith('s');
      row = ['', dropS ? tu.slice(0, -1) : tu, '', present[3], present[4], ''];
    }
    out['imperative_affirmative'] = row;
  }
  return out;
}
