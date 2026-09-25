import { readString, writeString } from './utils/storage.ts';
import { LANGUAGES, languageInfo } from './data/languages.ts';
import { HISTORY_KEEP } from './utils/session-history.ts';
import type { ChineseScript, ChineseDisplay, FunctionWordMarker } from './utils/utils.ts';
import type { GenderIndicatorStyle, GenderIndicatorVisibility } from './utils/dom.ts';
import type { ProgressBarPercentMode } from './ui/score-pills.ts';
import type { StreakWidgetFormat } from './ui/streak-widget.ts';

/**
 * settings.ts — persistent quiz preferences (the data layer).
 *
 * Keys use the 's_' prefix to distinguish from session state ('vq_' prefix).
 * Getters always return a typed, defaulted value; setters write to localStorage.
 *
 * The Settings *screen* — binding its controls, restoring their state, the
 * colour pickers, glossary, search and streak calendar — used to live in this
 * same 2,700-line file. It is split into settings-ui.ts, settings-appearance.ts,
 * settings-search.ts and settings-streak.ts; everything the rest of the app
 * imports (Settings, the apply* functions, the change-listener setters) is here.
 */

export const P = 's_';
export const get = (k: string, fallback: string): string => readString(P + k) ?? fallback;
export const set = (k: string, v: string): void => { writeString(P + k, v); };

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
export const POS_HIDEABLE_MODES = ['table', 'picture'] as const;
// Lists doesn't apply to trivia (no vocabulary pool to hide/focus within),
// but Domains does — trivia questions carry their own `domains` field (see
// data/trivia-questions.ts) — so 'trivia' is here even though it isn't in
// POS_HIDEABLE_MODES, and getHideListsFilter('trivia') is simply never
// checked (ui-state.ts always force-hides the Lists box there regardless).
export const LISTS_DOMAINS_HIDEABLE_MODES = ['table', 'picture', 'conjugation', 'trivia'] as const;

export function getHiddenFilterModes(legacyKey: string, applicable: readonly string[]): Set<string> {
  const modesKey = legacyKey + '_modes';
  const raw = readString(P + modesKey);
  if (raw !== null) return new Set(raw.split(',').filter(Boolean));
  return get(legacyKey, 'false') === 'true' ? new Set(applicable) : new Set();
}

export function setHiddenFilterModes(legacyKey: string, modes: Set<string>): void {
  set(legacyKey + '_modes', Array.from(modes).join(','));
}

/** The app's own interface language — separate from the vocabulary language
 *  picked in `#langSelect`. Only 'english' (the hardcoded default, no lookup
 *  needed) and 'spanish' (translated) are wired up; the rest are Settings UI
 *  placeholders disabled until translated. */
export type UILanguage = 'english' | 'spanish';

export type TableRowDensity = 'comfortable' | 'compact' | 'ultra';

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
   * Whether a letter Hint, on a word with more than one accepted sense,
   * confirms that fact — Standard style (its hint pre-fills the actual
   * editable answer input) puts this in the Hint button's tooltip rather
   * than the input's value; Double Recall (a read-only hint display) shows
   * a literal trailing " /" instead. Off by default — even confirming
   * "there's more than one answer" is a form of hint some learners would
   * rather not have.
   */
  getShowHintMultiGlossHint: (): boolean => get('hint_multi_gloss', 'false') === 'true',

  /**
   * Whether Table mode's session history records each hint-outcome count —
   * independent per outcome, so a learner can track "hinted but got it
   * right" without also tracking "hinted and gave up," say. Purely a
   * recording toggle: the row still gets its distinct color (see table.css's
   * input.correct.hinted etc.) regardless of these — this only gates what
   * gets written to SessionRecord/History. All default on.
   */
  getTrackHintedCorrect:  (): boolean => get('track_hinted_correct', 'true') === 'true',
  getTrackHintedRevealed: (): boolean => get('track_hinted_revealed', 'true') === 'true',
  getTrackHintedMissed:   (): boolean => get('track_hinted_missed', 'true') === 'true',

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

  /**
   * Once a Table quiz is fully answered, its progress bar's own label
   * switches from a now-meaningless "100%" to something that's actually
   * still useful — see ui/score-pills.ts's buildProgressStatsHtml.
   * 'correct' (default) shows just the percent correct; 'missed' shows just
   * the percent missed; 'all' shows a fuller correct/revealed/missed
   * breakdown.
   */
  getProgressBarPercentMode: (): ProgressBarPercentMode => get('progress_bar_percent_mode', 'correct') as ProgressBarPercentMode,

  /** Adds Hinted → Solved / Hinted → Revealed / Hinted → Missed percentage
   *  chips (of the hint-outcome pills already shown below the bar — see
   *  buildHintOutcomePills) alongside whichever chips getProgressBarPercentMode
   *  picks. Off by default since most learners never look past the plain
   *  correct/missed split. */
  getProgressBarShowHintBreakdown: (): boolean => get('progress_bar_hint_breakdown', 'false') === 'true',

  /**
   * Row density — Comfortable (default) is the table's original sizing.
   * Compact shrinks it (see table.css's `body.table-compact-rows` block,
   * applied as a body class same as Kid-Friendly/Advanced mode) so more rows
   * fit on screen. Ultra Compact shrinks it further still (`body.table-
   * ultra-compact-rows`) — the frequency-rank badge, list-star/missed-count
   * markers, and gender indicator still show at whatever their own settings
   * already say; each density level just gives their corner badges
   * correspondingly less clearance to fit into (a smaller badge at a
   * smaller offset), rather than forcing them off outright.
   */
  getTableRowDensity: (): TableRowDensity => get('table_row_density', 'comfortable') as TableRowDensity,

  /** The list star and "missed before" count badge, across every Table quiz style. */
  getTableShowWordMarkers: (): boolean => get('table_show_word_markers', 'true') === 'true',

  /**
   * A sense disambiguator is a short curated note (e.g. "permanent") on a
   * word that shares its translation with another word, so the two can be
   * told apart — see the Glossary settings section for the full definition.
   * This getter controls it specifically on the WORD side: next to the
   * target-language spelling once it's the settled, already-answered value
   * on screen (a Meaning → Word answer once revealed, and Picture Quiz's own
   * word label/reveals, which always show the word itself). Off by default —
   * this is new: the word-side reveal used to hard-code the disambiguator
   * hidden regardless of any setting, so nothing changes for an existing
   * session unless this is turned on. See getShowMeaningSideDisambiguator
   * and getShowDisambiguatorOnHover for the other two surfaces.
   */
  getShowWordSideDisambiguator: (): boolean => get('show_disambiguator_word', 'false') === 'true',

  /**
   * Same disambiguator as getShowWordSideDisambiguator above, but on the
   * MEANING side: next to the English gloss, both on the Meaning → Word
   * prompt (necessary there — two words sharing a translation would
   * otherwise show the identical prompt with no way to tell which one to
   * type) and on a Word → Meaning answer once revealed. On by default, since
   * that's what every session already saw before this three-way split
   * existed. Threaded through as a parameter everywhere displayWord() is
   * called, same as getChineseDisplay(), rather than read inside
   * displayWord() itself, so that function stays pure and testable.
   */
  getShowMeaningSideDisambiguator: (): boolean => get('show_disambiguator_meaning', 'true') === 'true',

  /**
   * Same disambiguator again, but for the word's hover tooltip/click-to-open
   * info popover specifically (word-tooltip.ts's populateTooltip/
   * buildWordDetailContent) — independent of the two above, because that
   * heading shows regardless of whether the row has been answered yet. In
   * Table mode's Word → Meaning direction the word is the visible prompt, so
   * hovering it mid-quiz leaked the same note that tells you which specific
   * English sense to type — a hint, not a footnote, at that point. On by
   * default, matching this setting's pre-split behavior.
   */
  getShowDisambiguatorOnHover: (): boolean => get('show_disambiguator_hover', 'true') === 'true',

  /**
   * Whether the grammar hint on a closed-class word ("un (masc., sing.)")
   * abbreviates gender/number or spells them out ("un (masculine,
   * singular)"). Off (spelled out) by default — this only ever appears on a
   * handful of article/determiner cards, so there's no clutter to save
   * abbreviating against, and spelled out is unambiguous to a learner who
   * hasn't seen "sing./pl." shorthand before. Same threading rule as the
   * disambiguator getters above: passed into grammarHint()/displayWord()
   * rather than read inside them.
   */
  getAbbreviateGrammarHint: (): boolean => get('abbreviate_grammar_hint', 'false') === 'true',

  /**
   * Whether a noun with a known masculine/feminine gender is prefixed with
   * its definite article — "la casa" instead of "casa" — see utils.ts's
   * genderArticle/displayWord. Off by default: unlike the article-hint
   * feature above, this touches every gendered noun in the language (12k+
   * for Spanish), not a handful of determiner cards, so it's opt-in rather
   * than sprung on existing sessions.
   */
  getShowGenderArticle: (): boolean => get('show_gender_article', 'false') === 'true',

  /**
   * How that same noun's gender is shown visually (color from getGenderColor
   * below), independent of getShowGenderArticle — a learner can turn on
   * either, both, or neither:
   *   'off'     — no visual indicator (default)
   *   'dot'     — a small corner dot (see utils/dom.ts's applyGenderContainer)
   *   'word-bg' — a colored pill behind just the word (renderWordWithGender)
   *   'box-bg'  — the whole cell/box background (applyGenderContainer)
   */
  getGenderIndicatorStyle: (): GenderIndicatorStyle => get('gender_indicator_style', 'off') as GenderIndicatorStyle,

  /**
   * When the indicator above is actually allowed to show, relative to
   * whether the row's been hinted or resolved yet — see
   * utils/dom.ts's shouldShowGenderIndicator for what each value means.
   * 'always' by default, matching this setting's pre-existing behavior.
   */
  getGenderIndicatorVisibility: (): GenderIndicatorVisibility =>
    get('gender_indicator_visibility', 'always') as GenderIndicatorVisibility,

  /**
   * A full-color (#rrggbb) override for the masculine or feminine gender
   * dot, or null to use variables.css's default (a conventional baby
   * blue/pink). Same "full color, not just a hue" reasoning as
   * getTableColor below — this is a specific, meaningful color a learner
   * would want to pick precisely.
   */
  getGenderColor: (key: 'masculine' | 'feminine'): string | null => readString(P + 'gender_color_' + key),

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

  /**
   * Where a function-word marker shows — see FunctionWordMarker in
   * utils.ts. Default 'meaning': bracket the English side ("[topic
   * marker]"), not the word a learner is about to type.
   */
  getFunctionWordMarker: (): FunctionWordMarker => get('function_word_marker', 'meaning') as FunctionWordMarker,

  /** Bundles the Chinese-display settings above for `slotText`/`slotMatches`. */
  getChineseDisplay(): ChineseDisplay {
    return {
      chineseScript:   this.getChineseScript(),
      showBothScripts: this.getShowBothScripts(),
      showPinyinGloss: this.getShowPinyinGloss(),
      functionWordMarker: this.getFunctionWordMarker(),
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
   * Whole-app toggle for a newcomer, or anyone who'd rather not see every
   * knob at once — formerly "Kid Friendly Mode", renamed since its opposite
   * ("Advanced Mode") would otherwise collide with the unrelated, already-
   * existing getAdvancedMode() below (which only controls how much of the
   * Settings *page itself* shows). Defaults ON for anyone who's never
   * touched it — a one-time read of the old `kid_friendly_mode` key keeps an
   * existing user's explicit choice (on or off) rather than silently
   * flipping it when the default changes. Turning it on is a one-time nudge
   * (not a permanent lock) for Advanced mode and the swear filter — see the
   * click handler in bindSettings() — and, unlike those two, actively locks
   * My Content against edits for as long as it stays on (see app.ts's
   * syncSimpleModeLocks()).
   */
  getSimpleMode: (): boolean => {
    const raw = readString(P + 'simple_mode');
    if (raw !== null) return raw === 'true';
    const legacy = readString(P + 'kid_friendly_mode');
    return legacy !== null ? legacy === 'true' : true;
  },
  setSimpleMode: (on: boolean): void => set('simple_mode', String(on)),

  /**
   * Whether the sidebar's Testing Profiles section also shows a "Visual
   * Profiles" sub-section (saved display-preference bundles — see
   * filters/visual-profiles.ts) right below it. Off by default: most
   * learners never need this, and Testing Profiles' own list shouldn't grow
   * a second kind of entry under it unasked for.
   */
  getShowVisualProfiles: (): boolean => get('show_visual_profiles', 'false') === 'true',
  setShowVisualProfiles: (on: boolean): void => set('show_visual_profiles', String(on)),

  /**
   * Whether the proof-of-concept quiz tabs (Picture Quiz, Trivia, Guess the
   * Blank, Sentence Scramble) are shown. Off by default — see app.ts's
   * syncExperimentalModes.
   */
  getShowExperimentalModes: (): boolean => get('show_experimental_modes', 'false') === 'true',
  setShowExperimentalModes: (on: boolean): void => set('show_experimental_modes', String(on)),

  /**
   * Whether the Admin tab is shown at all. Off by default — this is a data-
   * editing tool, not a quiz feature, and most learners never need it. A dev
   * build shows the tab regardless (see app.ts), so this only matters for a
   * built app: the packaged desktop app (editing its own local SQLite copy —
   * see src/client/tauri/bootstrap.ts) or a web deploy with a reachable
   * backend. admin.ts's own hasReachableBackend()/Tauri-SQL check still
   * redirects away if neither is true, so turning this on is never harmful,
   * just sometimes a dead end.
   */
  getShowAdminPanel: (): boolean => get('show_admin_panel', 'false') === 'true',
  setShowAdminPanel: (on: boolean): void => set('show_admin_panel', String(on)),

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
   * How many of the most recent sessions, per language, saveSession()
   * (session-history.ts) keeps before the oldest ones drop off the end of
   * the Recent Sessions list. HISTORY_KEEP is the default — a learner who
   * wants a longer (or shorter) trend than that can raise or lower it here.
   */
  getMaxSessionsKept: (): number => {
    const n = Number(get('max_sessions_kept', String(HISTORY_KEEP)));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : HISTORY_KEEP;
  },

  /**
   * Whether the lightweight Testing Profiles popover (preset-picker.ts,
   * opened from the "Profiles" button on Table/Picture/Conjugation) shows a
   * "Full Profile"/"⚡ Quick Edit" button next to each profile to tweak its
   * parameters inline. Off by default — the popover's plain Apply/Delete
   * list is the simpler default, and this adds a fair amount of UI to it.
   * Inline tweaks only ever apply live to the current session (see
   * filters/presets.ts's applyBundle) until "Update" (overwrites the
   * profile you opened) or "Save as new profile…" (forks a copy) is
   * clicked — the two explicit ways a tweak here becomes permanent.
   */
  getInlineProfileEditing: (): boolean => get('inline_profile_editing', 'false') === 'true',

  /**
   * Whether My Content's "Edit an Existing Word" list asks to confirm before
   * removing a word's override (its Remove button resets every override on
   * that word in one action, unlike undoing one field at a time). On by
   * default — the same reasoning as any other one-click irreversible
   * action; off lets a learner who's already sure skip the prompt every time.
   */
  getConfirmRemoveWordOverride: (): boolean => get('confirm_remove_word_override', 'true') === 'true',

  /**
   * Starting page size for My Content's "Edit an Existing Trivia Question"
   * and "Edit an Existing Guess the Blank Question" lists (buildListPager's
   * own 5/10/15 options) — read only until a list's own Per Page control has
   * been changed, same relationship getConjPageSize has to Conjugation's own
   * pagination control below. 5 by default: unlike vocabulary, the trivia/
   * Guess the Blank banks are short enough that a shorter page reads as a
   * quick glance rather than a list you have to page through to escape.
   */
  getMyContentPageSize: (): number => {
    const raw = get('my_content_page_size', '5');
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 5;
  },

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

  /** The top-right 🔥 streak counter (see ui/streak-widget.ts) — shown on
   *  every tab, unlike #shortcutsBtn which lives inside #controls and is
   *  hidden on several of them. On by default. */
  getShowStreakWidget: (): boolean => get('show_streak_widget', 'true') === 'true',

  /** Where the fire emoji sits relative to the day count in that counter,
   *  or 'number-only' to drop the emoji entirely. */
  getStreakWidgetFormat: (): StreakWidgetFormat => get('streak_widget_format', 'emoji-number') as StreakWidgetFormat,

  // ── Appearance ────────────────────────────────────────────────────────────
  getFontSize: (): FontSize => get('font_size', 'medium') as FontSize,
  /** Storage only — call applyFontSize() (exported below) separately to
   *  actually repaint, same two-step split its own click handler uses. */
  setFontSize: (size: FontSize): void => set('font_size', size),

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
  /** A per-part-of-speech hue override, or null to use the CSS default
   *  (class-filter.css's `.pos-chip[data-pos="…"]` — see POS_COLOR_DEFS). */
  getPosHue: (key: string): number | null => {
    const v = readString(P + 'pos_hue_' + key);
    return v === null ? null : Number(v);
  },

  /** A full-color (#rrggbb) override for one of Table mode's 7 semantic
   *  states (TABLE_COLOR_DEFS's own keys), or null to use its built-in
   *  default token. */
  getTableColor: (key: string): string | null => readString(P + 'table_color_' + key),
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
export const TENSE_COLOR_DEFS: readonly [key: string, label: string, defaultHue: number][] = [
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
export const PERSON_COLOR_DEFS: readonly [i: number, label: string, defaultHue: number][] = [
  [0, '1st Person Singular', 0],
  [1, '2nd Person Singular', 60],
  [2, '3rd Person Singular', 120],
  [3, '1st Person Plural', 180],
  [4, '2nd Person Plural', 240],
  [5, '3rd Person Plural', 300],
];

/**
 * The part-of-speech hue each `.pos-chip`/`.ml-word-pos`/`.tt-pos` badge
 * derives its color from — same hue-only scheme as TENSE_COLOR_DEFS above
 * (saturation/lightness are derived by the CSS itself, in
 * class-filter.css/my-lists.css/tooltip.css — see each file's own comment on
 * why the same `[data-pos]` list is duplicated three times), just keyed by
 * POS name instead of tense name. Defaults here must match the CSS's own
 * `var(--pos-hue-<key>, <default>)` fallback exactly, or a swatch would show
 * a hue the page isn't actually rendering until first touched.
 */
export const POS_COLOR_DEFS: readonly [key: string, label: string, defaultHue: number][] = [
  ['verb',        'Verb',        217],
  ['noun',        'Noun',        142],
  ['adjective',   'Adjective',    32],
  ['adverb',      'Adverb',      280],
  ['pronoun',     'Pronoun',     340],
  ['preposition', 'Preposition', 195],
  ['conjunction', 'Conjunction',  20],
  ['article',     'Article',     260],
  ['particle',    'Particle',     85],
  ['suffix',      'Suffix',      165],
];

/**
 * Table mode's 7 semantic state colors — key (storage suffix and
 * --table-color-<key> custom property, hyphens not underscores to match
 * table.css's own naming), label, and the existing token each falls back
 * to when not customized (the 3 hinted-outcome states have no prior token,
 * so they fall back to the new --hinted-* ones in variables.css instead).
 * Unlike TENSE_COLOR_DEFS/PERSON_COLOR_DEFS above, these store a full color
 * rather than just a hue — table.css's states aren't a "12 evenly-spaced
 * categories" palette the way tenses are, they're specific, meaningful
 * colors (green/red/yellow/...) a learner would want to pick precisely,
 * not just nudge the hue of.
 */
/**
 * The two gender-dot colors — key (storage suffix and
 * --gender-color-<key> custom property), label, and the CSS default each
 * falls back to (variables.css's baby blue/pink). Same "full color, not a
 * hue" reasoning as TABLE_COLOR_DEFS below.
 */
export const GENDER_COLOR_DEFS: readonly [key: 'masculine' | 'feminine', label: string, fallbackVar: string][] = [
  ['masculine', 'Masculine', '--gender-color-masculine'],
  ['feminine',  'Feminine',  '--gender-color-feminine'],
];

export const TABLE_COLOR_DEFS: readonly [key: string, label: string, fallbackVar: string][] = [
  ['correct',         'Correct',                     '--correct'],
  ['revealed',        'Revealed (?? button)',         '--warning'],
  ['incorrect',       'Missed / Give Up',             '--incorrect'],
  ['hinted',          'Hint used, still solving',     '--info'],
  ['hinted-correct',  'Hinted, then solved',          '--hinted-correct'],
  ['hinted-revealed', 'Hinted, then revealed',        '--hinted-revealed'],
  ['hinted-missed',   'Hinted, then given up on',     '--hinted-missed'],
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

/**
 * Apply any saved part-of-speech hue overrides as inline :root properties —
 * same mechanism as applyTenseColors above, feeding the --pos-hue-<key>
 * custom property that class-filter.css/my-lists.css/tooltip.css's
 * `[data-pos]` rules all read through.
 */
export function applyPosColors(): void {
  for (const [key] of POS_COLOR_DEFS) {
    const hue = Settings.getPosHue(key);
    if (hue !== null) document.documentElement.style.setProperty('--pos-hue-' + key, String(hue));
    else document.documentElement.style.removeProperty('--pos-hue-' + key);
  }
}

/**
 * Apply any saved Table mode color overrides as inline :root properties —
 * table.css's own rules already fall through to each state's built-in token
 * when --table-color-<key> is unset, so this only ever needs to set or clear
 * it, never supply the default itself.
 */
export function applyTableColors(): void {
  for (const [key] of TABLE_COLOR_DEFS) {
    const hex = Settings.getTableColor(key);
    if (hex) document.documentElement.style.setProperty('--table-color-' + key, hex);
    else document.documentElement.style.removeProperty('--table-color-' + key);
  }
}

/**
 * Apply any saved gender-dot color overrides as inline :root properties —
 * variables.css's --gender-color-masculine/-feminine already supply the
 * default (a conventional baby blue/pink), so this only ever needs to set
 * or clear the override, same mechanism as applyTableColors above.
 */
export function applyGenderColors(): void {
  for (const key of ['masculine', 'feminine'] as const) {
    const hex = Settings.getGenderColor(key);
    if (hex) document.documentElement.style.setProperty('--gender-color-' + key, hex);
    else document.documentElement.style.removeProperty('--gender-color-' + key);
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


export function applyTableRowDensity(density: TableRowDensity): void {
  document.body.classList.toggle('table-compact-rows', density === 'compact' || density === 'ultra');
  document.body.classList.toggle('table-ultra-compact-rows', density === 'ultra');
}

/** The Sense disambiguator row's three independent sub-toggles — shared
 *  between the click-binding block and syncDisambiguatorAll below, so
 *  adding a fourth surface later means updating this list once. */

export function applyAutofillAttr(el: HTMLInputElement): void {
  el.autocomplete = Settings.getAutofillEnabled() ? 'on' : 'off';
}

/**
 * Notified when the words-per-page setting changes so table mode can
 * re-paginate a quiz that's already on screen.
 */
export let onPageSizeChange: (() => void) | null = null;

export function setOnPageSizeChange(fn: () => void): void {
  onPageSizeChange = fn;
}

/** Notified when either streak-widget setting changes, so the top-right
 *  counter updates immediately rather than only on next page load. */
export const onStreakWidgetChangeListeners: (() => void)[] = [];

export function setOnStreakWidgetChange(fn: () => void): void {
  onStreakWidgetChangeListeners.push(fn);
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
export const onShowTimerChangeListeners: (() => void)[] = [];

export function setOnShowTimerChange(fn: () => void): void {
  onShowTimerChangeListeners.push(fn);
}

/** Notified when Simple Mode changes, so app.ts can lock/unlock My Content
 *  immediately rather than only on next visit. A list for the same reason
 *  as onShowTimerChangeListeners above. */
export const onSimpleModeChangeListeners: (() => void)[] = [];

export function setOnSimpleModeChange(fn: () => void): void {
  onSimpleModeChangeListeners.push(fn);
}

/** Notified when Show Admin Panel changes, so app.ts can show/hide the tab
 *  immediately rather than only on next visit. */
export const onExperimentalModesChangeListeners: (() => void)[] = [];

export function setOnExperimentalModesChange(fn: () => void): void {
  onExperimentalModesChangeListeners.push(fn);
}

export const onShowAdminPanelChangeListeners: (() => void)[] = [];

export function setOnShowAdminPanelChange(fn: () => void): void {
  onShowAdminPanelChangeListeners.push(fn);
}

/**
 * Notified when the deselected-pronoun mode changes, so conjugation mode can
 * fill in or clear the answers that 'answer' mode shows. The class alone
 * cannot do that — it is content, not styling.
 */
export let onConjDeselectedChange: (() => void) | null = null;

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
export let onFilterVisibilityChange: (() => void) | null = null;

export function setOnFilterVisibilityChange(fn: () => void): void {
  onFilterVisibilityChange = fn;
}

/** Notified when the app's own interface language changes — app.ts wires
 *  this to i18n.ts's applyTranslations() so the switch takes effect without
 *  a reload. Same hook-registration pattern as onFilterVisibilityChange,
 *  for the same reason: settings.ts can't import app.ts/i18n.ts directly
 *  without a circular import. */
export let onUILanguageChange: (() => void) | null = null;

export function setOnUILanguageChange(fn: () => void): void {
  onUILanguageChange = fn;
}
