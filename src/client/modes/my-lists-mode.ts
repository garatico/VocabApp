/**
 * my-lists-mode.ts — My Lists tab panel.
 *
 * Features:
 *  - Add words via accent-insensitive search (word + translation)
 *  - Keyboard nav in search (↑↓ navigate, Enter add, Escape close)
 *  - Add-all button on search results
 *  - Sort (A-Z, Z-A, easiest, hardest) and POS chip filter
 *  - POS badge + translation on every word row
 *  - Word preview on click (glosses, example, IPA)
 *  - POS/difficulty stats line in header
 *  - Export list as .txt
 *  - Move word to another list
 *  - Copy word to another list
 *  - Duplicate list
 */

import type { Word as ApiWord } from '../types.ts';
import {
  getListNames, getList, addToList, createList,
  deleteList, renameList, removeFromList,
  refreshFilterSelect, getTotalListedCount, saveListFilterState,
} from '../utils/word-lists.ts';
import { stripDiacritics } from '../utils/match.ts';
import { logger } from '../utils/logger.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface VocabEntry {
  word:        string;
  translation: string;
  pos:         string | null;
  rank:        number | null;
  glosses:     string[];
  examples:    string[];
  ipa:         string | null;
}

type SortMode = 'alpha-asc' | 'alpha-desc' | 'rank-asc' | 'rank-desc';

// ── POS helpers ───────────────────────────────────────────────────────────────

// Short labels for word-row badges
const POS_ABBREV: Record<string, string> = {
  verb: 'verb', noun: 'noun', adjective: 'adj',
  adverb: 'adv', pronoun: 'pron', preposition: 'prep',
  conjunction: 'conj', article: 'art',
};

// Full pluralized labels for the stats row
const POS_LABEL: Record<string, string> = {
  verb: 'Verbs', noun: 'Nouns', adjective: 'Adjectives',
  adverb: 'Adverbs', pronoun: 'Pronouns', preposition: 'Prepositions',
  conjunction: 'Conjunctions', article: 'Articles',
};

type ExportFormat = 'with-translation' | 'words-only';

// ── Vocabulary cache ──────────────────────────────────────────────────────────

const vocabCache    = new Map<string, VocabEntry[]>();
const vocabMapCache = new Map<string, Map<string, VocabEntry>>();

async function fetchVocab(lang: string): Promise<VocabEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (vocabCache.has(lang)) return vocabCache.get(lang)!; // safe: has() checked immediately above
  try {
    const res  = await fetch(`/api/vocab/${lang}`);
    const json = await res.json();
    const data = (json.data ?? []) as ApiWord[];
    const entries: VocabEntry[] = data
      .filter(w => w.word)
      .map(w => ({
        word:        w.word,
        translation: w.translation || '',
        pos:         w.pos         || null,
        rank:        w.frequency?.rank ?? w.rank ?? null,
        glosses:     Array.isArray(w.glosses)  ? w.glosses.filter(Boolean)  : [],
        examples:    Array.isArray(w.examples) ? w.examples.filter(Boolean) : [],
        ipa:         w.linguistic?.ipa || null,
      }));
    vocabCache.set(lang, entries);
    vocabMapCache.set(lang, new Map(entries.map(e => [e.word, e])));
    return entries;
  } catch {
    return [];
  }
}

function norm(s: string): string {
  return stripDiacritics((s || '').toLowerCase().trim());
}

// ── Move popover (module-level so it survives re-renders) ─────────────────────

let activePopover: HTMLElement | null = null;
function closePopover(): void { activePopover?.remove(); activePopover = null; }

// ── Duplicate list helper ─────────────────────────────────────────────────────

function duplicateList(lang: string, sourceName: string): string {
  const names = getListNames(lang);
  let newName = sourceName + ' (copy)';
  let n = 2;
  while (names.includes(newName)) newName = `${sourceName} (${n++})`;
  createList(lang, newName);
  for (const w of getList(lang, sourceName)) addToList(lang, newName, w);
  return newName;
}

// ── Export helper ─────────────────────────────────────────────────────────────

function exportList(
  words: string[], vocabMap: Map<string, VocabEntry> | undefined,
  listName: string, lang: string,
  format: ExportFormat = 'with-translation',
): void {
  let content: string;
  let filename: string;
  if (format === 'words-only') {
    content  = words.join('\n');
    filename = `${listName}-${lang}-words.txt`;
  } else {
    const lines = words.map(w => {
      const e = vocabMap?.get(w);
      return e?.translation ? `${w}\t${e.translation}` : w;
    });
    content  = lines.join('\n');
    filename = `${listName}-${lang}.txt`;
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Mastery helpers ─────────────────────────────────────────────────────────

function getMastered(lang: string, listName: string): Set<string> {
  try {
    const raw = localStorage.getItem(`vq_mastery_${lang}_${listName}`);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function saveMastered(lang: string, listName: string, mastered: Set<string>): void {
  localStorage.setItem(`vq_mastery_${lang}_${listName}`, JSON.stringify([...mastered]));
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function renderMyLists(container: HTMLElement): void {
  container.innerHTML = '';

  let lang: string =
    (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
  let selectedList  = getListNames(lang)[0] ?? '';
  let sortMode: SortMode = 'alpha-asc';
  let expandedWord: string | null = null;
  const selectedPos = new Set<string>();
  let hideMastered = false;

  // ── Left pane ──────────────────────────────────────────────────────────────

  const leftPane     = document.createElement('div');
  leftPane.className = 'ml-left-pane';

  const langRow     = document.createElement('div');
  langRow.className = 'ml-lang-row';
  const langLabel       = document.createElement('span');
  langLabel.className   = 'ml-lang-label';
  langLabel.textContent = 'Language';
  const langSel     = document.createElement('select');
  langSel.className = 'ml-lang-select';
  (['spanish', 'portuguese', 'italian', 'french'] as const).forEach(l => {
    const opt = document.createElement('option');
    opt.value = l; opt.textContent = l.charAt(0).toUpperCase() + l.slice(1);
    opt.selected = l === lang; langSel.appendChild(opt);
  });
  langSel.addEventListener('change', () => {
    lang = langSel.value; selectedList = getListNames(lang)[0] ?? '';
    closePopover(); renderSidebar();
  });
  langRow.appendChild(langLabel); langRow.appendChild(langSel);
  leftPane.appendChild(langRow);

  const header = document.createElement('div');
  header.className = 'ml-header';
  const titleSpan = document.createElement('span');
  titleSpan.className = 'ml-sidebar-title'; titleSpan.textContent = 'Lists';
  const newListBtn = document.createElement('button');
  newListBtn.type = 'button'; newListBtn.className = 'ml-new-list-btn';
  newListBtn.title = 'Create new list'; newListBtn.textContent = '+ New';
  newListBtn.addEventListener('click', () => startCreateList());
  header.appendChild(titleSpan); header.appendChild(newListBtn);
  leftPane.appendChild(header);

  const listNav = document.createElement('ul');
  listNav.className = 'ml-list-nav';
  leftPane.appendChild(listNav);
  container.appendChild(leftPane);

  // ── Right pane ─────────────────────────────────────────────────────────────

  const panel = document.createElement('div');
  panel.className = 'ml-panel';
  container.appendChild(panel);

  // ── Sidebar ────────────────────────────────────────────────────────────────

  function renderSidebar(): void {
    listNav.innerHTML = '';
    const names = getListNames(lang);

    if (names.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ml-list-empty'; empty.textContent = 'No lists yet.';
      listNav.appendChild(empty); selectedList = ''; renderPanel(); return;
    }

    if (!names.includes(selectedList)) selectedList = names[0];

    names.forEach(name => {
      const li = document.createElement('li');
      li.className = 'ml-list-item' + (name === selectedList ? ' active' : '');

      const nameSpan = document.createElement('span');
      nameSpan.className = 'ml-list-name'; nameSpan.textContent = name; nameSpan.title = name;

      const countSpan = document.createElement('span');
      countSpan.className = 'ml-list-count';
      countSpan.textContent = String(getList(lang, name).length);

      const actions = document.createElement('span');
      actions.className = 'ml-list-actions';

      // Duplicate
      const dupBtn = document.createElement('button');
      dupBtn.type = 'button'; dupBtn.className = 'ml-icon-btn';
      dupBtn.title = 'Duplicate list'; dupBtn.textContent = '⧉';
      dupBtn.addEventListener('click', e => {
        e.stopPropagation();
        const newName = duplicateList(lang, name);
        selectedList = newName; updateBadge(); renderSidebar();
      });

      // Rename
      const renameBtn = document.createElement('button');
      renameBtn.type = 'button'; renameBtn.className = 'ml-icon-btn';
      renameBtn.title = 'Rename'; renameBtn.textContent = '✏';
      renameBtn.addEventListener('click', e => {
        e.stopPropagation(); startRenameList(name, li, nameSpan);
      });

      // Delete
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button'; deleteBtn.className = 'ml-icon-btn ml-icon-btn--danger';
      deleteBtn.title = 'Delete list'; deleteBtn.textContent = '🗑';
      deleteBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (window.confirm(`Delete list "${name}" and all its words?`)) {
          deleteList(lang, name);
          if (selectedList === name) selectedList = '';
          updateBadge(); renderSidebar();
        }
      });

      actions.appendChild(dupBtn); actions.appendChild(renameBtn); actions.appendChild(deleteBtn);
      li.appendChild(nameSpan); li.appendChild(countSpan); li.appendChild(actions);
      li.addEventListener('click', () => {
        selectedList = name; closePopover(); renderSidebar(); renderPanel();
      });
      listNav.appendChild(li);
    });

    renderPanel();
  }

  // ── Panel ──────────────────────────────────────────────────────────────────

  function renderPanel(): void {
    closePopover(); expandedWord = null; panel.innerHTML = '';

    if (!selectedList) {
      const empty = document.createElement('p');
      empty.className = 'ml-panel-empty'; empty.textContent = 'Create a list to get started.';
      panel.appendChild(empty); return;
    }

    // Header — title + count + export
    const panelHeader = document.createElement('div');
    panelHeader.className = 'ml-panel-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'ml-panel-title-group';
    const title = document.createElement('h2');
    title.className = 'ml-panel-title'; title.textContent = selectedList;
    const countBadge = document.createElement('span');
    countBadge.className = 'ml-panel-count';
    countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button'; exportBtn.className = 'ml-export-btn';
    exportBtn.textContent = '↓ Export';

    const exportFmtSel = document.createElement('select');
    exportFmtSel.className = 'ml-export-format-sel';
    exportFmtSel.title = 'Export format';
    ([
      ['with-translation', 'Word + translation'],
      ['words-only',       'Words only'],
    ] as const).forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value; opt.textContent = label;
      exportFmtSel.appendChild(opt);
    });

    exportBtn.addEventListener('click', () => {
      const fmt = exportFmtSel.value as ExportFormat;
      exportList(sortWords(getList(lang, selectedList)), vocabMapCache.get(lang), selectedList, lang, fmt);
    });
    const quizBtn       = document.createElement('button');
    quizBtn.type        = 'button';
    quizBtn.className   = 'ml-quiz-btn';
    quizBtn.title       = 'Focus this list and start a quiz';
    quizBtn.textContent = '▶ Quiz';
    quizBtn.addEventListener('click', () => {
      if (!selectedList) return;
      saveListFilterState(lang, { mode: 'focus', selected: [selectedList] });
      refreshFilterSelect(lang);
      const savedMode = localStorage.getItem('vq_mode');
      const targetMode = (!savedMode || savedMode === 'mylists') ? 'table' : savedMode;
      document.querySelector<HTMLElement>(`.mode-tab[data-mode="${targetMode}"]`)?.click();
      (document.getElementById('startBtn') as HTMLButtonElement | null)?.click();
    });

    titleGroup.appendChild(title); titleGroup.appendChild(countBadge);
    titleGroup.appendChild(exportBtn); titleGroup.appendChild(exportFmtSel);
    titleGroup.appendChild(quizBtn);

    // Stats row — updates after renderWords()
    const statsRow = document.createElement('div');
    statsRow.className = 'ml-stats-row';

    // Controls — filter + sort
    const controlsGroup = document.createElement('div');
    controlsGroup.className = 'ml-panel-controls';
    const filterInp = document.createElement('input');
    filterInp.type = 'text'; filterInp.placeholder = 'Filter by word or translation…';
    filterInp.className = 'ml-search';
    filterInp.title = 'Accent-insensitive — searches word and translation';
    const sortSel = document.createElement('select');
    sortSel.className = 'ml-sort-select'; sortSel.title = 'Sort order';
    ([
      ['alpha-asc',  'A → Z'],
      ['alpha-desc', 'Z → A'],
      ['rank-asc',   'Easiest first'],
      ['rank-desc',  'Hardest first'],
    ] as const).forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value; opt.textContent = label; opt.selected = value === sortMode;
      sortSel.appendChild(opt);
    });
    sortSel.addEventListener('change', () => { sortMode = sortSel.value as SortMode; renderWords(filterInp.value); });
    const hideMasteredBtn = document.createElement('button');
    hideMasteredBtn.type = 'button';
    hideMasteredBtn.className = 'ml-hide-mastered-btn';
    hideMasteredBtn.textContent = 'Hide mastered';
    hideMasteredBtn.title = 'Hide words you have marked as mastered';
    hideMasteredBtn.addEventListener('click', () => {
      hideMastered = !hideMastered;
      hideMasteredBtn.classList.toggle('ml-hide-mastered-btn--active', hideMastered);
      renderWords(filterInp.value);
    });
    controlsGroup.appendChild(filterInp); controlsGroup.appendChild(sortSel);
    controlsGroup.appendChild(hideMasteredBtn);

    // POS chips
    const posRow = document.createElement('div');
    posRow.className = 'ml-pos-row';
    const posChipBtns = new Map<string, HTMLButtonElement>();
    const POS_CHIPS = [
      { value: '',            label: 'All'          },
      { value: 'verb',        label: 'Verbs'        },
      { value: 'noun',        label: 'Nouns'        },
      { value: 'adjective',   label: 'Adjectives'   },
      { value: 'adverb',      label: 'Adverbs'      },
      { value: 'pronoun',     label: 'Pronouns'     },
      { value: 'preposition', label: 'Prepositions' },
      { value: 'conjunction', label: 'Conjunctions' },
      { value: 'article',     label: 'Articles'     },
    ];
    POS_CHIPS.forEach(({ value, label }) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pos-chip' + (value === '' ? ' pos-chip-all active' : '');
      chip.textContent = label; if (value) { chip.dataset.pos = value; posChipBtns.set(value, chip); }
      chip.addEventListener('click', () => {
        if (value === '') selectedPos.clear();
        else { if (selectedPos.has(value)) selectedPos.delete(value); else selectedPos.add(value); }
        posRow.querySelectorAll<HTMLButtonElement>('.pos-chip').forEach(c => {
          c.classList.toggle('active', c.dataset.pos ? selectedPos.has(c.dataset.pos) : selectedPos.size === 0);
        });
        renderAddResults(addInp.value.trim()); renderWords(filterInp.value);
      });
      posRow.appendChild(chip);
    });

    panelHeader.appendChild(titleGroup);
    panelHeader.appendChild(statsRow);
    panelHeader.appendChild(controlsGroup);
    panelHeader.appendChild(posRow);
    panel.appendChild(panelHeader);

    // Add-words search
    const addSection = document.createElement('div');
    addSection.className = 'ml-add-section';
    const addRow = document.createElement('div');
    addRow.className = 'ml-add-row';
    const addIcon = document.createElement('span');
    addIcon.className = 'ml-add-icon'; addIcon.textContent = '+';
    const addInp = document.createElement('input');
    addInp.type = 'text'; addInp.placeholder = 'Search vocabulary to add…';
    addInp.className = 'ml-add-input';
    addRow.appendChild(addIcon); addRow.appendChild(addInp);
    addSection.appendChild(addRow);
    const addResults = document.createElement('ul');
    addResults.className = 'ml-add-results'; addResults.hidden = true;
    addSection.appendChild(addResults);

    // ── Bulk import ───────────────────────────────────────────────────────────
    // Paste or drop a CSV / comma- or newline-separated list. Words are matched
    // against the vocabulary for this language; anything unmatched is reported
    // back rather than silently dropped.
    const bulkToggle = document.createElement('button');
    bulkToggle.type = 'button';
    bulkToggle.className = 'ml-bulk-toggle';
    bulkToggle.textContent = '⇪ Bulk import';
    bulkToggle.title = 'Add many words at once from a pasted list or CSV file';

    const bulkPanel = document.createElement('div');
    bulkPanel.className = 'ml-bulk-panel';
    bulkPanel.hidden = true;

    const bulkArea = document.createElement('textarea');
    bulkArea.className = 'ml-bulk-input';
    bulkArea.rows = 4;
    bulkArea.placeholder = 'hablar, comer, casa\nperro\nlibro…';

    const bulkRow = document.createElement('div');
    bulkRow.className = 'ml-bulk-row';

    const bulkFile = document.createElement('input');
    bulkFile.type = 'file';
    bulkFile.accept = '.csv,.txt,text/csv,text/plain';
    bulkFile.className = 'ml-bulk-file';

    const bulkAdd = document.createElement('button');
    bulkAdd.type = 'button';
    bulkAdd.className = 'ml-bulk-add';
    bulkAdd.textContent = 'Add to list';

    const bulkReport = document.createElement('div');
    bulkReport.className = 'ml-bulk-report';

    bulkRow.append(bulkFile, bulkAdd);
    bulkPanel.append(bulkArea, bulkRow, bulkReport);

    bulkToggle.addEventListener('click', () => {
      bulkPanel.hidden = !bulkPanel.hidden;
      if (!bulkPanel.hidden) bulkArea.focus();
    });

    bulkFile.addEventListener('change', () => {
      const file = bulkFile.files?.[0];
      if (!file) return;
      file.text().then(text => {
        bulkArea.value = bulkArea.value ? `${bulkArea.value}\n${text}` : text;
      }).catch(() => {
        bulkReport.textContent = 'Could not read that file.';
      });
    });

    /** Split on commas, newlines, tabs and semicolons; trim quotes and blanks. */
    function parseBulk(text: string): string[] {
      return text
        .split(/[,\n\r\t;]+/)
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    }

    /**
     * Candidate matches for a token that didn't match exactly — inflections and
     * near-spellings, e.g. "hablo"/"hablamos" → hablar, "gato" → gata.
     */
    function findVariations(token: string): VocabEntry[] {
      const t = norm(token);
      if (t.length < 3) return [];
      const stem = t.slice(0, Math.max(3, t.length - 3));
      return allVocab
        .filter(e => {
          const w = norm(e.word);
          return w !== t && (w.startsWith(stem) || t.startsWith(norm(e.word).slice(0, Math.max(3, w.length - 2))));
        })
        .slice(0, 6);
    }

    /** Ask which of several candidates the user meant; resolves to picks. */
    function askVariations(
      pending: { token: string; options: VocabEntry[]; preferred?: string }[],
    ): Promise<string[]> {
      return new Promise(resolve => {
        const chosen: string[] = [];

        const backdrop = document.createElement('div');
        backdrop.className = 'ml-variation-backdrop';

        const dialog = document.createElement('div');
        dialog.className = 'ml-variation-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        const title = document.createElement('div');
        title.className = 'ml-variation-title';
        title.textContent = pending.length === 1
          ? '1 word needs a choice'
          : `${pending.length} words need a choice`;

        const sub = document.createElement('div');
        sub.className = 'ml-variation-sub';
        sub.textContent = 'These weren’t exact matches. Pick the entry you meant, or skip.';

        const body = document.createElement('div');
        body.className = 'ml-variation-body';

        pending.forEach(({ token, options, preferred }) => {
          const row = document.createElement('div');
          row.className = 'ml-variation-row';

          const label = document.createElement('div');
          label.className = 'ml-variation-token';
          label.textContent = token;

          const opts = document.createElement('div');
          opts.className = 'ml-variation-options';

          options.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ml-variation-option';
            btn.textContent = opt.word + (opt.translation ? ` — ${opt.translation}` : '');
            btn.addEventListener('click', () => {
              const active = opts.querySelector('.ml-variation-option--picked');
              if (active === btn) {
                btn.classList.remove('ml-variation-option--picked');
                row.dataset.picked = '';
              } else {
                active?.classList.remove('ml-variation-option--picked');
                btn.classList.add('ml-variation-option--picked');
                row.dataset.picked = opt.word;
              }
            });
            if (preferred && opt.word === preferred) {
              btn.classList.add('ml-variation-option--picked');
              row.dataset.picked = opt.word;
            }
            opts.appendChild(btn);
          });

          row.append(label, opts);
          body.appendChild(row);
        });

        const actions = document.createElement('div');
        actions.className = 'ml-variation-actions';
        const skipBtn = document.createElement('button');
        skipBtn.type = 'button'; skipBtn.className = 'ml-variation-skip';
        skipBtn.textContent = 'Skip all';
        const addBtn = document.createElement('button');
        addBtn.type = 'button'; addBtn.className = 'ml-variation-add';
        addBtn.textContent = 'Add selected';
        actions.append(skipBtn, addBtn);

        function close(result: string[]): void {
          backdrop.remove();
          resolve(result);
        }

        skipBtn.addEventListener('click', () => close([]));
        addBtn.addEventListener('click', () => {
          body.querySelectorAll<HTMLElement>('.ml-variation-row').forEach(r => {
            if (r.dataset.picked) chosen.push(r.dataset.picked);
          });
          close(chosen);
        });
        backdrop.addEventListener('click', e => { if (e.target === backdrop) close([]); });

        dialog.append(title, sub, body, actions);
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);
      });
    }

    bulkAdd.addEventListener('click', () => {
      const tokens = parseBulk(bulkArea.value);
      if (tokens.length === 0) {
        bulkReport.textContent = 'Nothing to import — paste some words first.';
        return;
      }

      // Keyed on the accent-stripped form, so "como" finds both *como* and
      // *cómo*. Several entries can share a key — that's the ambiguity we ask
      // about rather than silently picking one.
      const byWord = new Map<string, VocabEntry[]>();
      for (const entry of allVocab) {
        const key = norm(entry.word);
        const bucket = byWord.get(key);
        if (bucket) bucket.push(entry);
        else byWord.set(key, [entry]);
      }

      const existing = new Set(getList(lang, selectedList).map(w => w.toLowerCase()));
      const added: string[] = [];
      const already: string[] = [];
      const unmatched: string[] = [];
      const ambiguous: { token: string; options: VocabEntry[]; preferred?: string }[] = [];

      function take(word: string): void {
        if (existing.has(word.toLowerCase())) return;
        addToList(lang, selectedList, word);
        existing.add(word.toLowerCase());
        added.push(word);
      }

      for (const token of tokens) {
        const matches = byWord.get(norm(token)) ?? [];

        // Several spellings differing only by accent (como / cómo) — always ask,
        // even when one of them is typed exactly, since the accent carries the
        // meaning. An exact hit is pre-selected so confirming is one click.
        if (matches.length > 1) {
          const exact = matches.find(m => m.word.toLowerCase() === token.toLowerCase());
          ambiguous.push({ token, options: matches, preferred: exact?.word });
          continue;
        }

        if (matches.length === 1) {
          const only = matches[0].word;
          if (existing.has(only.toLowerCase())) already.push(token);
          else take(only);
          continue;
        }

        const options = findVariations(token);
        if (options.length > 0) ambiguous.push({ token, options });
        else                    unmatched.push(token);
      }

      function finish(): void {
        const parts = [`Added ${added.length}`];
        if (already.length)   parts.push(`${already.length} already listed`);
        if (unmatched.length) {
          const preview = unmatched.slice(0, 8).join(', ');
          parts.push(`${unmatched.length} not found (${preview}${unmatched.length > 8 ? '…' : ''})`);
        }
        bulkReport.textContent = parts.join(' · ');

        if (added.length > 0) {
          bulkArea.value = '';
          countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
          updateBadge(); renderWords(filterInp.value.trim()); renderSidebar();
        }
      }

      if (ambiguous.length > 0) {
        void askVariations(ambiguous).then(picks => {
          picks.forEach(take);
          // Anything left unpicked is reported as not found
          const picked = new Set(picks.map(p => norm(p)));
          ambiguous.forEach(({ token, options }) => {
            if (!options.some(o => picked.has(norm(o.word)))) unmatched.push(token);
          });
          finish();
        });
        return;
      }

      finish();
    });

    addSection.append(bulkToggle, bulkPanel);
    panel.appendChild(addSection);

    // Word list
    const listEl = document.createElement('ul');
    listEl.className = 'ml-word-list';
    panel.appendChild(listEl);

    // Vocab
    let allVocab: VocabEntry[] = vocabCache.get(lang) ?? [];
    fetchVocab(lang).then(entries => {
      allVocab = entries;
      if (document.activeElement === addInp && addInp.value.trim()) renderAddResults(addInp.value.trim());
      renderWords(filterInp.value);
    }).catch(logger.error);

    // ── Sort ─────────────────────────────────────────────────────────────────

    function sortWords(words: string[]): string[] {
      const vm = vocabMapCache.get(lang); const F = 9999;
      switch (sortMode) {
        case 'alpha-asc':  return [...words].sort((a, b) => norm(a).localeCompare(norm(b)));
        case 'alpha-desc': return [...words].sort((a, b) => norm(b).localeCompare(norm(a)));
        case 'rank-asc':   return [...words].sort((a, b) => (vm?.get(a)?.rank ?? F) - (vm?.get(b)?.rank ?? F));
        case 'rank-desc':  return [...words].sort((a, b) => (vm?.get(b)?.rank ?? F) - (vm?.get(a)?.rank ?? F));
      }
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    function renderStats(words: string[]): void {
      const vm = vocabMapCache.get(lang);
      if (!vm || words.length === 0) { statsRow.innerHTML = ''; return; }
      const counts: Record<string, number> = {};
      let minRank = Infinity; let maxRank = -Infinity; let rankedCount = 0; let unlabeled = 0;
      for (const w of words) {
        const e = vm.get(w);
        if (e?.pos) counts[e.pos] = (counts[e.pos] ?? 0) + 1;
        else unlabeled++;
        if (e?.rank != null) {
          if (e.rank < minRank) minRank = e.rank;
          if (e.rank > maxRank) maxRank = e.rank;
          rankedCount++;
        }
      }
      const parts: string[] = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([pos, n]) => `${n} ${POS_LABEL[pos] ?? pos}`);
      if (unlabeled > 0) parts.push(`${unlabeled} other`);
      if (rankedCount > 1)        parts.push(`ranks #${minRank}–#${maxRank}`);
      else if (rankedCount === 1) parts.push(`rank #${minRank}`);
      const masteredCount = words.filter(w => getMastered(lang, selectedList).has(w)).length;
      if (masteredCount > 0) parts.push(`${masteredCount} mastered`);
      statsRow.innerHTML = parts
        .map(p => `<span class="ml-stat-chip">${p}</span>`)
        .join('');
    }

    // ── Add-search ────────────────────────────────────────────────────────────

    let currentMatches: VocabEntry[] = [];
    let focusedIdx = -1;

    function doAdd(entry: VocabEntry): void {
      addToList(lang, selectedList, entry.word);
      countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
      updateBadge(); renderAddResults(addInp.value.trim());
      renderWords(filterInp.value.trim()); renderSidebar();
    }

    function setFocus(idx: number): void {
      const items = addResults.querySelectorAll<HTMLElement>('.ml-add-result-item');
      items.forEach((el, i) => el.classList.toggle('focused', i === idx));
      if (idx >= 0) items[idx]?.scrollIntoView({ block: 'nearest' });
      focusedIdx = idx;
    }

    function renderAddResults(query: string): void {
      addResults.innerHTML = ''; currentMatches = []; focusedIdx = -1;
      if (!query) { addResults.hidden = true; return; }
      const currentWords = new Set(getList(lang, selectedList).map(w => w.toLowerCase()));
      const q = norm(query);
      currentMatches = allVocab
        .filter(e => !currentWords.has(e.word.toLowerCase()))
        .filter(e => selectedPos.size === 0 || selectedPos.has(e.pos ?? ''))
        .filter(e => norm(e.word).includes(q) || norm(e.translation).includes(q))
        .slice(0, 12);
      if (currentMatches.length === 0) { addResults.hidden = true; return; }

      // Add-all bar
      const bar = document.createElement('li');
      bar.className = 'ml-add-all-bar';
      const allBtn = document.createElement('button');
      allBtn.type = 'button'; allBtn.className = 'ml-add-all-btn';
      allBtn.textContent = `Add all ${currentMatches.length}`;
      allBtn.addEventListener('click', e => {
        e.stopPropagation();
        currentMatches.forEach(en => addToList(lang, selectedList, en.word));
        countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
        updateBadge(); renderAddResults(addInp.value.trim());
        renderWords(filterInp.value.trim()); renderSidebar();
      });
      bar.appendChild(allBtn); addResults.appendChild(bar);

      currentMatches.forEach(entry => {
        const li = document.createElement('li');
        li.className = 'ml-add-result-item';
        const wordSpan = document.createElement('span');
        wordSpan.className = 'ml-add-result-word'; wordSpan.textContent = entry.word;
        const posSpan = document.createElement('span');
        posSpan.className = 'ml-word-pos ml-word-pos--result';
        posSpan.textContent = POS_ABBREV[entry.pos ?? ''] ?? '';
        if (entry.pos) posSpan.dataset.pos = entry.pos;
        if (!posSpan.textContent) posSpan.hidden = true;
        const transSpan = document.createElement('span');
        transSpan.className = 'ml-add-result-trans'; transSpan.textContent = entry.translation;
        const addBtn = document.createElement('button');
        addBtn.type = 'button'; addBtn.className = 'ml-add-btn';
        addBtn.title = 'Add to list'; addBtn.textContent = '+';
        addBtn.addEventListener('click', e => { e.stopPropagation(); doAdd(entry); });
        li.addEventListener('click', () => doAdd(entry));
        li.appendChild(wordSpan); li.appendChild(posSpan);
        li.appendChild(transSpan); li.appendChild(addBtn);
        addResults.appendChild(li);
      });
      addResults.hidden = false;
    }

    addInp.addEventListener('input', () => renderAddResults(addInp.value.trim()));

    // ── Bulk paste ────────────────────────────────────────────────────────────
    addInp.addEventListener('paste', (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') ?? '';
      const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return; // single line: normal paste behavior
      e.preventDefault();
      const currentWords = new Set(getList(lang, selectedList).map(w => w.toLowerCase()));
      let added = 0;
      for (const line of lines) {
        const q = norm(line);
        const match = allVocab.find(v => norm(v.word) === q || norm(v.translation) === q);
        if (match && !currentWords.has(match.word.toLowerCase())) {
          addToList(lang, selectedList, match.word);
          currentWords.add(match.word.toLowerCase());
          added++;
        }
      }
      addInp.value = '';
      addResults.hidden = true;
      countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
      updateBadge();
      renderWords(filterInp.value.trim());
      renderSidebar();
      const feedback = document.createElement('div');
      feedback.className = 'ml-bulk-feedback';
      feedback.textContent = added > 0
        ? `Added ${added} of ${lines.length} words`
        : 'No matching words found';
      addRow.appendChild(feedback);
      setTimeout(() => feedback.remove(), 2500);
    });

    addInp.addEventListener('keydown', (e: KeyboardEvent) => {
      const count = currentMatches.length;
      if (!count || addResults.hidden) return;
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); setFocus(Math.min(focusedIdx + 1, count - 1)); break;
        case 'ArrowUp':   e.preventDefault(); setFocus(Math.max(focusedIdx - 1, 0));         break;
        case 'Enter':
          e.preventDefault();
          if (focusedIdx >= 0) doAdd(currentMatches[focusedIdx]);
          else if (count > 0)  doAdd(currentMatches[0]);
          break;
        case 'Escape':
          addResults.hidden = true; focusedIdx = -1; break;
      }
    });

    const onClickOutside = (e: MouseEvent) => {
      if (!addSection.contains(e.target as Node)) addResults.hidden = true;
      if (activePopover && !activePopover.contains(e.target as Node)) closePopover();
    };
    document.addEventListener('click', onClickOutside, true);

    // ── Move/Copy popover ─────────────────────────────────────────────────────

    function openMovePopover(anchorBtn: HTMLElement, word: string): void {
      closePopover();
      let mode: 'move' | 'copy' = 'move';
      const otherLists = getListNames(lang).filter(n => n !== selectedList);

      const popover = document.createElement('div');
      popover.className = 'ml-move-popover';
      const rect = anchorBtn.getBoundingClientRect();
      popover.style.top  = (rect.bottom + 4) + 'px';
      popover.style.left = Math.max(4, rect.right - 160) + 'px';

      // Mode tabs
      const tabs = document.createElement('div');
      tabs.className = 'ml-move-popover-tabs';
      (['move', 'copy'] as const).forEach(m => {
        const tab = document.createElement('button');
        tab.type = 'button'; tab.className = 'ml-move-tab' + (m === mode ? ' active' : '');
        tab.textContent = m === 'move' ? '⇥ Move' : '+ Copy';
        tab.addEventListener('click', () => {
          mode = m;
          tabs.querySelectorAll('.ml-move-tab').forEach((t, i) =>
            t.classList.toggle('active', i === (m === 'move' ? 0 : 1)));
        });
        tabs.appendChild(tab);
      });
      popover.appendChild(tabs);

      if (otherLists.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ml-move-popover-empty'; empty.textContent = 'No other lists';
        popover.appendChild(empty);
      } else {
        otherLists.forEach(listName => {
          const item = document.createElement('button');
          item.type = 'button'; item.className = 'ml-move-popover-item';
          item.textContent = listName;
          item.addEventListener('click', e => {
            e.stopPropagation();
            if (mode === 'move') removeFromList(lang, selectedList, word);
            addToList(lang, listName, word);
            countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
            updateBadge(); renderWords(filterInp.value); renderSidebar(); closePopover();
          });
          popover.appendChild(item);
        });
      }

      document.body.appendChild(popover);
      activePopover = popover;
    }

    // ── Chip counts ──────────────────────────────────────────────────────────────

    function updateChipCounts(): void {
      const vm = vocabMapCache.get(lang);
      if (!vm) return;
      const allWords = getList(lang, selectedList);
      const counts: Record<string, number> = {};
      for (const w of allWords) {
        const pos = vm.get(w)?.pos;
        if (pos) counts[pos] = (counts[pos] ?? 0) + 1;
      }
      for (const [pos, btn] of posChipBtns) {
        const n = counts[pos] ?? 0;
        const chipDef = POS_CHIPS.find(c => c.value === pos);
        btn.textContent = n > 0 ? `${chipDef?.label ?? pos} (${n})` : (chipDef?.label ?? pos);
      }
    }

    // ── Word list render ───────────────────────────────────────────────────────

    function renderWords(filter = ''): void {
      closePopover(); listEl.innerHTML = '';
      const vm = vocabMapCache.get(lang);
      const q  = norm(filter);
      const mastered = getMastered(lang, selectedList);

      const filtered = getList(lang, selectedList).filter(w => {
        if (hideMastered && mastered.has(w)) return false;
        const e = vm?.get(w);
        if (selectedPos.size > 0 && !selectedPos.has(e?.pos ?? '')) return false;
        if (!q) return true;
        return norm(w).includes(q) || (e ? norm(e.translation).includes(q) : false);
      });

      renderStats(filtered);
      updateChipCounts();
      const words = sortWords(filtered);

      if (words.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'ml-word-empty';
        empty.textContent = filter ? 'No matches.' : 'No words in this list yet.';
        listEl.appendChild(empty); return;
      }

      words.forEach(word => {
        const entry = vm?.get(word);
        const posLabel = POS_ABBREV[entry?.pos ?? ''] ?? '';
        const isMastered = mastered.has(word);

        // ── Main row ────────────────────────────────────────────────
        const li = document.createElement('li');
        li.className = 'ml-word-item'
          + (word === expandedWord ? ' ml-word-item--expanded' : '')
          + (isMastered ? ' ml-word-item--mastered' : '');

        const wordSpan = document.createElement('span');
        wordSpan.className = 'ml-word-text'; wordSpan.textContent = word;

        const posSpan = document.createElement('span');
        posSpan.className = 'ml-word-pos'; posSpan.textContent = posLabel;
        if (posLabel && entry?.pos) posSpan.dataset.pos = entry.pos;
        else posSpan.hidden = true;

        const transSpan = document.createElement('span');
        transSpan.className = 'ml-word-trans'; transSpan.textContent = entry?.translation ?? '';

        const rankBadge = document.createElement('span');
        rankBadge.className = 'ml-word-rank';
        if (entry?.rank != null) rankBadge.textContent = '#' + entry.rank;
        else rankBadge.hidden = true;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'ml-word-actions';

        const masteryBtn = document.createElement('button');
        masteryBtn.type = 'button';
        masteryBtn.className = 'ml-mastery-btn' + (isMastered ? ' ml-mastery-btn--active' : '');
        masteryBtn.title = isMastered ? 'Unmark as mastered' : 'Mark as mastered';
        masteryBtn.textContent = '✓';
        masteryBtn.addEventListener('click', e => {
          e.stopPropagation();
          const m = getMastered(lang, selectedList);
          if (m.has(word)) m.delete(word); else m.add(word);
          saveMastered(lang, selectedList, m);
          renderWords(filterInp.value);
        });

        const moveBtn = document.createElement('button');
        moveBtn.type = 'button'; moveBtn.className = 'ml-move-btn';
        moveBtn.title = 'Move or copy to another list'; moveBtn.textContent = '⇥';
        moveBtn.addEventListener('click', e => { e.stopPropagation(); openMovePopover(moveBtn, word); });

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button'; removeBtn.className = 'ml-remove-btn';
        removeBtn.title = 'Remove from list'; removeBtn.textContent = '×';
        removeBtn.addEventListener('click', e => {
          e.stopPropagation();
          removeFromList(lang, selectedList, word);
          countBadge.textContent = String(getList(lang, selectedList).length) + ' words';
          updateBadge();
          if (addInp.value.trim()) renderAddResults(addInp.value.trim());
          // Re-render the word list too, or the removed row stays on screen
          // until some other action happens to redraw it.
          renderWords(filterInp.value.trim());
          renderSidebar();
        });

        actionsDiv.appendChild(masteryBtn); actionsDiv.appendChild(moveBtn); actionsDiv.appendChild(removeBtn);
        li.appendChild(wordSpan); li.appendChild(posSpan);
        li.appendChild(rankBadge); li.appendChild(transSpan); li.appendChild(actionsDiv);

        // ── Preview row (collapsed unless expanded) ───────────────────
        const detail = document.createElement('div');
        detail.className = 'ml-word-detail';

        if (word === expandedWord && entry) {
          if (entry.glosses.length > 1) {
            const gl = document.createElement('span');
            gl.className = 'ml-detail-glosses';
            gl.textContent = entry.glosses.join(', ');
            detail.appendChild(gl);
          }
          if (entry.ipa) {
            const ipa = document.createElement('span');
            ipa.className = 'ml-detail-ipa'; ipa.textContent = '/' + entry.ipa + '/';
            detail.appendChild(ipa);
          }
          if (entry.examples.length > 0) {
            const ex = document.createElement('span');
            ex.className = 'ml-detail-example'; ex.textContent = entry.examples[0];
            detail.appendChild(ex);
          }
          if (detail.children.length === 0) {
            const none = document.createElement('span');
            none.className = 'ml-detail-none'; none.textContent = 'No additional details.';
            detail.appendChild(none);
          }
        }

        li.appendChild(detail);

        // Toggle preview on row click (but not on action buttons)
        li.addEventListener('click', e => {
          if ((e.target as HTMLElement).closest('button')) return;
          expandedWord = (expandedWord === word) ? null : word;
          renderWords(filterInp.value);
        });

        listEl.appendChild(li);
      });
    }
    renderWords();
    filterInp.addEventListener('input', () => renderWords(filterInp.value));
  }

  // ── Create / rename ────────────────────────────────────────────────────────

  function startCreateList(): void {
    const li = document.createElement('li');
    li.className = 'ml-list-item ml-list-item--editing';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = 'List name...'; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button'; cancelBtn.className = 'ml-icon-btn'; cancelBtn.textContent = '✕';
    function confirmCreate(): void {
      const name = inp.value.trim(); if (!name) { li.remove(); return; }
      createList(lang, name); selectedList = name; updateBadge(); renderSidebar();
    }
    okBtn.addEventListener('click', confirmCreate);
    cancelBtn.addEventListener('click', () => li.remove());
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') li.remove();
    });
    li.appendChild(inp); li.appendChild(okBtn); li.appendChild(cancelBtn);
    listNav.prepend(li); inp.focus();
  }

  function startRenameList(oldName: string, li: HTMLElement, nameSpan: HTMLElement): void {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = oldName; inp.className = 'ml-list-name-input';
    const okBtn = document.createElement('button');
    okBtn.type = 'button'; okBtn.className = 'ml-icon-btn'; okBtn.textContent = '✓';
    function confirmRename(): void {
      const newName = inp.value.trim();
      if (!newName || newName === oldName) { done(); return; }
      if (renameList(lang, oldName, newName)) {
        if (selectedList === oldName) selectedList = newName;
        updateBadge(); renderSidebar();
      } else { alert(`A list named "${newName}" already exists.`); inp.focus(); }
    }
    function done(): void { inp.replaceWith(nameSpan); okBtn.remove(); }
    okBtn.addEventListener('click', confirmRename);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') done();
    });
    nameSpan.replaceWith(inp);
    const actionsEl = li.querySelector('.ml-list-actions');
    if (actionsEl) li.insertBefore(okBtn, actionsEl);
    inp.focus(); inp.select();
  }

  function updateBadge(): void {
    const gl = (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
    const el = document.getElementById('knownWordCount');
    if (el) el.textContent = String(getTotalListedCount(gl));
    refreshFilterSelect(gl);
  }

  renderSidebar();
}
