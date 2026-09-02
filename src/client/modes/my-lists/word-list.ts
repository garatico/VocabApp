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
import { getMastered, setMasteryLevel, MASTERY_LEVELS } from './mastery.ts';
import { closePopover, openMovePopover } from './move-popover.ts';
import { showUndo } from './undo-toast.ts';
import {
  POS_ABBREV, POS_CHIPS, WORD_CHUNK, type VocabEntry,
} from './types.ts';
import { buildMasteryControls, appendCountChip, appendMasteredChip } from './row-shared.ts';
import { buildAudioButton } from '../../ui/audio-play-button.ts';

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

  /** Everything a change to the list's *membership* has to touch.
   *
   *  `listBefore` is whatever ctx.selectedList was immediately before the
   *  caller's own mutation (removeFromList/addToList) ran — every call site
   *  already has this on hand, since each already snapshots it to know
   *  which list Undo should act on.
   *
   *  renderSidebar runs first, not render: renderSidebar is what notices
   *  ctx.selectedList no longer names a real list (emptying a list deletes
   *  it) and corrects it — usually to '' or a fallback, but back to the
   *  right name again when a since-recreated list (Undo, restoring the last
   *  word removed) makes it valid once more.
   *
   *  Comparing against listBefore afterward decides which redraw is enough.
   *  Usually the selection is untouched — just its contents — and render()
   *  (word-list.ts's own body-only redraw) is plenty. But when it *did*
   *  change — the active list got deleted out from under it, or Undo just
   *  intentionally pointed ctx.selectedList somewhere else — render() isn't:
   *  the panel's header/title/stats were built once, by ctx.renderPanel(),
   *  for whichever list was open *then*, and nothing about calling render()
   *  or renderSidebar(false) touches them. Left alone, the header goes on
   *  naming a list that's gone while the body under it — correctly — shows
   *  a completely different one. */
  function afterBulkChange(listBefore: string): void {
    deps.refreshCount();
    ctx.updateBadge();
    ctx.renderSidebar(false);
    if (ctx.selectedList !== listBefore) ctx.renderPanel();
    else render();
  }

  bulkSelectAll.addEventListener('click', () => {
    if (selectedWords.size === visibleWords.length) selectedWords.clear();
    else visibleWords.forEach(w => selectedWords.add(w));
    syncBulkBar();
  });
  bulkClear.addEventListener('click', () => { selectedWords.clear(); syncBulkBar(); });

  bulkMaster.addEventListener('click', () => {
    // Drives the user-set scale too (setMasteryLevel keeps the legacy Set in
    // sync), so a word bulk-marked here doesn't disagree with its own row.
    selectedWords.forEach(w => setMasteryLevel(ctx.lang, w, MASTERY_LEVELS.length - 1));
    selectedWords.clear(); render();
  });
  bulkUnmaster.addEventListener('click', () => {
    selectedWords.forEach(w => setMasteryLevel(ctx.lang, w, 0));
    selectedWords.clear(); render();
  });

  bulkRemove.addEventListener('click', () => {
    const words = [...selectedWords];
    if (words.length === 0) return;
    // Snapshotted before removeFromList runs, not read live inside Undo:
    // removing every word in the list (Select all + Remove is the obvious
    // way to clear one out) empties it, and removeFromList deletes a list
    // the instant it goes empty. Once that happens, ctx.selectedList no
    // longer names a real list and the next render (afterBulkChange, right
    // below) falls back to whichever list sorts first — so Undo, reading
    // ctx.selectedList live, put the words back into that unrelated list
    // instead of recreating the one they actually came from.
    const source = ctx.selectedList;
    words.forEach(w => removeFromList(ctx.lang, source, w));
    selectedWords.clear();
    afterBulkChange(source);
    showUndo(`Removed ${words.length} word${words.length === 1 ? '' : 's'}`, () => {
      const before = ctx.selectedList;
      words.forEach(w => addToList(ctx.lang, source, w));
      // Undo means "take me back to the list these came from" — set
      // explicitly rather than relying on renderSidebar's own fallback,
      // which only fires when the current selection is invalid and might
      // otherwise leave Undo's restored list recreated but not shown.
      ctx.selectedList = source;
      afterBulkChange(before);
    });
  });

  // Same click-to-pick popover a row's own ⇥ button opens — this used to be
  // a window.prompt() asking the user to retype a list name exactly
  // (case/whitespace-sensitive, with every other list dumped in as plain
  // text to copy from), the one rough, inconsistent corner in an otherwise
  // click-driven pane.
  bulkMove.addEventListener('click', () => {
    if (selectedWords.size === 0) return;
    const others = getListNames(ctx.lang).filter(n => n !== ctx.selectedList);
    if (others.length === 0) { alert('No other list to move to. Create one first.'); return; }
    const words = [...selectedWords];
    // Snapshotted now, not read live inside the Undo closure below: moving
    // every word out of the source list empties it, and removeFromList
    // deletes a list the moment it goes empty — sidebar.ts's own render then
    // notices ctx.selectedList no longer names a real list and falls back to
    // whichever list sorts first, which was often the very list these words
    // just moved *into*. Undo read ctx.selectedList at click time and so
    // "restored" words into the target list a second time instead of the
    // source — a no-op that looked like it had done something (each write
    // landed, just against the wrong list).
    const source = ctx.selectedList;
    openMovePopover(ctx, bulkMove, words, (mode, target) => {
      selectedWords.clear();
      afterBulkChange(source);
      const verb = mode === 'move' ? 'Moved' : 'Copied';
      showUndo(`${verb} ${words.length} to "${target}"`, () => {
        const before = ctx.selectedList;
        if (mode === 'move') {
          words.forEach(w => { removeFromList(ctx.lang, target, w); addToList(ctx.lang, source, w); });
          // Same reasoning as bulk remove's Undo — bring the view back to
          // where these words came from, rather than leaving it wherever
          // the move (or a since-deleted target) left it.
          ctx.selectedList = source;
        } else {
          // Undoing a copy removes the copies rather than re-adding
          // anything to the source list, which the words never left — no
          // "list these came from" to navigate back to, so selection is
          // left alone; afterBulkChange's own comparison still catches it
          // if removing the copies happened to delete an emptied target.
          words.forEach(w => removeFromList(ctx.lang, target, w));
        }
        afterBulkChange(before);
      });
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
  // Just rank range and mastered count — POS breakdown used to be duplicated
  // here too, but the POS chips above already show a count per part of speech
  // (see updateChipCounts), so restating it here was the same number twice.

  function renderStats(words: string[]): void {
    statsRow.innerHTML = '';

    // The list's total membership — independent of the current filter/search,
    // unlike Ranks and Mastered below (both computed over `words`, the
    // currently visible subset).
    const total = getList(ctx.lang, ctx.selectedList).length;
    appendCountChip(statsRow, total);
    if (total === 0) return;

    if (words.length > 0) {
      let minRank = Infinity; let maxRank = -Infinity; let rankedCount = 0;
      const vm = cachedVocabMap(ctx.lang);
      for (const w of words) {
        const rank = vm?.get(w)?.rank;
        if (rank != null) {
          if (rank < minRank) minRank = rank;
          if (rank > maxRank) maxRank = rank;
          rankedCount++;
        }
      }
      if (rankedCount > 1) {
        const chip = document.createElement('span');
        chip.className = 'ml-stat-chip ml-stat-chip--ranks';
        chip.textContent = `Ranks #${minRank}–#${maxRank}`;
        statsRow.appendChild(chip);
      } else if (rankedCount === 1) {
        const chip = document.createElement('span');
        chip.className = 'ml-stat-chip ml-stat-chip--ranks';
        chip.textContent = `Rank #${minRank}`;
        statsRow.appendChild(chip);
      }
    }

    const masteredCount = words.filter(w => getMastered(ctx.lang).has(w)).length;
    appendMasteredChip(statsRow, masteredCount);
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
      btn.textContent = `${chipDef?.label ?? pos} (${n})`;
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
      // This used to read "No words in this list yet." whenever the *visible*
      // set was empty — including a list that has words but Hide mastered (or
      // a Part of Speech/Level chip) filtered every one of them out, which
      // reads as if adding words had silently failed rather than as a filter
      // doing its job.
      const hasWords = getList(ctx.lang, ctx.selectedList).length > 0;
      empty.textContent = filter
        ? 'No matches.'
        : hasWords
          ? 'No words match the current filters.'
          : 'No words in this list yet.';
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
    wordSpan.className = 'ml-word-text';
    wordSpan.textContent = entry?.disambiguator ? `${word} (${entry.disambiguator})` : word;

    const audioBtn = buildAudioButton(entry?.audioUrl);

    const posSpan = document.createElement('span');
    posSpan.className = 'ml-word-pos'; posSpan.textContent = posLabel;
    if (posLabel && entry?.pos) posSpan.dataset.pos = entry.pos;
    else posSpan.hidden = true;

    const transSpan = document.createElement('span');
    transSpan.className = 'ml-word-trans';
    transSpan.textContent = entry?.translation
      ? (entry.meaningDisambiguator ? `${entry.translation} (${entry.meaningDisambiguator})` : entry.translation)
      : '';

    const rankBadge = document.createElement('span');
    rankBadge.className = 'ml-word-rank';
    if (entry?.rank != null) rankBadge.textContent = '#' + entry.rank;
    else rankBadge.hidden = true;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'ml-word-actions';

    // Your own rating (mastery scale) and what quizzes have actually shown
    // (quiz badge) — shared with the cross-language list's rows, see
    // row-shared.ts.
    const { masteryBtn, quizBadge } = buildMasteryControls(ctx.lang, word, render);

    const moveBtn = document.createElement('button');
    moveBtn.type = 'button'; moveBtn.className = 'ml-move-btn';
    moveBtn.title = 'Move or copy to another list'; moveBtn.textContent = '⇥';
    moveBtn.addEventListener('click', e => {
      e.stopPropagation();
      // Captured before the popover applies the move, not after — same
      // reasoning as afterBulkChange's own listBefore, since moving out a
      // list's last word deletes it.
      const listBefore = ctx.selectedList;
      openMovePopover(ctx, moveBtn, [word], () => {
        // Move/copy already applied by the popover — nothing here needs to
        // know which or where; Undo for a single word isn't offered on this
        // path (only the bulk toolbar's own action wires one up).
        afterBulkChange(listBefore);
      });
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button'; removeBtn.className = 'ml-remove-btn';
    removeBtn.title = 'Remove from list'; removeBtn.textContent = '×';
    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      // Captured before removeFromList/renderSidebar run, not after: removing
      // the last word in a list empties it, and removeFromList deletes a
      // list the instant it goes empty — ctx.renderSidebar's own render()
      // then notices ctx.selectedList no longer names a real list and falls
      // back to whichever list sorts first. Capturing *after* that fallback
      // (as this used to) meant Undo on a list's last word restored it into
      // that unrelated fallback list instead of recreating the one it came
      // from — silent data loss dressed up as a working Undo.
      const listAtRemoval = ctx.selectedList;
      removeFromList(ctx.lang, listAtRemoval, word);
      deps.refreshAddResults();
      afterBulkChange(listAtRemoval);
      showUndo(`Removed "${word}"`, () => {
        const before = ctx.selectedList;
        addToList(ctx.lang, listAtRemoval, word);
        // Undo means "take me back to the list this came from" — see the
        // same reasoning on bulk remove's Undo above.
        ctx.selectedList = listAtRemoval;
        afterBulkChange(before);
      });
    });

    actionsDiv.appendChild(quizBadge);
    actionsDiv.appendChild(masteryBtn); actionsDiv.appendChild(moveBtn); actionsDiv.appendChild(removeBtn);
    li.appendChild(check); li.appendChild(wordSpan);
    if (audioBtn) li.appendChild(audioBtn);
    li.appendChild(posSpan);
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
