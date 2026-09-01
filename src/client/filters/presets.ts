/**
 * presets.ts — named, saveable bundles of filter state ("Testing Profiles").
 *
 * There was no single place filter state lived — POS, Domains, Lists and
 * Direction are each their own module with their own storage key and their
 * own bucket (see filter-state.ts) — so a "profile" here is a snapshot of
 * what each of those modules' own public read function already returns,
 * applied back through the small `apply*` exports each of them added
 * alongside their existing getters. This module doesn't know how any of
 * them store their state; it only knows how to read and re-apply it.
 *
 * Scoped to the five filter-bearing modes (FilterScope) — Settings and
 * History never show a filter box, so a preset for either would have
 * nothing to apply.
 *
 * v1 covers filters and Direction only. Per-mode sub-styles (Table's
 * Standard/Recall/Double Recall, Conjugation's View, Trivia's Answer Style)
 * are not part of a bundle yet — they could be added the same way later.
 */

import { FILTER_SCOPES, type FilterScope } from './filter-scope.ts';
import { currentLangValue, currentExtraLanguages } from './filter-lang.ts';
import { readJson, writeJson, writeString, isRecord } from '../utils/storage.ts';
import { applyClassSelection, getClassFilterState, type ClassFilterState } from './class-filter.ts';
import { applyDomainSelection, getDomainFilterState, type DomainFilterState } from './domain-filter.ts';
import {
  getListFilterState, saveListFilterState, refreshFilterSelect,
  type ListFilterState,
} from '../utils/word-lists.ts';
import { syncListFilterUI } from './word-filters.ts';
import type { TableDirection } from '../modes/table-mode.ts';

/**
 * How many words are in play, and which slice of the rank-sorted pool —
 * everything the "WORDS" control bar drives, mirrored here as plain data.
 *
 * Values are the controls' own raw strings (a <select>'s value, a toggle
 * button's data attribute) rather than parsed numbers/enums — capture and
 * apply both go through the same DOM elements app.ts's own listeners own, so
 * there is nothing here to keep in sync with a separate parsed shape.
 */
export interface WordsBundle {
  poolMode:   string;   // #poolModeToggle: 'topn' | 'range' | 'band'
  size:       string;   // #sizeSelect value: '100' | '250' | '500' | '1000' | 'max' | 'custom'
  customSize: string;   // #sizeCustom value, meaningful only when size === 'custom'
  sizeMode:   string;   // #sizeModeToggle: 'window' | 'fill'
  rankFrom:   string;   // #rankFrom value, meaningful only when poolMode === 'range'
  rankTo:     string;   // #rankTo value, meaningful only when poolMode === 'range'
  bands:      string[]; // #bandChips active bands, meaningful only when poolMode === 'band'
}

/**
 * Conjugation's own "Tense & Forms" box plus its View and Verbs controls —
 * captured/applied only for FilterScope 'conjugation'. Pronoun toggles are
 * deliberately not part of this: the app itself never persists them (they
 * reset to all-on whenever the language changes), so there is nothing
 * meaningful to save.
 */
export interface ConjugationBundle {
  tenses:       string[]; // #conjTenseChips active tense keys
  regularities: string[]; // #conjRegChips active buckets: regular/ortho/stem/irregular
  view:         string;   // #conjViewToggle: grid/full/oneatatime/randomtable/cardmatch
  verbsSize:       string; // #conjSizeSelect value: 5/10/25/50/100/250/500/max/custom
  verbsSizeCustom: string; // #conjSizeCustom value, meaningful only when verbsSize === 'custom'
}

export interface PresetBundle {
  classes:       ClassFilterState;
  domains:       DomainFilterState;
  listFilter:    ListFilterState;
  direction:     TableDirection;
  /** Optional — added after v1. Absent on an older saved profile, in which
   *  case applying it leaves language/words/style exactly as they are. */
  language?:       string;
  extraLanguages?: string[];
  words?:          WordsBundle;
  /** Table-only ('standard' | 'recall' | 'double'), captured/applied only
   *  for FilterScope 'table' — Picture and Conjugation have no such style. */
  quizStyle?:      string;
  /** Conjugation-only — see ConjugationBundle. */
  conjugation?:    ConjugationBundle;
}

const KEY_PREFIX = 'vq_presets_';

function storeKey(mode: FilterScope): string {
  return KEY_PREFIX + mode;
}

type PresetStore = Record<string, PresetBundle>;

function readStore(mode: FilterScope): PresetStore {
  return readJson<PresetStore>(storeKey(mode), {}, isRecord);
}

function writeStore(mode: FilterScope, store: PresetStore): void {
  writeJson(storeKey(mode), store);
}

/** Preset names for this mode, alphabetical. */
export function listPresets(mode: FilterScope): string[] {
  return Object.keys(readStore(mode)).sort((a, b) => a.localeCompare(b));
}

function currentDirection(): TableDirection {
  const active = document.querySelector<HTMLButtonElement>('#directionToggle .conj-toggle-btn.active');
  const val = active?.dataset.direction;
  return val === 'en-target' || val === 'mixed' ? val : 'target-en';
}

/**
 * Applying a saved "+ Languages" selection needs app.ts's own private
 * `extraLanguages` state (it drives the merged word pool, distinct from
 * filter-lang.ts's copy used by the Lists filter) — and app.ts can't be
 * imported here without a cycle (app.ts → ui/preset-picker.ts → this module).
 * Same shape as setOnPageSizeChange/setProgressCallback elsewhere: app.ts
 * registers the one function that knows how, once, at init.
 */
let applyExtraLanguagesHook: ((langs: string[]) => void) | null = null;
export function setExtraLanguagesApplyHook(fn: (langs: string[]) => void): void {
  applyExtraLanguagesHook = fn;
}

/** Read the WORDS control bar's current state directly from the DOM. */
function captureWords(): WordsBundle {
  const poolBtn     = document.querySelector<HTMLElement>('#poolModeToggle .sort-order-btn.active');
  const sizeModeBtn = document.querySelector<HTMLElement>('#sizeModeToggle .sort-order-btn.active');
  const sizeSelect  = document.getElementById('sizeSelect')  as HTMLSelectElement | null;
  const sizeCustom  = document.getElementById('sizeCustom')  as HTMLInputElement  | null;
  const rankFrom    = document.getElementById('rankFrom')    as HTMLInputElement  | null;
  const rankTo      = document.getElementById('rankTo')      as HTMLInputElement  | null;
  const bands       = [...document.querySelectorAll<HTMLButtonElement>('#bandChips .pos-chip.active')]
    .map(b => b.dataset.band ?? '').filter(Boolean);

  return {
    poolMode:   poolBtn?.dataset.pool ?? 'topn',
    size:       sizeSelect?.value ?? '1000',
    customSize: sizeCustom?.value ?? '',
    sizeMode:   sizeModeBtn?.dataset.mode ?? 'window',
    rankFrom:   rankFrom?.value ?? '1',
    rankTo:     rankTo?.value ?? '1000',
    bands,
  };
}

/**
 * Put the WORDS control bar into the saved state and let it rebuild the pool
 * itself — set values then dispatch the same native events app.ts's own
 * listeners are already bound to (a real click, a real change/input), rather
 * than reimplementing what each one does to currentBaseList/storage here.
 * That keeps this module ignorant of app.ts's internals, the same way it
 * already is about class/domain/list's.
 */
function applyWords(words: WordsBundle): void {
  const poolBtn = document.querySelector<HTMLButtonElement>(`#poolModeToggle .sort-order-btn[data-pool="${words.poolMode}"]`);
  poolBtn?.click();

  const sizeSelect = document.getElementById('sizeSelect') as HTMLSelectElement | null;
  if (sizeSelect && sizeSelect.value !== words.size) {
    sizeSelect.value = words.size;
    sizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const sizeCustom = document.getElementById('sizeCustom') as HTMLInputElement | null;
  if (sizeCustom && words.size === 'custom') {
    sizeCustom.value = words.customSize;
    sizeCustom.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const sizeModeBtn = document.querySelector<HTMLButtonElement>(`#sizeModeToggle .sort-order-btn[data-mode="${words.sizeMode}"]`);
  sizeModeBtn?.click();

  const rankFrom = document.getElementById('rankFrom') as HTMLInputElement | null;
  if (rankFrom && rankFrom.value !== words.rankFrom) {
    rankFrom.value = words.rankFrom;
    rankFrom.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const rankTo = document.getElementById('rankTo') as HTMLInputElement | null;
  if (rankTo && rankTo.value !== words.rankTo) {
    rankTo.value = words.rankTo;
    rankTo.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Multi-select toggle — click only the chips whose state actually needs to
  // flip, since each click is a toggle rather than a "set to" action.
  document.querySelectorAll<HTMLButtonElement>('#bandChips .pos-chip').forEach(chip => {
    const wants = words.bands.includes(chip.dataset.band ?? '');
    if (chip.classList.contains('active') !== wants) chip.click();
  });
}

function currentQuizStyle(): string {
  return document.querySelector<HTMLElement>('#tableStyleToggle .conj-toggle-btn.active')?.dataset.style ?? 'standard';
}

function applyQuizStyle(style: string): void {
  document.querySelector<HTMLButtonElement>(`#tableStyleToggle .conj-toggle-btn[data-style="${style}"]`)?.click();
}

/** Read Conjugation's own "Tense & Forms"/View/Verbs controls directly from the DOM. */
function captureConjugation(): ConjugationBundle {
  const tenses = [...document.querySelectorAll<HTMLElement>('#conjTenseChips .conj-tense-chip.active')]
    .map(el => el.dataset.tense ?? '').filter(Boolean);
  const regularities = [...document.querySelectorAll<HTMLElement>('#conjRegChips .conj-reg-chip.active')]
    .map(el => el.dataset.reg ?? '').filter(Boolean);
  const view = document.querySelector<HTMLElement>('#conjViewToggle .conj-toggle-btn.active')?.dataset.view ?? 'grid';
  const verbsSize       = (document.getElementById('conjSizeSelect') as HTMLSelectElement | null)?.value ?? '100';
  const verbsSizeCustom = (document.getElementById('conjSizeCustom') as HTMLInputElement | null)?.value ?? '';
  return { tenses, regularities, view, verbsSize, verbsSizeCustom };
}

/**
 * Put Conjugation's controls into the saved state via real clicks/change
 * events, same reasoning as applyWords() — this reuses controls.ts's own
 * listeners (which persist to vq_conj_tenses_<lang>/vq_conj_regularity and
 * rebuild nothing that would lose in-progress answers) rather than
 * duplicating what they do.
 */
function applyConjugation(bundle: ConjugationBundle): void {
  document.querySelectorAll<HTMLButtonElement>('#conjTenseChips .conj-tense-chip').forEach(chip => {
    const wants = bundle.tenses.includes(chip.dataset.tense ?? '');
    if (chip.classList.contains('active') !== wants) chip.click();
  });
  document.querySelectorAll<HTMLButtonElement>('#conjRegChips .conj-reg-chip').forEach(chip => {
    const wants = bundle.regularities.includes(chip.dataset.reg ?? '');
    if (chip.classList.contains('active') !== wants) chip.click();
  });
  document.querySelector<HTMLButtonElement>(`#conjViewToggle .conj-toggle-btn[data-view="${bundle.view}"]`)?.click();

  const verbsSel = document.getElementById('conjSizeSelect') as HTMLSelectElement | null;
  if (verbsSel && verbsSel.value !== bundle.verbsSize) {
    verbsSel.value = bundle.verbsSize;
    verbsSel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const verbsCustom = document.getElementById('conjSizeCustom') as HTMLInputElement | null;
  if (verbsCustom && bundle.verbsSize === 'custom') {
    verbsCustom.value = bundle.verbsSizeCustom;
    verbsCustom.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/** Snapshot the filter/direction state currently in effect for this mode. */
export function captureCurrentBundle(mode: FilterScope = 'table'): PresetBundle {
  return {
    classes:        getClassFilterState(),
    domains:        getDomainFilterState(),
    listFilter:     getListFilterState(currentLangValue()),
    direction:      currentDirection(),
    language:       currentLangValue(),
    extraLanguages: currentExtraLanguages(),
    words:          captureWords(),
    quizStyle:      mode === 'table' ? currentQuizStyle() : undefined,
    conjugation:    mode === 'conjugation' ? captureConjugation() : undefined,
  };
}

/**
 * Tolerate a bundle saved before a filter pick carried its own `active` flag
 * (v1 stored `classes`/`domains` as bare arrays — see captureCurrentBundle's
 * old shape). A bare array only ever meant "the filter was narrowing to
 * these", so it maps to `active: true`; anything else falls back to "off,
 * nothing picked" rather than throwing on a malformed record.
 */
function normalizeFilterPick(value: unknown): ClassFilterState & DomainFilterState {
  if (Array.isArray(value)) return { active: true, selected: value as string[] };
  if (isRecord(value) && Array.isArray((value as { selected?: unknown }).selected)) {
    const v = value as { active?: unknown; selected: string[] };
    return { active: v.active !== false, selected: v.selected };
  }
  return { active: true, selected: [] };
}

/** Bring a bundle read from storage up to the current shape — see
 *  normalizeFilterPick(). Every read of a stored bundle goes through this so
 *  the rest of the module never has to think about the legacy shape. */
function normalizeBundle(raw: PresetBundle): PresetBundle {
  return {
    classes:        normalizeFilterPick(raw.classes),
    domains:        normalizeFilterPick(raw.domains),
    listFilter:     raw.listFilter ?? { active: false, mode: 'hide', selected: [] },
    direction:      raw.direction ?? 'target-en',
    // Added after v1 — absent on an older saved profile, which is fine: it's
    // optional precisely so applying it is a no-op rather than a crash.
    language:       raw.language,
    extraLanguages: Array.isArray(raw.extraLanguages) ? raw.extraLanguages : undefined,
    words:          raw.words,
    quizStyle:      raw.quizStyle,
    conjugation:    raw.conjugation,
  };
}

export function savePreset(mode: FilterScope, name: string, bundle: PresetBundle = captureCurrentBundle(mode)): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const store = readStore(mode);
  store[trimmed] = bundle;
  writeStore(mode, store);
}

export function deletePreset(mode: FilterScope, name: string): void {
  const store = readStore(mode);
  delete store[name];
  writeStore(mode, store);
}

export function getPreset(mode: FilterScope, name: string): PresetBundle | undefined {
  const raw = readStore(mode)[name];
  return raw ? normalizeBundle(raw) : undefined;
}

/** Rename in place, keeping the same bundle. False if the new name collides. */
export function renamePreset(mode: FilterScope, oldName: string, newName: string): boolean {
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return true;
  const store = readStore(mode);
  if (!(oldName in store) || trimmed in store) return false;
  store[trimmed] = store[oldName];
  delete store[oldName];
  writeStore(mode, store);
  return true;
}

/** Copy a bundle under a new name. False if the source is missing or the new name collides. */
export function duplicatePreset(mode: FilterScope, sourceName: string, newName: string): boolean {
  const trimmed = newName.trim();
  const store = readStore(mode);
  if (!trimmed || !(sourceName in store) || trimmed in store) return false;
  store[trimmed] = structuredClone(store[sourceName]);
  writeStore(mode, store);
  return true;
}

/** The bundle a brand-new, unsaved profile starts from. Language/words/style
 *  are left unset — a blank profile changes nothing about them until the
 *  editor is used to pick something, rather than forcing every fresh profile
 *  back to Spanish/Top 1000/Standard. */
export const BLANK_BUNDLE: PresetBundle = {
  classes: { active: true, selected: [] },
  domains: { active: true, selected: [] },
  listFilter: { active: false, mode: 'hide', selected: [] },
  direction: 'target-en',
};

/** Every mode that currently has at least one saved profile, for a
 *  cross-mode management view (My Lists' Testing Profiles section). */
export function modesWithPresets(): FilterScope[] {
  return FILTER_SCOPES.filter(m => listPresets(m).length > 0);
}

const QUIZ_STYLE_LABELS: Record<string, string> = {
  standard: 'Standard', recall: 'Recall', double: 'Double Recall',
};

const CONJ_VIEW_LABELS: Record<string, string> = {
  grid: 'Grid', full: 'Full Conjugation', oneatatime: 'One at a Time',
  randomtable: 'Random Table', cardmatch: 'Card Match',
};

/** "Top 1000", "Max", "Rank 501–1000" or "A1, B1" — whichever the pool mode
 *  actually uses; the other two WordsBundle fields are along for the ride
 *  but irrelevant to what the pool mode itself shows. */
function describeWords(words: WordsBundle): string {
  if (words.poolMode === 'range') return `Rank ${words.rankFrom}–${words.rankTo}`;
  if (words.poolMode === 'band')  return words.bands.length > 0 ? words.bands.join(', ') : 'Level';
  if (words.size === 'max')    return 'Max words';
  if (words.size === 'custom') return `${words.customSize || '?'} Most Common`;
  return `${words.size} Most Common`;
}

/** A short human-readable summary of what a bundle would change —
 *  "Verbs · Hide 2 lists · Meaning → Word" — for a management list row
 *  that has no live filter UI of its own to show instead. */
export function describePreset(bundle: PresetBundle): string {
  const parts: string[] = [];
  if (bundle.language) parts.push(bundle.language[0].toUpperCase() + bundle.language.slice(1));
  if (bundle.extraLanguages && bundle.extraLanguages.length > 0) {
    parts.push(`+${bundle.extraLanguages.length}`);
  }
  if (bundle.words) parts.push(describeWords(bundle.words));
  if (bundle.classes.active && bundle.classes.selected.length > 0) {
    parts.push(bundle.classes.selected.join(', '));
  }
  if (bundle.domains.active && bundle.domains.selected.length > 0) {
    const n = bundle.domains.selected.length;
    parts.push(`${n} domain${n === 1 ? '' : 's'}`);
  }
  if (bundle.listFilter.active && bundle.listFilter.selected.length > 0) {
    const verb = bundle.listFilter.mode === 'focus' ? 'Focus' : 'Hide';
    const n = bundle.listFilter.selected.length;
    parts.push(`${verb} ${n} list${n === 1 ? '' : 's'}`);
  }
  if (bundle.quizStyle && bundle.quizStyle !== 'standard') {
    parts.push(QUIZ_STYLE_LABELS[bundle.quizStyle] ?? bundle.quizStyle);
  }
  if (bundle.conjugation) {
    const { tenses, view, verbsSize, verbsSizeCustom } = bundle.conjugation;
    const verbsCount = verbsSize === 'custom' ? (verbsSizeCustom || '?') : verbsSize;
    parts.push(`${verbsSize === 'max' ? 'All' : verbsCount} verbs`);
    if (tenses.length > 0) parts.push(`${tenses.length} tense${tenses.length === 1 ? '' : 's'}`);
    if (view !== 'grid') parts.push(CONJ_VIEW_LABELS[view] ?? view);
  }
  const directionLabel = bundle.direction === 'mixed' ? 'Mixed'
    : bundle.direction === 'en-target' ? 'Meaning → Word' : 'Word → Meaning';
  parts.push(directionLabel);
  return parts.join(' · ');
}

/**
 * Write a bundle back into every filter module it covers, and repaint each
 * one's own UI — the same effect as the user clicking through class, domain,
 * list and direction controls by hand, done in one call.
 */
export function applyPreset(mode: FilterScope, name: string): boolean {
  const bundle = getPreset(mode, name);
  if (!bundle) return false;

  // Language first — everything below (class/domain buckets, the list
  // filter's checkbox panel, the word pool) is read per the language active
  // at the moment it runs, so switching languages after applying the rest
  // would silently apply them to the wrong one.
  if (bundle.language) {
    const langSelect = document.getElementById('langSelect') as HTMLSelectElement | null;
    if (langSelect && langSelect.value !== bundle.language) {
      langSelect.value = bundle.language;
      langSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  if (bundle.extraLanguages) applyExtraLanguagesHook?.(bundle.extraLanguages);

  applyClassSelection(bundle.classes.selected, bundle.classes.active);
  applyDomainSelection(bundle.domains.selected, bundle.domains.active);

  const lang = currentLangValue();
  saveListFilterState(lang, bundle.listFilter);
  refreshFilterSelect(lang);
  syncListFilterUI(lang);

  if (bundle.words) applyWords(bundle.words);
  if (mode === 'table' && bundle.quizStyle) applyQuizStyle(bundle.quizStyle);
  if (mode === 'conjugation' && bundle.conjugation) applyConjugation(bundle.conjugation);

  const toggle = document.getElementById('directionToggle');
  toggle?.querySelectorAll<HTMLButtonElement>('.conj-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.direction === bundle.direction);
  });
  // Direction is stored globally (not per-mode, unlike the filters above —
  // see app.ts), same key its own click handler writes, so the choice
  // survives a reload instead of reverting the next time app.ts restores it.
  writeString('vq_dir', bundle.direction);

  return true;
}
