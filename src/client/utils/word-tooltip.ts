/**
 * word-tooltip.ts — Hover tooltip for word cards.
 *
 * Exported: attachTooltips(container: HTMLElement)
 *   Scans container for [data-word-json] elements and attaches
 *   mouseenter/mouseleave listeners. Uses a single shared tooltip
 *   element to avoid creating hundreds of DOM nodes.
 */

import type { Word } from '../types.js';
import { buildGlossDisplay, displayWord } from './utils.js';
import { PRONOUNS as LANG_PRONOUNS, TENSE_DEFS } from '../modes/conjugation/data.js';
import { logger } from './logger.js';
import { languageInfo, LANGUAGES, flagUrl } from '../data/languages.js';
import { Settings } from '../settings.js';
import { createFlagImg } from '../ui/flag-icon.js';

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
    posEl.dataset.pos = word.pos;
    posEl.textContent = word.pos;
    row.appendChild(posEl);
  }

  // Only present on a word merged in from Compare/Multi-language table mode
  // — an ordinary single-language word never carries `.language`. Shown next
  // to the part-of-speech badge regardless of the table's own indicator
  // setting, so there's always a way to tell a mixed-in word's language.
  if (word.language) {
    const info  = languageInfo(word.language);
    const langEl = document.createElement('span');
    langEl.className   = `tt-badge tt-lang lang-tag-${word.language}`;
    langEl.appendChild(createFlagImg(Settings.getLangFlag(word.language), info.label));
    langEl.append(' ' + info.label);
    row.appendChild(langEl);
  }

  if (word.frequency?.band) {
    const bandEl = document.createElement('span');
    bandEl.className    = 'tt-badge tt-band';
    bandEl.dataset.band = word.frequency.band;
    bandEl.textContent  = word.frequency.band;
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
  tenses.forEach((t, colIdx) => {
    const th = document.createElement('th');
    th.textContent = labels[t] ?? t;
    // Same data-tense → --tense-hue scheme Conjugation Mode's own tense
    // chips/cards use (see conjugation.css) — harmless here on its own; only
    // My Lists' detail view (.ml-detail-conj) actually reads it for color.
    th.dataset.tense = t;
    // data-col drives the hover column-highlight below — shared by this
    // header cell and every body cell in the same tense column.
    th.dataset.col = String(colIdx);
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
    // Same data-pi → --pronoun-hue scheme Conjugation Mode's Forms toggles
    // use, so a "Forms" (person/pronoun) color can match here too.
    tdPronoun.dataset.pi = String(i);
    tr.appendChild(tdPronoun);
    tenses.forEach((t, colIdx) => {
      const td   = document.createElement('td');
      const form = conj[t]?.[i];
      td.textContent = form ?? '—';
      if (!form) td.className = 'tt-empty';
      td.dataset.tense = t;
      td.dataset.col = String(colIdx);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  attachConjTableHoverHighlight(table);
  return table;
}

/**
 * Hovering any cell highlights its whole row (Form) and whole column
 * (Tense) — a verb's full conjugation table is a wall of near-identical
 * short strings, and tracing "this row, this column" by eye alone is easy
 * to lose track of once several tenses are showing side by side.
 *
 * Delegated on the table rather than per-cell: rebuilding cell listeners on
 * every render (this table is torn down and rebuilt on each hover in the
 * quiz tooltip) would be wasteful, and delegation only needs the two
 * listeners below regardless of table size. Only .ml-detail-conj (My
 * Lists' own conjugation view) actually styles the highlight classes —
 * see my-lists.css — so this is inert everywhere else the table appears.
 */
function attachConjTableHoverHighlight(table: HTMLTableElement): void {
  const clear = (): void => {
    table.querySelectorAll('.tt-conj-hl-row, .tt-conj-hl-col').forEach(el => {
      el.classList.remove('tt-conj-hl-row', 'tt-conj-hl-col');
    });
  };
  table.addEventListener('mouseover', e => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('td, th');
    if (!cell || !table.contains(cell)) return;
    clear();
    cell.closest('tr')?.classList.add('tt-conj-hl-row');
    const col = cell.dataset.col;
    if (col !== undefined) {
      table.querySelectorAll(`[data-col="${col}"]`).forEach(el => el.classList.add('tt-conj-hl-col'));
    }
  });
  table.addEventListener('mouseleave', clear);
}

/**
 * Exported alongside buildConjSection below so other modules that already
 * have a word's conjugations on hand (My Lists' VocabEntry carries them
 * separately from a full Word — see vocab-cache.ts) can build the same
 * table without needing a whole Word object just to reach one field.
 */
export function buildNonFiniteSection(
  conjugations: Record<string, string[] | string> | null | undefined, lang: string,
): HTMLElement | null {
  const pp  = (conjugations?.['past_participle'] as string | null) ?? null;
  const ger = (conjugations?.['gerund']          as string | null) ?? null;
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

  const pairs: [string, string, string][] = [];
  if (ger) pairs.push([labels['gerund']          ?? 'Gerund',          ger, 'gerund']);
  if (pp)  pairs.push([labels['past_participle'] ?? 'Past Participle', pp, 'past_participle']);

  pairs.forEach(([rowLabel, form, tenseKey]) => {
    const tr  = document.createElement('tr');
    const tdL = document.createElement('td');
    tdL.className   = 'tt-pronoun';
    tdL.textContent = rowLabel;
    tdL.dataset.tense = tenseKey;
    const tdF = document.createElement('td');
    tdF.textContent = form;
    tdF.dataset.tense = tenseKey;
    tdF.dataset.col = '0';
    tr.append(tdL, tdF);
    table.appendChild(tr);
  });

  attachConjTableHoverHighlight(table);
  section.appendChild(table);
  return section;
}

/** See buildNonFiniteSection's own comment — same reasoning, same export. */
export function buildConjSection(
  conjugations: Record<string, string[] | string> | null | undefined, lang: string,
): HTMLElement | null {
  const conj = conjugations;
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

/** Clear whatever the previous hover's word left on the shared tooltip element. */
function resetLangBackground(tt: HTMLElement): void {
  for (const l of LANGUAGES) tt.classList.remove(`lang-tag-${l.name}`);
  tt.classList.remove('lang-indicator-flag');
  tt.style.removeProperty('--flag-img');
}

function populateTooltip(word: Word, revealed: boolean, lang: string, hideWordWhenUnrevealed = false): void {
  const tt = getTooltip();
  tt.innerHTML   = '';
  tt.style.width = '';
  resetLangBackground(tt);

  // Same Off/Color/Flag indicator as table mode, mirrored onto the tooltip —
  // only relevant when this word actually carries a `.language` (Compare/
  // Multi-language table); an ordinary single-language word never does.
  if (word.language && Settings.getLangIndicator() !== 'off') {
    tt.classList.add(`lang-tag-${word.language}`);
    if (Settings.getLangIndicator() === 'flag') {
      tt.classList.add('lang-indicator-flag');
      tt.style.setProperty('--flag-img', `url("${flagUrl(Settings.getLangFlag(word.language))}")`);
    }
  }

  const heading = document.createElement('div');
  heading.className   = 'tt-word';
  // disambiguator here (word side); buildGlosses below carries its own,
  // independent per-gloss meaningDisambiguators — the two can differ, so
  // both show.
  heading.textContent = (hideWordWhenUnrevealed && !revealed) ? '???' : displayWord(word, Settings.getShowDisambiguator());
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
    const conjSection = buildConjSection(word.linguistic?.conjugations, lang);
    if (conjSection) tt.appendChild(conjSection);
    const nonFiniteSection = buildNonFiniteSection(word.linguistic?.conjugations, lang);
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
   *  Use in picture mode where the word itself is what the user is guessing.
   *  A function instead decides per element — table mode's Meaning→Word
   *  direction is per-row (mixed direction randomizes it per word), so one
   *  container-wide boolean can't say it for every hovered element. */
  hideWordWhenUnrevealed?: boolean | ((el: HTMLElement) => boolean);
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
        const hideWord = typeof opts.hideWordWhenUnrevealed === 'function'
          ? opts.hideWordWhenUnrevealed(el)
          : opts.hideWordWhenUnrevealed;
        lastAnchor     = el;
        populateTooltip(word, revealed, lang, hideWord);
        positionTooltip();
        getTooltip().classList.add('visible');
      } catch (e) {
        logger.warn('word-tooltip: failed to parse word JSON', e);
      }
    });
    el.addEventListener('mouseleave', () => scheduleHide());
  });
}
