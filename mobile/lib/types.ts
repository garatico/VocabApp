/**
 * Core Word type — kept in sync with backend/src/client/types.ts.
 * When the project moves to a monorepo, both will import from a shared package.
 */

export interface Word {
  word:         string;
  translation?: string | null;   // primary English translation (formerly "display")
  pos?:         string | null;
  rank?:        number | null;
  emoji?:       string | null;
  svg_url?:     string | null;
  domains?:     string[];
  /** @deprecated Legacy pipe-delimited answers — not present in current API responses. */
  answers?:     string;
  linguistic?: {
    gender?:  string | null;
    plural?:  string | null;
    forms?:   Record<string, string>;
  } | null;
  frequency?: {
    rank?:        number;
    per_million?: number;
  } | null;
}

/** Extract accepted answer strings from a Word. */
export function getAnswers(word: Word): string[] {
  if (word.answers) return word.answers.split('|').map(a => a.trim()).filter(Boolean);
  return [word.word];
}

export type Language = 'spanish' | 'portuguese' | 'italian' | 'french';

export const LANGUAGES: { value: Language; label: string; flag: string }[] = [
  { value: 'spanish',    label: 'Spanish',    flag: '🇪🇸' },
  { value: 'portuguese', label: 'Portuguese', flag: '🇧🇷' },
  { value: 'italian',    label: 'Italian',    flag: '🇮🇹' },
  { value: 'french',     label: 'French',     flag: '🇫🇷' },
];

export const WORD_COUNTS = [100, 250, 500, 1000] as const;
export type WordCount = typeof WORD_COUNTS[number] | 'max';
