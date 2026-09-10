/**
 * script-type-filter.ts
 *
 * Kanji / Katakana / Hiragana filter — pill toggle chips, same interaction
 * shape as Part of Speech (class-filter.ts): "All" active (nothing
 * selected) means no filtering, selecting individual chips narrows the
 * quiz word pool to those script types (see classifyJapaneseScript).
 *
 * Japanese only — Chinese words don't have this three-way split (no kana),
 * so unlike Script Display (which applies to any romanizedScript language)
 * this filter's visibility is gated on the language being Japanese
 * specifically, not on romanizedScript. See syncScriptTypeAvailability in
 * app.ts.
 *
 * Deliberately simpler than class-filter.ts: no chain-link across modes
 * and no per-mode bucket, since this narrows a single language's word list
 * by a fact about the word's own spelling, not content that's meaningful
 * to carry between Table and Picture Quiz the way Part of Speech is. One
 * stored selection per language is enough.
 */

import { classifyJapaneseScript } from '../utils/japanese-script.ts';
import { currentLangValue } from './filter-lang.ts';
import { readJson, writeJson, isStringArray } from '../utils/storage.ts';
import { Settings } from '../settings.ts';

const KEY_PREFIX = 'vq_scripttype_';

function key(lang: string): string {
  return `${KEY_PREFIX}${lang.toLowerCase()}`;
}

function getSelected(): string[] {
  return readJson<string[]>(key(currentLangValue()), [], isStringArray);
}

function saveSelected(selected: string[]): void {
  writeJson(key(currentLangValue()), selected);
}

export function syncScriptTypeUI(): void {
  const container = document.getElementById('scriptTypeFilterWrap');
  if (!container) return;

  const selected = new Set(getSelected());
  const isAll    = selected.size === 0;

  container.querySelector<HTMLElement>('.pos-chip-all')
    ?.classList.toggle('active', isAll);

  container.querySelectorAll<HTMLButtonElement>('.pos-chip[data-script]').forEach(btn => {
    btn.classList.toggle('active', selected.has(btn.dataset.script ?? ''));
  });
}

function notifyChange(): void {
  document.getElementById('scriptTypeFilterWrap')
    ?.dispatchEvent(new Event('change', { bubbles: true }));
}

export function bindScriptTypeFilter(): void {
  const container = document.getElementById('scriptTypeFilterWrap');
  if (!container) return;

  container.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!btn) return;

    const selected = new Set(getSelected());

    if (btn.classList.contains('pos-chip-all')) {
      selected.clear();
    } else if (btn.dataset.script) {
      const script = btn.dataset.script;
      if (selected.has(script)) selected.delete(script);
      else                      selected.add(script);
    } else {
      return;
    }

    saveSelected([...selected]);
    syncScriptTypeUI();
    notifyChange();
  });

  syncScriptTypeUI();
}

/**
 * Selected script types, or [] when "All" is active — same "empty means
 * do not narrow" convention as getSelectedClasses(). Kid-Friendly Mode
 * hides this filter's box (index.html's data-kid-hide) but that's a CSS
 * rule, not a functional one — checked here too, same reasoning
 * class-filter.ts's getSelectedClasses() gives for the identical guard:
 * a hidden box must not go on narrowing the pool with whatever was
 * selected before it was hidden.
 */
export function getSelectedScriptTypes(): string[] {
  if (Settings.getKidFriendlyMode()) return [];
  return getSelected();
}

/**
 * The raw stored selection, ignoring Kid-Friendly Mode — unlike
 * getSelectedScriptTypes() above, which presets.ts must not use for
 * capturing a Testing Profile: a profile saved while Kid-Friendly Mode
 * happened to be on would otherwise capture [] even when a real selection
 * was sitting underneath it, silently losing that selection the moment the
 * profile was saved. Same reasoning as class-filter.ts's
 * getClassFilterState() existing alongside getSelectedClasses().
 */
export function getScriptTypeSelection(): string[] {
  return getSelected();
}

/**
 * Set the selection directly and repaint — used by presets.ts to apply a
 * saved bundle in one shot, the way a chip click would but for every script
 * type at once. Same shape as class-filter.ts's applyClassSelection.
 */
export function applyScriptTypeSelection(selected: string[]): void {
  saveSelected([...selected]);
  syncScriptTypeUI();
  notifyChange();
}

/**
 * Apply the filter to a word list. A word with no Japanese script at all
 * (classifyJapaneseScript returns null — punctuation, a stray non-Japanese
 * entry) passes through unconditionally, same reasoning applyDomainFilter
 * uses for a word with no domain data: this filter narrows by a fact some
 * words don't have, and absence of the fact isn't grounds for exclusion.
 */
export function applyScriptTypeFilter<T extends { word: string }>(
  words: T[], selectedScripts: string[],
): T[] {
  if (selectedScripts.length === 0) return words;
  return words.filter(w => {
    const script = classifyJapaneseScript(w.word);
    return script === null || selectedScripts.includes(script);
  });
}
