/**
 * conjugation/verb-filters.ts — which words are eligible to be conjugated,
 * and how many cards a given selection would produce.
 *
 * Split out of index.ts so the pre-quiz card-count estimate (app.ts's
 * refreshConjEstimate) can compute the same verb pool renderConjugationMode
 * is about to build, without either copy drifting from the other or index.ts
 * importing from app.ts.
 */

import type { Word } from '../../types.js';
import { foldKey as normalize } from '../../utils/match.js';
import { activeTenses, activeRegularities, unionTenseDefs } from './controls.js';

/**
 * Is this entry a headword, or is it one form of some other verb?
 *
 * *hay* is a real vocabulary entry — rank 48, its own glosses and usage notes —
 * and belongs in Table, Recall and the lists. It is also the impersonal present
 * of *haber*, which it records in `linguistic.infinitive`, so offering it here
 * gave the learner a second card drilling one cell of a verb they already had.
 *
 * The test is the relationship, not the word, so anything else stored the same
 * way drops out too. Two things it must *not* drop:
 *
 *   - A verb with no recorded infinitive. That is the common case (3,364 of the
 *     3,373 verbs in the database) and it is its own headword.
 *   - A reflexive. *ducharse*, *quejarse* and six others record the bare stem
 *     in `infinitive` — `divertirse` → `divertir` — but they are headwords in
 *     their own right and conjugate differently from the bare verb. Romance
 *     languages attach the clitic to the end of the infinitive, so a form that
 *     *begins* with the whole infinitive is a derived headword; an inflected
 *     form of some other lemma is not (*hay* does not begin with *haber*).
 *
 * The `reflexive` column would be the honest way to ask this, but it is 0 on
 * every row in the database — nothing populates it.
 */
export function isOwnInfinitive(w: Word): boolean {
  const inf = w.linguistic?.infinitive;
  if (!inf) return true;
  return normalize(w.word).startsWith(normalize(inf));
}

/**
 * Do we have anything to drill for this verb?
 *
 * A present-tense array of six empty strings is as useless as a null, and both
 * occur: an import that found the headword but no table leaves the shape behind
 * without the content. So the test is for a form with characters in it, not for
 * the key being present.
 */
export function hasAnyForms(w: Word): boolean {
  const conj = w.linguistic?.conjugations as Record<string, unknown> | null | undefined;
  if (!conj) return false;
  return Object.values(conj).some(v =>
    typeof v === 'string'
      ? v.trim() !== ''
      : Array.isArray(v) && v.some(f => typeof f === 'string' && f.trim() !== ''));
}

/**
 * Bucket a conjugation_class into something a learner recognises.
 *
 * The data has 26 classes across four prefixes; "ortho-car" is a spelling
 * adjustment that keeps the sound (buscar -> busqué) and is regular in every
 * way that matters to a learner, so it reads as Regular with a note rather
 * than as Irregular.
 */
export function regularityOf(cls: string | null): { key: string; label: string } {
  if (!cls)                        return { key: 'unknown',   label: '' };
  if (cls.startsWith('regular'))   return { key: 'regular',   label: 'Regular' };
  if (cls.startsWith('ortho'))     return { key: 'ortho',     label: 'Spelling' };
  if (cls.startsWith('stem'))      return { key: 'stem',      label: 'Stem-change' };
  return { key: 'irregular', label: 'Irregular' };
}

export interface ConjugationEstimate {
  verbs:  number;
  tenses: number;
  cards:  number;
}

/**
 * How many verbs, tenses and cards the current selection would produce —
 * the same pool renderConjugationMode is about to build (verb-only,
 * isOwnInfinitive, hasAnyForms, the Regularity chips), read *before* Start
 * Quiz so a runaway combination (every tense × every verb) can be flagged
 * up front instead of only discovered once the cards are already built.
 */
export function estimateConjugationSize(words: Word[], lang: string, extraLangs: string[] = []): ConjugationEstimate {
  const primaryLang = lang.split('+')[0];

  const regs     = activeRegularities();
  const everyReg = regs.length >= 4;
  const verbEntries = words.filter(w => w.pos === 'verb' && isOwnInfinitive(w));
  const rawVerbs = verbEntries.filter(hasAnyForms);
  const allVerbs = everyReg
    ? rawVerbs
    : rawVerbs.filter(w => {
        const cls = w.linguistic?.conjugation_class ?? null;
        return cls == null || regs.includes(regularityOf(cls).key);
      });

  const tenseDefs = unionTenseDefs(primaryLang, extraLangs);
  const picked    = activeTenses().filter(k => tenseDefs.some(d => d.key === k));
  const tenses    = picked.length ? picked.length : Math.min(1, tenseDefs.length);

  return { verbs: allVerbs.length, tenses, cards: allVerbs.length * tenses };
}
