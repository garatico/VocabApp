/**
 * filter-state.ts — where a filter's setting is stored, and whether the modes
 * share one.
 *
 * Every filter answers two questions that are not about words at all:
 *
 *   Is it on?      Kept inside the filter's own state, because it belongs with
 *                  the selections it switches on and off, and follows them when
 *                  the setting is shared.
 *   Is it chained? Kept here, per mode, because it is a statement *about* where
 *                  the state lives rather than part of it.
 *
 * Chaining is what modes do by default: a chained mode reads and writes one
 * shared bucket, so Table and Recall see the same thing, which is how the app
 * behaved before any of this existed. Unchaining a mode forks it onto its own
 * bucket, and its setting stops moving when the others change.
 *
 * Switching the chain back on *pushes* the mode's current setting into the
 * shared bucket rather than adopting whatever is there. That is the reading of
 * the chain that does something useful: you set a mode up the way you want,
 * then link it to say "everything else should be like this too".
 *
 * Chain flags are not per language. Whether you want your modes to agree is a
 * way of working, not a fact about Spanish.
 */

import { currentScope, FILTER_SCOPES, type FilterScope } from './filter-scope.ts';

/** Filters that have shareable state. Conjugation's boxes are single-mode. */
export type FilterId = 'list' | 'class' | 'domain';

export const FILTER_IDS: FilterId[] = ['list', 'class', 'domain'];

const CHAIN_KEY = 'vq_filterchain_';

/** The bucket a mode's state lives in: the shared one, or its own. */
export type Bucket = string;

export const SHARED_BUCKET: Bucket = 'shared';

type ChainMap = Partial<Record<FilterScope, boolean>>;

function readChainMap(id: FilterId): ChainMap {
  try {
    const raw = localStorage.getItem(CHAIN_KEY + id);
    return raw ? JSON.parse(raw) as ChainMap : {};
  } catch { return {}; }
}

function writeChainMap(id: FilterId, map: ChainMap): void {
  try { localStorage.setItem(CHAIN_KEY + id, JSON.stringify(map)); } catch { /* quota */ }
}

/**
 * Is this mode following the shared setting?
 *
 * Defaults to true. Every mode shared one setting before this existed, so an
 * absent flag has to mean chained or upgrading would silently fork all five.
 */
export function isChained(id: FilterId, scope: FilterScope = currentScope()): boolean {
  return readChainMap(id)[scope] !== false;
}

export function setChained(id: FilterId, on: boolean, scope: FilterScope = currentScope()): void {
  const map = readChainMap(id);
  map[scope] = on;
  writeChainMap(id, map);
}

/** How many modes are currently following the shared setting. */
export function chainedCount(id: FilterId): number {
  return FILTER_SCOPES.filter(s => isChained(id, s)).length;
}

/** Which bucket to read and write for this mode. */
export function bucketFor(id: FilterId, scope: FilterScope = currentScope()): Bucket {
  return isChained(id, scope) ? SHARED_BUCKET : scope;
}

/**
 * Chain or unchain a mode, moving its state so nothing visibly changes at the
 * moment of the click.
 *
 * Chaining copies this mode's setting *into* the shared bucket, so the modes
 * that were already chained adopt it. Unchaining copies the shared setting into
 * this mode's own bucket, so it starts from where it was and then diverges.
 *
 * @param copy  Moves the payload between buckets. Kept as a callback because
 *              this module deliberately knows nothing about what a filter's
 *              state looks like.
 * @returns the modes that will now see this mode's setting.
 */
export function toggleChain(
  id: FilterId,
  copy: (from: Bucket, to: Bucket) => void,
  scope: FilterScope = currentScope(),
): { chained: boolean; affected: FilterScope[] } {
  const nowChained = !isChained(id, scope);

  if (nowChained) copy(scope, SHARED_BUCKET);
  else            copy(SHARED_BUCKET, scope);

  setChained(id, nowChained, scope);

  const affected = nowChained
    ? FILTER_SCOPES.filter(s => s !== scope && isChained(id, s))
    : [];
  return { chained: nowChained, affected };
}
