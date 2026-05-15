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

export function bindModeSwitch({ quizArea, tableArea, recallArea }) {
  let currentMode = 'single';

  function updateModeUI() {
    const mode = currentMode;
    quizArea.hidden   = mode !== 'single';
    tableArea.hidden  = mode !== 'table';
    recallArea.hidden = mode !== 'recall';

    // Update active tab button
    document.querySelectorAll('.mode-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
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