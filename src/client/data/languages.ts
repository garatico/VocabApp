/**
 * languages.ts — which languages the app offers, and what each one supports.
 *
 * The list used to be spelled out in four places that had to agree: the
 * <select> in index.html, LANG_CODE in app.ts, the Languages union in
 * visual-map.ts, and LANG_ORDER in the admin stats tab. Adding German meant
 * finding all four, so it lives here now and they read from it.
 *
 * `hasConjugations` is the interesting field. It is not a preference — it
 * records whether any conjugation data exists for that language at all.
 *
 * Flags are self-hosted SVGs (public/flags/, see the README there) rather
 * than Unicode flag emoji: Windows' bundled emoji font has no flag glyphs, so
 * a regional-indicator pair like 🇪🇸 renders as the literal letters "ES" on
 * a lot of Windows browsers instead of a flag.
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
  /**
   * Is the word itself written in a non-Latin script, with `linguistic.ipa`
   * carrying a romanized reading (e.g. Chinese hanzi + pinyin) rather than a
   * phonetic transcription nobody would type? Affects answer matching:
   * Settings.getRomanizedAnswerMode() decides whether the "type the target
   * word" direction accepts that romanization, the literal script, or either.
   */
  romanizedScript: boolean;
  /**
   * Table mode's Compare/Multi-language indicator: a flag image and the CSS
   * custom property carrying its tinted cell-background color. See table.css
   * and variables.css for the `--lang-<name>-bg` definitions this points at.
   * `flagCountry` is the default — `flagOptions[0]` — overridable per-language
   * in Settings (Settings.getLangFlag) to any country the language is a main
   * language in, e.g. Portuguese as Brazil instead of Portugal.
   */
  flagCountry: string;
  colorVar:    string;
  flagOptions: { country: string; label: string }[];
}

/** public/flags/<country>.svg — see the README there. */
export function flagUrl(country: string): string {
  return `/flags/${country}.svg`;
}

// Curated, not exhaustive — a handful of the countries each language is a
// main language in, biased toward population/recognizability. Spanish alone
// is an official language in ~20 countries; the point here is a manageable
// picker, not a complete list.
const FLAG_OPTIONS: Record<string, { country: string; label: string }[]> = {
  spanish: [
    { country: 'es', label: 'Spain' },
    { country: 'mx', label: 'Mexico' },
    { country: 'ar', label: 'Argentina' },
    { country: 'co', label: 'Colombia' },
    { country: 'pe', label: 'Peru' },
    { country: 'cl', label: 'Chile' },
  ],
  portuguese: [
    { country: 'pt', label: 'Portugal' },
    { country: 'br', label: 'Brazil' },
    { country: 'ao', label: 'Angola' },
    { country: 'mz', label: 'Mozambique' },
  ],
  italian: [
    { country: 'it', label: 'Italy' },
    { country: 'ch', label: 'Switzerland' },
    { country: 'sm', label: 'San Marino' },
  ],
  french: [
    { country: 'fr', label: 'France' },
    { country: 'ca', label: 'Canada' },
    { country: 'be', label: 'Belgium' },
    { country: 'ch', label: 'Switzerland' },
    { country: 'sn', label: 'Senegal' },
  ],
  german: [
    { country: 'de', label: 'Germany' },
    { country: 'at', label: 'Austria' },
    { country: 'ch', label: 'Switzerland' },
    { country: 'li', label: 'Liechtenstein' },
  ],
  dutch: [
    { country: 'nl', label: 'Netherlands' },
    { country: 'be', label: 'Belgium' },
    { country: 'sr', label: 'Suriname' },
    { country: 'aw', label: 'Aruba' },
  ],
  chinese: [
    { country: 'cn', label: 'China' },
    { country: 'tw', label: 'Taiwan' },
    { country: 'sg', label: 'Singapore' },
    { country: 'hk', label: 'Hong Kong' },
    { country: 'mo', label: 'Macau' },
  ],
};

export const LANGUAGES: LanguageInfo[] = [
  { name: 'spanish',    label: 'Spanish',    iso: 'es', hasConjugations: true,  capitalisesNouns: false, romanizedScript: false, colorVar: '--lang-spanish-bg',    flagOptions: FLAG_OPTIONS['spanish'],    flagCountry: FLAG_OPTIONS['spanish'][0].country },
  { name: 'portuguese', label: 'Portuguese', iso: 'pt', hasConjugations: true,  capitalisesNouns: false, romanizedScript: false, colorVar: '--lang-portuguese-bg', flagOptions: FLAG_OPTIONS['portuguese'], flagCountry: FLAG_OPTIONS['portuguese'][0].country },
  { name: 'italian',    label: 'Italian',    iso: 'it', hasConjugations: true,  capitalisesNouns: false, romanizedScript: false, colorVar: '--lang-italian-bg',    flagOptions: FLAG_OPTIONS['italian'],    flagCountry: FLAG_OPTIONS['italian'][0].country },
  { name: 'french',     label: 'French',     iso: 'fr', hasConjugations: true,  capitalisesNouns: false, romanizedScript: false, colorVar: '--lang-french-bg',     flagOptions: FLAG_OPTIONS['french'],     flagCountry: FLAG_OPTIONS['french'][0].country },
  { name: 'german',     label: 'German',     iso: 'de', hasConjugations: true,  capitalisesNouns: true,  romanizedScript: false, colorVar: '--lang-german-bg',     flagOptions: FLAG_OPTIONS['german'],     flagCountry: FLAG_OPTIONS['german'][0].country },
  { name: 'dutch',      label: 'Dutch',      iso: 'nl', hasConjugations: true,  capitalisesNouns: false, romanizedScript: false, colorVar: '--lang-dutch-bg',      flagOptions: FLAG_OPTIONS['dutch'],      flagCountry: FLAG_OPTIONS['dutch'][0].country },
  { name: 'chinese',    label: 'Chinese',    iso: 'zh', hasConjugations: false, capitalisesNouns: false, romanizedScript: true,  colorVar: '--lang-chinese-bg',    flagOptions: FLAG_OPTIONS['chinese'],    flagCountry: FLAG_OPTIONS['chinese'][0].country },
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
