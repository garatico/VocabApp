/**
 * tests/vocab-response.test.js
 *
 * publicTags drops the pipeline's provenance tags from the learner-facing
 * response and keeps everything else (notably `function_word`).
 */
import { describe, it, expect } from 'vitest';
import { publicTags } from '../src/server/lib/vocab-response.js';

describe('publicTags', () => {
  it('removes provenance tags and keeps the rest', () => {
    const [w] = publicTags([{ word: 'a', tags: ['kaikki', 'rare', 'function_word', 'corpus'] }]);
    expect(w.tags).toEqual(['function_word']);
  });

  it('does not mutate the cached word', () => {
    const original = { word: 'a', tags: ['kaikki', 'x'] };
    publicTags([original]);
    expect(original.tags).toEqual(['kaikki', 'x']);
  });

  it('returns the same object when there is nothing to strip', () => {
    const word = { word: 'a', tags: ['function_word'] };
    expect(publicTags([word])[0]).toBe(word);
  });

  it('tolerates a word with no tags field', () => {
    const word = { word: 'a' };
    expect(publicTags([word])[0]).toBe(word);
  });
});
