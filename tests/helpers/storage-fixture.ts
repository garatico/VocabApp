/**
 * storage-fixture.ts — Phase 0 of the storage-migration plan: a safety net.
 *
 * Two things every later phase needs:
 *
 *  1. seedRealisticStorage() — fills localStorage by calling the app's OWN
 *     writers (createList, markMastered, recordOutcome, addUserWord, …) under a
 *     frozen clock and seeded randomness. What it produces is what the app
 *     really writes, not something hand-typed to look right, and it is
 *     reproducible byte for byte. A few keys are written by DOM-tangled code
 *     that a node test can't drive (current tab, filter panels…); those are
 *     seeded raw and recorded as `raw` in the fixture so nobody mistakes them
 *     for verified output.
 *
 *  2. readSemanticState() — reads everything back through the app's OWN readers
 *     and returns a plain, normalised object. This is what "the app still sees
 *     the same data" means, independent of how keys are named or laid out. A
 *     migration is correct if, and only if, this object is unchanged.
 *
 * jsdom environment (some writers, e.g. addToList, refresh a count badge in
 * the page), with an in-memory localStorage swapped in. Modules are imported *after* the stub exists because
 * storage.ts probes localStorage lazily but the app modules read it on import.
 */

import { vi } from 'vitest';

// ── the stub ─────────────────────────────────────────────────────────────────

export type Store = Map<string, string>;

export function installStorageStub(): Store {
  const store: Store = new Map();
  // defineProperty, not assignment: under jsdom `localStorage` is an accessor on
  // the window and a plain assignment is silently ignored.
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem:    (k: string) => store.get(k) ?? null,
      setItem:    (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear:      () => { store.clear(); },
      get length() { return store.size; },
      key: (i: number) => [...store.keys()][i] ?? null,
    },
  });
  return store;
}

/** Every key/value, sorted by key so a dump is stable and diffable. */
export function dumpStorage(store: Store): Record<string, string> {
  return Object.fromEntries([...store.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}

/** Replace the store's contents (e.g. load a golden dump into a fresh browser). */
export function loadStorage(store: Store, dump: Record<string, string>): void {
  store.clear();
  for (const [k, v] of Object.entries(dump)) store.set(k, v);
}

// ── determinism ──────────────────────────────────────────────────────────────

/** 2026-03-04 10:30:00 UTC — a Wednesday, mid-month, mid-day: no boundary surprises. */
export const FIXED_NOW = Date.UTC(2026, 2, 4, 10, 30, 0);

/** Freeze time and seed randomness for the duration of `fn`, then restore. */
export async function deterministically<T>(fn: () => Promise<T>, now: number = FIXED_NOW): Promise<T> {
  vi.useFakeTimers({ now, toFake: ['Date'] });
  let seed = 12345;
  const rand = vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;   // numerical-recipes LCG
    return seed / 4294967296;
  });
  let n = 0;
  const uuid = vi.spyOn(globalThis.crypto, 'randomUUID')
    .mockImplementation(() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`);
  try {
    return await fn();
  } finally {
    rand.mockRestore();
    uuid.mockRestore();
    vi.useRealTimers();
  }
}

/** Advance the frozen clock (only valid inside deterministically()). */
const advance = (ms: number): void => { vi.setSystemTime(Date.now() + ms); };
const DAY = 24 * 60 * 60 * 1000;

// ── seeding ──────────────────────────────────────────────────────────────────

export interface SeedResult {
  /** Which keys came from the app's own writers vs. raw seeds. */
  origins: Record<string, 'api' | 'raw'>;
  /**
   * The frozen clock when seeding finished. Anything that depends on "today"
   * (today's words, the streak) must be *read* at this same instant, or a read
   * of the saved dump would disagree with a read of the freshly seeded state.
   */
  endedAt: number;
}

export async function seedRealisticStorage(store: Store): Promise<SeedResult> {
  const origins: Record<string, 'api' | 'raw'> = {};
  let known = new Set<string>(store.keys());
  const claim = (origin: 'api' | 'raw'): void => {
    for (const k of store.keys()) if (!known.has(k)) origins[k] = origin;
    known = new Set(store.keys());
  };
  /** A key the node test can't reach through the app's own writer. */
  const raw = (key: string, value: unknown): void => {
    store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    claim('raw');
  };

  const lists    = await import('../../src/client/utils/word-lists.ts');
  const mastery  = await import('../../src/client/modes/my-lists/mastery.ts');
  const history  = await import('../../src/client/utils/session-history.ts');
  const streak   = await import('../../src/client/utils/streak.ts');
  const presets  = await import('../../src/client/filters/presets.ts');
  const folders  = await import('../../src/client/modes/my-lists/folders.ts');
  const smart    = await import('../../src/client/modes/my-lists/smart-lists.ts');
  const content  = await import('../../src/client/data/user-content.ts');
  const chats    = await import('../../src/client/modes/ai-chat/chat-history.ts');
  const resume   = await import('../../src/client/utils/quiz-resume.ts');
  const { Settings } = await import('../../src/client/settings.ts');
  const visual   = await import('../../src/client/filters/visual-profiles.ts');
  const starter  = await import('../../src/client/modes/my-lists/starter-lists.ts');
  const backup   = await import('../../src/client/utils/full-backup.ts');

  // ── Lists: single-language, with metadata, and a cross-language list ─────────
  lists.createList('spanish', 'Known');
  ['de', 'que', 'no', 'casa', 'perro'].forEach(w => lists.addToList('spanish', 'Known', w));
  advance(DAY);
  lists.createList('spanish', 'Travel');
  ['aeropuerto', 'billete', 'hotel'].forEach(w => lists.addToList('spanish', 'Travel', w));
  lists.setListMeta('spanish', 'Travel', { folders: ['Trips'], hideFrom: ['picture'] } as never);
  lists.createList('french', 'Known');
  ['maison', 'chat'].forEach(w => lists.addToList('french', 'Known', w));
  lists.createMultiList('Animals');
  lists.addToMultiList('Animals', 'perro', 'spanish');
  lists.addToMultiList('Animals', 'chat', 'french');
  lists.setMultiListMeta('Animals', { folders: ['Nature'] } as never);
  lists.saveListFilterState('spanish', { active: true, mode: 'focus', selected: ['Travel'] }, 'table');
  claim('api');

  starter.seedStarterLists('spanish');     // the starter smart lists + their folder look
  claim('api');

  // ── Folders, their look, and a smart list ───────────────────────────────────
  folders.addFolder('single_spanish', 'Trips');
  folders.setFolderStyle('single_spanish', 'Trips', { emoji: '✈️', color: '#2f6fd0' });
  smart.saveSmartRule('spanish', 'Due B1 verbs', {
    ...smart.DEFAULT_SMART_RULE, bands: ['B1'], pos: ['verb'], due: 'yes',
  });
  claim('api');

  // ── Mastery (boolean set, the finer scale, and dates) ───────────────────────
  mastery.markMastered('spanish', ['de', 'que', 'no']);
  advance(DAY);
  mastery.setMasteryLevel('spanish', 'casa', 2);
  mastery.setMasteryLevel('spanish', 'perro', 3);
  mastery.markMastered('french', ['maison']);
  claim('api');

  // ── Quiz history: sessions, misses, tallies and the review schedule ─────────
  const session = (over: Record<string, unknown>): never => ({
    at: new Date(Date.now()).toISOString(), mode: 'table', total: 20, correct: 15,
    unassisted: 14, hints: 1, revealed: 2, seconds: 240, lang: 'spanish', ...over,
  }) as never;
  history.saveSession('spanish', session({}));
  history.recordOutcome('spanish', ['casa', 'billete'], ['de', 'que', 'no', 'perro']);
  advance(DAY);
  history.saveSession('spanish', session({ mode: 'picture', total: 10, correct: 9, unassisted: 9, hints: 0, revealed: 1, seconds: 90 }));
  history.recordOutcome('spanish', ['billete'], ['casa', 'aeropuerto']);
  history.saveSession('french', session({ lang: 'french', mode: 'trivia', total: 5, correct: 3, unassisted: 3, hints: 0, revealed: 0, seconds: 60 }));
  history.recordOutcome('french', ['chat'], ['maison']);
  claim('api');

  // ── Streaks and daily goals ─────────────────────────────────────────────────
  streak.setGoalTarget('words', 10);   // low enough that the activity below *hits* it (writes goal history)
  streak.setGoalTarget('minutes', 15, 'spanish');
  streak.recordActivity('spanish', 15, 240);
  advance(DAY);
  streak.recordActivity('spanish', 9, 90);
  claim('api');

  // ── Testing profiles ────────────────────────────────────────────────────────
  presets.savePreset('table', 'Verbs only', {
    ...presets.BLANK_BUNDLE, classes: { active: true, selected: ['verb'] }, language: 'spanish',
  });
  presets.savePreset('picture', 'Easy pictures', { ...presets.BLANK_BUNDLE });
  presets.setActiveProfile('table', 'Verbs only');
  claim('api');

  // ── My Content: words, questions, overrides, a photo as a data URL ──────────
  const uw = content.addUserWord('spanish', {
    word: 'tapear', translation: 'to eat tapas', extraGlosses: ['to go for tapas'], pos: 'verb', domains: ['food'],
    notes: 'Colloquial.', examples: ['Vamos a tapear.'], difficulty: 2, tags: [], synonyms: [], antonyms: [],
    disambiguator: '', meaningDisambiguators: {},
  });
  content.setWordFields('spanish', 'perro', {
    translation: 'dog', pos: 'noun', notes: 'My note', domains: ['animals'], examples: [], difficulty: 1,
    rank: 250, tags: [], synonyms: [], antonyms: [], disambiguator: '',
  });
  content.setGlossHidden('spanish', 'casa', 'household', true);
  content.addUserTriviaQuestion('spanish', {
    category: 'history', difficulty: 'easy', readingDifficulty: 'easy', readingLength: 'short', domains: ['history'],
    answerType: 'year', questionTarget: '¿En qué año llegó Colón?', questionEn: 'What year did Columbus arrive?',
    answersTarget: ['1492'], answersEn: ['1492'],
  });
  content.addUserGuessBlankQuestion('spanish', {
    category: 'animal', difficulty: 'easy', cluesTarget: ['Ladra', 'Es un mejor amigo'], cluesEn: ['It barks', 'A best friend'],
    answerTarget: 'perro', answerEn: 'dog',
  });
  // 1x1 transparent PNG — the shape an uploaded photo takes (a data: URL in localStorage).
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  // Edits to the built-in trivia / guess-the-blank questions (keyed by the built-in's own id).
  content.setTriviaQuestionOverride('spanish', 'builtin-tq-1', { difficulty: 'hard', questionEn: 'My rewording' });
  content.setGuessBlankQuestionOverride('spanish', 'builtin-gb-1', { difficulty: 'medium', answerEn: 'my answer' });
  content.setPictureOverride('spanish', 'perro', PNG);
  content.setPictureOverride('spanish', 'gato', 'https://example.com/gato.jpg');
  claim('api');
  void uw;

  // ── AI chat history and an interrupted quiz ─────────────────────────────────
  chats.saveChat({ title: 'Ordering food', messages: [{ role: 'user', content: 'Hola' }] } as never);
  resume.saveResume({
    savedAt: Date.now(), lang: 'spanish', columns: 2, direction: 'target-en', pageIndex: 1, elapsed: 75,
    words: [{ word: 'de' }, { word: 'que' }],
    state: [['spanish:de', { value: 'of', disabled: true, stateClass: 'correct', dir: 'target-en', hintsShown: 0, selected: false }]],
  });
  claim('api');

  // ── Settings (67 keys behind one API): flip a spread of them ────────────────
  Settings.setSimpleMode(false);
  Settings.setShowExperimentalModes(true);
  Settings.setFontSize('large');
  Settings.setConjRegularityScope('beforeTopN');
  claim('api');

  visual.saveVisualProfile('Night reading', { theme: 'dark', fontSize: 'large' });
  // Backup bookkeeping: first sight of data starts the clock, a download stamps the time.
  backup.backupReminderDue(Date.now());
  backup.snoozeBackupReminder(Date.now());
  claim('api');

  // ── Raw seeds: keys whose writers live in DOM code a node test can't drive ──
  raw('s_table_page_size', '50');
  raw('s_lang_indicator', 'flag');
  raw('s_onboarding_seen', '1');
  raw('s_starting_level', 'comfortable');
  raw('theme', 'dark');
  raw('filterExpanded', 'false');
  raw('vq_lang', 'spanish');
  raw('vq_mode', 'table');
  raw('vq_size', '250');
  raw('vq_size_mode', 'window');
  raw('vq_sort', 'adaptive');
  raw('vq_dir', 'target-en');
  raw('vq_pool_mode', 'band');
  raw('vq_bands', 'B1,B2');
  raw('vq_rank_from', '1');
  raw('vq_rank_to', '1000');
  raw('vq_table_style', 'standard');
  raw('vq_picture_style', 'click');
  raw('vq_trivia_style', 'choice');
  raw('vq_conj_view', 'grid');
  raw('vq_extra_langs', ['french']);
  raw('vq_history_collapsed', ['trouble']);
  raw('vq_mycontent_activetab', 'words');
  raw('vq_mycontent_langs', ['spanish']);
  raw('vq_filterchain_domain', 'true');
  raw('ml_browse_sort', 'rank');
  raw('ml_sidebar_section_collapsed_smart', 'true');
  raw('s_section_open_bodyTable', 'true');

  // ── Every remaining setting, at a valid non-default value ────────────────────
  // Written raw (their setters are private to DOM handlers). Each is read back by
  // Settings.get…, so losing or renaming one shows up in the semantic snapshot.
  for (const [k, v] of Object.entries(SETTINGS_NON_DEFAULT)) raw('s_' + k, v);

  // ── UI state and per-mode choices (opaque: their readers are DOM-bound) ──────
  for (const [k, v] of Object.entries(UI_STATE_RAW)) raw(k, v);

  return { origins, endedAt: Date.now() };
}

/** Settings not reachable through a public setter, each at a non-default value. */
const SETTINGS_NON_DEFAULT: Record<string, string> = {
  abbreviate_grammar_hint: 'true', advanced_mode: 'true', answer_gloss_count: '3', autofill_enabled: 'true',
  chinese_script: 'pinyin', confirm_remove_word_override: 'false', conj_deselected: 'grey',
  conj_hint_mode: 'none', conj_page_size: '25', conj_show_timer: 'false', expand_gloss_on_match: 'false',
  filter_linking_enabled: 'false', function_word_marker: 'both', gender_indicator_style: 'dot',
  gender_indicator_visibility: 'hinted', guess_blank_max_attempts: '2', hint_mode: 'first-letter',
  hint_multi_gloss: 'true', history_enabled: 'false', inline_profile_editing: 'true', match_mode: 'strict',
  max_sessions_kept: '50', my_content_page_size: '10', picture_source_emoji: 'false',
  picture_source_photos: 'false', picture_source_svgs: 'false', progress_bar_hint_breakdown: 'true',
  progress_bar_percent_mode: 'missed', question_gloss_count: '3', show_admin_panel: 'true',
  show_disambiguator_hover: 'false', show_disambiguator_meaning: 'false', show_disambiguator_word: 'true',
  show_gender_article: 'true', show_pinyin: 'false', show_pinyin_gloss: 'false', show_streak_widget: 'false',
  show_visual_profiles: 'true', streak_widget_format: 'number-only', swear_filter_enabled: 'true',
  table_cols: '3', table_hint_button: 'true', table_reveal_button: 'false', table_row_density: 'compact',
  table_show_rank: 'false', table_show_timer: 'false', table_show_word_markers: 'false',
  table_timed_quiz: 'true', table_timed_quiz_minutes: '15', track_hinted_correct: 'false',
  track_hinted_missed: 'false', track_hinted_revealed: 'false', typo_tolerance: 'high', ui_language: 'spanish',
  // dynamic families: <prefix><language | tense | person | part of speech | element>
  lang_color_spanish: '#c0392b', lang_flag_spanish: 'es', tense_hue_present: '120', person_hue_0: '10',
  pos_hue_verb: '200', table_color_correct: '#2e7d32', gender_color_masculine: '#3366cc',
};

/** Per-mode choices and panel state written by DOM handlers. */
const UI_STATE_RAW: Record<string, string> = {
  vq_classfilter_table: JSON.stringify({ active: true, selected: ['verb'] }),
  vq_domainfilter_table: JSON.stringify({ active: true, selected: ['food'] }),
  vq_scripttype_table: JSON.stringify({ active: true, selected: [] }),
  vq_conj_match_order: 'rank', vq_conj_match_pairing: 'infinitive', vq_conj_oat_order: 'shuffle',
  vq_conj_order: 'rank', vq_conj_page_size: '10', vq_conj_random_table_size: '5',
  vq_conj_random_table_size_custom: '7', vq_conj_regularity: 'all', vq_conj_size: '100',
  vq_conj_size_custom: '80', vq_conj_tenses_spanish: JSON.stringify(['present', 'preterite']),
  vq_guess_blank_difficulty: 'easy', vq_mycontent_collapsed: JSON.stringify(['trivia']),
  vq_size_custom: '750', vq_table_order: 'shuffle', vq_table_order_sortby: 'meaning',
  vq_trivia_category: 'history', vq_trivia_difficulty: 'easy', vq_trivia_reading_difficulty: 'easy',
  vq_trivia_reading_length: 'short',
  // The admin panel is its own page, but shares this storage and this gateway.
  admin_word_list_page_size: '50', admin_table_hidden_columns: JSON.stringify(['notes']),
  admin_table_column_order: JSON.stringify(['word', 'translation']), admin_table_col_widths: JSON.stringify({ word: 120 }),
  admin_table_page_size: '100', admin_table_page_size_custom: '75',
  ml_browse_filter: JSON.stringify({}), ml_profile_group_open_table: 'true',
  ml_sidebar_folder_collapsed_single_Trips: 'true', ml_smart_group_open_Starter: 'true',
};

// ── the semantic reader ──────────────────────────────────────────────────────

const LANGS = ['spanish', 'french', 'german'] as const;
const MODES = ['table', 'picture', 'trivia', 'conjugation', 'mylists'] as const;

/** Sorted keys / sorted arrays so two equal states always serialise identically. */
function canon<T>(v: T): T {
  if (Array.isArray(v)) return v.map(canon) as unknown as T;
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, canon(x)])) as T;
  }
  return v;
}

export async function readSemanticState(opaqueKeys: readonly string[] = []): Promise<Record<string, unknown>> {
  const lists    = await import('../../src/client/utils/word-lists.ts');
  const mastery  = await import('../../src/client/modes/my-lists/mastery.ts');
  const history  = await import('../../src/client/utils/session-history.ts');
  const srs      = await import('../../src/client/utils/srs.ts');
  const streak   = await import('../../src/client/utils/streak.ts');
  const presets  = await import('../../src/client/filters/presets.ts');
  const folders  = await import('../../src/client/modes/my-lists/folders.ts');
  const smart    = await import('../../src/client/modes/my-lists/smart-lists.ts');
  const content  = await import('../../src/client/data/user-content.ts');
  const chats    = await import('../../src/client/modes/ai-chat/chat-history.ts');
  const resume   = await import('../../src/client/utils/quiz-resume.ts');
  const { Settings } = await import('../../src/client/settings.ts');
  const visual   = await import('../../src/client/filters/visual-profiles.ts');
  const backup   = await import('../../src/client/utils/full-backup.ts');

  const perLang: Record<string, unknown> = {};
  for (const lang of LANGS) {
    const names = lists.getListNames(lang);
    perLang[lang] = {
      lists: Object.fromEntries(names.map(n => [n, {
        words: [...lists.getList(lang, n)].sort(),
        meta: lists.getListMeta(lang, n),
        added: Object.fromEntries(lists.getList(lang, n).map(w => [w, lists.getAddedDate(lang, n, w)])),
      }])),
      listFilter: Object.fromEntries(MODES.map(m => [m, lists.getListFilterState(lang, m)])),
      mastered: [...mastery.getMastered(lang)].sort(),
      masteryLevels: mastery.getMasteryLevels(lang),
      masteredDates: Object.fromEntries([...mastery.getMastered(lang)].map(w => [w, mastery.getMasteredDate(lang, w)])),
      srs: srs.srsAllEntries(lang),
      sessions: history.getSessions(lang),
      misses: history.getMisses(lang),
      tallies: history.getWordTallies(lang),
      smartLists: smart.getSmartLists(lang),
      userWords: content.getUserWords(lang),
      userTrivia: content.getUserTriviaQuestions(lang),
      userGuessBlank: content.getUserGuessBlankQuestions(lang),
      triviaOverrides: content.getTriviaQuestionOverrides(lang),
      guessBlankOverrides: content.getGuessBlankQuestionOverrides(lang),
      pictureOverrides: content.getPictureOverrides(lang),
      wordOverrides: content.getWordOverrides(lang),
      goals: streak.getGoals(lang),
    };
  }

  const multi = Object.fromEntries(lists.getMultiListNames().map(n => [n, {
    entries: lists.getMultiList(n), meta: lists.getMultiListMeta(n),
  }]));

  const dates = streak.getStreakHistory();
  const settings: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(Settings as unknown as Record<string, unknown>)) {
    if (!name.startsWith('get') || typeof fn !== 'function' || (fn as (...a: unknown[]) => unknown).length > 0) continue;
    try { settings[name] = (fn as () => unknown)(); } catch (e) { settings[name] = `THREW: ${(e as Error).message}`; }
  }

  // JSON round-trip: the snapshot is compared against a checked-in file, and JSON
  // has no `undefined` — without this, a field that is merely absent on disk would
  // differ from one that is present-but-undefined in memory.
  return JSON.parse(JSON.stringify(canon({
    perLang,
    multiLists: multi,
    folders: {
      single_spanish: { registry: folders.getFolderRegistry('single_spanish'), trips: folders.getFolderStyle('single_spanish', 'Trips') },
      smart_spanish: { registry: folders.getFolderRegistry('smart_spanish') },
    },
    visualProfiles: Object.fromEntries(visual.listVisualProfiles().map(n => [n, visual.getVisualProfile(n)])),
    // Keys whose readers are DOM-bound: what matters is that they survive unchanged.
    opaque: Object.fromEntries(opaqueKeys.map(k => [k, localStorage.getItem(k)])),
    backup: { lastBackupAt: backup.lastBackupAt() },
    streak: {
      current: streak.getStreak(), best: streak.getBestStreak(), history: dates,
      dailyStats: Object.fromEntries(dates.map(d => [d, streak.getDailyLangStats(d)])),
      goals: streak.getGoals(), todayWords: streak.getTodayProgress(), todayMinutes: streak.getTodayMinutes(),
    },
    presets: Object.fromEntries(presets.modesWithPresets().map(m => [m, Object.fromEntries(
      presets.listPresets(m).map(n => [n, { bundle: presets.getPreset(m, n), active: presets.getActiveProfile(m) === n }]))])),
    chats: chats.getSavedChats(),
    resume: resume.loadResume(),
    settings,
  }))) as Record<string, unknown>;
}
