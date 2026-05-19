/**
 * word-tooltip.ts — Hover tooltip for word cards.
 *
 * Exported: attachTooltips(container: HTMLElement)
 *   Scans container for [data-word-json] elements and attaches
 *   mouseenter/mouseleave listeners. Uses a single shared tooltip
 *   element to avoid creating hundreds of DOM nodes.
 */

import type { Word } from '../types.js';

const TENSES = ['present','preterite','imperfect','future','conditional','subjunctive','imperative'] as const;
type Tense = typeof TENSES[number];

const TENSE_LABELS: Record<Tense, string> = {
  present: 'Present', preterite: 'Preterite', imperfect: 'Imperfect',
  future: 'Future', conditional: 'Conditional', subjunctive: 'Subjunctive', imperative: 'Imperative',
};

const PRONOUNS = ['yo','tú','él/ella','nosotros','vosotros','ellos'];

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Beginner', 2: 'Elementary', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert',
};

// ── Shared tooltip element ────────────────────────────────────────────────────

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

// ── Positioning ───────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWordRevealed(anchorEl: Element): boolean {
  // Recall mode
  if (anchorEl.classList.contains('recalled') || anchorEl.classList.contains('missed')) return true;
  if (anchorEl.classList.contains('recall-cell')) return false;

  // Picture mode — card is the anchor; check its input for correct/revealed state
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

// ── Content builders ──────────────────────────────────────────────────────────

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
  const glosses = (word.glosses?.length ? word.glosses : [word.display]);
  const el = document.createElement('div');
  el.className  = 'tt-glosses';
  el.textContent = glosses.join(', ');
  return el;
}

function buildConjTable(conj: Record<string, string[]>, tenses: readonly string[]): HTMLTableElement {
  const table  = document.createElement('table');
  table.className = 'tt-conj-table';

  const thead     = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.appendChild(document.createElement('th'));
  tenses.forEach(t => {
    const th = document.createElement('th');
    th.textContent = TENSE_LABELS[t as Tense] ?? t;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  PRONOUNS.forEach((pronoun, i) => {
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

function buildConjSection(word: Word): HTMLElement | null {
  const conj = word.linguistic?.conjugations;
  if (!conj) return null;

  const section = document.createElement('div');
  section.className = 'tt-conj';

  const label = document.createElement('div');
  label.className   = 'tt-section-label';
  label.textContent = 'Conjugation';
  section.appendChild(label);

  const presentWrap = document.createElement('div');
  presentWrap.className = 'tt-conj-present';
  presentWrap.appendChild(buildConjTable(conj, ['present']));
  section.appendChild(presentWrap);

  const expandBtn = document.createElement('button');
  expandBtn.className   = 'tt-expand-btn';
  expandBtn.textContent = 'Show all tenses';
  section.appendChild(expandBtn);

  const fullWrap = document.createElement('div');
  fullWrap.className = 'tt-conj-full';
  fullWrap.hidden    = true;
  fullWrap.appendChild(buildConjTable(conj, TENSES));
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

function populateTooltip(word: Word, revealed: boolean, hideWordWhenUnrevealed = false): void {
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

  if (word.pos === 'verb') {
    const conjSection = buildConjSection(word);
    if (conjSection) tt.appendChild(conjSection);
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

// ── Public API ────────────────────────────────────────────────────────────────

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
        const word     = JSON.parse(el.dataset.wordJson!) as Word;
        const revealed = isWordRevealed(el);
        lastAnchor     = el;
        populateTooltip(word, revealed, opts.hideWordWhenUnrevealed);
        positionTooltip();
        getTooltip().classList.add('visible');
      } catch (e) {
        console.warn('word-tooltip: failed to parse word JSON', e);
      }
    });
    el.addEventListener('mouseleave', () => scheduleHide());
  });
}
