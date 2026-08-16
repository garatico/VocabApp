/**
 * smart-panel.ts — the right-hand pane for a smart list.
 *
 * A rule editor above a read-only preview. Editing any control saves the rule
 * and redraws, so the preview underneath is always what the rule currently
 * selects — there is no Apply button to forget to press.
 *
 * Rows here are plain: word, part of speech, level, translation. None of the
 * per-row actions from an ordinary list apply, because the membership is
 * computed. "Save as list" is the escape hatch — it materialises the current
 * result into a normal, editable list.
 *
 * The preview stops at 400 rows. A rule with no limit can match the entire
 * vocabulary, and this pane is for judging whether the rule is right, not for
 * working through the words.
 */

import {
  getListNames, createList, addToList, deleteList,
} from '../../utils/word-lists.ts';
import type { ListsCtx } from './context.ts';
import { cachedVocab, cachedVocabMap } from './vocab-cache.ts';
import { getMastered } from './mastery.ts';
import {
  getSmartLists, saveSmartRule, evaluateSmart, describeSmart, type SmartRule,
} from './smart-lists.ts';
import { showUndo } from './undo-toast.ts';
import { BANDS, POS_ABBREV } from './types.ts';

const PREVIEW_LIMIT = 400;

export function renderSmartPanel(ctx: ListsCtx, name: string): void {
  const rule = getSmartLists(ctx.lang)[name];
  if (!rule) { ctx.selectedSmart = null; ctx.renderPanel(); return; }

  const header = document.createElement('div');
  header.className = 'ml-panel-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'ml-panel-title-group';
  const title = document.createElement('h2');
  title.className = 'ml-panel-title';
  title.textContent = '⚡ ' + name;
  const count = document.createElement('span');
  count.className = 'ml-panel-count';
  titleGroup.append(title, count);

  // Materialise — the escape hatch from a query into an editable list.
  const freezeBtn = document.createElement('button');
  freezeBtn.type = 'button'; freezeBtn.className = 'ml-export-btn';
  freezeBtn.textContent = '⤓ Save as list';
  freezeBtn.title = 'Copy these words into a normal, editable list';
  titleGroup.appendChild(freezeBtn);

  header.appendChild(titleGroup);

  const desc = document.createElement('p');
  desc.className = 'ml-smart-desc';
  header.appendChild(desc);

  // ── Rule editor ────────────────────────────────────────────────────────────

  const editor = document.createElement('div');
  editor.className = 'ml-smart-editor';

  /**
   * Save and redraw.
   *
   * Goes through renderPanel rather than calling this function again, because
   * this function only ever appends: re-entering it directly stacked a second
   * copy of the editor and preview under the first on every chip click.
   */
  function persist(): void {
    saveSmartRule(ctx.lang, name, rule);
    ctx.renderPanel();
  }

  function chipGroup(
    label: string, values: readonly string[], selected: string[],
    onToggle: (v: string) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ml-smart-row';
    const lab = document.createElement('span');
    lab.className = 'ml-band-label'; lab.textContent = label;
    row.appendChild(lab);
    values.forEach(v => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pos-chip' + (selected.includes(v) ? ' active' : '');
      chip.textContent = v;
      chip.addEventListener('click', () => { onToggle(v); persist(); });
      row.appendChild(chip);
    });
    return row;
  }

  function selectRow(
    label: string, opts: readonly [string, string][],
    current: string, onPick: (v: string) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ml-smart-row';
    const lab = document.createElement('span');
    lab.className = 'ml-band-label'; lab.textContent = label;
    const sel = document.createElement('select');
    sel.className = 'ml-sort-select';
    opts.forEach(([v, l]) => {
      const o = document.createElement('option');
      o.value = v; o.textContent = l; o.selected = v === current;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => { onPick(sel.value); persist(); });
    row.append(lab, sel);
    return row;
  }

  editor.appendChild(chipGroup('Level', BANDS, rule.bands, v => {
    const i = rule.bands.indexOf(v);
    if (i >= 0) rule.bands.splice(i, 1); else rule.bands.push(v);
  }));
  editor.appendChild(chipGroup(
    'Type', ['noun', 'verb', 'adjective', 'adverb'], rule.pos, v => {
      const i = rule.pos.indexOf(v);
      if (i >= 0) rule.pos.splice(i, 1); else rule.pos.push(v);
    }));
  editor.appendChild(selectRow('Mastered', [
    ['no', 'Not yet mastered'], ['yes', 'Mastered'], ['any', 'Either'],
  ], rule.mastered, v => { rule.mastered = v as SmartRule['mastered']; }));
  editor.appendChild(selectRow('In a list', [
    ['no', 'Not in any list'], ['any', 'Either'],
  ], rule.listed, v => { rule.listed = v as SmartRule['listed']; }));
  editor.appendChild(selectRow('Limit', [
    ['25', 'Top 25'], ['50', 'Top 50'], ['100', 'Top 100'],
    ['250', 'Top 250'], ['0', 'No limit'],
  ], String(rule.limit), v => { rule.limit = Number(v); }));
  editor.appendChild(selectRow('Order', [
    ['rank', 'Most frequent first'], ['alpha', 'A → Z'],
  ], rule.sort, v => { rule.sort = v as SmartRule['sort']; }));

  header.appendChild(editor);
  ctx.panel.appendChild(header);

  const listEl = document.createElement('ul');
  listEl.className = 'ml-word-list';
  ctx.panel.appendChild(listEl);

  // ── Evaluate ───────────────────────────────────────────────────────────────

  const vocab = cachedVocab(ctx.lang);
  const words = evaluateSmart(ctx.lang, rule, vocab);
  const vm    = cachedVocabMap(ctx.lang);

  count.textContent = `${words.length} words`;
  desc.textContent  = describeSmart(rule)
    + (vocab.length ? ` — matched against ${vocab.length.toLocaleString()} words` : '');

  freezeBtn.addEventListener('click', () => {
    if (words.length === 0) return;
    let target = name;
    let n = 2;
    while (getListNames(ctx.lang).includes(target)) target = `${name} (${n++})`;
    createList(ctx.lang, target);
    words.forEach(w => addToList(ctx.lang, target, w));
    ctx.selectedSmart = null; ctx.selectedList = target;
    ctx.updateBadge(); ctx.renderSidebar();
    showUndo(`Saved ${words.length} words as "${target}"`, () => {
      deleteList(ctx.lang, target);
      ctx.selectedList = ''; ctx.selectedSmart = name;
      ctx.updateBadge(); ctx.renderSidebar();
    });
  });

  if (vocab.length === 0) {
    const loading = document.createElement('li');
    loading.className = 'ml-word-empty';
    loading.textContent = 'Loading vocabulary…';
    listEl.appendChild(loading);
    return;
  }
  if (words.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'ml-word-empty';
    empty.textContent = 'Nothing matches this rule. Try loosening it above.';
    listEl.appendChild(empty);
    return;
  }

  const mastered = getMastered(ctx.lang);
  words.slice(0, PREVIEW_LIMIT).forEach(word => {
    const entry = vm?.get(word);
    const li = document.createElement('li');
    li.className = 'ml-word-item'
      + (mastered.has(word) ? ' ml-word-item--mastered' : '');

    const wordSpan = document.createElement('span');
    wordSpan.className = 'ml-word-text'; wordSpan.textContent = word;
    const posSpan = document.createElement('span');
    posSpan.className = 'ml-word-pos';
    posSpan.textContent = POS_ABBREV[entry?.pos ?? ''] ?? '';
    if (entry?.pos) posSpan.dataset.pos = entry.pos; else posSpan.hidden = true;
    const bandSpan = document.createElement('span');
    bandSpan.className = 'ml-word-rank';
    bandSpan.textContent = entry?.band ?? '';
    if (!bandSpan.textContent) bandSpan.hidden = true;
    const transSpan = document.createElement('span');
    transSpan.className = 'ml-word-trans';
    transSpan.textContent = entry?.translation ?? '';

    li.append(wordSpan, posSpan, bandSpan, transSpan);
    listEl.appendChild(li);
  });

  if (words.length > PREVIEW_LIMIT) {
    const more = document.createElement('li');
    more.className = 'ml-chunk-sentinel';
    more.textContent =
      `…and ${words.length - PREVIEW_LIMIT} more. Save as a list to work through them.`;
    listEl.appendChild(more);
  }
}
