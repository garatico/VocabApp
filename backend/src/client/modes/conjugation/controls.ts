/**
 * conjugation/controls.ts
 *
 * Manages the conjugation filter bar:
 *   - Tense select options
 *   - Display toggle labels
 *   - Per-pronoun form toggle pills (All / None + individual)
 *
 * renderConjugationMode calls setProgressCallback() so that toggling a
 * pronoun pill updates the progress bars without this module needing to
 * know anything about the grid rendering.
 */

import { PRONOUNS, TENSE_DEFS } from './data.js';

// ── Module state ───────────────────────────────────────────────────────────────

let _lastConjLang:          string | null   = null;
let _pronTogListenerAttached                = false;
let _formsAllNoneAttached                   = false;
let _progressCallback: (() => void) | null  = null;

// ── Progress callback (wired up by conjugation-mode) ──────────────────────────

export function setProgressCallback(fn: (() => void) | null): void {
  _progressCallback = fn;
}

// ── Pronoun toggle helpers (also used by conjugation-mode after render) ────────

export function applyPronounToggle(idx: number, enabled: boolean, grid: Element): void {
  grid.querySelectorAll<HTMLElement>(`.conj-row[data-pi="${idx}"]`).forEach(row => {
    row.classList.toggle('conj-row-hidden', !enabled);
    const inp = row.querySelector<HTMLInputElement>('.conj-drill-input');
    if (!inp) return;
    inp.disabled = !enabled
      ? true
      : inp.classList.contains('correct') || inp.classList.contains('revealed');
  });
}

export function applyAllPronounToggles(grid: Element): void {
  document.querySelectorAll<HTMLButtonElement>('#conjPronounToggles .conj-pronoun-toggle')
    .forEach(btn => {
      applyPronounToggle(
        parseInt(btn.dataset.pi ?? '0'),
        btn.dataset.enabled !== 'false',
        grid,
      );
    });
}

// ── Main export ───────────────────────────────────────────────────────────────

export function initConjControls(lang: string): void {
  const tenseDefs = TENSE_DEFS[lang] ?? TENSE_DEFS.spanish;
  const pronouns  = PRONOUNS[lang]   ?? PRONOUNS.spanish;
  const langName  = capitalize(lang);

  // 1. Tense select — preserve the previously chosen tense if it exists
  const tenseSelect = document.getElementById('conjTenseSelect') as HTMLSelectElement | null;
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
    const targetBtn = displayToggle.querySelector<HTMLElement>('[data-mode="target"]');
    const bothBtn   = displayToggle.querySelector<HTMLElement>('[data-mode="both"]');
    if (targetBtn) targetBtn.textContent = langName;
    if (bothBtn)   bothBtn.textContent   = `${langName} + English`;
  }

  // 3. Attach listeners once (idempotent)
  ensurePronounToggleListener();
  ensureFormsAllNoneListeners();

  // 4. Rebuild pronoun pills only when the language changes so that user
  //    selections survive a Start Quiz re-render.
  const togglesContainer = document.getElementById('conjPronounToggles');
  if (togglesContainer && lang !== _lastConjLang) {
    togglesContainer.innerHTML = '';
    pronouns.forEach((pronoun, i) => {
      const btn = document.createElement('button');
      btn.type            = 'button';
      btn.className       = 'conj-pronoun-toggle active';
      btn.dataset.pi      = String(i);
      btn.dataset.enabled = 'true';
      btn.textContent     = pronoun;
      togglesContainer.appendChild(btn);
    });
  }

  _lastConjLang = lang;
}

// ── Private helpers ────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ensurePronounToggleListener(): void {
  if (_pronTogListenerAttached) return;
  _pronTogListenerAttached = true;

  const container = document.getElementById('conjPronounToggles');
  if (!container) return;

  container.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.conj-pronoun-toggle');
    if (!btn) return;

    const nowEnabled    = btn.dataset.enabled !== 'true';
    btn.dataset.enabled = nowEnabled ? 'true' : 'false';
    btn.classList.toggle('active', nowEnabled);

    const grid = document.querySelector('.conj-cards-grid');
    if (grid) {
      applyPronounToggle(parseInt(btn.dataset.pi ?? '0'), nowEnabled, grid);
      _progressCallback?.();
    }
  });
}

function ensureFormsAllNoneListeners(): void {
  if (_formsAllNoneAttached) return;
  _formsAllNoneAttached = true;

  function setAll(enabled: boolean): void {
    document.querySelectorAll<HTMLButtonElement>('#conjPronounToggles .conj-pronoun-toggle')
      .forEach(btn => {
        btn.dataset.enabled = enabled ? 'true' : 'false';
        btn.classList.toggle('active', enabled);
      });
    const grid = document.querySelector('.conj-cards-grid');
    if (grid) { applyAllPronounToggles(grid); _progressCallback?.(); }
  }

  document.getElementById('conjFormsAll') ?.addEventListener('click', () => setAll(true));
  document.getElementById('conjFormsNone')?.addEventListener('click', () => setAll(false));
}
