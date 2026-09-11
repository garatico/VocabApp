/**
 * visual-map.test.ts — picture-mode visual lookups.
 *
 * Regression: words that collide with Object.prototype members (notably
 * Spanish "constructor" = builder) must return null, not inherited
 * functions like `function Object() { [native code] }`.
 */
import { describe, it, expect } from 'vitest';
import { getFallbackEmoji, getFallbackSvgUrl, getFallbackImageUrl, hasVisual } from '../../src/client/data/visual-map.js';

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

describe('hasVisual', () => {
  it('finds a Spanish word via the client-side fallback maps', () => {
    expect(hasVisual('spanish', { word: 'perro' })).toBe(true);
  });

  it('is false when neither the entry nor the fallback maps have anything', () => {
    expect(hasVisual('spanish', { word: 'libertad' })).toBe(false);
  });

  // Chinese/Japanese have no entries at all in this file's CONCEPTS/IMAGES
  // maps, so a word's own DB-curated `emoji`/`svg_url` (set server-side —
  // see vocab-loader.ts/svg-loader.ts) is the only way those languages'
  // words are ever illustrated. Without checking them here, picture mode's
  // size-window filter (start-handler.ts) silently reduced both languages
  // to zero eligible words.
  it("trusts the word's own emoji even for a language absent from this file's maps", () => {
    expect(hasVisual('japanese', { word: '猫', emoji: '🐱' })).toBe(true);
  });

  it("trusts the word's own svg_url even for a language absent from this file's maps", () => {
    expect(hasVisual('chinese', { word: '猫', svg_url: '/svgs/cat.svg' })).toBe(true);
  });

  it('is false for an unillustrated word in a language with no fallback maps', () => {
    expect(hasVisual('japanese', { word: '自由' })).toBe(false);
  });
});
