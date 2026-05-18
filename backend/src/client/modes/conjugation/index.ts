/**
 * conjugation/index.ts
 *
 * Renders the conjugation drill grid and wires up Give Up / tense / display
 * controls. Pronoun data and control-bar logic live in their own modules.
 */

import type { Word } from '../../types.js';
import { PRONOUNS, TENSE_DEFS } from './data.js';
import {
  setProgressCallback,
  applyAllPronounToggles,
} from './controls.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConjugationModeOptions {
  words:     Word[];
  container: HTMLElement;
  lang?:     string;
}

interface CardController {
  card:          HTMLElement;
  updateHeader:  () => void;
  updateInputs:  () => void;
  revealAnswers: () => void;
}

// ── Module state ───────────────────────────────────────────────────────────────

let _cleanup: (() => void) | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.trim().toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// ── Main export ───────────────────────────────────────────────────────────────

export function renderConjugationMode({ words, container, lang = 'spanish' }: ConjugationModeOptions): void {
  if (_cleanup) { _cleanup(); _cleanup = null; }
  setProgressCallback(null);

  container.innerHTML = '';

  const verbs = words.filter(w => w.pos === 'verb');

  if (verbs.length === 0) {
    container.innerHTML = `
      <div class="conj-empty">
        <p>No verbs in the current word list.</p>
        <p class="conj-empty-hint">Make sure "Verbs" is checked in the class filter, then hit Start Quiz again.</p>
      </div>`;
    return;
  }

  const pronouns  = PRONOUNS[lang]   ?? PRONOUNS.spanish;
  const tenseDefs = TENSE_DEFS[lang] ?? TENSE_DEFS.spanish;

  // ── External controls ──────────────────────────────────────────────────────
  const tenseSelect   = document.getElementById('conjTenseSelect') as HTMLSelectElement | null;
  const displayToggle = document.getElementById('conjDisplayToggle');

  function getTenseKey(): string    { return tenseSelect?.value ?? tenseDefs[0].key; }
  function getDisplayMode(): string {
    return displayToggle?.querySelector<HTMLElement>('.conj-toggle-btn.active')?.dataset.mode ?? 'both';
  }

  // ── Progress section ───────────────────────────────────────────────────────
  const progressSection = document.createElement('div');
  progressSection.className = 'conj-progress-section';

  const barsWrap = document.createElement('div');
  barsWrap.className = 'conj-prog-bars';

  function makeBar(labelText: string): { fill: HTMLElement; stat: HTMLElement } {
    const row   = document.createElement('div');
    row.className = 'conj-prog-row';
    const label = document.createElement('span');
    label.className   = 'conj-prog-label';
    label.textContent = labelText;
    const track = document.createElement('div');
    track.className = 'conj-prog-track';
    const fill = document.createElement('div');
    fill.className = 'conj-prog-fill';
    track.appendChild(fill);
    const stat = document.createElement('span');
    stat.className = 'conj-prog-stat';
    row.append(label, track, stat);
    barsWrap.appendChild(row);
    return { fill, stat };
  }

  const { fill: verbsFill, stat: verbsStat } = makeBar('Verbs');
  const { fill: formsFill, stat: formsStat } = makeBar('Forms');

  const giveUpBtn = document.createElement('button');
  giveUpBtn.className   = 'conj-giveup-btn';
  giveUpBtn.textContent = 'Give Up';

  progressSection.append(barsWrap, giveUpBtn);

  // ── Cards grid ─────────────────────────────────────────────────────────────
  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'conj-cards-grid';

  // updateProgress defined after cardsGrid exists so cards can reference it
  function updateProgress(): void {
    let totalForms = 0, correctForms = 0, completeVerbs = 0;

    cardsGrid.querySelectorAll('.conj-card').forEach(card => {
      let cardTotal = 0, cardCorrect = 0;
      card.querySelectorAll('.conj-row:not(.conj-row-hidden)').forEach(row => {
        const inp = row.querySelector<HTMLInputElement>('.conj-drill-input');
        if (!inp) return;
        cardTotal++;
        if (inp.classList.contains('correct')) cardCorrect++;
      });
      totalForms   += cardTotal;
      correctForms += cardCorrect;
      if (cardTotal > 0 && cardCorrect === cardTotal) completeVerbs++;
    });

    const nVerbs = cardsGrid.querySelectorAll('.conj-card').length;
    verbsFill.style.width = (nVerbs     ? (completeVerbs / nVerbs)    * 100 : 0) + '%';
    formsFill.style.width = (totalForms ? (correctForms  / totalForms) * 100 : 0) + '%';
    verbsStat.textContent = `${completeVerbs} / ${nVerbs} complete`;
    formsStat.textContent = `${correctForms} / ${totalForms} correct`;
  }

  // Pass updateProgress into each card so correct answers trigger it directly
  const cardUpdaters: CardController[] = [];
  verbs.forEach(verb => {
    const updater = buildCard(verb, pronouns, getTenseKey, getDisplayMode, updateProgress);
    cardsGrid.appendChild(updater.card);
    cardUpdaters.push(updater);
  });

  container.append(progressSection, cardsGrid);

  applyAllPronounToggles(cardsGrid);

  // Share updateProgress with conjugation-controls so pronoun toggles can call it
  setProgressCallback(updateProgress);
  updateProgress();

  // ── Give Up ────────────────────────────────────────────────────────────────
  giveUpBtn.addEventListener('click', () => {
    cardUpdaters.forEach(u => u.revealAnswers());
    giveUpBtn.disabled = true;
    updateProgress();
  });

  // ── External control listeners ─────────────────────────────────────────────
  const handleTenseChange = (): void => {
    giveUpBtn.disabled = false;
    cardUpdaters.forEach(u => u.updateInputs());
    applyAllPronounToggles(cardsGrid);
    updateProgress();
  };

  const handleDisplayClick = (e: Event): void => {
    const btn = (e.target as Element).closest<HTMLElement>('.conj-toggle-btn');
    if (!btn || !displayToggle?.contains(btn)) return;
    displayToggle.querySelectorAll('.conj-toggle-btn')
      .forEach(b => b.classList.toggle('active', b === btn));
    cardUpdaters.forEach(u => u.updateHeader());
  };

  tenseSelect?.addEventListener('change', handleTenseChange);
  displayToggle?.addEventListener('click', handleDisplayClick);

  _cleanup = (): void => {
    tenseSelect?.removeEventListener('change', handleTenseChange);
    displayToggle?.removeEventListener('click', handleDisplayClick);
    setProgressCallback(null);
  };
}

// ── Card builder ──────────────────────────────────────────────────────────────

function buildCard(
  verb:           Word,
  pronouns:       string[],
  getTenseKey:    () => string,
  getDisplayMode: () => string,
  onProgress:     () => void,
): CardController {
  const card = document.createElement('div');
  card.className = 'conj-card';

  const header = document.createElement('div');
  header.className = 'conj-card-header';
  const targetEl  = document.createElement('div');
  targetEl.className = 'conj-verb-spanish';
  const englishEl = document.createElement('div');
  englishEl.className = 'conj-verb-english';
  header.append(targetEl, englishEl);

  function updateHeader(): void {
    const mode = getDisplayMode();
    targetEl.textContent  = verb.word;
    englishEl.textContent = verb.display || verb.glosses?.join(', ') || '';
    targetEl.hidden  = mode === 'english';
    englishEl.hidden = mode === 'target';
  }

  const innerGrid = document.createElement('div');
  innerGrid.className = 'conj-inner-grid';

  let inputs: HTMLInputElement[] = [];

  pronouns.forEach((pronoun, i) => {
    const row = document.createElement('div');
    row.className  = 'conj-row';
    row.dataset.pi = String(i);

    const label = document.createElement('span');
    label.className   = 'conj-pronoun';
    label.textContent = pronoun;

    const inp = document.createElement('input');
    inp.type           = 'text';
    inp.className      = 'conj-drill-input';
    inp.autocomplete   = 'off';
    inp.autocorrect    = 'off';
    inp.autocapitalize = 'off';
    inp.spellcheck     = false;
    inp.placeholder    = '…';

    row.append(label, inp);
    innerGrid.appendChild(row);
    inputs.push(inp);
  });

  card.append(header, innerGrid);

  function addNav(inp: HTMLInputElement, i: number): void {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        let n = (i + 1) % inputs.length;
        while (inputs[n].disabled && n !== i) n = (n + 1) % inputs.length;
        inputs[n].focus();
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        let p = (i - 1 + inputs.length) % inputs.length;
        while (inputs[p].disabled && p !== i) p = (p - 1 + inputs.length) % inputs.length;
        inputs[p].focus();
      }
    });
  }

  function attachChecking(): void {
    const answers = (verb.linguistic?.conjugations as Record<string, string[]> | null)
      ?.[getTenseKey()] ?? null;

    inputs.forEach((inp, i) => {
      const fresh = inp.cloneNode(true) as HTMLInputElement;
      inp.parentNode!.replaceChild(fresh, inp);
      inputs[i] = fresh;

      addNav(fresh, i);

      fresh.addEventListener('input', () => {
        if (!answers) return;
        const expected = answers[i] ?? '';
        const correct  = normalize(fresh.value) === normalize(expected);
        const was      = fresh.classList.contains('correct');
        fresh.classList.toggle('correct', correct);

        if (correct && !was) {
          fresh.value    = expected;   // restore accented canonical form
          fresh.disabled = true;
          let n = (i + 1) % inputs.length;
          while (inputs[n].disabled && n !== i) n = (n + 1) % inputs.length;
          if (n !== i) inputs[n].focus();
          onProgress();
        }
      });
    });
  }

  function updateInputs(): void {
    inputs.forEach(inp => {
      inp.value    = '';
      inp.disabled = false;
      inp.classList.remove('correct', 'revealed');
    });
    attachChecking();
  }

  function revealAnswers(): void {
    const answers = (verb.linguistic?.conjugations as Record<string, string[]> | null)
      ?.[getTenseKey()] ?? null;
    inputs.forEach((inp, i) => {
      if (!inp.classList.contains('correct') && !inp.classList.contains('revealed')) {
        inp.value = answers?.[i] ?? '—';
        inp.classList.add('revealed');
        inp.disabled = true;
      }
    });
  }

  updateHeader();
  attachChecking();

  return { card, updateHeader, updateInputs, revealAnswers };
}
