/**
 * merged-pool.test.ts — "Words: N" over several languages takes the N most frequent of them *together*.
 */
import { describe, it, expect } from 'vitest';
import { mergedSizedSlice } from '../../src/client/utils/merged-pool.ts';
import type { Word } from '../../src/client/types.ts';

const w = (word: string, language: string, rank: number, pos = 'verb'): Word =>
  ({ word, translation: word, rank, pos, language }) as unknown as Word;

const es = [w('e1', 'spanish', 1), w('e2', 'spanish', 2), w('e3', 'spanish', 3), w('e4', 'spanish', 4)];
const pt = [w('p1', 'portuguese', 1), w('p5', 'portuguese', 5)];
const fr = [w('f2', 'french', 2), w('f3', 'french', 3), w('f6', 'french', 6)];

describe('mergedSizedSlice', () => {
  it('takes the lowest ranks across every language, not an even share of each', () => {
    const got = mergedSizedSlice([es, pt, fr], 6, false, []).map(x => x.word);
    expect(got).toEqual(['e1', 'p1', 'e2', 'f2', 'e3', 'f3']);      // e4 (rank 4) is next, not f6/p5
  });

  it('ties go to the earlier language', () => {
    expect(mergedSizedSlice([es, pt, fr], 3, false, []).map(x => x.word)).toEqual(['e1', 'p1', 'e2']);
  });

  it('applies the Part of Speech filter before counting, so the next verbs are always the next most frequent', () => {
    const mixed = [w('n1', 'spanish', 1, 'noun'), w('v2', 'spanish', 2, 'verb'), w('v9', 'spanish', 9, 'verb')];
    const other = [w('v3', 'french', 3, 'verb'), w('n4', 'french', 4, 'noun')];
    expect(mergedSizedSlice([mixed, other], 3, false, ['verb']).map(x => x.word)).toEqual(['v2', 'v3', 'v9']);
  });

  it('Max keeps everything, in frequency order', () => {
    expect(mergedSizedSlice([es, pt, fr], 1, true, [])).toHaveLength(es.length + pt.length + fr.length);
  });
});
