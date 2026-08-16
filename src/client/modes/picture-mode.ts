/**
 * Picture Quiz Mode
 *
 * Two sub-modes selected via the filter bar before starting:
 *
 *   type  — grid of picture cards; user types the target-language word
 *   click — one Spanish prompt at a time; user picks the correct image
 *           from a 2×2 grid (1 correct + 3 distractors)
 *
 * The sub-mode toggle lives in #pictureModeControls (index.html) and is
 * shown/hidden by ui-state.js alongside the conjugation controls.
 * start-handler.js reads the active button and passes `mode` here.
 */

import { getFallbackEmoji, getFallbackSvgUrl, getFallbackImageUrl } from '../data/visual-map.ts';
import { saveSession, recordOutcome } from '../utils/session-history.ts';
import { attachTooltips    } from '../utils/word-tooltip.ts';
import { buildScorePills, scorePct } from '../ui/score-pills.ts';
import type { Word }        from '../types.ts';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WordWithVisual extends Word {
  _emoji:    string | null;
  _imageUrl: string | null;  // local Wikipedia photo — highest priority
}

interface CardEntry {
  card: HTMLDivElement;
  inp:  HTMLInputElement;
  word: WordWithVisual;
}

interface RenderPictureModeOptions {
  words:     Word[];
  container: HTMLElement;
  lang?:     string;
  mode?:     'type' | 'flashcard' | 'click';
  /**
   * Extra illustrated words to draw click-mode distractors from.
   *
   * The quiz set is capped at the requested word count, so "Top 4" would
   * otherwise leave three decoys at most — and "Top 1" none at all, making the
   * single option correct by default. Distractors are never scored, so pulling
   * them from outside the quiz set costs nothing.
   */
  distractorWords?: Word[];
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function normalise(str = ''): string {
  return str.trim().toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

function wordIsCorrect(input: string, word: WordWithVisual): boolean {
  const attempt = normalise(input);
  return !!attempt && normalise(word.word) === attempt;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Returns all available visuals for a word, in priority order:
// local photo → SVG → DB emoji → visual-map emoji (deduped)
type VisualBuilder = () => HTMLElement;

function buildAllVisuals(word: WordWithVisual): VisualBuilder[] {
  const builders: VisualBuilder[] = [];

  if (word._imageUrl) {
    const src = word._imageUrl;
    builders.push(() => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';  // never reveal the answer via alt text
      img.className = 'picture-card-photo';
      return img;
    });
  }

  if (word.svg_url) {
    const src = word.svg_url;
    builders.push(() => {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';  // never reveal the answer via alt text
      return img;
    });
  }

  // Emojis — deduplicated (DB emoji first, then visual-map fallback)
  const seen = new Set<string>();
  for (const e of [word.emoji, word._emoji]) {
    if (e && !seen.has(e)) {
      seen.add(e);
      const char = e;
      builders.push(() => {
        const span = document.createElement('span');
        span.className   = 'picture-card-emoji';
        span.textContent = char;
        return span;
      });
    }
  }

  return builders;
}

// Mounts a visual cycler into imgWrap.
// If only one visual: renders it directly with no arrows.
// If multiple: renders left/right arrows to cycle through them.
// Images that fail to load auto-advance to the next visual.
function mountVisualCycler(imgWrap: HTMLElement, builders: VisualBuilder[]): void {
  if (builders.length === 0) return;

  if (builders.length === 1) {
    const el = builders[0]();
    if (el instanceof HTMLImageElement) {
      el.onerror = () => { el.style.display = 'none'; };
    }
    imgWrap.appendChild(el);
    return;
  }

  let idx = 0;
  let errorCount = 0;  // guard against infinite loop if all images fail

  const inner = document.createElement('div');
  inner.className = 'vc-inner';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'vc-arrow vc-prev';
  prevBtn.innerHTML = '&#8592;';
  prevBtn.setAttribute('aria-label', 'Previous image');
  prevBtn.type = 'button';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'vc-arrow vc-next';
  nextBtn.innerHTML = '&#8594;';
  nextBtn.setAttribute('aria-label', 'Next image');
  nextBtn.type = 'button';

  const visualEl = document.createElement('div');
  visualEl.className = 'vc-visual';

  const dotsEl = document.createElement('div');
  dotsEl.className = 'vc-dots';
  for (let i = 0; i < builders.length; i++) {
    const dot = document.createElement('span');
    dot.className = 'vc-dot';
    dotsEl.appendChild(dot);
  }

  function render(): void {
    visualEl.innerHTML = '';
    const el = builders[idx]();
    // If an image fails to load, skip to the next visual automatically
    if (el instanceof HTMLImageElement) {
      el.onerror = () => {
        if (errorCount++ < builders.length) {
          idx = (idx + 1) % builders.length;
          render();
        }
      };
    } else {
      errorCount = 0; // reset once we hit a non-image (emoji) that can't fail
    }
    visualEl.appendChild(el);
    dotsEl.querySelectorAll<HTMLSpanElement>('.vc-dot').forEach((d, i) => {
      d.classList.toggle('vc-dot-active', i === idx);
    });
  }

  prevBtn.addEventListener('click', e => {
    e.stopPropagation();
    errorCount = 0;
    idx = (idx - 1 + builders.length) % builders.length;
    render();
  });
  nextBtn.addEventListener('click', e => {
    e.stopPropagation();
    errorCount = 0;
    idx = (idx + 1) % builders.length;
    render();
  });

  inner.append(prevBtn, visualEl, nextBtn);
  imgWrap.append(inner, dotsEl);
  render();
}

// ── Style injection (runs once) ────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById('picture-click-styles')) return;
  const s = document.createElement('style');
  s.id = 'picture-click-styles';
  s.textContent = `
    /* ── Click mode layout ── */
    /* Four cards on one row from 900px up, so the wrap has to be wide enough
       to give each of them real size. 520px was sized for the old 2x2 grid
       and squeezed four cards into ~110px each. */
    .pm-click-wrap {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
    /* Type from .ui-stat in shared/components.css. */
    .pm-click-counter {
      text-align: center;
      margin-bottom: 0.75rem;
    }
    .pm-click-prompt {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    /* The target-language word, styled as it is everywhere else in the app:
       DM Mono in the accent colour, same as .conj-verb-spanish and the table
       mode word cells. */
    .pm-click-word {
      font-family: 'DM Mono', monospace;
      font-size: 2.2rem;
      font-weight: 700;
      color: var(--accent);
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .pm-click-sub {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 0.3rem;
    }
    .pm-click-nav {
      display: flex;
      gap: 0.4rem;
      margin-right: auto;
    }
    .pm-nav-btn {
      font-family: 'Sora', sans-serif;
      font-size: 0.78rem;
      padding: 0.3rem 0.7rem;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
    }
    .pm-nav-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .pm-nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Back/Next on the left (via margin-right:auto on .pm-click-nav),
       Give Up on the right. Mirrors table mode's controls row. */
    .pm-click-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding-bottom: 0.6rem;
      margin-bottom: 0.75rem;
      border-bottom: 1px solid var(--border);
    }

    .pm-click-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      /* Centred as a block: with four wide cards the grid is narrower than
         .pm-click-wrap on a big screen, and left-aligned it sat off to one
         side of the prompt above it. */
      justify-content: center;
      width: 100%;
      margin: 0 auto;
    }
    /* All four in one row from tablet up. At 2x2 with a 110px card the
       photos were barely readable. */
    @media (min-width: 900px) {
      .pm-click-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
    .pm-click-card {
      border: 2px solid var(--border, #d1d5db);
      border-radius: var(--radius, 12px);
      padding: 1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      /* Square, so the image gets real height rather than a letterbox. */
      aspect-ratio: 1;
      background: var(--card-bg, var(--surface, #fff));
      box-shadow: var(--shadow-sm);
      transition: border-color 0.12s, transform 0.1s, background 0.12s,
                  box-shadow 0.12s;
      user-select: none;
    }
    /* Desktop: give the photo room. Was min-height 200px, which at four
       across on a wide screen left most of the card empty around a small
       image. */
    @media (min-width: 900px) {
      .pm-click-card { min-height: 240px; }
    }
    @media (max-width: 899px) {
      .pm-click-card { min-height: 180px; }
    }
    .pm-click-card:hover:not(.pm-locked) { box-shadow: var(--shadow); }
    .pm-click-card:hover:not(.pm-locked) {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    .pm-click-card .picture-card-img {
      width: 100%;
      height: 100%;
    }
    .pm-click-card img {
      /* Was capped at 72px, sized for the old 110px card. That cap, not the
         card size, is why the photos looked tiny. */
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
    }
    .pm-click-card .picture-card-emoji {
      /* Scaled with the card — was 3rem for the 110px version. */
      font-size: 5.5rem;
      line-height: 1;
    }
    @media (max-width: 899px) {
      .pm-click-card .picture-card-emoji { font-size: 4rem; }
    }
    /* Green / red match the correct and missed states everywhere else —
       same tokens the table cells, conjugation inputs and score pills use. */
    .pm-click-card.pm-correct {
      border-color: var(--correct);
      background: var(--correct-light);
    }
    .pm-click-card.pm-wrong {
      border-color: var(--incorrect, var(--danger));
      background: var(--incorrect-light, var(--danger-light));
    }
    .pm-click-card.pm-reveal {
      border-color: var(--correct);
      background: color-mix(in srgb, var(--correct) 8%, transparent);
      opacity: 0.7;
    }
    .pm-click-card.pm-locked {
      cursor: default;
    }
    .pm-click-feedback {
      text-align: center;
      margin-top: 0.9rem;
      font-size: 0.95rem;
      font-weight: 600;
      min-height: 1.4rem;
      color: var(--text-muted, #6b7280);
    }
    .pm-click-feedback.ok  { color: var(--correct); }
    .pm-click-feedback.bad { color: var(--incorrect, var(--danger)); }
    /* Colours and states from .ui-btn-danger, same as every other Give Up. */
    .pm-giveup-btn {
      padding: 0.45rem 1rem;
      font-size: 0.875rem;
    }
    .pm-click-done {
      text-align: center;
      padding: 2rem 1rem;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    .pm-click-done h3 {
      font-size: 1.6rem;
      margin-bottom: 0.4rem;
    }
    .pm-click-done p {
      color: var(--text-muted);
      margin-bottom: 1.25rem;
    }
    .pm-click-done button {
      font-family: 'Sora', sans-serif;
      padding: 0.5rem 1.5rem;
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: var(--radius-sm);
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 600;
    }
  `;
  document.head.appendChild(s);
}

// ── Summary helpers ────────────────────────────────────────────────────────────

/** When the current picture session began, for the elapsed-time record. */
let pictureStartedAt = Date.now();
let pictureRecorded  = false;

/**
 * Fold a finished picture session into the shared history and miss tally.
 *
 * Picture mode reports completion from several places (typed give-up, typed
 * all-correct, flashcard, click), so this guards against double-recording the
 * same session.
 */
function recordPictureSession(
  lang: string, correctWords: string[], missedWords: string[], total: number,
): void {
  if (pictureRecorded) return;
  pictureRecorded = true;
  recordOutcome(lang, missedWords, correctWords);
  saveSession(lang, {
    at: new Date().toISOString(),
    mode: 'picture',
    total,
    correct: correctWords.length,
    unassisted: correctWords.length,   // no per-word hints in picture mode
    hints: 0,
    revealed: missedWords.length,
    seconds: Math.max(1, Math.round((Date.now() - pictureStartedAt) / 1000)),
  });
}

function showPictureSummary(correct: number, total: number): void {
  const missed = total - correct;
  const pct    = total > 0 ? Math.round((correct / total) * 100) : 0;
  const html   =
    `<span class="summary-correct">✓ ${correct} correct</span>` +
    `<span class="summary-missed">✗ ${missed} missed</span>` +
    `<span class="summary-pct">${pct}%</span>`;
  ['pictureSummaryTop', 'pictureSummaryBottom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'flex'; el.innerHTML = html; }
  });
}

function clearPictureSummary(): void {
  ['pictureSummaryTop', 'pictureSummaryBottom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  });
}

// ── Progress bar helpers ───────────────────────────────────────────────────────

/**
 * Paint the three-segment bar and the score pills, top and bottom.
 *
 * Same components table and conjugation mode use — green `.bar`, yellow
 * `.bar-revealed`, red `.bar-missed` laid end to end, with `buildScorePills`
 * underneath. Picture mode used to have a single green bar and a bare "3 / 20"
 * caption, so the same session looked like a different app depending on which
 * tab you were on.
 *
 * `revealed` covers answers filled in by Give Up; `missed` covers a wrong pick
 * in click mode. A mode that cannot produce one of them just passes 0.
 */
function setProgress(correct: number, total: number, revealed = 0, missed = 0): void {
  const counts = {
    correct, revealed, missed,
    left: Math.max(0, total - correct - revealed - missed),
    total,
  };

  const pct = (n: number): number => scorePct(n, total);
  const g = pct(correct), y = pct(revealed), r = pct(missed);
  const done = correct + revealed + missed;

  ([['Top', 'pictureScoreTop'], ['Bottom', 'pictureScoreBottom']] as const).forEach(([pos, scoreId]) => {
    const green  = document.getElementById(`pictureBar${pos}`);
    const yellow = document.getElementById(`pictureBar${pos}Revealed`);
    const red    = document.getElementById(`pictureBar${pos}Missed`);
    const stat   = document.getElementById(`pictureStats${pos}`);
    const score  = document.getElementById(scoreId);

    if (green)  green.style.width  = g + '%';
    if (yellow) { yellow.style.left = g + '%';       yellow.style.width = y + '%'; }
    if (red)    { red.style.left    = (g + y) + '%'; red.style.width    = r + '%'; }

    if (stat) {
      stat.textContent = total > 0 ? `${done} / ${total}` : '';
      stat.classList.toggle('progress-label--done', total > 0 && done === total);
    }
    if (score) score.innerHTML = buildScorePills(counts);
  });
}

// ── Type-the-word mode (original) ─────────────────────────────────────────────

function renderTypeMode(wordsWithVisuals: WordWithVisual[], container: HTMLElement,
                        lang: string): void {
  container.innerHTML = '';
  clearPictureSummary();

  if (wordsWithVisuals.length === 0) {
    container.innerHTML = `
      <div class="picture-empty">
        <p>📷 No pictures available for the current word set.</p>
        <p>Try selecting a different language or expanding the word count.</p>
      </div>`;
    return;
  }

  const grid  = document.createElement('div');
  grid.className = 'picture-grid';
  const cards: CardEntry[] = [];

  wordsWithVisuals.forEach(word => {
    const card = document.createElement('div');
    card.className = 'picture-card';
    card.dataset.wordJson = JSON.stringify(word);

    const imgWrap = document.createElement('div');
    imgWrap.className = 'picture-card-img';
    mountVisualCycler(imgWrap, buildAllVisuals(word));

    const inp = document.createElement('input');
    inp.type        = 'text';
    inp.className   = 'picture-card-input';
    inp.placeholder = '…';
    inp.dataset.word = word.word;
    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('spellcheck', 'false');

    inp.addEventListener('input', () => {
      if (wordIsCorrect(inp.value, word)) {
        inp.value    = word.word;
        inp.disabled = true;
        card.classList.add('correct');
        inp.classList.add('correct');

        const allInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[data-word]'));
        const next = allInputs.slice(allInputs.indexOf(inp) + 1).find(i => !i.disabled);
        if (next) next.focus();

        updateTypeProgress();
      }
    });

    card.appendChild(imgWrap);
    card.appendChild(inp);
    grid.appendChild(card);
    cards.push({ card, inp, word });
  });

  const bar = document.createElement('div');
  bar.className = 'picture-controls-bar';

  const giveUpBtn = document.createElement('button');
  giveUpBtn.className   = 'picture-give-up-btn';
  giveUpBtn.textContent = 'Give Up';
  giveUpBtn.addEventListener('click', () => {
    const typedCorrect = cards.filter(({ inp }) => inp.classList.contains('correct')).length;
    cards.forEach(({ card, inp, word }) => {
      if (!inp.disabled) {
        inp.value    = word.word;
        inp.disabled = true;
        card.classList.add('revealed');
        inp.classList.add('revealed');
      }
    });
    giveUpBtn.disabled = true;
    updateTypeProgress();
    recordPictureSession(
      lang,
      cards.filter(c => c.inp.classList.contains('correct')).map(c => c.word.word),
      cards.filter(c => !c.inp.classList.contains('correct')).map(c => c.word.word),
      cards.length,
    );
    showPictureSummary(typedCorrect, cards.length);
  });

  bar.appendChild(giveUpBtn);
  container.appendChild(bar);
  container.appendChild(grid);
  attachTooltips(grid, { hideWordWhenUnrevealed: true });

  updateTypeProgress();
  const first = container.querySelector<HTMLInputElement>('input[data-word]');
  if (first) first.focus();

  function updateTypeProgress(): void {
    const correct  = cards.filter(({ inp }) => inp.classList.contains('correct')).length;
    // Give Up fills the rest in; those are revealed, not missed, and are the
    // yellow segment of the bar.
    const revealed = cards.filter(({ inp }) => inp.classList.contains('revealed')).length;
    setProgress(correct, cards.length, revealed);
    if (correct === cards.length) {
      giveUpBtn.disabled = true;
      recordPictureSession(lang, cards.map(c => c.word.word), [], cards.length);
      showPictureSummary(correct, cards.length);
    }
  }
}

// ── Flashcard (carousel) mode ──────────────────────────────────────────────────

function renderFlashcardMode(wordsWithVisuals: WordWithVisual[], container: HTMLElement,
                             lang: string): void {
  container.innerHTML = '';
  clearPictureSummary();

  if (wordsWithVisuals.length === 0) {
    container.innerHTML = `
      <div class="picture-empty">
        <p>📷 No pictures available for the current word set.</p>
        <p>Try selecting a different language or expanding the word count.</p>
      </div>`;
    return;
  }

  const words  = wordsWithVisuals;
  let   idx    = 0;
  const states = words.map(() => ({ correct: false, revealed: false, value: '' }));

  // ── Outer wrap ──────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'fc-wrap';

  // ── Top controls bar ────────────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.className = 'fc-bar';

  const giveUpBtn = document.createElement('button');
  giveUpBtn.className   = 'picture-give-up-btn';
  giveUpBtn.textContent = 'Give Up';

  const counter = document.createElement('span');
  counter.className = 'fc-counter';

  bar.append(giveUpBtn, counter);

  // ── Card row: prev arrow + card + next arrow ─────────────────────────────
  const row = document.createElement('div');
  row.className = 'fc-row';

  const prevBtn = document.createElement('button');
  prevBtn.className   = 'fc-arrow fc-prev';
  prevBtn.innerHTML   = '&#8592;';
  prevBtn.setAttribute('aria-label', 'Previous');

  const nextBtn = document.createElement('button');
  nextBtn.className   = 'fc-arrow fc-next';
  nextBtn.innerHTML   = '&#8594;';
  nextBtn.setAttribute('aria-label', 'Next');

  const cardWrap = document.createElement('div');
  cardWrap.className = 'fc-card-wrap';

  row.append(prevBtn, cardWrap, nextBtn);

  // ── Input ────────────────────────────────────────────────────────────────
  const inputWrap = document.createElement('div');
  inputWrap.className = 'fc-input-wrap';

  const inp = document.createElement('input');
  inp.type        = 'text';
  inp.className   = 'picture-card-input fc-input';
  inp.placeholder = '…';
  inp.setAttribute('autocomplete', 'off');
  inp.setAttribute('spellcheck',   'false');

  inputWrap.appendChild(inp);

  wrap.append(bar, row, inputWrap);
  container.appendChild(wrap);

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderCurrent(): void {
    const word  = words[idx];
    const state = states[idx];

    // Counter
    counter.textContent = `${idx + 1} / ${words.length}`;

    // Arrows: always enabled (wrap-around)
    prevBtn.disabled = false;
    nextBtn.disabled = false;

    // Card visual
    cardWrap.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'fc-card';
    if (state.correct)  card.classList.add('correct');
    if (state.revealed) card.classList.add('revealed');

    const imgWrap = document.createElement('div');
    imgWrap.className = 'picture-card-img';
    mountVisualCycler(imgWrap, buildAllVisuals(word));
    card.appendChild(imgWrap);
    cardWrap.appendChild(card);

    // Input state
    inp.value    = state.value;
    inp.disabled = state.correct || state.revealed;
    inp.className = 'picture-card-input fc-input' +
      (state.correct  ? ' correct'  : '') +
      (state.revealed ? ' revealed' : '');
    inp.dataset.word = word.word;

    updateProgress();

    if (!inp.disabled) inp.focus();
  }

  function updateProgress(): void {
    const correct  = states.filter(s => s.correct).length;
    const revealed = states.filter(s => !s.correct && s.revealed).length;
    setProgress(correct, words.length, revealed);
    const allDone = states.every(s => s.correct || s.revealed);
    giveUpBtn.disabled = allDone;
    if (allDone) {
      recordPictureSession(
        lang,
        words.filter((_, i) => states[i].correct).map(w => w.word),
        words.filter((_, i) => !states[i].correct).map(w => w.word),
        words.length,
      );
      showPictureSummary(correct, words.length);
    }
  }

  // ── Events ────────────────────────────────────────────────────────────────
  inp.addEventListener('input', () => {
    const word  = words[idx];
    const state = states[idx];
    if (state.correct || state.revealed) return;
    state.value = inp.value;
    if (wordIsCorrect(inp.value, word)) {
      state.correct = true;
      state.value   = word.word;
      renderCurrent();
      // Auto-advance to next unanswered after a short delay
      const nextUnanswered = (() => {
        for (let i = 1; i <= words.length; i++) {
          const ni = (idx + i) % words.length;
          if (!states[ni].correct && !states[ni].revealed) return ni;
        }
        return -1;
      })();
      if (nextUnanswered !== -1) {
        setTimeout(() => { idx = nextUnanswered; renderCurrent(); }, 600);
      }
    }
  });

  prevBtn.addEventListener('click', () => {
    idx = (idx - 1 + words.length) % words.length;
    renderCurrent();
  });

  nextBtn.addEventListener('click', () => {
    idx = (idx + 1) % words.length;
    renderCurrent();
  });

  // Keyboard arrow support
  document.addEventListener('keydown', onKey);
  function onKey(e: KeyboardEvent): void {
    if (!container.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (e.target === inp) return; // don't hijack while typing
    if (e.key === 'ArrowLeft')  { prevBtn.click(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { nextBtn.click(); e.preventDefault(); }
  }

  giveUpBtn.addEventListener('click', () => {
    states.forEach((s, i) => {
      if (!s.correct) { s.revealed = true; s.value = words[i].word; }
    });
    states[idx].value = words[idx].word;
    renderCurrent();
  });

  renderCurrent();
}

// ── Click-the-picture mode ─────────────────────────────────────────────────────

function renderClickMode(
  wordsWithVisuals: WordWithVisual[],
  container: HTMLElement,
  onPlayAgain: () => void,
  /** Illustrated words available as decoys. A superset of the quiz set. */
  distractorPool: WordWithVisual[] = wordsWithVisuals,
): void {
  if (wordsWithVisuals.length === 0) {
    container.innerHTML = `
      <div class="picture-empty">
        <p>📷 No pictures available for the current word set.</p>
      </div>`;
    return;
  }

  clearPictureSummary();

  const queue  = shuffle(wordsWithVisuals);
  let idx      = 0;
  let correct  = 0;

  // Decoys come from the wider illustrated pool, not the quiz set, so a
  // four-option grid is always possible no matter how small the quiz is. The
  // quiz words are folded in and de-duplicated by word so a decoy can still be
  // another word you are being tested on.
  const seen: Record<string, true> = {};
  const decoyPool: WordWithVisual[] = [...wordsWithVisuals, ...distractorPool]
    .filter(w => (seen[w.word] ? false : (seen[w.word] = true)));

  /**
   * What was picked for each question, so a card can be revisited without
   * losing its outcome. null means unanswered.
   */
  const results: ({ chosen: string; right: boolean } | null)[] = queue.map(() => null);
  const answeredAt = (i: number): boolean => results[i] !== null;

  /** A wrong pick is a miss, not a reveal — there is no hint to take here. */
  function syncProgress(): void {
    setProgress(correct, queue.length, 0, results.filter(r => r !== null && !r.right).length);
  }

  syncProgress();

  const wrap = document.createElement('div');
  wrap.className = 'pm-click-wrap';

  // ── Give Up at the top ──────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'pm-click-header';

  const giveUpBtn = document.createElement('button');
  giveUpBtn.className   = 'pm-giveup-btn';
  giveUpBtn.textContent = 'Give Up';
  giveUpBtn.addEventListener('click', () => {
    giveUpBtn.disabled = true;
    showDone();
  });

  // Back / forward. Answered cards are re-shown in their answered state, so
  // you can look at what you got wrong without it counting twice.
  const prevBtn = document.createElement('button');
  prevBtn.className   = 'pm-nav-btn';
  prevBtn.textContent = '\u2190 Back';
  prevBtn.addEventListener('click', () => { if (idx > 0) { idx--; renderCard(queue[idx]); } });

  const nextBtn = document.createElement('button');
  nextBtn.className   = 'pm-nav-btn';
  nextBtn.textContent = 'Next \u2192';
  nextBtn.addEventListener('click', () => {
    if (idx < queue.length - 1) { idx++; renderCard(queue[idx]); }
    else if (results.every(r => r !== null)) showDone();
  });

  const nav = document.createElement('div');
  nav.className = 'pm-click-nav';
  nav.append(prevBtn, nextBtn);

  header.append(nav, giveUpBtn);

  // ── Rest of layout ──────────────────────────────────────────────────────────
  const counter = document.createElement('div');
  counter.className = 'pm-click-counter';

  const prompt = document.createElement('div');
  prompt.className = 'pm-click-prompt';

  const wordEl = document.createElement('div');
  wordEl.className = 'pm-click-word';

  const subEl = document.createElement('div');
  subEl.className = 'pm-click-sub';
  subEl.textContent = 'Click the matching picture';

  prompt.append(wordEl, subEl);

  const clickGrid = document.createElement('div');
  clickGrid.className = 'pm-click-grid';

  const feedback = document.createElement('div');
  feedback.className = 'pm-click-feedback';

  wrap.append(header, counter, prompt, clickGrid, feedback);
  container.appendChild(wrap);

  function renderCard(word: WordWithVisual): void {
    const prior = results[idx];
    giveUpBtn.disabled   = false;
    feedback.textContent = '';
    feedback.className   = 'pm-click-feedback';

    syncNav();
    wordEl.textContent  = word.word;

    const distractors = shuffle(decoyPool.filter(w => w.word !== word.word)).slice(0, 3);
    const options     = shuffle([word, ...distractors]);

    clickGrid.innerHTML = '';

    options.forEach(opt => {
      const card = document.createElement('div');
      card.className    = 'pm-click-card';
      card.dataset.word = opt.word;
      const clickImgWrap = document.createElement('div');
      clickImgWrap.className = 'picture-card-img';
      mountVisualCycler(clickImgWrap, buildAllVisuals(opt));
      card.appendChild(clickImgWrap);

      card.addEventListener('click', () => {
        if (answeredAt(idx)) return;
        results[idx] = { chosen: opt.word, right: opt.word === word.word };
        giveUpBtn.disabled = true;   // disable while feedback is showing

        clickGrid.querySelectorAll('.pm-click-card').forEach(c => c.classList.add('pm-locked'));

        if (opt.word === word.word) {
          card.classList.add('pm-correct');
          feedback.textContent = '✓ Correct!';
          feedback.classList.add('ok');
          correct++;
          syncProgress();
        } else {
          card.classList.add('pm-wrong');
          feedback.textContent = `✗  That's "${opt.word}" — the answer was "${word.word}"`;
          feedback.classList.add('bad');
          clickGrid.querySelectorAll<HTMLElement>(`.pm-click-card[data-word="${CSS.escape(word.word)}"]`)
            .forEach(c => c.classList.add('pm-reveal'));
          syncProgress();
        }

        // Auto-advance, but only off the end of unanswered questions — going
        // back to review should not immediately bounce you forward again.
        const delay = opt.word === word.word ? 650 : 1100;
        setTimeout(() => advance(), delay);
      });

      clickGrid.appendChild(card);
    });

    // Revisiting an answered question: show it as it was left, locked.
    if (prior) {
      clickGrid.querySelectorAll('.pm-click-card').forEach(c => c.classList.add('pm-locked'));
      const chosen = clickGrid.querySelector<HTMLElement>(
        `.pm-click-card[data-word="${CSS.escape(prior.chosen)}"]`);
      chosen?.classList.add(prior.right ? 'pm-correct' : 'pm-wrong');
      if (!prior.right) {
        clickGrid.querySelectorAll<HTMLElement>(
          `.pm-click-card[data-word="${CSS.escape(word.word)}"]`)
          .forEach(c => c.classList.add('pm-reveal'));
        feedback.textContent = `✗  You picked "${prior.chosen}" — the answer was "${word.word}"`;
        feedback.classList.add('bad');
      } else {
        feedback.textContent = '✓ Correct!';
        feedback.classList.add('ok');
      }
    }
  }

  function advance(): void {
    // Jump to the next question that has not been answered yet; if there is
    // none, the round is over.
    const nextUnanswered = results.findIndex((r, i) => r === null && i > idx);
    const anyLeft        = results.some(r => r === null);
    if (!anyLeft) { showDone(); return; }
    idx = nextUnanswered >= 0 ? nextUnanswered : results.findIndex(r => r === null);
    renderCard(queue[idx]);
  }

  /** Enable/disable the nav buttons for the current position. */
  function syncNav(): void {
    prevBtn.disabled = idx === 0;
    nextBtn.disabled = idx >= queue.length - 1 && results.some(r => r === null);
    counter.textContent = `${idx + 1} / ${queue.length}`;
  }

  function showDone(): void {
    const pct = Math.round((correct / queue.length) * 100);
    container.innerHTML = '';

    const done = document.createElement('div');
    done.className = 'pm-click-done';
    done.innerHTML = `<h3>${pct === 100 ? '🎉 Perfect!' : pct >= 70 ? '👍 Nice work!' : '💪 Keep practicing!'}</h3>`;

    const again = document.createElement('button');
    again.textContent = 'Play Again';
    again.addEventListener('click', onPlayAgain);

    done.appendChild(again);
    container.appendChild(done);
    syncProgress();
    showPictureSummary(correct, queue.length);
  }

  renderCard(queue[idx]);
}

// ── Public export ──────────────────────────────────────────────────────────────

export function renderPictureMode({
  words,
  container,
  lang = 'spanish',
  mode = 'type',
  distractorWords = [],
}: RenderPictureModeOptions): void {
  injectStyles();
  container.innerHTML = '';
  setProgress(0, 0);
  pictureStartedAt = Date.now();
  pictureRecorded  = false;

  // Click mode is a narrow centred column, so the section's progress bar and
  // score pills are constrained to the same width. Left full-bleed they ran
  // past both sides of the quiz they describe; matched up they sit directly
  // above the cards, which is where table mode puts its bar.
  document.getElementById('pictureArea')?.classList.toggle('pm-mode-click', mode === 'click');

  /** Attach every visual we can find, then drop anything left with none. */
  function withVisuals(list: Word[]): WordWithVisual[] {
    return list
      .map(w => ({
        ...w,
        // 1. Local Wikipedia photo (highest quality)
        _imageUrl: getFallbackImageUrl(lang, w.word),
        // 2. SVG: server concept map → openmoji local/CDN fallback
        svg_url: w.svg_url || getFallbackSvgUrl(lang, w.word) || null,
        // 3. Emoji fallback (visual-map curated only — not DB emojis)
        _emoji: getFallbackEmoji(lang, w.word),
      }))
      .filter((w): w is WordWithVisual => !!(w._imageUrl || w.svg_url || w._emoji));
  }

  const wordsWithVisuals = withVisuals(words);

  if (mode === 'click') {
    // Resolved once rather than per question — this is every illustrated word
    // in the language, and the visual lookup is not free.
    const decoys = withVisuals(distractorWords);
    function playAgain(): void {
      container.innerHTML = '';
      setProgress(0, 0);
      renderClickMode(wordsWithVisuals, container, playAgain, decoys);
    }
    renderClickMode(wordsWithVisuals, container, playAgain, decoys);
  } else if (mode === 'flashcard') {
    renderFlashcardMode(wordsWithVisuals, container, lang);
  } else {
    renderTypeMode(wordsWithVisuals, container, lang);
  }
}
