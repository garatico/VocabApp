export function bindUIState() {
  const sizeSelect     = document.getElementById('sizeSelect');
  const recallTimer    = document.getElementById('recallTimer');
  const recallHardStop = document.getElementById('recallHardStop');

  sizeSelect.addEventListener('change', () => {
    const custom = document.getElementById('sizeCustom');
    custom.style.display = sizeSelect.value === 'custom' ? 'inline-block' : 'none';
    if (sizeSelect.value === 'custom') custom.focus();
  });

  recallTimer.addEventListener('change', () => {
    const val           = recallTimer.value;
    const customEl      = document.getElementById('recallTimerCustom');
    const hardStopLabel = recallHardStop.closest('label');
    customEl.style.display      = val === 'custom' ? 'inline-block' : 'none';
    hardStopLabel.style.display = val === '0'      ? 'none'         : '';
    if (val === 'custom') customEl.focus();
  });
}

export function bindModeSwitch({ quizArea, tableArea, recallArea, pictureArea, conjugationArea, onActivate = {} }) {
  let currentMode = 'table';

  function updateModeUI() {
    const mode = currentMode;
    quizArea.hidden         = mode !== 'single';
    tableArea.hidden        = mode !== 'table';
    recallArea.hidden       = mode !== 'recall';
    pictureArea.hidden      = mode !== 'picture';
    if (conjugationArea) conjugationArea.hidden = mode !== 'conjugation';

    // Show conjugation controls / hide POS filter in conjugation mode.
    // Use style.display — the hidden attribute is overridden by explicit display:flex in CSS.
    const classFilter      = document.getElementById('classFilter');
    const conjModeControls = document.getElementById('conjModeControls');
    if (classFilter)      classFilter.style.display      = mode === 'conjugation' ? 'none' : '';
    if (conjModeControls) conjModeControls.style.display = mode === 'conjugation' ? ''     : 'none';

    // Update active tab button
    document.querySelectorAll('.mode-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Fire mode-specific activation callback
    onActivate[mode]?.();
  }

  // Handle tab button clicks
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode;
      updateModeUI();
    });
  });

  return { updateModeUI };
}