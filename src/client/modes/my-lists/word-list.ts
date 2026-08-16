/**
 * word-list.ts — the rows themselves, and everything that acts on them.
 *
 * Three concerns that cannot practically be separated, because they all read
 * the same derived set of visible words:
 *
 *   - filtering and sorting the list down to what is on screen
 *   - rendering it in chunks, and the per-row controls
 *   - multi-select and the bulk action bar
 *
 * Chunked rather than windowed. Lists run to thousands of words and each row
 * carries four buttons and a checkbox, so building them all up front is what
 * made the panel feel slow. A sentinel at the bottom appends the next slice as
 * it scrolls into view. Fixed-height windowing would be faster still, but rows
 * change height when expanded and windowing would have to model that.
 *
 * The selection set is pruned to the visible words on every redraw, so a bulk
 * action can never touch a word the user has filtered out of sight.
 */

import { foldKey as norm } from '../../utils/match.ts';
import {
  getList, getListNames, addToList, removeFromList,
} from '../../utils/word-lists.ts';
import type { ListsCtx } from './context.ts';
import { cachedVocabMap } from './vocab-cache.ts';
import { getMastered, saveMastered } from './mastery.ts';
import { closePopover, openMovePopover } from './move-popover.ts';
import { showUndo } from './undo-toast.ts';
import {
  POS_ABBREV, POS_LABEL, POS_CHIPS, WORD_CHUNK, type VocabEntry,
} from './types.ts';

export interface WordListDeps {
  /** Read at render time so the toolbar owns the text and this module doesn't. */
  filterInput: HTMLInputElement;
  /** Where the "12 Verbs · ranks #4–#900" chips go. */
  statsRow: HTMLElement;
  /** POS chips, so their counts can be kept current. */
  posChipBtns: Map<string, HTMLButtonElement>;
  /** Repaint the "N words" badge in the panel header. */
  refreshCount(): void;
  /** Re-run the add-search query, if one is active. */
  refreshAddResults(): void;
}

export interface WordListUI {
  listEl:  HTMLUListElement;
  /** Hidden until something is selected, so it costs nothing at rest. */
  bulkBar: HTMLElement;
  /** Filter, sort and redraw from the current input value. */
  render(): void;
  /** Exposed for Export, which writes the list out in the on-screen order. */
  sortWords(words: string[]): string[];
}

export function createWordList(ctx: ListsCtx, deps: WordListDeps): WordListUI {
  const { filterInput, statsRow, posChipBtns } = deps;

  const listEl = document.createElement('ul');
  listEl.className = 'ml-word-list';

  // Chunked-render state (see appendChunk)
  let visibleWords: string[] = [];
  let renderedCount = 0;
  let chunkObserver: IntersectionObserver | null = null;

  // Multi-select state. Cleared whenever the visible set changes, so you can
  // never act on a word you can no longer see.
  const selectedWords = new Set<string>();

  // ── Bulk action bar ────────────────────────────────────────────────────────

  const bulkBar = document.createElement('div');
  bulkBar.className = 'ml-bulk-bar';
  bulkBar.hidden = true;

  const bulkCount = document.createElement('span');
  bulkCount.className = 'ml-bulk-count';

  function makeBulkBtn(label: string, title: string, cls = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ml-bulk-btn' + (cls ? ' ' + cls : '');
    b.textContent = label; b.title = title;
    return b;
  }

  const bulkSelectAll = makeBulkBtn('Select all', 'Select every word currently shown');
  const bulkMaster    = makeBulkBtn('✓ Mastered', 'Mark the selected words as mastered');
  const bulkUnmaster  = makeBulkBtn('Unmark', 'Clear mastered on the selected words');
  const bulkMove      = makeBulkBtn('⇥ Move to…', 'Move the selected words to another list');
  const bulkRemove    = makeBulkBtn('× Remove', 'Remove the selected words from this list',
                                    'ml-bulk-btn--danger');
  const bulkClear     = makeBulkBtn('Clear', 'Deselect everything');

  bulkBar.append(bulkCount, bulkSelectAll, bulkMaster, bulkUnmaster,
                 bulkMove, bulkRemove, bulkClear);

  /** Show/hide the bar and keep its count and checkboxes honest. */
  function syncBulkBar(): void {
    // Drop anything no longer visible so a hidden word can't be acted on.
    const visible = new Set(visibleWords);
    [...selectedWords].forEach(w => { if (!visible.has(w)) selectedWords.delete(w); });

    const n = selectedWords.size;
    bulkBar.hidden = n === 0;
    bulkCount.textContent = n === 1 ? '1 selected' : `${n} selected`;
    bulkSelectAll.textContent =
      n > 0 && n === visibleWords.length ? 'Select none' : 'Select all';
    listEl.querySelectorAll<HTMLInputElement>('.ml-word-check').forEach(cb => {
      cb.checked = selectedWords.has(cb.dataset.word ?? '');
    });
  }

  /** Everything a change to the list's *membership* has to touch. */
  function afterBulkChange(): void {
    deps.refreshCount();
    ctx.updateBadge();
    render();
    ctx.renderSidebar(false);
  }

  bulkSelectAll.addEventListener('click', () => {
    if (selectedWords.size === visibleWords.length) selectedWords.clear();
    else visibleWords.forEach(w => selectedWords.add(w));
    syncBulkBar();
  });
  bulkClear.addEventListener('click', () => { selectedWords.clear(); syncBulkBar(); });

  bulkMaster.addEventListener('click', () => {
    const m = getMastered(ctx.lang);
    selectedWords.forEach(w => m.add(w));
    saveMastered(ctx.lang, m);
    selectedWords.clear(); render();
  });
  bulkUnmaster.addEventListener('click', () => {
    const m = getMastered(ctx.lang);
    selectedWords.forEach(w => m.delete(w));
    saveMastered(ctx.lang, m);
    selectedWords.clear(); render();
  });

  bulkRemove.addEventListener('click', () => {
    const words = [...selectedWords];
    if (words.length === 0) return;
    words.forEach(w => removeFromList(ctx.lang, ctx.selectedList, w));
    selectedWords.clear();
    afterBulkChange();
    showUndo(`Removed ${words.length} word${words.length === 1 ? '' : 's'}`, () => {
      words.forEach(w => addToList(ctx.lang, ctx.selectedList, w));
      afterBulkChange();
    });
  });

  bulkMove.addEventListener('click', () => {
    const others = getListNames(ctx.lang).filter(n => n !== ctx.selectedList);
    if (others.length === 0) { alert('No other list to move to. Create one first.'); return; }
    const target = window.prompt(
      `Move ${selectedWords.size} word(s) to which list?\n\n${others.join('\n')}`,
      others[0],
    );
    if (!target || !others.includes(target)) return;
    const words = [...selectedWords];
    words.forEach(w => { removeFromList(ctx.lang, ctx.selectedList, w); addToList(ctx.lang, target, w); });
    selectedWords.clear();
    afterBulkChange();
    showUndo(`Moved ${words.length} to "${target}"`, () => {
      words.forEach(w => { removeFromList(ctx.lang, target, w); addToList(ctx.lang, ctx.selectedList, w); });
      afterBulkChange();
    });
  });

  // ── Sort ───────────────────────────────────────────────────────────────────

  function sortWords(words: string[]): string[] {
    const vm = cachedVocabMap(ctx.lang); const F = 9999;
    switch (ctx.sortMode) {
      case 'alpha-asc':  return [...words].sort((a, b) => norm(a).localeCompare(norm(b)));
      case 'alpha-desc': return [...words].sort((a, b) => norm(b).localeCompare(norm(a)));
      case 'rank-asc':   return [...words].sort((a, b) => (vm?.get(a)?.rank ?? F) - (vm?.get(b)?.rank ?? F));
      case 'rank-desc':  return [...words].sort((a, b) => (vm?.get(b)?.rank ?? F) - (vm?.get(a)?.rank ?? F));
      // The stored list is a plain array appended to in insertion order, so
      // "recently added" is just that order — no timestamps needed.
      case 'added-asc':  return [...words];
      case 'added-desc': return [...words].reverse();
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  function renderStats(words: string[]): void {
    const vm = cachedVocabMap(ctx.lang);
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
    const masteredCount = words.filter(w => getMastered(ctx.lang).has(w)).length;
    if (masteredCount > 0) parts.push(`${masteredCount} mastered`);
    statsRow.innerHTML = parts
      .map(p => `<span class="ml-stat-chip">${p}</span>`)
      .join('');
  }

  // ── Chip counts ────────────────────────────────────────────────────────────

  function updateChipCounts(): void {
    const vm = cachedVocabMap(ctx.lang);
    if (!vm) return;
    const allWords = getList(ctx.lang, ctx.selectedList);
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

  // ── Render ─────────────────────────────────────────────────────────────────

  function render(): void {
    closePopover(); listEl.innerHTML = '';
    const filter = filterInput.value;
    const vm = cachedVocabMap(ctx.lang);
    const q  = norm(filter);
    const mastered = getMastered(ctx.lang);

    const filtered = getList(ctx.lang, ctx.selectedList).filter(w => {
      if (ctx.hideMastered && mastered.has(w)) return false;
      const e = vm?.get(w);
      if (ctx.selectedPos.size > 0 && !ctx.selectedPos.has(e?.pos ?? '')) return false;
      if (ctx.selectedBands.size > 0 && !ctx.selectedBands.has(e?.band ?? '')) return false;
      if (!q) return true;
      if (norm(w).includes(q)) return true;
      if (!e) return false;
      // Glosses are searched too — a word's translation is only one of
      // several English senses, and the rest were previously unreachable.
      return norm(e.translation).includes(q)
          || e.glosses.some(g => norm(g).includes(q));
    });

    renderStats(filtered);
    updateChipCounts();
    visibleWords  = sortWords(filtered);
    renderedCount = 0;
    chunkObserver?.disconnect();
    chunkObserver = null;
    syncBulkBar();

    if (visibleWords.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ml-word-empty';
      empty.textContent = filter ? 'No matches.' : 'No words in this list yet.';
      listEl.appendChild(empty); return;
    }

    appendChunk();
  }

  /** Render the next slice of visibleWords. */
  function appendChunk(): void {
    const vm       = cachedVocabMap(ctx.lang);
    const mastered = getMastered(ctx.lang);
    listEl.querySelector('.ml-chunk-sentinel')?.remove();

    const slice = visibleWords.slice(renderedCount, renderedCount + WORD_CHUNK);
    slice.forEach(word => listEl.appendChild(buildRow(word, vm, mastered)));
    renderedCount += slice.length;

    if (renderedCount >= visibleWords.length) return;

    const sentinel = document.createElement('li');
    sentinel.className = 'ml-chunk-sentinel';
    sentinel.textContent =
      `Loading ${Math.min(WORD_CHUNK, visibleWords.length - renderedCount)} more…`;
    listEl.appendChild(sentinel);

    chunkObserver?.disconnect();
    chunkObserver = new IntersectionObserver(entries => {
      if (entries.some(en => en.isIntersecting)) appendChunk();
    }, { root: listEl, rootMargin: '400px' });
    chunkObserver.observe(sentinel);
  }

  function buildRow(
    word: string,
    vm: Map<string, VocabEntry> | undefined,
    mastered: Set<string>,
  ): HTMLLIElement {
    const entry = vm?.get(word);
    const posLabel = POS_ABBREV[entry?.pos ?? ''] ?? '';
    const isMastered = mastered.has(word);

    // ── Main row ─────────────────────────────────────────────────────────────
    const li = document.createElement('li');
    li.className = 'ml-word-item'
      + (word === ctx.expandedWord ? ' ml-word-item--expanded' : '')
      + (isMastered ? ' ml-word-item--mastered' : '');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'ml-word-check';
    check.dataset.word = word;
    check.checked = selectedWords.has(word);
    check.title = 'Select for bulk actions';
    check.addEventListener('click', e => e.stopPropagation());
    check.addEventListener('change', () => {
      if (check.checked) selectedWords.add(word); else selectedWords.delete(word);
      syncBulkBar();
    });

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
      const m = getMastered(ctx.lang);
      if (m.has(word)) m.delete(word); else m.add(word);
      saveMastered(ctx.lang, m);
      render();
    });

    const moveBtn = document.createElement('button');
    moveBtn.type = 'button'; moveBtn.className = 'ml-move-btn';
    moveBtn.title = 'Move or copy to another list'; moveBtn.textContent = '⇥';
    moveBtn.addEventListener('click', e => {
      e.stopPropagation();
      openMovePopover(ctx, moveBtn, word, () => {
        deps.refreshCount();
        ctx.updateBadge();
        render();
        ctx.renderSidebar(false);
      });
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button'; removeBtn.className = 'ml-remove-btn';
    removeBtn.title = 'Remove from list'; removeBtn.textContent = '×';
    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      removeFromList(ctx.lang, ctx.selectedList, word);
      deps.refreshCount();
      ctx.updateBadge();
      deps.refreshAddResults();
      // Re-render the word list too, or the removed row stays on screen
      // until some other action happens to redraw it.
      render();
      ctx.renderSidebar(false);
      const listAtRemoval = ctx.selectedList;
      showUndo(`Removed "${word}"`, () => {
        addToList(ctx.lang, listAtRemoval, word);
        deps.refreshCount();
        ctx.updateBadge(); render(); ctx.renderSidebar(false);
      });
    });

    actionsDiv.appendChild(masteryBtn); actionsDiv.appendChild(moveBtn); actionsDiv.appendChild(removeBtn);
    li.appendChild(check); li.appendChild(wordSpan); li.appendChild(posSpan);
    li.appendChild(rankBadge); li.appendChild(transSpan); li.appendChild(actionsDiv);

    // ── Preview row (collapsed unless expanded) ──────────────────────────────
    const detail = document.createElement('div');
    detail.className = 'ml-word-detail';

    if (word === ctx.expandedWord && entry) {
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
      ctx.expandedWord = (ctx.expandedWord === word) ? null : word;
      render();
    });

    return li;
  }

  return { listEl, bulkBar, render, sortWords };
}
