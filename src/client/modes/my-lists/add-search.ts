/**
 * add-search.ts — the "Search vocabulary to add…" box and its results.
 *
 * Matches accent-insensitively across word, translation *and* glosses. Glosses
 * matter more than they look: a translation is only one of several English
 * senses, so searching "fix" for *arreglar* found nothing when only the
 * headline translation was searched.
 *
 * Results respect the POS and level chips above them. That is deliberate — the
 * chips read as a statement about what you are working on, so having the search
 * ignore them produced results you had just filtered away.
 *
 * Multi-line paste is intercepted: pasting a column of words adds every one
 * that matches, rather than dropping the lot into the search box as one string.
 * A single line pastes normally, since that is someone typing one word.
 */

import { foldKey as norm } from '../../utils/match.ts';
import { getList, addToList } from '../../utils/word-lists.ts';
import type { ListsCtx } from './context.ts';
import { POS_ABBREV, type VocabEntry } from './types.ts';

export interface AddSearchUI {
  /** The input row — the caller appends the bulk-import controls after it. */
  row:     HTMLElement;
  /** The results list. */
  results: HTMLUListElement;
  input:   HTMLInputElement;
  /** Re-run the current query. Call after the chip filters change. */
  refresh(): void;
}

/**
 * @param onAdded  Redraw everything a new word affects. `fullSidebar` is passed
 *                 only by the paste path, which can add enough words at once to
 *                 be worth a complete sidebar rebuild.
 */
export function createAddSearch(
  ctx: ListsCtx,
  getVocab: () => VocabEntry[],
  onAdded: (fullSidebar?: boolean) => void,
): AddSearchUI {
  const row = document.createElement('div');
  row.className = 'ml-add-row';
  const icon = document.createElement('span');
  icon.className = 'ml-add-icon'; icon.textContent = '+';
  const input = document.createElement('input');
  input.type = 'text'; input.placeholder = 'Search vocabulary to add…';
  input.className = 'ml-add-input';
  row.appendChild(icon); row.appendChild(input);

  const results = document.createElement('ul');
  results.className = 'ml-add-results'; results.hidden = true;

  let currentMatches: VocabEntry[] = [];
  let focusedIdx = -1;

  function doAdd(entry: VocabEntry): void {
    addToList(ctx.lang, ctx.selectedList, entry.word);
    onAdded();
    render(input.value.trim());
    // Keep the cursor where it was so several words can be added in a row.
    input.focus();
  }

  function setFocus(idx: number): void {
    const items = results.querySelectorAll<HTMLElement>('.ml-add-result-item');
    items.forEach((el, i) => el.classList.toggle('focused', i === idx));
    if (idx >= 0) items[idx]?.scrollIntoView({ block: 'nearest' });
    focusedIdx = idx;
  }

  function render(query: string): void {
    results.innerHTML = ''; currentMatches = []; focusedIdx = -1;
    if (!query) { results.hidden = true; return; }
    const currentWords = new Set(getList(ctx.lang, ctx.selectedList).map(w => w.toLowerCase()));
    const q = norm(query);
    currentMatches = getVocab()
      .filter(e => !currentWords.has(e.word.toLowerCase()))
      .filter(e => ctx.selectedPos.size   === 0 || ctx.selectedPos.has(e.pos ?? ''))
      .filter(e => ctx.selectedBands.size === 0 || ctx.selectedBands.has(e.band ?? ''))
      .filter(e => norm(e.word).includes(q)
                || norm(e.translation).includes(q)
                || e.glosses.some(g => norm(g).includes(q)))
      .slice(0, 12);
    if (currentMatches.length === 0) { results.hidden = true; return; }

    // Add-all bar
    const bar = document.createElement('li');
    bar.className = 'ml-add-all-bar';
    const allBtn = document.createElement('button');
    allBtn.type = 'button'; allBtn.className = 'ml-add-all-btn';
    allBtn.textContent = `Add all ${currentMatches.length}`;
    allBtn.addEventListener('click', e => {
      e.stopPropagation();
      currentMatches.forEach(en => addToList(ctx.lang, ctx.selectedList, en.word));
      onAdded();
      render(input.value.trim());
      input.focus();
    });
    bar.appendChild(allBtn); results.appendChild(bar);

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
      results.appendChild(li);
    });
    results.hidden = false;
  }

  input.addEventListener('input', () => render(input.value.trim()));

  // ── Multi-line paste ────────────────────────────────────────────────────────
  input.addEventListener('paste', (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text') ?? '';
    const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return; // single line: normal paste behavior
    e.preventDefault();
    const currentWords = new Set(getList(ctx.lang, ctx.selectedList).map(w => w.toLowerCase()));
    const vocab = getVocab();
    let added = 0;
    for (const line of lines) {
      const q = norm(line);
      const match = vocab.find(v => norm(v.word) === q || norm(v.translation) === q);
      if (match && !currentWords.has(match.word.toLowerCase())) {
        addToList(ctx.lang, ctx.selectedList, match.word);
        currentWords.add(match.word.toLowerCase());
        added++;
      }
    }
    input.value = '';
    results.hidden = true;
    onAdded(true);
    const feedback = document.createElement('div');
    feedback.className = 'ml-bulk-feedback';
    feedback.textContent = added > 0
      ? `Added ${added} of ${lines.length} words`
      : 'No matching words found';
    row.appendChild(feedback);
    setTimeout(() => feedback.remove(), 2500);
  });

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    const count = currentMatches.length;
    if (!count || results.hidden) return;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setFocus(Math.min(focusedIdx + 1, count - 1)); break;
      case 'ArrowUp':   e.preventDefault(); setFocus(Math.max(focusedIdx - 1, 0));         break;
      case 'Enter':
        e.preventDefault();
        if (focusedIdx >= 0) doAdd(currentMatches[focusedIdx]);
        else if (count > 0)  doAdd(currentMatches[0]);
        break;
      case 'Escape':
        results.hidden = true; focusedIdx = -1; break;
    }
  });

  return {
    row, results, input,
    refresh: () => render(input.value.trim()),
  };
}
