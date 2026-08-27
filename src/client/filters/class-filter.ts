/**
 * class-filter.ts
 *
 * POS (part-of-speech) filter — pill toggle chip UI.
 * "All" chip active (nothing selected) means no filtering.
 * Selecting individual chips narrows the quiz word pool to those POS types.
 *
 * The selection used to be a module-level Set, which meant it was global across
 * modes and thrown away on reload. It is stored now, per language and per
 * bucket, so it can be switched off, kept per mode and chained like the others.
 * The chips are the same; only where the answer lives has changed.
 */

import { currentLangValue } from './filter-lang.ts';
import { bucketFor, bucketForRead, type Bucket } from './filter-state.ts';
import {
  bindFilterHeader, syncFilterHeader, type FilterHeaderConfig,
} from './filter-header.ts';

const KEY_PREFIX = 'vq_classfilter_';

interface ClassFilterState {
  active:   boolean;
  selected: string[];
}

import { readJson, readString, writeJson, isRecord } from '../utils/storage.ts';
const DEFAULT_STATE: ClassFilterState = { active: true, selected: [] };

function key(lang: string, bucket: Bucket): string {
  return `${KEY_PREFIX}${lang.toLowerCase()}__${bucket}`;
}

function readBucket(lang: string, bucket: Bucket): ClassFilterState {
  const parsed = readJson<ClassFilterState | null>(key(lang, bucket), null, isRecord);
  if (parsed && Array.isArray(parsed.selected)) {
    return { active: parsed.active !== false, selected: parsed.selected };
  }
  return { ...DEFAULT_STATE, selected: [] };
}

function getState(): ClassFilterState {
  const lang = currentLangValue();
  return readBucket(lang, bucketForRead('class', b => readString(key(lang, b)) !== null));
}

function saveState(state: ClassFilterState): void {
  writeJson(key(currentLangValue(), bucketFor('class')), state);
}

function copyState(from: Bucket, to: Bucket): void {
  const lang  = currentLangValue();
  const state = readBucket(lang, from);
  writeJson(key(lang, to), { ...state, selected: [...state.selected] });
}

const header: FilterHeaderConfig = {
  id:          'class',
  activeBtnId: 'classFilterActive',
  chainBtnId:  'classFilterChain',
  noteId:      'classFilterChainNote',
  isActive:    () => getState().active,
  setActive:   on => { const s = getState(); s.active = on; saveState(s); },
  copyState,
  onChange:    () => { syncUI(); notifyChange(); },
};

function notifyChange(): void {
  document.getElementById('classFilter')
    ?.dispatchEvent(new Event('change', { bubbles: true }));
}

export function syncUI(): void {
  const container = document.getElementById('classFilter');
  if (!container) return;

  const selected = new Set(getState().selected);
  const isAll    = selected.size === 0;

  container.querySelector<HTMLElement>('.pos-chip-all')
    ?.classList.toggle('active', isAll);

  container.querySelectorAll<HTMLButtonElement>('.pos-chip[data-pos]').forEach(btn => {
    btn.classList.toggle('active', selected.has(btn.dataset.pos ?? ''));
  });

  syncFilterHeader(header);
}

export function bindClassFilter(): void {
  const container = document.getElementById('classFilter');
  if (!container) return;

  container.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    // The header buttons live inside the box but are bound separately.
    if (!btn || btn.closest('.filter-header-controls')) return;

    const state    = getState();
    const selected = new Set(state.selected);

    if (btn.classList.contains('pos-chip-all')) {
      selected.clear();
    } else if (btn.dataset.pos) {
      const pos = btn.dataset.pos;
      if (selected.has(pos)) selected.delete(pos);
      else                   selected.add(pos);
    } else {
      return;
    }

    // Narrowing to a part of speech is a clear statement that you want the
    // filter doing something, the same way picking Hide/Focus is.
    saveState({ active: true, selected: [...selected] });
    syncUI();
    notifyChange();
  });

  bindFilterHeader(header);
  syncUI();
}

/**
 * The chain button's payload mover, exposed for tests.
 *
 * `bindFilterHeader` normally supplies it through the header config, which
 * needs a DOM. The copy itself does not, and it is the half worth testing.
 */
export const copyStateForTest = copyState;

/**
 * Selected POS values, or [] when the filter is off or "All" is active.
 *
 * Returning [] for "off" rather than having callers ask separately keeps the
 * meaning in one place: empty has always meant "do not narrow".
 */
export function getSelectedClasses(): string[] {
  const state = getState();
  if (!state.active || state.selected.length === 0) return [];
  return [...state.selected];
}

/**
 * Set the selection directly and repaint — used by presets.ts to apply a
 * saved bundle in one shot, the way a chip click would but for every POS at
 * once.
 */
export function applyClassSelection(selected: string[], active = true): void {
  saveState({ active, selected: [...selected] });
  syncUI();
  notifyChange();
}
