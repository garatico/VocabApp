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
  getSmartLists, saveSmartRule, evaluateSmart, type SmartRule,
} from './smart-lists.ts';
import { showUndo } from './undo-toast.ts';
import { BANDS, POS_ABBREV, POS_CHIPS } from './types.ts';

const PREVIEW_LIMIT = 400;

/** Same display formatting as the Table/Picture Domains filter — see domain-filter.ts's fmt(). */
function fmtDomain(d: string): string {
  return d.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

export function renderSmartPanel(ctx: ListsCtx, name: string): void {
  const rule = getSmartLists(ctx.lang)[name];
  if (!rule) { ctx.selectedSmart = null; ctx.renderPanel(); return; }

  const header = document.createElement('div');
  header.className = 'ml-panel-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'ml-panel-title-group';
  const title = document.createElement('h2');
  title.className = 'ml-panel-title';
  title.textContent = name;
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

  // What the rule currently selects, as badges rather than one run-on
  // sentence — each criterion reads on its own, and Level/Type reuse the
  // exact same coloured-pill styling as the editor's own chips right below
  // (and My Lists' POS/Level filters everywhere else — see class-filter.css).
  const badgeRow = document.createElement('div');
  badgeRow.className = 'ml-rule-badges';
  header.appendChild(badgeRow);

  const matchedNote = document.createElement('p');
  matchedNote.className = 'ml-smart-desc';
  header.appendChild(matchedNote);

  const vocab = cachedVocab(ctx.lang);
  const vm    = cachedVocabMap(ctx.lang);

  // Domains present in this language's vocabulary, most common first — same
  // computation app.ts does for the Table/Picture Domains filter's pills.
  // Recomputed from `vocab` (not read from that filter's own module) because
  // this rule needs the full list, not just its top-10-pills-plus-dropdown
  // split, and because that module's state is keyed to its own DOM and mode
  // buckets rather than to a smart list's rule.
  const domainCounts = new Map<string, number>();
  for (const e of vocab) {
    for (const d of e.domains) domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }
  const domainList = [...domainCounts.keys()].sort((a, b) => domainCounts.get(b)! - domainCounts.get(a)!);

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
    datasetAttr?: 'pos' | 'band',
    format?: (v: string) => string,
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
      if (datasetAttr) chip.dataset[datasetAttr] = v;
      // The chip's value (`v`) stays lowercase for `pos` — it has to match
      // vocab entries' `pos` field exactly — the capitalized label (bands are
      // already uppercase, e.g. "A1") is display-only. `format` covers
      // anything else that needs its own display label (domains).
      chip.textContent = format ? format(v) : datasetAttr === 'pos' ? v[0].toUpperCase() + v.slice(1) : v;
      chip.addEventListener('click', () => { onToggle(v); persist(); });
      row.appendChild(chip);
    });
    return row;
  }

  /** One pill per criterion the rule is currently filtering on. */
  function renderRuleBadges(container: HTMLElement, r: SmartRule): void {
    container.innerHTML = '';
    const addBadge = (text: string, dataset?: { pos?: string; band?: string }) => {
      const el = document.createElement('span');
      el.className = 'pos-chip ml-rule-badge';
      if (dataset?.pos)  el.dataset.pos  = dataset.pos;
      if (dataset?.band) el.dataset.band = dataset.band;
      el.textContent = text;
      container.appendChild(el);
    };
    r.bands.forEach(b => addBadge(b, { band: b }));
    r.pos.forEach(p => addBadge(p[0].toUpperCase() + p.slice(1), { pos: p }));
    r.domains.forEach(d => addBadge(fmtDomain(d)));
    if (r.mastered === 'no')  addBadge('Not Mastered');
    if (r.mastered === 'yes') addBadge('Mastered');
    if (r.listed === 'no')    addBadge('Not In A List');
    if (r.due === 'yes')      addBadge('Due for Review');
    if (r.wordStartsWith)     addBadge(`Word Starts With "${r.wordStartsWith}"`);
    if (r.meaningContains)    addBadge(`Meaning Contains "${r.meaningContains}"`);
    if (r.limit > 0)          addBadge(`Top ${r.limit}`);
    if (container.children.length === 0) addBadge('Everything');
  }

  /**
   * A free-text row, for filters selects/chips can't express.
   *
   * Deliberately not routed through `persist()` on every keystroke: that goes
   * through `ctx.renderPanel()`, which rebuilds this input from scratch and
   * would drop keyboard focus after every character. Saves the rule directly
   * and re-runs just the evaluation below instead.
   */
  function textRow(
    label: string, placeholder: string, current: string,
    onInput: (v: string) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'ml-smart-row';
    const lab = document.createElement('span');
    lab.className = 'ml-band-label'; lab.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'ml-sort-select';
    inp.placeholder = placeholder; inp.value = current;
    inp.addEventListener('input', () => {
      onInput(inp.value);
      saveSmartRule(ctx.lang, name, rule);
      refresh();
    });
    row.append(lab, inp);
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
  }, 'band'));
  editor.appendChild(chipGroup(
    'Type', POS_CHIPS.filter(c => c.value).map(c => c.value), rule.pos, v => {
      const i = rule.pos.indexOf(v);
      if (i >= 0) rule.pos.splice(i, 1); else rule.pos.push(v);
    }, 'pos'));
  if (domainList.length) {
    editor.appendChild(chipGroup('Domain', domainList, rule.domains, v => {
      const i = rule.domains.indexOf(v);
      if (i >= 0) rule.domains.splice(i, 1); else rule.domains.push(v);
    }, undefined, fmtDomain));
  }
  editor.appendChild(selectRow('Mastered', [
    ['no', 'Not Yet Mastered'], ['yes', 'Mastered'], ['any', 'Either'],
  ], rule.mastered, v => { rule.mastered = v as SmartRule['mastered']; }));
  editor.appendChild(selectRow('In a List', [
    ['no', 'Not In Any List'], ['any', 'Either'],
  ], rule.listed, v => { rule.listed = v as SmartRule['listed']; }));
  editor.appendChild(selectRow('Review', [
    ['yes', 'Due Now'], ['any', 'Either'],
  ], rule.due ?? 'any', v => { rule.due = v as SmartRule['due']; }));
  editor.appendChild(textRow(
    'Word Starts With', 'e.g. "a"', rule.wordStartsWith ?? '',
    v => { rule.wordStartsWith = v; },
  ));
  editor.appendChild(textRow(
    'Meaning Contains', 'e.g. "house"', rule.meaningContains ?? '',
    v => { rule.meaningContains = v; },
  ));
  editor.appendChild(selectRow('Limit', [
    ['25', '25 Most Common'], ['50', '50 Most Common'], ['100', '100 Most Common'],
    ['250', '250 Most Common'], ['0', 'No Limit'],
  ], String(rule.limit), v => { rule.limit = Number(v); }));
  editor.appendChild(selectRow('Order', [
    ['rank', 'Most Frequent First'], ['alpha', 'A → Z'],
  ], rule.sort, v => { rule.sort = v as SmartRule['sort']; }));

  header.appendChild(editor);
  ctx.panel.appendChild(header);

  const listEl = document.createElement('ul');
  listEl.className = 'ml-word-list';
  ctx.panel.appendChild(listEl);

  // ── Evaluate ───────────────────────────────────────────────────────────────

  let words: string[] = [];

  /**
   * Re-run the rule and redraw everything below the editor. Kept separate
   * from `persist()` so the text-filter inputs above can update in place
   * without `ctx.renderPanel()` tearing down the editor (and their focus)
   * on every keystroke.
   */
  function refresh(): void {
    words = evaluateSmart(ctx.lang, rule, vocab);

    count.textContent = `${words.length} words`;
    renderRuleBadges(badgeRow, rule);
    matchedNote.textContent = vocab.length
      ? `Matched Against ${vocab.length.toLocaleString()} Words`
      : '';

    listEl.innerHTML = '';

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

  refresh();
}
