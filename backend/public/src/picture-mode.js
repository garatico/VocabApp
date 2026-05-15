/**
 * Picture Quiz Mode
 *
 * Displays all words-with-pictures (SVG or emoji fallback) as a grid of cards.
 * Under each image is a text input; typing the correct target-language word
 * turns the card green automatically.
 *
 * Visual priority per card:
 *   1. word.svg_url   — generated SVG on disk
 *   2. word.emoji     — emoji stored in the database (set via admin panel)
 *   3. getFallbackEmoji(lang, word.word) — hardcoded map in emoji-map.js
 */

import { getFallbackEmoji } from './emoji-map.js';

function normalise(str = '') {
  return str
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics
    .replace(/\s+/g, ' ');
}

/** Check input against the target-language word only (diacritics forgiven). */
function wordIsCorrect(input, word) {
  const attempt = normalise(input);
  if (!attempt) return false;
  return normalise(word.word) === attempt;
}

export function renderPictureMode({ words, container, lang = 'spanish' }) {
  container.innerHTML = '';

  // Resolve the visual for each word: SVG > DB emoji > hardcoded map
  const wordsWithVisuals = words
    .map(w => ({
      ...w,
      _emoji: w.emoji || getFallbackEmoji(lang, w.word),
    }))
    .filter(w => w.svg_url || w._emoji);

  if (wordsWithVisuals.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'picture-empty';
    empty.innerHTML = `
      <p>📷 No pictures available for the current word set.</p>
      <p>Try selecting a different language or expanding the word count.</p>
    `;
    container.appendChild(empty);
    return;
  }

  // ── Grid ───────────────────────────────────────────────────────────
  const grid = document.createElement('div');
  grid.className = 'picture-grid';

  const cards = [];

  wordsWithVisuals.forEach(word => {
    const card = document.createElement('div');
    card.className = 'picture-card';

    // Visual — SVG image takes priority; emoji is the fallback
    const imgWrap = document.createElement('div');
    imgWrap.className = 'picture-card-img';

    if (word.svg_url) {
      const img = document.createElement('img');
      img.src = word.svg_url;
      img.alt = '?';
      imgWrap.appendChild(img);
    } else {
      const emojiEl = document.createElement('span');
      emojiEl.className   = 'picture-card-emoji';
      emojiEl.textContent = word._emoji;
      imgWrap.appendChild(emojiEl);
    }

    // Text input
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'picture-card-input';
    inp.placeholder = '…';
    inp.dataset.word = word.word;
    inp.setAttribute('autocomplete', 'off');
    inp.setAttribute('spellcheck', 'false');

    inp.addEventListener('input', () => {
      if (wordIsCorrect(inp.value, word)) {
        inp.value = word.word;
        inp.disabled = true;
        card.classList.add('correct');
        inp.classList.add('correct');

        // Move focus to next unanswered input
        const allInputs = Array.from(
          container.querySelectorAll('input[data-word]')
        );
        const idx  = allInputs.indexOf(inp);
        const next = allInputs.slice(idx + 1).find(i => !i.disabled);
        if (next) next.focus();

        updateProgress();
      }
    });

    card.appendChild(imgWrap);
    card.appendChild(inp);
    grid.appendChild(card);
    cards.push({ card, inp, word });
  });

  // ── Controls bar (rendered above the grid so it's always visible) ─
  const controlsBar = document.createElement('div');
  controlsBar.className = 'picture-controls-bar';

  const giveUpBtn = document.createElement('button');
  giveUpBtn.className = 'picture-give-up-btn';
  giveUpBtn.textContent = 'Give Up';

  giveUpBtn.addEventListener('click', () => {
    cards.forEach(({ card, inp, word }) => {
      if (!inp.disabled) {
        inp.value = word.word;
        inp.disabled = true;
        card.classList.add('revealed');
        inp.classList.add('revealed');
      }
    });
    giveUpBtn.disabled = true;
    updateProgress();
  });

  controlsBar.appendChild(giveUpBtn);

  container.appendChild(controlsBar);
  container.appendChild(grid);

  // ── Progress ───────────────────────────────────────────────────────
  function updateProgress() {
    const total   = cards.length;
    const correct = cards.filter(({ inp }) =>
      inp.classList.contains('correct')
    ).length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    const barTop      = document.getElementById('pictureBarTop');
    const barBottom   = document.getElementById('pictureBarBottom');
    const statsTop    = document.getElementById('pictureStatsTop');
    const statsBottom = document.getElementById('pictureStatsBottom');

    if (barTop)      barTop.style.width      = pct + '%';
    if (barBottom)   barBottom.style.width   = pct + '%';
    if (statsTop)    statsTop.textContent    = `${correct} / ${total}`;
    if (statsBottom) statsBottom.textContent = `${correct} / ${total}`;

    if (correct === total) giveUpBtn.disabled = true;
  }

  updateProgress();

  // Focus the first unanswered input
  const first = container.querySelector('input[data-word]');
  if (first) first.focus();
}
