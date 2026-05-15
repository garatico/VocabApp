/**
 * conjugation-mode.js
 *
 * Conjugation drill — multi-card 2-col grid, dual progress bars,
 * Give Up, per-pronoun form toggles, dynamic display labels.
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

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Module-level state ────────────────────────────────────────────────────────

let _cleanup        = null;
let _updateProgress = null;   // called by pronoun-toggle listener
let _lastConjLang   = null;   // tracks last language so toggles aren't reset on re-render

// ── Public: initialise all controls in the filter bar for a given language ────
// Call this when the Conjugation tab activates or the language changes.

export function initConjControls(lang) {
  const tenseDefs = TENSE_DEFS[lang] || TENSE_DEFS.spanish;
  const pronouns  = PRONOUNS[lang]   || PRONOUNS.spanish;
  const langName  = capitalize(lang);

  // 1. Tense select
  const tenseSelect = document.getElementById('conjTenseSelect');
  if (tenseSelect) {
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

  // 2. Display toggle labels
  const displayToggle = document.getElementById('conjDisplayToggle');
  if (displayToggle) {
    const targetBtn = displayToggle.querySelector('[data-mode="target"]');
    const bothBtn   = displayToggle.querySelector('[data-mode="both"]');
    if (targetBtn) targetBtn.textContent = langName;
    if (bothBtn)   bothBtn.textContent   = `${langName} + English`;
  }

  // 3. Attach control listeners (idempotent — only fires once each)
  ensurePronounToggleListener();
  ensureFormsAllNoneListeners();

  // 4. Pronoun form toggles — only rebuild when the language changes.
  //    If the same language, leave existing toggle states untouched so that
  //    user selections survive Start Quiz (which re-fires initConjControls).
  const togglesContainer = document.getElementById('conjPronounToggles');
  if (togglesContainer && lang !== _lastConjLang) {
    togglesContainer.innerHTML = '';
    pronouns.forEach((pronoun, i) => {
      const btn = document.createElement('button');
      btn.type            = 'button';
      btn.className       = 'conj-pronoun-toggle active';
      btn.dataset.pi      = i;
      btn.dataset.enabled = 'true';
      btn.textContent     = pronoun;
      togglesContainer.appendChild(btn);
    });
  }

  _lastConjLang = lang;
}

// Attach listeners once (safe to call multiple times — deduped by flags).
let _pronTogListenerAttached  = false;
let _formsAllNoneAttached     = false;

function ensurePronounToggleListener() {
  if (_pronTogListenerAttached) return;
  _pronTogListenerAttached = true;

  const container = document.getElementById('conjPronounToggles');
  if (!container) return;

  container.addEventListener('click', e => {
    const btn = e.target.closest('.conj-pronoun-toggle');
    if (!btn) return;

    const nowEnabled    = btn.dataset.enabled !== 'true';  // flip
    btn.dataset.enabled = nowEnabled ? 'true' : 'false';
    btn.classList.toggle('active', nowEnabled);

    // Apply to current cards grid if a quiz is already running
    const grid = document.querySelector('.conj-cards-grid');
    if (grid) {
      applyPronounToggle(parseInt(btn.dataset.pi), nowEnabled, grid);
      _updateProgress?.();
    }
  });
}

function ensureFormsAllNoneListeners() {
  if (_formsAllNoneAttached) return;
  _formsAllNoneAttached = true;

  function setAll(enabled) {
    document.querySelectorAll('#conjPronounToggles .conj-pronoun-toggle').forEach(btn => {
      btn.dataset.enabled = enabled ? 'true' : 'false';
      btn.classList.toggle('active', enabled);
    });
    const grid = document.querySelector('.conj-cards-grid');
    if (grid) { applyAllPronounToggles(grid); _updateProgress?.(); }
  }

  document.getElementById('conjFormsAll') ?.addEventListener('click', () => setAll(true));
  document.getElementById('conjFormsNone')?.addEventListener('click', () => setAll(false));
}

// ── Apply one pronoun index's enabled/disabled state to the cards grid ────────

function applyPronounToggle(idx, enabled, grid) {
  grid.querySelectorAll(`.conj-row[data-pi="${idx}"]`).forEach(row => {
    row.classList.toggle('conj-row-hidden', !enabled);
    const inp = row.querySelector('.conj-drill-input');
    if (!inp) return;
    if (!enabled) {
      inp.disabled = true;
    } else {
      inp.disabled = inp.classList.contains('correct') || inp.classList.contains('revealed');
    }
  });
}

// Apply ALL current pronoun toggle states — used after initial render or tense switch.
function applyAllPronounToggles(grid) {
  document.querySelectorAll('#conjPronounToggles .conj-pronoun-toggle').forEach(btn => {
    applyPronounToggle(parseInt(btn.dataset.pi), btn.dataset.enabled !== 'false', grid);
  });
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderConjugationMode({ words, container, lang = 'spanish' }) {
  if (_cleanup) { _cleanup(); _cleanup = null; }
  _updateProgress = null;

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

  // ── External controls ──────────────────────────────────────────────────────
  const tenseSelect   = document.getElementById('conjTenseSelect');
  const displayToggle = document.getElementById('conjDisplayToggle');

  function getTenseKey()    { return tenseSelect?.value || tenseDefs[0].key; }
  function getDisplayMode() {
    return displayToggle?.querySelector('.conj-toggle-btn.active')?.dataset.mode || 'both';
  }

  // ── Progress section ───────────────────────────────────────────────────────
  const progressSection = document.createElement('div');
  progressSection.className = 'conj-progress-section';

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
    row.append(label, track, stat);
    barsWrap.appendChild(row);
    return { fill, stat };
  }

  const { fill: verbsFill, stat: verbsStat } = makeBar('Verbs');
  const { fill: formsFill, stat: formsStat } = makeBar('Forms');

  const giveUpBtn = document.createElement('button');
  giveUpBtn.className   = 'conj-giveup-btn';
  giveUpBtn.textContent = 'Give Up';

  progressSection.append(barsWrap, giveUpBtn);

  // ── Cards grid ─────────────────────────────────────────────────────────────
  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'conj-cards-grid';

  const cardUpdaters = [];
  verbs.forEach(verb => {
    const updater = buildCard(verb, pronouns, getTenseKey, getDisplayMode);
    cardsGrid.appendChild(updater.card);
    cardUpdaters.push(updater);
  });

  container.append(progressSection, cardsGrid);

  // Apply any pronoun toggles that may already be set (e.g. vosotros was disabled)
  applyAllPronounToggles(cardsGrid);

  // ── Progress updater ───────────────────────────────────────────────────────
  function updateProgress() {
    let totalForms = 0, correctForms = 0, completeVerbs = 0;

    cardsGrid.querySelectorAll('.conj-card').forEach(card => {
      let cardTotal = 0, cardCorrect = 0;
      card.querySelectorAll('.conj-row:not(.conj-row-hidden)').forEach(row => {
        const inp = row.querySelector('.conj-drill-input');
        if (!inp) return;
        cardTotal++;
        if (inp.classList.contains('correct')) cardCorrect++;
      });
      totalForms   += cardTotal;
      correctForms += cardCorrect;
      if (cardTotal > 0 && cardCorrect === cardTotal) completeVerbs++;
    });

    const nVerbs = cardsGrid.querySelectorAll('.conj-card').length;
    verbsFill.style.width = (nVerbs    ? (completeVerbs / nVerbs)    * 100 : 0) + '%';
    formsFill.style.width = (totalForms ? (correctForms  / totalForms) * 100 : 0) + '%';
    verbsStat.textContent = `${completeVerbs} / ${nVerbs} complete`;
    formsStat.textContent = `${correctForms} / ${totalForms} correct`;
  }

  _updateProgress = updateProgress;
  updateProgress();

  // ── Give Up ────────────────────────────────────────────────────────────────
  giveUpBtn.addEventListener('click', () => {
    cardUpdaters.forEach(u => u.revealAnswers());
    giveUpBtn.disabled = true;
    updateProgress();
  });

  // ── External control listeners ─────────────────────────────────────────────
  const handleTenseChange = () => {
    giveUpBtn.disabled = false;
    cardUpdaters.forEach(u => u.updateInputs());
    applyAllPronounToggles(cardsGrid);
    updateProgress();
  };

  const handleDisplayClick = e => {
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
    _updateProgress = null;
  };
}

// ── Build one verb card ────────────────────────────────────────────────────────

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
  header.append(spanishEl, englishEl);

  function updateHeader() {
    const mode = getDisplayMode();
    spanishEl.textContent = verb.word;
    englishEl.textContent = verb.display || verb.glosses?.join(', ') || '';
    spanishEl.hidden = mode === 'english';
    englishEl.hidden = mode === 'target';
  }

  // Inner grid — 6 rows, CSS flows into 2 columns of 3
  const innerGrid = document.createElement('div');
  innerGrid.className = 'conj-inner-grid';

  const inputs = [];

  pronouns.forEach((pronoun, i) => {
    const row = document.createElement('div');
    row.className  = 'conj-row';
    row.dataset.pi = i;          // pronoun index — used by toggle logic

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

    row.append(label, inp);
    innerGrid.appendChild(row);
    inputs.push(inp);
  });

  card.append(header, innerGrid);

  // ── Keyboard navigation ────────────────────────────────────────────────────
  function addNav(inp, i) {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        let n = (i + 1) % inputs.length;
        while (inputs[n].disabled && n !== i) n = (n + 1) % inputs.length;
        inputs[n].focus();
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        let p = (i - 1 + inputs.length) % inputs.length;
        while (inputs[p].disabled && p !== i) p = (p - 1 + inputs.length) % inputs.length;
        inputs[p].focus();
      }
    });
  }

  // ── Attach live answer-checking for current tense ─────────────────────────
  function attachChecking() {
    const answers = verb.linguistic?.conjugations?.[getTenseKey()] || null;

    inputs.forEach((inp, i) => {
      const fresh = inp.cloneNode(true);
      inp.parentNode.replaceChild(fresh, inp);
      inputs[i] = fresh;

      addNav(fresh, i);

      fresh.addEventListener('input', () => {
        if (!answers) return;
        const expected = answers[i] || '';
        const correct  = normalize(fresh.value) === normalize(expected);
        const was      = fresh.classList.contains('correct');
        fresh.classList.toggle('correct', correct);

        if (correct && !was) {
          fresh.value    = expected;   // show accented/canonical form
          fresh.disabled = true;
          // Advance focus past locked inputs
          let n = (i + 1) % inputs.length;
          while (inputs[n].disabled && n !== i) n = (n + 1) % inputs.length;
          if (n !== i) inputs[n].focus();
          _updateProgress?.();
        }
      });
    });
  }

  // ── Public updaters ────────────────────────────────────────────────────────
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
      if (!inp.classList.contains('correct') && !inp.classList.contains('revealed')) {
        inp.value = answers?.[i] ?? '—';
        inp.classList.add('revealed');
        inp.disabled = true;
      }
    });
  }

  updateHeader();
  attachChecking();

  return { card, updateHeader, updateInputs, revealAnswers };
}
