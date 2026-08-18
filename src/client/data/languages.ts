/**
 * languages.ts — which languages the app offers, and what each one supports.
 *
 * The list used to be spelled out in four places that had to agree: the
 * <select> in index.html, LANG_CODE in app.ts, the Languages union in
 * visual-map.ts, and LANG_ORDER in the admin stats tab. Adding German meant
 * finding all four, so it lives here now and they read from it.
 *
 * `hasConjugations` is the interesting field. It is not a preference — it
 * records whether any conjugation data exists for that language at all:
 *
 *   spanish                  generated at load time by the rules engine in
 *                            src/server/lib/verb-rules.ts
 *   french, italian, portuguese
 *                            a full table imported from mlconjug3 at sync time
 *   german, dutch            a table fetched from Wiktionary by the
 *                            `conjugations` pipeline step. mlconjug3 covers
 *                            en/es/fr/it/pt/ro only, and a rules engine would
 *                            not have helped: most of the German and Dutch
 *                            verbs in the vocabulary are strong, so their
 *                            principal parts have to be supplied as data
 *                            whatever generates the rest.
 *
 * The flag says the app *can* drill the language, not that every verb has a
 * table. Coverage is patchy in the imported languages — 41 of French's 1,337
 * verbs carry one — so Conjugation mode drops verbs with no forms rather than
 * offering a card that cannot be completed.
 *
 * So Conjugation mode is offered for four of the six, and disabled with an
 * explanation for the other two rather than opening onto an empty grid.
 * Everything else — Table, Recall, Single Word, Picture Quiz, My Lists —
 * works from word/translation/pos and is available for all of them.
 */

export interface LanguageInfo {
  /** The key used everywhere: DB `lang` column, API path, localStorage. */
  name:  string;
  /** What the user sees. */
  label: string;
  /** ISO 639-1. Used for speech synthesis and the `lang` attribute. */
  iso:   string;
  /** Is there any source of conjugation data for this language? */
  hasConjugations: boolean;
  /** Are nouns written with a capital letter? Affects answer matching. */
  capitalisesNouns: boolean;
}

export const LANGUAGES: LanguageInfo[] = [
  { name: 'spanish',    label: 'Spanish',    iso: 'es', hasConjugations: true,  capitalisesNouns: false },
  { name: 'portuguese', label: 'Portuguese', iso: 'pt', hasConjugations: true,  capitalisesNouns: false },
  { name: 'italian',    label: 'Italian',    iso: 'it', hasConjugations: true,  capitalisesNouns: false },
  { name: 'french',     label: 'French',     iso: 'fr', hasConjugations: true,  capitalisesNouns: false },
  { name: 'german',     label: 'German',     iso: 'de', hasConjugations: true,  capitalisesNouns: true  },
  { name: 'dutch',      label: 'Dutch',      iso: 'nl', hasConjugations: true,  capitalisesNouns: false },
];

/** Language names in display order — the order of the dropdown. */
export const LANGUAGE_NAMES: string[] = LANGUAGES.map(l => l.name);

const BY_NAME: Record<string, LanguageInfo> =
  Object.fromEntries(LANGUAGES.map(l => [l.name, l]));

/** Falls back to Spanish, which is what every caller's default already was. */
export function languageInfo(name: string | null | undefined): LanguageInfo {
  return BY_NAME[name ?? ''] ?? LANGUAGES[0];
}

export function isoCode(name: string | null | undefined): string {
  return languageInfo(name).iso;
}

export function supportsConjugation(name: string | null | undefined): boolean {
  return languageInfo(name).hasConjugations;
}

/**
 * Why Conjugation mode is unavailable, for the tab's tooltip and the panel
 * shown if it is opened anyway. Empty string when it *is* available.
 */
export function conjugationUnavailableReason(name: string | null | undefined): string {
  const info = languageInfo(name);
  if (info.hasConjugations) return '';
  return `${info.label} verbs have no conjugation data yet. The library the other `
       + `languages use (mlconjug3) covers en/es/fr/it/pt/ro only, so this mode `
       + `needs a rules engine written for ${info.label} — the way Spanish has one.`;
}
