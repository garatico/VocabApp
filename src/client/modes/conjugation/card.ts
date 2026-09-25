import type { Word } from '../../types.js';
import { foldKey as normalize } from '../../utils/match.ts';
import { tenseEnLabel, TENSE_HELP, REGULARITY_HELP } from './data.js';
import { regularityOf } from './verb-filters.js';
import { buildGlossDisplay, displayWord } from '../../utils/utils.js';
import { getWordLists } from '../../utils/word-lists.ts';
import { openListPicker } from '../../utils/list-picker.ts';
import { languageInfo } from '../../data/languages.js';
import { createFlagImg } from '../../ui/flag-icon.js';
import { Settings, applyAutofillAttr } from '../../settings.js';
import { CardController, EMPTY_SLOTS, SINGLE_FORM_ROW_LABEL, hiddenPronounSlots, isSingleForm, missingDataSlots } from './helpers.ts';

/**
 * conjugation/card.ts — builds one verb's card in the Grid/Full views: its header,
 * a row per pronoun, the inputs and their answer checking.
 */

// ── Card builder ──────────────────────────────────────────────────────────────

interface BuildCardOptions {
  verb:             Word;
  lang:             string;
  pronouns:         string[];
  tenseKey:         string;
  /**
   * This tense's name in `verb`'s own language — not the flattened,
   * Spanish-biased TENSE_LABELS module map, which would show "Presente" on
   * a German card. Resolved by the caller (buildCards()), which already
   * knows the verb's own language.
   */
  tenseNativeLabel: string;
  getDisplayMode:   () => string;
  onProgress:       () => void;
  /**
   * Full Conjugation stacks one card per tense for a single verb, where the
   * verb name and its star are already in the view header — repeating them on
   * every card would be six copies of the same line.
   */
  hideVerbName?:    boolean;
}

export function buildCard({
  verb, lang, pronouns, tenseKey, tenseNativeLabel, getDisplayMode, onProgress, hideVerbName = false,
}: BuildCardOptions): CardController {
  // One card drills one tense. Multiple selected tenses produce multiple
  // cards for the same verb rather than one card with several sections —
  // the card's answer checking, pronoun toggles and progress tally are all
  // written around a single tense, and splitting them would have meant
  // rewriting all three.
  const getTenseKey = (): string => tenseKey;
  const card = document.createElement('div');
  card.className = 'conj-card';

  // Header is a two-column row: the verb and its meaning on the left, the
  // tense and the reveal control on the right. The right half used to be
  // empty, which on a half-width card is a lot of wasted space.
  const header = document.createElement('div');
  header.className = 'conj-card-header';

  const headMain = document.createElement('div');
  headMain.className = 'conj-head-main';

  // Frequency rank. Same badge as table mode — bare number, no '#', same
  // corner and same type, so a word reads identically in both modes.
  const rankEl = document.createElement('span');
  rankEl.className = 'conj-card-rank';
  if (verb.rank != null) rankEl.textContent = String(verb.rank);
  else rankEl.hidden = true;
  // In Full Conjugation the verb block header already carries the rank —
  // same reasoning as targetEl/englishEl above.
  if (hideVerbName) rankEl.hidden = true;
  card.appendChild(rankEl);

  const targetEl  = document.createElement('div');
  targetEl.className = 'conj-verb-spanish';
  const englishEl = document.createElement('div');
  englishEl.className = 'conj-verb-english';

  // Add to a list, the same star and the same picker as Table and Recall.
  // A verb you cannot conjugate is exactly the verb you want to save, and
  // until now the only way to do that was to leave the mode and find it again.
  const starBtn = document.createElement('button');
  starBtn.type      = 'button';
  starBtn.textContent = '★';
  // Tab moves input → input through the conjugation grid; the star is still
  // reachable by click, matching how table mode keeps it out of the run.
  starBtn.tabIndex  = -1;

  function syncStar(): void {
    const lists = getWordLists(lang, verb.word);
    starBtn.className = 'known-btn conj-card-star'
      + (lists.length > 0 ? ' known-btn--active' : '');
    starBtn.title = lists.length > 0
      ? 'In lists: ' + lists.join(', ')
      : 'Add to a list';
  }
  syncStar();

  starBtn.addEventListener('click', e => {
    e.stopPropagation();
    openListPicker({ anchorEl: starBtn, lang, word: verb.word, onClose: syncStar });
  });

  const titleRow = document.createElement('div');
  titleRow.className = 'conj-verb-title-row';
  titleRow.append(targetEl, starBtn);
  titleRow.hidden = hideVerbName;
  headMain.append(titleRow, englishEl);
  if (hideVerbName) englishEl.hidden = true;

  const headSide = document.createElement('div');
  headSide.className = 'conj-head-side';

  // Band, regularity and tense are all one-word labels, so they share a line
  // instead of stacking three deep. That was three rows of header above a
  // six-row conjugation table, which made every card taller than its content.
  const metaRow = document.createElement('div');
  metaRow.className = 'conj-head-meta';

  // Frequency band, if we have one.
  const bandEl = document.createElement('span');
  bandEl.className = 'conj-card-band';
  const band = verb.frequency?.band ?? null;
  if (band) bandEl.textContent = band; else bandEl.hidden = true;
  metaRow.appendChild(bandEl);

  // Only present in a merged multi-language session — a single-language one
  // never has `.language` set, so no card ever pays for this otherwise.
  if (verb.language) metaRow.appendChild(createFlagImg(Settings.getLangFlag(verb.language), languageInfo(verb.language).label));

  // Regularity. conjugation_class encodes it: regular-*, ortho-* (spelling
  // change only), stem-* (stem-changing) and irregular-*. Grouped into three
  // buckets, because "ortho-car" means nothing to someone learning.
  const regEl = document.createElement('span');
  const cls   = verb.linguistic?.conjugation_class ?? null;
  const kind  = regularityOf(cls);
  regEl.className   = `conj-card-reg conj-card-reg--${kind.key}`;
  regEl.textContent = kind.label;
  // Explanation first, raw class second — the class name is only useful once
  // you already know what the bucket means.
  regEl.title       = (REGULARITY_HELP[kind.key] ?? '')
                    + (cls ? `\n\nconjugation class: ${cls}` : '');
  // In Full Conjugation the verb block header already carries this pill,
  // computed once per verb rather than repeated identically on every one
  // of its tense cards.
  if (!cls || hideVerbName) regEl.hidden = true;
  metaRow.appendChild(regEl);

  // Tense name, always shown — it is the one thing that distinguishes two
  // cards for the same verb.
  const tenseEl = document.createElement('span');
  tenseEl.className = 'conj-card-tense';
  tenseEl.title     = TENSE_HELP[tenseKey] ?? '';
  metaRow.appendChild(tenseEl);

  headSide.appendChild(metaRow);

  // English tense name and Reveal all share the second line.
  const footRow = document.createElement('div');
  footRow.className = 'conj-head-foot';

  const tenseEnEl = document.createElement('span');
  tenseEnEl.className = 'conj-card-tense-en';
  tenseEnEl.textContent = tenseEnLabel(tenseKey);
  if (!tenseEnEl.textContent) tenseEnEl.hidden = true;
  footRow.appendChild(tenseEnEl);

  const revealAllBtn = document.createElement('button');
  revealAllBtn.type      = 'button';
  revealAllBtn.className = 'conj-reveal-all-btn';
  revealAllBtn.textContent = 'Reveal all';
  revealAllBtn.title = 'Fill in every form for this verb (scored as revealed)';
  revealAllBtn.addEventListener('click', () => {
    revealAnswers('revealed');
    revealAllBtn.disabled = true;
  });
  footRow.appendChild(revealAllBtn);

  headSide.appendChild(footRow);

  header.append(headMain, headSide);

  function updateHeader(): void {
    const mode = getDisplayMode();
    targetEl.textContent  = displayWord(verb, Settings.getShowWordSideDisambiguator(), Settings.getAbbreviateGrammarHint());
    englishEl.textContent = buildGlossDisplay(verb);
    // In Full Conjugation the view header carries the verb, so the card's copy
    // stays hidden whatever the target/english toggle says.
    targetEl.hidden  = hideVerbName || mode === 'english';
    englishEl.hidden = hideVerbName || mode === 'target';
    tenseEl.textContent = tenseNativeLabel;
  }

  const innerGrid = document.createElement('div');
  innerGrid.className = 'conj-inner-grid';

  const inputs: HTMLInputElement[] = [];
  const pronounRows: HTMLElement[] = [];

  // Reveal buttons mirror table mode: hidden entirely when hints are off,
  // otherwise a ? that fills the answer in and scores it as revealed.
  const hintMode = Settings.getConjHintMode();

  function makeRevealBtn(onReveal: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'reveal-btn conj-reveal-btn';
    btn.textContent = '?';
    btn.title       = 'Reveal answer (counts as revealed)';
    btn.tabIndex    = -1;      // Tab stays on the inputs
    btn.hidden      = hintMode === 'none';
    btn.addEventListener('click', onReveal);
    return btn;
  }

  const revealBtns: HTMLButtonElement[] = [];

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
    applyAutofillAttr(inp);
    inp.setAttribute("autocorrect", "off");
    inp.setAttribute("autocapitalize", "off");
    inp.spellcheck     = false;
    inp.placeholder    = 'Type conjugation…';

    const revealBtn = makeRevealBtn(() => { revealOne(i); });
    revealBtns.push(revealBtn);

    row.append(label, inp, revealBtn);
    innerGrid.appendChild(row);
    inputs.push(inp);
    pronounRows.push(row);
  });

  // Single-form row (past_participle / gerund)
  const singleFormRow = document.createElement('div');
  // conj-row-tense-hidden, matching what setSingleMode toggles. It used to
  // start with conj-row-hidden, which setSingleMode no longer touches — so the
  // row stayed hidden forever and a gerund card had no input at all.
  singleFormRow.className  = 'conj-row conj-row-tense-hidden';
  singleFormRow.dataset.pi = 'single';

  const singleLabel = document.createElement('span');
  singleLabel.className = 'conj-pronoun';

  let singleInp = document.createElement('input');
  singleInp.type           = 'text';
  singleInp.className      = 'conj-drill-input';
  applyAutofillAttr(singleInp);
  singleInp.setAttribute("autocorrect", "off");
  singleInp.setAttribute("autocapitalize", "off");
  singleInp.spellcheck     = false;
  singleInp.placeholder    = 'Type conjugation…';

  const singleRevealBtn = makeRevealBtn(() => { revealOne('single'); });

  singleFormRow.append(singleLabel, singleInp, singleRevealBtn);
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

  /** hiddenPronounSlots(tenseKey) plus this verb's own missingDataSlots —
   *  see that function's doc comment for why the two are folded together. */
  function effectiveHiddenSlots(tenseKey: string): Set<number> {
    const dataMissing = missingDataSlots(verb, tenseKey, pronouns);
    if (dataMissing.size === 0) return hiddenPronounSlots(tenseKey);
    return new Set([...hiddenPronounSlots(tenseKey), ...dataMissing]);
  }

  function setSingleMode(single: boolean): void {
    // conj-row-tense-hidden, not conj-row-hidden — see VISIBLE_ROW. The pronoun
    // toggles own the other class and would undo this on their next pass.
    const hiddenSlots = single ? EMPTY_SLOTS : effectiveHiddenSlots(getTenseKey());
    pronounRows.forEach((row, i) => {
      row.classList.toggle('conj-row-tense-hidden', single || hiddenSlots.has(i));
      // Distinguishes "imperative has no yo" (row still takes its normal
      // place in the paradigm, just empty) from "this whole card is a
      // single-form tense" (there is no paradigm here at all) — both carry
      // conj-row-tense-hidden for VISIBLE_ROW/scoring purposes, but only the
      // former also gets this marker, which Full view uses to keep the row's
      // vertical space reserved so tú-through-ellos still lines up with the
      // neighboring tense columns instead of sliding up to fill yo's slot.
      row.classList.toggle('conj-row-no-form', !single && hiddenSlots.has(i));
    });
    singleFormRow.classList.toggle('conj-row-tense-hidden', !single);
    if (single) {
      singleLabel.textContent = SINGLE_FORM_ROW_LABEL[getTenseKey()] ?? getTenseKey();
    }
  }

  function updateInputs(): void {
    const single = isSingleForm(getTenseKey());
    const hiddenSlots = single ? EMPTY_SLOTS : effectiveHiddenSlots(getTenseKey());

    inputs.forEach((inp, i) => {
      inp.value    = '';
      // A slot the tense has no form for (imperative's "yo") stays disabled —
      // same as a pronoun the Forms toggle switched off — so Tab navigation
      // (addNav, below) never lands on a row that's hidden via CSS.
      inp.disabled = hiddenSlots.has(i);
      inp.classList.remove('correct', 'revealed', 'missed');
      const btn = revealBtns[i];
      if (btn) { btn.hidden = hintMode === 'none' || hiddenSlots.has(i); btn.textContent = '?'; }
    });

    singleInp.value = '';
    singleInp.disabled = false;
    singleInp.classList.remove('correct', 'revealed', 'missed');
    singleRevealBtn.hidden      = hintMode === 'none';
    singleRevealBtn.textContent = '?';

    setSingleMode(single);
    attachChecking();
  }

  /** The answer for one slot — index for a pronoun row, 'single' for the odd ones. */
  function answerFor(slot: number | 'single'): string | null {
    const tenseKey = getTenseKey();
    if (slot === 'single') {
      return (verb.linguistic?.conjugations?.[tenseKey] as string | null) ?? null;
    }
    const answers = (verb.linguistic?.conjugations as Record<string, string[]> | null)
      ?.[tenseKey] ?? null;
    return (Array.isArray(answers) ? answers[slot] : null) ?? null;
  }

  function fill(
    inp: HTMLInputElement,
    btn: HTMLButtonElement | undefined,
    answer: string | null,
    mark: 'correct' | 'revealed' | 'missed',
  ): void {
    if (inp.classList.contains('correct') ||
        inp.classList.contains('revealed') ||
        inp.classList.contains('missed')) return;
    inp.value = answer ?? '—';
    inp.classList.add(mark);
    inp.disabled = true;
    if (btn) btn.hidden = true;
  }

  /** Reveal one form via its ? button — scored as revealed, not missed. */
  function revealOne(slot: number | 'single'): void {
    const single = slot === 'single';
    const inp    = single ? singleInp       : inputs[slot];
    const btn    = single ? singleRevealBtn : revealBtns[slot];
    const answer = answerFor(slot);

    // First-letter mode gives one nudge before handing over the full answer.
    if (hintMode === 'first-letter' && btn?.textContent === '?' && answer) {
      inp.value       = answer[0];
      inp.placeholder = `${answer.length} letters`;
      inp.focus();
      btn.textContent = '??';
      btn.title       = 'Reveal full answer';
      return;
    }

    fill(inp, btn, answer, 'revealed');
    onProgress();
  }

  function revealAnswers(mark: 'revealed' | 'missed' = 'missed'): void {
    if (isSingleForm(getTenseKey())) {
      fill(singleInp, singleRevealBtn, answerFor('single'), mark);
    } else {
      inputs.forEach((inp, i) => fill(inp, revealBtns[i], answerFor(i), mark));
    }
  }

  /**
   * Re-paint a freshly built, still-blank card with what bankVisibleVerbs()
   * scored for it last time — see buildCards()'s call site. Reuses fill()
   * (now taking 'correct' too), which already no-ops on a slot that somehow
   * carries a scoring class already, so this is safe to call before or after
   * attachChecking() has wired the inputs up.
   */
  function restoreBanked(states: ReadonlyMap<number | 'single', 'correct' | 'revealed' | 'missed'>): void {
    states.forEach((state, slot) => {
      const inp = slot === 'single' ? singleInp       : inputs[slot];
      const btn = slot === 'single' ? singleRevealBtn : revealBtns[slot];
      if (inp) fill(inp, btn, answerFor(slot), state);
    });
  }

  function syncDeselected(): void {
    const showAnswer = Settings.getConjDeselected() === 'answer';
    pronounRows.forEach((row, i) => {
      const inp = inputs[i];
      if (!inp) return;
      const off = row.classList.contains('conj-row-hidden');

      if (off && showAnswer) {
        // Never overwrite something the learner typed before switching the
        // pronoun off — only an empty box, or one we filled ourselves.
        if (inp.value === '' || inp.dataset.deselectedFill === '1') {
          inp.value = answerFor(i) ?? '—';
          inp.dataset.deselectedFill = '1';
        }
        return;
      }

      if (inp.dataset.deselectedFill === '1') {
        inp.value = '';
        delete inp.dataset.deselectedFill;
      }
    });
  }

  setSingleMode(isSingleForm(getTenseKey()));
  updateHeader();
  attachChecking();

  return { card, updateHeader, updateInputs, revealAnswers, syncDeselected, restoreBanked };
}
