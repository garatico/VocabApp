/**
 * classifiers.ts — the measure word a Chinese or Vietnamese noun is counted with, for the Classifiers tab.
 *
 * 两**只**猫 "two cats", 一**本**书 "a book"; hai **con** chó "two dogs", một **cái** bàn "a table". Which classifier
 * a noun takes is a fact of the noun, like a German noun's der/die/das, and VocabApp-Data carries it as
 * `linguistic.classifier` (schemaVersion 9): comma-separated, the usual one first ("只, 条"). Any of the listed
 * ones is right; the first is the one shown as the answer.
 */
import { languageInfo } from '../data/languages.ts';
import type { Word } from '../types.ts';

/** The noun's classifiers, the usual one first; [] when it has none. */
export function classifiersOf(entry: Word): string[] {
  const raw = entry.linguistic?.classifier;
  return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
}

/** Whether any language of `lang` (one name, or a merged `a+b` pool) counts nouns with classifiers. */
export function hasClassifiers(lang: string): boolean {
  return lang.split('+').some(l => languageInfo(l).name === l && Boolean(languageInfo(l).hasClassifiers));
}

/** Whether this word can be asked: a noun with at least one known classifier. */
export function hasClassifier(entry: Word): boolean {
  return entry.pos === 'noun' && classifiersOf(entry).length > 0;
}

/** The pool's classifiers, most used first (each noun counts its usual one) — where wrong options come from. */
export function commonClassifiers(words: readonly Word[]): string[] {
  const counts = new Map<string, number>();
  for (const w of words) {
    const usual = classifiersOf(w)[0];
    if (usual && w.pos === 'noun') counts.set(usual, (counts.get(usual) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
}

/** One button of the Classifiers quiz. */
export interface ClassifierChoice { label: string; correct: boolean }

/**
 * The buttons for one noun: its usual classifier and up to `count - 1` others from `common` that the noun does
 * not take (so a second right answer is never offered as a wrong one), in an order `random` shuffles. Null for
 * a word with no classifier.
 */
export function classifierChoices(entry: Word, common: readonly string[], count = 4,
                                  random: () => number = Math.random): ClassifierChoice[] | null {
  const own = classifiersOf(entry);
  if (entry.pos !== 'noun' || own.length === 0) return null;
  const wrong = common.filter(c => !own.includes(c)).slice(0, Math.max(0, count - 1));
  const choices: ClassifierChoice[] = [{ label: own[0], correct: true }, ...wrong.map(label => ({ label, correct: false }))];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}

/** Whether `label` is one of the noun's classifiers. */
export function takesClassifier(entry: Word, label: string): boolean {
  return classifiersOf(entry).includes(label);
}

/** "一只猫", "một con chó": the noun counted once, the way the answer is said. */
export function countedOnce(entry: Word, lang: string): string {
  const usual = classifiersOf(entry)[0];
  if (!usual) return entry.word;
  return (entry.language ?? lang).split('+')[0] === 'chinese' ? `一${usual}${entry.word}` : `một ${usual} ${entry.word}`;
}
