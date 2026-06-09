/**
 * word-tooltip.ts — Hover tooltip for word cards.
 *
 * Exported: attachTooltips(container: HTMLElement)
 *   Scans container for [data-word-json] elements and attaches
 *   mouseenter/mouseleave listeners. Uses a single shared tooltip
 *   element to avoid creating hundreds of DOM nodes.
 */

import type { Word } from '../types.js';
import { buildGlossDisplay } from './utils.js';
import { PRONOUNS as LANG_PRONOUNS, TENSE_DEFS } from '../modes/conjugation/data.js';

/** Build a tense-key -> display-label map for the given language. */
function tenseLabels(lang: string): Record<string, string> {
  const map: Record<string, string> = {};
  (TENSE_DEFS[lang] ?? TENSE_DEFS['spanish']).forEach(d => { map[d.key] = d.label; });
  return map;
}

/** Return the current language from the UI select, defaulting to Spanish. */
function getLang(): string {
  return (document.getElementById('langSelect') as HTMLSelectElement | null)?.value ?? 'spanish';
}

function getPronouns(lang: string): string[] {
  return LANG_PRONOUNS[lang] ?? LANG_PRONOUNS['spanish'];
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Beginner', 2: 'Elementary', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert',
};

// -- Shared tooltip element ---------------------------------------------------

let tooltip:    HTMLElement | null = null;
let hideTimer:  ReturnType<typeof setTimeout> | null = null;
let lastAnchor: Element | null = null;

function getTooltip(): HTMLElement {
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'wordTooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.addEventListener('mouseenter', () => { if (hideTimer) clearTimeout(hideTimer); });
  tooltip.addEventListener('mouseleave', () => scheduleHide());
  document.body.appendChild(tooltip);
  return tooltip;
}

function scheduleHide(): void {
  hideTimer = setTimeout(() => { tooltip?.classList.remove('visible'); }, 120);
}

// -- Positioning --------------------------------------------------------------

function positionTooltip(): void {
  const tt = getTooltip();
  if (!lastAnchor) return;

  const rect = lastAnchor.getBoundingClientRect();
  const gap  = 10;

  tt.style.visibility = 'hidden';
  tt.style.display    = 'block';
  const ttH = tt.offsetHeight;
  const ttW = tt.offsetWidth;
  tt.style.visibility = '';
  tt.style.display    = '';

  const scrollY = window.scrollY;
  const scrollX = window.scrollX;
  const vpW     = window.innerWidth;
  const vpH     = window.innerHeight;

  let top = rect.bottom + scrollY + gap;
  if (rect.bottom + ttH + gap > vpH) top = rect.top + scrollY - ttH - gap;

  let left = rect.left + scrollX;
  if (left + ttW > scrollX + vpW - gap) left = scrollX + vpW - ttW - gap;
  if (left < scrollX + gap) left = scrollX + gap;

  tt.style.top  = `${top}px`;
  tt.style.left = `${left}px`;
}

// -- Helpers ------------------------------------------------------------------

function isWordRevealed(anchorEl: Element): boolean {
  // Recall mode
  if (anchorEl.classList.contains('recalled') || anchorEl.classList.contains('missed')) return true;
  if (anchorEl.classList.contains('recall-cell')) return false;

  // Picture mode -- card is the anchor; check its input for correct/revealed state
  const card = anchorEl.classList.contains('picture-card')
    ? anchorEl
    : anchorEl.closest('.picture-card');
  if (card) {
    const inp = card.querySelector('input');
    if (!inp) return false;
    return inp.classList.contains('correct') || inp.classList.contains('revealed');
  }

  // Table / quiz mode
  const wordTd  = anchorEl.closest('td');
  if (!wordTd) return false;
  const inputTd = wordTd.nextElementSibling;
  if (!inputTd) return false;
  const inp = inputTd.querySelector('input');
  if (!inp) return true;
  return inp.classList.contains('correct') || inp.classList.contains('incorrect');
}

// -- Content builders ---------------------------------------------------------

function buildMetaRow(word: Word): HTMLElement {
  const row = document.createElement('div');
  row.className = 'tt-meta';

  if (word.pos) {
    const posEl = document.createElement('span');
    posEl.className   = 'tt-badge tt-pos';
    posEl.textContent = word.pos;
    row.appendChild(posEl);
  }

  if (word.frequency?.band) {
    const bandEl = document.createElement('span');
    bandEl.className   = 'tt-badge tt-band';
    bandEl.textContent = word.frequency.band;
    row.appendChild(bandEl);
  }

  if (word.difficulty) {
    const diffEl = document.createElement('span');
    diffEl.className   = 'tt-badge tt-diff';
    diffEl.textContent = DIFFICULTY_LABELS[word.difficulty as number] ?? `Difficulty ${word.difficulty}`;
    row.appendChild(diffEl);
  }

  const reg = word.linguistic?.register;
  if (reg && reg !== 'neutral') {
    const regEl = document.createElement('span');
    regEl.className   = 'tt-badge tt-register';
    regEl.textContent = reg;
    row.appendChild(regEl);
  }

  return row;
}

function buildGlosses(word: Word): HTMLElement {
  const el = document.createElement('div');
  el.className  = 'tt-glosses';
  el.textContent = buildGlossDisplay(word);
  return el;
}

function buildConjTable(conj: Record<string, string[]>, tenses: readonly string[], lang: string): HTMLTableElement {
  const table  = document.createElement('table');
  table.className = 'tt-conj-table';

  const labels   = tenseLabels(lang);
  const pronouns = getPronouns(lang);

  const thead     = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.appendChild(document.createElement('th'));
  tenses.forEach(t => {
    const th = document.createElement('th');
    th.textContent = labels[t] ?? t;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  pronouns.forEach((pronoun, i) => {
    const tr = document.createElement('tr');
    const tdPronoun = document.createElement('td');
    tdPronoun.className   = 'tt-pronoun';
    tdPronoun.textContent = pronoun;
    tr.appendChild(tdPronoun);
    tenses.forEach(t => {
      const td   = document.createElement('td');
      const form = conj[t]?.[i];
      td.textContent = form ?? '—';
      if (!form) td.className = 'tt-empty';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function buildNonFiniteSection(word: Word, lang: string): HTMLElement | null {
  const pp  = (word.linguistic?.conjugations?.['past_participle'] as string | null) ?? null;
  const ger = (word.linguistic?.conjugations?.['gerund']          as string | null) ?? null;
  if (!pp && !ger) return null;

  const labels = tenseLabels(lang);

  const section = document.createElement('div');
  section.className = 'tt-nonfinite';

  const sectionLabel = document.createElement('div');
  sectionLabel.className   = 'tt-section-label';
  sectionLabel.textContent = 'Non-finite';
  section.appendChild(sectionLabel);

  const table = document.createElement('table');
  table.className = 'tt-conj-table tt-nonfinite-table';

  const pairs: [string, string][] = [];
  if (ger) pairs.push([labels['gerund']          ?? 'Gerund',          ger]);
  if (pp)  pairs.push([labels['past_participle'] ?? 'Past Participle', pp]);

  pairs.forEach(([rowLabel, form]) => {
    const tr  = document.createElement('tr');
    const tdL = document.createElement('td');
    tdL.className   = 'tt-pronoun';
    tdL.textContent = rowLabel;
    const tdF = document.createElement('td');
    tdF.textContent = form;
    tr.append(tdL, tdF);
    table.appendChild(tr);
  });

  section.appendChild(table);
  return section;
}

function buildConjSection(word: Word, lang: string): HTMLElement | null {
  const conj = word.linguistic?.conjugations;
  if (!conj) return null;

  // Only show finite tenses relevant to the selected language
  const finiteTenseKeys = (TENSE_DEFS[lang] ?? TENSE_DEFS['spanish'])
    .filter(d => d.key !== 'past_participle' && d.key !== 'gerund')
    .map(d => d.key);

  const section = document.createElement('div');
  section.className = 'tt-conj';

  const label = document.createElement('div');
  label.className   = 'tt-section-label';
  label.textContent = 'Conjugation';
  section.appendChild(label);

  const presentWrap = document.createElement('div');
  presentWrap.className = 'tt-conj-present';
  presentWrap.appendChild(buildConjTable(conj as Record<string, string[]>, ['present'], lang));
  section.appendChild(presentWrap);

  const expandBtn = document.createElement('button');
  expandBtn.className   = 'tt-expand-btn';
  expandBtn.textContent = 'Show all tenses';
  section.appendChild(expandBtn);

  const fullWrap = document.createElement('div');
  fullWrap.className = 'tt-conj-full';
  fullWrap.hidden    = true;
  fullWrap.appendChild(buildConjTable(conj as Record<string, string[]>, finiteTenseKeys, lang));
  section.appendChild(fullWrap);

  expandBtn.addEventListener('click', e => {
    e.stopPropagation();
    const expanding = fullWrap.hidden;
    fullWrap.hidden    = !expanding;
    presentWrap.hidden = expanding;
    expandBtn.textContent = expanding ? 'Show less' : 'Show all tenses';
    const tt = getTooltip();
    tt.style.width = expanding ? '' : '280px';
    positionTooltip();
  });

  return section;
}

function populateTooltip(word: Word, revealed: boolean, lang: string, hideWordWhenUnrevealed = false): void {
  const tt = getTooltip();
  tt.innerHTML   = '';
  tt.style.width = '';

  const heading = document.createElement('div');
  heading.className   = 'tt-word';
  heading.textContent = (hideWordWhenUnrevealed && !revealed) ? '???' : word.word;
  tt.appendChild(heading);
  tt.appendChild(buildMetaRow(word));

  if (revealed) {
    tt.appendChild(buildGlosses(word));
  } else {
    const hint = document.createElement('div');
    hint.className   = 'tt-glosses tt-hidden-hint';
    hint.textContent = 'Solve the word to see the translation';
    tt.appendChild(hint);
  }

  if (revealed && word.pos === 'verb') {
    const conjSection = buildConjSection(word, lang);
    if (conjSection) tt.appendChild(conjSection);
    const nonFiniteSection = buildNonFiniteSection(word, lang);
    if (nonFiniteSection) tt.appendChild(nonFiniteSection);
  }

  const syns = word.relations?.synonyms ?? [];
  const ants = word.relations?.antonyms ?? [];
  if (revealed && (syns.length || ants.length)) {
    const rel = document.createElement('div');
    rel.className = 'tt-relations';
    if (syns.length) {
      const s = document.createElement('span');
      s.innerHTML = `<em>syn:</em> ${syns.join(', ')}`;
      rel.appendChild(s);
    }
    if (ants.length) {
      const a = document.createElement('span');
      a.innerHTML = `<em>ant:</em> ${ants.join(', ')}`;
      rel.appendChild(a);
    }
    tt.appendChild(rel);
  }

  tt.style.width = '280px';
}

// -- Public API ---------------------------------------------------------------

export interface AttachTooltipOptions {
  /** When true, replaces the word heading with '???' until the card is solved.
   *  Use in picture mode where the word itself is what the user is guessing. */
  hideWordWhenUnrevealed?: boolean;
}

export function attachTooltips(container: HTMLElement, opts: AttachTooltipOptions = {}): void {
  if (!container) return;

  container.querySelectorAll<HTMLElement>('[data-word-json]').forEach(el => {
    el.addEventListener('mouseenter', () => {
      if (hideTimer) clearTimeout(hideTimer);
      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const word     = JSON.parse(el.dataset.wordJson!) as Word; // element selected by [data-word-json], so attribute is always present
        const revealed = isWordRevealed(el);
        const lang     = getLang();
        lastAnchor     = el;
        populateTooltip(word, revealed, lang, opts.hideWordWhenUnrevealed);
        positionTooltip();
        getTooltip().classList.add('visible');
      } catch (e) {
        console.warn('word-tooltip: failed to parse word JSON', e);
      }
    });
    el.addEventListener('mouseleave', () => scheduleHide());
  });
}
