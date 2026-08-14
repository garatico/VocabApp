type CoreMode = 'table' | 'recall' | 'single' | 'picture' | 'conjugation';
type Mode = CoreMode | string;

interface BindModeSwitchOptions {
  quizArea:         HTMLElement;
  tableArea:        HTMLElement;
  recallArea:       HTMLElement;
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
  quizArea, tableArea, recallArea, pictureArea, conjugationArea,
  extraAreas = {},
  onActivate = {},
}: BindModeSwitchOptions): { updateModeUI: () => void } {
  let currentMode: Mode = 'table';

  function updateModeUI(): void {
    const mode = currentMode;

    quizArea.hidden    = mode !== 'single';
    tableArea.hidden   = mode !== 'table';
    recallArea.hidden  = mode !== 'recall';
    pictureArea.hidden = mode !== 'picture';
    if (conjugationArea) conjugationArea.hidden = mode !== 'conjugation';

    for (const [areaMode, el] of Object.entries(extraAreas)) {
      if (el) el.hidden = mode !== areaMode;
    }

    // Hide the entire controls card for modes that don't use it
    const controlsEl = document.getElementById('controls');
    if (controlsEl) controlsEl.hidden = mode === 'mylists' || mode === 'settings';

    const classFilter         = document.getElementById('classFilter');
    const listFilter          = document.getElementById('listFilter');
    const directionGroup      = document.getElementById('directionGroup');
    const conjModeControls    = document.getElementById('conjModeControls');
    const pictureModeControls = document.getElementById('pictureModeControls');

    if (classFilter)         classFilter.style.display         = mode === 'conjugation' ? 'none' : '';
    // The list filter applies in conjugation mode too — Hide/Focus narrows the
    // verbs you drill just as it narrows any other quiz.
    if (listFilter)          listFilter.style.display          = '';
    if (directionGroup)      directionGroup.style.display      = mode === 'table'       ? ''     : 'none';
    if (conjModeControls)    conjModeControls.style.display    = mode === 'conjugation' ? ''     : 'none';
    if (pictureModeControls) pictureModeControls.style.display = mode === 'picture'     ? ''     : 'none';

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
