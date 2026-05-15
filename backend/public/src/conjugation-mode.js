/**
 * conjugation-mode.js
 *
 * Conjugation drill — multi-card 2-col grid with dual progress bars
 * (full verbs + individual forms) and a Give Up button.
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

  // ── External controls ────────────────────────────────────────────────────
  const tenseSelect   = document.getElementById('conjTenseSelect');
  const displayToggle = document.getElementById('conjDisplayToggle');

  function getTenseKey()    { return tenseSelect?.value || tenseDefs[0].key; }
  function getDisplayMode() { return displayToggle?.querySelector('.conj-toggle-btn.active')?.dataset.mode || 'both'; }

  // ── Progress section ──────────────────────────────────────────────────────
  const progressSection = document.createElement('div');
  progressSection.className = 'conj-progress-section';

  // Two bars
  const barsWrap = document.createElement('div');
  barsWrap.className = 'conj-prog-bars';

  function makeBar(labelText) {
    const row   = document.createElement('div');
    row.className = 'conj-prog-row';

    const label = document.createElement('span');
    label.className   = 'conj-prog-label';
    label.textContent = labelText;

    const track = document.createElement('div');
    track.className = 'conj-prog-track';
    const fill = document.createElement('div');
    fill.className = 'conj-prog-fill';
    track.appendChild(fill);

    const stat = document.createElement('span');
    stat.className = 'conj-prog-stat';

    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(stat);
    barsWrap.appendChild(row);

    return { fill, stat };
  }

  const { fill: verbsFill, stat: verbsStat } = makeBar('Verbs');
  const { fill: formsFill, stat: formsStat } = makeBar('Forms');

  // Give Up button
  const giveUpBtn = document.createElement('button');
  giveUpBtn.className   = 'conj-giveup-btn';
  giveUpBtn.textContent = 'Give Up';

  progressSection.appendChild(barsWrap);
  progressSection.appendChild(giveUpBtn);

  // ── Cards grid ────────────────────────────────────────────────────────────
  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'conj-cards-grid';

  const cardUpdaters = [];

  verbs.forEach(verb => {
    const { card, updateHeader, updateInputs, revealAnswers } =
      buildCard(verb, pronouns, getTenseKey, getDisplayMode, updateProgress);
    cardsGrid.appendChild(card);
    cardUpdaters.push({ updateHeader, updateInputs, revealAnswers });
  });

  container.appendChild(progressSection);
  container.appendChild(cardsGrid);

  // ── Progress updater ──────────────────────────────────────────────────────
  // Reads from the live DOM so it's always accurate, even after tense switches.
  function updateProgress() {
    const allCards = cardsGrid.querySelectorAll('.conj-card');
    let totalForms   = 0;
    let correctForms = 0;
    let completeVerbs = 0;

    allCards.forEach(card => {
      const inputs  = card.querySelectorAll('.conj-drill-input');
      const correct = card.querySelectorAll('.conj-drill-input.correct');
      totalForms   += inputs.length;
      correctForms += correct.length;
      if (inputs.length > 0 && correct.length === inputs.length) completeVerbs++;
    });

    const verbPct = allCards.length ? (completeVerbs / allCards.length) * 100 : 0;
    const formPct = totalForms      ? (correctForms  / totalForms)      * 100 : 0;

    verbsFill.style.width = verbPct + '%';
    formsFill.style.width = formPct + '%';
    verbsStat.textContent = `${completeVerbs} / ${allCards.length} complete`;
    formsStat.textContent = `${correctForms} / ${totalForms} correct`;
  }

  // Initial render of stats
  updateProgress();

  // ── Give Up ───────────────────────────────────────────────────────────────
  giveUpBtn.addEventListener('click', () => {
    cardUpdaters.forEach(u => u.revealAnswers());
    giveUpBtn.disabled = true;
    updateProgress();
  });

  // ── External control listeners ────────────────────────────────────────────
  const handleTenseChange = () => {
    giveUpBtn.disabled = false;
    cardUpdaters.forEach(u => u.updateInputs());
    updateProgress();
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

function buildCard(verb, pronouns, getTenseKey, getDisplayMode, onProgressChange) {
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

  // Inner 2-col pronoun grid (CSS grid-auto-flow: column flows 3 rows per col)
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

    row.appendChild(label);
    row.appendChild(inp);
    innerGrid.appendChild(row);
    inputs.push(inp);
  });

  card.appendChild(header);
  card.appendChild(innerGrid);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  function addNavigation(inp, i) {
    inp.addEventListener('keydown', e => {
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
  }

  // ── Attach live answer-checking ───────────────────────────────────────────
  // Replaces each input with a fresh clone to remove old listeners, then
  // re-attaches checking + navigation for the current tense.
  function attachChecking() {
    const answers = verb.linguistic?.conjugations?.[getTenseKey()] || null;

    inputs.forEach((inp, i) => {
      const fresh = inp.cloneNode(true);
      inp.parentNode.replaceChild(fresh, inp);
      inputs[i] = fresh;

      addNavigation(fresh, i);

      fresh.addEventListener('input', () => {
        if (!answers) return;
        const correct = normalize(fresh.value) === normalize(answers[i] || '');
        const wasCorrect = fresh.classList.contains('correct');
        fresh.classList.toggle('correct', correct);
        if (correct && !wasCorrect) {
          fresh.disabled = true;
          // Advance to next unlocked input
          let next = (i + 1) % inputs.length;
          while (inputs[next].disabled && next !== i) next = (next + 1) % inputs.length;
          if (next !== i) inputs[next].focus();
          onProgressChange();
        }
      });
    });
  }

  // ── Public updaters ───────────────────────────────────────────────────────

  function updateInputs() {
    inputs.forEach(inp => {
      inp.value    = '';
      inp.disabled = false;
      inp.classList.remove('correct', 'revealed');
    });
    attachChecking();
  }

  function revealAnswers() {
    const answers = verb.linguistic?.conjugations?.[getTenseKey()] || null;
    inputs.forEach((inp, i) => {
      if (!inp.classList.contains('correct')) {
        inp.value = answers?.[i] ?? '—';
        inp.classList.add('revealed');
        inp.disabled = true;
      }
    });
  }

  // Initial setup
  updateHeader();
  attachChecking();

  return { card, updateHeader, updateInputs, revealAnswers };
}
