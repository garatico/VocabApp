import { readString, writeString, remove as removeKey } from './utils/storage.ts';
import { applyTheme, type ThemeValue } from './ui/theme-toggle.ts';
import { LANGUAGES, languageInfo, flagUrl } from './data/languages.ts';
import { createFlagImg } from './ui/flag-icon.ts';
import { clearHistory } from './utils/session-history.ts';
import {
  getGoals, setGoalTarget, hasLanguageGoal, clearLanguageGoal,
  getStreak, getBestStreak, getTodayProgress, getTodayMinutes, getStreakHistory,
  getGoalHitsForDate, parseHitKey,
  type GoalType,
} from './utils/streak.ts';
import type { ChineseScript, ChineseDisplay } from './utils/utils.ts';

/**
 * settings.ts — persistent quiz preferences.
 *
 * Keys use the 's_' prefix to distinguish from session state ('vq_' prefix).
 * Getters always return a typed, defaulted value; setters write to localStorage.
 */

const P = 's_';
const get = (k: string, fallback: string): string => readString(P + k) ?? fallback;
const set = (k: string, v: string): void => { writeString(P + k, v); };

export type HintMode  = 'none' | 'first-letter' | 'full';
export type MatchMode = 'fuzzy' | 'strict';
export type TypoTolerance = 'off' | 'low' | 'normal' | 'high';

// Fraction of an answer's length forgiven as typos in quiz checking.
const TYPO_RATIOS: Record<TypoTolerance, number> = { off: 0, low: 0.15, normal: 0.25, high: 0.35 };
export type FontSize  = 'xs' | 'small' | 'medium' | 'large' | 'xl';

/**
 * Whether the Regularity filter narrows the whole language pool before the
 * Verbs size cap is applied, or only what's left of the already-capped Top
 * N. 'afterTopN' (the default) matches how the app already behaved before
 * this setting existed: Start Quiz takes the N most frequent verbs, then
 * narrows by Regularity from that fixed set — so unchecking a bucket can
 * shrink the final verb count below N. 'beforeTopN' narrows the whole
 * language by Regularity first, so the final count always matches N.
 */
export type ConjRegularityScope = 'afterTopN' | 'beforeTopN';

export type ConjDeselected = 'close' | 'blank' | 'grey' | 'answer';
const CONJ_DESELECTED: ConjDeselected[] = ['close', 'blank', 'grey', 'answer'];

export type LangIndicator = 'off' | 'color' | 'flag';

// POS only ever renders on Table and Picture (ui-state.ts always hides it on
// Conjugation regardless); Lists/Domains also render on Conjugation.
const POS_HIDEABLE_MODES = ['table', 'picture'] as const;
// Lists doesn't apply to trivia (no vocabulary pool to hide/focus within),
// but Domains does — trivia questions carry their own `domains` field (see
// data/trivia-questions.ts) — so 'trivia' is here even though it isn't in
// POS_HIDEABLE_MODES, and getHideListsFilter('trivia') is simply never
// checked (ui-state.ts always force-hides the Lists box there regardless).
const LISTS_DOMAINS_HIDEABLE_MODES = ['table', 'picture', 'conjugation', 'trivia'] as const;

function getHiddenFilterModes(legacyKey: string, applicable: readonly string[]): Set<string> {
  const modesKey = legacyKey + '_modes';
  const raw = readString(P + modesKey);
  if (raw !== null) return new Set(raw.split(',').filter(Boolean));
  return get(legacyKey, 'false') === 'true' ? new Set(applicable) : new Set();
}

function setHiddenFilterModes(legacyKey: string, modes: Set<string>): void {
  set(legacyKey + '_modes', Array.from(modes).join(','));
}

/** The app's own interface language — separate from the vocabulary language
 *  picked in `#langSelect`. Only 'english' (the hardcoded default, no lookup
 *  needed) and 'spanish' (translated) are wired up; the rest are Settings UI
 *  placeholders disabled until translated. */
export type UILanguage = 'english' | 'spanish';

/** Grid class for each mode. 'close' needs none — it is the base behaviour. */
export const CONJ_DESELECTED_CLASS: Record<ConjDeselected, string> = {
  close:  '',
  blank:  'conj-cards-grid--keep-blank',
  grey:   'conj-cards-grid--keep-grey',
  answer: 'conj-cards-grid--keep-answer',
};

/** Put the right modifier on the cards grid, clearing the other three. */
export function applyConjDeselectedClass(grid: Element | null, mode: ConjDeselected): void {
  if (!grid) return;
  Object.values(CONJ_DESELECTED_CLASS).forEach(c => { if (c) grid.classList.remove(c); });
  const cls = CONJ_DESELECTED_CLASS[mode];
  if (cls) grid.classList.add(cls);
}

export const Settings = {
  // ── Table ──────────────────────────────────────────────────────────────────
  getTableCols: (): number    => Math.max(1, Math.min(5, Number(get('table_cols', '2')))),

  /**
   * Table mode's Hint and Reveal buttons, split apart and independently
   * switchable — a learner can have either, both, or neither. Hint always
   * gives just the first letter (a fuller hint system is planned separately
   * — see table-mode.ts); Reveal fills in the full answer and counts it as
   * missed. Both used to be one button whose behavior was chosen by the
   * now-Conjugation-only hint_mode below, so an existing user's prior choice
   * becomes each of these two toggles' starting default rather than
   * silently resetting — first-letter mode had both capabilities, full mode
   * had only Reveal, none had neither.
   */
  getShowHintButton: (): boolean => {
    const v = readString(P + 'table_hint_button');
    return v !== null ? v === 'true' : get('hint_mode', 'full') === 'first-letter';
  },
  getShowRevealButton: (): boolean => {
    const v = readString(P + 'table_reveal_button');
    return v !== null ? v === 'true' : get('hint_mode', 'full') !== 'none';
  },

  /**
   * Conjugation mode's own hint/reveal setting — still the original 3-way
   * choice (unlike Table mode's two independent toggles above), since its
   * reveal buttons work per-slot in a grid rather than per-row and weren't
   * part of this split. Storage key moved off the shared hint_mode so it can
   * keep evolving separately from Table's; an existing user's old shared
   * choice is this setting's starting default the first time it's read.
   */
  getConjHintMode: (): HintMode =>
    (readString(P + 'conj_hint_mode') ?? get('hint_mode', 'full')) as HintMode,

  /**
   * How many English senses buildGlossDisplay() joins with " / " before
   * cutting the rest — separately for the question box (dir 'en-target',
   * default 1) and the answer box (dir 'target-en', default 2). A word like
   * *coger* can carry half a dozen glosses; showing all of them read as the
   * quiz handing over the answer.
   */
  getQuestionGlossCount: (): number => Math.max(1, Math.min(5, Number(get('question_gloss_count', '1')))),
  getAnswerGlossCount:   (): number => Math.max(1, Math.min(5, Number(get('answer_gloss_count', '2')))),

  /**
   * Whether a correct answer that lands past the Answer glosses cutoff gets
   * added to the revealed answer rather than left out of it. On by default —
   * it only ever adds to what's shown, never hides anything.
   */
  getExpandGlossOnMatch: (): boolean => get('expand_gloss_on_match', 'true') === 'true',

  /**
   * Words shown per page in table mode. 'all' (or any unparseable value)
   * means no pagination, represented as Infinity so callers can slice with it
   * directly.
   */
  getTablePageSize: (): number => {
    const raw = get('table_page_size', '100');
    if (raw === 'all') return Infinity;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : Infinity;
  },

  /**
   * Starting default for Conjugation's Grid/Full Conjugation "Per Page"
   * control (conjugation/index.ts's CONJ_PAGE_SIZES: 5/10/25/50) — read only
   * until a quiz's own selector has ever been changed, at which point that
   * choice (vq_conj_page_size) takes over. Not the live pagination size
   * itself, unlike getTablePageSize.
   */
  getConjPageSize: (): number => {
    const raw = get('conj_page_size', '10');
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 10;
  },

  /** On by default — off hides the clock and its start/pause/reset controls.
   *  Time is still tracked underneath (session history, goals) either way;
   *  this only controls whether it's shown. */
  getShowTimer: (): boolean => get('table_show_timer', 'true') === 'true',

  /** Conjugation's own copy of getShowTimer — independent so a learner can
   *  hide the clock in one mode without losing it in the other. */
  getConjShowTimer: (): boolean => get('conj_show_timer', 'true') === 'true',

  /** Whether Table mode is a race against the clock — when the limit is hit,
   *  the quiz ends and reveals whatever's left, same as clicking Give Up. */
  getTimedQuizEnabled: (): boolean => get('table_timed_quiz', 'false') === 'true',

  /** Minutes for the timed-quiz limit above. 10 is a reasonable default for
   *  a first try — small enough to actually create time pressure on a
   *  Top-100-words quiz, not so short it's unusable on a bigger one. */
  getTimedQuizMinutes: (): number => {
    const n = Number(get('table_timed_quiz_minutes', '10'));
    return Number.isFinite(n) && n > 0 ? n : 10;
  },

  /** The frequency-rank corner badge, across every Table quiz style. */
  getTableShowRank: (): boolean => get('table_show_rank', 'true') === 'true',

  /** The list star and "missed before" count badge, across every Table quiz style. */
  getTableShowWordMarkers: (): boolean => get('table_show_word_markers', 'true') === 'true',

  /**
   * The "(permanent)"-style sense clarifier appended after a word that has
   * one — see utils.ts's displayWord(). On by default, since that's what
   * every session already saw before this setting existed. Threaded through
   * as a parameter everywhere displayWord() is called, same as
   * getChineseDisplay(), rather than read inside displayWord() itself, so
   * that function stays pure and testable.
   */
  getShowDisambiguator: (): boolean => get('show_disambiguator', 'true') === 'true',

  // ── All quizzes ────────────────────────────────────────────────────────────
  getMatchMode: (): MatchMode => get('match_mode', 'fuzzy') as MatchMode,
  getTypoTolerance: (): TypoTolerance => get('typo_tolerance', 'normal') as TypoTolerance,
  getTypoToleranceRatio: (): number => TYPO_RATIOS[get('typo_tolerance', 'normal') as TypoTolerance] ?? 0.25,

  /**
   * For a `romanizedScript` language (Chinese): which script is the word
   * slot's primary form — shown by default, and required by default when
   * typed. 'characters' is the default: it's what a learner typically wants
   * to end up reading, and typing pinyin is still available as a fallback
   * (see getShowBothScripts) without switching this.
   */
  getChineseScript: (): ChineseScript => get('chinese_script', 'characters') as ChineseScript,

  /**
   * For a `romanizedScript` language (Chinese): annotate the word slot's
   * primary script with the other one in parentheses (e.g. "的 (de)"), and
   * accept either script as a typed answer rather than only the primary. On
   * by default — typing hanzi needs an IME most learners won't have set up,
   * so refusing pinyin out of the box would make typing the word unusable
   * for most people, and showing it is what makes accepting it fair.
   */
  getShowBothScripts: (): boolean => get('show_pinyin', 'true') === 'true',

  /**
   * For a `romanizedScript` language (Chinese): annotate the English gloss
   * with the pinyin reading too, e.g. "already (le)" — independent of
   * getShowBothScripts, which only annotates the word slot. On by default,
   * same reasoning as getShowBothScripts.
   */
  getShowPinyinGloss: (): boolean => get('show_pinyin_gloss', 'true') === 'true',

  /** Bundles the three Chinese-display settings above for `slotText`/`slotMatches`. */
  getChineseDisplay(): ChineseDisplay {
    return {
      chineseScript:   this.getChineseScript(),
      showBothScripts: this.getShowBothScripts(),
      showPinyinGloss: this.getShowPinyinGloss(),
    };
  },

  /**
   * Whether the browser may offer its own autofill/autocomplete suggestions
   * in quiz answer boxes. Off by default: a dropdown of past answers sitting
   * over the input is a bigger problem in a quiz than in most text fields,
   * since the whole point is recalling the word yourself.
   */
  getAutofillEnabled: (): boolean => get('autofill_enabled', 'false') === 'true',

  /**
   * Whether known vulgar/offensive words are removed from every quiz's word
   * pool — see data/swear-words.ts. Off by default so turning it on is a
   * deliberate choice, not a silent change to what a returning user sees.
   */
  getSwearFilterEnabled: (): boolean => get('swear_filter_enabled', 'false') === 'true',

  /**
   * Whole-app toggle for a kid, or anyone trying the app for the first time.
   * Turning it on is a one-time nudge (not a permanent lock) for Advanced
   * mode and the swear filter — see the click handler in bindSettings() —
   * and, unlike those two, actively locks My Content against edits for as
   * long as it stays on (see app.ts's syncKidFriendlyLocks()).
   */
  getKidFriendlyMode: (): boolean => get('kid_friendly_mode', 'false') === 'true',

  /**
   * Which visual categories Picture Quiz is allowed to draw from — Wikipedia
   * photos, SVGs (custom + OpenMoji) and emoji. All on by default, since
   * that's what every session already saw before this setting existed.
   * picture-mode.ts checks these when building each card's visual and when
   * deciding whether a word has one at all; a word left with nothing enabled
   * drops out of the quiz the same way a word with no visual at all always
   * has.
   */
  getPictureSourcePhotos: (): boolean => get('picture_source_photos', 'true') === 'true',
  getPictureSourceSvgs:   (): boolean => get('picture_source_svgs',   'true') === 'true',
  getPictureSourceEmoji:  (): boolean => get('picture_source_emoji',  'true') === 'true',

  /**
   * Hide a whole filter box — Part of Speech, Lists, Domains — in specific
   * quiz modes, rather than only all-or-nothing app-wide. This is stronger
   * than that filter's own On/Off toggle: Off still shows the box (dimmed)
   * with your selections remembered for later; this removes it from view
   * entirely in the modes checked and makes it stop narrowing anything
   * there, until unchecked again. class-filter.ts/domain-filter.ts/
   * word-filters.ts check these at the same point they check their own
   * `active` flag, so a hidden filter can't keep silently doing something
   * you can no longer see or reach.
   *
   * Stored as a comma-joined list of mode ids under `*_modes` — checking
   * every applicable mode is equivalent to the old single global toggle,
   * which this replaces. A one-time migration reads the old boolean key
   * (`hide_pos_filter` etc, 'true'/'false') if the new key was never
   * written, so an existing "Hide everywhere" choice carries forward as
   * every applicable mode checked rather than silently reverting to Show.
   */
  getHidePOSFilter:     (mode: string): boolean => getHiddenFilterModes('hide_pos_filter',     POS_HIDEABLE_MODES).has(mode),
  getHideListsFilter:   (mode: string): boolean => getHiddenFilterModes('hide_lists_filter',   LISTS_DOMAINS_HIDEABLE_MODES).has(mode),
  getHideDomainsFilter: (mode: string): boolean => getHiddenFilterModes('hide_domains_filter', LISTS_DOMAINS_HIDEABLE_MODES).has(mode),

  /** Every mode a given filter can be hidden in — for building the Settings checkboxes. */
  getHideablePOSModes:          (): readonly string[] => POS_HIDEABLE_MODES,
  getHideableListsDomainsModes: (): readonly string[] => LISTS_DOMAINS_HIDEABLE_MODES,

  /**
   * Whether finished quizzes get logged to the History tab's session list.
   * On by default. Off stops new sessions from being recorded — it does not
   * erase what's already there, and it doesn't touch the separate per-word
   * miss tally (session-history.ts's recordOutcome), which drives "Words I
   * Keep Missing First" ordering and trouble-word marking regardless.
   */
  getHistoryEnabled: (): boolean => get('history_enabled', 'true') === 'true',

  /**
   * Whether a filter (Lists, Class, Domain) can be shared across modes at
   * all. On by default. Off forces every mode onto its own independent
   * filter bucket — see filter-state.ts's isChained(), which this short-
   * circuits — and hides the chain button, since there's nothing left for it
   * to do.
   */
  getFilterLinkingEnabled: (): boolean => get('filter_linking_enabled', 'true') === 'true',

  /**
   * Whether the Settings panel shows every setting or just the ones most
   * people actually change. Off by default — rows/sections marked
   * `data-advanced="true"` in index.html are hidden by settings.css's
   * `body:not(.advanced-mode) [data-advanced]` rule until this is on.
   */
  getAdvancedMode: (): boolean => get('advanced_mode', 'false') === 'true',

  // ── Appearance ────────────────────────────────────────────────────────────
  getFontSize: (): FontSize => get('font_size', 'medium') as FontSize,

  /** See UILanguage — defaults to 'english', which needs no translation lookup. */
  getUILanguage: (): UILanguage => get('ui_language', 'english') as UILanguage,

  // ── Guess the Blank ────────────────────────────────────────────────────────

  /**
   * Wrong guesses allowed on a question before it's scored as missed and the
   * answer revealed. Infinity means never fail on wrong guesses alone — Give
   * Up (or running out of clues) is still how a stuck question ends.
   */
  getGuessBlankMaxAttempts: (): number => {
    const raw = get('guess_blank_max_attempts', '1');
    if (raw === 'unlimited') return Infinity;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 1;
  },

  // ── Conjugation ────────────────────────────────────────────────────────────

  /**
   * What a deselected pronoun leaves behind.
   *
   * Anything but 'close' keeps the cell, so dropping *vosotros* still gives a
   * 2×3 chart with every other pronoun where a learner expects to find it,
   * rather than moving *ellos* up into the *vosotros* slot.
   *
   *   close   remove the cell; the rest close up. Denser, but the chart loses
   *           its shape.
   *   blank   keep the cell and its grid lines, hide the contents.
   *   grey    keep the cell, show the pronoun and an empty disabled box, dimmed
   *           — you can still see which pronoun you dropped.
   *   answer  as grey, with the conjugation filled in. Turns a deselected
   *           pronoun into a worked example rather than a blank.
   */
  getConjDeselected: (): ConjDeselected => {
    const raw = readString(P + 'conj_deselected');
    if (raw && CONJ_DESELECTED.includes(raw as ConjDeselected)) return raw as ConjDeselected;
    // Migrate the boolean this replaced. It only distinguished keep from close,
    // and 'grey' is the keep variant that shows the most.
    const legacy = readString(P + 'conj_keep_shape');
    if (legacy === 'false') return 'close';
    return 'grey';
  },

  /** See ConjRegularityScope. */
  getConjRegularityScope: (): ConjRegularityScope => get('conj_regularity_scope', 'afterTopN') as ConjRegularityScope,
  setConjRegularityScope: (scope: ConjRegularityScope): void => set('conj_regularity_scope', scope),

  // ── Multi-Language Table ──────────────────────────────────────────────────

  /**
   * How table mode shows which language a merged-in word belongs to.
   * Defaults on ('color') — the whole point of the indicator is telling
   * mixed-in words apart at a glance, so it shows the moment 2+ languages are
   * active rather than waiting to be found in Settings.
   */
  getLangIndicator: (): LangIndicator => get('lang_indicator', 'color') as LangIndicator,

  /** A per-language color override, or null to use that language's CSS default. */
  getLangColor: (name: string): string | null => readString(P + 'lang_color_' + name),

  /**
   * A per-language flag override (any country that language is a main
   * language in), or its default. Returns a country code (public/flags/
   * filename), not the language's own ISO code — `languageInfo().iso` is
   * that.
   *
   * Validated against `flagOptions` rather than trusted outright: this used
   * to store the Unicode flag emoji itself, and a value written under that
   * scheme would otherwise resolve to a country nothing offers any more.
   */
  getLangFlag: (name: string): string => {
    const info  = languageInfo(name);
    const saved = readString(P + 'lang_flag_' + name);
    const match = info.flagOptions.find(o => o.country === saved);
    return match ? match.country : info.flagCountry;
  },

  /** A per-tense hue override (0-360), or null to use conjugation.css's default. */
  getTenseHue: (key: string): number | null => {
    const v = readString(P + 'tense_hue_' + key);
    return v === null ? null : Number(v);
  },
  /** A per-pronoun-slot (0-5) hue override, or null to use the default. */
  getPersonHue: (i: number): number | null => {
    const v = readString(P + 'person_hue_' + i);
    return v === null ? null : Number(v);
  },
};

// ── Language color application ────────────────────────────────────────────────

/**
 * Apply any saved per-language color overrides as inline :root properties, so
 * they win over the stylesheet defaults without editing the stylesheet.
 * Called at startup and whenever a color input changes.
 */
export function applyLangColors(): void {
  for (const lang of LANGUAGES) {
    const override = Settings.getLangColor(lang.name);
    if (override) {
      document.documentElement.style.setProperty(lang.colorVar, override);
    } else {
      document.documentElement.style.removeProperty(lang.colorVar);
    }
  }
}

// ── Conjugation tense/person color application ────────────────────────────────

/**
 * Every tense conjugation.css assigns a hue to, alongside the default hue
 * itself — kept here (not read out of TENSE_DEFS) because TENSE_DEFS' own
 * labels are per-language display strings ("Preterito Indefinido"), not
 * generic English names suited to one settings row shown regardless of
 * which language is active.
 */
const TENSE_COLOR_DEFS: readonly [key: string, label: string, defaultHue: number][] = [
  ['present',                  'Present',                    145],
  ['preterite',                'Preterite',                  210],
  ['imperfect',                'Imperfect',                  265],
  ['future',                   'Future',                      25],
  ['conditional',              'Conditional',                330],
  ['subjunctive',              'Subjunctive',                190],
  ['past_participle',          'Past Participle',             45],
  ['gerund',                   'Gerund',                     285],
  ['imperative_affirmative',   'Imperative (Affirmative)',   355],
  ['imperative_negative',      'Imperative (Negative)',      100],
  ['imperfect_subjunctive',    'Imperfect Subjunctive',      235],
  ['future_subjunctive',       'Future Subjunctive',          65],
];

/** Same idea, for the 6 grammatical-person slots (data-pi="0".."5"). */
const PERSON_COLOR_DEFS: readonly [i: number, label: string, defaultHue: number][] = [
  [0, '1st Person Singular', 0],
  [1, '2nd Person Singular', 60],
  [2, '3rd Person Singular', 120],
  [3, '1st Person Plural', 180],
  [4, '2nd Person Plural', 240],
  [5, '3rd Person Plural', 300],
];

/**
 * Apply any saved tense/person hue overrides as inline :root properties —
 * same mechanism as applyLangColors above, but each override feeds a
 * --tense-hue-<key>/--pronoun-hue-<i> custom property that conjugation.css's
 * [data-tense]/[data-pi] rules read through (see that file's own comments),
 * rather than replacing a single fixed variable.
 */
export function applyTenseColors(): void {
  for (const [key] of TENSE_COLOR_DEFS) {
    const hue = Settings.getTenseHue(key);
    if (hue !== null) document.documentElement.style.setProperty('--tense-hue-' + key, String(hue));
    else document.documentElement.style.removeProperty('--tense-hue-' + key);
  }
  for (const [i] of PERSON_COLOR_DEFS) {
    const hue = Settings.getPersonHue(i);
    if (hue !== null) document.documentElement.style.setProperty('--pronoun-hue-' + i, String(hue));
    else document.documentElement.style.removeProperty('--pronoun-hue-' + i);
  }
}

// ── Font size application ─────────────────────────────────────────────────────

export function applyFontSize(size: FontSize = Settings.getFontSize()): void {
  document.documentElement.classList.remove('font-xs', 'font-sm', 'font-lg', 'font-xl');
  if (size === 'xs')    document.documentElement.classList.add('font-xs');
  if (size === 'small') document.documentElement.classList.add('font-sm');
  if (size === 'large') document.documentElement.classList.add('font-lg');
  if (size === 'xl')    document.documentElement.classList.add('font-xl');
}

const FONT_TO_RS: Record<FontSize, number> = {
  xs: 1.0, small: 1.15, medium: 1.32, large: 1.48, xl: 1.65,
};
export function getFontScaleForRecall(): number {
  return FONT_TO_RS[Settings.getFontSize()] ?? 1.32;
}

// ── Bind settings UI ─────────────────────────────────────────────────────────

/** The three filters' chain buttons — shared between bindSettings() and
 *  restoreSettingsUI(), which each need to show/hide all three together. */
const CHAIN_BTN_IDS = ['listFilterChain', 'classFilterChain', 'domainFilterChain'];

function activateToggle(groupId: string, btn: HTMLButtonElement): void {
  document.querySelectorAll(`#${groupId} .sort-order-btn`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

/**
 * Set (or clear) autocomplete="off" on a quiz input per the Autofill setting.
 * Every mode's answer box is built through here rather than hardcoding the
 * attribute itself, so flipping the setting changes all of them the same way.
 */
export function applyAutofillAttr(el: HTMLInputElement): void {
  el.autocomplete = Settings.getAutofillEnabled() ? 'on' : 'off';
}

/**
 * Notified when the words-per-page setting changes so table mode can
 * re-paginate a quiz that's already on screen.
 */
let onPageSizeChange: (() => void) | null = null;

export function setOnPageSizeChange(fn: () => void): void {
  onPageSizeChange = fn;
}

/**
 * Notified when the "Show timer" toggle changes, so a quiz already on screen
 * shows/hides the clock immediately rather than only on next visit.
 *
 * A list, not a single slot — Table and Conjugation each have their own
 * timer group and each register their own sync function; a single slot would
 * mean whichever mode registered last silently stole the callback from the
 * other, which used to be exactly this bug the first time Conjugation ever
 * called this.
 */
const onShowTimerChangeListeners: (() => void)[] = [];

export function setOnShowTimerChange(fn: () => void): void {
  onShowTimerChangeListeners.push(fn);
}

/** Notified when Kid-Friendly Mode changes, so app.ts can lock/unlock My
 *  Content immediately rather than only on next visit. A list for the same
 *  reason as onShowTimerChangeListeners above. */
const onKidFriendlyModeChangeListeners: (() => void)[] = [];

export function setOnKidFriendlyModeChange(fn: () => void): void {
  onKidFriendlyModeChangeListeners.push(fn);
}

/**
 * Notified when the deselected-pronoun mode changes, so conjugation mode can
 * fill in or clear the answers that 'answer' mode shows. The class alone
 * cannot do that — it is content, not styling.
 */
let onConjDeselectedChange: (() => void) | null = null;

export function setOnConjDeselectedChange(fn: (() => void) | null): void {
  onConjDeselectedChange = fn;
}

/**
 * Notified when a "hide this filter app-wide" toggle changes, so whichever
 * mode is currently on screen re-syncs its filter boxes' visibility right
 * away instead of waiting for the next mode switch. app.ts wires this to
 * bindModeSwitch's own updateModeUI — the same function a tab click already
 * calls, just triggered from here too.
 */
let onFilterVisibilityChange: (() => void) | null = null;

export function setOnFilterVisibilityChange(fn: () => void): void {
  onFilterVisibilityChange = fn;
}

/** Notified when the app's own interface language changes — app.ts wires
 *  this to i18n.ts's applyTranslations() so the switch takes effect without
 *  a reload. Same hook-registration pattern as onFilterVisibilityChange,
 *  for the same reason: settings.ts can't import app.ts/i18n.ts directly
 *  without a circular import. */
let onUILanguageChange: (() => void) | null = null;

export function setOnUILanguageChange(fn: () => void): void {
  onUILanguageChange = fn;
}

export function bindSettings(): void {
  // Theme
  document.getElementById('settingTheme')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingTheme', btn);
    const value = (btn.dataset.theme ?? 'system') as ThemeValue;
    if (value === 'system') {
      removeKey('theme');
    } else {
      writeString('theme', value);
    }
    applyTheme(value);
  });

  // Font size
  document.getElementById('settingFontSize')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingFontSize', btn);
    const size = (btn.dataset.size ?? 'medium') as FontSize;
    set('font_size', size);
    applyFontSize(size);
  });

  // App interface language
  document.getElementById('settingUILanguage')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn || btn.disabled) return;
    activateToggle('settingUILanguage', btn);
    set('ui_language', (btn.dataset.uiLang ?? 'english') as UILanguage);
    onUILanguageChange?.();
  });

  // Column count
  document.getElementById('settingCols')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingCols', btn);
    set('table_cols', btn.dataset.cols ?? '2');
  });

  // Words per page (table mode)
  document.getElementById('settingPageSize')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingPageSize', btn);
    set('table_page_size', btn.dataset.pagesize ?? '100');
    onPageSizeChange?.();
  });

  // Verbs per page (conjugation mode) — just a starting default, so no live
  // re-paginate hook the way Table's above has; a quiz already on screen
  // reads its own vq_conj_page_size, not this.
  document.getElementById('settingConjPageSize')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingConjPageSize', btn);
    set('conj_page_size', btn.dataset.pagesize ?? '10');
  });

  // Show timer
  document.getElementById('settingShowTimer')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingShowTimer', btn);
    set('table_show_timer', btn.dataset.show ?? 'true');
    onShowTimerChangeListeners.forEach(fn => fn());
  });

  // Show timer — Conjugation's own, independent of Table's above. Both
  // modes' sync functions are on the same listener list and just re-read
  // their own setting when notified, so either toggle changing notifies both
  // harmlessly.
  document.getElementById('settingConjShowTimer')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingConjShowTimer', btn);
    set('conj_show_timer', btn.dataset.show ?? 'true');
    onShowTimerChangeListeners.forEach(fn => fn());
  });

  // Timed quiz — on/off, plus the minutes input it reveals
  document.getElementById('settingTimedQuiz')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingTimedQuiz', btn);
    const enabled = btn.dataset.timed === 'true';
    set('table_timed_quiz', String(enabled));
    const minutesInput = document.getElementById('settingTimedQuizMinutes') as HTMLInputElement | null;
    if (minutesInput) minutesInput.hidden = !enabled;
  });
  document.getElementById('settingTimedQuizMinutes')?.addEventListener('change', e => {
    const n = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(n) && n > 0) set('table_timed_quiz_minutes', String(n));
  });

  // Table mode: Hint button and Reveal Word button, independently switchable
  document.getElementById('settingHintButton')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingHintButton', btn);
    set('table_hint_button', btn.dataset.enabled ?? 'true');
  });
  document.getElementById('settingRevealButton')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingRevealButton', btn);
    set('table_reveal_button', btn.dataset.enabled ?? 'true');
  });

  // Conjugation mode's own hint mode (see getConjHintMode)
  document.getElementById('settingConjHint')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingConjHint', btn);
    set('conj_hint_mode', btn.dataset.hint ?? 'full');
  });

  // Question / answer gloss count
  document.getElementById('settingQuestionGlosses')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingQuestionGlosses', btn);
    set('question_gloss_count', btn.dataset.count ?? '1');
  });
  document.getElementById('settingAnswerGlosses')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingAnswerGlosses', btn);
    set('answer_gloss_count', btn.dataset.count ?? '2');
  });

  // Show the sense you typed, even past the Answer glosses cutoff
  document.getElementById('settingExpandGloss')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingExpandGloss', btn);
    set('expand_gloss_on_match', btn.dataset.expand ?? 'true');
  });

  // Table: frequency rank badge
  document.getElementById('settingTableShowRank')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingTableShowRank', btn);
    set('table_show_rank', btn.dataset.show ?? 'true');
  });

  // Table: list star / missed-before count badge
  document.getElementById('settingTableShowMarkers')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingTableShowMarkers', btn);
    set('table_show_word_markers', btn.dataset.show ?? 'true');
  });

  // Sense disambiguator — the "(permanent)"-style clarifier after a word
  document.getElementById('settingShowDisambiguator')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingShowDisambiguator', btn);
    set('show_disambiguator', btn.dataset.show ?? 'true');
  });

  // Match mode
  document.getElementById('settingMatch')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingMatch', btn);
    set('match_mode', btn.dataset.match ?? 'fuzzy');
  });

  // Typo tolerance
  document.getElementById('settingTypo')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingTypo', btn);
    set('typo_tolerance', btn.dataset.typo ?? 'normal');
  });

  // Chinese word slot's primary script (characters / pinyin)
  document.getElementById('settingChineseScript')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingChineseScript', btn);
    set('chinese_script', btn.dataset.chineseScript ?? 'characters');
  });

  // Show both scripts next to a displayed Chinese word, and accept either as an answer
  document.getElementById('settingShowPinyin')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingShowPinyin', btn);
    set('show_pinyin', btn.dataset.showPinyin ?? 'true');
  });

  // Show pinyin next to the English gloss
  document.getElementById('settingShowPinyinGloss')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingShowPinyinGloss', btn);
    set('show_pinyin_gloss', btn.dataset.showPinyinGloss ?? 'true');
  });

  // Browser autofill. Every mode's inputs are rebuilt fresh on Start Quiz, so
  // there's no persistent input to apply this to live; the setting just
  // takes effect the next time any mode's inputs are built.
  document.getElementById('settingAutofill')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingAutofill', btn);
    set('autofill_enabled', btn.dataset.autofill ?? 'false');
  });

  // Swear word filter
  document.getElementById('settingSwearFilter')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingSwearFilter', btn);
    set('swear_filter_enabled', btn.dataset.swear ?? 'false');
  });

  // Picture Quiz — which visual categories are allowed. "Stock Photos" has
  // no data source wired up yet (see picture-mode.ts), so its toggle is
  // disabled in the markup rather than bound here.
  ([
    ['settingPictureSourcePhotos', 'picture_source_photos', 'photos'],
    ['settingPictureSourceSvgs',   'picture_source_svgs',   'svgs'],
    ['settingPictureSourceEmoji',  'picture_source_emoji',  'emoji'],
  ] as const).forEach(([elId, key, dataAttr]) => {
    document.getElementById(elId)?.addEventListener('click', e => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
      if (!btn) return;
      activateToggle(elId, btn);
      set(key, btn.dataset[dataAttr] ?? 'true');
    });
  });

  // Hide a filter box in specific quiz modes — Part of Speech, Lists,
  // Domains. Reuses .sort-order-btn's look, but each mode is its own
  // independently-toggled chip rather than activateToggle's usual
  // exclusive group, so a click just flips that one chip's `.active`
  // class and rewrites the stored mode set from whichever chips end up on.
  ([
    ['settingHidePOSModes',     'hide_pos_filter'],
    ['settingHideListsModes',   'hide_lists_filter'],
    ['settingHideDomainsModes', 'hide_domains_filter'],
  ] as const).forEach(([elId, legacyKey]) => {
    document.getElementById(elId)?.addEventListener('click', e => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
      if (!btn) return;
      btn.classList.toggle('active');
      const modes = new Set(
        Array.from(document.querySelectorAll<HTMLElement>(`#${elId} .sort-order-btn.active`))
          .map(b => b.dataset.hideMode!),
      );
      setHiddenFilterModes(legacyKey, modes);
      onFilterVisibilityChange?.();
    });
  });

  // Filter linking. Each filter's own syncFilterHeader() already hides its
  // chain button once Settings.getFilterLinkingEnabled() is false, but that
  // only runs on that filter's own redraws — set it directly here too so
  // flipping the toggle hides all three immediately, on whichever mode
  // happens to be on screen, without waiting for something else to trigger
  // a redraw.
  document.getElementById('settingFilterLinking')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingFilterLinking', btn);
    const enabled = btn.dataset.linking !== 'false';
    set('filter_linking_enabled', String(enabled));
    CHAIN_BTN_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.hidden = !enabled;
    });
  });

  // Kid-Friendly Mode — a one-time nudge for Advanced mode/the swear filter
  // and every quiz-mode control below (the learner can still change any of
  // them back while it's on — this only sets them, it doesn't lock them),
  // plus an ongoing lock on My Content (app.ts, via
  // setOnKidFriendlyModeChange). The controls this simplifies are hidden by
  // settings.css's `body.kid-friendly-mode [data-kid-hide]` rule; forcing
  // their *value* here (real clicks on the real buttons, so each control's
  // own existing handler does the actual work — same technique
  // presets.ts's applyWords()/applyConjugation() already use) is what keeps
  // a hidden toggle from silently leaving whatever was picked before kid
  // mode went on.
  document.getElementById('settingKidMode')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingKidMode', btn);
    const on = btn.dataset.kidMode === 'true';
    set('kid_friendly_mode', String(on));
    document.body.classList.toggle('kid-friendly-mode', on);

    if (on) {
      set('advanced_mode', 'false');
      document.body.classList.toggle('advanced-mode', false);
      document.querySelectorAll<HTMLElement>('#settingAdvancedMode .sort-order-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.advancedMode === 'false');
      });

      set('swear_filter_enabled', 'true');
      document.querySelectorAll<HTMLElement>('#settingSwearFilter .sort-order-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.swear === 'true');
      });

      document.querySelector<HTMLButtonElement>('#directionToggle .conj-toggle-btn[data-direction="target-en"]')?.click();
      document.querySelector<HTMLButtonElement>('#tableStyleToggle .conj-toggle-btn[data-style="standard"]')?.click();
      document.querySelector<HTMLButtonElement>('#pictureSubMode .conj-toggle-btn[data-mode="click"]')?.click();
      document.querySelector<HTMLButtonElement>('#triviaDifficulty .conj-toggle-btn[data-difficulty="easy"]')?.click();
      document.querySelector<HTMLButtonElement>('#triviaReadingDifficulty .conj-toggle-btn[data-reading-difficulty="easy"]')?.click();
      document.querySelector<HTMLButtonElement>('#triviaReadingLength .conj-toggle-btn[data-reading-length="short"]')?.click();
      document.querySelector<HTMLButtonElement>('#guessBlankDifficulty .conj-toggle-btn[data-difficulty="easy"]')?.click();
      document.querySelector<HTMLButtonElement>('#conjViewToggle .conj-toggle-btn[data-view="grid"]')?.click();
      document.getElementById('conjRegAll')?.click();
      // Skip Known relies on the Lists filter, which Kid-Friendly Mode
      // disarms outright (see word-filters.ts's own getKidFriendlyMode()
      // check) — leaving Skip Known selectable would offer a control that
      // silently does nothing.
      document.querySelector<HTMLButtonElement>('#sizeModeToggle .sort-order-btn[data-mode="window"]')?.click();
    }

    onKidFriendlyModeChangeListeners.forEach(fn => fn());
  });

  // Advanced mode — shows/hides every [data-advanced] row and section
  document.getElementById('settingAdvancedMode')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingAdvancedMode', btn);
    const on = btn.dataset.advancedMode === 'true';
    set('advanced_mode', String(on));
    document.body.classList.toggle('advanced-mode', on);
  });

  // Session history
  document.getElementById('settingHistory')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingHistory', btn);
    set('history_enabled', btn.dataset.history ?? 'true');
  });

  // Clear history — every language's saved sessions and miss tallies.
  // Mastery and lists live in their own storage (word-lists.ts) and are
  // untouched.
  document.getElementById('settingClearHistory')?.addEventListener('click', () => {
    if (!window.confirm('Clear all saved quiz history and "words I keep missing" tallies, in every language? This cannot be undone.')) return;
    LANGUAGES.forEach(l => clearHistory(l.name));
  });

  // Conjugation: what a deselected pronoun leaves behind
  document.getElementById('settingConjShape')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingConjShape', btn);
    const mode = (btn.dataset.shape ?? 'grey') as ConjDeselected;
    set('conj_deselected', mode);
    // Applies to a quiz already on screen — it is only a display choice, so
    // there is no reason to make the learner restart to see it.
    applyConjDeselectedClass(document.querySelector('.conj-cards-grid'), mode);
    onConjDeselectedChange?.();
  });

  // Multi-language table indicator (Off / Color / Flag)
  document.getElementById('settingLangIndicator')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingLangIndicator', btn);
    set('lang_indicator', (btn.dataset.indicator ?? 'color') as LangIndicator);
  });

  // Guess the Blank: guesses per question
  document.getElementById('settingGuessBlankAttempts')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingGuessBlankAttempts', btn);
    set('guess_blank_max_attempts', btn.dataset.attempts ?? '1');
  });

  buildGoalScopeOptions();
  bindGoalControls();
  bindStreakCalendarNav();

  buildLangAppearanceRows();
  applyLangColors();

  buildConjColorRows();
  applyTenseColors();
  document.getElementById('settingResetTenseColors')?.addEventListener('click', () => {
    for (const [key] of TENSE_COLOR_DEFS) removeKey(P + 'tense_hue_' + key);
    applyTenseColors();
    buildConjColorRows();
  });
  document.getElementById('settingResetPersonColors')?.addEventListener('click', () => {
    for (const [i] of PERSON_COLOR_DEFS) removeKey(P + 'person_hue_' + i);
    applyTenseColors();
    buildConjColorRows();
  });

  restoreSettingsUI();
}

// ── Daily goal — type, target and per-language scope ───────────────────────
//
// Presets are per goal type since a word-count quick-pick (10/25/50/100)
// doesn't mean anything sensible for "minutes" or "streak days" — rebuilt
// into #settingDailyGoal whenever the type changes rather than three
// separate hard-coded button rows in the markup.
const GOAL_PRESETS: Record<GoalType, number[]> = {
  words:   [10, 25, 50, 100],
  minutes: [5, 10, 20, 30],
  streak:  [7, 14, 30, 100],
};
const ALL_GOAL_TYPES: GoalType[] = ['words', 'minutes', 'streak'];

/** '' means the global default; anything else is a language name. */
function currentGoalScope(): string {
  return (document.getElementById('settingGoalScope') as HTMLSelectElement | null)?.value ?? '';
}

function buildGoalScopeOptions(): void {
  const sel = document.getElementById('settingGoalScope') as HTMLSelectElement | null;
  if (!sel) return;
  LANGUAGES.forEach(({ name, label }) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = label;
    sel.appendChild(opt);
  });
}

/** Rebuild one goal type's preset row and mark whichever value is active. */
function renderGoalPresets(type: GoalType, target: number): void {
  const row = document.querySelector<HTMLElement>(`[data-goal-presets="${type}"]`);
  if (!row) return;
  row.innerHTML = '';
  const off = document.createElement('button');
  off.type = 'button';
  off.className = 'sort-order-btn' + (target === 0 ? ' active' : '');
  off.dataset.goal = '0';
  off.textContent = 'Off';
  row.appendChild(off);
  GOAL_PRESETS[type].forEach(n => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sort-order-btn' + (target === n ? ' active' : '');
    btn.dataset.goal = String(n);
    btn.textContent = String(n);
    row.appendChild(btn);
  });
}

/** Repaint every goal control — all three types, plus the scope reset button
 *  — from storage for whatever scope is currently selected. Called on init
 *  and whenever the scope dropdown changes. */
function renderGoalSection(): void {
  const scope = currentGoalScope();
  const goals = scope ? getGoals(scope) : getGoals();

  ALL_GOAL_TYPES.forEach(type => {
    const target = goals[type];
    renderGoalPresets(type, target);
    const custom = document.querySelector<HTMLInputElement>(`[data-goal-custom="${type}"]`);
    if (custom) {
      const isPreset = target === 0 || GOAL_PRESETS[type].includes(target);
      custom.value = isPreset ? '' : String(target);
    }
  });

  // Only meaningful once a language scope is picked and it actually has its
  // own goals — editing the global scope, or a language that's still just
  // following the global defaults, has nothing to reset.
  const resetBtn = document.getElementById('settingGoalScopeReset');
  if (resetBtn) resetBtn.hidden = !scope || !hasLanguageGoal(scope);
}

function bindGoalControls(): void {
  document.getElementById('settingGoalScope')?.addEventListener('change', renderGoalSection);

  document.getElementById('settingGoalScopeReset')?.addEventListener('click', () => {
    const scope = currentGoalScope();
    if (scope) clearLanguageGoal(scope);
    renderGoalSection();
  });

  // One preset row + one custom input per type, each independent — setting
  // Words doesn't touch Minutes or Streak, so a learner can run more than
  // one goal at once instead of picking a single active type.
  ALL_GOAL_TYPES.forEach(type => {
    document.querySelector(`[data-goal-presets="${type}"]`)?.addEventListener('click', e => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
      if (!btn) return;
      const scope = currentGoalScope();
      setGoalTarget(type, Number(btn.dataset.goal ?? '0'), scope || undefined);
      renderGoalSection();
    });

    document.querySelector(`[data-goal-custom="${type}"]`)?.addEventListener('change', e => {
      const n = Number((e.target as HTMLInputElement).value);
      const scope = currentGoalScope();
      if (Number.isFinite(n) && n >= 0) setGoalTarget(type, n, scope || undefined);
      renderGoalSection();
    });
  });
}

/**
 * One row per language — flag select, color swatch — built from LANGUAGES
 * rather than hand-written per language, so a language added there doesn't
 * need a matching row added here by hand.
 */
function buildLangAppearanceRows(): void {
  const list = document.getElementById('settingLangColors');
  if (!list) return;
  list.innerHTML = '';

  for (const lang of LANGUAGES) {
    const row     = document.createElement('div');
    row.className = 'lang-appearance-row';

    const name       = document.createElement('span');
    name.className   = 'lang-appearance-name';
    name.textContent = lang.label;

    const flagPreview = createFlagImg(Settings.getLangFlag(lang.name), lang.label);

    const flagSelect      = document.createElement('select');
    flagSelect.className  = 'lang-appearance-flag';
    flagSelect.dataset.lang = lang.name;
    flagSelect.title      = `Flag shown for ${lang.label} in Flag mode`;
    const currentFlag = Settings.getLangFlag(lang.name);
    for (const opt of lang.flagOptions) {
      const o       = document.createElement('option');
      o.value       = opt.country;
      o.textContent = opt.label;
      o.selected    = opt.country === currentFlag;
      flagSelect.appendChild(o);
    }
    flagSelect.addEventListener('change', () => {
      set('lang_flag_' + lang.name, flagSelect.value);
      flagPreview.src = flagUrl(flagSelect.value);
    });

    const colorLabel      = document.createElement('label');
    colorLabel.className  = 'lang-appearance-color';
    colorLabel.title      = `Cell color for ${lang.label} in Color mode`;
    const colorInput      = document.createElement('input');
    colorInput.type       = 'color';
    colorInput.dataset.lang = lang.name;
    colorInput.value = Settings.getLangColor(lang.name)
      ?? rgbToHex(getComputedStyle(document.documentElement).getPropertyValue(lang.colorVar));
    colorInput.addEventListener('input', () => {
      set('lang_color_' + lang.name, colorInput.value);
      applyLangColors();
    });
    colorLabel.appendChild(colorInput);

    row.append(name, flagPreview, flagSelect, colorLabel);
    list.appendChild(row);
  }
}

/**
 * `<input type="color">` requires a #rrggbb value; the CSS default is
 * already hex, but read via getComputedStyle it can come back as
 * `rgb(r, g, b)` depending on the browser. Falls back to a neutral grey
 * if parsing fails for any reason rather than leaving the input blank.
 */
function rgbToHex(color: string): string {
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) return trimmed;
  const m = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#cccccc';
  const [, r, g, b] = m;
  return '#' + [r, g, b].map(n => Number(n).toString(16).padStart(2, '0')).join('');
}

/**
 * Tense/person colors store only a hue (0-360) — conjugation.css derives
 * saturation and lightness itself, varying them by state (hover/active) and
 * theme, so storing a full color would fight those variations. `<input
 * type="color">` only speaks full hex, so a swatch is rendered at a fixed,
 * representative saturation/lightness (45%/45%, matching the un-selected
 * chip's own hsl() call in conjugation.css) and any hex the user picks is
 * converted back down to just its hue on input.
 */
function hueToHex(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = 0.45, l = 0.45;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60  ? [c, x, 0] :
    h < 120 ? [x, c, 0] :
    h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] :
    h < 300 ? [x, 0, c] :
              [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function hexToHue(hex: string): number {
  const m = hex.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r)      h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else                h = (r - g) / d + 4;
  h *= 60;
  return Math.round(h < 0 ? h + 360 : h);
}

/**
 * One row per tense (or per pronoun slot) — a label and a color swatch —
 * built from TENSE_COLOR_DEFS/PERSON_COLOR_DEFS rather than hand-written,
 * same reasoning as buildLangAppearanceRows above.
 */
function buildConjColorRows(): void {
  const tenseList = document.getElementById('settingTenseColors');
  if (tenseList) {
    tenseList.innerHTML = '';
    for (const [key, label, defaultHue] of TENSE_COLOR_DEFS) {
      tenseList.appendChild(buildColorSwatchRow(
        label, Settings.getTenseHue(key) ?? defaultHue,
        hue => { set('tense_hue_' + key, String(hue)); applyTenseColors(); },
      ));
    }
  }
  const personList = document.getElementById('settingPersonColors');
  if (personList) {
    personList.innerHTML = '';
    for (const [i, label, defaultHue] of PERSON_COLOR_DEFS) {
      personList.appendChild(buildColorSwatchRow(
        label, Settings.getPersonHue(i) ?? defaultHue,
        hue => { set('person_hue_' + i, String(hue)); applyTenseColors(); },
      ));
    }
  }
}

function buildColorSwatchRow(label: string, currentHue: number, onPick: (hue: number) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'conj-color-row';
  const name = document.createElement('span');
  name.className   = 'conj-color-name';
  name.textContent = label;
  const input = document.createElement('input');
  input.type  = 'color';
  input.value = hueToHex(currentHue);
  input.addEventListener('input', () => onPick(hexToHue(input.value)));
  row.append(name, input);
  return row;
}

function restoreSettingsUI(): void {
  // Theme
  const savedTheme = readString('theme') ?? 'system';
  document.querySelectorAll<HTMLElement>('#settingTheme .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === savedTheme);
  });

  // Font size
  const savedFont = get('font_size', 'medium');
  document.querySelectorAll<HTMLElement>('#settingFontSize .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.size === savedFont);
  });

  // App interface language
  const savedUILang = get('ui_language', 'english');
  document.querySelectorAll<HTMLElement>('#settingUILanguage .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.uiLang === savedUILang);
  });

  // Cols
  const savedCols = get('table_cols', '2');
  document.querySelectorAll<HTMLElement>('#settingCols .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cols === savedCols);
  });

  // Words per page
  const savedPageSize = get('table_page_size', '100');
  document.querySelectorAll<HTMLElement>('#settingPageSize .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.pagesize === savedPageSize);
  });

  // Verbs per page (conjugation mode)
  const savedConjPageSize = get('conj_page_size', '10');
  document.querySelectorAll<HTMLElement>('#settingConjPageSize .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.pagesize === savedConjPageSize);
  });

  // Show timer
  const savedShowTimer = get('table_show_timer', 'true');
  document.querySelectorAll<HTMLElement>('#settingShowTimer .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.show === savedShowTimer);
  });

  // Show timer — Conjugation
  const savedConjShowTimer = get('conj_show_timer', 'true');
  document.querySelectorAll<HTMLElement>('#settingConjShowTimer .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.show === savedConjShowTimer);
  });

  // Timed quiz
  const savedTimed = get('table_timed_quiz', 'false');
  document.querySelectorAll<HTMLElement>('#settingTimedQuiz .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.timed === savedTimed);
  });
  const timedMinutesInput = document.getElementById('settingTimedQuizMinutes') as HTMLInputElement | null;
  if (timedMinutesInput) {
    timedMinutesInput.hidden = savedTimed !== 'true';
    timedMinutesInput.value  = get('table_timed_quiz_minutes', '10');
  }

  // Table mode: Hint button / Reveal Word button
  const savedHintBtn = String(Settings.getShowHintButton());
  document.querySelectorAll<HTMLElement>('#settingHintButton .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.enabled === savedHintBtn);
  });
  const savedRevealBtn = String(Settings.getShowRevealButton());
  document.querySelectorAll<HTMLElement>('#settingRevealButton .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.enabled === savedRevealBtn);
  });

  // Conjugation mode's own hint mode
  const savedConjHint = Settings.getConjHintMode();
  document.querySelectorAll<HTMLElement>('#settingConjHint .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.hint === savedConjHint);
  });

  // Question / answer gloss count
  const savedQuestionGlosses = get('question_gloss_count', '1');
  document.querySelectorAll<HTMLElement>('#settingQuestionGlosses .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.count === savedQuestionGlosses);
  });
  const savedAnswerGlosses = get('answer_gloss_count', '2');
  document.querySelectorAll<HTMLElement>('#settingAnswerGlosses .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.count === savedAnswerGlosses);
  });
  const savedExpandGloss = get('expand_gloss_on_match', 'true');
  document.querySelectorAll<HTMLElement>('#settingExpandGloss .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.expand === savedExpandGloss);
  });
  const savedShowRank = get('table_show_rank', 'true');
  document.querySelectorAll<HTMLElement>('#settingTableShowRank .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.show === savedShowRank);
  });
  const savedShowMarkers = get('table_show_word_markers', 'true');
  document.querySelectorAll<HTMLElement>('#settingTableShowMarkers .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.show === savedShowMarkers);
  });
  const savedShowDisambiguator = get('show_disambiguator', 'true');
  document.querySelectorAll<HTMLElement>('#settingShowDisambiguator .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.show === savedShowDisambiguator);
  });

  // Match
  const savedMatch = get('match_mode', 'fuzzy');
  document.querySelectorAll<HTMLElement>('#settingMatch .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.match === savedMatch);
  });

  // Typo tolerance
  const savedTypo = get('typo_tolerance', 'normal');
  document.querySelectorAll<HTMLElement>('#settingTypo .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.typo === savedTypo);
  });

  // Chinese word slot's primary script
  const savedChineseScript = get('chinese_script', 'characters');
  document.querySelectorAll<HTMLElement>('#settingChineseScript .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.chineseScript === savedChineseScript);
  });

  // Show both scripts (word)
  const savedShowPinyin = get('show_pinyin', 'true');
  document.querySelectorAll<HTMLElement>('#settingShowPinyin .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.showPinyin === savedShowPinyin);
  });

  // Show pinyin (gloss)
  const savedShowPinyinGloss = get('show_pinyin_gloss', 'true');
  document.querySelectorAll<HTMLElement>('#settingShowPinyinGloss .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.showPinyinGloss === savedShowPinyinGloss);
  });

  // Browser autofill
  const savedAutofill = get('autofill_enabled', 'false');
  document.querySelectorAll<HTMLElement>('#settingAutofill .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.autofill === savedAutofill);
  });

  // Swear word filter
  const savedSwear = get('swear_filter_enabled', 'false');
  document.querySelectorAll<HTMLElement>('#settingSwearFilter .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.swear === savedSwear);
  });

  // Picture Quiz source categories
  ([
    ['settingPictureSourcePhotos', 'picture_source_photos', 'photos'],
    ['settingPictureSourceSvgs',   'picture_source_svgs',   'svgs'],
    ['settingPictureSourceEmoji',  'picture_source_emoji',  'emoji'],
  ] as const).forEach(([elId, key, dataAttr]) => {
    const saved = get(key, 'true');
    document.querySelectorAll<HTMLElement>(`#${elId} .sort-order-btn`).forEach(b => {
      b.classList.toggle('active', b.dataset[dataAttr] === saved);
    });
  });

  // Hide-filter-per-mode chips
  ([
    ['settingHidePOSModes',     'hide_pos_filter',     POS_HIDEABLE_MODES],
    ['settingHideListsModes',   'hide_lists_filter',   LISTS_DOMAINS_HIDEABLE_MODES],
    ['settingHideDomainsModes', 'hide_domains_filter', LISTS_DOMAINS_HIDEABLE_MODES],
  ] as const).forEach(([elId, legacyKey, applicable]) => {
    const hidden = getHiddenFilterModes(legacyKey, applicable);
    document.querySelectorAll<HTMLElement>(`#${elId} .sort-order-btn`).forEach(b => {
      b.classList.toggle('active', hidden.has(b.dataset.hideMode!));
    });
  });

  // Filter linking
  const savedLinking = get('filter_linking_enabled', 'true');
  document.querySelectorAll<HTMLElement>('#settingFilterLinking .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.linking === savedLinking);
  });
  CHAIN_BTN_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = savedLinking === 'false';
  });

  // Advanced mode
  const savedAdvanced = get('advanced_mode', 'false');
  document.querySelectorAll<HTMLElement>('#settingAdvancedMode .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.advancedMode === savedAdvanced);
  });
  document.body.classList.toggle('advanced-mode', savedAdvanced === 'true');

  // Kid-Friendly Mode
  const savedKidMode = get('kid_friendly_mode', 'false');
  document.querySelectorAll<HTMLElement>('#settingKidMode .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.kidMode === savedKidMode);
  });
  document.body.classList.toggle('kid-friendly-mode', savedKidMode === 'true');

  // Session history
  const savedHistory = get('history_enabled', 'true');
  document.querySelectorAll<HTMLElement>('#settingHistory .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.history === savedHistory);
  });

  // Guess the Blank: guesses per question
  const savedGbAttempts = get('guess_blank_max_attempts', '1');
  document.querySelectorAll<HTMLElement>('#settingGuessBlankAttempts .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.attempts === savedGbAttempts);
  });

  // Conjugation chart shape
  const savedShape = Settings.getConjDeselected();
  document.querySelectorAll<HTMLElement>('#settingConjShape .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.shape === savedShape);
  });

  // Multi-language table indicator
  const savedIndicator = Settings.getLangIndicator();
  document.querySelectorAll<HTMLElement>('#settingLangIndicator .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.indicator === savedIndicator);
  });

  renderGoalSection();
  refreshStreakReadouts();
}

/**
 * Fill in the streak/progress numbers — live values, not a setting, so this
 * runs on every Settings tab visit (see app.ts's onActivate.settings) rather
 * than only once at load like the toggle-restore logic above.
 */
export function refreshStreakReadouts(): void {
  const streakEl  = document.getElementById('streakCurrentReadout');
  const bestEl    = document.getElementById('streakBestReadout');
  const todayEl   = document.getElementById('streakTodayReadout');
  const words     = getTodayProgress();
  const minutes   = getTodayMinutes();
  if (streakEl) streakEl.textContent = `${getStreak()} day${getStreak() === 1 ? '' : 's'}`;
  if (bestEl)   bestEl.textContent   = `${getBestStreak()} day${getBestStreak() === 1 ? '' : 's'}`;
  if (todayEl) {
    todayEl.textContent = minutes > 0
      ? `${words} word${words === 1 ? '' : 's'} · ${minutes} min`
      : `${words} word${words === 1 ? '' : 's'}`;
  }
  renderStreakCalendar();
}

// ── Streak calendar ─────────────────────────────────────────────────────────

/** Months back from the current one — 0 is this month. Resets to 0 whenever
 *  the Settings tab is (re)entered, rather than persisting a scroll position
 *  a returning visitor would find confusing. */
let calendarOffset = 0;

/** A dot's colour for one scope — a language's own appearance colour, or a
 *  neutral one for the global scope, which isn't a language at all. */
function scopeColorVar(scope: string): string {
  if (!scope) return 'var(--streak-flame, var(--warning))';
  const lang = LANGUAGES.find(l => l.name === scope);
  return lang ? `var(${lang.colorVar})` : 'var(--text-muted)';
}

function scopeLabel(scope: string): string {
  if (!scope) return 'Global';
  const lang = LANGUAGES.find(l => l.name === scope);
  return lang ? lang.label : scope;
}

const GOAL_TYPE_LABELS: Record<GoalType, string> = { words: 'words', minutes: 'minutes', streak: 'streak' };

/** "Spanish: words, minutes · Global: streak" — the exact breakdown for one
 *  day's cell, read from getGoalHitsForDate(). Grouped by scope so a day
 *  with several goals hit in the same language reads as one clause, not one
 *  per type. */
function describeDayHits(dateStr: string): string {
  const byScope = new Map<string, GoalType[]>();
  for (const key of getGoalHitsForDate(dateStr)) {
    const { scope, type } = parseHitKey(key);
    const list = byScope.get(scope) ?? [];
    list.push(type);
    byScope.set(scope, list);
  }
  return [...byScope.entries()]
    .map(([scope, types]) => `${scopeLabel(scope)}: ${types.map(t => GOAL_TYPE_LABELS[t]).join(', ')}`)
    .join(' · ');
}

function renderStreakCalendar(): void {
  const label = document.getElementById('streakCalLabel');
  const grid  = document.getElementById('streakCalGrid');
  const next  = document.getElementById('streakCalNext') as HTMLButtonElement | null;
  const legend = document.getElementById('streakCalLegend');
  if (!label || !grid) return;

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() - calendarOffset);
  const year  = base.getFullYear();
  const month = base.getMonth();

  label.textContent = base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (next) next.disabled = calendarOffset === 0;

  const active = new Set(getStreakHistory());
  const todayStr = new Date().toDateString();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();

  grid.innerHTML = '';
  for (let i = 0; i < firstWeekday; i++) {
    grid.appendChild(document.createElement('span'));
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(year, month, day);
    const dateStr  = cellDate.toDateString();
    const cell = document.createElement('span');
    cell.className = 'settings-calendar-day';

    const num = document.createElement('span');
    num.className = 'settings-calendar-day-num';
    num.textContent = String(day);
    cell.appendChild(num);

    if (active.has(dateStr)) {
      cell.classList.add('settings-calendar-day--active');

      // One small dot per distinct scope (language, or global) that hit at
      // least one goal that day — the per-language breakdown the user asked
      // for, without trying to cram every type into the cell itself; the
      // exact types are in the tooltip instead.
      const scopes = [...new Set(getGoalHitsForDate(dateStr).map(k => parseHitKey(k).scope))];
      if (scopes.length > 0) {
        const dots = document.createElement('span');
        dots.className = 'settings-calendar-day-dots';
        scopes.forEach(scope => {
          const dot = document.createElement('span');
          dot.className = 'settings-calendar-dot';
          dot.style.background = scopeColorVar(scope);
          dots.appendChild(dot);
        });
        cell.appendChild(dots);
        cell.title = describeDayHits(dateStr);
      }
    }
    if (dateStr === todayStr) cell.classList.add('settings-calendar-day--today');
    grid.appendChild(cell);
  }

  if (legend && !legend.childElementCount) {
    const entries: [string, string][] = [['', 'Global'], ...LANGUAGES.map(l => [l.name, l.label] as [string, string])];
    entries.forEach(([scope, text]) => {
      const item = document.createElement('span');
      item.className = 'settings-calendar-legend-item';
      const dot = document.createElement('span');
      dot.className = 'settings-calendar-dot';
      dot.style.background = scopeColorVar(scope);
      item.append(dot, document.createTextNode(text));
      legend.appendChild(item);
    });
  }
}

function bindStreakCalendarNav(): void {
  document.getElementById('streakCalPrev')?.addEventListener('click', () => {
    calendarOffset++;
    renderStreakCalendar();
  });
  document.getElementById('streakCalNext')?.addEventListener('click', () => {
    if (calendarOffset === 0) return;
    calendarOffset--;
    renderStreakCalendar();
  });
}
