/**
 * derived-tenses.ts — fills in the verb tenses a language's database rows lack (see pt-tenses.ts,
 * fr-tenses.ts, it-tenses.ts for what each one derives and how). Spanish needs nothing: its rows are
 * complete. Run once on each freshly loaded vocabulary, in place.
 */

import type { Word } from '../types.ts';
import { derivePortugueseTenses } from './pt-tenses.ts';
import { deriveFrenchTenses } from './fr-tenses.ts';
import { deriveItalianTenses } from './it-tenses.ts';

type Forms = Record<string, string[] | string>;
const DERIVERS: Record<string, (forms: Forms, infinitive: string) => Forms> = {
  portuguese: derivePortugueseTenses,
  french:     deriveFrenchTenses,
  italian:    deriveItalianTenses,
};

export function enrichDerivedTenses(lang: string, words: Word[]): void {
  const derive = DERIVERS[lang];
  if (!derive) return;
  for (const w of words) {
    const ling = w.linguistic;
    if (w.pos !== 'verb' || !ling?.conjugations) continue;
    ling.conjugations = derive(ling.conjugations, ling.infinitive || w.word);
  }
}
