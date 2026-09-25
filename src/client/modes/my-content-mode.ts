import { downloadUserContent, applyUserContentImport } from '../data/user-content.ts';
import { languageInfo } from '../data/languages.ts';
import { createFlagImg } from '../ui/flag-icon.ts';
import { createWordEditor } from '../ui/word-editor/word-editor.ts';
import { createMyContentAdapter, type MyContentAdapterState } from './my-content/word-editor-adapter.ts';
import { downloadVocabCsv } from './my-content/csv-export.ts';
import { buildGuessBlankSection } from './my-content/guess-blank.ts';
import { buildLanguagePicker, getSelectedLangs } from './my-content/languages.ts';
import { buildContentTabs, getActiveTab, getCollapsedSections, setActiveTab, setCollapsedSections } from './my-content/layout.ts';
import { buildPicturesSection } from './my-content/pictures.ts';
import { el } from './my-content/shared.ts';
import { buildTriviaSection } from './my-content/trivia.ts';

/**
 * my-content-mode.ts — "My Content" tab: a lite, client-only admin panel.
 *
 * Lets a learner add their own vocabulary words, trivia questions and
 * picture-quiz pictures, and edit or hide parts of real vocabulary words, all
 * stored in this browser's localStorage via data/user-content.ts — never
 * written to the real SQLite database, and never sent anywhere. This is
 * deliberately separate from the real admin panel (admin.html /
 * src/client/admin/*, src/server/routes/admin*), which is
 * dev+localhost+auth gated and writes the actual database; nothing here
 * touches that code path.
 *
 * Every add form is multi-language: one row per app language (LANGUAGES), so
 * adding "cat" can fill in gato/chat/gatto/Katze/kat/猫 in one pass rather
 * than repeating the whole form once per language — and each row is always
 * labeled by language, so it's never ambiguous which language an entry (new
 * or already-added) belongs to. Only rows actually filled in produce an
 * entry; the rest are just left blank.
 *
 * Rebuilt fresh on every visit to the tab (see app.ts's onActivate.myContent),
 * the same way History and My Lists are — cheap, and it means an edit made
 * and then navigated away from is never shown stale. Each section's own
 * collapse state and the search/pictures/word-editor sub-panels' overrides
 * lists still update in place rather than going through that rebuild — see
 * buildSection and the "…rebuilds itself in place" comments below — since a
 * full rebuild on every keystroke-adjacent change would also collapse
 * sections and clear whatever search was in progress.
 */

// ── Cross-tab navigation: "Edit in My Content" ──────────────────────────────
//
// Table mode's word-info popover can send a learner straight to a word's
// editor in the "Edit an Existing Word" subsection below, the same one a
// manual search there opens. There's no direct call from that popover into
// this module's render function (the tab switch it triggers goes through
// app.ts's onActivate, which calls renderMyContent with no word to focus) —
// so the target is stashed here instead and picked up the next time
// renderMyContent runs, which openWordInMyContentEditor forces immediately
// by switching the language (if needed) and clicking the tab.
let pendingFocusWord: { lang: string; word: string } | null = null;

/** Switches to My Content, switches to the Words tab and expands its "Edit
 *  an Existing Word" subsection, and opens `word`'s editor row — the entry
 *  point Table mode's word-info popover uses. Switches the global language
 *  picker to the word's own language first when it differs, the same way
 *  presets.ts's applyBundle does, since My Content's word editor otherwise
 *  defaults to whatever language was already selected. */
export function openWordInMyContentEditor(lang: string, word: string): void {
  pendingFocusWord = { lang, word };
  const langSelect = document.getElementById('langSelect') as HTMLSelectElement | null;
  if (langSelect && langSelect.value !== lang) {
    langSelect.value = lang;
    langSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  document.querySelector<HTMLButtonElement>('.mode-tab[data-mode="myContent"]')?.click();
}

export function renderMyContent(container: HTMLElement, lang: string): void {
  container.innerHTML = '';

  const focusWord = pendingFocusWord && pendingFocusWord.lang === lang ? pendingFocusWord : null;
  pendingFocusWord = null;
  if (focusWord) {
    // Force the Words tab active and its "Edit an Existing Word" subsection
    // open regardless of whatever was active/collapsed before — same effect
    // as clicking there manually, and it sticks the same way a manual click
    // would (see buildContentTabs/buildCollapsible), which is fine: a
    // learner who got sent here to edit a word almost certainly wants to
    // land straight on it again next visit too.
    setActiveTab('words');
    const keys = getCollapsedSections();
    keys.delete('words-edit');
    setCollapsedSections(keys);
  }

  const wrap = el('div', 'mc-wrap');

  const header = el('div', 'mc-header');
  header.appendChild(el('h2', 'mc-title', 'My Content'));
  header.appendChild(el('p', 'mc-desc',
    'Add your own words, trivia questions and pictures — stored only in this browser, never uploaded or shared with other learners.'));

  const backupRow = el('div', 'mc-backup-row');
  const exportBtn = el('button', 'mc-btn mc-btn--secondary', 'Download my content');
  exportBtn.type = 'button';
  exportBtn.addEventListener('click', () => downloadUserContent());
  const exportCsvBtn = el('button', 'mc-btn mc-btn--secondary', 'Export vocabulary (CSV)');
  exportCsvBtn.type = 'button';
  exportCsvBtn.title = 'Download the current language\'s full vocabulary as CSV — works offline, no server needed';
  exportCsvBtn.addEventListener('click', () => { void downloadVocabCsv(lang); });
  const importBtn = el('button', 'mc-btn mc-btn--secondary', 'Load a file…');
  importBtn.type = 'button';
  const importInput = el('input', undefined) as HTMLInputElement;
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.style.display = 'none';
  const importStatus = el('span', 'mc-import-status');
  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importStatus.textContent = applyUserContentImport(String(reader.result));
        importStatus.classList.remove('mc-import-status--error');
        renderMyContent(container, lang);
      } catch (err) {
        importStatus.textContent = err instanceof Error ? err.message : 'Could not read that file.';
        importStatus.classList.add('mc-import-status--error');
      }
    };
    reader.readAsText(file);
  });
  const selectedLangs = getSelectedLangs(lang);
  // Same row as the backup/restore buttons — one toolbar for "manage this
  // tab" controls, rather than the language picker sitting alone in its own
  // row below. mc-backup-row's flex-wrap already handles a narrow viewport.
  backupRow.append(
    exportBtn, exportCsvBtn, importBtn, importInput, importStatus,
    buildLanguagePicker(selectedLangs, () => renderMyContent(container, lang)),
  );
  header.appendChild(backupRow);
  wrap.appendChild(header);

  wrap.appendChild(buildContentTabs([
    {
      key: 'words', title: 'Words',
      description: 'Search the vocabulary — and words you\'ve added — to change how a word reads in this browser: hide, reorder or add senses, or override the translation, part of speech, notes and more. Use + New Word to add one of your own. Nothing here changes the real vocabulary.',
      body: buildSharedWordEditor(lang, focusWord ?? undefined),
    },
    {
      key: 'trivia', title: 'Trivia Questions',
      description: 'Added to the Trivia tab\'s question bank, and included in its Difficulty/Reading/Domain filters. Fill in the question and answer for whichever languages you\'re writing it in — each becomes its own entry in that language\'s bank.',
      body: buildTriviaSection(lang, selectedLangs),
    },
    {
      key: 'guessBlank', title: 'Guess the Blank',
      description: 'Added to Guess the Blank\'s question bank. Write 2-4 clues per question, vaguest first — the mode reveals them one at a time as the learner asks for another hint.',
      body: buildGuessBlankSection(lang, selectedLangs),
    },
    {
      key: 'pictures', title: 'Pictures',
      description: 'Search a language\'s vocabulary for words that already have a photo, icon or emoji, then choose which one Picture Quiz should show for that word. Words with none of their own can still get a custom picture — a pasted URL, an uploaded file, or a pick from the bundled photo library.',
      body: buildPicturesSection(lang),
    },
  ], focusWord ? 'words' : getActiveTab()));

  container.appendChild(wrap);
}

// ── Words ────────────────────────────────────────────────────────────────────
//
// One editor for everything about a word: search the real vocabulary (and words
// you added), edit it, or add a new one — all as a client-only overlay, never
// touching the real data. It is the same editor the Admin panel uses.

/**
 * The shared Word Editor (ui/word-editor/) — the same editor the Admin panel
 * uses — pointed at My Content's storage. Everything it saves is an override
 * held in this browser; the real vocabulary is never touched (see
 * word-editor-adapter.ts for how an edit becomes an override).
 */
function buildSharedWordEditor(currentLang: string, focusWord?: { lang: string; word: string }): HTMLElement {
  const state: MyContentAdapterState = { scope: 'all' };
  const adapter = createMyContentAdapter(state);

  // Which words the list shows — sits at the end of the editor's filter bar.
  const scopeToggle = el('div', 'sort-order-toggle mc-we-scope');
  (['all', 'edited', 'custom'] as const).forEach(scope => {
    const b = el('button', `sort-order-btn${scope === state.scope ? ' active' : ''}`,
      scope === 'all' ? 'All' : scope === 'edited' ? 'Edited' : 'Added');
    b.type = 'button';
    b.title = scope === 'all' ? 'Every word' : scope === 'edited' ? 'Only words you have edited' : 'Only words you added';
    b.addEventListener('click', () => {
      state.scope = scope;
      scopeToggle.querySelectorAll('.sort-order-btn').forEach(x => x.classList.toggle('active', x === b));
      editor.reload();
    });
    scopeToggle.appendChild(b);
  });

  const editor = createWordEditor({
    adapter,
    idPrefix: 'mcwe-',
    initialLang: focusWord?.lang ?? currentLang,
    langFlag: lang => createFlagImg(languageInfo(lang).flagCountry, languageInfo(lang).label),
    filterBarExtra: scopeToggle,
    pageSize: 50,
    // What the original editor allowed: linguistic data and emoji are the real
    // vocabulary's own and are shown, not editable, here.
    readOnlyFields: ['ipa', 'syllables', 'gender', 'plural', 'infinitive', 'register', 'reflexive', 'corpusFrequency', 'emoji'],
    relationFields: true,
    meaningNotes: true,
    reorderGlosses: true,
    trackOriginal: true,
  });

  const wrap = el('div', 'word-editor mc-we');
  editor.mount(wrap);
  // Language list, POS and domain values arrive once the vocabulary is loaded;
  // the first page of words loads at the same time.
  void (async () => {
    await editor.load();
    editor.applyMeta(await adapter.getMeta());
    if (focusWord) {
      // Arrived from a word elsewhere in the app ("Edit in My Content"): search for it.
      const search = wrap.querySelector<HTMLInputElement>('input[type="text"]');
      if (search) { search.value = focusWord.word; search.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  })();
  return wrap;
}
