import { getUserTriviaQuestions, addUserTriviaQuestion, removeUserTriviaQuestion, updateUserTriviaQuestion, getTriviaQuestionOverride, setTriviaQuestionOverride, removeTriviaQuestionOverride } from '../../data/user-content.ts';
import { getTriviaQuestions, type TriviaQuestion, type TriviaCategory, type TriviaDifficulty, type ReadingDifficulty, type ReadingLength, type AnswerType } from '../../data/trivia-questions.ts';
import { LANGUAGES, type LanguageInfo } from '../../data/languages.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { foldKey } from '../../utils/match.ts';
import { pageSlice, pageCountFor } from '../table-controls.ts';
import { languageRows } from './languages.ts';
import { buildSubsection } from './layout.ts';
import { MCSortDir, appendDomainChips, buildListPager, buildSortDirToggle, csv, el, field, myContentInitialPageSize, selectInput, textArea, textInput } from './shared.ts';
import { ALL_LANGS } from './word-search.ts';

/**
 * my-content/trivia.ts — add and edit your own Trivia questions.
 */

// ── Trivia questions ─────────────────────────────────────────────────────────

const CATEGORIES: readonly TriviaCategory[] = ['history', 'pop-culture'];
const DIFFICULTIES: readonly TriviaDifficulty[] = ['easy', 'medium', 'hard'];
const READING_DIFFICULTIES: readonly ReadingDifficulty[] = ['easy', 'medium', 'hard'];
const READING_LENGTHS: readonly ReadingLength[] = ['short', 'long'];
const ANSWER_TYPES: readonly AnswerType[] = ['year', 'number', 'person', 'place', 'thing'];

interface TriviaLangInputs { question: HTMLInputElement; answers: HTMLInputElement }

export function buildTriviaSection(currentLang: string, selectedLangs: Set<string>): HTMLElement {
  const wrap = el('div', 'mc-subsections');
  const editSub = buildEditTriviaSubsection(currentLang);
  wrap.appendChild(buildAddTriviaSubsection(currentLang, selectedLangs, editSub.refresh));
  wrap.appendChild(editSub.el);
  return wrap;
}

function buildAddTriviaSubsection(currentLang: string, selectedLangs: Set<string>, onAdded: () => void): HTMLElement {
  const sub = el('div', 'mc-subsection-fields');

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
  sub.appendChild(form);

  const { rows, values: triviaInputs } = languageRows<TriviaLangInputs>(currentLang, selectedLangs, info => {
    const question = textInput(`Question in ${info.label}`);
    const answers = textInput('Accepted answers, comma-separated');
    const rowWrap = el('div', 'mc-lang-row-inputs');
    rowWrap.append(question, answers);
    return { el: rowWrap, value: { question, answers } };
  });
  sub.appendChild(rows);

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
    if (added > 0) onAdded();
  });
  sub.appendChild(addBtn);

  return buildSubsection('trivia-add', 'Add a New Trivia Question',
    'Fill in the question and answer for whichever languages you\'re writing it in — each becomes its own entry in that language\'s bank.',
    sub);
}

/** One row in the Edit list: either a built-in trivia question (from
 *  data/trivia-questions.ts, `overridden` says whether My Content has
 *  patched it) or one a learner added themselves via the Add form above. */
interface TriviaEntry { info: LanguageInfo; q: TriviaQuestion; origin: 'builtin' | 'user'; overridden: boolean; }

// ── Trivia sort/filter toolbar (Edit an Existing Trivia Question) ──────────
// Same shape as MCListState/applyMCSortFilter above, sized to trivia's own
// fields (category/difficulty stand in for Part of Speech/Level) rather than
// forcing those word-specific dimensions onto a question. `dir` is still the
// same MCSortDir buildSortDirToggle already knows how to drive.

type TriviaSortMode = 'question' | 'category' | 'difficulty';
const TRIVIA_SORT_LABELS: Record<TriviaSortMode, string> = {
  question: 'Question', category: 'Category', difficulty: 'Difficulty',
};
const TRIVIA_DIFFICULTY_ORDER: Record<TriviaDifficulty, number> = { easy: 0, medium: 1, hard: 2 };

interface TriviaListState { sort: TriviaSortMode; dir: MCSortDir; category: Set<string>; difficulty: Set<string>; domains: Set<string>; }

function applyTriviaSortFilter(items: TriviaEntry[], state: TriviaListState): TriviaEntry[] {
  let filtered = state.category.size === 0 ? items : items.filter(({ q }) => state.category.has(q.category));
  if (state.difficulty.size > 0) filtered = filtered.filter(({ q }) => state.difficulty.has(q.difficulty));
  // Any-match, not all-match — same reasoning as applyMCSortFilter's own
  // domains check: a question tagged both "history" and "culture" should
  // still show up when only "history" is checked.
  if (state.domains.size > 0) filtered = filtered.filter(({ q }) => q.domains.some(d => state.domains.has(d)));
  const arr = [...filtered];
  const cmp = (a: TriviaEntry, b: TriviaEntry): number => {
    switch (state.sort) {
      case 'category':   return a.q.category.localeCompare(b.q.category) || a.q.questionTarget.localeCompare(b.q.questionTarget);
      case 'difficulty':  return TRIVIA_DIFFICULTY_ORDER[a.q.difficulty] - TRIVIA_DIFFICULTY_ORDER[b.q.difficulty]
        || a.q.questionTarget.localeCompare(b.q.questionTarget);
      default:            return a.q.questionTarget.localeCompare(b.q.questionTarget); // 'question'
    }
  };
  const mul = state.dir === 'desc' ? -1 : 1;
  arr.sort((a, b) => mul * cmp(a, b));
  return arr;
}

/** "pop-culture" → "Pop culture", "easy" → "Easy" — same single-
 *  leading-capital convention formatDomainLabel above uses for domains,
 *  applied to trivia/Guess the Blank's own category and difficulty values
 *  (hyphenated or plain) so their filter chips read as words, not raw enum
 *  keys, without a separate display-name table to keep in sync with either
 *  fixed value list. */
function formatChipLabel(v: string): string {
  return v.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
}

/** One chip row — "All" plus one pill per value in `values` — same
 *  `.pos-chip`/"All" shape appendPosChips uses for Part of Speech, reused
 *  here for any small fixed value set (trivia/Guess the Blank's own
 *  category and difficulty) rather than a near-identical function per set. */
export function appendChipGroup(
  target: HTMLElement, groupLabel: string, values: readonly string[], selected: Set<string>, onChange: () => void,
): void {
  target.appendChild(el('span', 'ml-band-label mc-toolbar-group-label', groupLabel));
  const allChip = el('button', 'pos-chip pos-chip-all', 'All');
  allChip.type = 'button';
  allChip.classList.toggle('active', selected.size === 0);
  allChip.addEventListener('click', () => { selected.clear(); onChange(); });
  target.appendChild(allChip);
  values.forEach(v => {
    const chip = el('button', 'pos-chip', formatChipLabel(v));
    chip.type = 'button';
    chip.classList.toggle('active', selected.has(v));
    chip.addEventListener('click', () => {
      if (selected.has(v)) selected.delete(v); else selected.add(v);
      onChange();
    });
    target.appendChild(chip);
  });
}

/**
 * Every trivia question for the language(s) picked above — built-in
 * (data/trivia-questions.ts, overrides applied) and added via the form
 * above — in one paginated, scrollable list, same row/expand-to-edit/
 * sort-and-filter shape as buildEditWordSubsection's own overrides list.
 * Unlike that one, this doesn't wait for a typed query before showing
 * anything: the whole bank is small enough (low hundreds at most) to just
 * page through directly, so the search box here only narrows the list
 * already on screen rather than being the only way to find something in
 * the first place.
 */
function buildEditTriviaSubsection(currentLang: string): { el: HTMLElement; refresh: () => void } {
  const sub = el('div', 'mc-subsection-fields');

  let expanded: { lang: string; id: string } | null = null;
  let pageIndex = 0;
  let searchLang = currentLang;
  let searchQuery = '';
  const sortState: TriviaListState = { sort: 'question', dir: 'asc', category: new Set(), difficulty: new Set(), domains: new Set() };

  // The built-in bank itself (override-free) is now a server fetch — see
  // trivia-questions.ts's own getTriviaQuestions — so it's cached here per
  // language exactly the way buildEditWordSubsection's ensureWords/
  // rawWordsCache above cache the vocabulary fetch: a language whose bank
  // isn't loaded yet just contributes nothing to collectEntries() below
  // until the fetch resolves and re-renders the list, rather than every
  // sort/filter/search keystroke needing to become async itself.
  const builtinCache = new Map<string, TriviaQuestion[]>();

  const list = el('div', 'mc-list mc-scroll-list');
  const pager = buildListPager(i => { pageIndex = i; renderList(); }, () => { pageIndex = 0; renderList(); }, myContentInitialPageSize());

  function openRow(lang: string, id: string): void {
    const same = expanded?.lang === lang && expanded.id === id;
    expanded = same ? null : { lang, id };
    pageIndex = 0;
    renderList();
    if (expanded) list.querySelector('.mc-row--expanded')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const langSelect = document.createElement('select');
  langSelect.className = 'mc-input mc-word-lang-select';
  langSelect.appendChild(new Option('All languages', ALL_LANGS));
  for (const info of LANGUAGES) langSelect.appendChild(new Option(info.label, info.name));
  langSelect.value = searchLang;
  langSelect.addEventListener('change', () => { searchLang = langSelect.value; pageIndex = 0; renderList(); });
  const langRow = el('div', 'mc-word-lang-row');
  langRow.append(el('span', 'ml-band-label', 'Language'), langSelect);

  const sortLabel = el('span', 'ml-band-label', 'Sort');
  const sortSel = el('select', 'mc-input mc-list-toolbar-select');
  (Object.keys(TRIVIA_SORT_LABELS) as TriviaSortMode[]).forEach(mode => {
    sortSel.appendChild(new Option(TRIVIA_SORT_LABELS[mode], mode));
  });
  sortSel.value = sortState.sort;
  const onFilterChange = (): void => { pageIndex = 0; renderList(); };
  sortSel.addEventListener('change', () => { sortState.sort = sortSel.value as TriviaSortMode; onFilterChange(); });
  const sortRow = el('div', 'mc-sort-control');
  sortRow.append(sortLabel, sortSel, buildSortDirToggle(sortState, onFilterChange));

  const topRow = el('div', 'mc-edit-top-row');
  topRow.append(langRow, sortRow);
  sub.appendChild(topRow);

  const chipsRow = el('div', 'mc-list-toolbar');
  appendChipGroup(chipsRow, 'Category', CATEGORIES, sortState.category, onFilterChange);
  appendChipGroup(chipsRow, 'Difficulty', DIFFICULTIES, sortState.difficulty, onFilterChange);
  sub.appendChild(chipsRow);

  const domainsRow = el('div', 'mc-list-toolbar');
  sub.appendChild(domainsRow);

  const searchInput = textInput('Search to narrow the list below…');
  const clearBtn = el('button', 'mc-word-search-clear', '✕');
  clearBtn.type = 'button';
  clearBtn.hidden = true;
  clearBtn.setAttribute('aria-label', 'Clear search');
  clearBtn.addEventListener('click', () => { searchInput.value = ''; searchQuery = ''; clearBtn.hidden = true; onFilterChange(); searchInput.focus(); });
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    clearBtn.hidden = !searchQuery;
    onFilterChange();
  });
  const searchRow = el('div', 'mc-word-search-row');
  searchRow.append(searchInput, clearBtn);
  sub.appendChild(searchRow);

  function collectEntries(): TriviaEntry[] {
    const langs = searchLang === ALL_LANGS ? LANGUAGES : LANGUAGES.filter(l => l.name === searchLang);
    const entries: TriviaEntry[] = [];

    // Same "kick off the missing fetches, re-render once they land" shape
    // as buildEditWordSubsection's own ensureWords/stillLoading above — a
    // language not yet in builtinCache just contributes no builtin rows on
    // *this* call.
    const stillLoading = langs.filter(info => !builtinCache.has(info.name));
    if (stillLoading.length > 0) {
      void Promise.all(stillLoading.map(info =>
        getTriviaQuestions(info.name).then(qs => builtinCache.set(info.name, qs)),
      )).then(renderList);
    }

    for (const info of langs) {
      const builtin = builtinCache.get(info.name) ?? [];
      for (const q0 of builtin) {
        const o = getTriviaQuestionOverride(info.name, q0.id);
        entries.push({ info, q: o ? { ...q0, ...o } : q0, origin: 'builtin', overridden: !!o });
      }
      for (const q of getUserTriviaQuestions(info.name)) entries.push({ info, q, origin: 'user', overridden: false });
    }
    return entries;
  }

  function renderList(): void {
    list.innerHTML = '';
    const all = collectEntries();
    if (all.length === 0) {
      list.appendChild(el('p', 'mc-empty', 'No trivia questions for this language yet.'));
      domainsRow.hidden = true;
      pager.sync(0, 0);
      return;
    }
    const qf = foldKey(searchQuery);
    const textFiltered = qf
      ? all.filter(({ q }) => foldKey(q.questionTarget).includes(qf) || foldKey(q.questionEn).includes(qf))
      : all;

    // How many of the questions currently in view (this language, this
    // search query) carry each domain — same "count next to the label" as
    // appendDomainChips' other callers.
    const domainCounts = new Map<string, number>();
    textFiltered.forEach(({ q }) => q.domains.forEach(d => domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1)));
    domainsRow.innerHTML = '';
    appendDomainChips(domainsRow, domainCounts, sortState.domains, textFiltered.length, onFilterChange);
    domainsRow.hidden = domainCounts.size === 0;

    const filtered = applyTriviaSortFilter(textFiltered, sortState);
    const pageSize = pager.getPageSize();
    const pages = pageCountFor(filtered.length, pageSize);
    pageIndex = Math.max(0, Math.min(pageIndex, pages - 1));
    const shown = pageSlice(filtered, pageSize, pageIndex);

    if (filtered.length === 0) {
      list.appendChild(el('p', 'mc-empty', 'No trivia questions match that filter.'));
    } else {
      shown.forEach(entry => {
        const isExpanded = !!expanded && expanded.lang === entry.info.name && expanded.id === entry.q.id;
        list.appendChild(buildTriviaEditRow(entry, isExpanded, () => openRow(entry.info.name, entry.q.id), renderList));
      });
    }
    pager.sync(pageIndex, filtered.length);
  }
  renderList();
  sub.appendChild(list);
  sub.appendChild(pager.row);

  return {
    el: buildSubsection('trivia-edit', 'Edit an Existing Trivia Question',
      'Every trivia question for the language(s) picked above, plus any you\'ve added — sort, filter or search to find one, then click it to override its wording, answers, category or difficulty.',
      sub),
    refresh: renderList,
  };
}

function buildTriviaEditRow(entry: TriviaEntry, expanded: boolean, onToggle: () => void, refresh: () => void): HTMLElement {
  const { info, q, origin, overridden } = entry;
  const wrap = el('div', 'mc-row-wrap');
  const row = el('div', 'mc-row mc-row--clickable' + (expanded ? ' mc-row--expanded' : ''));
  row.addEventListener('click', onToggle);

  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${q.questionTarget}`));
  main.appendChild(title);
  const tag = origin === 'user' ? 'Added by you · ' : overridden ? 'Edited · ' : '';
  main.appendChild(el('span', 'mc-row-meta',
    `${tag}${q.difficulty} · reading ${q.readingDifficulty}/${q.readingLength} · ${q.answerType} · answer: ${q.answersTarget[0]}`));
  row.appendChild(main);

  if (origin === 'user') {
    const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm mc-row-actions', 'Remove');
    delBtn.type = 'button';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      removeUserTriviaQuestion(info.name, q.id);
      refresh();
    });
    row.appendChild(delBtn);
  }
  wrap.appendChild(row);

  if (expanded) {
    const detail = el('div', 'mc-row-detail');
    detail.appendChild(buildTriviaEditForm(entry, refresh));
    wrap.appendChild(detail);
  }
  return wrap;
}

/**
 * Pre-filled twin of the Add form's fields. Saves with
 * updateUserTriviaQuestion for a question a learner added themselves, or
 * setTriviaQuestionOverride for a built-in one — the built-in bank itself
 * (data/trivia-questions.ts) is shipped source and never touched; overriding
 * one just patches how it appears and plays from here on, and a built-in
 * question that's already overridden gets a "Reset to original" button to
 * drop that patch entirely.
 */
function buildTriviaEditForm(entry: TriviaEntry, refresh: () => void): HTMLElement {
  const { info, q, origin, overridden } = entry;
  const wrap = el('div');

  // Textareas, not the plain single-line inputs the Add form above still
  // uses — a trivia question routinely runs longer than a text input can
  // show at once, and this is the one place a learner needs to read the
  // *whole* thing back to check an edit, not just glance at a summary row.
  // Full-width fields of their own above .mc-form, same reasoning as the Add
  // Word form's Example sentences/Additional senses: .mc-form's flex-wrap
  // row caps every field at ~180px, which a paragraph-length textarea would
  // just be cramped inside.
  const qTargetI = textArea(`Question in ${info.label}`, q.questionTarget);
  const qEnI = textArea('Question in English', q.questionEn);
  wrap.appendChild(field(`Question (${info.label})`, qTargetI));
  wrap.appendChild(field('Question (English)', qEnI));

  const form = el('div', 'mc-form');
  const ansTargetI = textInput('Accepted answers, comma-separated', q.answersTarget.join(', '));
  const ansEnI = textInput('Accepted English answers, comma-separated', q.answersEn.join(', '));
  const categoryI = selectInput(CATEGORIES, q.category);
  const difficultyI = selectInput(DIFFICULTIES, q.difficulty);
  const readingDiffI = selectInput(READING_DIFFICULTIES, q.readingDifficulty);
  const readingLenI = selectInput(READING_LENGTHS, q.readingLength);
  const answerTypeI = selectInput(ANSWER_TYPES, q.answerType);
  const domainsI = textInput('e.g. history, geography (comma-separated)', q.domains.join(', '));
  form.append(
    field('Accepted answers', ansTargetI), field('Accepted answers (English)', ansEnI),
    field('Category', categoryI), field('Trivia difficulty', difficultyI),
    field('Reading difficulty', readingDiffI), field('Reading length', readingLenI),
    field('Answer type', answerTypeI), field('Domains', domainsI),
  );
  wrap.appendChild(form);

  if (origin === 'builtin') {
    wrap.appendChild(el('p', 'mc-empty',
      'This is one of the app\'s built-in trivia questions. Saving overrides how it looks and plays here — the original is never changed.'));
  }

  const saveBtn = el('button', 'mc-btn', 'Save changes');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', () => {
    const questionTarget = qTargetI.value.trim();
    const answersTarget = csv(ansTargetI.value);
    if (!questionTarget || answersTarget.length === 0) return;
    const patch = {
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
    if (origin === 'user') updateUserTriviaQuestion(info.name, q.id, patch);
    else setTriviaQuestionOverride(info.name, q.id, patch);
    refresh();
  });
  wrap.appendChild(saveBtn);

  if (origin === 'builtin' && overridden) {
    const resetBtn = el('button', 'mc-btn mc-btn--secondary', 'Reset to original');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => { removeTriviaQuestionOverride(info.name, q.id); refresh(); });
    wrap.appendChild(resetBtn);
  }
  return wrap;
}
