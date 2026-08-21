/**
 * multi-panel.ts — the right pane for a cross-language list.
 *
 * Deliberately smaller than panel.ts: view and remove only. No add-search, no
 * bulk import, no smart rules, no export — a cross-language list isn't
 * scoped to one `ctx.lang`, so panel.ts's machinery (built entirely around
 * `getList(ctx.lang, ...)` / `cachedVocabMap(ctx.lang)`) doesn't fit it.
 * Adding a word happens from the star-button picker on the word itself
 * (list-picker.ts), which already knows that word's real language.
 *
 * Word → translation/pos resolution fetches vocab for every distinct
 * language actually present in the list, not just one — vocab-cache.ts is
 * already keyed per language, so this is just calling fetchVocab() once per
 * language found instead of once for ctx.lang.
 */

import {
  getMultiList, getMultiListLanguages, removeFromMultiList, addToMultiList, type MultiListEntry,
} from '../../utils/word-lists.ts';
import type { ListsCtx } from './context.ts';
import { fetchVocab, cachedVocabMap } from './vocab-cache.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import { showUndo } from './undo-toast.ts';
import { logger } from '../../utils/logger.ts';

export function renderMultiPanel(ctx: ListsCtx, listName: string): void {
  ctx.panel.innerHTML = '';

  const entries = getMultiList(listName);

  // ── Header ───────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'ml-panel-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'ml-panel-title-group';
  const title = document.createElement('h2');
  title.className = 'ml-panel-title'; title.textContent = listName;
  const countBadge = document.createElement('span');
  countBadge.className = 'ml-panel-count';
  countBadge.textContent = `${entries.length} word${entries.length === 1 ? '' : 's'}`;
  titleGroup.append(title, buildLangBadge(getMultiListLanguages(listName)), countBadge);
  header.appendChild(titleGroup);
  ctx.panel.appendChild(header);

  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'ml-panel-empty';
    empty.textContent = 'No words yet — add one from the ★ button on any word, in any language.';
    ctx.panel.appendChild(empty);
    return;
  }

  // ── Word list ────────────────────────────────────────────────────────────
  const listEl = document.createElement('ul');
  listEl.className = 'ml-word-list';
  ctx.panel.appendChild(listEl);

  function renderRows(): void {
    listEl.innerHTML = '';
    for (const entry of entries) {
      listEl.appendChild(buildRow(entry));
    }
  }

  function buildRow(entry: MultiListEntry): HTMLElement {
    const li = document.createElement('li');
    li.className = 'ml-word-item';

    const wordSpan = document.createElement('span');
    wordSpan.className = 'ml-word-text';
    wordSpan.textContent = entry.word;

    const vocabEntry = cachedVocabMap(entry.language)?.get(entry.word);

    const transSpan = document.createElement('span');
    transSpan.className = 'ml-word-trans';
    transSpan.textContent = vocabEntry?.translation ?? '';

    const actions = document.createElement('span');
    actions.className = 'ml-word-actions';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button'; removeBtn.className = 'ml-remove-btn';
    removeBtn.title = 'Remove from this list'; removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      removeFromMultiList(listName, entry.word, entry.language);
      const idx = entries.indexOf(entry);
      if (idx !== -1) entries.splice(idx, 1);
      countBadge.textContent = `${entries.length} word${entries.length === 1 ? '' : 's'}`;
      renderRows();
      if (entries.length === 0) { ctx.renderSidebar(false); renderMultiPanel(ctx, listName); }
      showUndo(`Removed "${entry.word}"`, () => {
        entries.push(entry);
        addToMultiList(listName, entry.word, entry.language);
        countBadge.textContent = `${entries.length} word${entries.length === 1 ? '' : 's'}`;
        renderRows();
      });
    });
    actions.appendChild(removeBtn);

    li.append(buildLangBadge([entry.language]), wordSpan, transSpan, actions);
    return li;
  }

  renderRows();

  // Distinct languages this list actually holds — fetched once, cached
  // per-language by vocab-cache.ts for every other mode that already uses it.
  const distinctLangs = getMultiListLanguages(listName);
  Promise.all(distinctLangs.map(fetchVocab)).then(() => renderRows()).catch(logger.error);
}
