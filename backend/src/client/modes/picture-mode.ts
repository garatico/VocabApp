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

import { getFallbackEmoji, getFallbackSvgUrl } from '../data/visual-map.ts';
import { attachTooltips    } from '../utils/word-tooltip.ts';
import type { Word }        from '../types.ts';

// ── Types ──────────────────────────────────────────────────────────────────────

interface WordWithVisual extends Word {
  _emoji: string | null;
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
  mode?:     'type' | 'click';
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

function buildVisual(word: WordWithVisual): HTMLElement {
  if (word.svg_url) {
    const img = document.createElement('img');
    img.src = word.svg_url;
    img.alt = '?';
    return img;
  }
  const span = document.createElement('span');
  span.className   = 'picture-card-emoji';
  span.textContent = word._emoji ?? '';
  return span;
}

// ── Style injection (runs once) ────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById('picture-click-styles')) return;
  const s = document.createElement('style');
  s.id = 'picture-click-styles';
  s.textContent = `
    /* ── Click mode layout ── */
    .pm-click-wrap {
      max-width: 520px;
      margin: 0 auto;
    }
    .pm-click-counter {
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-muted, #6b7280);
      margin-bottom: 0.75rem;
    }
    .pm-click-prompt {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    .pm-click-word {
      font-size: 2.2rem;
      font-weight: 700;
      color: var(--text, #111);
      line-height: 1.2;
    }
    .pm-click-sub {
      font-size: 0.85rem;
      color: var(--text-muted, #6b7280);
      margin-top: 0.3rem;
    }
    .pm-click-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.85rem;
    }
    .pm-click-card {
      border: 2px solid var(--border, #d1d5db);
      border-radius: 10px;
      padding: 1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 110px;
      background: var(--card-bg, var(--surface, #fff));
      transition: border-color 0.12s, transform 0.1s, background 0.12s;
      user-select: none;
    }
    .pm-click-card:hover:not(.pm-locked) {
      border-color: var(--accent, #4f8ef7);
      transform: translateY(-2px);
    }
    .pm-click-card img {
      max-width: 72px;
      max-height: 72px;
      object-fit: contain;
    }
    .pm-click-card .picture-card-emoji {
      font-size: 3rem;
      line-height: 1;
    }
    .pm-click-card.pm-correct {
      border-color: var(--correct, #22c55e);
      background: color-mix(in srgb, var(--correct, #22c55e) 12%, transparent);
    }
    .pm-click-card.pm-wrong {
      border-color: var(--danger, #ef4444);
      background: color-mix(in srgb, var(--danger, #ef4444) 12%, transparent);
    }
    .pm-click-card.pm-reveal {
      border-color: var(--correct, #22c55e);
      background: color-mix(in srgb, var(--correct, #22c55e) 8%, transparent);
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
    .pm-click-feedback.ok  { color: var(--correct, #22c55e); }
    .pm-click-feedback.bad { color: var(--danger, #ef4444); }
    .pm-click-header {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 0.5rem;
    }
    .pm-giveup-btn {
      padding: 0.3rem 1rem;
      font-size: 0.82rem;
      border: 1px solid var(--border, #d1d5db);
      border-radius: 5px;
      background: transparent;
      color: var(--text-muted, #6b7280);
      cursor: pointer;
      transition: background 0.12s, color 0.12s, border-color 0.12s;
    }
    .pm-giveup-btn:hover { background: var(--danger, #ef4444); color: #fff; border-color: var(--danger, #ef4444); }
    .pm-giveup-btn:disabled { opacity: 0.4; cursor: default; }
    .pm-click-done {
      text-align: center;
      padding: 2rem 1rem;
    }
    .pm-click-done h3 {
      font-size: 1.6rem;
      margin-bottom: 0.4rem;
    }
    .pm-click-done p {
      color: var(--text-muted, #6b7280);
      margin-bottom: 1.25rem;
    }
    .pm-click-done button {
      padding: 0.5rem 1.5rem;
      background: var(--accent, #4f8ef7);
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.95rem;
    }
  `;
  document.head.appendChild(s);
}

// ── Progress bar helpers ───────────────────────────────────────────────────────

function setProgress(correct: number, total: number): void {
  const pct  = total > 0 ? Math.round((correct / total) * 100) : 0;
  const text = `${correct} / ${total}`;
  const barTop      = document.getElementById('pictureBarTop');
  const barBottom   = document.getElementById('pictureBarBottom');
  const statsTop    = document.getElementById('pictureStatsTop');
  const statsBottom = document.getElementById('pictureStatsBottom');
  if (barTop)      (barTop    as HTMLElement).style.width = pct + '%';
  if (barBottom)   (barBottom as HTMLElement).style.width = pct + '%';
  if (statsTop)    statsTop.textContent    = text;
  if (statsBottom) statsBottom.textContent = text;
}

// ── Type-the-word mode (original) ─────────────────────────────────────────────

function renderTypeMode(wordsWithVisuals: WordWithVisual[], container: HTMLElement): void {
  container.innerHTML = '';

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
    imgWrap.appendChild(buildVisual(word));

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
  });

  bar.appendChild(giveUpBtn);
  container.appendChild(bar);
  container.appendChild(grid);
  attachTooltips(grid, { hideWordWhenUnrevealed: true });

  updateTypeProgress();
  const first = container.querySelector<HTMLInputElement>('input[data-word]');
  if (first) first.focus();

  function updateTypeProgress(): void {
    const correct = cards.filter(({ inp }) => inp.classList.contains('correct')).length;
    setProgress(correct, cards.length);
    if (correct === cards.length) giveUpBtn.disabled = true;
  }
}

// ── Click-the-picture mode ─────────────────────────────────────────────────────

function renderClickMode(
  wordsWithVisuals: WordWithVisual[],
  container: HTMLElement,
  onPlayAgain: () => void,
): void {
  if (wordsWithVisuals.length === 0) {
    container.innerHTML = `
      <div class="picture-empty">
        <p>📷 No pictures available for the current word set.</p>
      </div>`;
    return;
  }

  const pool   = wordsWithVisuals;
  const queue  = shuffle(pool);
  let idx      = 0;
  let correct  = 0;
  let answered = false;

  setProgress(0, queue.length);

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
    answered = true;
    showDone();
  });

  header.appendChild(giveUpBtn);

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
    answered             = false;
    giveUpBtn.disabled   = false;
    feedback.textContent = '';
    feedback.className   = 'pm-click-feedback';

    counter.textContent = `${idx + 1} / ${queue.length}`;
    wordEl.textContent  = word.word;

    const distractors = shuffle(pool.filter(w => w.word !== word.word)).slice(0, 3);
    const options     = shuffle([word, ...distractors]);

    clickGrid.innerHTML = '';

    options.forEach(opt => {
      const card = document.createElement('div');
      card.className    = 'pm-click-card';
      card.dataset.word = opt.word;
      card.appendChild(buildVisual(opt));

      card.addEventListener('click', () => {
        if (answered) return;
        answered           = true;
        giveUpBtn.disabled = true;   // disable while feedback is showing

        clickGrid.querySelectorAll('.pm-click-card').forEach(c => c.classList.add('pm-locked'));

        if (opt.word === word.word) {
          card.classList.add('pm-correct');
          feedback.textContent = '✓ Correct!';
          feedback.classList.add('ok');
          correct++;
          setProgress(correct, queue.length);
        } else {
          card.classList.add('pm-wrong');
          feedback.textContent = `✗  That's "${opt.word}" — the answer was "${word.word}"`;
          feedback.classList.add('bad');
          clickGrid.querySelectorAll<HTMLElement>(`.pm-click-card[data-word="${CSS.escape(word.word)}"]`)
            .forEach(c => c.classList.add('pm-reveal'));
        }

        const delay = opt.word === word.word ? 650 : 1100;
        setTimeout(() => advance(), delay);
      });

      clickGrid.appendChild(card);
    });
  }

  function advance(): void {
    idx++;
    if (idx >= queue.length) {
      showDone();
    } else {
      renderCard(queue[idx]);
    }
  }

  function showDone(): void {
    const pct = Math.round((correct / queue.length) * 100);
    container.innerHTML = '';

    const done = document.createElement('div');
    done.className = 'pm-click-done';
    done.innerHTML = `
      <h3>${pct === 100 ? '🎉 Perfect!' : pct >= 70 ? '👍 Nice work!' : '💪 Keep practising!'}</h3>
      <p>${correct} / ${queue.length} correct (${pct}%)</p>
    `;

    const again = document.createElement('button');
    again.textContent = 'Play Again';
    again.addEventListener('click', onPlayAgain);

    done.appendChild(again);
    container.appendChild(done);
    setProgress(correct, queue.length);
  }

  renderCard(queue[idx]);
}

// ── Public export ──────────────────────────────────────────────────────────────

export function renderPictureMode({
  words,
  container,
  lang = 'spanish',
  mode = 'type',
}: RenderPictureModeOptions): void {
  injectStyles();
  container.innerHTML = '';
  setProgress(0, 0);

  const wordsWithVisuals: WordWithVisual[] = words
    .map(w => ({
      ...w,
      // svg_url: server concept map (canonical shared) → per-language file → null
      svg_url: w.svg_url || getFallbackSvgUrl(lang, w.word) || undefined,
      // _emoji: visual-map only — DB emoji (w.emoji) is excluded intentionally.
      // The visual-map is the curated source for picture mode; DB emojis were
      // bulk-seeded and include abstract words that shouldn't appear here.
      _emoji: getFallbackEmoji(lang, w.word),
    }))
    .filter((w): w is WordWithVisual => !!(w.svg_url || w._emoji));

  if (mode === 'click') {
    function playAgain(): void {
      container.innerHTML = '';
      setProgress(0, 0);
      renderClickMode(wordsWithVisuals, container, playAgain);
    }
    renderClickMode(wordsWithVisuals, container, playAgain);
  } else {
    renderTypeMode(wordsWithVisuals, container);
  }
}
