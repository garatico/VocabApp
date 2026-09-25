import { LANGUAGES } from '../../data/languages.ts';
import { availableLanguages } from '../../data/vocab-source.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { foldKey } from '../../utils/match.ts';
import { fillHighlighted } from '../../utils/dom.ts';
import type { Word } from '../../types.ts';
import { el, textInput } from './shared.ts';

/**
 * my-content/word-search.ts — the word search box used by the word editor and
 * the pictures panel: matching, ranking and the results list.
 */

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
   *  language's word (it's no longer reachable in the new one), and re-scope
   *  anything the caller filters by the selected language. `lang` is the raw
   *  select value, so it's ALL_LANGS in "All languages" mode. The ✕ button
   *  and Escape only clear the search text/results; they leave a currently
   *  open detail view alone — see its own collapse toggle instead. */
  onLangChange: (lang: string) => void;
  /** Fires on every keystroke in the search box (and when it's cleared),
   *  with the trimmed query — lets a caller narrow a list of its own by the
   *  same text rather than needing a second, separate filter box. Optional:
   *  the Pictures panel has no such list to narrow. */
  onQueryChange?: (query: string) => void;
}

interface WordSearchUI {
  /** Search box + results list. Kept apart from `langRow` below so a caller
   *  can lay the two out independently — e.g. My Content's word editor puts
   *  the language picker up with its own Sort/filter toolbar and hides just
   *  this part while a row is open (see buildEditWordSubsection). */
  wrap: HTMLElement;
  /** The language picker alone. */
  langRow: HTMLElement;
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

/**
 * Relevance tier for one word against an already-folded query — lower sorts
 * first. Without this, `renderResults` below just filtered `words` in
 * whatever order the API returned it and sliced to RESULTS_LIMIT, so an
 * exact match could be truncated away entirely by thousands of weaker
 * substring matches ranked earlier in that array.
 *
 * This matters most for a short accented word like Portuguese "à": foldKey
 * strips diacritics for lenient matching, so searching "à" folds to "a" —
 * which is a substring of nearly every word's own spelling *or* English
 * translation ("that", "day", "man"...). Every one of those outranked the
 * exact word "à" itself under the old unsorted, capped list, so it could
 * never appear no matter how the results scrolled — indistinguishable from
 * the word not existing, even though the search box, the list, and the
 * editor beneath it were all otherwise working exactly as designed.
 */
function matchTier(w: Word, q: string): number {
  const wf = foldKey(w.word);
  if (wf === q) return 0;
  if (wf.startsWith(q)) return 1;
  if (foldKey(w.translation) === q) return 2;
  if (wf.includes(q)) return 3;
  if (foldKey(w.translation).startsWith(q)) return 4;
  return 5; // translation match, substring only
}

/** Sentinel `langSelect` value for "search every language at once" — never a
 *  real language name (LANGUAGES only ever holds those), so it can't
 *  collide. Each result in this mode carries its own real `.language`
 *  (tagged on fetch, below); everywhere this module would otherwise use the
 *  outer `lang` to call back into `opts`, it uses `w.language ?? lang`
 *  instead, so a normal single-language search (where results never carry
 *  `.language`) is completely unaffected. */
export const ALL_LANGS = '__all__';

export function buildWordSearchUI(opts: WordSearchUIOptions): WordSearchUI {
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
  langSelect.appendChild(new Option('All languages', ALL_LANGS));
  for (const info of LANGUAGES) {
    const lopt = document.createElement('option');
    lopt.value = info.name;
    lopt.textContent = info.label;
    langSelect.appendChild(lopt);
  }
  langSelect.value = lang;

  const langRow = el('div', 'mc-word-lang-row');
  langRow.append(el('span', 'ml-band-label', 'Language'), langSelect);

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
    opts.onSelect(w.language ?? lang, w);
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
    opts.onQueryChange?.(query.trim());
    resultsList.innerHTML = '';
    kbdIndex = -1;
    clearBtn.hidden = !query.trim();
    if (!words) { resultsList.hidden = true; countLabel.hidden = true; currentMatches = []; return; }
    const q = foldKey(query);
    if (!q) { resultsList.hidden = true; countLabel.hidden = true; currentMatches = []; return; }
    const allMatches = words
      .filter(w => opts.isEligible(w.language ?? lang, w))
      .filter(w => foldKey(w.word).includes(q) || foldKey(w.translation).includes(q))
      // Best matches first — see matchTier's own comment for why this is
      // what makes a short accented word like "à" reachable at all once its
      // fold-key ("a") also substring-matches thousands of other words.
      .map((w, i) => ({ w, tier: matchTier(w, q), i }))
      .sort((a, b) => a.tier - b.tier || a.i - b.i)
      .map(({ w }) => w);
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
      // Only set (and so only shown) in All-languages mode — see loadLang's
      // per-word tagging below — so a single-language search's rows are
      // unchanged from before this existed.
      if (w.language) li.appendChild(buildLangBadge([w.language]));
      const wordSpan = el('span', 'mc-word-result-word');
      fillHighlighted(wordSpan, w.word, query);
      const transSpan = el('span', 'mc-word-result-trans');
      fillHighlighted(transSpan, w.translation, query);
      li.append(wordSpan, transSpan);
      if (opts.isOverridden(w.language ?? lang, w)) li.appendChild(el('span', 'mc-word-result-flag', '✓ set'));
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
    opts.onLangChange(requestedLang);
    searchInput.value = '';
    // Clears the query text a caller's onQueryChange is tracking too — left
    // unset, a query typed before switching languages would keep silently
    // filtering whatever this caller narrows by its own text (see
    // buildEditWordSubsection), even though the search box on screen now
    // reads empty.
    opts.onQueryChange?.('');
    searchInput.disabled = true;
    searchInput.placeholder = requestedLang === ALL_LANGS ? 'Loading every language…' : 'Loading vocabulary…';
    // All-languages mode fetches every language with actual data up front
    // and tags each word with its own — the same `.language` field
    // multi-language Table/Conjugation sessions already use — rather than
    // switching the fetch per keystroke, so a query never has to wait on N
    // requests while typing. availableLanguages() skips one with no data
    // (e.g. Chinese) up front; the per-language .catch is a second net in
    // case that answer is stale, so one bad language can't fail the batch
    // and dump every other language's error toast on screen at once.
    const fetch = requestedLang === ALL_LANGS
      ? availableLanguages().then(available => {
          const targets = available ? LANGUAGES.filter(info => available.includes(info.name)) : LANGUAGES;
          return Promise.all(targets.map(info =>
            opts.fetchWords(info.name)
              .then(ws => ws.map(w => ({ ...w, language: info.name })))
              .catch(() => [] as Word[])));
        }).then(lists => lists.flat())
      : opts.fetchWords(requestedLang);
    return fetch.then(loaded => {
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

  wrap.append(searchRow, countLabel, resultsList);
  void loadLang();

  return { wrap, langRow, getLang: () => lang, refreshResults: () => renderResults(searchInput.value.trim()), openWord };
}
