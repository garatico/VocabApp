/**
 * conjugation-mode.js
 *
 * Conjugation drill — multi-card 2-col grid.
 * Controls (display toggle + tense) live in the main filter bar (#conjModeControls).
 * Correct answers lock the input so it can't be changed.
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

function normalize(s) {
  return s.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ── Pre-populate the tense select (called before Start Quiz) ─────────────────

export function populateConjTenses(lang) {
  const tenseDefs   = TENSE_DEFS[lang] || TENSE_DEFS.spanish;
  const tenseSelect = document.getElementById('conjTenseSelect');
  if (!tenseSelect) return;

  // Preserve current selection if it still exists in the new list
  const prev = tenseSelect.value;
  tenseSelect.innerHTML = '';
  tenseDefs.forEach(def => {
    const opt       = document.createElement('option');
    opt.value       = def.key;
    opt.textContent = def.label;
    if (def.key === prev) opt.selected = true;
    tenseSelect.appendChild(opt);
  });
}

// ── Module-level cleanup for external control listeners ───────────────────────

let _cleanup = null;

// ── Main render ───────────────────────────────────────────────────────────────

export function renderConjugationMode({ words, container, lang = 'spanish' }) {
  // Tear down previous event listeners on external controls
  if (_cleanup) { _cleanup(); _cleanup = null; }

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

  // ── Hook up external controls (already populated by populateConjTenses) ──
  const tenseSelect   = document.getElementById('conjTenseSelect');
  const displayToggle = document.getElementById('conjDisplayToggle');

  // ── Shared state (read from DOM so it survives re-renders) ────────────────
  function getTenseKey() {
    return tenseSelect?.value || tenseDefs[0].key;
  }
  function getDisplayMode() {
    return displayToggle?.querySelector('.conj-toggle-btn.active')?.dataset.mode || 'both';
  }

  // ── Build cards grid ──────────────────────────────────────────────────────
  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'conj-cards-grid';

  const cardUpdaters = [];

  verbs.forEach(verb => {
    const { card, updateHeader, updateInputs } = buildCard(verb, pronouns, getTenseKey, getDisplayMode);
    cardsGrid.appendChild(card);
    cardUpdaters.push({ updateHeader, updateInputs });
  });

  container.appendChild(cardsGrid);

  // ── Wire external controls ────────────────────────────────────────────────
  const handleTenseChange = () => {
    cardUpdaters.forEach(u => u.updateInputs());
  };

  const handleDisplayClick = (e) => {
    const btn = e.target.closest('.conj-toggle-btn');
    if (!btn || !displayToggle?.contains(btn)) return;
    displayToggle.querySelectorAll('.conj-toggle-btn')
      .forEach(b => b.classList.toggle('active', b === btn));
    cardUpdaters.forEach(u => u.updateHeader());
  };

  tenseSelect?.addEventListener('change', handleTenseChange);
  displayToggle?.addEventListener('click', handleDisplayClick);

  _cleanup = () => {
    tenseSelect?.removeEventListener('change', handleTenseChange);
    displayToggle?.removeEventListener('click', handleDisplayClick);
  };
}

// ── Build one verb card ───────────────────────────────────────────────────────

function buildCard(verb, pronouns, getTenseKey, getDisplayMode) {
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
    const mode = getDisplayMode();
    spanishEl.textContent = verb.word;
    englishEl.textContent = verb.display || verb.glosses?.join(', ') || '';
    spanishEl.hidden = mode === 'english';
    englishEl.hidden = mode === 'spanish';
  }

  // Inner grid — 6 rows, CSS flows them into 2 columns of 3
  const innerGrid = document.createElement('div');
  innerGrid.className = 'conj-inner-grid';

  const inputs = [];

  pronouns.forEach((pronoun, i) => {
    const row = document.createElement('div');
    row.className = 'conj-row';

    const label = document.createElement('span');
    label.className   = 'conj-pronoun';
    label.textContent = pronoun;

    const inp = document.createElement('input');
    inp.type           = 'text';
    inp.className      = 'conj-drill-input';
    inp.autocomplete   = 'off';
    inp.autocorrect    = 'off';
    inp.autocapitalize = 'off';
    inp.spellcheck     = false;
    inp.placeholder    = '…';

    // Tab / Enter navigation
    inp.addEventListener('keydown', e => {
      const all = inputs;
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        // Skip locked (correct) inputs
        let next = (i + 1) % all.length;
        while (all[next].disabled && next !== i) next = (next + 1) % all.length;
        all[next].focus();
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        let prev = (i - 1 + all.length) % all.length;
        while (all[prev].disabled && prev !== i) prev = (prev - 1 + all.length) % all.length;
        all[prev].focus();
      }
    });

    row.appendChild(label);
    row.appendChild(inp);
    innerGrid.appendChild(row);
    inputs.push(inp);
  });

  function attachChecking() {
    const answers = verb.linguistic?.conjugations?.[getTenseKey()] || null;
    inputs.forEach((inp, i) => {
      // Remove old listener by replacing node, preserving keydown
      const fresh = inp.cloneNode(true);
      inp.parentNode.replaceChild(fresh, inp);
      inputs[i] = fresh;

      // Re-attach keydown
      fresh.addEventListener('keydown', e => {
        if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
          e.preventDefault();
          let next = (i + 1) % inputs.length;
          while (inputs[next].disabled && next !== i) next = (next + 1) % inputs.length;
          inputs[next].focus();
        } else if (e.key === 'Tab' && e.shiftKey) {
          e.preventDefault();
          let prev = (i - 1 + inputs.length) % inputs.length;
          while (inputs[prev].disabled && prev !== i) prev = (prev - 1 + inputs.length) % inputs.length;
          inputs[prev].focus();
        }
      });

      // Live answer check
      fresh.addEventListener('input', () => {
        if (!answers) return;
        const correct = normalize(fresh.value) === normalize(answers[i] || '');
        fresh.classList.toggle('correct', correct);
        if (correct) {
          fresh.disabled = true;   // lock it in
          // Move focus to next unlocked input
          let next = (i + 1) % inputs.length;
          while (inputs[next].disabled && next !== i) next = (next + 1) % inputs.length;
          if (next !== i) inputs[next].focus();
        }
      });
    });
  }

  function updateInputs() {
    inputs.forEach(inp => {
      inp.value    = '';
      inp.disabled = false;
      inp.classList.remove('correct');
    });
    attachChecking();
  }

  card.appendChild(header);
  card.appendChild(innerGrid);

  // Initial setup
  updateHeader();
  attachChecking();

  return { card, updateHeader, updateInputs };
}
