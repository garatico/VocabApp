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

export function bindModeSwitch({ modeSelect, quizArea, tableArea, recallArea }) {
  function updateModeUI() {
    const mode = modeSelect.value;
    quizArea.hidden   = mode !== 'single';
    tableArea.hidden  = mode !== 'table';
    recallArea.hidden = mode !== 'recall';
  }

  modeSelect.addEventListener('change', updateModeUI);
  return { updateModeUI };
}