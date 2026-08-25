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
 * Conjugation has its own tense/regularity/pronoun box that the other modes
 * don't, but ui-state.ts's "The list filter applies in conjugation mode too"
 * still wires up the shared Lists and Domains filters for it — it was just
 * never given a scope of its own here. Every mode-aware read defaulted to
 * currentScope(), which fell back to 'table' for any mode it didn't
 * recognize, so Conjugation's list/domain filters silently read and wrote
 * Table's bucket: linking or unlinking while conjugating actually linked or
 * unlinked Table.
 */


import { readString } from '../utils/storage.ts';

export type FilterScope = 'table' | 'recall' | 'single' | 'picture' | 'conjugation' | 'mylists';

export const FILTER_SCOPES: FilterScope[] =
  ['table', 'recall', 'single', 'picture', 'conjugation', 'mylists'];

export const SCOPE_LABELS: Record<FilterScope, string> = {
  table:       'Table',
  recall:      'Recall',
  single:      'Single Word',
  picture:     'Picture Quiz',
  conjugation: 'Conjugation',
  mylists:     'My Lists',
};

const SCOPE_SET = new Set<string>(FILTER_SCOPES);

/**
 * The mode whose filters are on screen.
 *
 * Reads the same `vq_mode` the tabs write. Settings and History are real tab
 * values but not filter scopes — neither shows a filter box — so they fall
 * back to Table rather than inventing a bucket no control can reach.
 */
export function currentScope(): FilterScope {
  const raw = readString('vq_mode') ?? '';
  return SCOPE_SET.has(raw) ? raw as FilterScope : 'table';
}
