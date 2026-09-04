// @vitest-environment jsdom
/**
 * dom.test.ts — mustGet() (src/client/utils/dom.ts), the loud alternative
 * to `document.getElementById(id)!`.
 */
import { describe, it, expect } from 'vitest';
import { mustGet } from '../../src/client/utils/dom.js';

describe('mustGet', () => {
  it('returns the element when present', () => {
    const el = document.createElement('div');
    el.id = 'thing';
    document.body.appendChild(el);
    expect(mustGet('thing')).toBe(el);
  });

  it('throws a clear error naming the missing id, rather than returning null', () => {
    expect(() => mustGet('nope')).toThrow(/#nope/);
  });
});
