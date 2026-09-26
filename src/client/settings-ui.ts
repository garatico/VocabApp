import { readString, writeString, remove as removeKey } from './utils/storage.ts';
import { applyTheme, type ThemeValue } from './ui/theme-toggle.ts';
import { LANGUAGES } from './data/languages.ts';
import { clearHistory } from './utils/session-history.ts';
import { getGoals, setGoalTarget, hasLanguageGoal, clearLanguageGoal, type GoalType } from './utils/streak.ts';
import type { GenderIndicatorStyle, GenderIndicatorVisibility } from './utils/dom.ts';
import type { ProgressBarPercentMode } from './ui/score-pills.ts';
import type { StreakWidgetFormat } from './ui/streak-widget.ts';
import { buildConjColorRows, buildGenderColorRows, buildLangAppearanceRows, buildMlColorRows, buildPosColorRows, buildTableColorRows } from './settings-appearance.ts';
import { bindGlossary, bindSettingsSearch, snapshotSettingDefaults } from './settings-search.ts';
import { bindStreakCalendarNav, refreshStreakReadouts } from './settings-streak.ts';
import { ConjDeselected, FontSize, GENDER_COLOR_DEFS, LISTS_DOMAINS_HIDEABLE_MODES, LangIndicator, ML_COLOR_DEFS, P, PERSON_COLOR_DEFS, POS_COLOR_DEFS, POS_HIDEABLE_MODES, Settings, TABLE_COLOR_DEFS, TENSE_COLOR_DEFS, TableRowDensity, UILanguage, applyConjDeselectedClass, applyFontSize, applyGenderColors, applyLangColors, applyMlColors, applyPosColors, applyTableColors, applyTableRowDensity, applyTenseColors, get, getHiddenFilterModes, onConjDeselectedChange, onExperimentalModesChangeListeners, onFilterVisibilityChange, onPageSizeChange, onShowAdminPanelChangeListeners, onShowTimerChangeListeners, onSimpleModeChangeListeners, onStreakWidgetChangeListeners, onUILanguageChange, set, setHiddenFilterModes } from './settings.ts';

/**
 * settings-ui.ts — binds the Settings screen: click handlers for every control,
 * restoring their saved state, and the daily-goal section. The saved values
 * themselves are settings.ts's.
 */

// ── Bind settings UI ─────────────────────────────────────────────────────────

/** The three filters' chain buttons — shared between bindSettings() and
 *  restoreSettingsUI(), which each need to show/hide all three together. */
const CHAIN_BTN_IDS = ['listFilterChain', 'classFilterChain', 'domainFilterChain'];

function activateToggle(groupId: string, btn: HTMLButtonElement): void {
  document.querySelectorAll(`#${groupId} .sort-order-btn`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

/** Table row density's two body classes — Ultra Compact carries both (its
 *  own CSS block in table.css builds on Compact's rather than repeating
 *  it), Compact carries only the first, Comfortable neither. */

const DISAMBIGUATOR_TOGGLES = [
  { id: 'settingShowDisambiguatorWord',    key: 'show_disambiguator_word',    fallback: 'false' },
  { id: 'settingShowDisambiguatorMeaning', key: 'show_disambiguator_meaning', fallback: 'true' },
  { id: 'settingShowDisambiguatorHover',   key: 'show_disambiguator_hover',   fallback: 'true' },
] as const;

/**
 * All reads "On"/"Off" only when the three sub-toggles currently agree;
 * otherwise neither of its own buttons lights up. A plain two-state control
 * can't represent "mixed" any other way, and forcing one to look chosen
 * when the three disagree would just be wrong — this runs after every
 * sub-toggle click, and once at startup, to keep All an honest summary
 * rather than a fourth independent value that can drift from the rest.
 */
function syncDisambiguatorAll(): void {
  const allGroup = document.getElementById('settingShowDisambiguatorAll');
  if (!allGroup) return;
  const values = DISAMBIGUATOR_TOGGLES.map(t => get(t.key, t.fallback));
  const allOn  = values.every(v => v === 'true');
  const allOff = values.every(v => v === 'false');
  allGroup.querySelectorAll<HTMLElement>('.sort-order-btn').forEach(b => {
    b.classList.toggle('active', (allOn && b.dataset.show === 'true') || (allOff && b.dataset.show === 'false'));
  });
}

/**
 * Wire up a toggle group that exists in more than one place in the DOM —
 * today, only Script Display's three controls, which appear both under
 * Settings and in Table mode's filter panel. Clicking a button in any one
 * `groupIds` container calls `onChange` with that button's `data-${attr}`
 * value, then activates the matching button in *every* listed container —
 * including the one just clicked — so all copies read the same state
 * without each needing its own separate click handler.
 */
function bindMirroredToggle(
  groupIds: string[],
  attr: string,
  onChange: (value: string | undefined) => void,
): void {
  groupIds.forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
      if (!btn) return;
      const value = btn.dataset[attr];
      onChange(value);
      const selector = groupIds.map(gid => `#${gid} .sort-order-btn`).join(', ');
      document.querySelectorAll<HTMLElement>(selector).forEach(b => {
        b.classList.toggle('active', b.dataset[attr] === value);
      });
    });
  });
}

/**
 * Set (or clear) autocomplete="off" on a quiz input per the Autofill setting.
 * Every mode's answer box is built through here rather than hardcoding the
 * attribute itself, so flipping the setting changes all of them the same way.
 */

export function bindSettings(): void {
  // Before anything paints saved values onto the controls: the markup is what defines each default.
  snapshotSettingDefaults();

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
  (document.getElementById('settingUILanguage') as HTMLSelectElement | null)?.addEventListener('change', e => {
    const select = e.target as HTMLSelectElement;
    set('ui_language', (select.value || 'english') as UILanguage);
    onUILanguageChange?.();
  });

  // Progress bar percentage — Correct / Missed / All, once complete
  document.getElementById('settingProgressBarPercentMode')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn?.dataset.mode) return;
    activateToggle('settingProgressBarPercentMode', btn);
    set('progress_bar_percent_mode', btn.dataset.mode as ProgressBarPercentMode);
  });

  // Progress bar hint breakdown — adds Hinted -> Solved/Revealed/Missed chips
  document.getElementById('settingProgressBarHintBreakdown')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingProgressBarHintBreakdown', btn);
    set('progress_bar_hint_breakdown', btn.dataset.show ?? 'false');
  });

  // Streak counter — shown/hidden
  document.getElementById('settingShowStreakWidget')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingShowStreakWidget', btn);
    set('show_streak_widget', btn.dataset.show ?? 'true');
    onStreakWidgetChangeListeners.forEach(fn => fn());
  });

  // Streak counter — emoji/number arrangement
  document.getElementById('settingStreakWidgetFormat')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn?.dataset.format) return;
    activateToggle('settingStreakWidgetFormat', btn);
    set('streak_widget_format', btn.dataset.format as StreakWidgetFormat);
    onStreakWidgetChangeListeners.forEach(fn => fn());
  });

  // Column count
  document.getElementById('settingCols')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingCols', btn);
    set('table_cols', btn.dataset.cols ?? '2');
  });

  // Row density — Comfortable / Compact / Ultra Compact (see getTableRowDensity)
  document.getElementById('settingTableRowDensity')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn?.dataset.density) return;
    activateToggle('settingTableRowDensity', btn);
    const density = btn.dataset.density as TableRowDensity;
    set('table_row_density', density);
    applyTableRowDensity(density);
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

  // Confirm multiple glosses exist when a Hint is given
  document.getElementById('settingHintMultiGloss')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingHintMultiGloss', btn);
    set('hint_multi_gloss', btn.dataset.enabled ?? 'false');
  });

  // Hint-outcome tracking — independent on/off per outcome
  ([
    ['settingTrackHintedCorrect',  'track_hinted_correct'],
    ['settingTrackHintedRevealed', 'track_hinted_revealed'],
    ['settingTrackHintedMissed',   'track_hinted_missed'],
  ] as const).forEach(([groupId, key]) => {
    document.getElementById(groupId)?.addEventListener('click', e => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
      if (!btn) return;
      activateToggle(groupId, btn);
      set(key, btn.dataset.enabled ?? 'true');
    });
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

  // Sense disambiguator — Word/Meaning/Hover toggle independently; All is a
  // shortcut that sets the three of them together (see syncDisambiguatorAll
  // for how All's own display reflects whether they currently agree).
  DISAMBIGUATOR_TOGGLES.forEach(({ id, key, fallback }) => {
    document.getElementById(id)?.addEventListener('click', e => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
      if (!btn) return;
      activateToggle(id, btn);
      set(key, btn.dataset.show ?? fallback);
      syncDisambiguatorAll();
    });
  });

  document.getElementById('settingShowDisambiguatorAll')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn?.dataset.show) return;
    activateToggle('settingShowDisambiguatorAll', btn);
    DISAMBIGUATOR_TOGGLES.forEach(({ id, key }) => {
      set(key, btn.dataset.show!);
      document.querySelectorAll<HTMLElement>(`#${id} .sort-order-btn`).forEach(b => {
        b.classList.toggle('active', b.dataset.show === btn.dataset.show);
      });
    });
  });

  // Grammar hint abbreviation — "masc., sing." vs "masculine, singular"
  document.getElementById('settingAbbreviateGrammarHint')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingAbbreviateGrammarHint', btn);
    set('abbreviate_grammar_hint', btn.dataset.show ?? 'false');
  });

  // Gender article — "la casa" instead of "casa"
  document.getElementById('settingShowGenderArticle')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingShowGenderArticle', btn);
    set('show_gender_article', btn.dataset.show ?? 'false');
  });

  // Gender indicator style (Off / Dot / Word background / Box background)
  document.getElementById('settingGenderIndicatorStyle')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingGenderIndicatorStyle', btn);
    set('gender_indicator_style', (btn.dataset.style ?? 'off') as GenderIndicatorStyle);
  });

  // Gender indicator visibility (Always / Once hinted / Only when revealed)
  document.getElementById('settingGenderIndicatorVisibility')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingGenderIndicatorVisibility', btn);
    set('gender_indicator_visibility', (btn.dataset.visibility ?? 'always') as GenderIndicatorVisibility);
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

  // Script display (Chinese/Japanese): each setting has two copies of its
  // toggle group — one under Settings, one in Table mode's own filter panel
  // (shown only for a romanizedScript language — see
  // syncScriptDisplayAvailability in app.ts). Wiring both container ids to
  // the same handler and repainting both via bindMirroredToggle is what
  // keeps clicking either copy update the other, rather than the two
  // silently disagreeing until the next page load.
  bindMirroredToggle(['settingChineseScript', 'filterChineseScript'], 'chineseScript',
    value => set('chinese_script', value ?? 'characters'));
  bindMirroredToggle(['settingShowPinyin', 'filterShowPinyin'], 'showPinyin',
    value => set('show_pinyin', value ?? 'true'));
  bindMirroredToggle(['settingShowPinyinGloss', 'filterShowPinyinGloss'], 'showPinyinGloss',
    value => set('show_pinyin_gloss', value ?? 'true'));
  bindMirroredToggle(['settingFunctionWordMarker', 'filterFunctionWordMarker'], 'functionMarker',
    value => set('function_word_marker', value ?? 'meaning'));

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

  // Simple Mode — a one-time nudge for Advanced mode/the swear filter and
  // every quiz-mode control below (the learner can still change any of them
  // back while it's on — this only sets them, it doesn't lock them), plus
  // an ongoing lock on My Content (app.ts, via setOnSimpleModeChange). The
  // controls this simplifies are hidden by settings.css's
  // `body.simple-mode [data-simple-hide]` rule; forcing their *value* here
  // (real clicks on the real buttons, so each control's own existing
  // handler does the actual work — same technique presets.ts's
  // applyWords()/applyConjugation() already use) is what keeps a hidden
  // toggle from silently leaving whatever was picked before Simple Mode
  // went on.
  document.getElementById('settingSimpleMode')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingSimpleMode', btn);
    const on = btn.dataset.simpleMode === 'true';
    Settings.setSimpleMode(on);
    document.body.classList.toggle('simple-mode', on);

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
      // Skip Known relies on the Lists filter, which Simple Mode disarms
      // outright (see word-filters.ts's own getSimpleMode() check) —
      // leaving Skip Known selectable would offer a control that silently
      // does nothing.
      document.querySelector<HTMLButtonElement>('#sizeModeToggle .sort-order-btn[data-mode="window"]')?.click();
    }

    onSimpleModeChangeListeners.forEach(fn => fn());
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

  // Sessions to keep (see getMaxSessionsKept)
  document.getElementById('settingMaxSessionsKept')?.addEventListener('change', e => {
    const n = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(n) && n > 0) set('max_sessions_kept', String(Math.floor(n)));
  });

  // Testing Profiles popover's inline "+" editor (see getInlineProfileEditing)
  document.getElementById('settingInlineProfileEditing')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingInlineProfileEditing', btn);
    set('inline_profile_editing', btn.dataset.enabled ?? 'false');
  });

  // My Content: confirm before removing a word override (see
  // getConfirmRemoveWordOverride)
  document.getElementById('settingConfirmRemoveWordOverride')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingConfirmRemoveWordOverride', btn);
    set('confirm_remove_word_override', btn.dataset.enabled ?? 'true');
  });

  // Visual Profiles sub-section under Testing Profiles (see getShowVisualProfiles)
  document.getElementById('settingShowVisualProfiles')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingShowVisualProfiles', btn);
    Settings.setShowVisualProfiles(btn.dataset.enabled === 'true');
  });

  // Proof-of-concept quiz tabs (see getShowExperimentalModes)
  document.getElementById('settingShowExperimentalModes')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingShowExperimentalModes', btn);
    Settings.setShowExperimentalModes(btn.dataset.enabled === 'true');
    onExperimentalModesChangeListeners.forEach(fn => fn());
  });

  // Admin tab (see getShowAdminPanel)
  document.getElementById('settingShowAdminPanel')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingShowAdminPanel', btn);
    Settings.setShowAdminPanel(btn.dataset.enabled === 'true');
    onShowAdminPanelChangeListeners.forEach(fn => fn());
  });

  // My Content: starting page size for the Trivia/Guess the Blank edit lists
  document.getElementById('settingMyContentPageSize')?.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn) return;
    activateToggle('settingMyContentPageSize', btn);
    set('my_content_page_size', btn.dataset.pagesize ?? '5');
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

  buildPosColorRows();
  applyPosColors();
  document.getElementById('settingResetPosColors')?.addEventListener('click', () => {
    for (const [key] of POS_COLOR_DEFS) removeKey(P + 'pos_hue_' + key);
    applyPosColors();
    buildPosColorRows();
  });

  buildTableColorRows();
  applyTableColors();
  document.getElementById('settingResetTableColors')?.addEventListener('click', () => {
    for (const [key] of TABLE_COLOR_DEFS) removeKey(P + 'table_color_' + key);
    applyTableColors();
    buildTableColorRows();
  });

  buildGenderColorRows();
  applyGenderColors();
  document.getElementById('settingResetGenderColors')?.addEventListener('click', () => {
    for (const [key] of GENDER_COLOR_DEFS) removeKey(P + 'gender_color_' + key);
    applyGenderColors();
    buildGenderColorRows();
  });

  buildMlColorRows();
  applyMlColors();
  document.getElementById('settingResetMlColors')?.addEventListener('click', () => {
    for (const [key] of ML_COLOR_DEFS) removeKey(P + 'list_color_' + key);
    applyMlColors();
    buildMlColorRows();
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
  const uiLangSelect = document.getElementById('settingUILanguage') as HTMLSelectElement | null;
  if (uiLangSelect) uiLangSelect.value = get('ui_language', 'english');

  // Progress bar percentage
  const savedProgressPercentMode = Settings.getProgressBarPercentMode();
  document.querySelectorAll<HTMLElement>('#settingProgressBarPercentMode .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === savedProgressPercentMode);
  });

  // Progress bar hint breakdown
  const savedProgressHintBreakdown = String(Settings.getProgressBarShowHintBreakdown());
  document.querySelectorAll<HTMLElement>('#settingProgressBarHintBreakdown .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.show === savedProgressHintBreakdown);
  });

  // Streak counter — shown/hidden and format
  const savedShowStreakWidget = String(Settings.getShowStreakWidget());
  document.querySelectorAll<HTMLElement>('#settingShowStreakWidget .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.show === savedShowStreakWidget);
  });
  const savedStreakWidgetFormat = Settings.getStreakWidgetFormat();
  document.querySelectorAll<HTMLElement>('#settingStreakWidgetFormat .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.format === savedStreakWidgetFormat);
  });

  // Cols
  const savedCols = get('table_cols', '2');
  document.querySelectorAll<HTMLElement>('#settingCols .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cols === savedCols);
  });

  // Row density
  const savedDensity = Settings.getTableRowDensity();
  document.querySelectorAll<HTMLElement>('#settingTableRowDensity .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.density === savedDensity);
  });
  applyTableRowDensity(savedDensity);

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
  const savedHintMultiGloss = get('hint_multi_gloss', 'false');
  document.querySelectorAll<HTMLElement>('#settingHintMultiGloss .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.enabled === savedHintMultiGloss);
  });
  ([
    ['settingTrackHintedCorrect',  'track_hinted_correct'],
    ['settingTrackHintedRevealed', 'track_hinted_revealed'],
    ['settingTrackHintedMissed',   'track_hinted_missed'],
  ] as const).forEach(([groupId, key]) => {
    const saved = get(key, 'true');
    document.querySelectorAll<HTMLElement>(`#${groupId} .sort-order-btn`).forEach(b => {
      b.classList.toggle('active', b.dataset.enabled === saved);
    });
  });
  const savedShowRank = get('table_show_rank', 'true');
  document.querySelectorAll<HTMLElement>('#settingTableShowRank .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.show === savedShowRank);
  });
  const savedShowMarkers = get('table_show_word_markers', 'true');
  document.querySelectorAll<HTMLElement>('#settingTableShowMarkers .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.show === savedShowMarkers);
  });
  DISAMBIGUATOR_TOGGLES.forEach(({ id, key, fallback }) => {
    const saved = get(key, fallback);
    document.querySelectorAll<HTMLElement>(`#${id} .sort-order-btn`).forEach(b => {
      b.classList.toggle('active', b.dataset.show === saved);
    });
  });
  syncDisambiguatorAll();
  const savedAbbreviateGrammarHint = get('abbreviate_grammar_hint', 'false');
  document.querySelectorAll<HTMLElement>('#settingAbbreviateGrammarHint .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.show === savedAbbreviateGrammarHint);
  });
  const savedShowGenderArticle = get('show_gender_article', 'false');
  document.querySelectorAll<HTMLElement>('#settingShowGenderArticle .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.show === savedShowGenderArticle);
  });
  const savedGenderIndicatorStyle = Settings.getGenderIndicatorStyle();
  document.querySelectorAll<HTMLElement>('#settingGenderIndicatorStyle .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.style === savedGenderIndicatorStyle);
  });
  const savedGenderIndicatorVisibility = Settings.getGenderIndicatorVisibility();
  document.querySelectorAll<HTMLElement>('#settingGenderIndicatorVisibility .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.visibility === savedGenderIndicatorVisibility);
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

  // Script display (Chinese/Japanese): two copies of the same controls —
  // one under Settings, one in Table mode's own filter panel (shown only
  // for a romanizedScript language — see syncScriptDisplayAvailability in
  // app.ts). Both read/write the same localStorage keys; painting both
  // container ids here is what keeps them showing the same state.
  const savedChineseScript = get('chinese_script', 'characters');
  document.querySelectorAll<HTMLElement>('#settingChineseScript .sort-order-btn, #filterChineseScript .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.chineseScript === savedChineseScript);
  });

  const savedShowPinyin = get('show_pinyin', 'true');
  document.querySelectorAll<HTMLElement>('#settingShowPinyin .sort-order-btn, #filterShowPinyin .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.showPinyin === savedShowPinyin);
  });

  const savedShowPinyinGloss = get('show_pinyin_gloss', 'true');
  document.querySelectorAll<HTMLElement>('#settingShowPinyinGloss .sort-order-btn, #filterShowPinyinGloss .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.showPinyinGloss === savedShowPinyinGloss);
  });

  const savedFunctionMarker = get('function_word_marker', 'meaning');
  document.querySelectorAll<HTMLElement>('#settingFunctionWordMarker .sort-order-btn, #filterFunctionWordMarker .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.functionMarker === savedFunctionMarker);
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

  // Simple Mode (formerly "Kid-Friendly Mode") — on by default; see
  // Settings.getSimpleMode()'s own migration-from-the-old-key note.
  const savedSimpleMode = String(Settings.getSimpleMode());
  document.querySelectorAll<HTMLElement>('#settingSimpleMode .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.simpleMode === savedSimpleMode);
  });
  document.body.classList.toggle('simple-mode', savedSimpleMode === 'true');

  // Session history
  const savedHistory = get('history_enabled', 'true');
  document.querySelectorAll<HTMLElement>('#settingHistory .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.history === savedHistory);
  });
  const maxSessionsInput = document.getElementById('settingMaxSessionsKept') as HTMLInputElement | null;
  if (maxSessionsInput) maxSessionsInput.value = String(Settings.getMaxSessionsKept());

  // Testing Profiles popover's inline "+" editor
  const savedInlineProfileEditing = get('inline_profile_editing', 'false');
  document.querySelectorAll<HTMLElement>('#settingInlineProfileEditing .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.enabled === savedInlineProfileEditing);
  });

  // My Content: confirm before removing a word override
  const savedConfirmRemoveWordOverride = get('confirm_remove_word_override', 'true');
  document.querySelectorAll<HTMLElement>('#settingConfirmRemoveWordOverride .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.enabled === savedConfirmRemoveWordOverride);
  });

  // Visual Profiles sub-section under Testing Profiles
  const savedShowVisualProfiles = get('show_visual_profiles', 'false');
  document.querySelectorAll<HTMLElement>('#settingShowVisualProfiles .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.enabled === savedShowVisualProfiles);
  });

  // Proof-of-concept quiz tabs
  const savedShowExperimental = get('show_experimental_modes', 'false');
  document.querySelectorAll<HTMLElement>('#settingShowExperimentalModes .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.enabled === savedShowExperimental);
  });

  // Admin tab
  const savedShowAdminPanel = get('show_admin_panel', 'false');
  document.querySelectorAll<HTMLElement>('#settingShowAdminPanel .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.enabled === savedShowAdminPanel);
  });

  // My Content: Trivia/Guess the Blank edit list page size
  const savedMyContentPageSize = get('my_content_page_size', '5');
  document.querySelectorAll<HTMLElement>('#settingMyContentPageSize .sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.pagesize === savedMyContentPageSize);
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
  bindGlossary();
  bindSettingsSearch();
}
