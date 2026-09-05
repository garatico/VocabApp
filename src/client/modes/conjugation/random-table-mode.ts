/**
 * conjugation/random-table-mode.ts — every blank at once, fully shuffled.
 *
 * One-at-a-time-mode.ts's flattened queue (every verb × selected tense ×
 * pronoun, one item each) rendered as a table instead of walked one card at
 * a time — Table mode's own shape, applied to conjugation drilling. Always
 * fully shuffled: a completely random tense of a completely random verb on
 * every row, "yo conozco" next to "él tiene" rather than grouped by verb.
 * There's no Order control here for that reason — "random" is this mode's
 * whole premise, not one choice among several.
 *
 * Paginated exactly like Standard Table style (table-controls.ts's own
 * pageSlice/pageCountFor, and its page-size Settings), for the same reason:
 * a 1000+ verb session can flatten into thousands of rows, and building
 * every one of them as live DOM is the slow part, not the drilling itself.
 * Answers are tracked in a plain array — `results`, indexed the same way as
 * `rows` — rather than read off the DOM the way Standard style's own
 * sessionState snapshot has to, since here the row order never changes
 * mid-session (nothing to reorder — "random" is fixed for the whole run),
 * so there's nothing a snapshot would need to reconcile.
 *
 * Reuses the same eligibility helpers as one-at-a-time-mode.ts and the Grid
 * (isOwnInfinitive, hasAnyForms, regularityOf, isSingleForm, verbKey) so a
 * verb is included/excluded and scored the same way everywhere.
 */
import type { Word } from '../../types.js';
import { PRONOUNS, TENSE_DEFS } from './data.js';
import { activeTenses, activeRegularities, unionTenseDefs, activePronounIndices } from './controls.js';
import {
  isOwnInfinitive, hasAnyForms, regularityOf, isSingleForm, verbKey, hiddenPronounSlots,
} from './index.js';
import { pageSlice, pageCountFor } from '../table-controls.js';
import { foldKey as normalize } from '../../utils/match.js';
import { displayWord } from '../../utils/utils.js';
import { shuffle } from '../../utils/shuffle.js';
import { saveSession, recordOutcome } from '../../utils/session-history.js';
import { createStopwatch } from '../../ui/stopwatch.js';
import { showSummary, clearSummary, summaryChip, percent } from '../../ui/quiz-summary.js';
import { buildScorePills, scorePct } from '../../ui/score-pills.js';
import { Settings, applyAutofillAttr } from '../../settings.js';

export interface ConjRandomTableOptions {
  words:      Word[];
  container:  HTMLElement;
  lang?:      string;
  extraLangs?: string[];
  /** When set, skips the verb/tense/pronoun expansion and sampling below and
   *  drills exactly these rows instead — the "↺ Practice N" summary
   *  button's retry-missed path, matching table mode's restartWith(). */
  fixedQueue?: RowItem[];
}

interface RowItem {
  verb:       Word;
  verbLang:   string;
  tenseKey:   string;
  tenseLabel: string;
  slot:       number | 'single';
  pronoun:    string;
}

type RowResult = 'correct' | 'incorrect';

export function renderConjRandomTable({
  words,
  container,
  lang = 'spanish',
  extraLangs = [],
  fixedQueue,
}: ConjRandomTableOptions): void {
  container.innerHTML = '';
  clearSummary('conjugation');

  const primaryLang = lang.split('+')[0];

  const regs     = activeRegularities();
  const everyReg = regs.length >= 4;
  const verbEntries = words.filter(w => w.pos === 'verb' && isOwnInfinitive(w));
  const rawVerbs = verbEntries.filter(hasAnyForms);
  const allVerbs = everyReg
    ? rawVerbs
    : rawVerbs.filter(w => {
        const cls = w.linguistic?.conjugation_class ?? null;
        return cls == null || regs.includes(regularityOf(cls).key);
      });

  if (allVerbs.length === 0 && !fixedQueue) {
    container.innerHTML = `<div class="conj-empty">
      <p>No verbs available for a random table.</p>
      <p class="conj-empty-hint">Check the Tense &amp; Forms and Regularity filters, then hit Start Quiz again.</p>
    </div>`;
    return;
  }

  const tenseDefs = unionTenseDefs(primaryLang, extraLangs);
  function selectedTenses(): string[] {
    const picked = activeTenses().filter(k => tenseDefs.some(d => d.key === k));
    return picked.length ? picked : [tenseDefs[0].key];
  }
  const tenses = selectedTenses();
  const activePronouns = activePronounIndices();

  function flattenVerb(verb: Word): RowItem[] {
    const verbLang = verb.language ?? lang;
    const verbTenseDefs = TENSE_DEFS[verbLang] ?? TENSE_DEFS.spanish;
    const tensesForVerb = tenses.filter(t => verbTenseDefs.some(d => d.key === t));
    const items: RowItem[] = [];
    tensesForVerb.forEach(tenseKey => {
      const tenseLabel = verbTenseDefs.find(d => d.key === tenseKey)?.label ?? tenseKey;
      if (isSingleForm(tenseKey)) {
        items.push({ verb, verbLang, tenseKey, tenseLabel, slot: 'single', pronoun: '' });
      } else {
        const noForm = hiddenPronounSlots(tenseKey);
        (PRONOUNS[verbLang] ?? PRONOUNS.spanish).forEach((p, i) => {
          if (!activePronouns.has(i) || noForm.has(i)) return;
          items.push({ verb, verbLang, tenseKey, tenseLabel, slot: i, pronoun: p });
        });
      }
    });
    return items;
  }

  const allRows = shuffle(allVerbs.flatMap(flattenVerb));

  // "Blanks to Practice" (#conjRandomTableSize) samples the shuffled full
  // cross product down to a fixed count — Top 100 verbs stays Top 100 verbs
  // (the verb pool feeding Regularity's estimate is untouched), but the
  // number of blanks actually asked can be far smaller than
  // verbs × tenses × forms.
  const sizeSel = document.getElementById('conjRandomTableSize') as HTMLSelectElement | null;
  const sizeCustom = document.getElementById('conjRandomTableSizeCustom') as HTMLInputElement | null;
  const sampleSize = !sizeSel || sizeSel.value === 'all'
    ? Infinity
    : sizeSel.value === 'custom'
      ? Number(sizeCustom?.value) || Infinity
      : Number(sizeSel.value);
  const rows = fixedQueue ?? (Number.isFinite(sampleSize) ? allRows.slice(0, sampleSize) : allRows);
  if (rows.length === 0) {
    container.innerHTML = `<div class="conj-empty">
      <p>No forms to drill for the current Tense &amp; Forms selection.</p>
    </div>`;
    return;
  }

  function answerFor(item: RowItem): string | null {
    const conj = item.verb.linguistic?.conjugations as Record<string, unknown> | null | undefined;
    if (!conj) return null;
    const raw = conj[item.tenseKey];
    if (item.slot === 'single') return typeof raw === 'string' ? raw : null;
    return Array.isArray(raw) ? ((raw[item.slot] as string | undefined) ?? null) : null;
  }

  // Indexed exactly like `rows` — answers live here, not in the DOM, so
  // turning a page never has to snapshot or reconcile anything.
  const results: (RowResult | null)[] = rows.map(() => null);
  let pageIndex = 0;

  function pageSize(): number {
    return Settings.getTablePageSize();
  }
  function pageCount(): number {
    return pageCountFor(rows.length, pageSize());
  }

  const stopwatchEl = document.createElement('span');
  stopwatchEl.className = 'quiz-stopwatch';
  const stopwatch = createStopwatch(stopwatchEl);
  stopwatch.start();
  let finished = false;

  // ── Layout ───────────────────────────────────────────────────────────────

  const wrap = document.createElement('div');
  wrap.className = 'crt-wrap';

  const header = document.createElement('div');
  header.className = 'conj-order-row';
  const label = document.createElement('span');
  label.className = 'conj-order-label';
  label.textContent = `${rows.length} random blanks`;
  const giveUpBtn = document.createElement('button');
  giveUpBtn.type = 'button';
  giveUpBtn.className = 'conj-giveup-btn';
  giveUpBtn.textContent = 'Give Up';
  header.append(label, stopwatchEl, giveUpBtn);

  const progressWrap = document.createElement('div');
  progressWrap.className = 'progressWrap';
  const track  = document.createElement('div'); track.className  = 'progress';
  const green  = document.createElement('div'); green.className  = 'bar';
  const red    = document.createElement('div'); red.className    = 'bar-missed';
  track.append(green, red);
  const stat = document.createElement('div');
  stat.className = 'small';
  progressWrap.append(track, stat);
  const scoreEl = document.createElement('div');
  scoreEl.className = 'quiz-score';

  // ── Pager (top and bottom of the table — same shape as Standard style's) ──

  function buildPager(): { row: HTMLElement; prev: HTMLButtonElement; next: HTMLButtonElement; select: HTMLSelectElement; status: HTMLSpanElement } {
    const row = document.createElement('div');
    row.className = 'table-pager crt-pager';
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

  const table = document.createElement('table');
  table.className = 'crt-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Pronoun', 'Verb', 'Tense', 'Your Answer'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  wrap.append(header, progressWrap, scoreEl, pagerTop.row, table, pagerBottom.row);
  container.appendChild(wrap);

  // ── Page rendering ───────────────────────────────────────────────────────

  function buildRow(item: RowItem, globalIdx: number): HTMLTableRowElement {
    const tr = document.createElement('tr');
    // Drives --tense-hue/--pronoun-hue (conjugation.css) so this row's Tense
    // and Pronoun cells pick up the same color as the filter chip that
    // selected them — data-pi matches controls.ts's pronoun toggle buttons.
    tr.dataset.tense = item.tenseKey;
    if (item.slot !== 'single') tr.dataset.pi = String(item.slot);

    const pronounTd = document.createElement('td');
    pronounTd.className = 'crt-pronoun';
    pronounTd.textContent = item.slot === 'single' ? '—' : item.pronoun;

    const verbTd = document.createElement('td');
    verbTd.className = 'crt-verb';
    verbTd.textContent = displayWord(item.verb, Settings.getShowDisambiguator());

    const tenseTd = document.createElement('td');
    tenseTd.className = 'crt-tense';
    tenseTd.textContent = item.tenseLabel;

    const answerTd = document.createElement('td');
    answerTd.className = 'crt-answer-cell';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'crt-input';
    applyAutofillAttr(inp);
    inp.setAttribute('autocorrect', 'off');
    inp.setAttribute('autocapitalize', 'off');
    inp.spellcheck = false;
    inp.placeholder = 'Type conjugation…';

    const already = results[globalIdx];
    if (already) {
      inp.value = answerFor(item) ?? '';
      inp.disabled = true;
      inp.classList.add(already);
    }

    inp.addEventListener('input', () => {
      if (finished || inp.disabled) return;
      const answer = answerFor(item);
      if (!answer || normalize(inp.value) !== normalize(answer)) return;
      inp.value = answer;
      inp.disabled = true;
      inp.classList.add('correct');
      results[globalIdx] = 'correct';
      updateProgress();
      if (results.every(r => r !== null)) { finish(); return; }
      // Auto-advance to the next open blank on this page — every other row
      // is already right there in the same table, so making the learner
      // reach for the mouse (or Tab, past the row's other read-only cells)
      // between forms is friction Table mode's own grid doesn't have either.
      const inputs = [...tbody.querySelectorAll<HTMLInputElement>('.crt-input')];
      const next = inputs.slice(inputs.indexOf(inp) + 1).find(i => !i.disabled);
      next?.focus();
    });
    answerTd.appendChild(inp);

    tr.append(pronounTd, verbTd, tenseTd, answerTd);
    return tr;
  }

  function renderPage(): void {
    tbody.innerHTML = '';
    const size = pageSize();
    const start = Number.isFinite(size) ? pageIndex * size : 0;
    const chunk = pageSlice(rows, size, pageIndex);
    chunk.forEach((item, offset) => tbody.appendChild(buildRow(item, start + offset)));

    updatePagers();
    const firstOpen = tbody.querySelector<HTMLInputElement>('.crt-input:not(:disabled)');
    firstOpen?.focus();
  }

  function goToPage(index: number): void {
    const pages = pageCount();
    pageIndex = Math.min(Math.max(0, index), pages - 1);
    renderPage();
    wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updatePagers(): void {
    const pages = pageCount();
    const visible = pages > 1;
    const size = Number.isFinite(pageSize()) ? pageSize() : rows.length;
    const shown = pageSlice(rows, pageSize(), pageIndex).length;

    [pagerTop, pagerBottom].forEach(pager => {
      pager.row.hidden = !visible;
      const first = pageIndex * size + 1;
      const last  = pageIndex * size + shown;
      pager.status.textContent = `Rows ${first}–${last} of ${rows.length.toLocaleString()}`;

      if (pager.select.options.length !== pages) {
        pager.select.innerHTML = '';
        for (let i = 0; i < pages; i++) {
          const opt = document.createElement('option');
          opt.value = String(i);
          const from = i * size + 1;
          const to   = Math.min((i + 1) * size, rows.length);
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

  renderPage();

  // ── Progress / session end ────────────────────────────────────────────────

  function updateProgress(): void {
    const total = rows.length;
    const correct = results.filter(r => r === 'correct').length;
    const missed  = results.filter(r => r === 'incorrect').length;
    const g = scorePct(correct, total), r = scorePct(missed, total);
    green.style.width = g + '%';
    red.style.left    = g + '%';
    red.style.width   = r + '%';
    const done = correct + missed;
    stat.textContent = total > 0 ? `${done}/${total} Answered` : '';
    scoreEl.innerHTML = buildScorePills({ correct, revealed: 0, missed, left: total - done, total });
    giveUpBtn.disabled = total > 0 && done === total;
  }

  function recordSession(): void {
    interface Acc { word: string; language: string; total: number; correct: number; }
    const perVerb = new Map<string, Acc>();
    rows.forEach((item, i) => {
      const key = verbKey(item.verb.word, item.verbLang);
      const acc = perVerb.get(key) ?? { word: item.verb.word, language: item.verbLang, total: 0, correct: 0 };
      acc.total++;
      if (results[i] === 'correct') acc.correct++;
      perVerb.set(key, acc);
    });

    interface Bucket { correct: string[]; missed: string[]; }
    const byLang = new Map<string, Bucket>();
    function bucketFor(wl: string): Bucket {
      let b = byLang.get(wl);
      if (!b) { b = { correct: [], missed: [] }; byLang.set(wl, b); }
      return b;
    }
    perVerb.forEach(acc => {
      bucketFor(acc.language)[acc.correct === acc.total ? 'correct' : 'missed'].push(acc.word);
    });

    const seconds = stopwatch.elapsedSeconds();
    const langs = [...byLang.keys()];
    for (const [wl, b] of byLang) {
      recordOutcome(wl, b.missed, b.correct);
      saveSession(wl, {
        at: new Date().toISOString(),
        mode: 'conjugation',
        total: b.correct.length + b.missed.length,
        correct: b.correct.length,
        unassisted: b.correct.length,
        hints: 0,
        revealed: b.missed.length,
        seconds,
        lang: wl,
        langs: langs.length > 1 ? langs : undefined,
      });
    }
  }

  function finish(): void {
    if (finished) return;
    finished = true;
    stopwatch.stop();
    giveUpBtn.disabled = true;

    results.forEach((r, i) => { if (r === null) results[i] = 'incorrect'; });
    renderPage(); // repaint the visible page with whatever it just revealed
    updateProgress();
    recordSession();

    const correct = results.filter(r => r === 'correct').length;
    const missedRows = rows.filter((_, i) => results[i] === 'incorrect');
    // Same "↺ Practice N" pattern as table mode's own summary — see
    // table-controls.ts's buildSummaryHtml/wireSummaryButtons.
    const retryHtml = missedRows.length > 0
      ? `<button type="button" class="summary-retry-btn">↺ Practice ${missedRows.length}</button>`
      : '';
    showSummary('conjugation',
      retryHtml +
      summaryChip('correct', `✓ ${correct} / ${rows.length} forms`) +
      summaryChip('pct',     `${percent(correct, rows.length)}%`),
      rows.length > 0 && correct === rows.length,
    );
    if (missedRows.length > 0) {
      document.querySelectorAll<HTMLButtonElement>('.summary-retry-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          renderConjRandomTable({ container, lang, extraLangs, words: [], fixedQueue: missedRows });
        });
      });
    }
  }

  giveUpBtn.addEventListener('click', finish);
  updateProgress();
}
