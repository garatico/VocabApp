/**
 * table-recall-mode.ts — Table mode's "Recall" / "Double Recall" quiz style.
 *
 * A prototype that folds Recall/Double Recall's blind-guess mechanic into
 * Table mode's own grid instead of Recall's separate, smaller-scale layout:
 * the same bordered, tinted word-cell/input-cell pairs and the same
 * `.spanish-word` / `input.correct` styling table-mode.ts uses — just with
 * every cell starting blank, one shared input instead of one per row (order
 * doesn't matter — you recall whatever you remember first, exactly like
 * recall-mode.ts/double-recall-mode.ts used to), and a correct guess
 * revealing its cell(s) as you go.
 *
 * 'recall' style only ever asks for the target-language word — get it right
 * and both cells of the row reveal together (green), since there's no
 * separate "translation" question in this style (mirrors the old standalone
 * Recall tab exactly). No per-row reveal button either, for the same reason
 * — there's nothing to reveal on just one side.
 *
 * 'double' style asks for BOTH independently: the word cell and the
 * translation cell each need their own correct guess (in either order —
 * type the word, then later the translation, or vice versa) before the row
 * counts done. Each side also gets its own "?" reveal button (yellow/peeked,
 * same as Standard style's), separate from the bulk "Show All Words" /
 * "Show All Translations" buttons (red/incorrect — those are a given-up-on
 * batch action, not an individual hint).
 *
 * Three answer states, matching Standard style's own input.correct/.peeked/
 * .incorrect exactly (see table.css): 'correct' (typed it), 'peeked'
 * (revealed via that row's own "?" button), 'incorrect' (left for Show
 * All / Give Up to fill in). Table's own list star, repeat-offender badge
 * and Compare/flag indicator all carry over too — a row here should look
 * and behave like a Standard row, just starting blank.
 *
 * Paginated using table-controls.ts's own pageSlice/pageCountFor and page-
 * size Settings, same as Standard style, for the same reason: a big word
 * count is a lot of live DOM to build and keep event listeners on. It's a
 * cheap fit here because the blind-guess matching already searches the whole
 * `sorted` list regardless of what's on screen (you can type a word from any
 * page, not just the visible one) and the answer state lives in wordState/
 * transState — keyed by word, not by DOM position — so paging never has to
 * snapshot or reconcile anything the way Standard style's own per-<input>
 * design does. paintWordCell/paintTransCell already no-op safely on a row
 * that isn't currently rendered (cellRefs has no entry for it), which is all
 * "the answer landed on a different page" needs to mean here.
 *
 * Deliberately NOT routed through table-controls.ts's CSV/jump machinery
 * (just its two pure paging helpers) — the rest of that module is built
 * around one <input> per word, and this mode has none. Everything — grid,
 * order select, pager, shared input, Give Up, stopwatch — is rendered inside
 * #tableWrap, the same way recall-mode.ts used to own everything inside
 * #recallWrap. table-controls.ts's syncTableStyleUI() hides the static
 * #tableControls/#tableJumpTop/#tableJumpBottom bar (built for the per-row-
 * input Standard style) while this style is active.
 *
 * Session history is filed under the same 'recall'/'doubleRecall' QuizMode
 * the old standalone tabs used — this is the same skill practiced through a
 * different skin, not a third thing worth its own history bucket.
 */
import type { Word } from '../types.ts';
import { matchesAnswer, buildGlossDisplay, chineseWordText } from '../utils/utils.ts';
import { isInAnyList, getWordLists } from '../utils/word-lists.ts';
import { openListPicker } from '../utils/list-picker.ts';
import { Settings, applyAutofillAttr } from '../settings.ts';
import { languageInfo, flagUrl } from '../data/languages.ts';
import {
  saveSession, recordOutcome, missCount, orderWords, getWordOrderLabels,
  type WordOrder, type WordOrderSortBy,
} from '../utils/session-history.ts';
import { readString, writeString } from '../utils/storage.ts';
import { createStopwatch } from '../ui/stopwatch.ts';
import { showSummary, clearSummary, summaryChip, percent } from '../ui/quiz-summary.ts';
import { buildScorePills, scorePct } from '../ui/score-pills.ts';
import { rowKey } from './table-mode.ts';
import { pageSlice, pageCountFor } from './table-controls.ts';
import { t } from '../i18n/index.ts';

export type TableRecallStyle = 'recall' | 'double';

interface RenderTableRecallOptions {
  words:     Word[];
  container: HTMLElement;
  columns?:  number;
  style:     TableRecallStyle;
  lang?:     string;
}

type AnswerState = 'correct' | 'peeked' | 'incorrect';

interface CellRefs {
  tdWord:        HTMLElement;
  wordDiv:       HTMLElement;
  inputEl:       HTMLInputElement;
  wordRevealBtn: HTMLButtonElement | null;
  transRevealBtn: HTMLButtonElement | null;
}

export function renderTableRecallMode({
  words,
  container,
  columns = 3,
  style,
  lang = 'spanish',
}: RenderTableRecallOptions): void {
  container.innerHTML = '';
  clearSummary('table');

  // Empty state comes from the shared #tableWrap:empty::after rule (table.css)
  // — leaving the container childless is enough, exactly as Standard style does.
  if (words.length === 0) return;

  const cols        = Math.max(1, Math.min(5, Number(columns) || 3));
  const matchMode   = Settings.getMatchMode();
  const chineseDisplay = Settings.getChineseDisplay();
  const primaryLang = lang.split('+')[0];

  const indicatorMode = Settings.getLangIndicator();
  container.classList.toggle('lang-indicator-flag', indicatorMode === 'flag');
  container.classList.toggle('hide-rank', !Settings.getTableShowRank());
  container.classList.toggle('hide-word-markers', !Settings.getTableShowWordMarkers());

  let wordOrder: WordOrder =
    (readString('vq_table_order') as WordOrder | null) ?? 'rank';
  // Only 'alpha' order reads this — it's the axis a plain word/rank sort
  // has no use for — but it's stored and restored regardless, same as
  // wordOrder itself, so picking it once sticks across sessions.
  let sortBy: WordOrderSortBy =
    (readString('vq_table_order_sortby') as WordOrderSortBy | null) ?? 'word';
  let sorted = orderWords(words, wordOrder, w => w.language ?? lang, sortBy);
  let pageIndex = 0;

  function pageSize(): number { return Settings.getTablePageSize(); }
  function pageCount(): number { return pageCountFor(sorted.length, pageSize()); }

  function cellKey(w: Word): string { return rowKey(w, lang); }

  // Word cell and translation cell tracked independently — see file header.
  // For 'recall' style the two are always written together (see the Enter
  // handler and finish()), so they stay in lockstep without special-casing
  // every read site below.
  const wordState  = new Map<string, AnswerState>();
  const transState = new Map<string, AnswerState>();

  function isRowDone(w: Word): boolean {
    const key = cellKey(w);
    return style === 'recall'
      ? wordState.has(key)
      : wordState.has(key) && transState.has(key);
  }

  /** Worst state wins: any 'incorrect' side makes the row missed; otherwise
   *  any 'peeked' side makes it revealed; otherwise (once done) correct. */
  function rowState(w: Word): 'correct' | 'revealed' | 'missed' | null {
    if (!isRowDone(w)) return null;
    const key = cellKey(w);
    const states = style === 'recall'
      ? [wordState.get(key)]
      : [wordState.get(key), transState.get(key)];
    if (states.includes('incorrect')) return 'missed';
    if (states.includes('peeked'))    return 'revealed';
    return 'correct';
  }

  let finished = false;

  function displayTranslation(w: Word): string {
    return buildGlossDisplay(w, Settings.getAnswerGlossCount());
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  const wrap = document.createElement('div');
  wrap.className = 'tr-wrap';

  const topRow = document.createElement('div');
  topRow.className = 'tr-top-row';

  const orderLabel = document.createElement('span');
  orderLabel.className = 'inline-order-label';
  orderLabel.textContent = t('controls.order', 'Order');
  const orderSel = document.createElement('select');
  orderSel.className = 'table-order-select';
  getWordOrderLabels().forEach(([value, label]) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label; o.selected = value === wordOrder;
    orderSel.appendChild(o);
  });

  // Which side's spelling "A → Z" alphabetizes by — meaningless for the
  // other four orders, so it only visibly does anything once Order is set
  // to A → Z, but stays present rather than popping in/out to avoid the
  // layout shift that caused the old duplicate-control bug.
  const sortByToggle = document.createElement('div');
  sortByToggle.className = 'sort-order-toggle tr-sortby-toggle';
  const sortByWordBtn = document.createElement('button');
  sortByWordBtn.type = 'button';
  sortByWordBtn.className = 'sort-order-btn' + (sortBy === 'word' ? ' active' : '');
  sortByWordBtn.dataset.sortby = 'word';
  sortByWordBtn.textContent = t('table.sortByWord', 'Word');
  const sortByMeaningBtn = document.createElement('button');
  sortByMeaningBtn.type = 'button';
  sortByMeaningBtn.className = 'sort-order-btn' + (sortBy === 'meaning' ? ' active' : '');
  sortByMeaningBtn.dataset.sortby = 'meaning';
  sortByMeaningBtn.textContent = t('table.sortByMeaning', 'Meaning');
  sortByToggle.append(sortByWordBtn, sortByMeaningBtn);

  const showWordsBtn = document.createElement('button');
  showWordsBtn.type = 'button';
  showWordsBtn.className = 'dr-fillin-btn';
  showWordsBtn.textContent = 'Show All Words';
  showWordsBtn.title = 'Reveal every word you have not recalled yet (counts as missed) — translations you have not gotten stay yours to guess';

  const showTransBtn = document.createElement('button');
  showTransBtn.type = 'button';
  showTransBtn.className = 'dr-fillin-btn';
  showTransBtn.textContent = 'Show All Translations';
  showTransBtn.title = 'Reveal every translation you have not recalled yet (counts as missed) — words you have not gotten stay yours to guess';

  const stopwatchEl = document.createElement('span');
  stopwatchEl.className = 'quiz-stopwatch';
  stopwatchEl.title = 'Time spent on this quiz';
  // Same "Show timer" Settings toggle Standard style's clock respects —
  // time is still tracked underneath either way, this only hides the readout.
  stopwatchEl.hidden = !Settings.getShowTimer();

  const giveUpBtn = document.createElement('button');
  giveUpBtn.type = 'button';
  giveUpBtn.className = 'recall-giveup-btn';
  giveUpBtn.textContent = 'Give Up';

  topRow.append(orderLabel, orderSel, sortByToggle);
  if (style === 'double') topRow.append(showWordsBtn, showTransBtn);
  topRow.append(stopwatchEl, giveUpBtn);

  const inputRow = document.createElement('div');
  inputRow.className = 'recall-input-row';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'recall-input';
  inp.placeholder = style === 'double'
    ? `Type a ${languageInfo(primaryLang).label} word or its translation…`
    : `Type a ${languageInfo(primaryLang).label} word…`;
  applyAutofillAttr(inp);
  const feedback = document.createElement('span');
  feedback.className = 'recall-feedback';
  inputRow.append(inp, feedback);

  function buildPager(): { row: HTMLElement; prev: HTMLButtonElement; next: HTMLButtonElement; select: HTMLSelectElement; status: HTMLSpanElement } {
    const row = document.createElement('div');
    row.className = 'table-pager tr-pager';
    const prev = document.createElement('button');
    prev.type = 'button'; prev.className = 'pager-btn'; prev.textContent = '←';
    prev.setAttribute('aria-label', 'Previous page');
    const select = document.createElement('select');
    select.className = 'pager-select';
    select.setAttribute('aria-label', 'Jump to page');
    const status = document.createElement('span');
    status.className = 'pager-status';
    const next = document.createElement('button');
    next.type = 'button'; next.className = 'pager-btn'; next.textContent = '→';
    next.setAttribute('aria-label', 'Next page');
    row.append(prev, select, status, next);
    return { row, prev, next, select, status };
  }

  const pagerTop = buildPager();
  const pagerBottom = buildPager();
  const gridWrap = document.createElement('div');

  wrap.append(topRow, inputRow, pagerTop.row, gridWrap, pagerBottom.row);
  container.appendChild(wrap);

  // createStopwatch needs its mount element attached to the document before
  // start() renders the first tick, so build it after topRow is in the DOM.
  const clock = createStopwatch(stopwatchEl);
  clock.start();

  // ── Grid ─────────────────────────────────────────────────────────────────

  const cellRefs = new Map<string, CellRefs>();

  function buildKnownBtn(w: Word, tdWord: HTMLElement): HTMLButtonElement {
    const wordLang = w.language ?? lang;
    const lists = getWordLists(wordLang, w.word);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'known-btn' + (lists.length > 0 ? ' known-btn--active' : '');
    btn.title = lists.length > 0 ? 'In lists: ' + lists.join(', ') : 'Add to a list';
    btn.textContent = '★';
    btn.tabIndex = -1;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openListPicker({
        anchorEl: btn, lang: wordLang, word: w.word,
        onClose: () => {
          const inAny = isInAnyList(wordLang, w.word);
          btn.classList.toggle('known-btn--active', inAny);
          tdWord.classList.toggle('word-cell--known', inAny);
          btn.title = inAny ? 'In lists: ' + getWordLists(wordLang, w.word).join(', ') : 'Add to a list';
        },
      });
    });
    return btn;
  }

  function paintWordCell(w: Word, state: AnswerState): void {
    const ref = cellRefs.get(cellKey(w));
    if (!ref) return;
    ref.wordDiv.textContent = chineseWordText(w, w.language ?? lang, chineseDisplay);
    ref.wordDiv.classList.remove('correct', 'peeked', 'incorrect');
    ref.wordDiv.classList.add(state);
    if (isInAnyList(w.language ?? lang, w.word)) ref.tdWord.classList.add('word-cell--known');
    if (ref.wordRevealBtn) ref.wordRevealBtn.style.display = 'none';
  }

  function paintTransCell(w: Word, state: AnswerState): void {
    const ref = cellRefs.get(cellKey(w));
    if (!ref) return;
    ref.inputEl.value = displayTranslation(w);
    ref.inputEl.classList.remove('correct', 'peeked', 'incorrect');
    ref.inputEl.classList.add(state);
    if (ref.transRevealBtn) ref.transRevealBtn.style.display = 'none';
  }

  function buildGrid(): void {
    gridWrap.innerHTML = '';
    cellRefs.clear();
    const table = document.createElement('table');
    const size = pageSize();
    const shown = pageSlice(sorted, size, pageIndex);
    const pageStart = Number.isFinite(size) ? pageIndex * size : 0;

    for (let i = 0; i < shown.length; i += cols) {
      const tr = document.createElement('tr');

      for (let j = 0; j < cols; j++) {
        const w = shown[i + j];
        const tdWord  = document.createElement('td');
        const tdInput = document.createElement('td');
        tdWord.classList.add('word-cell');
        tdInput.classList.add('input-cell');

        if (!w) { tr.append(tdWord, tdInput); continue; }

        const key = cellKey(w);
        const wordLang = w.language ?? lang;

        if (indicatorMode !== 'off' && w.language) {
          tdWord.classList.add(`lang-tag-${w.language}`);
          if (indicatorMode === 'flag') {
            tdWord.style.setProperty('--flag-img', `url("${flagUrl(Settings.getLangFlag(w.language))}")`);
          }
        }

        const misses = missCount(wordLang, w.word);
        if (misses >= 2) {
          tdWord.classList.add('table-word--trouble');
          tdWord.dataset.missed = String(misses);
          tdWord.title = `Missed ${misses} time${misses === 1 ? '' : 's'} before`;
        }

        const rankEl = document.createElement('span');
        rankEl.className = 'table-word-rank';
        rankEl.textContent = String(w.rank || (pageStart + i + j + 1));
        tdWord.appendChild(rankEl);

        const wordRowDiv = document.createElement('div');
        wordRowDiv.className = 'input-row';
        const wordDiv = document.createElement('div');
        wordDiv.className = 'spanish-word';
        wordRowDiv.appendChild(wordDiv);

        // Per-side reveal — 'double' style only. 'recall' style has no
        // separate translation question, so there's nothing to peek at
        // independently of the word itself.
        let wordRevealBtn: HTMLButtonElement | null = null;
        if (style === 'double') {
          wordRevealBtn = document.createElement('button');
          wordRevealBtn.type = 'button';
          wordRevealBtn.className = 'reveal-btn';
          wordRevealBtn.textContent = '?';
          wordRevealBtn.title = 'Reveal this word (counts as peeked)';
          wordRevealBtn.tabIndex = -1;
          wordRevealBtn.addEventListener('click', () => revealSingle(w, 'word'));
          wordRowDiv.appendChild(wordRevealBtn);
        }
        tdWord.appendChild(wordRowDiv);

        const inputRowDiv = document.createElement('div');
        inputRowDiv.className = 'input-row';
        const inputEl = document.createElement('input');
        inputEl.type = 'text';
        // Not disabled — disabled inputs render greyed-out, and this cell is
        // meant to look exactly like Standard style's not-yet-answered input,
        // just inert: focus and typing always go to the one shared input.
        inputEl.readOnly = true;
        inputEl.tabIndex = -1;
        inputEl.style.pointerEvents = 'none';
        inputEl.placeholder = '···';
        inputRowDiv.appendChild(inputEl);

        let transRevealBtn: HTMLButtonElement | null = null;
        if (style === 'double') {
          transRevealBtn = document.createElement('button');
          transRevealBtn.type = 'button';
          transRevealBtn.className = 'reveal-btn';
          transRevealBtn.textContent = '?';
          transRevealBtn.title = 'Reveal this translation (counts as peeked)';
          transRevealBtn.tabIndex = -1;
          transRevealBtn.addEventListener('click', () => revealSingle(w, 'trans'));
          inputRowDiv.appendChild(transRevealBtn);
        }

        const knownBtn = buildKnownBtn(w, tdWord);
        inputRowDiv.appendChild(knownBtn);
        tdInput.appendChild(inputRowDiv);

        cellRefs.set(key, { tdWord, wordDiv, inputEl, wordRevealBtn, transRevealBtn });

        if (wordState.has(key))  paintWordCell(w, wordState.get(key)!);
        if (transState.has(key)) paintTransCell(w, transState.get(key)!);

        tr.append(tdWord, tdInput);
      }

      table.appendChild(tr);
    }

    gridWrap.appendChild(table);
    updatePagers();
  }

  function goToPage(index: number): void {
    const pages = pageCount();
    pageIndex = Math.min(Math.max(0, index), pages - 1);
    buildGrid();
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    inp.focus();
  }

  function updatePagers(): void {
    const pages = pageCount();
    const visible = pages > 1;
    const size = Number.isFinite(pageSize()) ? pageSize() : sorted.length;
    const shownCount = pageSlice(sorted, pageSize(), pageIndex).length;

    [pagerTop, pagerBottom].forEach(pager => {
      pager.row.hidden = !visible;
      const first = pageIndex * size + 1;
      const last  = pageIndex * size + shownCount;
      pager.status.textContent = `Words ${first}–${last} of ${sorted.length.toLocaleString()}`;

      if (pager.select.options.length !== pages) {
        pager.select.innerHTML = '';
        for (let i = 0; i < pages; i++) {
          const opt = document.createElement('option');
          opt.value = String(i);
          const from = i * size + 1;
          const to   = Math.min((i + 1) * size, sorted.length);
          opt.textContent = `Page ${i + 1} of ${pages}  (${from}–${to})`;
          pager.select.appendChild(opt);
        }
      }
      pager.select.value = String(pageIndex);
      pager.prev.disabled = pageIndex === 0;
      pager.next.disabled = pageIndex >= pages - 1;
    });
  }

  [pagerTop, pagerBottom].forEach(pager => {
    pager.prev.addEventListener('click', () => goToPage(pageIndex - 1));
    pager.next.addEventListener('click', () => goToPage(pageIndex + 1));
    pager.select.addEventListener('change', () => goToPage(Number(pager.select.value)));
  });

  buildGrid();
  inp.focus();
  updateProgress();

  // ── Per-row reveal (peek), Double Recall only ─────────────────────────────

  function revealSingle(w: Word, side: 'word' | 'trans'): void {
    if (finished) return;
    const key = cellKey(w);
    if (side === 'word') {
      if (wordState.has(key)) return;
      wordState.set(key, 'peeked');
      paintWordCell(w, 'peeked');
    } else {
      if (transState.has(key)) return;
      transState.set(key, 'peeked');
      paintTransCell(w, 'peeked');
    }
    updateProgress();
    if (sorted.every(isRowDone)) finish();
    inp.focus();
  }

  // ── Matching ─────────────────────────────────────────────────────────────

  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  function flash(text: string, cls: string, ms = 900): void {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedback.textContent = text;
    feedback.className = 'recall-feedback ' + cls;
    feedbackTimer = setTimeout(() => { feedback.textContent = ''; feedback.className = 'recall-feedback'; }, ms);
  }

  inp.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || finished) return;
    const val = inp.value.trim();
    if (!val) return;

    const wordMatch = sorted.find(w => !wordState.has(cellKey(w)) && matchesAnswer(val, w, 'en-target', matchMode, w.language ?? lang, chineseDisplay));
    const transMatch = style === 'double'
      ? sorted.find(w => !transState.has(cellKey(w)) && matchesAnswer(val, w, 'target-en', matchMode))
      : undefined;

    let matched: Word | null = null;

    if (wordMatch) {
      const key = cellKey(wordMatch);
      wordState.set(key, 'correct');
      paintWordCell(wordMatch, 'correct');
      // 'recall' style has no separate translation question — reveal it
      // alongside the word, same as the old standalone Recall tab did.
      if (style === 'recall') {
        transState.set(key, 'correct');
        paintTransCell(wordMatch, 'correct');
      }
      matched = wordMatch;
    }
    if (transMatch) {
      transState.set(cellKey(transMatch), 'correct');
      paintTransCell(transMatch, 'correct');
      matched = matched ?? transMatch;
    }

    if (matched) {
      flash(`✓ ${matched.word}`, 'ok', 800);
      inp.value = '';
      updateProgress();
      if (sorted.every(isRowDone)) finish();
    } else {
      flash('Not in this set', 'miss', 900);
    }
  });

  // ── Order ────────────────────────────────────────────────────────────────

  orderSel.addEventListener('change', () => {
    wordOrder = orderSel.value as WordOrder;
    writeString('vq_table_order', wordOrder);
    sorted = orderWords(words, wordOrder, w => w.language ?? lang, sortBy);
    pageIndex = 0;
    buildGrid();
    inp.focus();
  });

  sortByToggle.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn?.dataset.sortby || btn.dataset.sortby === sortBy) return;
    sortBy = btn.dataset.sortby as WordOrderSortBy;
    writeString('vq_table_order_sortby', sortBy);
    sortByWordBtn.classList.toggle('active', sortBy === 'word');
    sortByMeaningBtn.classList.toggle('active', sortBy === 'meaning');
    sorted = orderWords(words, wordOrder, w => w.language ?? lang, sortBy);
    pageIndex = 0;
    buildGrid();
    inp.focus();
  });

  // ── Show All Words / Show All Translations (double style only) ───────────

  showWordsBtn.addEventListener('click', () => {
    if (finished) return;
    let changed = false;
    sorted.forEach(w => {
      const key = cellKey(w);
      if (!wordState.has(key)) { wordState.set(key, 'incorrect'); paintWordCell(w, 'incorrect'); changed = true; }
    });
    if (!changed) return;
    updateProgress();
    if (sorted.every(isRowDone)) finish();
    inp.focus();
  });

  showTransBtn.addEventListener('click', () => {
    if (finished) return;
    let changed = false;
    sorted.forEach(w => {
      const key = cellKey(w);
      if (!transState.has(key)) { transState.set(key, 'incorrect'); paintTransCell(w, 'incorrect'); changed = true; }
    });
    if (!changed) return;
    updateProgress();
    if (sorted.every(isRowDone)) finish();
    inp.focus();
  });

  // ── Progress (reuses Table mode's own outer bar/score pills) ─────────────

  function updateProgress(): void {
    const total = sorted.length;
    let correct = 0, revealed = 0, missed = 0;
    sorted.forEach(w => {
      const s = rowState(w);
      if (s === 'correct') correct++;
      else if (s === 'revealed') revealed++;
      else if (s === 'missed') missed++;
    });
    const pct = (n: number): number => scorePct(n, total);
    const g = pct(correct), y = pct(revealed), r = pct(missed);
    const done = correct + revealed + missed;

    (['Top', 'Bottom'] as const).forEach(pos => {
      const bar      = document.getElementById(`tableBar${pos}`);
      const yellowBar = document.getElementById(`tableBar${pos}Revealed`);
      const redBar   = document.getElementById(`tableBar${pos}Missed`);
      const stats    = document.getElementById(`tableStats${pos}`);
      const score    = document.getElementById(`tableScore${pos}`);

      if (bar) (bar as HTMLElement).style.width = g + '%';
      if (yellowBar) { (yellowBar as HTMLElement).style.left = g + '%'; (yellowBar as HTMLElement).style.width = y + '%'; }
      if (redBar) { (redBar as HTMLElement).style.left = (g + y) + '%'; (redBar as HTMLElement).style.width = r + '%'; }
      if (stats) {
        stats.textContent = total > 0 ? `${done} / ${total}` : '';
        stats.classList.toggle('progress-label--done', total > 0 && done === total);
      }
      if (score) score.innerHTML = buildScorePills({ correct, revealed, missed, left: Math.max(0, total - done), total });
    });

    giveUpBtn.disabled = total > 0 && done === total;
  }

  // ── Session end ──────────────────────────────────────────────────────────

  function recordSession(): void {
    const seconds = clock.elapsedSeconds();
    const mode: 'recall' | 'doubleRecall' = style === 'double' ? 'doubleRecall' : 'recall';

    interface Bucket { correct: string[]; missed: string[]; revealed: number; }
    const byLang = new Map<string, Bucket>();
    function bucketFor(wl: string): Bucket {
      let b = byLang.get(wl);
      if (!b) { b = { correct: [], missed: [], revealed: 0 }; byLang.set(wl, b); }
      return b;
    }
    sorted.forEach(w => {
      const wl = w.language ?? lang;
      const s = rowState(w);
      const bucket = bucketFor(wl);
      if (s === 'correct') bucket.correct.push(w.word);
      else {
        bucket.missed.push(w.word);
        if (s === 'revealed') bucket.revealed++;
      }
    });

    const langs = [...byLang.keys()];
    for (const [wl, b] of byLang) {
      recordOutcome(wl, b.missed, b.correct);
      saveSession(wl, {
        at: new Date().toISOString(),
        mode,
        total: b.correct.length + b.missed.length,
        correct: b.correct.length,
        unassisted: b.correct.length,
        hints: 0,
        revealed: b.revealed,
        seconds,
        lang: wl,
        langs: langs.length > 1 ? langs : undefined,
      });
    }
  }

  function finish(): void {
    if (finished) return;
    finished = true;
    clock.stop();
    inp.disabled = true;
    giveUpBtn.disabled = true;
    showWordsBtn.disabled = true;
    showTransBtn.disabled = true;

    // Fill in whichever side(s) are still missing, without touching a side
    // that's already done — a 'double' row can be half-done (word typed,
    // translation not) right up until Give Up.
    sorted.forEach(w => {
      const key = cellKey(w);
      if (!wordState.has(key)) { wordState.set(key, 'incorrect'); paintWordCell(w, 'incorrect'); }
      if (style === 'double') {
        if (!transState.has(key)) { transState.set(key, 'incorrect'); paintTransCell(w, 'incorrect'); }
      } else if (!transState.has(key)) {
        // 'recall' style: translation always mirrors the word's own state.
        const wState = wordState.get(key)!;
        transState.set(key, wState);
        paintTransCell(w, wState);
      }
    });

    recordSession();
    updateProgress();

    let correct = 0, revealed = 0, missed = 0;
    sorted.forEach(w => {
      const s = rowState(w);
      if (s === 'correct') correct++; else if (s === 'revealed') revealed++; else if (s === 'missed') missed++;
    });
    showSummary('table',
      summaryChip('correct', `✓ ${correct} correct`) +
      (revealed ? summaryChip('missed', `◐ ${revealed} revealed`) : '') +
      (missed ? summaryChip('missed', `✗ ${missed} missed`) : '') +
      summaryChip('pct', `${percent(correct, sorted.length)}%`),
      sorted.length > 0 && revealed === 0 && missed === 0,
    );
  }

  giveUpBtn.addEventListener('click', finish);
}
