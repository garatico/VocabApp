/**
 * smart-panel.ts — the right-hand pane for a smart list.
 *
 * A rule editor above a read-only preview. Editing any control saves the rule
 * and redraws, so the preview underneath is always what the rule currently
 * selects — there is no Apply button to forget to press.
 *
 * Rows are the same shared word row every list type uses (row-shared.ts's
 * buildWordRow: audio, POS, rank, translation, mastery, click-to-expand
 * detail), and the header offers the same Export and Quiz. What a smart list
 * lacks is what its computed membership rules out — add/move/remove a word.
 * "Save as list" is the escape hatch: it materialises the current result into
 * a normal, editable list. The result is paged, 100 words to a page.
 */

import {
  getListNames, createList, addToList, deleteList,
} from '../../utils/word-lists.ts';
import { foldKey as norm } from '../../utils/match.ts';
import { readString, writeString } from '../../utils/storage.ts';
import type { ListsCtx } from './context.ts';
import { cachedVocab, cachedVocabMap } from './vocab-cache.ts';
import { getMastered } from './mastery.ts';
import {
  getSmartLists, saveSmartRule, evaluateSmart, type SmartRule,
} from './smart-lists.ts';
import { showUndo } from './undo-toast.ts';
import { BANDS, POS_CHIPS } from './types.ts';
import { buildChecklistDropdown, buildChipDropdown } from './chip-dropdown.ts';
import { createPager } from './pager.ts';
import { buildWordRow } from './row-shared.ts';
import { buildExportControls, buildQuizButton } from './list-actions.ts';
import { exportList } from './export-list.ts';
import { qualifySmartListName } from '../../utils/word-lists.ts';
import { getFolderRegistry, addFolder } from './folders.ts';
import { FILTER_SCOPES, SCOPE_LABELS, type FilterScope } from '../../filters/filter-scope.ts';

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
  // "Matched against N words" reads as part of the count, so it sits right
  // beside it rather than on a line of its own further down.
  const matchedNote = document.createElement('span');
  matchedNote.className = 'ml-smart-desc ml-smart-matched';
  titleGroup.append(title, count);
  // Marks a list that has words pinned by hand; hidden when there are none.
  const manualTag = document.createElement('span');
  manualTag.className = 'ml-manual-badge';
  manualTag.title = 'Words pinned by hand under Manual Additions';
  function syncManualTag(): void {
    manualTag.hidden = rule.manualWords.length === 0;
    manualTag.textContent = `✋ ${rule.manualWords.length} manual`;
  }
  syncManualTag();
  titleGroup.append(manualTag, matchedNote);

  // Materialise — the escape hatch from a query into an editable list.
  const freezeBtn = document.createElement('button');
  freezeBtn.type = 'button'; freezeBtn.className = 'ml-export-btn';
  freezeBtn.textContent = '⤓ Save as list';
  freezeBtn.title = 'Copy these words into a normal, editable list';
  // Save as list + Export + Quiz at the right end of the title row, like the
  // other list types. Exported as filtered/sorted on screen.
  let shownAll: string[] = [];
  const titleActions = document.createElement('span');
  titleActions.className = 'ml-title-actions';
  titleActions.append(
    freezeBtn,
    ...buildExportControls(fmt => exportList(shownAll, cachedVocabMap(ctx.lang), name, ctx.lang, fmt)),
    buildQuizButton(ctx.lang, () => qualifySmartListName(ctx.lang, name)),
  );
  titleGroup.appendChild(titleActions);

  header.appendChild(titleGroup);

  // ── Folders / Hide From — same dropdown row as a Single-Language list's
  // panel (panel.ts). Written straight onto `rule` (not a copy) so the rule
  // editor's own persist() below, which saves that same object, can't put
  // back an older folders/hiddenModes.
  const smartFolderScope = `smart_${ctx.lang}`;
  const dropdownsRow = document.createElement('div');
  dropdownsRow.className = 'ml-filter-dropdowns-row';

  function saveMembership(): void {
    saveSmartRule(ctx.lang, name, rule);
    ctx.renderSidebar(false);
  }
  const folderSelected = new Set(rule.folders ?? []);
  function syncFolders(): void {
    rule.folders = [...folderSelected]; rule.folder = undefined;
    saveMembership();
  }
  const newFolderBtn = document.createElement('button');
  newFolderBtn.type = 'button';
  newFolderBtn.className = 'ml-chip-dropdown-new-folder';
  newFolderBtn.textContent = '+ new folder…';
  newFolderBtn.addEventListener('click', e => {
    e.stopPropagation();
    const folderName = window.prompt('New folder name:');
    if (!folderName?.trim()) return;
    addFolder(smartFolderScope, folderName.trim());
    folderSelected.add(folderName.trim());
    syncFolders();
    ctx.renderPanel(); // rebuild so the new folder shows as a selectable option
  });
  const folderDropdown = buildChecklistDropdown(
    'Folders', getFolderRegistry(smartFolderScope).map(f => ({ value: f, label: f })),
    folderSelected, syncFolders, newFolderBtn,
  );

  const hiddenSelected = new Set<string>(rule.hiddenModes ?? []);
  const hideFromDropdown = buildChecklistDropdown(
    'Hide From', FILTER_SCOPES.map(s => ({ value: s, label: SCOPE_LABELS[s] })), hiddenSelected,
    () => { rule.hiddenModes = [...hiddenSelected] as FilterScope[]; saveMembership(); },
  );
  dropdownsRow.append(folderDropdown.wrap, hideFromDropdown.wrap);
  header.appendChild(dropdownsRow);

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

  /**
   * A labelled, collapsible group of rows — "Filters", "Refine", "Manual
   * Additions", "Limit & Order" — so the full rule editor can be shrunk down
   * to just its section titles, leaving more of the pane for the preview
   * list below. Mirrors profile-panel.ts's own `group()` (same
   * `.filter-collapse-btn`/`.filter-body` CSS and `s_section_open_`-style
   * persistence convention) but themed to Smart Lists' own accent color
   * rather than Testing Profiles'.
   */
  function group(id: string, titleText: string, ...rows: HTMLElement[]): HTMLElement {
    const storageKey = 'ml_smart_group_open_' + id;
    const g = document.createElement('div');
    g.className = 'ml-smart-editor-group';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-collapse-btn ml-smart-editor-group-title';
    const bodyId = `mlSmartGroupBody-${id}`;
    btn.setAttribute('aria-controls', bodyId);

    const arrow = document.createElement('span');
    arrow.className = 'filter-collapse-arrow';
    arrow.textContent = '▾';
    const label = document.createElement('span');
    label.className = 'filter-section-label';
    label.textContent = titleText;
    btn.append(arrow, label);

    const body = document.createElement('div');
    body.id = bodyId;
    body.className = 'filter-body ml-smart-editor-group-body';
    body.append(...rows);

    const open = readString(storageKey) !== 'false';
    btn.setAttribute('aria-expanded', String(open));
    body.classList.toggle('filter-body--collapsed', !open);
    btn.addEventListener('click', () => {
      const nowOpen = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(nowOpen));
      body.classList.toggle('filter-body--collapsed', !nowOpen);
      writeString(storageKey, String(nowOpen));
    });

    g.append(btn, body);
    return g;
  }

  /**
   * Search-and-add for words the rule's own filters wouldn't otherwise
   * select — a plain word list rather than chips, since there is no bounded
   * set of options to offer. Writes straight to `rule.manualWords`; every
   * change goes through `persist()`, which re-renders the whole panel, so
   * this closure never needs to redraw its own chip list in place.
   */
  function manualWordsSection(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'ml-smart-manual';

    const label = document.createElement('span');
    label.className = 'filter-section-label ml-smart-manual-label';

    const searchRow = document.createElement('div');
    searchRow.className = 'ml-add-row';
    const icon = document.createElement('span');
    icon.className = 'ml-add-icon'; icon.textContent = '+';
    const input = document.createElement('input');
    input.type = 'text'; input.placeholder = 'Add a specific word…';
    input.className = 'ml-add-input';
    searchRow.append(icon, input);

    const results = document.createElement('ul');
    results.className = 'ml-add-results'; results.hidden = true;

    function renderResults(query: string): void {
      results.innerHTML = '';
      if (!query) { results.hidden = true; return; }
      const already = new Set(rule.manualWords.map(w => w.toLowerCase()));
      const q = norm(query);
      const matches = vocab
        .filter(e => !already.has(e.word.toLowerCase()))
        .filter(e => norm(e.word).includes(q) || norm(e.translation).includes(q))
        .slice(0, 12);
      if (!matches.length) { results.hidden = true; return; }
      matches.forEach(entry => {
        const li = document.createElement('li');
        li.className = 'ml-add-result-item';
        const wordSpan = document.createElement('span');
        wordSpan.className = 'ml-add-result-word'; wordSpan.textContent = entry.word;
        const transSpan = document.createElement('span');
        transSpan.className = 'ml-add-result-trans'; transSpan.textContent = entry.translation;
        li.append(wordSpan, transSpan);
        li.addEventListener('click', () => {
          rule.manualWords.push(entry.word);
          persist();
        });
        results.appendChild(li);
      });
      results.hidden = false;
    }
    input.addEventListener('input', () => renderResults(input.value.trim()));

    // The manually added words: a dropdown on the same line as the input,
    // searchable and scrollable, each with a remove button. Edits in place
    // (no panel rebuild) so the dropdown stays open while several are removed.
    const dd = document.createElement('div');
    dd.className = 'ml-chip-dropdown';
    const ddToggle = document.createElement('button');
    ddToggle.type = 'button'; ddToggle.className = 'ml-chip-dropdown-toggle';
    const ddPanel = document.createElement('div');
    ddPanel.className = 'ml-chip-dropdown-panel ml-chip-dropdown-panel--checklist ml-chip-dropdown-panel--right ml-manual-dd-panel';
    ddPanel.hidden = true;
    ddPanel.addEventListener('click', e => e.stopPropagation());
    const ddSearch = document.createElement('input');
    ddSearch.type = 'search'; ddSearch.className = 'ml-chip-dropdown-search';
    ddSearch.placeholder = 'Search manual words…';
    const ddList = document.createElement('div');
    ddList.className = 'ml-chip-dropdown-scroll';
    ddPanel.append(ddSearch, ddList);
    dd.append(ddToggle, ddPanel);

    function updateLabel(): void {
      const n = rule.manualWords.length;
      label.textContent = 'Manual Additions';
      ddToggle.textContent = `Manual Words: ${n}`;
      ddToggle.disabled = n === 0;
      if (n === 0) ddPanel.hidden = true;
    }

    function renderManualList(): void {
      ddList.innerHTML = '';
      const q = norm(ddSearch.value.trim());
      const shown = rule.manualWords.filter(w => {
        if (!q) return true;
        const e = vm?.get(w);
        return norm(w).includes(q) || (!!e && norm(e.translation).includes(q));
      });
      if (shown.length === 0) {
        const none = document.createElement('div');
        none.className = 'ml-chip-dropdown-empty';
        none.textContent = 'No matches';
        ddList.appendChild(none);
      }
      shown.forEach(w => {
        const item = document.createElement('div');
        item.className = 'ml-manual-item';
        const word = document.createElement('span');
        word.className = 'ml-manual-item-word'; word.textContent = w;
        const trans = document.createElement('span');
        trans.className = 'ml-manual-item-trans'; trans.textContent = vm?.get(w)?.translation ?? '';
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'ml-smart-manual-remove';
        rm.textContent = '×'; rm.title = `Remove "${w}"`;
        rm.addEventListener('click', () => {
          rule.manualWords = rule.manualWords.filter(x => x !== w);
          saveSmartRule(ctx.lang, name, rule);
          ctx.renderSidebar(false);
          syncManualTag(); updateLabel(); renderManualList();
          pager.reset(); refresh();
        });
        item.append(word, trans, rm);
        ddList.appendChild(item);
      });
    }
    ddSearch.addEventListener('input', renderManualList);
    ddToggle.addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll<HTMLElement>('.ml-chip-dropdown-panel').forEach(p => { if (p !== ddPanel) p.hidden = true; });
      ddPanel.hidden = !ddPanel.hidden;
      if (!ddPanel.hidden) { renderManualList(); ddSearch.focus(); }
    });
    updateLabel();

    const row = document.createElement('div');
    row.className = 'ml-smart-manual-row';
    row.append(label, searchRow, dd);
    wrap.append(row, results);
    return wrap;
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

  // Level / Type / Domain — the same dropdowns a Single-Language list has
  // (Part of Speech + Level), plus Domain. They write straight onto `rule`
  // and refresh() in place, rather than persist()'s full panel rebuild, so
  // an open dropdown stays open while several values are ticked.
  function saveRule(): void {
    saveSmartRule(ctx.lang, name, rule);
    ctx.renderSidebar(false);
    pager.reset();
    refresh();
  }
  const bandSelected = new Set<string>(rule.bands);
  const bandDropdown = buildChipDropdown(
    'Level', 'band', BANDS.map(b => ({ value: b, label: b })), bandSelected,
    () => { rule.bands = [...bandSelected]; saveRule(); },
  );
  const posSelected = new Set<string>(rule.pos);
  const posDropdown = buildChipDropdown(
    'Type', 'pos', POS_CHIPS.filter(c => c.value), posSelected,
    () => { rule.pos = [...posSelected]; saveRule(); },
  );
  dropdownsRow.prepend(bandDropdown.wrap, posDropdown.wrap);
  if (domainList.length) {
    const domainSelected = new Set<string>(rule.domains);
    const domainDropdown = buildChecklistDropdown(
      'Domain', domainList.map(d => ({ value: d, label: fmtDomain(d) })), domainSelected,
      () => { rule.domains = [...domainSelected]; saveRule(); },
    );
    bandDropdown.wrap.after(posDropdown.wrap, domainDropdown.wrap);
  }

  const refineRows: HTMLElement[] = [
    selectRow('Mastered', [
      ['no', 'Not Yet Mastered'], ['yes', 'Mastered'], ['any', 'Either'],
    ], rule.mastered, v => { rule.mastered = v as SmartRule['mastered']; }),
    selectRow('In a List', [
      ['no', 'Not In Any List'], ['any', 'Either'],
    ], rule.listed, v => { rule.listed = v as SmartRule['listed']; }),
    selectRow('Review', [
      ['yes', 'Due Now'], ['any', 'Either'],
    ], rule.due ?? 'any', v => { rule.due = v as SmartRule['due']; }),
    textRow(
      'Word Starts With', 'e.g. "a"', rule.wordStartsWith ?? '',
      v => { rule.wordStartsWith = v; },
    ),
    textRow(
      'Meaning Contains', 'e.g. "house"', rule.meaningContains ?? '',
      v => { rule.meaningContains = v; },
    ),
  ];

  const limitRows: HTMLElement[] = [
    selectRow('Limit', [
      ['25', '25 Most Common'], ['50', '50 Most Common'], ['100', '100 Most Common'],
      ['250', '250 Most Common'], ['0', 'No Limit'],
    ], String(rule.limit), v => { rule.limit = Number(v); }),
    selectRow('Order', [
      ['rank', 'Most Frequent First'], ['alpha', 'A → Z'],
    ], rule.sort, v => { rule.sort = v as SmartRule['sort']; }),
  ];

  // Refine and Limit & Order used to be two groups; they are one set of
  // rule controls, so one group.
  editor.append(group('refine', 'Refine, Limit & Order', ...refineRows, ...limitRows));

  header.appendChild(editor);
  ctx.panel.appendChild(header);

  // ── Filter / sort toolbar — same controls as a Single-Language list ────────
  // Narrows what is *shown* of the rule's result; the rule itself, the
  // "N words" count and "Save as list" are unaffected. Local state, not ctx's,
  // so it doesn't leak into whichever list is opened next.
  let filterQuery = '';
  let sortMode = 'rule';
  let hideMastered = false;

  const toolbar = document.createElement('div');
  toolbar.className = 'ml-list-toolbar';
  const controlsGroup = document.createElement('div');
  controlsGroup.className = 'ml-panel-controls';

  const filterLabel = document.createElement('span');
  filterLabel.className = 'ui-label ml-toolbar-label'; filterLabel.textContent = 'Filter';
  const filterInp = document.createElement('input');
  filterInp.type = 'text'; filterInp.placeholder = 'Filter by word, translation or gloss…';
  filterInp.className = 'ml-search';
  filterInp.title = 'Accent-insensitive — searches word, translation and glosses';
  filterInp.addEventListener('input', () => { filterQuery = filterInp.value; pager.reset(); refresh(); });

  const sortLabel = document.createElement('span');
  sortLabel.className = 'ui-label ml-toolbar-label'; sortLabel.textContent = 'Sort';
  const sortSel = document.createElement('select');
  sortSel.className = 'ml-sort-select'; sortSel.title = 'Sort order';
  ([
    ['rule',       "Rule's order"],
    ['alpha-asc',  'A → Z'],
    ['alpha-desc', 'Z → A'],
    ['rank-asc',   'Easiest first'],
    ['rank-desc',  'Hardest first'],
  ] as const).forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    sortSel.appendChild(opt);
  });
  sortSel.addEventListener('change', () => { sortMode = sortSel.value; pager.reset(); refresh(); });

  const hideMasteredBtn = document.createElement('button');
  hideMasteredBtn.type = 'button';
  hideMasteredBtn.className = 'ml-hide-mastered-btn';
  hideMasteredBtn.textContent = 'Hide mastered';
  hideMasteredBtn.title = 'Hide words you have marked as mastered';
  hideMasteredBtn.addEventListener('click', () => {
    hideMastered = !hideMastered;
    hideMasteredBtn.classList.toggle('ml-hide-mastered-btn--active', hideMastered);
    pager.reset(); refresh();
  });

  controlsGroup.append(filterLabel, filterInp, sortLabel, sortSel, hideMasteredBtn);
  toolbar.appendChild(controlsGroup);

  // Manual Additions sit on their own, directly above the filter bar — they
  // are about which words are in the list, not a rule setting.
  const manualBox = document.createElement('div');
  manualBox.className = 'ml-smart-editor ml-smart-manual-box';
  // Always open — no collapse toggle, unlike the rule editor's groups.
  manualBox.appendChild(manualWordsSection());
  ctx.panel.appendChild(manualBox);
  ctx.panel.appendChild(toolbar);

  // Paged rather than capped: a rule that matches a thousand words used to
  // stop at the first 400 with "…and N more".
  const pager = createPager(() => refresh());
  ctx.panel.appendChild(pager.el);

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
    shownAll = []; // set below once there is something to export

    count.textContent = `${words.length} words`;
    matchedNote.textContent = vocab.length
      ? `Matched Against ${vocab.length.toLocaleString()} Words`
      : '';

    listEl.innerHTML = '';
    pager.el.hidden = true; // re-shown by pager.slice() once there are words to page

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
    const q = norm(filterQuery);
    let shown = words.filter(w => {
      if (hideMastered && mastered.has(w)) return false;
      if (!q) return true;
      if (norm(w).includes(q)) return true;
      const e = vm?.get(w);
      return !!e && (norm(e.translation).includes(q) || e.glosses.some(g => norm(g).includes(q)));
    });
    if (sortMode !== 'rule') {
      const F = 9999;
      const rank = (w: string): number => vm?.get(w)?.rank ?? F;
      shown = [...shown].sort(
        sortMode === 'alpha-asc'  ? (a, b) => norm(a).localeCompare(norm(b))
        : sortMode === 'alpha-desc' ? (a, b) => norm(b).localeCompare(norm(a))
        : sortMode === 'rank-asc'   ? (a, b) => rank(a) - rank(b)
        : (a, b) => rank(b) - rank(a),
      );
    }
    if (shown.length === 0) {
      const none = document.createElement('li');
      none.className = 'ml-word-empty';
      none.textContent = filterQuery ? 'No matches.' : 'No words match the current filters.';
      listEl.appendChild(none);
      return;
    }
    shownAll = shown;
    // Words the learner pinned by hand (Manual Additions) rather than ones the
    // rule selected — marked on the row so the two are told apart at a glance.
    const manual = new Set(rule.manualWords.map(w => w.toLowerCase()));
    pager.slice(shown).forEach(word => {
      const li = buildWordRow({
        lang: ctx.lang, word, entry: vm?.get(word), mastered: mastered.has(word), filter: filterQuery,
        expanded: word === ctx.expandedWord,
        addedDate: null, // a smart list has no "added" date — its words are matched, not added
        redraw: refresh,
        onToggleExpand: () => { ctx.expandedWord = ctx.expandedWord === word ? null : word; refresh(); },
      });
      if (manual.has(word.toLowerCase())) {
        li.classList.add('ml-word-item--manual');
        const tag = document.createElement('span');
        tag.className = 'ml-word-manual-tag';
        tag.textContent = '✋ Manual';
        tag.title = 'Added by hand under Manual Additions — not chosen by the rule';
        li.querySelector('.ml-word-actions')?.before(tag);
      }
      listEl.appendChild(li);
    });
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
