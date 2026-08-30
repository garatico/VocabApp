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

import { PRONOUNS, TENSE_DEFS, tenseEnLabel, TENSE_HELP, REGULARITY_HELP } from './data.js';
import { capitalize } from '../../utils/utils.js';
import { Settings, type ConjRegularityScope } from '../../settings.ts';

// ── Module state ───────────────────────────────────────────────────────────────

let _lastConjLang:          string | null   = null;
let _pronTogListenerAttached                = false;
let _formsAllNoneAttached                   = false;
let _progressCallback: (() => void) | null  = null;
let _selectionChangeCallback: (() => void) | null = null;

// ── Progress callback (wired up by conjugation-mode) ──────────────────────────

export function setProgressCallback(fn: (() => void) | null): void {
  _progressCallback = fn;
}

/**
 * Fires whenever the Tense or Regularity selection changes — the two things
 * that decide how many verbs and cards a quiz would build. Set once by
 * app.ts to drive the pre-quiz card-count estimate; unrelated to
 * setProgressCallback, which is only wired up while a quiz is on screen.
 */
export function setSelectionChangeCallback(fn: (() => void) | null): void {
  _selectionChangeCallback = fn;
}

// ── Pronoun toggle helpers (also used by conjugation-mode after render) ────────

/**
 * Pronoun slot indices (into PRONOUNS[lang]) currently enabled in the Forms
 * toggles — used by one-at-a-time/random-table/card-match, which have no
 * grid rows to hide via applyPronounToggle and so need to exclude a
 * deselected pronoun before building their own queue/rows/pairs instead.
 */
export function activePronounIndices(): Set<number> {
  const enabled = new Set<number>();
  document.querySelectorAll<HTMLButtonElement>('#conjPronounToggles .conj-pronoun-toggle')
    .forEach(btn => {
      if (btn.dataset.enabled !== 'false') enabled.add(parseInt(btn.dataset.pi ?? '0', 10));
    });
  return enabled;
}

export function applyPronounToggle(idx: number, enabled: boolean, grid: Element): void {
  grid.querySelectorAll<HTMLElement>(`.conj-row[data-pi="${idx}"]`).forEach(row => {
    row.classList.toggle('conj-row-hidden', !enabled);
    const inp = row.querySelector<HTMLInputElement>('.conj-drill-input');
    if (!inp) return;
    // A tense with no form for this slot at all (imperative's "yo") stays
    // disabled regardless of the Forms toggle — buildCard already marked the
    // row conj-row-tense-hidden for exactly this reason, and the Forms
    // toggle only concerns a pronoun the tense actually has.
    if (row.classList.contains('conj-row-tense-hidden')) { inp.disabled = true; return; }
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

import { readJson, writeJson, isStringArray } from '../../utils/storage.ts';
const TENSE_KEY_PREFIX = 'vq_conj_tenses_';

/** Tenses selected for a language, from storage. Empty if nothing saved. */
export function readSelectedTenses(lang: string): string[] {
  return readJson<string[]>(TENSE_KEY_PREFIX + lang, [], isStringArray);
}

function saveSelectedTenses(lang: string, keys: string[]): void {
  writeJson(TENSE_KEY_PREFIX + lang, keys);
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
    _selectionChangeCallback?.();
  });

  document.getElementById('conjTensesAll')?.addEventListener('click', () => {
    chips.querySelectorAll('.conj-tense-chip').forEach(c => c.classList.add('active'));
    saveSelectedTenses(lang, activeTenses());
    _selectionChangeCallback?.();
  });
  document.getElementById('conjTensesNone')?.addEventListener('click', () => {
    // "None" leaves the first tense on, for the same reason.
    chips.querySelectorAll('.conj-tense-chip').forEach((c, i) => {
      c.classList.toggle('active', i === 0);
    });
    saveSelectedTenses(lang, activeTenses());
    _selectionChangeCallback?.();
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
  writeJson(REG_KEY, activeRegularities());
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

  // Restore. Nothing saved — or a corrupt payload — means everything on,
  // which is the markup default.
  const saved = readJson<string[]>(REG_KEY, [], isStringArray);
  if (saved.length) {
    box.querySelectorAll<HTMLElement>('.conj-reg-chip').forEach(c => {
      c.classList.toggle('active', saved.includes(c.dataset.reg ?? ''));
    });
  }

  initRegularityScopeToggle();

  if (_regListenerAttached) return;
  _regListenerAttached = true;

  box.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLElement>('.conj-reg-chip');
    if (!btn) return;
    btn.classList.toggle('active');
    // Same rule as the tense chips: never allow an empty selection.
    if (box.querySelectorAll('.conj-reg-chip.active').length === 0) btn.classList.add('active');
    saveRegularities();
    _selectionChangeCallback?.();
  });

  document.getElementById('conjRegAll')?.addEventListener('click', () => {
    box.querySelectorAll('.conj-reg-chip').forEach(c => c.classList.add('active'));
    saveRegularities();
    _selectionChangeCallback?.();
  });
  document.getElementById('conjRegNone')?.addEventListener('click', () => {
    // Same rule as the tense chips' None: leaves the first bucket on rather
    // than allowing an empty selection.
    box.querySelectorAll('.conj-reg-chip').forEach((c, i) => {
      c.classList.toggle('active', i === 0);
    });
    saveRegularities();
    _selectionChangeCallback?.();
  });
}

/** Whether Regularity narrows before or after the Verbs size cap — see
 *  ConjRegularityScope. Lives next to the Regularity chips in the controls
 *  bar rather than in Settings, since it's a live quiz-setup choice like the
 *  chips themselves, not a standing preference. */
let _regScopeListenerAttached = false;

function initRegularityScopeToggle(): void {
  const toggle = document.getElementById('conjRegScopeToggle');
  if (!toggle) return;

  const saved = Settings.getConjRegularityScope();
  toggle.querySelectorAll<HTMLElement>('.sort-order-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.scope === saved);
  });

  if (_regScopeListenerAttached) return;
  _regScopeListenerAttached = true;

  toggle.addEventListener('click', e => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.sort-order-btn');
    if (!btn?.dataset.scope) return;
    toggle.querySelectorAll('.sort-order-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Settings.setConjRegularityScope(btn.dataset.scope as ConjRegularityScope);
    _selectionChangeCallback?.();
  });
}

/**
 * The tense chip row for a multi-language session: every tense any of the
 * active languages has, deduplicated by key. A verb whose own language
 * doesn't have a ticked tense simply contributes no card for it (see
 * index.ts's buildCards()) rather than the chip being disabled — so the row
 * stays one flat list instead of needing per-language sub-groups.
 *
 * The primary language's own label/order wins for any key it has (that's
 * what you're most likely reading); a key only an extra language has falls
 * back to the shared English name, since there's no "primary" native label
 * for it. In practice this fallback is rare: German/Dutch's three tenses are
 * a strict subset of the Romance languages', so mixing them in adds no new
 * chips at all — it only shows up the other way around (German/Dutch as the
 * primary language, a Romance language as an extra).
 */
export function unionTenseDefs(lang: string, extraLangs: string[]): { key: string; label: string; native: boolean }[] {
  const defs: { key: string; label: string; native: boolean }[] = [];
  const seen = new Set<string>();
  for (const l of [lang, ...extraLangs]) {
    for (const def of TENSE_DEFS[l] ?? TENSE_DEFS.spanish) {
      if (seen.has(def.key)) continue;
      seen.add(def.key);
      defs.push(l === lang
        ? { ...def, native: true }
        : { key: def.key, label: tenseEnLabel(def.key) || def.key, native: false });
    }
  }
  return defs;
}

export function initConjControls(lang: string, extraLangs: string[] = []): void {
  const tenseDefs = unionTenseDefs(lang, extraLangs);
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
      btn.append(native);
      // A chip borrowed from an extra language (the primary doesn't have
      // this tense) already shows the English name as its "native" label —
      // repeating it in the sub-label would just say the same word twice.
      if (def.native) {
        const en = document.createElement('span');
        en.className = 'conj-chip-en';
        en.textContent = tenseEnLabel(def.key);
        btn.append(en);
      }
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
