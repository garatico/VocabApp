// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getQuizHidden, isQuizHidden, setQuizHidden } from '../../src/client/utils/quiz-hidden.ts';
import { srsDueWords } from '../../src/client/utils/srs.ts';

describe('quiz-hidden', () => {
  beforeEach(() => localStorage.clear());

  it('hides and shows a word, per language', () => {
    expect(isQuizHidden('spanish', 'hacer')).toBe(false);
    setQuizHidden('spanish', 'hacer', true);
    expect(isQuizHidden('spanish', 'hacer')).toBe(true);
    expect(isQuizHidden('french', 'hacer')).toBe(false);
    setQuizHidden('spanish', 'hacer', false);
    expect(isQuizHidden('spanish', 'hacer')).toBe(false);
    expect(getQuizHidden('spanish').size).toBe(0);
  });

  it('keeps the set sorted and free of duplicates', () => {
    for (const w of ['zorro', 'abeja', 'zorro']) setQuizHidden('spanish', w, true);
    expect(JSON.parse(localStorage.getItem('vq_hidden_spanish')!)).toEqual(['abeja', 'zorro']);
  });

  it('survives a corrupt value without throwing', () => {
    localStorage.setItem('vq_hidden_spanish', '{not json');
    expect(getQuizHidden('spanish').size).toBe(0);
  });
});

describe('a hidden word is never due', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('s_due_enabled', 'true');
    const past = Date.now() - 86_400_000;
    localStorage.setItem('vq_srs_spanish', JSON.stringify({
      casa: { box: 1, dueAt: past, ease: 2.5 },
      perro: { box: 1, dueAt: past - 1000, ease: 2.5 },
    }));
  });

  it('drops out of the due list, and comes back when shown again', () => {
    expect(srsDueWords('spanish').sort()).toEqual(['casa', 'perro']);
    setQuizHidden('spanish', 'perro', true);
    expect(srsDueWords('spanish')).toEqual(['casa']);
    setQuizHidden('spanish', 'perro', false);
    expect(srsDueWords('spanish').sort()).toEqual(['casa', 'perro']);
  });
});
