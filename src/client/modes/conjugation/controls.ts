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

import { PRONOUNS, TENSE_DEFS, TENSE_EN, TENSE_HELP, REGULARITY_HELP } from './data.js';
import { capitalize } from '../../utils/utils.js';

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

const TENSE_KEY_PREFIX = 'vq_conj_tenses_';

/** Tenses selected for a language, from storage. Empty if nothing saved. */
export function readSelectedTenses(lang: string): string[] {
  try {
    const raw = localStorage.getItem(TENSE_KEY_PREFIX + lang);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr as string[] : [];
  } catch { return []; }
}

function saveSelectedTenses(lang: string, keys: string[]): void {
  try {
    localStorage.setItem(TENSE_KEY_PREFIX + lang, JSON.stringify(keys));
  } catch { /* quota */ }
}

/** Tenses currently ticked in the UI, in the order they appear. */
export function activeTenses(): string[] {
  return [...document.querySelectorAll<HTMLElement>('#conjTenseChips .conj-tense-chip.active')]
    .map(el => el.dataset.tense ?? '')
    .filter(Boolean);
}

let _tenseListenerLang: string | null = null;

function ensureTenseChipListeners(lang: string): void {
  const chips = document.getElementById('conjTenseChips');
  if (!chips || _tenseListenerLang === lang) return;
  _tenseListenerLang = lang;

  chips.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLElement>('.conj-tense-chip');
    if (!btn) return;
    btn.classList.toggle('active');
    // Never allow an empty selection — the quiz would have nothing to drill.
    if (activeTenses().length === 0) btn.classList.add('active');
    saveSelectedTenses(lang, activeTenses());
  });

  document.getElementById('conjTensesAll')?.addEventListener('click', () => {
    chips.querySelectorAll('.conj-tense-chip').forEach(c => c.classList.add('active'));
    saveSelectedTenses(lang, activeTenses());
  });
  document.getElementById('conjTensesNone')?.addEventListener('click', () => {
    // "None" leaves the first tense on, for the same reason.
    chips.querySelectorAll('.conj-tense-chip').forEach((c, i) => {
      c.classList.toggle('active', i === 0);
    });
    saveSelectedTenses(lang, activeTenses());
  });
}

// ── Regularity filter ─────────────────────────────────────────────────────────
// Language-independent (the buckets are the same everywhere), so the chips are
// static markup and only the selection needs storing.

const REG_KEY  = 'vq_conj_regularity';
const REG_KEYS = ['regular', 'ortho', 'stem', 'irregular'] as const;

/** Regularity buckets currently ticked. Never empty — an empty set has no quiz. */
export function activeRegularities(): string[] {
  const on = [...document.querySelectorAll<HTMLElement>('#conjRegChips .conj-reg-chip.active')]
    .map(el => el.dataset.reg ?? '')
    .filter(Boolean);
  return on.length ? on : [...REG_KEYS];
}

function saveRegularities(): void {
  try { localStorage.setItem(REG_KEY, JSON.stringify(activeRegularities())); }
  catch { /* quota */ }
}

let _regListenerAttached = false;

function initRegularityChips(): void {
  const box = document.getElementById('conjRegChips');
  if (!box) return;

  // "Stem-changing" and "Spelling" are not self-explanatory labels, so each
  // chip explains its bucket with an example.
  box.querySelectorAll<HTMLElement>('.conj-reg-chip').forEach(c => {
    c.title = REGULARITY_HELP[c.dataset.reg ?? ''] ?? '';
  });

  // Restore. Nothing saved means everything on, which is the markup default.
  try {
    const raw = localStorage.getItem(REG_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr) && arr.length) {
      box.querySelectorAll<HTMLElement>('.conj-reg-chip').forEach(c => {
        c.classList.toggle('active', arr.includes(c.dataset.reg ?? ''));
      });
    }
  } catch { /* corrupt payload — leave the markup default */ }

  if (_regListenerAttached) return;
  _regListenerAttached = true;

  box.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLElement>('.conj-reg-chip');
    if (!btn) return;
    btn.classList.toggle('active');
    // Same rule as the tense chips: never allow an empty selection.
    if (box.querySelectorAll('.conj-reg-chip.active').length === 0) btn.classList.add('active');
    saveRegularities();
  });

  document.getElementById('conjRegAll')?.addEventListener('click', () => {
    box.querySelectorAll('.conj-reg-chip').forEach(c => c.classList.add('active'));
    saveRegularities();
  });
}

export function initConjControls(lang: string): void {
  const tenseDefs = TENSE_DEFS[lang] ?? TENSE_DEFS.spanish;
  const pronouns  = PRONOUNS[lang]   ?? PRONOUNS.spanish;
  const langName  = capitalize(lang);

  // 1. Tense chips — multi-select, replacing the single-choice <select>.
  //    Selection is stored per language so switching back and forth keeps it.
  const chips = document.getElementById('conjTenseChips');
  if (chips) {
    const saved = readSelectedTenses(lang);
    chips.innerHTML = '';
    tenseDefs.forEach(def => {
      const btn = document.createElement('button');
      btn.type          = 'button';
      btn.className     = 'conj-tense-chip' + (saved.includes(def.key) ? ' active' : '');
      btn.dataset.tense = def.key;
      // What the tense is actually for. The native name tells you nothing if
      // you don't already know the tense, which is the case for most of the
      // reason you'd be drilling it.
      btn.title         = TENSE_HELP[def.key] ?? def.label;
      // Native name over the English one — the native label is what you pick
      // by, the English is what tells you what it means.
      btn.innerHTML = '';
      const native = document.createElement('span');
      native.className = 'conj-chip-native';
      native.textContent = def.label;
      const en = document.createElement('span');
      en.className = 'conj-chip-en';
      en.textContent = TENSE_EN[def.key] ?? '';
      btn.append(native, en);
      chips.appendChild(btn);
    });
    // Nothing valid saved — fall back to the first tense so the quiz is never
    // empty on a fresh visit.
    if (!chips.querySelector('.conj-tense-chip.active')) {
      chips.querySelector('.conj-tense-chip')?.classList.add('active');
    }
    ensureTenseChipListeners(lang);
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
  initRegularityChips();

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
