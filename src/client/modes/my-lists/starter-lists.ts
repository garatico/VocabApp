/**
 * starter-lists.ts — premade Smart Lists that ship with the app.
 *
 * They are Smart Lists (saved queries over a word's `domains`) rather than
 * fixed word arrays: the same rule works in every language, and a "Medicine"
 * list stays current as the vocabulary grows. Each language gets them once,
 * on its first visit to My Lists, filed into a "Starter Lists" folder — after
 * that they are ordinary Smart Lists the learner can edit, copy or delete,
 * and a deleted one is never put back (the seeded flag is per language, not
 * per list).
 */

import { readString, writeString } from '../../utils/storage.ts';
import { getSmartLists, saveSmartRule, DEFAULT_SMART_RULE } from './smart-lists.ts';
import { addFolder, setFolderStyle } from './folders.ts';

export const STARTER_FOLDER = 'Starter Lists';

/** name → domains it draws from (see the `domains` column of the vocabulary). */
export const STARTER_LISTS: readonly { name: string; emoji: string; domains: string[] }[] = [
  { name: 'School', emoji: '🎓', domains: ['education'] },
  { name: 'Medicine', emoji: '🩺', domains: ['medicine', 'health', 'body'] },
  { name: 'Food & Cooking', emoji: '🍽', domains: ['food'] },
  { name: 'Travel', emoji: '✈️', domains: ['travel', 'transport', 'geography'] },
  { name: 'Work & Business', emoji: '💼', domains: ['work'] },
  { name: 'Home & Family', emoji: '🏠', domains: ['home', 'family', 'clothing'] },
  { name: 'Nature & Animals', emoji: '🌿', domains: ['nature', 'animals'] },
  { name: 'Technology', emoji: '💻', domains: ['technology', 'science'] },
  { name: 'Law & Politics', emoji: '⚖️', domains: ['law', 'politics', 'military'] },
  { name: 'Arts & Leisure', emoji: '🎨', domains: ['art', 'music', 'sports'] },
  { name: 'Feelings & Talk', emoji: '💬', domains: ['emotions', 'mind', 'communication'] },
];

const seededKey = (lang: string): string => `ml_starter_seeded_${lang.toLowerCase()}`;

/** Adds the starter lists for `lang` the first time it is called for it. */
export function seedStarterLists(lang: string): void {
  if (readString(seededKey(lang)) === 'true') return;
  const existing = getSmartLists(lang);
  addFolder(`smart_${lang}`, STARTER_FOLDER);
  setFolderStyle(`smart_${lang}`, STARTER_FOLDER, { emoji: '🎓', color: '#7c5cbf' });
  for (const { name, emoji, domains } of STARTER_LISTS) {
    if (existing[name]) continue;
    saveSmartRule(lang, name, {
      ...DEFAULT_SMART_RULE,
      domains: [...domains],
      mastered: 'any', listed: 'any', limit: 0,
      folders: [STARTER_FOLDER],
      emoji,
    });
  }
  writeString(seededKey(lang), 'true');
}
