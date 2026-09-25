/**
 * row-shared.ts — pieces shared between word-list.ts (single-language),
 * multi-panel.ts (cross-language) and browse-panel.ts (whole vocabulary), so
 * the same word row, the same "N Words" / "N Mastered" stat chips, and the
 * same expanded-detail section don't drift into three almost-identical
 * implementations that quietly disagree.
 */

import { getMasteryLevel, setMasteryLevel, MASTERY_LEVELS, getMasteredDate } from './mastery.ts';
import { quizStrength, wordTally } from '../../utils/session-history.ts';
import { buildConjSection, buildNonFiniteSection } from '../../utils/word-tooltip.ts';
import { POS_ABBREV, type VocabEntry } from './types.ts';
import { buildAudioButton } from '../../ui/audio-play-button.ts';
import { fillHighlighted } from '../../utils/dom.ts';

/** Compact fill-level glyphs for the mastery scale, 0..MAX_MASTERY_LEVEL. */
export const MASTERY_GLYPHS = ['○', '◔', '◑', '◕', '●'];

export interface MasteryControls {
  masteryBtn: HTMLButtonElement;
  /** Read-only — reflects quiz history, not a control. */
  quizBadge: HTMLSpanElement;
}

/**
 * The mastery-scale button and the read-only quiz-history badge that sit at
 * the end of every word row.
 *
 * `lang` is the *word's own* language — for a cross-language list that's
 * `entry.language`, not the sidebar's `ctx.lang`, since mastery.ts and
 * session-history.ts are both keyed by the word's actual language.
 * `onChange` re-renders whatever list the row belongs to.
 */
export function buildMasteryControls(lang: string, word: string, onChange: () => void): MasteryControls {
  const level = getMasteryLevel(lang, word);
  const masteryBtn = document.createElement('button');
  masteryBtn.type = 'button';
  masteryBtn.className = 'ml-mastery-btn';
  masteryBtn.dataset.level = String(level);
  masteryBtn.title = `Your level: ${MASTERY_LEVELS[level]} — click to advance, shift-click to reset`;
  masteryBtn.textContent = MASTERY_GLYPHS[level];
  masteryBtn.addEventListener('click', e => {
    e.stopPropagation();
    const cur  = getMasteryLevel(lang, word);
    const next = e.shiftKey ? 0 : (cur + 1) % MASTERY_LEVELS.length;
    setMasteryLevel(lang, word, next);
    onChange();
  });

  const strength = quizStrength(lang, word);
  const tally    = wordTally(lang, word);
  const quizBadge = document.createElement('span');
  quizBadge.className = 'ml-quiz-badge';
  quizBadge.dataset.strength = String(strength);
  if (strength === 0) {
    quizBadge.textContent = '–';
    quizBadge.title = 'No quiz history yet for this word';
  } else {
    const total = tally.correct + tally.wrong;
    const pct   = Math.round((tally.correct / total) * 100);
    quizBadge.textContent = pct + '%';
    quizBadge.title = `Quiz record: ${tally.correct} correct, ${tally.wrong} missed (${pct}%)`;
  }

  return { masteryBtn, quizBadge };
}

/**
 * A button that jumps straight to this word's editor on the My Content tab
 * (openWordInMyContentEditor already handles switching languages and tabs)
 * — the same action word-info-popover.ts's own "Edit in My Content" offers
 * from Table mode, now reachable from a list row too rather than only from
 * mid-quiz.
 */
export function buildEditInMyContentButton(lang: string, word: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ml-edit-btn';
  btn.title = 'Edit in My Content';
  btn.textContent = '✎';
  btn.addEventListener('click', e => {
    e.stopPropagation();
    void import('../my-content-mode.ts').then(m => m.openWordInMyContentEditor(lang, word));
  });
  return btn;
}

/**
 * The "N Words" chip — always shown, even at zero ("No Words"), so an empty
 * list's stats row reads as "this is empty" rather than looking broken next
 * to a Mastered chip that's still there (see appendMasteredChip below).
 */
export function appendCountChip(statsRow: HTMLElement, total: number): void {
  const chip = document.createElement('span');
  chip.className = 'ml-stat-chip ml-stat-chip--count';
  chip.textContent = total > 0 ? `${total} Word${total === 1 ? '' : 's'}` : 'No Words';
  statsRow.appendChild(chip);
}

/** The "N Mastered" chip — same "always shown" reasoning as the count chip. */
export function appendMasteredChip(statsRow: HTMLElement, masteredCount: number): void {
  const chip = document.createElement('span');
  chip.className = 'ml-stat-chip ml-stat-chip--mastered'
    + (masteredCount === 0 ? ' ml-stat-chip--mastered-empty' : '');
  chip.textContent = masteredCount > 0 ? `${masteredCount} Mastered` : 'None Mastered';
  statsRow.appendChild(chip);
}

/**
 * The row's own expanded-detail panel — glosses, IPA, an example sentence,
 * both disambiguators, and (for a verb) a lazy "Show conjugations" toggle.
 * Shared so a word means the same thing whichever list you're looking at it
 * from, and so the word/meaning disambiguators live *here* rather than
 * inline next to the word or translation — appending "(permanent)" or
 * "(function)" straight onto a compact row column was exactly what widened
 * it unpredictably from row to row; this is the one place they show up
 * without fighting the row's own alignment for space.
 *
 * `lang` is the word's own effective language — `entry.language` for a
 * cross-language list's row, `ctx.lang` everywhere else — since the
 * conjugation table's tense set is language-specific (see conjugation/data.ts).
 *
 * `addedDate` is the caller's own lookup (getAddedDate for a single-language
 * list, getMultiAddedDate for a cross-language one) rather than something
 * this function resolves itself — Browse All Words has no list membership to
 * date at all, and the two list kinds key their dates differently (word vs
 * word+language), so there is no one lookup this shared helper could make on
 * every caller's behalf. Omit it (or pass null) where there's no list to date.
 */
/** One labeled row in the detail table below — a dimmed label to the left,
 *  the value beside it, same shape for every fact so Added/IPA/Example(s)/
 *  etc. all read the same way instead of running together in a flat
 *  wrapped list. */
function detailRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'ml-detail-row';
  const labelEl = document.createElement('span');
  labelEl.className = 'ml-detail-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'ml-detail-value';
  valueEl.textContent = value;
  row.append(labelEl, valueEl);
  return row;
}

export function buildWordDetail(entry: VocabEntry, lang: string, addedDate?: number | null): HTMLElement {
  const detail = document.createElement('div');
  detail.className = 'ml-word-detail';

  const table = document.createElement('div');
  table.className = 'ml-detail-table';

  if (addedDate) {
    table.appendChild(detailRow('Added', new Date(addedDate).toLocaleDateString()));
  }
  const masteredDate = getMasteredDate(lang, entry.word);
  if (masteredDate) {
    table.appendChild(detailRow('Mastered', new Date(masteredDate).toLocaleDateString()));
  }
  if (entry.disambiguator) {
    table.appendChild(detailRow('Sense', entry.disambiguator));
  }
  if (entry.glosses.length > 1) {
    // Per-gloss meaning notes, e.g. "of, from (origin)" — same guarded
    // lookup as the rest of My Lists' meaningDisambiguators reads (a plain
    // object from JSON still has Object.prototype behind it).
    const notes = entry.meaningDisambiguators;
    const glossText = entry.glosses.map(g => {
      const note = notes && Object.prototype.hasOwnProperty.call(notes, g) ? notes[g] : undefined;
      return note ? `${g} (${note})` : g;
    }).join(', ');
    table.appendChild(detailRow('Glosses', glossText));
  }
  if (entry.ipa) {
    table.appendChild(detailRow('IPA', '/' + entry.ipa + '/'));
  }
  if (entry.examples.length > 0) {
    table.appendChild(detailRow(entry.examples.length > 1 ? 'Examples' : 'Example', entry.examples[0]));
  }
  if (table.children.length > 0) detail.appendChild(table);

  if (entry.pos === 'verb' && entry.conjugations) {
    const conjBtn = document.createElement('button');
    conjBtn.type = 'button';
    conjBtn.className = 'ml-detail-conj-btn';
    conjBtn.textContent = 'Show conjugations ▾';
    // Built lazily, on first click — a list can run to thousands of verbs,
    // and most of those tables will never actually be opened.
    let conjWrap: HTMLElement | null = null;
    conjBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (conjWrap) {
        const showing = conjWrap.hidden;
        conjWrap.hidden = !showing;
        conjBtn.textContent = showing ? 'Hide conjugations ▴' : 'Show conjugations ▾';
        return;
      }
      conjWrap = document.createElement('div');
      conjWrap.className = 'ml-detail-conj';
      const conjSection = buildConjSection(entry.conjugations, lang);
      if (conjSection) conjWrap.appendChild(conjSection);
      const nonFinite = buildNonFiniteSection(entry.conjugations, lang);
      if (nonFinite) conjWrap.appendChild(nonFinite);
      detail.appendChild(conjWrap);
      conjBtn.textContent = 'Hide conjugations ▴';
    });
    detail.appendChild(conjBtn);
  }

  if (detail.children.length === 0) {
    const none = document.createElement('span');
    none.className = 'ml-detail-none'; none.textContent = 'No additional details.';
    detail.appendChild(none);
  }
  return detail;
}

export interface WordRowOptions {
  lang: string;
  word: string;
  entry: VocabEntry | undefined;
  mastered: boolean;
  /** Search text to highlight in the word and its translation. */
  filter: string;
  /** Whether this row's detail (glosses, IPA, examples…) is open. */
  expanded: boolean;
  addedDate?: number | null;
  /** Redraw the list — after a mastery change. */
  redraw: () => void;
  /** Flip this row's expanded state and redraw (row click). */
  onToggleExpand: () => void;
  /** Before the word (e.g. a bulk-select checkbox). */
  leading?: HTMLElement[];
  /** Right before the POS tag (e.g. a Cross-Language row's flag). */
  beforePos?: HTMLElement[];
  /** After the shared actions (e.g. move / remove). */
  extraActions?: HTMLElement[];
}

/**
 * One word row — the same for Single-Language, Cross-Language and Smart lists:
 * word, audio, POS, rank, translation, quiz badge, mastery, edit-in-My-Content,
 * plus a click-to-expand detail (glosses, IPA, examples…). A list type only
 * supplies what is genuinely its own through `leading`/`beforePos`/`extraActions`.
 */
export function buildWordRow(o: WordRowOptions): HTMLLIElement {
  const { entry } = o;
  const li = document.createElement('li');
  li.className = 'ml-word-item'
    + (o.expanded ? ' ml-word-item--expanded' : '')
    + (o.mastered ? ' ml-word-item--mastered' : '');

  // Word/meaning disambiguators live in the expanded detail (buildWordDetail),
  // not on this line, which they widened unpredictably from row to row.
  const wordSpan = document.createElement('span');
  wordSpan.className = 'ml-word-text';
  fillHighlighted(wordSpan, o.word, o.filter);

  const audioBtn = buildAudioButton(entry?.audioUrl);

  const posLabel = POS_ABBREV[entry?.pos ?? ''] ?? '';
  const posSpan = document.createElement('span');
  posSpan.className = 'ml-word-pos'; posSpan.textContent = posLabel;
  if (posLabel && entry?.pos) posSpan.dataset.pos = entry.pos; else posSpan.hidden = true;

  const rankBadge = document.createElement('span');
  rankBadge.className = 'ml-word-rank';
  if (entry?.rank != null) rankBadge.textContent = '#' + entry.rank; else rankBadge.hidden = true;

  const transSpan = document.createElement('span');
  transSpan.className = 'ml-word-trans';
  if (entry?.translation) fillHighlighted(transSpan, entry.translation, o.filter);

  const { masteryBtn, quizBadge } = buildMasteryControls(o.lang, o.word, o.redraw);
  const editBtn = buildEditInMyContentButton(o.lang, o.word);
  const actions = document.createElement('div');
  actions.className = 'ml-word-actions';
  actions.append(quizBadge, masteryBtn, editBtn, ...(o.extraActions ?? []));

  li.append(...(o.leading ?? []), wordSpan);
  if (audioBtn) li.appendChild(audioBtn);
  li.append(...(o.beforePos ?? []), posSpan, rankBadge, transSpan, actions);

  const detail = (o.expanded && entry)
    ? buildWordDetail(entry, o.lang, o.addedDate)
    : document.createElement('div');
  detail.classList.add('ml-word-detail');
  li.appendChild(detail);

  li.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    o.onToggleExpand();
  });
  return li;
}
