/**
 * hint-reveal.test.ts — the letter-by-letter hint shared by Trivia and Guess
 * the Blank (src/client/utils/hint-reveal.ts). Pure string logic, no DOM.
 */
import { describe, it, expect } from 'vitest';
import { hintReveal, hintableLength, hintPrefix } from '../../src/client/utils/hint-reveal.js';

describe('hintReveal', () => {
  it('reveals the first N non-space characters and blanks the rest', () => {
    expect(hintReveal('the monkey', 3)).toBe('t h e   _ _ _ _ _ _');
  });

  it('blanks everything when nothing is revealed yet', () => {
    expect(hintReveal('the monkey', 0)).toBe('_ _ _   _ _ _ _ _ _');
  });

  it('reveals everything once the count meets or exceeds the answer length', () => {
    expect(hintReveal('the monkey', 100)).toBe('t h e   m o n k e y');
  });

  it('does not count a space toward the revealed budget', () => {
    // 3 non-space letters revealed in a 2-word answer still only spends the
    // budget on letters, leaving the space itself always visible.
    expect(hintReveal('the monkey', 3).includes('   ')).toBe(true);
  });

  it('handles a single word with no spaces', () => {
    expect(hintReveal('cat', 3)).toBe('c a t');
  });

  it('handles an empty answer', () => {
    expect(hintReveal('', 3)).toBe('');
  });
});

describe('hintableLength', () => {
  it('counts only non-space characters', () => {
    expect(hintableLength('the monkey')).toBe(9);
  });

  it('is 0 for an empty string', () => {
    expect(hintableLength('')).toBe(0);
  });

  it('is 0 for a string of only spaces', () => {
    expect(hintableLength('   ')).toBe(0);
  });

  it('matches the count hintReveal treats as "fully revealed"', () => {
    const answer = 'the monkey';
    const full = hintReveal(answer, hintableLength(answer));
    expect(full.replace(/ /g, '')).toBe(answer.replace(/ /g, ''));
  });
});

describe('hintPrefix', () => {
  it('returns just the revealed prefix, no trailing underscores', () => {
    expect(hintPrefix('monkey', 3)).toBe('mon');
  });

  it('is empty when nothing is revealed yet', () => {
    expect(hintPrefix('monkey', 0)).toBe('');
  });

  it('caps at the full answer once the count meets or exceeds its length', () => {
    expect(hintPrefix('monkey', 100)).toBe('monkey');
  });

  it('preserves a space that falls within the revealed span', () => {
    // 5 non-space characters: t, h, e, m, o — the space at index 3 passes
    // through for free without spending any of the budget.
    expect(hintPrefix('the monkey', 5)).toBe('the mo');
  });

  it('does not trail a space when the cutoff lands right before one', () => {
    expect(hintPrefix('the monkey', 3)).toBe('the');
  });

  it('handles an empty answer', () => {
    expect(hintPrefix('', 3)).toBe('');
  });
});
