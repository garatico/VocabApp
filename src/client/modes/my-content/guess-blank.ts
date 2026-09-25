import { getUserGuessBlankQuestions, addUserGuessBlankQuestion, removeUserGuessBlankQuestion, updateUserGuessBlankQuestion, getGuessBlankQuestionOverride, setGuessBlankQuestionOverride, removeGuessBlankQuestionOverride } from '../../data/user-content.ts';
import { getGuessBlankQuestions, type GuessBlankQuestion, type BlankCategory, type BlankDifficulty } from '../../data/guess-blank-questions.ts';
import { LANGUAGES, type LanguageInfo } from '../../data/languages.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { foldKey } from '../../utils/match.ts';
import { pageSlice, pageCountFor } from '../table-controls.ts';
import { languageRows } from './languages.ts';
import { buildSubsection } from './layout.ts';
import { MCSortDir, buildListPager, buildSortDirToggle, el, field, lines, myContentInitialPageSize, selectInput, textArea, textInput } from './shared.ts';
import { appendChipGroup } from './trivia.ts';
import { ALL_LANGS } from './word-search.ts';

/**
 * my-content/guess-blank.ts — add and edit your own Guess the Blank questions.
 */

// ── Guess the Blank questions ────────────────────────────────────────────────
// Same shape as Trivia above, but a question here is 2-4 clues (weakest
// first) rather than one line of text — see data/guess-blank-questions.ts.
// A textarea, one clue per line, stands in for the dynamic add/remove clue
// rows a fully general editor would need.

const BLANK_CATEGORIES: readonly BlankCategory[] = ['animal', 'object', 'place', 'person', 'food'];
const BLANK_DIFFICULTIES: readonly BlankDifficulty[] = ['easy', 'medium', 'hard'];

interface GuessBlankLangInputs { answer: HTMLInputElement; clues: HTMLTextAreaElement }

export function buildGuessBlankSection(currentLang: string, selectedLangs: Set<string>): HTMLElement {
  const wrap = el('div', 'mc-subsections');
  const editSub = buildEditGuessBlankSubsection(currentLang);
  wrap.appendChild(buildAddGuessBlankSubsection(currentLang, selectedLangs, editSub.refresh));
  wrap.appendChild(editSub.el);
  return wrap;
}

function buildAddGuessBlankSubsection(currentLang: string, selectedLangs: Set<string>, onAdded: () => void): HTMLElement {
  const sub = el('div', 'mc-subsection-fields');

  const form = el('div', 'mc-form');
  const answerEnI = textInput('Answer in English, e.g. "the monkey"');
  const cluesEnI = textArea('One clue per line, vaguest first (2-4 clues)');
  const categoryI = selectInput(BLANK_CATEGORIES);
  const difficultyI = selectInput(BLANK_DIFFICULTIES);
  form.append(
    field('Answer (English)', answerEnI), field('Category', categoryI), field('Difficulty', difficultyI),
  );
  sub.appendChild(form);
  sub.appendChild(field('Clues (English)', cluesEnI));

  const { rows, values: blankInputs } = languageRows<GuessBlankLangInputs>(currentLang, selectedLangs, info => {
    const answer = textInput(`Answer in ${info.label}`);
    const clues = textArea(`Clues in ${info.label}, one per line`);
    const rowWrap = el('div', 'mc-lang-row-stack');
    rowWrap.append(answer, clues);
    return { el: rowWrap, value: { answer, clues } };
  });
  sub.appendChild(rows);

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
    if (added > 0) onAdded();
  });
  sub.appendChild(addBtn);

  return buildSubsection('guessblank-add', 'Add a New Guess the Blank Question',
    'Write 2-4 clues per question, vaguest first — the mode reveals them one at a time as the learner asks for another hint.',
    sub);
}

/** Same shape as TriviaEntry above. */
interface GuessBlankEntry { info: LanguageInfo; q: GuessBlankQuestion; origin: 'builtin' | 'user'; overridden: boolean; }

// ── Guess the Blank sort/filter toolbar (Edit an Existing ... Question) ────
// Same shape as TriviaListState/applyTriviaSortFilter above — no domains
// row here, though: unlike TriviaQuestion, GuessBlankQuestion carries no
// domains field to filter by.

type BlankSortMode = 'answer' | 'category' | 'difficulty';
const BLANK_SORT_LABELS: Record<BlankSortMode, string> = {
  answer: 'Answer', category: 'Category', difficulty: 'Difficulty',
};
const BLANK_DIFFICULTY_ORDER: Record<BlankDifficulty, number> = { easy: 0, medium: 1, hard: 2 };

interface BlankListState { sort: BlankSortMode; dir: MCSortDir; category: Set<string>; difficulty: Set<string>; }

function applyBlankSortFilter(items: GuessBlankEntry[], state: BlankListState): GuessBlankEntry[] {
  let filtered = state.category.size === 0 ? items : items.filter(({ q }) => state.category.has(q.category));
  if (state.difficulty.size > 0) filtered = filtered.filter(({ q }) => state.difficulty.has(q.difficulty));
  const arr = [...filtered];
  const cmp = (a: GuessBlankEntry, b: GuessBlankEntry): number => {
    switch (state.sort) {
      case 'category':   return a.q.category.localeCompare(b.q.category) || a.q.answerTarget.localeCompare(b.q.answerTarget);
      case 'difficulty':  return BLANK_DIFFICULTY_ORDER[a.q.difficulty] - BLANK_DIFFICULTY_ORDER[b.q.difficulty]
        || a.q.answerTarget.localeCompare(b.q.answerTarget);
      default:            return a.q.answerTarget.localeCompare(b.q.answerTarget); // 'answer'
    }
  };
  const mul = state.dir === 'desc' ? -1 : 1;
  arr.sort((a, b) => mul * cmp(a, b));
  return arr;
}

/** Same reasoning as buildEditTriviaSubsection above, for the Guess the
 *  Blank bank (data/guess-blank-questions.ts). */
function buildEditGuessBlankSubsection(currentLang: string): { el: HTMLElement; refresh: () => void } {
  const sub = el('div', 'mc-subsection-fields');

  let expanded: { lang: string; id: string } | null = null;
  let pageIndex = 0;
  let searchLang = currentLang;
  let searchQuery = '';
  const sortState: BlankListState = { sort: 'answer', dir: 'asc', category: new Set(), difficulty: new Set() };

  // Same "server fetch, cached per language, kicked off lazily" shape as
  // buildEditTriviaSubsection's own builtinCache above, for
  // guess-blank-questions.ts's getGuessBlankQuestions.
  const builtinCache = new Map<string, GuessBlankQuestion[]>();

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
  (Object.keys(BLANK_SORT_LABELS) as BlankSortMode[]).forEach(mode => {
    sortSel.appendChild(new Option(BLANK_SORT_LABELS[mode], mode));
  });
  sortSel.value = sortState.sort;
  const onFilterChange = (): void => { pageIndex = 0; renderList(); };
  sortSel.addEventListener('change', () => { sortState.sort = sortSel.value as BlankSortMode; onFilterChange(); });
  const sortRow = el('div', 'mc-sort-control');
  sortRow.append(sortLabel, sortSel, buildSortDirToggle(sortState, onFilterChange));

  const topRow = el('div', 'mc-edit-top-row');
  topRow.append(langRow, sortRow);
  sub.appendChild(topRow);

  const chipsRow = el('div', 'mc-list-toolbar');
  appendChipGroup(chipsRow, 'Category', BLANK_CATEGORIES, sortState.category, onFilterChange);
  appendChipGroup(chipsRow, 'Difficulty', BLANK_DIFFICULTIES, sortState.difficulty, onFilterChange);
  sub.appendChild(chipsRow);

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

  function collectEntries(): GuessBlankEntry[] {
    const langs = searchLang === ALL_LANGS ? LANGUAGES : LANGUAGES.filter(l => l.name === searchLang);
    const entries: GuessBlankEntry[] = [];

    // Same "kick off the missing fetches, re-render once they land" shape
    // as buildEditTriviaSubsection's own collectEntries above.
    const stillLoading = langs.filter(info => !builtinCache.has(info.name));
    if (stillLoading.length > 0) {
      void Promise.all(stillLoading.map(info =>
        getGuessBlankQuestions(info.name).then(qs => builtinCache.set(info.name, qs)),
      )).then(renderList);
    }

    for (const info of langs) {
      const builtin = builtinCache.get(info.name) ?? [];
      for (const q0 of builtin) {
        const o = getGuessBlankQuestionOverride(info.name, q0.id);
        entries.push({ info, q: o ? { ...q0, ...o } : q0, origin: 'builtin', overridden: !!o });
      }
      for (const q of getUserGuessBlankQuestions(info.name)) entries.push({ info, q, origin: 'user', overridden: false });
    }
    return entries;
  }

  function renderList(): void {
    list.innerHTML = '';
    const all = collectEntries();
    if (all.length === 0) {
      list.appendChild(el('p', 'mc-empty', 'No Guess the Blank questions for this language yet.'));
      pager.sync(0, 0);
      return;
    }
    const qf = foldKey(searchQuery);
    const textFiltered = qf
      ? all.filter(({ q }) => foldKey(q.answerTarget).includes(qf) || foldKey(q.answerEn).includes(qf)
          || q.cluesTarget.some(c => foldKey(c).includes(qf)))
      : all;

    const filtered = applyBlankSortFilter(textFiltered, sortState);
    const pageSize = pager.getPageSize();
    const pages = pageCountFor(filtered.length, pageSize);
    pageIndex = Math.max(0, Math.min(pageIndex, pages - 1));
    const shown = pageSlice(filtered, pageSize, pageIndex);

    if (filtered.length === 0) {
      list.appendChild(el('p', 'mc-empty', 'No Guess the Blank questions match that filter.'));
    } else {
      shown.forEach(entry => {
        const isExpanded = !!expanded && expanded.lang === entry.info.name && expanded.id === entry.q.id;
        list.appendChild(buildGuessBlankEditRow(entry, isExpanded, () => openRow(entry.info.name, entry.q.id), renderList));
      });
    }
    pager.sync(pageIndex, filtered.length);
  }
  renderList();
  sub.appendChild(list);
  sub.appendChild(pager.row);

  return {
    el: buildSubsection('guessblank-edit', 'Edit an Existing Guess the Blank Question',
      'Every Guess the Blank question for the language(s) picked above, plus any you\'ve added — sort, filter or search to find one, then click it to override its clues, answer, category or difficulty.',
      sub),
    refresh: renderList,
  };
}

function buildGuessBlankEditRow(entry: GuessBlankEntry, expanded: boolean, onToggle: () => void, refresh: () => void): HTMLElement {
  const { info, q, origin, overridden } = entry;
  const wrap = el('div', 'mc-row-wrap');
  const row = el('div', 'mc-row mc-row--clickable' + (expanded ? ' mc-row--expanded' : ''));
  row.addEventListener('click', onToggle);

  const main = el('div', 'mc-row-main');
  const title = el('span', 'mc-row-title');
  title.appendChild(buildLangBadge([info.name]));
  title.appendChild(document.createTextNode(` ${q.answerTarget}`));
  main.appendChild(title);
  const tag = origin === 'user' ? 'Added by you · ' : overridden ? 'Edited · ' : '';
  main.appendChild(el('span', 'mc-row-meta',
    `${tag}${q.category} · ${q.difficulty} · ${q.cluesTarget.length} clue${q.cluesTarget.length === 1 ? '' : 's'}`));
  row.appendChild(main);

  if (origin === 'user') {
    const delBtn = el('button', 'mc-btn mc-btn--danger mc-btn--sm mc-row-actions', 'Remove');
    delBtn.type = 'button';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      removeUserGuessBlankQuestion(info.name, q.id);
      refresh();
    });
    row.appendChild(delBtn);
  }
  wrap.appendChild(row);

  if (expanded) {
    const detail = el('div', 'mc-row-detail');
    detail.appendChild(buildGuessBlankEditForm(entry, refresh));
    wrap.appendChild(detail);
  }
  return wrap;
}

/** Same reasoning as buildTriviaEditForm above. */
function buildGuessBlankEditForm(entry: GuessBlankEntry, refresh: () => void): HTMLElement {
  const { info, q, origin, overridden } = entry;
  const wrap = el('div');
  const form = el('div', 'mc-form');
  const answerTargetI = textInput(`Answer in ${info.label}`, q.answerTarget);
  const answerEnI = textInput('Answer in English, e.g. "the monkey"', q.answerEn);
  const categoryI = selectInput(BLANK_CATEGORIES, q.category);
  const difficultyI = selectInput(BLANK_DIFFICULTIES, q.difficulty);
  form.append(
    field(`Answer (${info.label})`, answerTargetI), field('Answer (English)', answerEnI),
    field('Category', categoryI), field('Difficulty', difficultyI),
  );
  wrap.appendChild(form);

  const cluesTargetI = textArea(`Clues in ${info.label}, one per line`, q.cluesTarget.join('\n'));
  const cluesEnI = textArea('One clue per line, vaguest first (2-4 clues)', q.cluesEn.join('\n'));
  wrap.appendChild(field(`Clues (${info.label})`, cluesTargetI));
  wrap.appendChild(field('Clues (English)', cluesEnI));

  if (origin === 'builtin') {
    wrap.appendChild(el('p', 'mc-empty',
      'This is one of the app\'s built-in Guess the Blank questions. Saving overrides how it looks and plays here — the original is never changed.'));
  }

  const saveBtn = el('button', 'mc-btn', 'Save changes');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', () => {
    const answerTarget = answerTargetI.value.trim();
    const cluesTarget = lines(cluesTargetI.value);
    if (!answerTarget || cluesTarget.length === 0) return;
    const patch = {
      category: categoryI.value as BlankCategory,
      difficulty: difficultyI.value as BlankDifficulty,
      cluesTarget,
      cluesEn: lines(cluesEnI.value).length ? lines(cluesEnI.value) : cluesTarget,
      answerTarget,
      answerEn: answerEnI.value.trim() || answerTarget,
    };
    if (origin === 'user') updateUserGuessBlankQuestion(info.name, q.id, patch);
    else setGuessBlankQuestionOverride(info.name, q.id, patch);
    refresh();
  });
  wrap.appendChild(saveBtn);

  if (origin === 'builtin' && overridden) {
    const resetBtn = el('button', 'mc-btn mc-btn--secondary', 'Reset to original');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', () => { removeGuessBlankQuestionOverride(info.name, q.id); refresh(); });
    wrap.appendChild(resetBtn);
  }
  return wrap;
}
