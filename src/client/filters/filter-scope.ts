/**
 * filter-scope.ts — which mode a filter setting belongs to.
 *
 * Filters used to be one global setting each: switching from Table to Recall
 * carried your list filter with it, whether or not you wanted it to. That is
 * right when you are studying one set of words several ways, and wrong when the
 * modes are doing different jobs — hiding your Known list in Recall while
 * drilling exactly that list in Table is a reasonable thing to want, and there
 * was no way to express it.
 *
 * So filter state is stored per mode, and the chain button copies one mode's
 * setting to the others when you do want them to agree.
 *
 * Conjugation is deliberately absent. It filters by tense, regularity and
 * pronoun in its own box, and does not use the shared word filters at all.
 */


import { readString } from '../utils/storage.ts';

export type FilterScope = 'table' | 'recall' | 'single' | 'picture' | 'mylists';

export const FILTER_SCOPES: FilterScope[] = ['table', 'recall', 'single', 'picture', 'mylists'];

export const SCOPE_LABELS: Record<FilterScope, string> = {
  table:   'Table',
  recall:  'Recall',
  single:  'Single Word',
  picture: 'Picture Quiz',
  mylists: 'My Lists',
};

const SCOPE_SET = new Set<string>(FILTER_SCOPES);

/**
 * The mode whose filters are on screen.
 *
 * Reads the same `vq_mode` the tabs write. Conjugation and Settings are real
 * tab values but not filter scopes, so they fall back to Table rather than
 * inventing a sixth bucket no control can reach.
 */
export function currentScope(): FilterScope {
  const raw = readString('vq_mode') ?? '';
  return SCOPE_SET.has(raw) ? raw as FilterScope : 'table';
}
