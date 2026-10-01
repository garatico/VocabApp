/**
 * tests/vocab-response.test.js
 *
 * publicTags drops the pipeline's provenance tags from the learner-facing
 * response and keeps everything else (notably `function_word`).
 */
import { describe, it, expect } from 'vitest';
import { publicTags, serializeVocab } from '../src/server/lib/vocab-response.js';
import { compactWord } from '../src/shared/vocab/compact-word.js';

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

describe('serializeVocab', () => {
  const vocab = {
    language: 'spanish',
    loadedAt: Date.UTC(2026, 0, 1),
    words: [
      { word: 'a', translation: 'to', glosses: ['to'], rank: 1, frequency: { rank: 1, band: 'A1' }, linguistic: { reflexive: false }, is_function_word: false, tags: ['kaikki', 'function_word'] },
      { word: 'b', translation: 'bee', glosses: ['bee', 'be'], rank: null, frequency: { rank: null, band: null }, linguistic: { reflexive: true }, is_function_word: true, tags: [] },
      { word: 'ñ', translation: 'enye "quoted"', glosses: ['enye "quoted"'], rank: 3, frequency: { rank: 3, band: 'A1' }, linguistic: {}, is_function_word: false },
    ],
  };
  const envelope = compact => ({
    success: true, language: 'spanish', count: 3,
    metadata: { timestamp: '2026-01-01T00:00:00.000Z', cacheAge: 0 },
    ...(compact ? { compact: true } : {}),
    data: compact ? publicTags(vocab.words).map(w => compactWord(w)) : publicTags(vocab.words),
  });

  it('is byte-for-byte what stringifying the whole envelope gives, full and compact', () => {
    expect(serializeVocab(vocab, false).toString('utf8')).toBe(JSON.stringify(envelope(false)));
    expect(serializeVocab(vocab, true).toString('utf8')).toBe(JSON.stringify(envelope(true)));
  });

  it('is still valid, identical JSON when the batches are smaller than the word list', () => {
    const many = { ...vocab, words: Array.from({ length: 1234 }, (_, i) => ({ ...vocab.words[i % 3], word: `w${i}` })) };
    const body = JSON.parse(serializeVocab(many, true).toString('utf8'));
    expect(body.data).toHaveLength(1234);
    expect(body.data[1233].word).toBe('w1233');
    expect(JSON.stringify(body)).toBe(JSON.stringify({ ...JSON.parse(JSON.stringify({ ...envelope(true), count: 1234 })), data: body.data }));
  });

  it('handles an empty vocabulary', () => {
    const body = JSON.parse(serializeVocab({ ...vocab, words: [] }, false).toString('utf8'));
    expect(body.data).toEqual([]);
    expect(body.count).toBe(0);
  });
});
