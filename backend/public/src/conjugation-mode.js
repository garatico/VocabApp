/**
 * conjugation-mode.js
 *
 * Conjugation drill — multi-card grid (2 columns of verb cards),
 * live green checking, display toggle, tense selector.
 */

// ── Data ──────────────────────────────────────────────────────────────────────

const PRONOUNS = {
  spanish:    ['yo', 'tú', 'él / ella', 'nosotros', 'vosotros', 'ellos / ellas'],
  portuguese: ['eu', 'tu', 'ele / ela', 'nós',      'vós',      'eles / elas'],
  italian:    ['io', 'tu', 'lui / lei', 'noi',       'voi',      'loro'],
  french:     ['je', 'tu', 'il / elle', 'nous',      'vous',     'ils / elles'],
};

const TENSE_DEFS = {
  spanish: [
    { key: 'present',             label: 'Presente' },
    { key: 'preterite',           label: 'Pretérito Indefinido' },
    { key: 'imperfect',           label: 'Pretérito Imperfecto' },
    { key: 'future',              label: 'Futuro' },
    { key: 'conditional',         label: 'Condicional' },
    { key: 'subjunctive_present', label: 'Subjuntivo Presente' },
  ],
  portuguese: [
    { key: 'present',             label: 'Presente' },
    { key: 'preterite',           label: 'Pretérito Perfeito' },
    { key: 'imperfect',           label: 'Pretérito Imperfeito' },
    { key: 'future',              label: 'Futuro' },
    { key: 'conditional',         label: 'Condicional' },
    { key: 'subjunctive_present', label: 'Subjuntivo Presente' },
  ],
  italian: [
    { key: 'present',             label: 'Presente' },
    { key: 'imperfect',           label: 'Imperfetto' },
    { key: 'future',              label: 'Futuro Semplice' },
    { key: 'conditional',         label: 'Condizionale' },
    { key: 'subjunctive_present', label: 'Congiuntivo Presente' },
  ],
  french: [
    { key: 'present',             label: 'Présent' },
    { key: 'imperfect',           label: 'Imparfait' },
    { key: 'future',              label: 'Futur Simple' },
    { key: 'conditional',         label: 'Conditionnel' },
    { key: 'subjunctive_present', label: 'Subjonctif Présent' },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Accent- and case-insensitive so "estas" matches "estás". */
function normalize(s) {
  return s.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderConjugationMode({ words, container, lang = 'spanish' }) {
  container.innerHTML = '';

  const verbs = words.filter(w => w.pos === 'verb');

  if (verbs.length === 0) {
    container.innerHTML = `
      <div class="conj-empty">
        <p>No verbs in the current word list.</p>
        <p class="conj-empty-hint">Make sure "Verbs" is checked in the class filter, then hit Start Quiz again.</p>
      </div>`;
    return;
  }

  const pronouns  = PRONOUNS[lang]   || PRONOUNS.spanish;
  const tenseDefs = TENSE_DEFS[lang] || TENSE_DEFS.spanish;

  // Shared state
  const state = {
    tenseKey:    tenseDefs[0].key,
    displayMode: 'both',   // 'spanish' | 'english' | 'both'
  };

  // Registry of per-card updaters
  const cardUpdaters = [];

  // ── Controls bar ──────────────────────────────────────────────────────────
  const controlsBar = document.createElement('div');
  controlsBar.className = 'conj-controls-bar';

  // Display toggle
  const toggleGroup = document.createElement('div');
  toggleGroup.className = 'conj-display-toggle';
  [
    { value: 'spanish', label: 'Spanish' },
    { value: 'both',    label: 'Both' },
    { value: 'english', label: 'English' },
  ].forEach(opt => {
    const btn = document.createElement('button');
    btn.className    = 'conj-toggle-btn' + (opt.value === state.displayMode ? ' active' : '');
    btn.textContent  = opt.label;
    btn.dataset.mode = opt.value;
    btn.addEventListener('click', () => {
      state.displayMode = opt.value;
      toggleGroup.querySelectorAll('.conj-toggle-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.mode === state.displayMode)
      );
      cardUpdaters.forEach(u => u.updateHeader());
    });
    toggleGroup.appendChild(btn);
  });

  // Tense select
  const tenseSelect = document.createElement('select');
  tenseSelect.className = 'conj-tense-select';
  tenseDefs.forEach(def => {
    const opt = document.createElement('option');
    opt.value       = def.key;
    opt.textContent = def.label;
    tenseSelect.appendChild(opt);
  });
  tenseSelect.addEventListener('change', () => {
    state.tenseKey = tenseSelect.value;
    cardUpdaters.forEach(u => u.updateInputs());
  });

  controlsBar.appendChild(toggleGroup);
  controlsBar.appendChild(tenseSelect);

  // ── Cards grid ────────────────────────────────────────────────────────────
  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'conj-cards-grid';

  verbs.forEach(verb => {
    const { card, updateHeader, updateInputs } = buildCard(verb, pronouns, state);
    cardsGrid.appendChild(card);
    cardUpdaters.push({ updateHeader, updateInputs });
  });

  container.appendChild(controlsBar);
  container.appendChild(cardsGrid);
}

// ── Build a single verb card ──────────────────────────────────────────────────

function buildCard(verb, pronouns, state) {
  const card = document.createElement('div');
  card.className = 'conj-card';

  // Header
  const header = document.createElement('div');
  header.className = 'conj-card-header';

  const spanishEl = document.createElement('div');
  spanishEl.className = 'conj-verb-spanish';

  const englishEl = document.createElement('div');
  englishEl.className = 'conj-verb-english';

  header.appendChild(spanishEl);
  header.appendChild(englishEl);

  function updateHeader() {
    spanishEl.textContent = verb.word;
    englishEl.textContent = verb.display || verb.glosses?.join(', ') || '';
    spanishEl.hidden = state.displayMode === 'english';
    englishEl.hidden = state.displayMode === 'spanish';
  }

  // Inner 2-col pronoun grid
  const innerGrid = document.createElement('div');
  innerGrid.className = 'conj-inner-grid';

  // Build all 6 rows (3 per visual column)
  const inputs = [];

  pronouns.forEach((pronoun, i) => {
    const row = document.createElement('div');
    row.className = 'conj-row' + (i === 2 ? ' conj-row-last-left' : i === 5 ? ' conj-row-last-right' : '');

    const label = document.createElement('span');
    label.className   = 'conj-pronoun';
    label.textContent = pronoun;

    const inp = document.createElement('input');
    inp.type          = 'text';
    inp.className     = 'conj-drill-input';
    inp.autocomplete  = 'off';
    inp.autocorrect   = 'off';
    inp.autocapitalize = 'off';
    inp.spellcheck    = false;
    inp.placeholder   = '…';

    row.appendChild(label);
    row.appendChild(inp);
    innerGrid.appendChild(row);
    inputs.push(inp);
  });

  // Tab / Enter navigation across all 6 inputs
  inputs.forEach((inp, i) => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        inputs[(i + 1) % inputs.length].focus();
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        inputs[(i - 1 + inputs.length) % inputs.length].focus();
      }
    });
  });

  function updateInputs() {
    const answers = verb.linguistic?.conjugations?.[state.tenseKey] || null;
    inputs.forEach((inp, i) => {
      inp.value = '';
      inp.classList.remove('correct');

      // Rebuild listener fresh (removes old one)
      const fresh = inp.cloneNode(true);
      inp.parentNode.replaceChild(fresh, inp);
      inputs[i] = fresh;

      fresh.addEventListener('input', () => {
        if (!answers) return;
        const correct = normalize(fresh.value) === normalize(answers[i] || '');
        fresh.classList.toggle('correct', correct && fresh.value !== '');
      });

      fresh.addEventListener('keydown', e => {
        if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
          e.preventDefault();
          inputs[(i + 1) % inputs.length].focus();
        } else if (e.key === 'Tab' && e.shiftKey) {
          e.preventDefault();
          inputs[(i - 1 + inputs.length) % inputs.length].focus();
        }
      });
    });
  }

  // Initial setup
  function init() {
    updateHeader();
    const answers = verb.linguistic?.conjugations?.[state.tenseKey] || null;
    inputs.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        if (!answers) return;
        const correct = normalize(inp.value) === normalize(answers[i] || '');
        inp.classList.toggle('correct', correct && inp.value !== '');
      });
    });
  }

  card.appendChild(header);
  card.appendChild(innerGrid);
  init();

  return { card, updateHeader, updateInputs };
}
