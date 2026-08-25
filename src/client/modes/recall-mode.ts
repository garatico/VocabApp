import { inferGender } from '../utils/gender.js';
import { attachTooltips } from '../utils/word-tooltip.ts';
import type { Word }     from '../types.ts';
import { isInAnyList, getWordLists } from '../utils/word-lists.ts';
import { openListPicker }            from '../utils/list-picker.ts';
import { getFontScaleForRecall, Settings, applyAutofillAttr } from '../settings.ts';
import { languageInfo, flagUrl } from '../data/languages.ts';
import {
  saveSession, getSessions, wordsPerMinute as wpm,
  recordOutcome, missCount, orderWords, WORD_ORDER_LABELS,
  type WordOrder, type SessionRecord,
} from '../utils/session-history.ts';
import { readString, writeString } from '../utils/storage.ts';
import { foldKey as recallKey, levenshteinCapped as editDistance }
  from '../utils/match.ts';
import { createStopwatch, formatClock } from '../ui/stopwatch.ts';

interface RenderRecallModeOptions {
  words:     Word[];
  container: HTMLElement;
  columns?:  number;
  lang?:     string;
}

export interface RecallController {
  startTimer: (seconds: number, isHardStop: boolean) => void;
}

export function renderRecallMode({
  words,
  container,
  columns = 1,
  lang = 'spanish',
}: RenderRecallModeOptions): RecallController {
  container.innerHTML = '';

  // Clear any stale outer summary cards from a previous session
  ['recallSummaryTop', 'recallSummaryBottom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  });

  const cols = Math.max(1, Math.min(3, Number(columns) || 1));

  // `lang` is a combined "spanish+italian"-style id when a multi-language
  // session is active (see app.ts's getFullLang) — every word in that case
  // carries its own real `.language`, so `lang` itself is only ever read as
  // the *fallback* for an untagged (single-language) word below. The one
  // place the raw primary name is needed on its own — display text, not a
  // per-word fallback — `lang`'s first segment is always it.
  const primaryLang = lang.split('+')[0];

  // A word's identity for session state: two languages can share a spelling
  // (Spanish/Italian/Portuguese "de", "no", "e"...) once merged, so keying
  // purely by word text — the single-language design this file started
  // with — would make one cell stand in for two different words. Mirrors
  // table-mode.ts's rowKey().
  function cellKey(w: Word): string {
    return `${w.language ?? lang}:${w.word}`;
  }

  const recalled      = new Set<string>();
  const revealed      = new Set<string>();
  // Words that received a hint before being recalled. Tracked per word rather
  // than as a flat counter so "unassisted" means something specific: you
  // produced it without ever seeing part of it.
  const hinted        = new Set<string>();
  let hintsUsed       = 0;
  // Headless — recall already renders its own pace text (rate + clock
  // together), not a bare readout, so nothing is mounted.
  const stopwatch = createStopwatch(null);
  stopwatch.start();
  let paceTimer: ReturnType<typeof setInterval> | null = null;

  function unassistedCount(): number {
    let n = 0;
    recalled.forEach(k => { if (!hinted.has(k)) n++; });
    return n;
  }
  let timerInterval: ReturnType<typeof setInterval> | null = null;
  let secondsLeft   = 0;
  let hardStop      = false;
  let finished      = false;

  // Order is a user choice now — always-by-rank meant you learned grid
  // positions rather than words.
  let wordOrder: WordOrder =
    (readString('vq_recall_order') as WordOrder | null) ?? 'rank';
  let sorted = orderWords(words, wordOrder, w => w.language ?? lang);

  // Reverse lookup from cellKey back to the Word it names — every function
  // below that only has a key (from `recalled`/`revealed`/DOM lookups) needs
  // this to get back to something revealCell()/isInAnyList()/etc. can use.
  let wordByKey = new Map<string, Word>();
  function reindexWordByKey(): void {
    wordByKey = new Map(sorted.map(w => [cellKey(w), w]));
  }
  reindexWordByKey();

  const wrap = document.createElement('div');
  wrap.className = 'recall-wrap';

  const timerRow = document.createElement('div');
  timerRow.className = 'recall-timer-row';

  const timerDisplay = document.createElement('span');
  timerDisplay.className = 'recall-timer';

  const giveUpBtn = document.createElement('button');
  giveUpBtn.textContent = 'Give Up';
  giveUpBtn.className   = 'recall-giveup-btn';

  // Apply text scale from the global font size setting
  wrap.style.setProperty('--rs', getFontScaleForRecall().toFixed(3));

  // Hint — progressively reveals the next unrecalled word rather than ending
  // the session, which was previously the only escape from being stuck.
  const hintBtn = document.createElement('button');
  hintBtn.type = 'button';
  hintBtn.className = 'recall-hint-btn';
  hintBtn.textContent = '💡 Hint';
  hintBtn.title = 'Reveal the first letters of a word you have not got yet';

  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.className = 'recall-reveal-btn';
  revealBtn.textContent = '👁 Reveal one';
  revealBtn.title = 'Give up on a single word and reveal it, without ending the session';

  // Group the actions so the row reads [timer] .......... [hint reveal give-up]
  // rather than space-between smearing four items across the full width.
  // Prompt toggle — fills still-blank cells with the English, so a word you
  // have never met is distinguishable from one you have forgotten. Off by
  // default: free recall is the point, prompting is the fallback.
  const promptBtn = document.createElement('button');
  promptBtn.type = 'button';
  promptBtn.className = 'recall-prompt-btn';
  promptBtn.textContent = '\ud83d\udc41 Prompts';
  promptBtn.title = 'Show the English meaning in cells you have not filled in yet';
  let promptsOn = false;

  const orderLabel = document.createElement('span');
  orderLabel.className = 'inline-order-label';
  orderLabel.textContent = 'Order';

  const orderSel = document.createElement('select');
  orderSel.className = 'recall-order-select';
  orderSel.title = 'Order of the grid';
  WORD_ORDER_LABELS.forEach(([value, label]) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label; o.selected = value === wordOrder;
    orderSel.appendChild(o);
  });

  const actionGroup = document.createElement('div');
  actionGroup.className = 'recall-actions';
  actionGroup.append(orderLabel, orderSel, promptBtn, hintBtn, revealBtn, giveUpBtn);
  timerRow.append(timerDisplay, actionGroup);

  const inputRow = document.createElement('div');
  inputRow.className = 'recall-input-row';

  const inp = document.createElement('input');
  inp.type         = 'text';
  inp.placeholder  = 'Type a ' + languageInfo(primaryLang).label + ' word…';
  inp.className    = 'recall-input';
  applyAutofillAttr(inp);

  const feedback = document.createElement('span');
  feedback.className = 'recall-feedback';

  inputRow.appendChild(inp);
  inputRow.appendChild(feedback);

  const scoreEl = document.createElement('div');
  scoreEl.className = 'recall-score';

  const paceEl = document.createElement('div');
  paceEl.className = 'recall-pace';
  updateScore();

  const gridWrap = document.createElement('div');
  gridWrap.className = 'recall-grid-wrap';
  gridWrap.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';

  /**
   * (Re)build the grid from `sorted`.
   *
   * Extracted so changing the order does not require tearing down the whole
   * mode. Recalled and revealed cells are restored afterwards, so switching
   * order mid-session keeps your progress on screen.
   */
  function rebuildGrid(): void {
    gridWrap.innerHTML = '';

    // Compare/Multi-language indicator — see table.css. Off by setting means
    // no lang-tag-* class is ever added below; a single-language session
    // never has a word carrying `.language` either way, so this is a no-op
    // there regardless of the setting.
    const indicatorMode = Settings.getLangIndicator();
    gridWrap.classList.toggle('lang-indicator-flag', indicatorMode === 'flag');

    // Chunked distribution: table 0 gets words 0…chunkSize-1,
    // table 1 gets words chunkSize…2*chunkSize-1, etc.
    // Each table reads top-to-bottom in order, so stacking on mobile is seamless.
    const chunkSize = Math.ceil(sorted.length / cols);

    for (let ci = 0; ci < cols; ci++) {
      const table = document.createElement('table');
      table.className = 'recall-table';

      for (let row = 0; row < chunkSize; row++) {
        const idx = ci * chunkSize + row;
        if (idx >= sorted.length) break;

        const w = sorted[idx];
        const tr = document.createElement('tr');

        const tdNum = document.createElement('td');
        tdNum.className   = 'recall-rank';
        tdNum.textContent = (w.rank || idx + 1) + '.';

        const tdWord = document.createElement('td');
        tdWord.className        = 'recall-cell';
        tdWord.dataset.word     = w.word;
        tdWord.dataset.cellKey  = cellKey(w);
        tdWord.dataset.wordJson = JSON.stringify(w);
        tdWord.textContent      = '';

        const wordLang = w.language ?? lang;
        if (isInAnyList(wordLang, w.word)) {
          tdWord.classList.add('recall-cell--known');
        }
        // Same Off/Color/Flag indicator as table mode's Compare feature,
        // mirrored onto the recall grid — only relevant once a word actually
        // carries `.language` (a merged, multi-language session).
        if (indicatorMode !== 'off' && w.language) {
          tdWord.classList.add(`lang-tag-${w.language}`);
          if (indicatorMode === 'flag') {
            tdWord.style.setProperty('--flag-img', `url("${flagUrl(Settings.getLangFlag(w.language))}")`);
          }
        }

        tr.appendChild(tdNum);
        tr.appendChild(tdWord);
        table.appendChild(tr);
      }

      gridWrap.appendChild(table);
    }

    attachTooltips(gridWrap, { hideWordWhenUnrevealed: true });

    // Repaint anything already answered, and mark repeat offenders.
    recalled.forEach(k => { const w = wordByKey.get(k); if (w) revealCell(w, 'recalled'); });
    revealed.forEach(k => { const w = wordByKey.get(k); if (w) revealCell(w, 'missed'); });
    markTroubleCells();
    if (promptsOn) applyPrompts();
  }

  /**
   * Flag words this language has missed repeatedly in past sessions.
   * Purely advisory — it does not change scoring, it just tells you where
   * your attention keeps failing.
   */
  function markTroubleCells(): void {
    sorted.forEach(w => {
      const n = missCount(w.language ?? lang, w.word);
      if (n < 2) return;
      const cell = gridWrap.querySelector<HTMLTableCellElement>(
        'td.recall-cell[data-cell-key="' + CSS.escape(cellKey(w)) + '"]'
      );
      if (!cell) return;
      cell.classList.add('recall-cell--trouble');
      cell.dataset.missed = String(n);
    });
  }

  rebuildGrid();


  wrap.appendChild(timerRow);
  wrap.appendChild(inputRow);
  wrap.appendChild(scoreEl);
  wrap.appendChild(paceEl);
  wrap.appendChild(gridWrap);
  container.appendChild(wrap);

  inp.focus();
  updateProgress();
  updatePace();
  paceTimer = setInterval(updatePace, 1000);

  orderSel.addEventListener('change', () => {
    wordOrder = orderSel.value as WordOrder;
    writeString('vq_recall_order', wordOrder);
    // Reordering permutes the same Word objects — wordByKey's contents don't
    // change, only rebuildGrid()'s traversal order, so no reindex needed.
    sorted = orderWords(words, wordOrder, w => w.language ?? lang);
    rebuildGrid();
    inp.focus();
  });

  promptBtn.addEventListener('click', () => {
    promptsOn = !promptsOn;
    promptBtn.classList.toggle('recall-prompt-btn--active', promptsOn);
    applyPrompts();
    inp.focus();
  });

  /**
   * Show or hide the English on every cell not yet filled in.
   * Never touches recalled or revealed cells — those already say something.
   */
  function applyPrompts(): void {
    sorted.forEach(w => {
      const k = cellKey(w);
      if (recalled.has(k) || revealed.has(k)) return;
      const cell = gridWrap.querySelector<HTMLTableCellElement>(
        'td.recall-cell[data-cell-key="' + CSS.escape(k) + '"]'
      );
      if (!cell) return;
      if (promptsOn) {
        cell.textContent = w.translation || '—';
        cell.classList.add('recall-cell--prompt');
      } else {
        cell.textContent = '';
        cell.classList.remove('recall-cell--prompt');
      }
    });
  }

  // Accent-insensitive index, built once. Typing 'corazon' has to find
  // 'corazón' — exact matching made correct answers read as wrong. A bucket
  // rather than one Word per key because a merged multi-language session can
  // have two languages share a folded spelling (Spanish/Italian/Portuguese
  // "de") — matchesFor() below picks whichever of them is still outstanding.
  const byKey = new Map<string, Word[]>();
  sorted.forEach(w => {
    const k = recallKey(w.word);
    const bucket = byKey.get(k);
    if (bucket) bucket.push(w); else byKey.set(k, [w]);
  });

  /** Every word this folded spelling could mean, unrecalled ones first. */
  function matchesFor(key: string): Word[] {
    const bucket = byKey.get(key);
    if (!bucket) return [];
    return [...bucket].sort((a, b) => Number(recalled.has(cellKey(a))) - Number(recalled.has(cellKey(b))));
  }

  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  function flash(text: string, cls: string, ms = 900): void {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedback.textContent = text;
    feedback.className   = 'recall-feedback ' + cls;
    feedbackTimer = setTimeout(() => {
      feedback.textContent = '';
      feedback.className   = 'recall-feedback';
    }, ms);
  }

  /**
   * Is what you have typed the start of some *other* word you have not got yet?
   *
   * Short words are real words — Italian 'e', 'a', 'di'; Spanish 'de', 'y',
   * 'la'. Consuming a live match the instant it is typed makes those words
   * impossible to type past: 'e' would be swallowed while you were still
   * typing 'essere'. So a live match is only taken when nothing longer could
   * still be intended; otherwise we wait for Enter.
   */
  function couldExtend(key: string): boolean {
    for (const w of sorted) {
      if (recalled.has(cellKey(w))) continue;
      const k = recallKey(w.word);
      if (k.length > key.length && k.startsWith(key)) return true;
    }
    return false;
  }

  /** Accept a match. Returns false if it was already recalled. */
  function acceptMatch(match: Word): boolean {
    const k = cellKey(match);
    if (recalled.has(k)) return false;
    recalled.add(k);
    revealCell(match, 'recalled');
    updateScore();
    // Show the properly accented spelling back, so an unaccented guess still
    // teaches the correct form.
    flash('✓ ' + match.word, 'ok', 800);
    inp.value = '';
    if (recalled.size + revealed.size === sorted.length) endSession();
    return true;
  }

  inp.addEventListener('input', () => {
    const val = inp.value.trim();
    if (!val) return;

    const key   = recallKey(val);
    const match = matchesFor(key).find(w => !recalled.has(cellKey(w)));

    // Two gates. The setting is the user's preference; couldExtend is a
    // correctness requirement that holds even when auto-accept is on, because
    // 'e' is both a word and the first letter of 'essere'.
    if (!Settings.getRecallAutoEnter()) return;
    if (match && !couldExtend(key)) acceptMatch(match);
  });

  // Everything that judges a *finished* guess happens on Enter. Doing any of
  // it per keystroke flags half-typed words and steals the input box.
  inp.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const val = inp.value.trim();
    if (!val) return;
    const key = recallKey(val);

    const candidates = matchesFor(key);
    if (candidates.length > 0) {
      const match = candidates.find(w => !recalled.has(cellKey(w)));
      if (match) { acceptMatch(match); return; }
      // Every word this spelling could mean is already recalled.
      flash('Already got ' + candidates[0].word, 'dup', 900);
      inp.select();          // keep the text so it can be edited, not retyped
      return;
    }

    let best: Word | null = null;
    let bestDist = 3;
    for (const w of sorted) {
      if (recalled.has(cellKey(w))) continue;
      const d = editDistance(key, recallKey(w.word), 2);
      if (d < bestDist) { bestDist = d; best = w; if (d === 1) break; }
    }

    if (best && bestDist <= 2) {
      // Don't give the answer away — just say they're close.
      flash(`So close — ${bestDist === 1 ? 'one letter' : 'two letters'} off`, 'near', 1400);
    } else {
      flash('Not in this set', 'miss', 900);
    }
  });

  // ── Hints ─────────────────────────────────────────────────────────────────
  // hintLevel tracks how much of the current hint word has been shown, so
  // pressing Hint repeatedly peels back one more letter at a time.
  let hintWord: Word | null = null;
  let hintLevel = 0;

  function nextUnrecalled(): Word | null {
    return sorted.find(w => !recalled.has(cellKey(w))) ?? null;
  }

  hintBtn.addEventListener('click', () => {
    if (finished) return;
    if (!hintWord || recalled.has(cellKey(hintWord))) { hintWord = nextUnrecalled(); hintLevel = 0; }
    if (!hintWord) return;

    hintLevel = Math.min(hintLevel + 1, hintWord.word.length - 1);
    // Any hint on a word means recalling it no longer counts as unassisted.
    hinted.add(cellKey(hintWord));
    const shown  = hintWord.word.slice(0, hintLevel);
    const hidden = '·'.repeat(Math.max(0, hintWord.word.length - hintLevel));
    flash(`${shown}${hidden}  (${hintWord.word.length} letters)`, 'hint', 3000);
    hintsUsed++;
    updateScore();
    inp.focus();
  });

  revealBtn.addEventListener('click', () => {
    if (finished) return;
    const target = (hintWord && !recalled.has(cellKey(hintWord))) ? hintWord : nextUnrecalled();
    if (!target) return;
    revealCell(target, 'missed');
    revealed.add(cellKey(target));
    hintWord = null; hintLevel = 0;
    flash('Revealed: ' + target.word, 'miss', 1600);
    updateScore();
    // A revealed word still counts as accounted for, or the session can never
    // end while it sits there unrecalled.
    if (recalled.size + revealed.size === sorted.length) endSession();
    inp.focus();
  });

  giveUpBtn.addEventListener('click', endSession);

  function revealCell(w: Word, state: 'recalled' | 'missed'): void {
    const wordLang = w.language ?? lang;
    const cell = gridWrap.querySelector<HTMLTableCellElement>(
      'td.recall-cell[data-cell-key="' + CSS.escape(cellKey(w)) + '"]'
    );
    if (!cell) return;

    cell.textContent = w.word;
    cell.classList.remove('recalled', 'missed', 'recall-cell--known');
    cell.classList.add(state);

    if (state === 'recalled') {
      const btn       = document.createElement('button');
      btn.type        = 'button';
      btn.className   = 'recall-known-btn' + (isInAnyList(wordLang, w.word) ? ' known-btn--active' : '');
      btn.title       = isInAnyList(wordLang, w.word)
        ? 'In lists: ' + getWordLists(wordLang, w.word).join(', ')
        : 'Add to a list';
      btn.textContent = '★';

      btn.addEventListener('click', e => {
        e.stopPropagation();
        openListPicker({
          anchorEl: btn,
          lang: wordLang,
          word: w.word,
          onClose: () => {
            const inAny = isInAnyList(wordLang, w.word);
            btn.classList.toggle('known-btn--active', inAny);
            btn.title = inAny
              ? 'In lists: ' + getWordLists(wordLang, w.word).join(', ')
              : 'Add to a list';
          },
        });
      });

      cell.appendChild(btn);
    }
  }

  function updateScore(): void {
    const assisted = recalled.size - unassistedCount();
    const parts = ['Recalled: ' + recalled.size + ' / ' + sorted.length];
    if (assisted)      parts.push(`${assisted} with help`);
    if (revealed.size) parts.push(`${revealed.size} revealed`);
    scoreEl.textContent = parts.join('  ·  ');
    updatePace();
    updateProgress();
  }

  /**
   * Live pace. Recomputed on a timer as well as on each answer, so the rate
   * visibly decays while you are stuck rather than freezing at your last hit.
   */
  function updatePace(): void {
    if (finished) return;
    const secs  = stopwatch.elapsedSeconds();
    const rate  = wpm(recalled.size, secs);
    const clock = formatClock(secs);

    const best = bestPriorRate();
    const cmp  = (best > 0 && rate > 0)
      ? `  ·  best ${best}/min`
      : '';
    paceEl.textContent = rate > 0
      ? `${rate}/min  ·  ${clock} elapsed${cmp}`
      : `${clock} elapsed`;
    paceEl.classList.toggle('recall-pace--ahead', best > 0 && rate > best);
  }

  function bestPriorRate(): number {
    // Primary language only — `lang` can be a combined "es+it" id in a
    // merged session, which has no history of its own to compare against.
    const hist = getSessions(primaryLang, 'recall');
    let best = 0;
    for (const h of hist) {
      const r = wpm(h.correct, h.seconds);
      if (r > best) best = r;
    }
    return best;
  }

  function updateProgress(): void {
    const pct = sorted.length > 0 ? Math.round((recalled.size / sorted.length) * 100) : 0;

    const barTop      = document.getElementById('recallBarTop');
    const barBottom   = document.getElementById('recallBarBottom');
    const statsTop    = document.getElementById('recallStatsTop');
    const statsBottom = document.getElementById('recallStatsBottom');

    const statsText = recalled.size + '/' + sorted.length + ' recalled';

    if (barTop)      (barTop    as HTMLElement).style.width = pct + '%';
    if (barBottom)   (barBottom as HTMLElement).style.width = pct + '%';
    if (statsTop)    statsTop.textContent    = statsText;
    if (statsBottom) statsBottom.textContent = statsText;

    if (sorted.length > 0 && recalled.size === sorted.length) {
      giveUpBtn.disabled = true;
    }
  }

  function endSession(): void {
    if (finished) return;
    finished = true;
    if (timerInterval) clearInterval(timerInterval);
    inp.disabled       = true;
    giveUpBtn.disabled = true;

    const missedWords = sorted.filter(w => !recalled.has(cellKey(w)));
    missedWords.forEach(w => revealCell(w, 'missed'));

    const missed     = missedWords.length;
    const pct        = Math.round((recalled.size / sorted.length) * 100);
    const unassisted = unassistedCount();
    stopwatch.stop();
    const seconds    = stopwatch.elapsedSeconds();
    const rate       = wpm(recalled.size, seconds);

    if (paceTimer) { clearInterval(paceTimer); paceTimer = null; }

    // Persist per-language: a merged session must still write its
    // history/misses into each word's *actual* language's storage, not one
    // shared bucket under the (possibly combined) `lang` id — mirrors
    // table-controls.ts's recordMastery(). `seconds`/`unassisted`/`hints`
    // describe the whole sitting, not any one language, so the same values
    // land on every bucket; `total`/`correct`/`revealed` are the per-language
    // subset, so each language's own history stays accurate.
    interface Bucket { correct: string[]; missed: string[]; revealedWords: string[]; }
    const byLang = new Map<string, Bucket>();
    function bucketFor(wl: string): Bucket {
      let b = byLang.get(wl);
      if (!b) { b = { correct: [], missed: [], revealedWords: [] }; byLang.set(wl, b); }
      return b;
    }
    sorted.forEach(w => {
      const wl = w.language ?? lang;
      const k  = cellKey(w);
      if (recalled.has(k)) bucketFor(wl).correct.push(w.word);
      else                 bucketFor(wl).missed.push(w.word);
      if (revealed.has(k)) bucketFor(wl).revealedWords.push(w.word);
    });

    const langs = [...byLang.keys()];
    let prior:         SessionRecord[]      = [];
    let primaryRecord: SessionRecord | null = null;
    for (const [wl, b] of byLang) {
      const record: SessionRecord = {
        at: new Date().toISOString(),
        mode: 'recall',
        total: b.correct.length + b.missed.length,
        correct: b.correct.length,
        unassisted,
        hints: hintsUsed,
        revealed: b.revealedWords.length,
        seconds,
        lang: wl,
        langs: langs.length > 1 ? langs : undefined,
      };
      const bucketPrior = saveSession(wl, record);
      recordOutcome(wl, b.missed, b.correct);
      if (wl === primaryLang) { prior = bucketPrior; primaryRecord = record; }
    }

    const priorBestRate  = prior.reduce((b, h) => Math.max(b, wpm(h.correct, h.seconds)), 0);
    const priorBestCount = prior.reduce((b, h) => Math.max(b, h.correct), 0);
    const lastSession    = prior.length ? prior[prior.length - 1] : null;

    let verdict: string;
    if (prior.length === 0) {
      verdict = 'First session — this is your baseline.';
    } else {
      const bits: string[] = [];
      if (recalled.size > priorBestCount)      bits.push(`best yet (was ${priorBestCount})`);
      else if (lastSession)                    bits.push(`${recalled.size - lastSession.correct >= 0 ? '+' : ''}${recalled.size - lastSession.correct} vs last`);
      if (rate > priorBestRate && rate > 0)    bits.push(`fastest yet at ${rate}/min`);
      verdict = bits.join('  ·  ');
    }

    const assisted = recalled.size - unassisted;
    const summaryHTML =
      '<span class="summary-correct">✓ ' + unassisted + ' unaided</span>' +
      (assisted ? '<span class="summary-assisted">◐ ' + assisted + ' with help</span>' : '') +
      '<span class="summary-missed">✗ ' + missed + ' missed</span>' +
      '<span class="summary-pct">' + pct + '%</span>' +
      (rate > 0 ? '<span class="summary-pace">' + rate + '/min</span>' : '');

    // Top and bottom outer summary cards
    ['recallSummaryTop', 'recallSummaryBottom'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = 'flex'; el.innerHTML = summaryHTML; }
    });

    // The missed words are already on screen — revealed in their own cells, in
    // red. Repeating them as a chip list underneath said the same thing twice
    // and buried the grid. Keep the score line as a one-line tally instead.
    scoreEl.textContent = missed > 0
      ? `${recalled.size} recalled · ${missed} shown in red`
      : `All ${recalled.size} recalled`;

    // Pace line becomes the session verdict.
    const hintNote = hintsUsed
      ? `  ·  ${hintsUsed} hint${hintsUsed === 1 ? '' : 's'} used on ${hinted.size} word${hinted.size === 1 ? '' : 's'}`
      : '';
    paceEl.textContent = verdict + hintNote;
    paceEl.classList.toggle('recall-pace--best', recalled.size > priorBestCount && prior.length > 0);

    // The chart's own scale only makes sense within one language, so it
    // tracks the primary language's history — same reasoning as `prior`
    // above — rather than the whole (possibly merged) session's totals.
    if (primaryRecord) renderHistoryPanel([...prior, primaryRecord]);

    // Gender still worth surfacing, as a tooltip on the revealed cell.
    missedWords.forEach(w => {
      const wordLang = w.language ?? lang;
      const gender = w.linguistic?.gender ?? (w.pos === 'noun' ? inferGender(w.word, wordLang) : null);
      if (!gender) return;
      const cell = gridWrap.querySelector<HTMLTableCellElement>(
        'td.recall-cell[data-cell-key="' + CSS.escape(cellKey(w)) + '"]'
      );
      if (cell) cell.title = gender;
    });
  }

  function startTimer(seconds: number, isHardStop: boolean): void {
    secondsLeft = seconds;
    hardStop    = isHardStop;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      secondsLeft--;
      updateTimerDisplay();

      if (secondsLeft <= 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        clearInterval(timerInterval!); // timerInterval is set by startTimer() before this callback fires
        if (hardStop) {
          endSession();
        } else {
          timerDisplay.textContent = "Time's up!";
          timerDisplay.style.color = 'var(--danger)';
        }
      }
    }, 1000);
  }

  /**
   * A compact bar chart of recent sessions.
   *
   * The history was already being stored and never shown, which made "best
   * yet" an assertion rather than something you could see.
   */
  function renderHistoryPanel(sessions: SessionRecord[]): void {
    const recent = sessions.slice(-12);
    if (recent.length < 2) return;

    const panel = document.createElement('div');
    panel.className = 'recall-history';

    const head = document.createElement('div');
    head.className = 'recall-history-head';
    head.textContent = `Last ${recent.length} sessions`;
    panel.appendChild(head);

    const chart = document.createElement('div');
    chart.className = 'recall-history-chart';
    const peak = Math.max(...recent.map(r => r.correct), 1);

    recent.forEach((r, i) => {
      const col = document.createElement('div');
      col.className = 'recall-history-bar' + (i === recent.length - 1 ? ' is-current' : '');
      col.style.height = Math.max(4, Math.round((r.correct / peak) * 100)) + '%';
      const rate = wpm(r.correct, r.seconds);
      col.title =
        `${new Date(r.at).toLocaleDateString()} — ${r.correct}/${r.total} recalled`
        + (rate ? `, ${rate}/min` : '')
        + (r.hints ? `, ${r.hints} hints` : '');
      chart.appendChild(col);
    });
    panel.appendChild(chart);

    const foot = document.createElement('div');
    foot.className = 'recall-history-foot';
    const avg = Math.round(recent.reduce((a, r) => a + r.correct, 0) / recent.length);
    foot.textContent = `average ${avg} recalled · best ${peak}`;
    panel.appendChild(foot);

    wrap.appendChild(panel);
  }

  function updateTimerDisplay(): void {
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    timerDisplay.textContent = m + ':' + s.toString().padStart(2, '0');
    timerDisplay.style.color = secondsLeft <= 30 ? 'var(--danger)' : 'var(--text-muted)';
  }

  return { startTimer };
}
