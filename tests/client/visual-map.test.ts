/**
 * visual-map.test.ts — picture-mode visual lookups.
 *
 * Regression: words that collide with Object.prototype members (notably
 * Spanish "constructor" = builder) must return null, not inherited
 * functions like `function Object() { [native code] }`.
 */
import { describe, it, expect } from 'vitest';
import { getFallbackEmoji, getFallbackSvgUrl, getFallbackImageUrl } from '../../src/client/data/visual-map.js';

const PROTO_WORDS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'];

describe('prototype-key words return null, never inherited members', () => {
  for (const w of PROTO_WORDS) {
    it(`"${w}" yields no accidental visual`, () => {
      expect(getFallbackEmoji('spanish', w)).toBeNull();
      expect(getFallbackSvgUrl('spanish', w)).toBeNull();
      expect(getFallbackImageUrl('spanish', w)).toBeNull();
    });
  }

  it('unknown language is safe too', () => {
    expect(getFallbackEmoji('constructor', 'perro')).toBeNull();
  });
});

describe('real lookups still work', () => {
  it('finds the dog photo, accent/case-insensitively', () => {
    expect(getFallbackImageUrl('spanish', 'perro')).toBe('/images/dog.jpg');
    expect(getFallbackImageUrl('spanish', 'PERRO')).toBe('/images/dog.jpg');
  });

  it('returns null for words with no visual', () => {
    expect(getFallbackEmoji('spanish', 'libertad')).toBeNull();
  });
});
