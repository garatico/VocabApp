/**
 * trivia-distractors.test.ts — selectDistractors' same-type-first preference
 * (trivia-mode.ts), the fix for a multiple-choice answer being guessable by
 * shape alone (e.g. a "¿Quién...?" question's person answer sitting next to
 * an obviously-wrong bare year).
 */
import { describe, it, expect } from 'vitest';
import { selectDistractors } from '../../src/client/modes/trivia-mode.js';
import type { TriviaQuestion } from '../../src/client/data/trivia-questions.js';

function q(id: string, answer: string, answerType: TriviaQuestion['answerType']): TriviaQuestion {
  return {
    id,
    category: 'history',
    difficulty: 'easy',
    readingDifficulty: 'easy',
    readingLength: 'short',
    domains: ['history'],
    answerType,
    questionTarget: `Pregunta ${id}?`,
    questionEn: `Question ${id}?`,
    answersTarget: [answer],
    answersEn: [answer],
  };
}

describe('selectDistractors', () => {
  it('prefers same-type distractors when enough exist', () => {
    const target = q('t', 'Cervantes', 'person');
    const pool = [
      target,
      q('p1', 'Picasso', 'person'),
      q('p2', 'Franco', 'person'),
      q('p3', 'Darwin', 'person'),
      q('y1', '1492', 'year'),
      q('y2', '1969', 'year'),
    ];
    const result = selectDistractors(target, pool, 3);
    expect(result).toHaveLength(3);
    for (const text of result) {
      const source = pool.find(o => o.answersTarget[0] === text);
      expect(source?.answerType).toBe('person');
    }
  });

  it('falls back to the full pool once same-type candidates run out', () => {
    const target = q('t', 'Cervantes', 'person');
    const pool = [
      target,
      q('p1', 'Picasso', 'person'),
      q('y1', '1492', 'year'),
      q('y2', '1969', 'year'),
      q('n1', '206', 'number'),
    ];
    const result = selectDistractors(target, pool, 3);
    expect(result).toHaveLength(3);
    // Exactly one same-type candidate existed — the other two must come
    // from the fallback pool rather than leaving the options short.
    expect(result).toContain('Picasso');
  });

  it('never includes the target question itself or a duplicate answer text', () => {
    const target = q('t', 'Madrid', 'place');
    const pool = [
      target,
      q('dup', 'madrid', 'place'), // same answer, different case — should be skipped as a duplicate
      q('p1', 'Lima', 'place'),
      q('p2', 'Buenos Aires', 'place'),
    ];
    const result = selectDistractors(target, pool, 3);
    expect(result).not.toContain('Madrid');
    expect(result.filter(t => t.toLowerCase() === 'madrid')).toHaveLength(0);
    expect(result.sort()).toEqual(['Buenos Aires', 'Lima'].sort());
  });

  it('respects a smaller requested count', () => {
    const target = q('t', 'Cervantes', 'person');
    const pool = [target, q('p1', 'Picasso', 'person'), q('p2', 'Franco', 'person')];
    expect(selectDistractors(target, pool, 1)).toHaveLength(1);
  });
});
