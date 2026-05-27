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
  const sizeSelect     = document.getElementById('sizeSelect')     as HTMLSelectElement;
  const recallTimer    = document.getElementById('recallTimer')    as HTMLSelectElement;
  const recallHardStop = document.getElementById('recallHardStop') as HTMLSelectElement;

  sizeSelect.addEventListener('change', () => {
    const custom = document.getElementById('sizeCustom') as HTMLInputElement;
    custom.style.display = sizeSelect.value === 'custom' ? 'inline-block' : 'none';
    if (sizeSelect.value === 'custom') custom.focus();
  });

  recallTimer.addEventListener('change', () => {
    const val           = recallTimer.value;
    const customEl      = document.getElementById('recallTimerCustom') as HTMLInputElement;
    const hardStopLabel = recallHardStop.closest('label') as HTMLElement | null;
    customEl.style.display = val === 'custom' ? 'inline-block' : 'none';
    if (hardStopLabel) hardStopLabel.style.display = val === '0' ? 'none' : '';
    if (val === 'custom') customEl.focus();
  });
}

export function bindModeSwitch({
  quizArea, tableArea, recallArea, pictureArea, conjugationArea,
  extraAreas = {},
  onActivate = {},
}: BindModeSwitchOptions): { updateModeUI: () => void } {
  let currentMode: Mode = 'table';

  function updateModeUI(): void {
    const mode      = currentMode;
    const isMyLists = mode === 'mylists';

    quizArea.hidden    = mode !== 'single';
    tableArea.hidden   = mode !== 'table';
    recallArea.hidden  = mode !== 'recall';
    pictureArea.hidden = mode !== 'picture';
    if (conjugationArea) conjugationArea.hidden = mode !== 'conjugation';

    for (const [areaMode, el] of Object.entries(extraAreas)) {
      if (el) el.hidden = mode !== areaMode;
    }

    // Hide the entire controls card when My Lists is active
    const controlsEl = document.getElementById('controls');
    if (controlsEl) controlsEl.hidden = isMyLists;

    const classFilter         = document.getElementById('classFilter');
    const tableModeControls   = document.getElementById('tableModeControls');
    const conjModeControls    = document.getElementById('conjModeControls');
    const pictureModeControls = document.getElementById('pictureModeControls');

    if (classFilter)         classFilter.style.display         = mode === 'conjugation' ? 'none' : '';
    if (tableModeControls)   tableModeControls.style.display   = mode === 'table'       ? ''     : 'none';
    if (conjModeControls)    conjModeControls.style.display    = mode === 'conjugation' ? ''     : 'none';
    if (pictureModeControls) pictureModeControls.style.display = mode === 'picture'     ? ''     : 'none';

    document.querySelectorAll('.mode-tab').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.mode === mode);
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
