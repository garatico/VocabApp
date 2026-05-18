/**
 * String matching utilities — ported from backend/public/src/utils/match.ts.
 * No DOM dependency; safe to use in React Native.
 */

export function normalise(s: string): string {
  return s.trim().toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

export function isCorrect(input: string, answers: string[]): boolean {
  const attempt = normalise(input);
  if (!attempt) return false;
  return answers.some(a => normalise(a) === attempt);
}
