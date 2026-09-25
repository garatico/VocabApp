/**
 * level-plan.ts — what "I'm at this level" means for the Words controls.
 *
 * A new learner meets Most Common / Rank Range / Level, a size menu, CEFR chips
 * and a pile of filters before their first quiz, with no hint which settings
 * suit them. This maps four plain-language starting points onto the controls
 * that already exist, so the first quiz is sensible without learning them first.
 *
 * Pure data, no DOM: level-picker.ts applies a plan by driving the real
 * controls, which keeps every bit of persistence and filtering they already do.
 */

import { BANDS, type Band } from '../data/bands.ts';

export type LevelId = 'new' | 'basics' | 'comfortable' | 'advanced';

/** Either "the N most common words" or "every word in these CEFR bands". */
export type LevelPlan =
  | { pool: 'topn'; size: string }
  | { pool: 'band'; bands: readonly Band[] };

export interface LevelChoice {
  id:    LevelId;
  label: string;
  blurb: string;
  plan:  LevelPlan;
}

export const LEVELS: readonly LevelChoice[] = [
  {
    id: 'new', label: 'Brand new',
    blurb: 'Start with the 100 most common words.',
    plan: { pool: 'topn', size: '100' },
  },
  {
    id: 'basics', label: 'I know the basics',
    blurb: 'Skip the very common words — practise A2.',
    plan: { pool: 'band', bands: ['A2'] },
  },
  {
    id: 'comfortable', label: 'Comfortable',
    blurb: 'Everyday and conversational words — B1 and B2.',
    plan: { pool: 'band', bands: ['B1', 'B2'] },
  },
  {
    id: 'advanced', label: 'Advanced',
    blurb: 'Less common, more specialised words — C1 and C2.',
    plan: { pool: 'band', bands: ['C1', 'C2'] },
  },
] as const;

export function levelById(id: string): LevelChoice | null {
  return LEVELS.find(l => l.id === id) ?? null;
}

/** For each CEFR chip, whether the plan wants it switched on. */
export function bandStates(plan: LevelPlan): Record<Band, boolean> {
  const wanted = new Set<Band>(plan.pool === 'band' ? plan.bands : []);
  return Object.fromEntries(BANDS.map(b => [b, wanted.has(b)])) as Record<Band, boolean>;
}
