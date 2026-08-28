import type { Word } from '../types.ts';
import {
  slotText, slotMatches, extraMatchedGloss, DEFAULT_CHINESE_DISPLAY,
  type QuizSlot, type ChineseDisplay,
} from '../utils/utils.ts';
import { attachTooltips }        from '../utils/word-tooltip.ts';
import { isInAnyList, getWordLists } from '../utils/word-lists.ts';
import { openListPicker }        from '../utils/list-picker.ts';
import { Settings, applyAutofillAttr } from '../settings.ts';
import { missCount }             from '../utils/session-history.ts';
import { flagUrl }               from '../data/languages.ts';

export type DirectionPair = 'target-en' | 'en-target';
export type TableDirection = DirectionPair | 'mixed';

/** Input placeholder, keyed by which slot the learner is being asked to type. */
const PLACEHOLDER_FOR: Record<QuizSlot, string> = {
  word:    'Type in target language…',
  english: 'Type translation…',
};

/** (promptSlot, answerSlot) for a resolved (non-'mixed') direction. */
function slotsFor(dir: DirectionPair): [QuizSlot, QuizSlot] {
  return dir === 'en-target' ? ['english', 'word'] : ['word', 'english'];
}

export interface CheckResult {
  word?:     string;
  ok:        boolean;
  expected?: string;
}

export interface InputSnapshot {
  value:      string;
  disabled:   boolean;
  stateClass: 'correct' | 'incorrect' | 'peeked' | '';
  dir:        DirectionPair;
}

export interface TableController {
  checkAll:        () => CheckResult[];
  giveUp:          () => CheckResult[];
  buildTable:      () => void;
  words:           Word[];
  checkAllComplete: () => boolean;
}

interface RenderTableModeOptions {
  words:         Word[];
  container:     HTMLElement;
  columns?:      number;
  direction?:    TableDirection;
  onComplete?:   (() => void) | null;
  lang?:         string;
  initialState?: Map<string, InputSnapshot>;
  /**
   * Called whenever the answered count changes, with the counts for the words
   * currently rendered. When supplied, the caller owns the progress bar — used
   * by pagination so the bar can report the whole quiz rather than one page.
   */
  onProgress?:   ((answeredOnPage: number, totalOnPage: number) => void) | null;
}

/**
 * The text a word reveals to, given a direction. Exported so paginated callers
 * can score words on pages that were never rendered. `lang` is the word's own
 * effective language (`w.language ?? quizLang`) and `display` mirrors
 * `Settings.getChineseDisplay()` — both only change anything for a
 * `romanizedScript` language (Chinese).
 */
export function revealTextFor(
  entry: Word,
  dir: DirectionPair,
  lang?: string | null,
  display: ChineseDisplay = DEFAULT_CHINESE_DISPLAY,
): string {
  const [, answerSlot] = slotsFor(dir);
  return slotText(entry, answerSlot, lang, display, Settings.getAnswerGlossCount());
}

/**
 * Key for a word row that's unique even when a Compare-mode table mixes two
 * languages that happen to share a spelling. Falls back to `fallbackLang` for
 * an ordinary single-language word (no `.language` set), so this degrades to
 * plain word-text keying everywhere outside Compare mode.
 */
export function rowKey(w: { word: string; language?: string }, fallbackLang: string): string {
  return `${w.language ?? fallbackLang}:${w.word}`;
}

export function renderTableMode({
  words,
  container,
  columns      = 3,
  direction    = 'target-en',
  onComplete   = null,
  lang         = (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish',
  initialState = new Map<string, InputSnapshot>(),
  onProgress   = null,
}: RenderTableModeOptions): TableController {
  if (!(container instanceof HTMLElement)) {
    throw new Error('renderTableMode: container element required');
  }

  const cols      = Math.max(1, Math.min(5, Number(columns) || 3));
  const hintMode  = Settings.getHintMode();
  const matchMode = Settings.getMatchMode();
  const chineseDisplay = Settings.getChineseDisplay();

  // O(1) word lookup — avoids O(n²) words.find() inside forEach loops.
  // Keyed by rowKey rather than bare word text so a Compare-mode table mixing
  // two languages can't collide on a shared spelling.
  const wordMap = new Map<string, Word>(words.map(w => [rowKey(w, lang), w]));

  // Only shake inputs when a manageable number are affected
  const SHAKE_THRESHOLD = 30;

  function entryDir(_entry: Word): DirectionPair {
    if (direction === 'mixed') return Math.random() < 0.5 ? 'target-en' : 'en-target';
    return direction;
  }

  function labelText(entry: Word, dir: DirectionPair): string {
    const [promptSlot] = slotsFor(dir);
    return slotText(entry, promptSlot, entry.language ?? lang, chineseDisplay, Settings.getQuestionGlossCount());
  }

  /**
   * @param typedInput What the learner actually typed, only when this word was
   * just answered correctly by typing — the reveal button and Give Up have no
   * typed answer to check, and pass nothing. "Show the sense you typed"
   * (getExpandGlossOnMatch) only ever adds to what's shown, so it only makes
   * sense to apply where the answer slot is 'english' and there's a specific
   * typed answer to explain.
   */
  function revealText(entry: Word, dir: DirectionPair, typedInput?: string): string {
    const base = revealTextFor(entry, dir, entry.language ?? lang, chineseDisplay);
    const [, answerSlot] = slotsFor(dir);
    if (answerSlot !== 'english' || !typedInput || !Settings.getExpandGlossOnMatch()) return base;
    const extra = extraMatchedGloss(typedInput, entry, Settings.getAnswerGlossCount(), matchMode);
    return extra ? `${base} / ${extra}` : base;
  }

  function checkInput(input: string, entry: Word, dir: DirectionPair): boolean {
    const [, answerSlot] = slotsFor(dir);
    return slotMatches(input, entry, answerSlot, matchMode, entry.language ?? lang, chineseDisplay);
  }

  function checkAllComplete(): boolean {
    const allInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-word]'));
    return allInputs.length > 0 && allInputs.every(inp => inp.disabled);
  }

  function updateProgress(): void {
    const allInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-word]'));
    const correct   = allInputs.filter(inp => inp.disabled).length;
    const total     = allInputs.length;

    // Paginated callers render the bar (and own the Give Up button state)
    // themselves, so it can span every page rather than just this one.
    if (onProgress) {
      onProgress(correct, total);
      return;
    }

    const pct       = total > 0 ? Math.round((correct / total) * 100) : 0;
    const statsText = correct + '/' + total + ' answered';

    const barTop      = document.getElementById('tableBarTop');
    const barBottom   = document.getElementById('tableBarBottom');
    const statsTop    = document.getElementById('tableStatsTop');
    const statsBottom = document.getElementById('tableStatsBottom');

    if (barTop)      barTop.style.width       = pct + '%';
    if (barBottom)   barBottom.style.width    = pct + '%';
    if (statsTop)    statsTop.textContent     = statsText;
    if (statsBottom) statsBottom.textContent  = statsText;

    const giveUpBtn = document.getElementById('tableReset') as HTMLButtonElement | null;
    if (giveUpBtn) giveUpBtn.disabled = (pct === 100);
  }

  function buildKnownBtn(w: Word, tdWord: HTMLElement): HTMLButtonElement {
    const wordLang = w.language ?? lang;
    const lists = getWordLists(wordLang, w.word);
    const btn   = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'known-btn' + (lists.length > 0 ? ' known-btn--active' : '');
    btn.title       = lists.length > 0 ? 'In lists: ' + lists.join(', ') : 'Add to a list';
    btn.textContent = '★';
    // Always visible, independent of whether the word has been answered —
    // adding a word to a list shouldn't require solving it first.
    // Keep Tab moving input → input; the star is still reachable by click.
    btn.tabIndex    = -1;

    btn.addEventListener('click', e => {
      e.stopPropagation();
      openListPicker({
        anchorEl: btn,
        lang: wordLang,
        word: w.word,
        onClose: () => {
          const inAny = isInAnyList(wordLang, w.word);
          if (inAny) {
            btn.classList.add('known-btn--active');
            tdWord.classList.add('word-cell--known');
          } else {
            btn.classList.remove('known-btn--active');
            tdWord.classList.remove('word-cell--known');
          }
        },
      });
    });

    return btn;
  }

  function scrollToNext(next: HTMLInputElement): void {
    next.focus();
    next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function buildTable(): void {
    container.innerHTML = '';
    const table       = document.createElement('table');
    const pairsPerRow = cols;

    // Compare/Multi-language indicator — see table.css. Off by setting means
    // no lang-tag-* class is ever added below; single-language mode never has
    // a word carrying `.language` either way, so this is a no-op there.
    const indicatorMode = Settings.getLangIndicator();
    container.classList.toggle('lang-indicator-flag', indicatorMode === 'flag');
    container.classList.toggle('hide-rank', !Settings.getTableShowRank());
    container.classList.toggle('hide-word-markers', !Settings.getTableShowWordMarkers());

    for (let i = 0; i < words.length; i += pairsPerRow) {
      const tr = document.createElement('tr');

      for (let j = 0; j < pairsPerRow; j++) {
        const w       = words[i + j];
        const tdWord  = document.createElement('td');
        const tdInput = document.createElement('td');
        tdWord.classList.add('word-cell');
        tdInput.classList.add('input-cell');

        if (!w) {
          tr.appendChild(tdWord);
          tr.appendChild(tdInput);
          continue;
        }

        const wordLang = w.language ?? lang;
        const snap = initialState.get(rowKey(w, lang));
        const dir  = snap?.dir ?? entryDir(w);

        if (indicatorMode !== 'off' && w.language) {
          tdWord.classList.add(`lang-tag-${w.language}`);
          // Read by the flag-mode CSS (background-image: var(--flag-img)) —
          // resolving it here means a Settings flag override just works, no
          // stylesheet change needed.
          if (indicatorMode === 'flag') {
            tdWord.style.setProperty('--flag-img', `url("${flagUrl(Settings.getLangFlag(w.language))}")`);
          }
        }

        if (isInAnyList(wordLang, w.word)) tdWord.classList.add('word-cell--known');

        // Rank / position indicator
        // Repeat offenders from previous sessions, marked before you answer.
        // Advisory only — it changes nothing about scoring.
        const misses = missCount(wordLang, w.word);
        if (misses >= 2) {
          tdWord.classList.add('table-word--trouble');
          tdWord.dataset.missed = String(misses);
          tdWord.title = `Missed ${misses} time${misses === 1 ? '' : 's'} before`;
        }

        const rankEl = document.createElement('span');
        rankEl.className   = 'table-word-rank';
        rankEl.textContent = String(w.rank || (i + j + 1));
        tdWord.appendChild(rankEl);

        const wordDiv = document.createElement('div');
        wordDiv.textContent = labelText(w, dir);
        wordDiv.classList.add('spanish-word');
        wordDiv.dataset.wordJson = JSON.stringify(w);
        tdWord.appendChild(wordDiv);

        const inp        = document.createElement('input');
        inp.type         = 'text';
        applyAutofillAttr(inp);
        inp.dataset.word = w.word;
        // Read back alongside data-word to rebuild the composite rowKey — see
        // rowKey() above. Always set, even outside Compare mode, so callers
        // never have to special-case "no language tag on this row".
        inp.dataset.lang = wordLang;
        inp.dataset.dir  = dir;
        inp.placeholder  = PLACEHOLDER_FOR[slotsFor(dir)[1]];

        // ── Restore saved state (column change preserves progress) ────────────
        if (snap) {
          inp.value    = snap.value;
          inp.disabled = snap.disabled;
          if (snap.stateClass) inp.classList.add(snap.stateClass);
        }

        // Its active/inactive class already reflects real list membership —
        // read fresh inside buildKnownBtn, not from the snapshot.
        const knownBtn = buildKnownBtn(w, tdWord);

        // ── Reveal button — behaviour driven by hint mode setting ────────────
        const revealBtn = document.createElement('button');
        revealBtn.type      = 'button';
        revealBtn.className = 'reveal-btn';
        // Tab should land on the next word's input, not on this button.
        revealBtn.tabIndex  = -1;

        // ── Correct answer handler ───────────────────────────────────────────
        inp.addEventListener('input', () => {
          if (checkInput(inp.value, w, dir)) {
            const typed  = inp.value;
            inp.value    = revealText(w, dir, typed);
            inp.disabled = true;
            inp.classList.add('correct');

            if (isInAnyList(wordLang, w.word)) {
              knownBtn.classList.add('known-btn--active');
              tdWord.classList.add('word-cell--known');
            }

            const allInputs  = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-word]'));
            const currentIdx = allInputs.indexOf(inp);
            const next       = allInputs.slice(currentIdx + 1).find(i => !i.disabled);
            if (next) scrollToNext(next);

            updateProgress();

            if (checkAllComplete() && onComplete) {
              const cb = onComplete;
              setTimeout(() => cb(), 300);
            }
          } else {
            inp.classList.remove('correct');
          }
        });

        // ── Escape: skip to next unanswered ──────────────────────────────────
        inp.addEventListener('keydown', e => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          const allInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-word]'));
          const idx  = allInputs.indexOf(inp);
          const next = allInputs.slice(idx + 1).find(i => !i.disabled);
          if (next) scrollToNext(next);
        });

        // ── Row-active highlight while typing ────────────────────────────────
        inp.addEventListener('focus', () => {
          container.querySelectorAll('tr.row-active').forEach(r => r.classList.remove('row-active'));
          inp.closest('tr')?.classList.add('row-active');
        });
        inp.addEventListener('blur', () => {
          inp.closest('tr')?.classList.remove('row-active');
        });

        // ── Full reveal helper ────────────────────────────────────────────────
        function doFullReveal(): void {
          inp.value    = revealText(w, dir);
          inp.disabled = true;
          inp.classList.add('peeked');
          if (isInAnyList(wordLang, w.word)) {
            knownBtn.classList.add('known-btn--active');
            tdWord.classList.add('word-cell--known');
          }
          const allInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-word]'));
          const idx  = allInputs.indexOf(inp);
          const next = allInputs.slice(idx + 1).find(i => !i.disabled);
          if (next) scrollToNext(next);
          updateProgress();
          if (checkAllComplete() && onComplete) { const cb = onComplete; setTimeout(() => cb(), 300); }
        }

        // ── Append input, then hint button based on hintMode ─────────────────
        // The row wrapper is a plain div, not the <td> itself: making the cell
        // a flex container would take it out of the table layout and break the
        // fixed column widths.
        const inputRow = document.createElement('div');
        inputRow.className = 'input-row';
        tdInput.appendChild(inputRow);
        inputRow.appendChild(inp);

        if (hintMode === 'none') {
          // No hint button
        } else if (hintMode === 'first-letter') {
          revealBtn.textContent = '?';
          revealBtn.title       = 'Show first letter';
          let hinted = false;
          revealBtn.addEventListener('click', () => {
            if (!hinted) {
              const answer    = revealText(w, dir);
              inp.value       = answer[0];
              inp.placeholder = `${answer.length} letters`;
              inp.focus();
              hinted = true;
              revealBtn.textContent = '??';
              revealBtn.title       = 'Reveal full answer (counts as missed)';
            } else {
              doFullReveal();
            }
          });
          inputRow.appendChild(revealBtn);
        } else {
          revealBtn.textContent = '?';
          revealBtn.title       = 'Reveal answer (counts as missed)';
          revealBtn.addEventListener('click', doFullReveal);
          inputRow.appendChild(revealBtn);
        }

        inputRow.appendChild(knownBtn);
        tr.appendChild(tdWord);
        tr.appendChild(tdInput);
      }

      table.appendChild(tr);
    }

    container.appendChild(table);
    attachTooltips(container);
    updateProgress();

    // Auto-focus first unanswered input
    const firstUnanswered = container.querySelector<HTMLInputElement>('input[data-word]:not(:disabled)');
    firstUnanswered?.focus();
  }

  /** Rebuild wordMap's key from an input's dataset — the DOM-side half of rowKey(). */
  function inputRowKey(inp: HTMLInputElement): string {
    return `${inp.dataset.lang ?? lang}:${inp.dataset.word ?? ''}`;
  }

  function checkAll(): CheckResult[] {
    const results: CheckResult[] = [];
    container.querySelectorAll<HTMLInputElement>('input[data-word]').forEach(inp => {
      if (inp.classList.contains('correct')) { results.push({ ok: true });  return; }
      if (inp.classList.contains('peeked'))  { results.push({ ok: false }); return; }
      const entry = wordMap.get(inputRowKey(inp));
      if (!entry) return;
      const dir      = (inp.dataset.dir ?? 'target-en') as DirectionPair;
      const revealed = revealText(entry, dir);
      const ok       = checkInput(inp.value, entry, dir);
      inp.classList.remove('correct', 'incorrect');
      if (ok) {
        inp.value    = revealed;
        inp.disabled = true;
        inp.classList.add('correct');
      } else {
        inp.classList.add('incorrect');
      }
      results.push({ word: inp.dataset.word, ok, expected: revealed });
    });
    return results;
  }

  function shake(inp: HTMLInputElement): void {
    // No forced reflow — giveUp only calls this once per element so the
    // class is guaranteed to be absent; removing it first is unnecessary.
    inp.classList.add('input-shake');
    inp.addEventListener('animationend', () => inp.classList.remove('input-shake'), { once: true });
  }

  function giveUp(): CheckResult[] {
    const allInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[data-word]')
    );

    // Count unanswered inputs upfront so we can decide whether shaking is useful
    const unansweredCount = allInputs.filter(
      inp => !inp.classList.contains('correct') &&
             !inp.classList.contains('peeked')  &&
             !inp.disabled
    ).length;
    const doShake = unansweredCount <= SHAKE_THRESHOLD;

    const results: CheckResult[] = [];
    allInputs.forEach(inp => {
      if (inp.classList.contains('correct')) { results.push({ ok: true }); return; }
      if (inp.classList.contains('peeked'))  {
        results.push({ word: inp.dataset.word, ok: false, expected: inp.value });
        return;
      }
      const entry = wordMap.get(inputRowKey(inp));
      if (!entry) return;
      const dir      = (inp.dataset.dir ?? 'target-en') as DirectionPair;
      const revealed = revealText(entry, dir);
      inp.value    = revealed;
      inp.disabled = true;
      inp.classList.remove('correct');
      inp.classList.add('incorrect');
      if (doShake) shake(inp);
      results.push({ word: inp.dataset.word, ok: false, expected: revealed });
    });
    updateProgress();
    return results;
  }

  buildTable();
  return { checkAll, giveUp, buildTable, words, checkAllComplete };
}
