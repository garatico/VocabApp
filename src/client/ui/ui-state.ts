type CoreMode = 'table' | 'picture' | 'conjugation';
type Mode = CoreMode | string;

/** Modes that know how to render/score a mixed-language word list — mirrors app.ts's own copy. */
const MULTI_LANG_MODES = new Set(['table', 'conjugation']);

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
}: BindModeSwitchOptions): { updateModeUI: () => void } {
  let currentMode: Mode = 'table';

  function updateModeUI(): void {
    const mode = currentMode;

    tableArea.hidden   = mode !== 'table';
    pictureArea.hidden = mode !== 'picture';
    if (conjugationArea) conjugationArea.hidden = mode !== 'conjugation';

    for (const [areaMode, el] of Object.entries(extraAreas)) {
      if (el) el.hidden = mode !== areaMode;
    }

    // Hide the entire controls card for modes that don't use it
    const controlsEl = document.getElementById('controls');
    if (controlsEl) controlsEl.hidden = mode === 'mylists' || mode === 'settings' || mode === 'history';

    const classFilter         = document.getElementById('classFilter');
    const listFilter          = document.getElementById('listFilter');
    const domainFilterWrap    = document.getElementById('domainFilterWrap');
    const wordsSizeGroup      = document.getElementById('wordsSizeGroup');
    const directionGroup      = document.getElementById('directionGroup');
    const recallTimerGroup    = document.getElementById('recallTimerGroup');
    const sortOrderGroup      = document.getElementById('sortOrderGroup');
    const conjDisplayGroup    = document.getElementById('conjDisplayGroup');
    const conjViewGroup       = document.getElementById('conjViewGroup');
    const conjModeControls    = document.getElementById('conjModeControls');
    const pictureStyleGroup   = document.getElementById('pictureStyleGroup');
    const triviaStyleGroup    = document.getElementById('triviaStyleGroup');
    const tableStyleGroup     = document.getElementById('tableStyleGroup');
    const compareGroup        = document.getElementById('compareGroup');

    // Trivia draws from its own general-knowledge question bank, not the
    // vocabulary word list at all — see trivia-mode.ts — so every word-list
    // filter (and the Words/size control itself) is meaningless there.
    if (classFilter)         classFilter.style.display         = (mode === 'conjugation' || mode === 'trivia') ? 'none' : '';
    // The list filter applies in conjugation mode too — Hide/Focus narrows the
    // verbs you drill just as it narrows any other quiz.
    if (listFilter)          listFilter.style.display          = mode === 'trivia' ? 'none' : '';
    if (domainFilterWrap)    domainFilterWrap.style.display    = mode === 'trivia' ? 'none' : '';
    if (wordsSizeGroup)      wordsSizeGroup.style.display      = mode === 'trivia' ? 'none' : '';
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
      const hasOwnOrder = mode === 'table' || mode === 'conjugation' || mode === 'trivia';
      sortOrderGroup.style.display = hasOwnOrder ? 'none' : '';
    }
    if (conjModeControls)    conjModeControls.style.display    = mode === 'conjugation' ? ''     : 'none';
    if (conjDisplayGroup)    conjDisplayGroup.style.display    = mode === 'conjugation' ? ''     : 'none';
    if (conjViewGroup)       conjViewGroup.style.display       = mode === 'conjugation' ? ''     : 'none';
    if (pictureStyleGroup)   pictureStyleGroup.style.display   = mode === 'picture'     ? ''     : 'none';
    if (triviaStyleGroup)    triviaStyleGroup.style.display    = mode === 'trivia'      ? ''     : 'none';
    // table-controls.ts's syncTableStyleUI (called from app.ts's onActivate.table)
    // further hides Direction/#tableControls/the jump bars once this is visible
    // and a non-Standard style is selected.
    if (tableStyleGroup)     tableStyleGroup.style.display     = mode === 'table'       ? ''     : 'none';

    document.querySelectorAll<HTMLElement>('.mode-tab').forEach(btn => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      if (isActive) btn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
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
