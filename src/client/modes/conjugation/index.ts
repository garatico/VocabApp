/**
 * conjugation/index.ts
 */

import type { Word } from '../../types.js';
import { PRONOUNS, TENSE_DEFS } from './data.js';
import {
  setProgressCallback,
  applyAllPronounToggles,
} from './controls.js';
import { buildGlossDisplay } from '../../utils/utils.js';

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

let _cleanup: (() => void) | null = null;

const SINGLE_FORM_TENSES = new Set(['past_participle', 'gerund']);

function isSingleForm(key: string): boolean {
  return SINGLE_FORM_TENSES.has(key);
}

const SINGLE_FORM_ROW_LABEL: Record<string, string> = {
  past_participle: 'participio',
  gerund:          'gerundio',
};

function normalize(s: string): string {
  return s.trim().toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function clearConjSummary(): void {
  ['conjSummaryTop', 'conjSummaryBottom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  });
}

function showConjSummary(completeVerbs: number, nVerbs: number, correctForms: number, totalForms: number): void {
  const verbPct  = nVerbs     ? Math.round((completeVerbs / nVerbs)    * 100) : 0;
  const formPct  = totalForms ? Math.round((correctForms  / totalForms) * 100) : 0;
  const pct      = Math.round((verbPct + formPct) / 2);
  const html =
    '<span class="summary-correct">✓ ' + completeVerbs + ' / ' + nVerbs + ' verbs</span>' +
    '<span class="summary-correct">✓ ' + correctForms + ' / ' + totalForms + ' forms</span>' +
    '<span class="summary-pct">' + pct + '%</span>';
  ['conjSummaryTop', 'conjSummaryBottom'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'flex'; el.innerHTML = html; }
  });
}

export function renderConjugationMode({ words, container, lang = 'spanish' }: ConjugationModeOptions): void {
  if (_cleanup) { _cleanup(); _cleanup = null; }
  setProgressCallback(null);
  clearConjSummary();

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

  const tenseSelect   = document.getElementById('conjTenseSelect') as HTMLSelectElement | null;
  const displayToggle = document.getElementById('conjDisplayToggle');

  function getTenseKey(): string {
    return tenseSelect?.value ?? tenseDefs[0].key;
  }
  function getDisplayMode(): string {
    return displayToggle?.querySelector<HTMLElement>('.conj-toggle-btn.active')?.dataset.mode ?? 'both';
  }

  function syncPronounRowVisibility(): void {
    const single     = isSingleForm(getTenseKey());
    const pronounRow = document.getElementById('conjPronounRow');
    if (pronounRow) pronounRow.hidden = single;
  }

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

  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'conj-cards-grid';

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

    if (totalForms > 0 && correctForms === totalForms) {
      showConjSummary(completeVerbs, nVerbs, correctForms, totalForms);
    }
  }

  const cardUpdaters: CardController[] = [];
  verbs.forEach(verb => {
    const updater = buildCard(verb, pronouns, getTenseKey, getDisplayMode, updateProgress);
    cardsGrid.appendChild(updater.card);
    cardUpdaters.push(updater);
  });

  container.append(progressSection, cardsGrid);

  // Only apply pronoun toggles for conjugation tenses — skipping it in
  // single-form mode prevents applyAllPronounToggles from re-showing the
  // pronoun rows that buildCard already hid via setSingleMode(true).
  if (!isSingleForm(getTenseKey())) {
    applyAllPronounToggles(cardsGrid);
  }
  syncPronounRowVisibility();

  setProgressCallback(updateProgress);
  updateProgress();

  giveUpBtn.addEventListener('click', () => {
    cardUpdaters.forEach(u => u.revealAnswers());
    giveUpBtn.disabled = true;
    updateProgress();
    // Show a summary when giving up (progress may not be 100%)
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
    showConjSummary(completeVerbs, nVerbs, correctForms, totalForms);
  });

  const handleTenseChange = (): void => {
    giveUpBtn.disabled = false;
    clearConjSummary();
    cardUpdaters.forEach(u => u.updateInputs());
    if (!isSingleForm(getTenseKey())) {
      applyAllPronounToggles(cardsGrid);
    }
    syncPronounRowVisibility();
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
    englishEl.textContent = buildGlossDisplay(verb);
    targetEl.hidden  = mode === 'english';
    englishEl.hidden = mode === 'target';
  }

  const innerGrid = document.createElement('div');
  innerGrid.className = 'conj-inner-grid';

  const inputs: HTMLInputElement[] = [];
  const pronounRows: HTMLElement[] = [];

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
    inp.setAttribute("autocorrect", "off");
    inp.setAttribute("autocapitalize", "off");
    inp.spellcheck     = false;
    inp.placeholder    = 'Type conjugation…';

    row.append(label, inp);
    innerGrid.appendChild(row);
    inputs.push(inp);
    pronounRows.push(row);
  });

  // Single-form row (past_participle / gerund)
  const singleFormRow = document.createElement('div');
  singleFormRow.className  = 'conj-row conj-row-hidden';
  singleFormRow.dataset.pi = 'single';

  const singleLabel = document.createElement('span');
  singleLabel.className = 'conj-pronoun';

  let singleInp = document.createElement('input');
  singleInp.type           = 'text';
  singleInp.className      = 'conj-drill-input';
  singleInp.autocomplete   = 'off';
  singleInp.setAttribute("autocorrect", "off");
  singleInp.setAttribute("autocapitalize", "off");
  singleInp.spellcheck     = false;
  singleInp.placeholder    = 'Type conjugation…';

  singleFormRow.append(singleLabel, singleInp);
  innerGrid.appendChild(singleFormRow);

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
    const tenseKey = getTenseKey();

    if (isSingleForm(tenseKey)) {
      const answer = verb.linguistic?.conjugations?.[tenseKey] as string | null ?? null;

      const fresh = singleInp.cloneNode(true) as HTMLInputElement;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      singleInp.parentNode!.replaceChild(fresh, singleInp); // parentNode is non-null: element is attached to the DOM
      singleInp = fresh;

      fresh.addEventListener('input', () => {
        if (!answer) return;
        const correct = normalize(fresh.value) === normalize(answer);
        const was     = fresh.classList.contains('correct');
        fresh.classList.toggle('correct', correct);
        if (correct && !was) {
          fresh.value    = answer;
          fresh.disabled = true;
          onProgress();
        }
      });

    } else {
      const answers = (verb.linguistic?.conjugations as Record<string, string[]> | null)
        ?.[tenseKey] ?? null;

      inputs.forEach((inp, i) => {
        const fresh = inp.cloneNode(true) as HTMLInputElement;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        inp.parentNode!.replaceChild(fresh, inp); // parentNode is non-null: element is attached to the DOM
        inputs[i] = fresh;

        addNav(fresh, i);

        fresh.addEventListener('input', () => {
          if (!answers) return;
          const expected = Array.isArray(answers) ? (answers[i] ?? '') : '';
          const correct  = normalize(fresh.value) === normalize(expected);
          const was      = fresh.classList.contains('correct');
          fresh.classList.toggle('correct', correct);

          if (correct && !was) {
            fresh.value    = expected;
            fresh.disabled = true;
            let n = (i + 1) % inputs.length;
            while (inputs[n].disabled && n !== i) n = (n + 1) % inputs.length;
            if (n !== i) inputs[n].focus();
            onProgress();
          }
        });
      });
    }
  }

  function setSingleMode(single: boolean): void {
    pronounRows.forEach(row => row.classList.toggle('conj-row-hidden', single));
    singleFormRow.classList.toggle('conj-row-hidden', !single);
    if (single) {
      singleLabel.textContent = SINGLE_FORM_ROW_LABEL[getTenseKey()] ?? getTenseKey();
    }
  }

  function updateInputs(): void {
    const single = isSingleForm(getTenseKey());

    inputs.forEach(inp => {
      inp.value    = '';
      inp.disabled = false;
      inp.classList.remove('correct', 'revealed');
    });

    singleInp.value = '';
    singleInp.disabled = false;
    singleInp.classList.remove('correct', 'revealed');

    setSingleMode(single);
    attachChecking();
  }

  function revealAnswers(): void {
    const tenseKey = getTenseKey();

    if (isSingleForm(tenseKey)) {
      if (!singleInp.classList.contains('correct') && !singleInp.classList.contains('revealed')) {
        const answer = verb.linguistic?.conjugations?.[tenseKey] as string | null;
        singleInp.value = answer ?? '—';
        singleInp.classList.add('revealed');
        singleInp.disabled = true;
      }
    } else {
      const answers = (verb.linguistic?.conjugations as Record<string, string[]> | null)
        ?.[tenseKey] ?? null;
      inputs.forEach((inp, i) => {
        if (!inp.classList.contains('correct') && !inp.classList.contains('revealed')) {
          inp.value = (Array.isArray(answers) ? answers[i] : null) ?? '—';
          inp.classList.add('revealed');
          inp.disabled = true;
        }
      });
    }
  }

  setSingleMode(isSingleForm(getTenseKey()));
  updateHeader();
  attachChecking();

  return { card, updateHeader, updateInputs, revealAnswers };
}
