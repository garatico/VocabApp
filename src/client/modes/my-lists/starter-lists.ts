/**
 * starter-lists.ts — premade lists that ship with the app, shown in their own "Starter Lists" section
 * of My Lists, above Single-Language Lists.
 *
 * They are Smart Lists (saved queries — see smart-lists.ts) marked `starter: true`, so they stay current
 * as the vocabulary grows, work in every language, and are usable everywhere a smart list is (quiz
 * filters, the panel, export). What makes them "starter" is only that the sidebar files them in their
 * own section instead of Smart Lists, and that each is small — a cap on the rank-ordered result — so a
 * new learner is offered 20 words to begin with, not 3,000.
 *
 * Each language gets them once, on its first visit to My Lists. After that they are ordinary lists the
 * learner can edit, copy or delete, and a deleted one is never put back (the seeded flag is per
 * language, not per list).
 */

import { readString, writeString } from '../../utils/storage.ts';
import { getSmartLists, saveSmartRule, deleteSmartList, DEFAULT_SMART_RULE, type SmartRule } from './smart-lists.ts';
import { addFolder, setFolderStyle, getFolderStyle, getFolderRegistry, removeFolder } from './folders.ts';

/** The folder the OLD starter lists were filed under, inside Smart Lists — see removeLegacyStarters. */
export const LEGACY_STARTER_FOLDER = 'Starter Lists';

export const FOLDER_COMMON = 'Most Common';
export const FOLDER_TOPICS = 'By Topic';

/** How many words a topic list holds: enough to be worth practising, small enough not to overwhelm. */
export const TOPIC_LIST_SIZE = 30;

/** The rank-ordered core of a starter list — everything else is the smart-list default, opened up. */
const rule = (over: Partial<SmartRule>, folder: string, emoji: string): SmartRule => ({
  ...DEFAULT_SMART_RULE, mastered: 'any', listed: 'any', sort: 'rank',
  ...over, folders: [folder], emoji, starter: true,
});

export const STARTER_LISTS: readonly { name: string; rule: SmartRule }[] = [
  { name: 'Top 20 Words',      rule: rule({ limit: 20 }, FOLDER_COMMON, '⭐') },
  { name: 'Top 20 Verbs',      rule: rule({ limit: 20, pos: ['verb'] }, FOLDER_COMMON, '🏃') },
  { name: 'Top 20 Nouns',      rule: rule({ limit: 20, pos: ['noun'] }, FOLDER_COMMON, '📦') },
  { name: 'Top 20 Adjectives', rule: rule({ limit: 20, pos: ['adjective'] }, FOLDER_COMMON, '🎨') },

  // name → the domains it draws from (see the `domains` column of the vocabulary).
  ...([
    ['School', '🎓', ['education']],
    ['Medicine', '🩺', ['medicine', 'health', 'body']],
    ['Food & Cooking', '🍽', ['food']],
    ['Travel', '✈️', ['travel', 'transport', 'geography']],
    ['Work & Business', '💼', ['work']],
    ['Home & Family', '🏠', ['home', 'family', 'clothing']],
    ['Nature & Animals', '🌿', ['nature', 'animals']],
    ['Technology', '💻', ['technology', 'science']],
    ['Law & Politics', '⚖️', ['law', 'politics', 'military']],
    ['Arts & Leisure', '🎨', ['art', 'music', 'sports']],
    ['Feelings & Talk', '💬', ['emotions', 'mind', 'communication']],
  ] as const).map(([name, emoji, domains]) => ({
    name, rule: rule({ limit: TOPIC_LIST_SIZE, domains: [...domains] }, FOLDER_TOPICS, emoji),
  })),
];

/** The old (v1) starter lists: unlimited smart lists over these domains, filed in Smart Lists. */
const LEGACY_STARTERS: readonly { name: string; emoji: string; domains: string[] }[] = [
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
/** `'true'` = the v1 lists were created (in Smart Lists); this value = the current ones were. */
const SEEDED_V2 = 'v2';

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every(x => b.includes(x));

/**
 * The first version put eleven unlimited topic lists in Smart Lists, which were far too big for a new
 * learner. Removes the ones still exactly as the app made them — a list the learner edited, or filed
 * elsewhere, is theirs and stays — and the folder they were in once it is empty.
 */
function removeLegacyStarters(lang: string): void {
  const rules = getSmartLists(lang);
  for (const { name, emoji, domains } of LEGACY_STARTERS) {
    const r = rules[name];
    if (!r || r.starter) continue;
    const untouched = sameSet(r.domains, domains) && r.emoji === emoji
      && (r.folders ?? []).length === 1 && r.folders![0] === LEGACY_STARTER_FOLDER
      && r.limit === 0 && r.mastered === 'any' && r.listed === 'any'
      && r.bands.length === 0 && r.pos.length === 0 && r.manualWords.length === 0
      && !r.wordStartsWith && !r.meaningContains;
    if (untouched) deleteSmartList(lang, name);
  }
  const stillFiled = Object.values(getSmartLists(lang)).some(r => (r.folders ?? []).includes(LEGACY_STARTER_FOLDER));
  if (!stillFiled && getFolderRegistry(`smart_${lang}`).includes(LEGACY_STARTER_FOLDER)) {
    removeFolder(`smart_${lang}`, LEGACY_STARTER_FOLDER);
  }
}

/** The first build coloured the two folders green and purple; that clashed with the section's own blue. */
function dropSeededFolderColours(lang: string): void {
  const scope = `starter_${lang}`;
  const old: [string, string][] = [[FOLDER_COMMON, '#2f8f5b'], [FOLDER_TOPICS, '#6444ad']];
  for (const [folder, colour] of old) {
    const look = getFolderStyle(scope, folder);
    if (look.color === colour) setFolderStyle(scope, folder, { emoji: look.emoji });
  }
}

/** Adds the starter lists for `lang` the first time it is called for it. */
export function seedStarterLists(lang: string): void {
  const flag = readString(seededKey(lang));
  if (flag === SEEDED_V2) { dropSeededFolderColours(lang); return; }
  if (flag === 'true') removeLegacyStarters(lang);

  const scope = `starter_${lang}`;
  addFolder(scope, FOLDER_COMMON);
  addFolder(scope, FOLDER_TOPICS);
  // No folder colour: the section's own blue shows through, like every other section's folders.
  setFolderStyle(scope, FOLDER_COMMON, { emoji: '⭐' });
  setFolderStyle(scope, FOLDER_TOPICS, { emoji: '🎓' });

  const existing = getSmartLists(lang);
  for (const { name, rule: r } of STARTER_LISTS) {
    if (existing[name]) continue;   // the learner already has a list by that name — leave it be
    saveSmartRule(lang, name, { ...r, domains: [...r.domains], pos: [...r.pos], folders: [...(r.folders ?? [])] });
  }
  writeString(seededKey(lang), SEEDED_V2);
}
