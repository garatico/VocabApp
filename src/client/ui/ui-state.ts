import { Settings } from '../settings.ts';

type CoreMode = 'table' | 'picture' | 'conjugation';
type Mode = CoreMode | string;

/** Modes that know how to render/score a mixed-language word list — mirrors app.ts's own copy. */
const MULTI_LANG_MODES = new Set(['table', 'conjugation']);

/** The active mode tab's id, read straight from the DOM — the one source of
 *  truth every module (app.ts, start-handler.ts) used to keep its own small
 *  copy of. */
export function getCurrentMode(): string {
  return document.querySelector('.mode-tab.active')?.getAttribute('data-mode') ?? 'table';
}

interface BindModeSwitchOptions {
  tableArea:        HTMLElement;
  pictureArea:      HTMLElement;
  conjugationArea:  HTMLElement | null;
  extraAreas?:      Record<string, HTMLElement | null>;
  onActivate?:      Partial<Record<string, () => void>>;
}

export function bindUIState(): void {
  const sizeSelect = document.getElementById('sizeSelect') as HTMLSelectElement;
  const custom     = document.getElementById('sizeCustom') as HTMLInputElement | null;

  sizeSelect.addEventListener('change', () => {
    if (custom) custom.style.display = sizeSelect.value === 'custom' ? 'inline-block' : 'none';
    if (sizeSelect.value === 'custom') custom?.focus();
  });
}

export function bindModeSwitch({
  tableArea, pictureArea, conjugationArea,
  extraAreas = {},
  onActivate = {},
}: BindModeSwitchOptions): { updateModeUI: (scrollTabIntoView?: boolean) => void } {
  let currentMode: Mode = 'table';

  /**
   * `scrollTabIntoView` defaults true for an actual tab switch, where
   * scrolling the newly-active tab into view is the point. app.ts also
   * calls this to re-sync the controls bar when a Settings "hide this
   * filter in this mode" chip changes — same active tab, just its filter
   * boxes need repainting — and passes `false there: scrolling the already-
   * active tab (sitting in the top nav) into view mid-click yanked the
   * Settings page itself back up to the top nav bar.
   */
  function updateModeUI(scrollTabIntoView = true): void {
    const mode = currentMode;

    tableArea.hidden   = mode !== 'table';
    pictureArea.hidden = mode !== 'picture';
    if (conjugationArea) conjugationArea.hidden = mode !== 'conjugation';

    for (const [areaMode, el] of Object.entries(extraAreas)) {
      if (el) el.hidden = mode !== areaMode;
    }

    // Hide the entire controls card for modes that don't use it
    const controlsEl = document.getElementById('controls');
    if (controlsEl) controlsEl.hidden = mode === 'mylists' || mode === 'settings' || mode === 'history' || mode === 'chat' || mode === 'myContent';

    const classFilter         = document.getElementById('classFilter');
    const listFilter          = document.getElementById('listFilter');
    const domainFilterWrap    = document.getElementById('domainFilterWrap');
    const wordsSizeGroup      = document.getElementById('wordsSizeGroup');
    const conjSizeSelectGroup = document.getElementById('conjSizeSelectGroup');
    const directionGroup      = document.getElementById('directionGroup');
    const recallTimerGroup    = document.getElementById('recallTimerGroup');
    const sortOrderGroup      = document.getElementById('sortOrderGroup');
    const conjDisplayGroup    = document.getElementById('conjDisplayGroup');
    const conjViewGroup       = document.getElementById('conjViewGroup');
    const conjModeControls    = document.getElementById('conjModeControls');
    const conjRandomTableSizeGroup = document.getElementById('conjRandomTableSizeGroup');
    const conjMatchStyleGroup      = document.getElementById('conjMatchStyleGroup');
    const pictureStyleGroup   = document.getElementById('pictureStyleGroup');
    const triviaStyleGroup    = document.getElementById('triviaStyleGroup');
    const triviaCategoryGroup = document.getElementById('triviaCategoryGroup');
    const guessBlankDiffGroup = document.getElementById('guessBlankDifficultyGroup');
    const triviaDiffGroup     = document.getElementById('triviaDifficultyGroup');
    const triviaReadingDiffGroup   = document.getElementById('triviaReadingDifficultyGroup');
    const triviaReadingLengthGroup = document.getElementById('triviaReadingLengthGroup');
    const tableStyleGroup     = document.getElementById('tableStyleGroup');
    const compareGroup        = document.getElementById('compareGroup');
    const presetsBtn          = document.getElementById('presetsBtn');

    // Trivia and Guess the Blank each draw from their own hand-written
    // question bank, not the vocabulary word list at all — see trivia-mode.ts
    // /guess-blank-mode.ts — so every word-list filter (and the Words/size
    // control itself) is meaningless on either tab. Trivia questions do carry
    // their own `domains` field now (see data/trivia-questions.ts), so the
    // Domains box is the one exception — it's real there, just reading from a
    // question bank instead of the vocabulary, so it gets its own narrower
    // condition below rather than joining noWordList.
    const noWordList = mode === 'trivia' || mode === 'guessBlank';
    const noDomains  = mode === 'guessBlank';
    // Settings' "hide this filter app-wide" toggles win over every per-mode
    // rule below — they're a stronger statement than any one mode's own
    // reason to show or hide the box.
    if (classFilter)         classFilter.style.display         = (Settings.getHidePOSFilter(mode)     || mode === 'conjugation' || noWordList) ? 'none' : '';
    // The list filter applies in conjugation mode too — Hide/Focus narrows the
    // verbs you drill just as it narrows any other quiz.
    if (listFilter)          listFilter.style.display          = (Settings.getHideListsFilter(mode)   || noWordList) ? 'none' : '';
    if (domainFilterWrap)    domainFilterWrap.style.display    = (Settings.getHideDomainsFilter(mode) || noDomains)  ? 'none' : '';
    // Conjugation gets its own verb-scaled word-count control (conjSizeSelectGroup)
    // instead of the vocabulary-wide one — see index.html's #conjSizeSelect.
    if (wordsSizeGroup)      wordsSizeGroup.style.display      = (noWordList || mode === 'conjugation') ? 'none' : '';
    // Same reasoning as the filters above: a saved Profile bundles exactly
    // those filters plus Direction, so it has nothing to apply on a tab that
    // doesn't show them (and currentScope() has no bucket for either mode).
    if (presetsBtn)           presetsBtn.style.display          = noWordList ? 'none' : '';
    // #controls reserves 8rem on the right for the ? button and the Profiles
    // pill beside it (controls-bar.css). Profiles is hidden on exactly these
    // same modes (line above) and has nothing to reserve room for there, so
    // give that space back to controls-top — Trivia's own row of filter
    // groups (Answer Style/Category/Difficulty/Reading Difficulty/Reading
    // Length) is wide enough that the wasted 8rem was enough on its own to
    // wrap it onto a second line.
    if (controlsEl) controlsEl.classList.toggle('controls--no-profiles', noWordList);
    if (conjSizeSelectGroup) conjSizeSelectGroup.style.display = mode === 'conjugation' ? '' : 'none';
    if (directionGroup)      directionGroup.style.display      = mode === 'table'       ? ''     : 'none';
    // Compare (two or more languages merged into one quiz) is supported by
    // Table and Conjugation — the other modes don't know how to render or
    // score a mixed-language word list.
    if (compareGroup)        compareGroup.style.display        = MULTI_LANG_MODES.has(mode) ? '' : 'none';
    // Table's own quiz-style toggle (Standard/Recall/Double Recall) has no
    // timer concept — recallTimerGroup is orphaned along with the standalone
    // Recall tab it belonged to, so it never shows any more.
    if (recallTimerGroup)    recallTimerGroup.style.display    = 'none';
    // Table and conjugation each carry their own order control inside the
    // quiz, so the global one would be a second, competing switch. Picture
    // mode has no in-quiz equivalent, so it keeps it. Trivia draws from a
    // fixed question bank rather than `list` at all, so word order is
    // meaningless there regardless.
    if (sortOrderGroup) {
      const hasOwnOrder = mode === 'table' || mode === 'conjugation' || noWordList;
      sortOrderGroup.style.display = hasOwnOrder ? 'none' : '';
    }
    if (conjModeControls)    conjModeControls.style.display    = mode === 'conjugation' ? ''     : 'none';
    if (conjDisplayGroup)    conjDisplayGroup.style.display    = mode === 'conjugation' ? ''     : 'none';
    if (conjViewGroup)       conjViewGroup.style.display       = mode === 'conjugation' ? ''     : 'none';
    // Only hidden here, never shown — syncConjViewToggle() (app.ts) owns
    // showing whichever one of these two matches the active Conjugation
    // sub-view, but it only ever runs while already on the Conjugation tab,
    // so it has no chance to hide them again on the way to another tab.
    // Leaving that to this generic per-mode sweep (which already owns every
    // other conjugation-only control group) means switching tabs can't leave
    // either stranded on screen.
    if (mode !== 'conjugation') {
      if (conjRandomTableSizeGroup) conjRandomTableSizeGroup.style.display = 'none';
      if (conjMatchStyleGroup)      conjMatchStyleGroup.style.display      = 'none';
    }
    if (pictureStyleGroup)   pictureStyleGroup.style.display   = mode === 'picture'     ? ''     : 'none';
    if (triviaStyleGroup)    triviaStyleGroup.style.display    = mode === 'trivia'      ? ''     : 'none';
    if (triviaCategoryGroup) triviaCategoryGroup.style.display = mode === 'trivia'      ? ''     : 'none';
    if (guessBlankDiffGroup) guessBlankDiffGroup.style.display = mode === 'guessBlank'  ? ''     : 'none';
    if (triviaDiffGroup)     triviaDiffGroup.style.display     = mode === 'trivia'      ? ''     : 'none';
    if (triviaReadingDiffGroup)   triviaReadingDiffGroup.style.display   = mode === 'trivia' ? '' : 'none';
    if (triviaReadingLengthGroup) triviaReadingLengthGroup.style.display = mode === 'trivia' ? '' : 'none';
    // table-controls.ts's syncTableStyleUI (called from app.ts's onActivate.table)
    // further hides Direction/#tableControls/the jump bars once this is visible
    // and a non-Standard style is selected.
    if (tableStyleGroup)     tableStyleGroup.style.display     = mode === 'table'       ? ''     : 'none';

    document.querySelectorAll<HTMLElement>('.mode-tab').forEach(btn => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      if (isActive && scrollTabIntoView) btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });

    onActivate[mode]?.();
  }

  document.querySelectorAll<HTMLElement>('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode || 'table';
      updateModeUI();
    });
  });

  return { updateModeUI };
}
