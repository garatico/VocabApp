/**
 * bands.test.ts — CEFR band cutoffs used by My Content's rank/level picker
 * (data/bands.ts)
 */
import { describe, it, expect } from 'vitest';
import { bandForRank, representativeRankForBand, BANDS } from '../../src/client/data/bands.js';

describe('bandForRank', () => {
  it('returns null for a null rank', () => {
    expect(bandForRank(null)).toBeNull();
  });

  it('maps a rank at or under each cutoff to that band', () => {
    expect(bandForRank(1)).toBe('A1');
    expect(bandForRank(500)).toBe('A1');
    expect(bandForRank(501)).toBe('A2');
    expect(bandForRank(1500)).toBe('A2');
    expect(bandForRank(1501)).toBe('B1');
    expect(bandForRank(3000)).toBe('B1');
    expect(bandForRank(5000)).toBe('B2');
    expect(bandForRank(7000)).toBe('C1');
  });

  it('falls back to C2 past the last cutoff, with no upper bound', () => {
    expect(bandForRank(7001)).toBe('C2');
    expect(bandForRank(1_000_000)).toBe('C2');
  });
});

describe('representativeRankForBand', () => {
  it('returns the midpoint between a band and the previous cutoff', () => {
    expect(representativeRankForBand('A1')).toBe(250);   // (0 + 500) / 2
    expect(representativeRankForBand('A2')).toBe(1000);  // (500 + 1500) / 2
  });

  it('returns a round number past C1 for C2, which has no upper cutoff', () => {
    expect(representativeRankForBand('C2')).toBe(8500);
  });

  it('is always inside bandForRank\'s own range for that band', () => {
    for (const band of BANDS) {
      const rep = representativeRankForBand(band);
      expect(bandForRank(rep)).toBe(band);
    }
  });
});
