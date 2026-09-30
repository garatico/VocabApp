/**
 * pt-tenses.ts — the Portuguese tenses the database doesn't carry, worked out from the ones it does.
 *
 * Portuguese rows hold present / preterite / imperfect / future / conditional / present subjunctive.
 * Spanish also has the affirmative and negative imperative, the imperfect and future subjunctive, the
 * past participle and the gerund. All of those follow from forms already in the row, the same way
 * shared/verb-rules.ts derives Spanish's:
 *   - negative imperative    = present subjunctive (no "eu" slot)
 *   - affirmative imperative = tu: 3rd-singular present; você/nós/vocês: present subjunctive; vós: the
 *                              infinitive without -r (+ i for -ar/-er)
 *   - imperfect / future subjunctive = 3rd-plural preterite minus "-ram", plus the endings
 *   - gerund / past participle = the regular endings, with the short irregular participles listed.
 *
 * A form the row already has is never replaced. Pure, so it can be tested without a browser.
 */

import type { Word } from '../types.ts';

type Forms = Record<string, string[] | string>;

const IMPF_SUBJ = ['sse', 'sses', 'sse', 'ssemos', 'sseis', 'ssem'];
const FUT_SUBJ  = ['r', 'res', 'r', 'rmos', 'rdes', 'rem'];

/** Verbs whose imperative for "vós" isn't inf-minus-r + i. */
const VOS_IMPERATIVE: Record<string, string> = {
  ser: 'sede', ir: 'ide', ler: 'lede', crer: 'crede', ver: 'vede', ter: 'tende', vir: 'vinde',
};
const TER_COMPOUNDS = ['manter', 'conter', 'obter', 'deter', 'reter', 'entreter', 'abster', 'ater', 'suster'];
const VIR_COMPOUNDS = ['intervir', 'convir', 'provir', 'advir', 'sobrevir', 'desavir'];
const VER_COMPOUNDS = ['rever', 'prever', 'antever', 'entrever'];
const LER_COMPOUNDS = ['reler', 'tresler', 'descrer'];

/** Short irregular past participles — the form learners need, even where a long -ado/-ido one also exists. */
const IRREGULAR_PARTICIPLE: Record<string, string> = {
  abrir: 'aberto', cobrir: 'coberto', descobrir: 'descoberto', encobrir: 'encoberto', reabrir: 'reaberto',
  dizer: 'dito', contradizer: 'contradito', desdizer: 'desdito', predizer: 'predito',
  escrever: 'escrito', descrever: 'descrito', prescrever: 'prescrito', inscrever: 'inscrito',
  subscrever: 'subscrito', transcrever: 'transcrito', reescrever: 'reescrito',
  fazer: 'feito', desfazer: 'desfeito', refazer: 'refeito', satisfazer: 'satisfeito', perfazer: 'perfeito',
  ver: 'visto', rever: 'revisto', prever: 'previsto', antever: 'antevisto', entrever: 'entrevisto',
  vir: 'vindo', intervir: 'intervindo', convir: 'convindo', provir: 'provindo', advir: 'advindo',
  ganhar: 'ganho', gastar: 'gasto', pagar: 'pago',
};

const ACUTE: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ô', u: 'ú' };

/** pôr and its compounds (compor, dispor, impor …) — but not the preposition "por". */
const isPor = (inf: string): boolean => /p[oô]r$/.test(inf) && inf !== 'por';
const isInfinitive = (inf: string): boolean => /^[a-zà-ú]+(ar|er|ir|or|ôr)$/.test(inf) || inf === 'pôr';

/** The stem's last vowel takes the written accent that keeps "-ssemos"/"-sseis" stressed there: falássemos, fizéssemos, fôssemos. */
function accentStemEnd(stem: string, inf: string): string {
  const circumflexE = inf.endsWith('ler') || inf.endsWith('crer');
  for (let i = stem.length - 1; i >= 0; i--) {
    const ch = stem[i];
    if (ACUTE[ch]) return stem.slice(0, i) + (circumflexE && ch === 'e' ? 'ê' : ACUTE[ch]) + stem.slice(i + 1);
  }
  return stem;
}

export function gerundOf(inf: string): string {
  if (isPor(inf)) return inf.slice(0, -3) + 'pondo';
  const stem = inf.slice(0, -2);
  return stem + (inf.endsWith('ar') ? 'ando' : inf.endsWith('er') ? 'endo' : 'indo');
}

export function participleOf(inf: string): string {
  if (IRREGULAR_PARTICIPLE[inf]) return IRREGULAR_PARTICIPLE[inf];
  if (isPor(inf)) return inf.slice(0, -3) + 'posto';
  const stem = inf.slice(0, -2);
  if (inf.endsWith('ar')) return stem + 'ado';
  // A stem ending in a/e/o/u before -er/-ir splits into two syllables, and the i takes the accent:
  // sair → saído, doer → doído, construir → construído. gu/qu (seguir) is not a vowel of its own.
  if (/[aeou]$/.test(stem) && !/[gq]u$/.test(stem)) return stem + 'ído';
  return stem + 'ido';
}

function vosImperative(inf: string): string {
  if (VOS_IMPERATIVE[inf]) return VOS_IMPERATIVE[inf];
  if (TER_COMPOUNDS.includes(inf)) return inf.slice(0, -2) + 'tende';
  if (VIR_COMPOUNDS.includes(inf)) return inf.slice(0, -3) + 'vinde';
  if (VER_COMPOUNDS.includes(inf) || LER_COMPOUNDS.includes(inf)) return inf.slice(0, -2) + 'ede';
  if (isPor(inf)) return inf.slice(0, -3) + 'ponde';
  return inf.endsWith('ir') ? inf.slice(0, -1) : inf.slice(0, -1) + 'i';
}

const isSix = (v: unknown): v is string[] => Array.isArray(v) && v.length >= 6;

/** `forms` plus every derivable tense it lacks. Returns the same object for anything that isn't a plain infinitive. */
export function derivePortugueseTenses(forms: Forms, infinitive: string): Forms {
  const inf = infinitive.toLowerCase();
  if (!isInfinitive(inf)) return forms;
  const out: Forms = { ...forms };
  const subj = forms['subjunctive'];
  const pret = forms['preterite'];
  const present = forms['present'];

  if (!out['gerund'])          out['gerund'] = gerundOf(inf);
  if (!out['past_participle']) out['past_participle'] = participleOf(inf);

  if (!out['imperative_negative'] && isSix(subj)) {
    out['imperative_negative'] = ['', subj[1], subj[2], subj[3], subj[4], subj[5]];
  }
  if (!out['imperative_affirmative'] && isSix(subj) && isSix(present)) {
    out['imperative_affirmative'] = ['', inf === 'ser' ? 'sê' : present[2], subj[2], subj[3], vosImperative(inf), subj[5]];
  }
  if (isSix(pret) && pret[5].endsWith('ram')) {
    const stem = pret[5].slice(0, -3);
    if (!out['imperfect_subjunctive']) {
      const accented = accentStemEnd(stem, inf);
      out['imperfect_subjunctive'] = IMPF_SUBJ.map((e, i) => (i === 3 || i === 4 ? accented : stem) + e);
    }
    if (!out['future_subjunctive']) out['future_subjunctive'] = FUT_SUBJ.map(e => stem + e);
  }
  return out;
}

/** Fills in the missing tenses on every Portuguese verb in `words`, in place. Other languages are untouched. */
export function enrichPortugueseVerbs(lang: string, words: Word[]): void {
  if (lang !== 'portuguese') return;
  for (const w of words) {
    const ling = w.linguistic;
    if (w.pos !== 'verb' || !ling?.conjugations) continue;
    ling.conjugations = derivePortugueseTenses(ling.conjugations, ling.infinitive || w.word);
  }
}
