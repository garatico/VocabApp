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

import {
  getUserWords, addUserWord, removeUserWord, toWord, type UserWord,
  getUserTriviaQuestions, addUserTriviaQuestion, removeUserTriviaQuestion,
  getUserGuessBlankQuestions, addUserGuessBlankQuestion, removeUserGuessBlankQuestion,
  getPictureOverrides, getPictureOverride, setPictureOverride, removePictureOverride,
  isImageOverride,
  getWordOverrides, getWordOverride, type WordOverride,
  setWordFields, setGlossHidden, setGlossOrderOverride, removeWordOverride, applyGlossOrder,
  addGlossOverride, removeAddedGloss, setGlossMeaningNote,
  downloadUserContent, applyUserContentImport,
} from '../data/user-content.ts';
import type { TriviaQuestion, TriviaCategory, TriviaDifficulty, ReadingDifficulty, ReadingLength, AnswerType } from '../data/trivia-questions.ts';
import type { GuessBlankQuestion, BlankCategory, BlankDifficulty } from '../data/guess-blank-questions.ts';
import { LANGUAGES, type LanguageInfo } from '../data/languages.ts';
import { getStockImages, getFallbackImageUrl, getFallbackSvgUrl, getFallbackEmoji } from '../data/visual-map.ts';
import { loadWords, loadRawWords } from '../data/data-loader.ts';
import { buildLangBadge } from '../ui/lang-badge.ts';
import { readString, readJson, writeJson, isStringArray } from '../utils/storage.ts';
import { foldKey } from '../utils/match.ts';
import { fillHighlighted } from '../utils/dom.ts';
import { pageSlice, pageCountFor } from './table-controls.ts';
import type { Word } from '../types.ts';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function field(labelText: string, input: HTMLElement): HTMLElement {
  const wrap = el('label', 'mc-field');
  wrap.appendChild(el('span', 'mc-field-label', labelText));
  wrap.appendChild(input);
  return wrap;
}

function textInput(placeholder = '', value = ''): HTMLInputElement {
  const i = el('input', 'mc-input');
  i.type = 'text';
  i.placeholder = placeholder;
  i.value = value;
  return i;
}

function selectInput(options: readonly string[], value?: string): HTMLSelectElement {
  const s = el('select', 'mc-input');
  for (const o of options) {
    const opt = el('option', undefined, o);
    opt.value = o;
    s.appendChild(opt);
  }
  if (value) s.value = value;
  return s;
}

function csv(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

/** One example sentence per line, rather than comma-separated — a sentence
 *  routinely contains commas of its own. */
function lines(s: string): string[] {
  return s.split('\n').map(x => x.trim()).filter(Boolean);
}

const WORD_DIFFICULTY_OPTIONS = ['', '1', '2', '3', '4', '5'] as const;

function textArea(placeholder = '', value = ''): HTMLTextAreaElement {
  const t = document.createElement('textarea');
  t.className = 'mc-input mc-textarea';
  t.rows = 2;
  t.placeholder = placeholder;
  t.value = value;
  return t;
}

// ── Shared paginated-list pager (Add a New Word / Edit an Existing Word) ────
//
// Same page-size math as Table mode (table-controls.ts's own pageSlice/
// pageCountFor), so a list here paginates exactly the way that one does —
// not reinvented, just reused for a much shorter list.

const MC_LIST_PAGE_SIZE = 20;

interface ListPager {
  row: HTMLElement;
  /** Repaints prev/next/status for `page` (already clamped by the caller)
   *  against `totalItems`. */
  sync: (page: number, totalItems: number) => void;
}

function buildListPager(onPageChange: (page: number) => void): ListPager {
  const row = el('div', 'mc-list-pager');
  row.hidden = true;

  const prevBtn = el('button', 'mc-btn mc-btn--sm', '← Prev');
  prevBtn.type = 'button';
  const status = el('span', 'mc-list-pager-status');
  const nextBtn = el('button', 'mc-btn mc-btn--sm', 'Next →');
  nextBtn.type = 'button';

  let currentPage = 0;
  prevBtn.addEventListener('click', () => onPageChange(Math.max(0, currentPage - 1)));
  nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
  row.append(prevBtn, status, nextBtn);

  function sync(page: number, totalItems: number): void {
    currentPage = page;
    const pages = pageCountFor(totalItems, MC_LIST_PAGE_SIZE);
    row.hidden = pages <= 1;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= pages - 1;
    const first = totalItems === 0 ? 0 : page * MC_LIST_PAGE_SIZE + 1;
    const last  = Math.min((page + 1) * MC_LIST_PAGE_SIZE, totalItems);
    status.textContent = totalItems > 0 ? `${first}–${last} of ${totalItems}` : '';
  }
  return { row, sync };
}

// ── Vocabulary CSV export ────────────────────────────────────────────────────
//
// A client-side twin of routes/admin/export.ts's CSV, built from loadWords()
// (already-loaded, overrides-applied vocab) rather than a server query — the
// packaged Tauri build has no Express behind it at all (vocab-source.ts), and
// the real Admin panel is dev+localhost-gated regardless, so that route was
// never reachable there. This one needs nothing but what the page already has.

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

const VOCAB_CSV_HEADERS = [
  'rank', 'word', 'translation', 'glosses', 'pos', 'difficulty', 'tags',
  'notes', 'examples', 'ipa', 'frequency_band', 'gender', 'plural',
  'infinitive', 'reflexive', 'register',
];

function buildVocabCsv(words: Word[]): string {
  const lines = [VOCAB_CSV_HEADERS.join(',')];
  for (const w of words) {
    lines.push([
      csvEscape(w.rank ?? ''),
      csvEscape(w.word),
      csvEscape(w.translation),
      csvEscape(w.glosses.join('|')),
      csvEscape(w.pos),
      csvEscape(w.difficulty),
      csvEscape(w.tags.join('|')),
      csvEscape(w.notes),
      csvEscape(w.examples.join('|')),
      csvEscape(w.linguistic?.ipa),
      csvEscape(w.frequency?.band),
      csvEscape(w.linguistic?.gender),
      csvEscape(w.linguistic?.plural),
      csvEscape(w.linguistic?.infinitive),
      csvEscape(w.linguistic?.reflexive ? 'true' : ''),
      csvEscape(w.linguistic?.register),
    ].join(','));
  }
  return lines.join('\n');
}

async function downloadVocabCsv(lang: string): Promise<void> {
  const words = await loadWords(lang);
  const blob  = new Blob([buildVocabCsv(words)], { type: 'text/csv;charset=utf-8' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `${lang}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Language selection ──────────────────────────────────────────────────────
//
// Which languages the add forms show a row for. Shared across Words/Trivia —
// it's "which languages am I working in right now" for the whole tab, not a
// per-section choice — and persisted so it doesn't need re-picking on every
// visit. Defaults to just the language currently selected in the main
// controls bar, rather than all seven, since most learners only study one or
// two at a time.

const LANG_SELECTION_KEY = 'vq_mycontent_langs';

function getSelectedLangs(currentLang: string): Set<string> {
  // No key at all means "never chosen yet" — default to the current study
  // language. A key holding `[]` means the learner deliberately deselected
  // every chip, which has to stay empty rather than snapping back to the
  // default on the next render (languageRows' own empty-state placeholder
  // covers that case).
  if (readString(LANG_SELECTION_KEY) === null) return new Set([currentLang]);
  const stored = readJson<string[]>(LANG_SELECTION_KEY, [], isStringArray)
    .filter(name => LANGUAGES.some(info => info.name === name));
  return new Set(stored);
}

function setSelectedLangs(langs: Set<string>): void {
  writeJson(LANG_SELECTION_KEY, [...langs]);
}

/**
 * The chip row that picks which languages the forms below show a row for.
 * Toggling a chip persists the change and re-renders the whole tab — the
 * same cheap-rebuild pattern every other action in this file uses.
 */
function buildLanguagePicker(currentLang: string, selected: Set<string>, onChange: () => void): HTMLElement {
  const wrap = el('div', 'mc-lang-picker');
  wrap.appendChild(el('span', 'mc-lang-picker-label', 'Add content in'));
  const chips = el('div', 'mc-lang-picker-chips');
  for (const info of LANGUAGES) {
    const chip = el('button', 'mc-lang-chip', info.label);
    chip.type = 'button';
    if (selected.has(info.name)) chip.classList.add('active');
    if (info.name === currentLang) chip.classList.add('mc-lang-chip--current');
    chip.addEventListener('click', () => {
      if (selected.has(info.name)) selected.delete(info.name);
      else selected.add(info.name);
      setSelectedLangs(selected);
      onChange();
    });
    chips.appendChild(chip);
  }
  wrap.appendChild(chips);
  return wrap;
}

/**
 * One row per selected language, each labeled and holding whatever
 * per-language input(s) `makeRow` builds — the shared shape every "add"
 * form's language section uses. `currentLang` gets a highlighted row, since
 * that's the language the learner is most likely filling in first. `makeRow`
 * returns both the element to place in the row (a single input, or a
 * wrapper `<div>` around several) and whatever value the caller needs back
 * to read the row's input(s) on submit.
 */
function languageRows<T>(
  currentLang: string,
  selectedLangs: Set<string>,
  makeRow: (info: LanguageInfo) => { el: HTMLElement; value: T },
): { rows: HTMLElement; values: Map<string, T> } {
  const rows = el('div', 'mc-lang-rows');
  const values = new Map<string, T>();
  const langs = LANGUAGES.filter(info => selectedLangs.has(info.name));
  if (langs.length === 0) {
    rows.appendChild(el('p', 'mc-empty', 'Choose at least one language above to add content.'));
    return { rows, values };
  }
  for (const info of langs) {
    const row = el('div', 'mc-lang-row');
    if (info.name === currentLang) row.classList.add('mc-lang-row--current');
    row.appendChild(el('span', 'mc-lang-row-label', info.label));
    const { el: inputEl, value } = makeRow(info);
    row.appendChild(inputEl);
    values.set(info.name, value);
    rows.appendChild(row);
  }
  return { rows, values };
}

// ── Collapsible sections ─────────────────────────────────────────────────────
//
// Words/Trivia/Pictures each run long — collapsing whichever aren't in use
// right now is the difference between one screenful and several. Collapse
// state persists per section key (not tied to renderMyContent's own rebuild)
// so it survives the tab's cheap rebuild-everything-on-every-change pattern;
// sections start expanded, same as before this existed, and stay however a
// learner last left them.
//
// The Words section itself nests two of these — "Add a new word" and "Edit
// an existing word" (buildSubsection) — one visual step down from a
// top-level section (buildSection): a <div>/<h4> instead of a <section>/<h3>,
// sharing every key in the same COLLAPSED_SECTIONS_KEY set as long as each
// caller picks its own unique key ('words-add'/'words-edit' vs. 'words').

const COLLAPSED_SECTIONS_KEY = 'vq_mycontent_collapsed';

function getCollapsedSections(): Set<string> {
  return new Set(readJson<string[]>(COLLAPSED_SECTIONS_KEY, [], isStringArray));
}

function setCollapsedSections(keys: Set<string>): void {
  writeJson(COLLAPSED_SECTIONS_KEY, [...keys]);
}

interface CollapsibleClasses {
  wrap: string; header: string; chevron: string; title: string; body: string; desc: string; collapsedModifier: string;
}

/**
 * Shared toggle/persistence behind buildSection and buildSubsection below —
 * only the tag names, heading level and class names differ between a
 * top-level section and one nested inside it, so the collapse mechanics
 * (and the storage key both read from) can't drift apart between the two.
 *
 * Wraps `body` in a clickable header (title + chevron) that shows or hides
 * it in place — deliberately not a rebuild, so a search in progress or a
 * half-filled form inside `body` survives collapsing the wrapper around it.
 */
function buildCollapsible(
  wrapTag: 'section' | 'div', titleTag: 'h3' | 'h4', classes: CollapsibleClasses,
  key: string, title: string, description: string, body: HTMLElement,
): HTMLElement {
  const wrap = document.createElement(wrapTag);
  wrap.className = classes.wrap;

  const header = el('div', classes.header);
  header.setAttribute('role', 'button');
  header.tabIndex = 0;
  header.append(el('span', classes.chevron, '▾'), el(titleTag, classes.title, title));

  const bodyWrap = el('div', classes.body);
  bodyWrap.append(el('p', classes.desc, description), body);

  function applyState(collapsed: boolean): void {
    bodyWrap.hidden = collapsed;
    wrap.classList.toggle(classes.collapsedModifier, collapsed);
    header.setAttribute('aria-expanded', String(!collapsed));
  }
  applyState(getCollapsedSections().has(key));

  function toggle(): void {
    const collapsed = !bodyWrap.hidden;
    applyState(collapsed);
    const keys = getCollapsedSections();
    if (collapsed) keys.add(key); else keys.delete(key);
    setCollapsedSections(keys);
  }
  header.addEventListener('click', toggle);
  header.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });

  wrap.append(header, bodyWrap);
  return wrap;
}

function buildSection(key: string, title: string, description: string, body: HTMLElement): HTMLElement {
  return buildCollapsible('section', 'h3', {
    wrap: 'mc-section', header: 'mc-section-header', chevron: 'mc-section-chevron',
    title: 'mc-section-title', body: 'mc-section-body', desc: 'mc-section-desc',
    collapsedModifier: 'mc-section--collapsed',
  }, key, title, description, body);
}

function buildSubsection(key: string, title: string, description: string, body: HTMLElement): HTMLElement {
  return buildCollapsible('div', 'h4', {
    wrap: 'mc-subsection', header: 'mc-subsection-header', chevron: 'mc-subsection-chevron',
    title: 'mc-subsection-title', body: 'mc-subsection-body', desc: 'mc-subsection-desc',
    collapsedModifier: 'mc-subsection--collapsed',
  }, key, title, description, body);
}

export function renderMyContent(container: HTMLElement, lang: string): void {
  container.innerHTML = '';

  const wrap = el('div', 'mc-wrap');

  const header = el('div', 'mc-header');
  header.appendChild(el('h2', 'mc-title', 'My Content'));
  header.appendChild(el('p', 'mc-desc',
    'Add your own words, trivia questions and pictures — in one language or several at once. Everything here lives only in this browser — it is never uploaded, and does not touch the shared word list or trivia bank other learners see.'));

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
  backupRow.append(exportBtn, exportCsvBtn, importBtn, importInput, importStatus);
  header.appendChild(backupRow);
  wrap.appendChild(header);

  const selectedLangs = getSelectedLangs(lang);
  wrap.appendChild(buildLanguagePicker(lang, selectedLangs, () => renderMyContent(container, lang)));

  wrap.appendChild(buildSection('words', 'Words',
    'Add a brand-new word, or search real vocabulary (and words you\'ve added) to hide glosses, reorder them, or override the translation, part of speech, notes or domains.',
    buildWordsSection(lang, selectedLangs)));

  wrap.appendChild(buildSection('trivia', 'Trivia Questions',
    'Added to the Trivia tab\'s question bank, and included in its Difficulty/Reading/Domain filters. Fill in the question and answer for whichever languages you\'re writing it in — each becomes its own entry in that language\'s bank.',
    buildTriviaSection(lang, selectedLangs, () => renderMyContent(container, lang))));

  wrap.appendChild(buildSection('guessBlank', 'Guess the Blank Questions',
    'Added to Guess the Blank\'s question bank. Write 2-4 clues per question, vaguest first — the mode reveals them one at a time as the learner asks for another hint.',
    buildGuessBlankSection(lang, selectedLangs, () => renderMyContent(container, lang))));

  wrap.appendChild(buildSection('pictures', 'Pictures',
    'Search a language\'s vocabulary for words that already have a photo, icon or emoji, then choose which one Picture Quiz should show for that word. Words with none of their own can still get a custom picture — a pasted URL, an uploaded file, or a pick from the bundled photo library.',
    buildPicturesSection(lang)));

  container.appendChild(wrap);
}

// ── Words ────────────────────────────────────────────────────────────────────
//
// Two sub-blocks: adding a brand-new word (unchanged from before this file
// grew a word editor), and searching real vocabulary (plus words added just
// above) to hide/reorder glosses or override translation/pos/notes/domains —
// all as a client-only overlay, never touching the real data. Kept in one
// section rather than two, since both are fundamentally "change what a word
// looks like in this browser."

function buildWordsSection(currentLang: string, selectedLangs: Set<string>): HTMLElement {
  const wrap = el('div', 'mc-subsections');
  wrap.appendChild(buildAddWordSubsection(currentLang, selectedLangs));
  wrap.appendChild(buildEditWordSubsection(currentLang));
  return wrap;
}

function buildAddWordSubsection(currentLang: string, selectedLangs: Set<string>): HTMLElement {
  const sub = el('div', 'mc-subsection-fields');

  const form = el('div', 'mc-form');
  const transI = textInput('e.g. cat');
  const posI = selectInput(['', 'noun', 'verb', 'adjective', 'adverb', 'phrase', 'other']);
  const domainsI = textInput('e.g. animals, home (comma-separated)');
  const notesI = textInput('optional notes');
  const disambiguatorI = textInput('e.g. auxiliary — shown as "word (auxiliary)"');
  const meaningDisambiguatorI = textInput('e.g. function — shown as "translation (function)"');
  const difficultyI = selectInput(WORD_DIFFICULTY_OPTIONS);
  const tagsI = textInput('comma-separated');
  const synonymsI = textInput('comma-separated');
  const antonymsI = textInput('comma-separated');
  const examplesI = textArea('one example sentence per line — also what lets this word show up in Sentence Scramble');
  const extraGlossesI = textArea('one additional sense per line — e.g. "to converse" alongside "to talk"');
  form.append(
    field('Translation (English)', transI), field('Part of speech', posI),
    field('Domains', domainsI), field('Notes', notesI),
    field('Difficulty (1=easiest, 5=hardest)', difficultyI), field('Tags', tagsI),
    field('Synonyms', synonymsI), field('Antonyms', antonymsI),
    field('Word disambiguator', disambiguatorI),
    field('Meaning disambiguator (for the translation above)', meaningDisambiguatorI),
  );
  sub.appendChild(form);
  sub.appendChild(field('Example sentences', examplesI));
  sub.appendChild(field('Additional senses', extraGlossesI));

  const { rows, values: wordInputs } = languageRows(currentLang, selectedLangs, info => {
    const input = textInput(`Word in ${info.label}`);
    return { el: input, value: input };
  });
  sub.appendChild(rows);

  const addBtn = el('button', 'mc-btn', 'Add word(s)');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    if (!transI.value.trim()) return;
    let added = 0;
    for (const [langName, input] of wordInputs) {
      const word = input.value.trim();
      if (!word) continue;
      addUserWord(langName, {
        word, translation: transI.value.trim(),
        extraGlosses: lines(extraGlossesI.value),
        pos: posI.value || null, domains: csv(domainsI.value), notes: notesI.value.trim(),
        difficulty: difficultyI.value ? Number(difficultyI.value) : null,
        tags: csv(tagsI.value), synonyms: csv(synonymsI.value), antonyms: csv(antonymsI.value),
        examples: lines(examplesI.value),
        disambiguator: disambiguatorI.value.trim(),
        meaningDisambiguators: meaningDisambiguatorI.value.trim()
          ? { [transI.value.trim()]: meaningDisambiguatorI.value.trim() } : {},
      });
      added++;
    }
    // Rebuilds just this list in place, not the whole tab (see
    // renderAddedList below) — the old behavior of calling all the way back
    // up to the tab-wide refresh collapsed every other section and lost
    // whatever was mid-edit in, say, the Trivia section below.
    if (added > 0) renderAddedList();
  });
  sub.appendChild(addBtn);

  // Single-open-row state, like My Lists' own ctx.expandedWord — persists
  // across renderAddedList() calls so editing a field doesn't collapse the
  // row you're actively working on.
  let expandedKey: string | null = null;
  let pageIndex = 0;
  const rowKey = (lang: string, id: string): string => `${lang}:${id}`;

  const list = el('div', 'mc-list mc-scroll-list');
  const pager = buildListPager(i => { pageIndex = i; renderAddedList(); });

  function renderAddedList(): void {
    list.innerHTML = '';
    const allEntries = LANGUAGES.flatMap(info => getUserWords(info.name).map(w => ({ info, w })));
    const pages = pageCountFor(allEntries.length, MC_LIST_PAGE_SIZE);
    pageIndex = Math.max(0, Math.min(pageIndex, pages - 1));
    const shown = pageSlice(allEntries, MC_LIST_PAGE_SIZE, pageIndex);

    if (allEntries.length === 0) {
      list.appendChild(el('p', 'mc-empty', 'No words added yet.'));
    } else {
      shown.forEach(({ info, w }) => {
        const key = rowKey(info.name, w.id);
        list.appendChild(buildWordRow(info, w, renderAddedList, expandedKey === key, () => {
          expandedKey = expandedKey === key ? null : key;
          renderAddedList();
        }));
      });
    }
    pager.sync(pageIndex, allEntries.length);
  }
  renderAddedList();
  sub.appendChild(list);
  sub.appendChild(pager.row);

  return buildSubsection('words-add', 'Add a New Word',
    'Shows up at the top of Table, Picture Quiz and Conjugation-eligible word lists, right alongside the real vocabulary. Fill in one language, or several at once — e.g. gato for Spanish and chat for French, both meaning "cat". Click an added word below to edit it — hide/reorder its glosses, or override any field — the same editor "Edit an Existing Word" uses, since a word you typed in yourself is just as editable as a real one.',
    sub);
}

/**
 * A row in the "already added" list — click to expand its editor in place,
 * same interaction as buildWordOverrideRow below. `renderWordEditorBody`
 * (shared with the Edit-an-existing-word list) works on any `Word`, custom
 * or real, via the same override layer — so a custom word's own fields
 * (translation, pos, glosses, ...) are edited exactly the same way, rather
 * than needing a second, parallel edit mechanism just for these.
 */
function buildWordRow(
  info: LanguageInfo, w: UserWord, refresh: () => void, expanded: boolean, onToggle: () => void,
): HTMLElement {
  const wrap = el('div', 'mc-row-wrap');
  const row = el('div', 'mc-row mc-row--clickable' + (expanded ? ' mc-row--expanded' : ''));
  row.addEventListener('click', onToggle);

  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${w.word} — ${w.translation}`));
  main.appendChild(title);
  const meta: string[] = [];
  if (w.pos) meta.push(w.pos);
  if (w.domains.length) meta.push(w.domains.join(', '));
  if (meta.length) main.appendChild(el('span', 'mc-row-meta', meta.join(' · ')));
  row.appendChild(main);

  const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Remove');
  delBtn.type = 'button';
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    removeUserWord(info.name, w.id);
    refresh();
  });
  row.appendChild(delBtn);
  wrap.appendChild(row);

  if (expanded) {
    const detailEl = el('div', 'mc-row-detail');
    renderWordEditorBody(info.name, toWord(w), detailEl, refresh);
    wrap.appendChild(detailEl);
  }
  return wrap;
}

/**
 * Search + detail editor for hiding/reordering a word's glosses and
 * overriding its translation/part of speech/notes/domains. Unlike the
 * Add-a-word list above (which only knows about words you typed in
 * yourself), this section's own overrides list rebuilds itself in place on
 * every change rather than going through the whole tab's refresh — that
 * would also tear down the search panel next to it, closing the search and
 * losing the query every time an edit is made.
 */
function buildEditWordSubsection(currentLang: string): HTMLElement {
  const sub = el('div', 'mc-subsection-fields');

  // Single-open-row state, like My Lists' own ctx.expandedWord — persists
  // across renderOverridesList() calls so editing a field doesn't collapse
  // the row you're actively working on. Object rather than a string key so
  // there's no folded-text (un)parsing to get wrong.
  let expanded: { lang: string; word: string } | null = null;
  let pageIndex = 0;

  // Raw (override-free) vocabulary per language, fetched lazily and cached
  // here — expanding a row needs the word's true original values (hiding
  // something is never a one-way door), same as this search box's own
  // fetchWords: loadRawWords below. Cheap to keep a second small array
  // alongside buildWordSearchUI's own: the underlying fetch itself is
  // memoized in data-loader.ts regardless.
  const rawWordsCache = new Map<string, Word[]>();
  async function ensureWords(lang: string): Promise<Word[]> {
    let words = rawWordsCache.get(lang);
    if (!words) { words = await loadRawWords(lang); rawWordsCache.set(lang, words); }
    return words;
  }

  const list = el('div', 'mc-list mc-scroll-list');
  const pager = buildListPager(i => { pageIndex = i; renderOverridesList(); });

  // Only shown once there's enough already-edited words that finding one by
  // eye stops being the fastest way — filtering by the word's own text
  // across every language at once, since the list below already mixes them.
  const filterI = textInput('Filter edited words…');
  const filterRow = field('Filter already-edited words', filterI);
  filterRow.hidden = true;

  /** Toggles `word`'s row open/closed — called both by a list row's own
   *  click and by picking a search result, so however you got to a word,
   *  it opens the same way: expanding in place, not in a panel elsewhere. */
  async function openRow(lang: string, word: string): Promise<void> {
    const same = expanded?.lang === lang && foldKey(expanded.word) === foldKey(word);
    expanded = same ? null : { lang, word };
    if (expanded) await ensureWords(lang);
    renderOverridesList();
    if (expanded) {
      list.querySelector('.mc-row--expanded')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  const ui = buildWordSearchUI({
    defaultLang: currentLang,
    placeholder: 'Search for a word to edit…',
    fetchWords: loadRawWords,
    isEligible: () => true,
    isOverridden: (lang, w) => !!getWordOverride(lang, w.word),
    onSelect: (lang, w) => { void openRow(lang, w.word); },
    onLangChange: () => { expanded = null; renderOverridesList(); },
  });

  function renderOverridesList(): void {
    list.innerHTML = '';
    const raw: { info: LanguageInfo; word: string; override: WordOverride | null }[] = LANGUAGES.flatMap(info =>
      Object.entries(getWordOverrides(info.name)).map(([word, override]) => ({ info, word, override })));

    // A word opened via search but with no override yet isn't in `raw` at
    // all — synthesize a row for it so it's visible (and editable) before
    // its first save, rather than only appearing once something's changed.
    const exp = expanded;
    if (exp && !raw.some(r => r.info.name === exp.lang && foldKey(r.word) === foldKey(exp.word))) {
      const info = LANGUAGES.find(l => l.name === exp.lang);
      if (info) raw.unshift({ info, word: exp.word, override: null });
    }

    filterRow.hidden = raw.length <= 5;
    const q = foldKey(filterI.value.trim());
    const filtered = q ? raw.filter(({ word }) => foldKey(word).includes(q)) : raw;

    const pages = pageCountFor(filtered.length, MC_LIST_PAGE_SIZE);
    pageIndex = Math.max(0, Math.min(pageIndex, pages - 1));
    const shown = pageSlice(filtered, MC_LIST_PAGE_SIZE, pageIndex);

    if (filtered.length === 0) {
      list.appendChild(el('p', 'mc-empty', raw.length === 0 ? 'No words edited yet.' : 'No edited words match that filter.'));
    } else {
      shown.forEach(({ info, word, override }) => {
        const isExpanded = !!exp && exp.lang === info.name && foldKey(exp.word) === foldKey(word);
        const rawWord = rawWordsCache.get(info.name)?.find(x => foldKey(x.word) === foldKey(word));
        list.appendChild(buildWordOverrideRow(
          info, word, override, renderOverridesList, () => void openRow(info.name, word), isExpanded, rawWord,
        ));
      });
    }
    pager.sync(pageIndex, filtered.length);
  }
  filterI.addEventListener('input', () => { pageIndex = 0; renderOverridesList(); });
  renderOverridesList();

  sub.append(ui.wrap, filterRow, list, pager.row);
  return buildSubsection('words-edit', 'Edit an Existing Word',
    'Search a language\'s vocabulary — real words and ones you\'ve added above — to hide glosses you don\'t want to see, reorder the rest, or override the translation, part of speech, notes or domains. Click a word below — already edited, or one you just searched for — to edit it right there.',
    sub);
}

/** A one-line summary of what's overridden for a word, for the list at the
 *  bottom of "Edit an existing word" — enough to recognize the entry without
 *  re-opening it, not a full readout of every field. */
function summarizeWordOverride(o: WordOverride): string {
  const parts: string[] = [];
  if (o.translation !== undefined) parts.push(`translation → "${o.translation}"`);
  if (o.pos !== undefined) parts.push(o.pos ? `pos → ${o.pos}` : 'pos hidden');
  if (o.notes !== undefined) parts.push('notes edited');
  if (o.domains !== undefined) parts.push(o.domains.length ? `domains → ${o.domains.join(', ')}` : 'domains hidden');
  if (o.hiddenGlosses?.length) parts.push(`${o.hiddenGlosses.length} gloss${o.hiddenGlosses.length === 1 ? '' : 'es'} hidden`);
  if (o.addedGlosses?.length) parts.push(`${o.addedGlosses.length} gloss${o.addedGlosses.length === 1 ? '' : 'es'} added`);
  if (o.glossOrder) parts.push('gloss order changed');
  if (o.examples !== undefined) parts.push(o.examples.length ? `${o.examples.length} example${o.examples.length === 1 ? '' : 's'}` : 'examples cleared');
  if (o.difficulty !== undefined) parts.push(o.difficulty ? `difficulty → ${o.difficulty}` : 'difficulty hidden');
  if (o.tags !== undefined) parts.push(o.tags.length ? `tags → ${o.tags.join(', ')}` : 'tags hidden');
  if (o.synonyms !== undefined) parts.push(o.synonyms.length ? `synonyms → ${o.synonyms.join(', ')}` : 'synonyms hidden');
  if (o.antonyms !== undefined) parts.push(o.antonyms.length ? `antonyms → ${o.antonyms.join(', ')}` : 'antonyms hidden');
  if (o.disambiguator !== undefined) parts.push(o.disambiguator ? `word disambiguator → ${o.disambiguator}` : 'word disambiguator cleared');
  const noteCount = o.meaningDisambiguators ? Object.keys(o.meaningDisambiguators).length : 0;
  if (noteCount) parts.push(`${noteCount} meaning note${noteCount === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** `onToggle` expands/collapses this word's editor in place (see
 *  .mc-row--clickable) — the row itself is clickable for that, with Remove
 *  as the one carve-out that doesn't trigger it. `override` is null for a
 *  word opened via search that has no override yet; `rawWord` is undefined
 *  only in the brief window before its language's vocabulary has loaded. */
function buildWordOverrideRow(
  info: LanguageInfo, word: string, override: WordOverride | null, refresh: () => void,
  onToggle: () => void, expanded: boolean, rawWord: Word | undefined,
): HTMLElement {
  const wrap = el('div', 'mc-row-wrap');
  const row = el('div', 'mc-row mc-row--clickable' + (expanded ? ' mc-row--expanded' : ''));
  row.addEventListener('click', onToggle);

  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${word}`));
  main.appendChild(title);
  const summary = override ? summarizeWordOverride(override) : '';
  main.appendChild(el('span', 'mc-row-meta', summary || 'No changes yet'));
  row.appendChild(main);

  const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Remove');
  delBtn.type = 'button';
  delBtn.disabled = !override;
  delBtn.title = override ? 'Reset all overrides for this word' : 'Nothing to remove yet';
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    removeWordOverride(info.name, word);
    refresh();
  });
  row.appendChild(delBtn);
  wrap.appendChild(row);

  if (expanded) {
    const detailEl = el('div', 'mc-row-detail');
    if (rawWord) renderWordEditorBody(info.name, rawWord, detailEl, refresh);
    else detailEl.appendChild(el('p', 'mc-empty', 'Loading…'));
    wrap.appendChild(detailEl);
  }
  return wrap;
}

const WORD_POS_OPTIONS = ['', 'noun', 'verb', 'adjective', 'adverb', 'phrase', 'other'];

interface OverridableNote {
  wrap:     HTMLElement;
  checkbox: HTMLInputElement;
  input:    HTMLInputElement;
}

/**
 * Shared "default value → Override checkbox → editable input" control.
 * Unlike a plain text input pre-filled with `override ?? default` (this
 * panel's old approach for both disambiguator fields, and still how every
 * other field here works) that looks identical whether you're seeing the
 * real default or a learner's own edit, this shows the default as its own
 * line and gates the editable input behind an explicit checkbox — so it's
 * never ambiguous which one is in effect. Used both for the word
 * disambiguator (once per word, see buildDisambiguatorField below) and each
 * gloss's own meaning disambiguator (once per sense, inline in that gloss's
 * row in the Glosses list) — both sides of the word/meaning distinction get
 * the same treatment rather than one being a plain optional text box.
 */
function buildOverridableNote(defaultValue: string, overrideValue: string | undefined, placeholder: string): OverridableNote {
  const wrap = el('div', 'mc-disambig-inline');
  wrap.appendChild(el('span', 'mc-disambig-default',
    defaultValue ? `Default: "${defaultValue}"` : 'No default'));

  const toggleLabel = el('label', 'mc-disambig-toggle');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'mc-disambig-checkbox';
  checkbox.checked = overrideValue !== undefined;
  toggleLabel.append(checkbox, document.createTextNode('Override'));
  wrap.appendChild(toggleLabel);

  const input = textInput(placeholder, overrideValue ?? defaultValue);
  input.disabled = !checkbox.checked;
  wrap.appendChild(input);

  checkbox.addEventListener('change', () => {
    input.disabled = !checkbox.checked;
    if (checkbox.checked) input.focus();
  });

  return { wrap, checkbox, input };
}

/**
 * "Word disambiguator" field for the word editor — buildOverridableNote
 * wrapped in a labeled .mc-field, matching every other field in the form.
 * Unchecking clears any override on save (see the caller, which omits
 * `disambiguator` from `fields` entirely when unchecked).
 */
function buildDisambiguatorField(defaultValue: string, overrideValue: string | undefined): OverridableNote {
  const wrap = el('div', 'mc-field mc-disambig-field');
  wrap.appendChild(el('span', 'mc-field-label', 'Word disambiguator'));
  const note = buildOverridableNote(defaultValue, overrideValue, 'e.g. auxiliary — shown as "word (auxiliary)"');
  wrap.appendChild(note.wrap);
  return { wrap, checkbox: note.checkbox, input: note.input };
}

/**
 * Populates `container` with the full word editor — translation/pos/notes/
 * domains/etc. fields, plus the Glosses list (hide/reorder/add/remove) — for
 * `w` in `lang`. Shared by both word lists in this section: a real word's
 * override and a custom word's own fields are edited exactly the same way,
 * since applyWordOverride works on either (see toWord). `onChange` re-renders
 * the row from current override state after every edit, so there's nothing
 * to manually patch in place here — same as My Lists' own row expansion.
 */
function renderWordEditorBody(lang: string, w: Word, container: HTMLElement, onChange: () => void): void {
  container.innerHTML = '';
  const override = getWordOverride(lang, w.word);

  // ── Translation / part of speech / notes / domains ──────────────────────
  const fieldsForm = el('div', 'mc-form');
  const transI   = textInput('Translation', override?.translation ?? w.translation);
  const posI     = selectInput(WORD_POS_OPTIONS, override?.pos ?? w.pos ?? '');
  const notesI   = textInput('Notes', override?.notes ?? w.notes);
  const domainsI = textInput('e.g. animals, home (comma-separated)', (override?.domains ?? w.domains).join(', '));
  const difficultyI = selectInput(WORD_DIFFICULTY_OPTIONS, String((override?.difficulty ?? w.difficulty) ?? ''));
  const tagsI     = textInput('comma-separated', (override?.tags ?? w.tags).join(', '));
  const synonymsI = textInput('comma-separated', (override?.synonyms ?? w.relations?.synonyms ?? []).join(', '));
  const antonymsI = textInput('comma-separated', (override?.antonyms ?? w.relations?.antonyms ?? []).join(', '));
  const disambig = buildDisambiguatorField(w.disambiguator ?? '', override?.disambiguator);
  fieldsForm.append(
    field('Translation', transI), field('Part of speech', posI),
    field('Notes', notesI), field('Domains', domainsI),
    field('Difficulty (1=easiest, 5=hardest)', difficultyI), field('Tags', tagsI),
    field('Synonyms', synonymsI), field('Antonyms', antonymsI),
    disambig.wrap,
  );
  container.appendChild(fieldsForm);
  const examplesI = textArea(
    'one example sentence per line',
    (override?.examples ?? w.examples).join('\n'),
  );
  container.appendChild(field('Example sentences', examplesI));

  const saveBtn = el('button', 'mc-btn mc-btn--sm', 'Save changes');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', () => {
    // Only a field whose new value actually differs from the word's real
    // one becomes part of the override — editing a field back to its
    // original value and saving un-overrides just that field, since
    // setWordFields treats a key's absence here as "no override." `w` is
    // the raw word (this panel searches via loadRawWords), so these really
    // are the original values, not whatever an earlier override left
    // showing.
    const fields: Parameters<typeof setWordFields>[2] = {};
    const newTrans = transI.value.trim();
    if (newTrans !== w.translation) fields.translation = newTrans;
    const newPos = posI.value || null;
    if (newPos !== (w.pos ?? null)) fields.pos = newPos;
    const newNotes = notesI.value.trim();
    if (newNotes !== w.notes) fields.notes = newNotes;
    const newDomains = csv(domainsI.value);
    if (JSON.stringify(newDomains) !== JSON.stringify(w.domains)) fields.domains = newDomains;
    const newDifficulty = difficultyI.value ? Number(difficultyI.value) : null;
    // w.difficulty is typed number|null, but the server's own column is
    // TEXT (see vocab-loader.ts's VocabRow) — real words reach the client
    // as the string "1", never the number 1. Comparing newDifficulty
    // straight against that (`1 !== "1"`) flagged every real word's
    // difficulty as "changed" on every save, recording a spurious
    // same-value override that would silently freeze it against a future
    // data resync. Coercing both sides here is the narrow fix; the wider
    // number|null lie in the Word type is a separate, bigger thing.
    const currentDifficulty = w.difficulty != null ? Number(w.difficulty) : null;
    if (newDifficulty !== currentDifficulty) fields.difficulty = newDifficulty;
    const newTags = csv(tagsI.value);
    if (JSON.stringify(newTags) !== JSON.stringify(w.tags)) fields.tags = newTags;
    const newSynonyms = csv(synonymsI.value);
    if (JSON.stringify(newSynonyms) !== JSON.stringify(w.relations?.synonyms ?? [])) fields.synonyms = newSynonyms;
    const newAntonyms = csv(antonymsI.value);
    if (JSON.stringify(newAntonyms) !== JSON.stringify(w.relations?.antonyms ?? [])) fields.antonyms = newAntonyms;
    const newExamples = lines(examplesI.value);
    if (JSON.stringify(newExamples) !== JSON.stringify(w.examples)) fields.examples = newExamples;
    // Checkbox-driven, unlike every field above: unchecked means "no
    // override" regardless of what the (disabled) input still shows, so
    // the key is omitted from `fields` entirely rather than compared
    // against the default — setWordFields treats that as "clear it."
    if (disambig.checkbox.checked) fields.disambiguator = disambig.input.value.trim();
    setWordFields(lang, w.word, fields);
    onChange();
  });
  container.appendChild(saveBtn);

  // ── Glosses: hide/reorder real senses, add and remove new ones ──────────
  // Always shown, even for a word with no real glosses at all (rank/domain
  // words sometimes have none) — "Add a gloss" below works regardless.
  container.appendChild(el('h5', 'mc-subsection-title', 'Glosses'));

  const hiddenSet = new Set(override?.hiddenGlosses ?? []);
  const addedSet  = new Set(override?.addedGlosses ?? []);
  // Added senses are appended after the real ones so a fresh add always
  // lands at the end, then glossOrder (saved against whichever glosses
  // were visible at the time, real or added — see applyGlossOrder) can
  // reposition either kind the same way.
  const allGlosses   = [...w.glosses, ...(override?.addedGlosses ?? [])];
  const displayOrder = override?.glossOrder ? applyGlossOrder(allGlosses, override.glossOrder) : allGlosses;

  const glossList = el('div', 'mc-gloss-list');
  if (displayOrder.length === 0) {
    glossList.appendChild(el('p', 'mc-empty', 'No glosses yet — add one below.'));
  } else {
    displayOrder.forEach((gloss, i) => {
      const isAdded = addedSet.has(gloss);
      const item = el('div', 'mc-gloss-item');
      if (hiddenSet.has(gloss)) item.classList.add('mc-gloss-item--hidden');

      // Position among this word's senses — the ↑/↓ buttons below change
      // it, and it's what "Question glosses"/"Answer glosses" in Settings
      // actually counts off when capping how many senses a quiz shows, so
      // it's worth seeing at a glance rather than only inferring it from
      // the gloss's position in the list.
      const rankBadge = el('span', 'mc-gloss-rank', `#${i + 1}`);
      rankBadge.title = 'Position among this word’s senses — earlier senses are the ones shown first when a quiz caps how many it displays.';
      item.appendChild(rankBadge);

      if (isAdded) {
        // Nothing to hide — a sense the learner typed in themselves is
        // just deleted outright instead (the ✕ button below).
        item.appendChild(el('span', 'mc-gloss-item-added-tag', '+'));
      } else {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'mc-gloss-checkbox';
        checkbox.checked = !hiddenSet.has(gloss);
        checkbox.setAttribute('aria-label', `Show "${gloss}"`);
        checkbox.addEventListener('change', () => {
          setGlossHidden(lang, w.word, gloss, !checkbox.checked);
          onChange();
        });
        item.appendChild(checkbox);
      }
      item.appendChild(el('span', 'mc-gloss-item-text', gloss));

      // Per-sense meaning disambiguator — independent of every other
      // gloss's, and independent of the word disambiguator field above
      // (that one annotates the word; this annotates this specific sense).
      // Same default-vs-override treatment as the word disambiguator: the
      // default is whatever note the word itself already carries (always
      // none for a real word, but a custom word can have its own), and
      // only the Override checkbox — not just typing in the box — decides
      // whether this sense's note actually changes on this row's own
      // immediate-apply model (matching hide/reorder/add-gloss above,
      // rather than the batched "Save changes" the word-level fields use).
      const baseGlossNote = w.meaningDisambiguators?.[gloss] ?? '';
      const overrideGlossNote = override?.meaningDisambiguators?.[gloss];
      const noteField = buildOverridableNote(baseGlossNote, overrideGlossNote, 'e.g. "function"');
      noteField.wrap.classList.add('mc-gloss-note-field');
      noteField.input.setAttribute('aria-label', `Meaning note for "${gloss}"`);
      noteField.checkbox.setAttribute('aria-label', `Override meaning note for "${gloss}"`);
      noteField.checkbox.addEventListener('change', () => {
        // Unchecking clears the override outright (falls back to the
        // word's own default); checking just unlocks the input — nothing
        // to persist until the learner actually types something.
        if (!noteField.checkbox.checked) { setGlossMeaningNote(lang, w.word, gloss, ''); onChange(); }
      });
      noteField.input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); noteField.input.blur(); } });
      noteField.input.addEventListener('blur', () => {
        if (!noteField.checkbox.checked) return;
        const value = noteField.input.value.trim();
        if (value !== (overrideGlossNote ?? baseGlossNote)) { setGlossMeaningNote(lang, w.word, gloss, value); onChange(); }
      });
      item.appendChild(noteField.wrap);

      const controls = el('div', 'mc-gloss-item-controls');
      const upBtn = el('button', 'mc-gloss-move-btn', '↑');
      upBtn.type = 'button';
      upBtn.disabled = i === 0;
      upBtn.setAttribute('aria-label', `Move "${gloss}" earlier`);
      upBtn.addEventListener('click', () => {
        const next = [...displayOrder];
        [next[i - 1], next[i]] = [next[i], next[i - 1]];
        setGlossOrderOverride(lang, w.word, next);
        onChange();
      });
      const downBtn = el('button', 'mc-gloss-move-btn', '↓');
      downBtn.type = 'button';
      downBtn.disabled = i === displayOrder.length - 1;
      downBtn.setAttribute('aria-label', `Move "${gloss}" later`);
      downBtn.addEventListener('click', () => {
        const next = [...displayOrder];
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
        setGlossOrderOverride(lang, w.word, next);
        onChange();
      });
      controls.append(upBtn, downBtn);

      if (isAdded) {
        const delBtn = el('button', 'mc-gloss-move-btn mc-gloss-remove-btn', '✕');
        delBtn.type = 'button';
        delBtn.setAttribute('aria-label', `Remove "${gloss}"`);
        delBtn.addEventListener('click', () => {
          removeAddedGloss(lang, w.word, gloss);
          onChange();
        });
        controls.appendChild(delBtn);
      }

      item.appendChild(controls);
      glossList.appendChild(item);
    });
  }
  container.appendChild(glossList);

  const addGlossRow = el('div', 'mc-gloss-add-row');
  const newGlossI = textInput('Add a new sense, e.g. "to talk"');
  newGlossI.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!newGlossI.value.trim()) return;
    addGlossOverride(lang, w.word, newGlossI.value);
    onChange();
  });
  const addGlossBtn = el('button', 'mc-btn mc-btn--sm', 'Add gloss');
  addGlossBtn.type = 'button';
  addGlossBtn.addEventListener('click', () => {
    if (!newGlossI.value.trim()) return;
    addGlossOverride(lang, w.word, newGlossI.value);
    onChange();
  });
  addGlossRow.append(newGlossI, addGlossBtn);
  container.appendChild(addGlossRow);

  if (override) {
    const resetBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Reset all overrides for this word');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => { removeWordOverride(lang, w.word); onChange(); });
    container.appendChild(resetBtn);
  }
}

// ── Trivia questions ─────────────────────────────────────────────────────────

const CATEGORIES: readonly TriviaCategory[] = ['history', 'pop-culture'];
const DIFFICULTIES: readonly TriviaDifficulty[] = ['easy', 'medium', 'hard'];
const READING_DIFFICULTIES: readonly ReadingDifficulty[] = ['easy', 'medium', 'hard'];
const READING_LENGTHS: readonly ReadingLength[] = ['short', 'long'];
const ANSWER_TYPES: readonly AnswerType[] = ['year', 'number', 'person', 'place', 'thing'];

interface TriviaLangInputs { question: HTMLInputElement; answers: HTMLInputElement }

function buildTriviaSection(currentLang: string, selectedLangs: Set<string>, refresh: () => void): HTMLElement {
  const wrap = el('div', 'mc-subsections');

  const form = el('div', 'mc-form');
  const qEnI = textInput('Question in English');
  const ansEnI = textInput('Accepted English answers, comma-separated');
  const categoryI = selectInput(CATEGORIES);
  const difficultyI = selectInput(DIFFICULTIES);
  const readingDiffI = selectInput(READING_DIFFICULTIES);
  const readingLenI = selectInput(READING_LENGTHS);
  const answerTypeI = selectInput(ANSWER_TYPES);
  const domainsI = textInput('e.g. history, geography (comma-separated)');
  form.append(
    field('Question (English)', qEnI), field('Accepted answers (English)', ansEnI),
    field('Category', categoryI), field('Trivia difficulty', difficultyI),
    field('Reading difficulty', readingDiffI), field('Reading length', readingLenI),
    field('Answer type', answerTypeI), field('Domains', domainsI),
  );
  wrap.appendChild(form);

  const { rows, values: triviaInputs } = languageRows<TriviaLangInputs>(currentLang, selectedLangs, info => {
    const question = textInput(`Question in ${info.label}`);
    const answers = textInput('Accepted answers, comma-separated');
    const rowWrap = el('div', 'mc-lang-row-inputs');
    rowWrap.append(question, answers);
    return { el: rowWrap, value: { question, answers } };
  });
  wrap.appendChild(rows);

  const addBtn = el('button', 'mc-btn', 'Add question(s)');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    let added = 0;
    for (const [langName, { question, answers }] of triviaInputs) {
      const questionTarget = question.value.trim();
      const answersTarget = csv(answers.value);
      if (!questionTarget || answersTarget.length === 0) continue;
      const q: Omit<TriviaQuestion, 'id'> = {
        category: categoryI.value as TriviaCategory,
        difficulty: difficultyI.value as TriviaDifficulty,
        readingDifficulty: readingDiffI.value as ReadingDifficulty,
        readingLength: readingLenI.value as ReadingLength,
        answerType: answerTypeI.value as AnswerType,
        domains: csv(domainsI.value),
        questionTarget,
        questionEn: qEnI.value.trim() || questionTarget,
        answersTarget,
        answersEn: csv(ansEnI.value).length ? csv(ansEnI.value) : answersTarget,
      };
      addUserTriviaQuestion(langName, q);
      added++;
    }
    if (added > 0) refresh();
  });
  wrap.appendChild(addBtn);

  const list = el('div', 'mc-list');
  const allQuestions = LANGUAGES.flatMap(info => getUserTriviaQuestions(info.name).map(q => ({ info, q })));
  if (allQuestions.length === 0) {
    list.appendChild(el('p', 'mc-empty', 'No trivia questions added yet.'));
  } else {
    allQuestions.forEach(({ info, q }) => list.appendChild(buildTriviaRow(info, q, refresh)));
  }
  wrap.appendChild(list);
  return wrap;
}

function buildTriviaRow(info: LanguageInfo, q: TriviaQuestion, refresh: () => void): HTMLElement {
  const row = el('div', 'mc-row');
  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${q.questionTarget}`));
  main.appendChild(title);
  main.appendChild(el('span', 'mc-row-meta',
    `${q.difficulty} · reading ${q.readingDifficulty}/${q.readingLength} · ${q.answerType} · answer: ${q.answersTarget[0]}`));
  row.appendChild(main);

  const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Remove');
  delBtn.type = 'button';
  delBtn.addEventListener('click', () => { removeUserTriviaQuestion(info.name, q.id); refresh(); });
  row.appendChild(delBtn);
  return row;
}

// ── Guess the Blank questions ────────────────────────────────────────────────
// Same shape as Trivia above, but a question here is 2-4 clues (weakest
// first) rather than one line of text — see data/guess-blank-questions.ts.
// A textarea, one clue per line, stands in for the dynamic add/remove clue
// rows a fully general editor would need.

const BLANK_CATEGORIES: readonly BlankCategory[] = ['animal', 'object', 'place', 'person', 'food'];
const BLANK_DIFFICULTIES: readonly BlankDifficulty[] = ['easy', 'medium', 'hard'];

interface GuessBlankLangInputs { answer: HTMLInputElement; clues: HTMLTextAreaElement }

function buildGuessBlankSection(currentLang: string, selectedLangs: Set<string>, refresh: () => void): HTMLElement {
  const wrap = el('div', 'mc-subsections');

  const form = el('div', 'mc-form');
  const answerEnI = textInput('Answer in English, e.g. "the monkey"');
  const cluesEnI = textArea('One clue per line, vaguest first (2-4 clues)');
  const categoryI = selectInput(BLANK_CATEGORIES);
  const difficultyI = selectInput(BLANK_DIFFICULTIES);
  form.append(
    field('Answer (English)', answerEnI), field('Category', categoryI), field('Difficulty', difficultyI),
  );
  wrap.appendChild(form);
  wrap.appendChild(field('Clues (English)', cluesEnI));

  const { rows, values: blankInputs } = languageRows<GuessBlankLangInputs>(currentLang, selectedLangs, info => {
    const answer = textInput(`Answer in ${info.label}`);
    const clues = textArea(`Clues in ${info.label}, one per line`);
    const rowWrap = el('div', 'mc-lang-row-stack');
    rowWrap.append(answer, clues);
    return { el: rowWrap, value: { answer, clues } };
  });
  wrap.appendChild(rows);

  const addBtn = el('button', 'mc-btn', 'Add question(s)');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => {
    let added = 0;
    for (const [langName, { answer, clues }] of blankInputs) {
      const answerTarget = answer.value.trim();
      const cluesTarget = lines(clues.value);
      if (!answerTarget || cluesTarget.length === 0) continue;
      const q: Omit<GuessBlankQuestion, 'id'> = {
        category: categoryI.value as BlankCategory,
        difficulty: difficultyI.value as BlankDifficulty,
        cluesTarget,
        cluesEn: lines(cluesEnI.value).length ? lines(cluesEnI.value) : cluesTarget,
        answerTarget,
        answerEn: answerEnI.value.trim() || answerTarget,
      };
      addUserGuessBlankQuestion(langName, q);
      added++;
    }
    if (added > 0) refresh();
  });
  wrap.appendChild(addBtn);

  const list = el('div', 'mc-list');
  const allQuestions = LANGUAGES.flatMap(info => getUserGuessBlankQuestions(info.name).map(q => ({ info, q })));
  if (allQuestions.length === 0) {
    list.appendChild(el('p', 'mc-empty', 'No Guess the Blank questions added yet.'));
  } else {
    allQuestions.forEach(({ info, q }) => list.appendChild(buildGuessBlankRow(info, q, refresh)));
  }
  wrap.appendChild(list);
  return wrap;
}

function buildGuessBlankRow(info: LanguageInfo, q: GuessBlankQuestion, refresh: () => void): HTMLElement {
  const row = el('div', 'mc-row');
  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${q.answerTarget}`));
  main.appendChild(title);
  main.appendChild(el('span', 'mc-row-meta',
    `${q.category} · ${q.difficulty} · ${q.cluesTarget.length} clue${q.cluesTarget.length === 1 ? '' : 's'}`));
  row.appendChild(main);

  const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Remove');
  delBtn.type = 'button';
  delBtn.addEventListener('click', () => { removeUserGuessBlankQuestion(info.name, q.id); refresh(); });
  row.appendChild(delBtn);
  return row;
}

// ── Word search ──────────────────────────────────────────────────────────────
//
// Shared by the Pictures and word-editor panels: both need to search a
// language's vocabulary for entries eligible for that panel's kind of
// override, then hand off to a panel-specific detail view once one is
// picked. The language dropdown, the async vocab load, and the
// search-box/results-list wiring are otherwise identical, so only which
// vocabulary to fetch, the eligibility filter, the "already overridden"
// flag, and what happens on selection vary per caller.

interface WordSearchUIOptions {
  defaultLang: string;
  /** Search box placeholder, and what's shown while the language loads. */
  placeholder: string;
  /** How to fetch a language's word list — `loadWords` (overrides already
   *  applied, what the Pictures panel wants to search and display) or
   *  `loadRawWords` (the true original, what the word editor needs so
   *  hiding something is never a one-way door). */
  fetchWords: (lang: string) => Promise<Word[]>;
  /** Which words this panel's search should surface at all. */
  isEligible: (lang: string, w: Word) => boolean;
  /** Whether to show the "✓ set" badge next to a result. */
  isOverridden: (lang: string, w: Word) => boolean;
  /** Fires when a result is clicked. */
  onSelect: (lang: string, w: Word) => void;
  /** Fires when the language changes, before the new vocabulary has loaded —
   *  lets the caller close whatever detail view was showing for the old
   *  language's word (it's no longer reachable in the new one). The ✕ button
   *  and Escape only clear the search text/results; they leave a currently
   *  open detail view alone — see its own collapse toggle instead. */
  onLangChange: () => void;
}

interface WordSearchUI {
  /** Language picker + search box + results list, in that order. */
  wrap: HTMLElement;
  getLang: () => string;
  /** Re-runs the current query — call after a change that should update a
   *  result's "✓ set" badge (the word may still be on screen in the list). */
  refreshResults: () => void;
  /** Switches to `lang` if needed, waits for its vocabulary to load, then
   *  opens `word`'s detail view directly — what a row in an overrides list
   *  below calls to jump straight to editing that word instead of making
   *  the learner search for it again. Deliberately leaves the search box
   *  and results list alone (see the implementation): this is "open this
   *  one word," not "search for it." A silent no-op if `word` can't be
   *  found (e.g. removed from the data since the override was made). */
  openWord: (lang: string, word: string) => Promise<void>;
}

const RESULTS_LIMIT = 20;

function buildWordSearchUI(opts: WordSearchUIOptions): WordSearchUI {
  const wrap = el('div', 'mc-word-panel');

  let lang = opts.defaultLang;
  let words: Word[] | null = null;
  // Which word (by folded text) the detail panel below is currently open
  // on, so the results list can highlight it — otherwise nothing on screen
  // says which of several similar-looking results you're actually editing.
  let selectedKey: string | null = null;
  // The list actually on screen right now (already capped to RESULTS_LIMIT)
  // and which of them the keyboard cursor is on — kept outside renderResults
  // so the search box's own keydown handler can act on the same rows it drew.
  let currentMatches: Word[] = [];
  let kbdIndex = -1;

  const langSelect = document.createElement('select');
  langSelect.className = 'mc-input mc-word-lang-select';
  for (const info of LANGUAGES) {
    const lopt = document.createElement('option');
    lopt.value = info.name;
    lopt.textContent = info.label;
    langSelect.appendChild(lopt);
  }
  langSelect.value = lang;

  const langRow = el('div', 'mc-word-lang-row');
  langRow.append(el('span', 'mc-field-label', 'Language'), langSelect);

  const searchInput = textInput(opts.placeholder);
  searchInput.disabled = true;

  const clearBtn = el('button', 'mc-word-search-clear', '✕');
  clearBtn.type = 'button';
  clearBtn.hidden = true;
  clearBtn.setAttribute('aria-label', 'Clear search');
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    renderResults('');
    searchInput.focus();
  });

  const searchRow = el('div', 'mc-word-search-row');
  searchRow.append(searchInput, clearBtn);

  const countLabel = el('p', 'mc-word-results-count');
  countLabel.hidden = true;

  const resultsList = el('ul', 'mc-word-results');
  resultsList.hidden = true;

  function selectMatch(i: number): void {
    const w = currentMatches[i];
    if (!w) return;
    selectedKey = foldKey(w.word);
    opts.onSelect(lang, w);
    // Repaint the active/kbd-focus classes in place rather than re-running
    // the whole search — the list of matches hasn't changed, just which one
    // is now open below.
    Array.from(resultsList.children).forEach((li, idx) => {
      li.classList.toggle('mc-word-result--active', idx === i);
    });
  }

  function paintKbdFocus(): void {
    Array.from(resultsList.children).forEach((li, idx) => {
      li.classList.toggle('mc-word-result--kbd-focus', idx === kbdIndex);
    });
    (resultsList.children[kbdIndex] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }

  function renderResults(query: string): void {
    resultsList.innerHTML = '';
    kbdIndex = -1;
    clearBtn.hidden = !query.trim();
    if (!words) { resultsList.hidden = true; countLabel.hidden = true; currentMatches = []; return; }
    const q = foldKey(query);
    if (!q) { resultsList.hidden = true; countLabel.hidden = true; currentMatches = []; return; }
    const allMatches = words
      .filter(w => opts.isEligible(lang, w))
      .filter(w => foldKey(w.word).includes(q) || foldKey(w.translation).includes(q));
    currentMatches = allMatches.slice(0, RESULTS_LIMIT);

    if (currentMatches.length === 0) {
      resultsList.appendChild(el('li', 'mc-empty', 'No matching words.'));
      resultsList.hidden = false;
      countLabel.hidden = true;
      return;
    }
    if (allMatches.length > currentMatches.length) {
      countLabel.textContent = `Showing ${currentMatches.length} of ${allMatches.length} matches — keep typing to narrow it down.`;
      countLabel.hidden = false;
    } else {
      countLabel.hidden = true;
    }
    currentMatches.forEach((w, i) => {
      const li = el('li', 'mc-word-result');
      const wordSpan = el('span', 'mc-word-result-word');
      fillHighlighted(wordSpan, w.word, query);
      const transSpan = el('span', 'mc-word-result-trans');
      fillHighlighted(transSpan, w.translation, query);
      li.append(wordSpan, transSpan);
      if (opts.isOverridden(lang, w)) li.appendChild(el('span', 'mc-word-result-flag', '✓ set'));
      if (selectedKey && foldKey(w.word) === selectedKey) li.classList.add('mc-word-result--active');
      li.addEventListener('click', () => selectMatch(i));
      resultsList.appendChild(li);
    });
    resultsList.hidden = false;
  }

  function loadLang(): Promise<void> {
    // Snapshotted now, not read back from the outer `lang` inside .then()
    // below: `lang` is the same mutable variable every call closes over, so
    // if the language is switched again before this fetch resolves, the
    // *next* call already reassigns it — and the guard below, comparing
    // against that same variable, would then always agree with itself
    // regardless of which call it's checking from. Two fetches racing
    // (a slow first request, a second one resolving from cache before it)
    // could resolve out of order, and the stale one would pass its own
    // check and overwrite `words` with the wrong language's list right after
    // the current one had already loaded correctly.
    const requestedLang = lang;
    words = null;
    selectedKey = null;
    resultsList.innerHTML = '';
    resultsList.hidden = true;
    countLabel.hidden = true;
    clearBtn.hidden = true;
    opts.onLangChange();
    searchInput.value = '';
    searchInput.disabled = true;
    searchInput.placeholder = 'Loading vocabulary…';
    return opts.fetchWords(requestedLang).then(loaded => {
      if (requestedLang !== langSelect.value) return; // superseded by a later change
      words = loaded;
      searchInput.disabled = false;
      searchInput.placeholder = opts.placeholder;
    });
  }

  async function openWord(targetLang: string, word: string): Promise<void> {
    if (lang !== targetLang || !words) {
      lang = targetLang;
      langSelect.value = targetLang;
      await loadLang();
    }
    const match = words?.find(w => foldKey(w.word) === foldKey(word));
    if (!match) return;
    // Deliberately leaves the search box and results list untouched — jumping
    // here from the already-edited-words list below is "open this one word,"
    // not "search for it," so it shouldn't dump a page of unrelated-looking
    // matches on screen the learner never asked to see.
    selectedKey = foldKey(word);
    opts.onSelect(lang, match);
  }

  langSelect.addEventListener('change', () => { lang = langSelect.value; void loadLang(); });
  searchInput.addEventListener('input', () => renderResults(searchInput.value.trim()));
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      renderResults('');
      return;
    }
    if (resultsList.hidden || currentMatches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      kbdIndex = Math.min(kbdIndex + 1, currentMatches.length - 1);
      paintKbdFocus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      kbdIndex = Math.max(kbdIndex - 1, 0);
      paintKbdFocus();
    } else if (e.key === 'Enter' && kbdIndex >= 0) {
      e.preventDefault();
      selectMatch(kbdIndex);
    }
  });

  wrap.append(langRow, searchRow, countLabel, resultsList);
  void loadLang();

  return { wrap, getLang: () => lang, refreshResults: () => renderResults(searchInput.value.trim()), openWord };
}

// ── Pictures ─────────────────────────────────────────────────────────────────
//
// Rather than typing a word blind and pasting a URL, this searches the
// language's real vocabulary (plus words added in the section above) for
// entries that already carry a visual — a local photo, an SVG icon or an
// emoji, via the same lookup picture-mode.ts itself uses — and lets you pick
// whichever one of those should be the *canonical* image, overriding
// picture-mode's own photo > icon > emoji priority for just that word. A
// custom URL, an uploaded file, or a pick from the bundled stock-photo
// library are still there for words with no built-in visual at all, or when
// none of the built-in options is the right picture.

interface WordVisuals { photo: string | null; svg: string | null; emoji: string | null }

function visualsFor(lang: string, w: Word): WordVisuals {
  return {
    photo: getFallbackImageUrl(lang, w.word),
    svg:   w.svg_url || getFallbackSvgUrl(lang, w.word) || null,
    emoji: w.emoji || getFallbackEmoji(lang, w.word) || null,
  };
}

function hasAnyVisual(v: WordVisuals): boolean {
  return Boolean(v.photo || v.svg || v.emoji);
}

/**
 * The bundled-photo gallery offered as one of the "custom" ways to set a
 * word's picture, alongside a pasted URL and an uploaded file — for words
 * with no built-in visual of their own, or when none of the built-in
 * options is the right one. Collapsed by default since the full gallery is
 * dozens of images long. `onPick` fires once and the caller is expected to
 * rebuild its own view — this component holds no state of its own.
 */
function buildStockImagePicker(selectedUrl: string | null, onPick: (url: string) => void): HTMLElement {
  const wrap = el('div', 'mc-stock-picker');

  const toggle = el('button', 'mc-btn mc-btn--secondary mc-btn--sm', 'Choose from stock images…');
  toggle.type = 'button';

  const gallery = el('div', 'mc-stock-gallery');
  gallery.hidden = true;

  for (const { url, label } of getStockImages()) {
    const item = el('button', 'mc-stock-item');
    item.type = 'button';
    if (url === selectedUrl) item.classList.add('mc-stock-item--selected');
    const thumb = el('img', 'mc-stock-thumb') as HTMLImageElement;
    thumb.src = url;
    thumb.alt = label;
    thumb.loading = 'lazy';
    item.appendChild(thumb);
    item.appendChild(el('span', 'mc-stock-label', label));
    item.addEventListener('click', () => onPick(url));
    gallery.appendChild(item);
  }

  toggle.addEventListener('click', () => {
    gallery.hidden = !gallery.hidden;
    toggle.textContent = gallery.hidden ? 'Choose from stock images…' : 'Hide stock images';
  });

  wrap.append(toggle, gallery);
  return wrap;
}

function buildPicturesSection(currentLang: string): HTMLElement {
  const wrap = el('div', 'mc-subsections');

  // The overrides list rebuilds itself in place on every change (a pick, a
  // custom picture, a Remove) rather than going through the whole tab's
  // refresh — that would also tear down and rebuild the search panel above
  // it, closing the search and losing the query every time a word's picture
  // is set, which is exactly the moment you're most likely to want to set
  // the next one too.
  const list = el('div', 'mc-list');
  function renderOverridesList(): void {
    list.innerHTML = '';
    const allOverrides = LANGUAGES.flatMap(info =>
      Object.entries(getPictureOverrides(info.name)).map(([word, value]) => ({ info, word, value })));
    if (allOverrides.length === 0) {
      list.appendChild(el('p', 'mc-empty', 'No picture overrides yet.'));
    } else {
      allOverrides.forEach(({ info, word, value }) => list.appendChild(
        buildPictureRow(info, word, value, renderOverridesList, () => panel.openWord(info.name, word)),
      ));
    }
  }

  const panel = buildPictureSearchPanel(currentLang, renderOverridesList);
  renderOverridesList();

  wrap.appendChild(panel.wrap);
  wrap.appendChild(list);
  return wrap;
}

interface PictureEditorPanel {
  wrap: HTMLElement;
  /** Jumps straight to editing `word`'s picture — what an overrides-list
   *  row calls instead of making the learner search for the word again. */
  openWord: (lang: string, word: string) => Promise<void>;
}

/**
 * The search UI plus the detail panel for whichever word is currently
 * selected. Kept as one closure (rather than threading state through
 * renderMyContent's own refresh) because switching languages needs an async
 * vocabulary load that the rest of the tab's synchronous
 * render-on-every-change pattern has no way to await.
 */
function buildPictureSearchPanel(defaultLang: string, refresh: () => void): PictureEditorPanel {
  const wrap = el('div', 'mc-word-panel-outer');

  const detail = el('div', 'mc-word-detail');
  detail.hidden = true;

  function selectWord(lang: string, w: Word): void {
    detail.innerHTML = '';
    detail.hidden = false;

    function afterChange(): void {
      selectWord(lang, w);
      ui.refreshResults();
      refresh();
    }

    const header = el('div', 'mc-word-detail-header');
    header.appendChild(buildLangBadge([lang]));
    header.appendChild(document.createTextNode(` ${w.word} — ${w.translation}`));
    detail.appendChild(header);

    const current = getPictureOverride(lang, w.word);
    const v = visualsFor(lang, w);

    const options = el('div', 'mc-pic-options');
    function addOption(label: string, value: string | null, kind: 'img' | 'emoji'): void {
      if (!value) return;
      const btn = el('button', 'mc-pic-option');
      btn.type = 'button';
      if (kind === 'img') {
        const img = el('img', 'mc-pic-option-img') as HTMLImageElement;
        img.src = value;
        img.alt = label;
        btn.appendChild(img);
      } else {
        btn.appendChild(el('span', 'mc-pic-option-emoji', value));
      }
      btn.appendChild(el('span', 'mc-pic-option-label', label));
      if (current === value) btn.classList.add('mc-pic-option--selected');
      btn.addEventListener('click', () => { setPictureOverride(lang, w.word, value); afterChange(); });
      options.appendChild(btn);
    }
    addOption('Photo', v.photo, 'img');
    addOption('Icon',  v.svg,   'img');
    addOption('Emoji', v.emoji, 'emoji');
    if (!options.hasChildNodes()) {
      options.appendChild(el('p', 'mc-empty', 'No built-in visuals for this word — set a custom one below.'));
    }
    detail.appendChild(options);

    const custom = el('div', 'mc-pic-custom');
    const customUrlI = textInput('Custom image URL…');
    const useUrlBtn = el('button', 'mc-btn mc-btn--secondary mc-btn--sm', 'Use URL');
    useUrlBtn.type = 'button';
    useUrlBtn.addEventListener('click', () => {
      if (!customUrlI.value.trim()) return;
      setPictureOverride(lang, w.word, customUrlI.value.trim());
      afterChange();
    });
    const urlRow = el('div', 'mc-pic-custom-row');
    urlRow.append(customUrlI, useUrlBtn);

    const fileI = el('input', 'mc-input') as HTMLInputElement;
    fileI.type = 'file';
    fileI.accept = 'image/*';
    fileI.addEventListener('change', () => {
      const file = fileI.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { setPictureOverride(lang, w.word, String(reader.result)); afterChange(); };
      reader.readAsDataURL(file);
    });

    custom.append(
      urlRow,
      field('...or upload a file', fileI),
      buildStockImagePicker(current && isImageOverride(current) ? current : null, url => {
        setPictureOverride(lang, w.word, url);
        afterChange();
      }),
    );
    detail.appendChild(custom);

    if (current) {
      const clearBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Clear override (use automatic default)');
      clearBtn.type = 'button';
      clearBtn.addEventListener('click', () => { removePictureOverride(lang, w.word); afterChange(); });
      detail.appendChild(clearBtn);
    }
  }

  const ui = buildWordSearchUI({
    defaultLang,
    placeholder: 'Search for a word with a photo, icon or emoji…',
    fetchWords: loadWords,
    isEligible: (lang, w) => hasAnyVisual(visualsFor(lang, w)) || !!getPictureOverride(lang, w.word),
    isOverridden: (lang, w) => !!getPictureOverride(lang, w.word),
    onSelect: selectWord,
    onLangChange: () => { detail.innerHTML = ''; detail.hidden = true; },
  });

  wrap.append(ui.wrap, detail);

  async function openWord(lang: string, word: string): Promise<void> {
    await ui.openWord(lang, word);
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  return { wrap, openWord };
}

/** `onOpen` reopens this word in the picture editor above — the row itself
 *  is clickable for that (see .mc-row--clickable), with Remove as the one
 *  carve-out that doesn't trigger it. */
function buildPictureRow(
  info: LanguageInfo, word: string, value: string, refresh: () => void, onOpen: () => void,
): HTMLElement {
  const row = el('div', 'mc-row mc-row--clickable');
  row.addEventListener('click', onOpen);

  if (isImageOverride(value)) {
    const thumb = el('img', 'mc-thumb') as HTMLImageElement;
    thumb.src = value;
    thumb.alt = word;
    row.appendChild(thumb);
  } else {
    row.appendChild(el('span', 'mc-thumb mc-thumb--emoji', value));
  }
  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${word}`));
  main.appendChild(title);
  row.appendChild(main);

  const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm', 'Remove');
  delBtn.type = 'button';
  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    removePictureOverride(info.name, word);
    refresh();
  });
  row.appendChild(delBtn);
  return row;
}
