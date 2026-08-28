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
import { currentLangValue } from './filter-lang.ts';
import { readJson, writeJson, writeString, isRecord } from '../utils/storage.ts';
import { getSelectedClasses, applyClassSelection } from './class-filter.ts';
import { getSelectedDomains, applyDomainSelection } from './domain-filter.ts';
import {
  getListFilterState, saveListFilterState, refreshFilterSelect,
  type ListFilterState,
} from '../utils/word-lists.ts';
import { syncListFilterUI } from './word-filters.ts';
import type { TableDirection } from '../modes/table-mode.ts';

export interface PresetBundle {
  classes:       string[];
  domains:       string[];
  listFilter:    ListFilterState;
  direction:     TableDirection;
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

/** Snapshot the filter/direction state currently in effect for this mode. */
export function captureCurrentBundle(): PresetBundle {
  return {
    classes:    getSelectedClasses(),
    domains:    getSelectedDomains(),
    listFilter: getListFilterState(currentLangValue()),
    direction:  currentDirection(),
  };
}

export function savePreset(mode: FilterScope, name: string, bundle: PresetBundle = captureCurrentBundle()): void {
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
  return readStore(mode)[name];
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

/** The bundle a brand-new, unsaved profile starts from. */
export const BLANK_BUNDLE: PresetBundle = {
  classes: [], domains: [],
  listFilter: { active: false, mode: 'hide', selected: [] },
  direction: 'target-en',
};

/** Every mode that currently has at least one saved profile, for a
 *  cross-mode management view (My Lists' Testing Profiles section). */
export function modesWithPresets(): FilterScope[] {
  return FILTER_SCOPES.filter(m => listPresets(m).length > 0);
}

/** A short human-readable summary of what a bundle would change —
 *  "Verbs · Hide 2 lists · Meaning → Word" — for a management list row
 *  that has no live filter UI of its own to show instead. */
export function describePreset(bundle: PresetBundle): string {
  const parts: string[] = [];
  if (bundle.classes.length > 0) parts.push(bundle.classes.join(', '));
  if (bundle.domains.length > 0) {
    parts.push(`${bundle.domains.length} domain${bundle.domains.length === 1 ? '' : 's'}`);
  }
  if (bundle.listFilter.active && bundle.listFilter.selected.length > 0) {
    const verb = bundle.listFilter.mode === 'focus' ? 'Focus' : 'Hide';
    const n = bundle.listFilter.selected.length;
    parts.push(`${verb} ${n} list${n === 1 ? '' : 's'}`);
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
  const bundle = readStore(mode)[name];
  if (!bundle) return false;

  applyClassSelection(bundle.classes, bundle.classes.length > 0);
  applyDomainSelection(bundle.domains, bundle.domains.length > 0);

  const lang = currentLangValue();
  saveListFilterState(lang, bundle.listFilter);
  refreshFilterSelect(lang);
  syncListFilterUI(lang);

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
