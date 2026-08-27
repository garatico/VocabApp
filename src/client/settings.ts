import { readString, writeString, remove as removeKey } from './utils/storage.ts';
import { applyTheme, type ThemeValue } from './ui/theme-toggle.ts';
import { LANGUAGES, languageInfo, flagUrl } from './data/languages.ts';
import { createFlagImg } from './ui/flag-icon.ts';
import { clearHistory } from './utils/session-history.ts';

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

export type ConjDeselected = 'close' | 'blank' | 'grey' | 'answer';
const CONJ_DESELECTED: ConjDeselected[] = ['close', 'blank', 'grey', 'answer'];

export type LangIndicator = 'off' | 'color' | 'flag';

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
  getHintMode:  (): HintMode  => get('hint_mode',  'full')  as HintMode,

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

  /** The frequency-rank corner badge, across every Table quiz style. */
  getTableShowRank: (): boolean => get('table_show_rank', 'true') === 'true',

  /** The list star and "missed before" count badge, across every Table quiz style. */
  getTableShowWordMarkers: (): boolean => get('table_show_word_markers', 'true') === 'true',

  // ── All quizzes ────────────────────────────────────────────────────────────
  getMatchMode: (): MatchMode => get('match_mode', 'fuzzy') as MatchMode,
  getTypoTolerance: (): TypoTolerance => get('typo_tolerance', 'normal') as TypoTolerance,
  getTypoToleranceRatio: (): number => TYPO_RATIOS[get('typo_tolerance', 'normal') as TypoTolerance] ?? 0.25,

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

  // ── Appearance ────────────────────────────────────────────────────────────
  getFontSize: (): FontSize => get('font_size', 'medium') as FontSize,

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
 * Notified when the deselected-pronoun mode changes, so conjugation mode can
 * fill in or clear the answers that 'answer' mode shows. The class alone
 * cannot do that — it is content, not styling.
 */
let onConjDeselectedChange: (() => void) | null = null;

export function setOnConjDeselectedChange(fn: (() => void) | null): void {
  onConjDeselectedChange = fn;
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

  // Hint mode
  document.getElementById('settingHint')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingHint', btn);
    set('hint_mode', btn.dataset.hint ?? 'full');
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

  buildLangAppearanceRows();
  applyLangColors();
  restoreSettingsUI();
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

  // Hint
  const savedHint = get('hint_mode', 'full');
  document.querySelectorAll<HTMLElement>('#settingHint .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.hint === savedHint);
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

  // Filter linking
  const savedLinking = get('filter_linking_enabled', 'true');
  document.querySelectorAll<HTMLElement>('#settingFilterLinking .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.linking === savedLinking);
  });
  CHAIN_BTN_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = savedLinking === 'false';
  });

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
}
