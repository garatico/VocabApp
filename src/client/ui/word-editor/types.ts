/**
 * word-editor/types.ts — the shape the shared Word Editor works in, and the
 * adapter each host (the Admin panel, My Content) supplies.
 *
 * The editor itself knows nothing about where words live. Admin edits the
 * master database through its data client; My Content stores per-learner
 * overrides in the browser. Both translate to and from `WordData` here, and
 * to and from their own storage, in their adapter.
 */

export interface Frequency {
  band?: string | null;
  rank?: number | null;
  corpus_frequency?: number | null;
}

export interface Linguistic {
  ipa?: string | null;
  syllables?: string | string[] | null;
  gender?: string | null;
  plural?: string | null;
  infinitive?: string | null;
  register?: string | null;
  reflexive?: boolean;
}

export interface WordData {
  word: string;
  translation?: string;
  pos?: string | null;
  difficulty?: string | null;
  notes?: string;
  glosses?: string[];
  examples?: string[];
  domains?: string[];
  emoji?: string | null;
  frequency?: Frequency;
  linguistic?: Linguistic;
  tags?: string[];
  disambiguator?: string | null;

  // ── Only meaningful to hosts that opt in (My Content) ─────────────────────
  synonyms?: string[];
  antonyms?: string[];
  /** Per-sense note, keyed by the gloss text ("work" → "function"). */
  meaningDisambiguators?: Record<string, string>;
  /** The word as it is without the host's edits. When present, the form marks
   *  each field that differs from it and offers a per-field revert. */
  original?: WordData;
  /** Host flags: this word has edits on top of the original / is one the user added. */
  edited?: boolean;
  custom?: boolean;
}

export interface ChipOption { value: string; label: string; }

/** What a host can tell the editor about the data it is editing. */
export interface WordEditorMeta {
  pos: string[];
  domains: string[];
  /** Languages to offer in the language picker; omitted = the host has no picker. */
  languages?: string[];
  /** Whether the store can hold a disambiguator (older databases can't). */
  disambiguatorSupported?: boolean;
}

export interface WordPageQuery {
  lang: string;
  page: number;
  limit: number;
  search?: string;
  pos?: string;
  band?: string;
  domain?: string;
}

export interface WordPage {
  words: WordData[];
  total: number;
  page: number;
  pages: number;
}

export interface WordEditorAdapter {
  getMeta(): Promise<WordEditorMeta>;
  fetchPage(query: WordPageQuery): Promise<WordPage>;
  createWord(key: string, lang: string, data: Omit<WordData, 'word'>): Promise<WordData>;
  updateWord(key: string, lang: string, data: Omit<WordData, 'word'>): Promise<WordData>;
  /** Shown to the user after a save/failure — the host decides how (toast, status bar…). */
  notify(message: string, kind: 'success' | 'error'): void;
  /** Drops every edit made to `key`, returning the word as it originally is. */
  revertWord?(key: string, lang: string): Promise<WordData>;
  /** Asked before a revert; return false to cancel. Omitted = never ask. */
  confirmRevert?(key: string): boolean;
  /** Deletes a word the user added. */
  deleteWord?(key: string, lang: string): Promise<void>;
}

export interface WordEditorOptions {
  adapter: WordEditorAdapter;
  /**
   * Prefix for every element id the editor creates. The Admin panel passes ''
   * (its end-to-end tests and styles know the plain ids); a host that shares a
   * page with other UI passes something unique so ids can never collide.
   */
  idPrefix?: string;
  /** Extra element(s) appended to the end of the filter bar (e.g. Admin's Word Editor / Table View toggle). */
  filterBarExtra?: HTMLElement;
  /** Words per page until a host says otherwise. */
  pageSize?: number;
  /** Which language the language picker starts on. */
  initialLang?: string;
  /** Renders a language flag next to the picker; omitted = none. */
  langFlag?: (lang: string) => HTMLElement | null;
}
