/**
 * storage-keys.ts — every localStorage key family the app uses, declared once.
 *
 * Until now the answer to "what does this app store?" was spread across ~30
 * files, four prefixes and a hand-kept prefix list in full-backup.ts, and the
 * prefixes lie: `vq_history_` is both quiz history (data) and a panel's
 * collapsed state (UI), `ml_` and `vq_` each mix the two, and a dozen keys have
 * no prefix at all. This file is the single statement of what each family *is*.
 *
 * It changes nothing about how any key is read or written — key names are
 * exactly what they were, which is what keeps existing browsers' data readable.
 * Its job is to let other code ask a question instead of pattern-matching:
 * "is this irreplaceable data, a setting, or just where a panel was left?"
 * (Phase 1 of the storage-migration plan; the versioned migration runner is
 * Phase 2, and it needs this list to know what it is migrating.)
 *
 * Adding a key: add its family here, seed it in tests/helpers/storage-fixture.ts,
 * and regenerate the golden (see CLAUDE.md). tests/client/storage-keys.test.ts
 * fails if a key family exists in the source that this file does not know.
 */

export type KeyClass =
  /** Built up by the learner over time and not recoverable: lists, mastery,
   *  the review schedule, history, streaks, profiles, My Content. */
  | 'data'
  /** A preference set on purpose in Settings. */
  | 'settings'
  /** Where something was left: current tab, sizes, sorts, filters, collapsed panels. */
  | 'ui'
  /** About the app's own housekeeping (e.g. when a backup was last taken); never backed up. */
  | 'bookkeeping'
  /** Written by an older version and still read as a fallback or migrated on read. */
  | 'legacy';

export interface KeyFamily {
  /** The key itself (`exact`) or its leading part, followed by a language/scope/name (`prefix`). */
  pattern: string;
  match:   'exact' | 'prefix';
  class:   KeyClass;
  /** The file that owns reading and writing it, relative to src/client. */
  owner:   string;
  /** Whether a full backup includes it. Defaults to true unless the class is `bookkeeping`. */
  backup?: boolean;
  /**
   * The existence of this key means the learner has actually done something worth keeping
   * (made a list, mastered a word, taken a quiz…). Used to decide whether there is anything
   * to remind them to back up. Deliberately absent from anything the app creates by itself —
   * the starter lists, folder looks, "seeded" flags — and from UI state.
   */
  evidence?: boolean;
  note?:   string;
}

const exact  = (pattern: string, cls: KeyClass, owner: string, more: Partial<KeyFamily> = {}): KeyFamily =>
  ({ pattern, match: 'exact', class: cls, owner, ...more });
const prefix = (pattern: string, cls: KeyClass, owner: string, more: Partial<KeyFamily> = {}): KeyFamily =>
  ({ pattern, match: 'prefix', class: cls, owner, ...more });

export const KEY_FAMILIES: readonly KeyFamily[] = [
  // ── Lists ──────────────────────────────────────────────────────────────────
  prefix('vq_lists_',        'data', 'utils/word-lists.ts',
    { evidence: true, note: 'vq_lists_<lang>, vq_lists_meta_<lang>, vq_lists_multi, vq_lists_multi_added, vq_lists_multi_meta' }),
  prefix('vq_list_added_',   'data', 'utils/word-lists.ts', { evidence: true, note: 'when each word joined each list' }),
  prefix('vq_listfilter_',   'ui',   'utils/word-lists.ts', { note: 'per-mode Hide/Focus list filter' }),
  prefix('vq_smart_',        'data', 'modes/my-lists/smart-lists.ts', { note: 'saved smart-list rules, per language' }),
  prefix('ml_folders_',      'data', 'modes/my-lists/folders.ts'),
  prefix('ml_folder_style_', 'data', 'modes/my-lists/folders.ts', { note: 'a folder\'s emoji and colour' }),
  prefix('ml_starter_seeded_', 'data', 'modes/my-lists/starter-lists.ts',
    { note: 'flag that the starter lists were created, so they are not re-added; travels with the lists' }),

  // ── Mastery, review schedule, quiz history ────────────────────────────────
  prefix('vq_mastery_',      'data', 'modes/my-lists/mastery.ts',
    { evidence: true, note: 'vq_mastery_<lang>, _dates_<lang>, _scale_<lang>; also the legacy per-list vq_mastery_<lang>_<list>, merged on read' }),
  prefix('vq_srs_',          'data', 'utils/srs.ts', { evidence: true }),
  prefix('vq_history_',      'data', 'utils/session-history.ts', { evidence: true, note: 'quiz sessions per language' }),
  exact ('vq_history_collapsed', 'ui', 'modes/history-mode.ts',
    { note: 'shares the vq_history_ prefix with the data above — the reason classification is by entry, not by prefix' }),
  prefix('vq_misses_',       'data', 'utils/session-history.ts', { evidence: true }),
  prefix('vq_tally_',        'data', 'utils/session-history.ts', { evidence: true }),

  // ── Streaks and goals ─────────────────────────────────────────────────────
  prefix('vq_streak_',       'data', 'utils/streak.ts', { evidence: true, note: 'best, count, daily_lang, goal_history, history, last_date' }),
  prefix('vq_daily_',        'data', 'utils/streak.ts', { note: 'vq_daily_goal[_<lang>] and vq_daily_progress[_<lang>]' }),

  // ── Testing profiles ──────────────────────────────────────────────────────
  prefix('vq_presets_',        'data', 'filters/presets.ts', { evidence: true, note: 'saved Testing Profiles, per mode' }),
  prefix('vq_activeprofile_',  'ui',   'filters/presets.ts'),
  exact ('vq_visual_profiles', 'data', 'filters/visual-profiles.ts', { evidence: true }),

  // ── My Content (user-authored words, questions, edits) ────────────────────
  prefix('uc_',              'data', 'data/user-content.ts',
    { evidence: true, note: 'words_, triviaq_, gbq_, wordoverride_, triviaoverride_, guessblankoverride_, pictures_ … per language' }),
  prefix('uc_glossorder_',   'legacy', 'data/user-content.ts',
    { evidence: true, note: 'first cut of gloss ordering; migrated into word overrides on read' }),

  // ── Chat and an interrupted quiz ──────────────────────────────────────────
  exact ('vq_chat_history',  'data', 'modes/ai-chat/chat-history.ts', { evidence: true }),
  exact ('vq_resume_table',  'ui',   'utils/quiz-resume.ts', { note: 'an unfinished Table quiz; expires after a day' }),

  // ── Current choices in the main controls ──────────────────────────────────
  exact ('vq_lang', 'ui', 'app.ts'),             exact ('vq_mode', 'ui', 'app.ts'),
  exact ('vq_extra_langs', 'ui', 'app.ts'),      exact ('vq_dir', 'ui', 'app.ts'),
  exact ('vq_sort', 'ui', 'app.ts'),             exact ('vq_size', 'ui', 'app.ts'),
  exact ('vq_size_custom', 'ui', 'app.ts'),      exact ('vq_size_mode', 'ui', 'app.ts'),
  exact ('vq_pool_mode', 'ui', 'app.ts'),        exact ('vq_bands', 'ui', 'app.ts'),
  exact ('vq_rank_from', 'ui', 'app.ts'),        exact ('vq_rank_to', 'ui', 'app.ts'),
  exact ('vq_picture_style', 'ui', 'app.ts'),    exact ('vq_trivia_style', 'ui', 'app.ts'),
  exact ('vq_table_style', 'ui', 'modes/table-controls.ts'),
  exact ('vq_table_order', 'ui', 'modes/table-controls.ts'),
  exact ('vq_table_order_sortby', 'ui', 'modes/table-controls.ts'),
  exact ('vq_trivia_category', 'ui', 'app.ts'),  exact ('vq_trivia_difficulty', 'ui', 'app.ts'),
  exact ('vq_trivia_reading_difficulty', 'ui', 'app.ts'), exact ('vq_trivia_reading_length', 'ui', 'app.ts'),
  exact ('vq_guess_blank_difficulty', 'ui', 'app.ts'),
  prefix('vq_classfilter_',  'ui', 'filters/class-filter.ts'),
  prefix('vq_domainfilter_', 'ui', 'filters/domain-filter.ts'),
  prefix('vq_scripttype_',   'ui', 'filters/script-type-filter.ts'),
  prefix('vq_filterchain_',  'ui', 'filters/filter-state.ts'),

  // ── Conjugation choices ───────────────────────────────────────────────────
  exact ('vq_conj_view', 'ui', 'modes/conjugation/index.ts'),
  exact ('vq_conj_order', 'ui', 'modes/conjugation/index.ts'),
  exact ('vq_conj_page_size', 'ui', 'modes/conjugation/index.ts'),
  exact ('vq_conj_match_order', 'ui', 'modes/conjugation/card-match-mode.ts'),
  exact ('vq_conj_match_pairing', 'ui', 'app.ts'),
  exact ('vq_conj_oat_order', 'ui', 'modes/conjugation/one-at-a-time-mode.ts'),
  exact ('vq_conj_random_table_size', 'ui', 'app.ts'),
  exact ('vq_conj_random_table_size_custom', 'ui', 'app.ts'),
  exact ('vq_conj_regularity', 'ui', 'modes/conjugation/controls.ts'),
  exact ('vq_conj_size', 'ui', 'app.ts'),
  exact ('vq_conj_size_custom', 'ui', 'app.ts'),
  prefix('vq_conj_tenses_', 'ui', 'modes/conjugation/controls.ts'),

  // ── My Content and My Lists panels ────────────────────────────────────────
  exact ('vq_mycontent_activetab',  'ui', 'modes/my-content/layout.ts'),
  exact ('vq_mycontent_collapsed',  'ui', 'modes/my-content/layout.ts'),
  exact ('vq_mycontent_langs',      'ui', 'modes/my-content/languages.ts'),
  exact ('ml_browse_filter',        'ui', 'modes/my-lists/browse-panel.ts'),
  exact ('ml_browse_sort',          'ui', 'modes/my-lists/browse-panel.ts'),
  prefix('ml_profile_group_open_',  'ui', 'modes/my-lists/profile-panel.ts'),
  prefix('ml_smart_group_open_',    'ui', 'modes/my-lists/smart-panel.ts'),
  prefix('ml_sidebar_folder_collapsed_',  'ui', 'modes/my-lists/sidebar.ts'),
  prefix('ml_sidebar_section_collapsed_', 'ui', 'modes/my-lists/sidebar.ts'),

  // ── Legacy fallbacks ──────────────────────────────────────────────────────
  prefix('vq_known_', 'legacy', 'utils/word-lists.ts',
    { evidence: true, note: 'the pre-lists "known words" set; migrated into a list named "Known" and deleted on first read' }),
  exact ('s_kid_friendly_mode', 'legacy', 'settings.ts', { note: 'old name of s_simple_mode; read only while the new key is absent' }),
  exact ('s_conj_keep_shape',   'legacy', 'settings.ts', { note: 'old name of s_conj_deselected; read only while the new key is absent' }),

  // ── Housekeeping — never backed up ────────────────────────────────────────
  exact ('s_last_backup_at',    'bookkeeping', 'utils/full-backup.ts'),
  exact ('s_backup_first_seen', 'bookkeeping', 'utils/full-backup.ts'),
  exact ('vq_schema_version',  'bookkeeping', 'utils/storage-migrations.ts',
    { note: 'the layout the stored data is in; a backup records it separately and a restore sets it back' }),

  // ── Settings: everything else under s_ is a preference ────────────────────
  exact ('s_onboarding_seen',  'ui', 'app.ts', { note: 'the welcome card has been shown or dismissed' }),
  exact ('s_starting_level',   'ui', 'ui/level-picker.ts'),
  prefix('s_section_open_',    'ui', 'filters/section-collapse.ts', { note: 'which Settings sections are expanded' }),
  prefix('s_',                 'settings', 'settings.ts',
    { note: 'the ~70 preferences behind the Settings object, plus per-language/tense/element colours' }),

  // ── Unprefixed ────────────────────────────────────────────────────────────
  exact ('theme',          'settings', 'ui/theme-toggle.ts'),
  exact ('filterExpanded', 'ui',       'filters/filter-toggle.ts'),

  // ── Admin panel (a separate page sharing this storage) ────────────────────
  // Not in full backups today — a developer tool's column widths — so kept that way.
  exact ('admin_word_list_page_size',   'ui', 'admin/admin-editor.ts', { backup: false }),
  exact ('admin_table_page_size',       'ui', 'admin/admin-table.ts',  { backup: false }),
  exact ('admin_table_page_size_custom', 'ui', 'admin/admin-table.ts', { backup: false }),
  exact ('admin_table_hidden_columns',  'ui', 'admin/admin-table.ts',  { backup: false }),
  exact ('admin_table_column_order',    'ui', 'admin/admin-table.ts',  { backup: false }),
  exact ('admin_table_col_widths',      'ui', 'admin/admin-table.ts',  { backup: false }),
];

// ── lookup ───────────────────────────────────────────────────────────────────

const EXACT = new Map(KEY_FAMILIES.filter(f => f.match === 'exact').map(f => [f.pattern, f]));
/** Longest prefix first, so a specific family (`uc_glossorder_`) beats its general one (`uc_`). */
const PREFIXES = KEY_FAMILIES.filter(f => f.match === 'prefix').sort((a, b) => b.pattern.length - a.pattern.length);

/**
 * The family a key belongs to, or null for a key this app does not know.
 * An exact key beats any prefix; among prefixes the longest wins.
 */
export function classifyKey(key: string): KeyFamily | null {
  const hit = EXACT.get(key);
  if (hit) return hit;
  return PREFIXES.find(f => key.startsWith(f.pattern)) ?? null;
}

/** What kind of thing this key holds, or null if unknown. */
export function keyClass(key: string): KeyClass | null {
  return classifyKey(key)?.class ?? null;
}

/** Does this key's existence show the learner has done something worth keeping? See KeyFamily.evidence. */
export function isLearnerEvidence(key: string): boolean {
  return classifyKey(key)?.evidence === true;
}

/**
 * Prefixes that mark a key as this app's even when it is not (yet) registered —
 * an older or newer version may have written keys this build has never heard of,
 * and a backup should carry them rather than silently drop a learner's data.
 */
export const APP_PREFIXES: readonly string[] = ['s_', 'vq_', 'ml_', 'uc_'];

/**
 * Should a full backup include this key?
 *  - a registered key: yes, unless it is bookkeeping or marked `backup: false`;
 *  - an unregistered key with one of the app's prefixes: yes (see APP_PREFIXES);
 *  - anything else: no.
 */
export function isBackedUp(key: string): boolean {
  const family = classifyKey(key);
  if (family) return family.backup ?? family.class !== 'bookkeeping';
  return APP_PREFIXES.some(p => key.startsWith(p));
}
