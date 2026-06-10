/**
 * known-words.ts — backwards-compatibility shim.
 * All logic has moved to word-lists.ts.
 */
export {
  markKnown,
  unmarkKnown,
  isKnown,
  getKnownCount,
  getKnownWords,
} from './word-lists.ts';
