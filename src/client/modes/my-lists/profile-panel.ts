/**
 * profile-panel.ts — the right-hand pane for a Testing Profile.
 *
 * Same shape as smart-panel.ts: a field editor that saves and redraws on
 * every change, no separate Save button to forget to press. A profile has no
 * word list of its own to preview underneath — it is filter settings, not
 * vocabulary — so this is the editor and nothing else.
 *
 * Previously this editor only existed inline in the sidebar (toggled open by
 * a ⚙ button next to each row). Selecting a profile now opens it here like
 * every other kind of list, and the sidebar keeps Copy/Rename/Delete only —
 * the same split every other list kind uses.
 */

import type { ListsCtx } from './context.ts';
import { enumerateFilterableLists, type FilterableListRow } from '../../utils/word-lists.ts';
import { buildLangBadge } from '../../ui/lang-badge.ts';
import {
  getPreset, savePreset, describePreset,
  type PresetBundle, type WordsBundle, type ConjugationBundle,
} from '../../filters/presets.ts';
import { SCOPE_LABELS, type FilterScope } from '../../filters/filter-scope.ts';
import { POS_CHIPS } from './types.ts';
import { LANGUAGES } from '../../data/languages.ts';
import { readString, writeString } from '../../utils/storage.ts';
import { unionTenseDefs } from '../conjugation/controls.ts';

/** A profile with no `words` yet (saved before that field existed, or a
 *  brand-new BLANK_BUNDLE profile) starts editing from the app's own
 *  defaults, not from nothing — matches what a fresh Table session shows. */
const DEFAULT_WORDS: WordsBundle = {
  poolMode: 'topn', size: '1000', customSize: '', sizeMode: 'window',
  rankFrom: '1', rankTo: '1000', bands: [],
};

const POOL_MODE_OPTIONS: { value: WordsBundle['poolMode']; label: string }[] = [
  { value: 'topn',  label: 'Top N' },
  { value: 'range', label: 'Rank Range' },
  { value: 'band',  label: 'Level' },
];

const SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: '100',  label: 'Top 100' },
  { value: '250',  label: 'Top 250' },
  { value: '500',  label: 'Top 500' },
  { value: '1000', label: 'Top 1000' },
  { value: 'max',  label: 'Max' },
];

const CEFR_BANDS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const QUIZ_STYLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'recall',   label: 'Recall' },
  { value: 'double',   label: 'Double Recall' },
];

/** Conjugation editing starts from the app's own defaults, same reasoning as
 *  DEFAULT_WORDS above. Regularity defaults to "all four" — the live box's
 *  own markup default (see #conjRegChips in index.html), same as an empty
 *  activeRegularities() falling back to every bucket. */
const DEFAULT_CONJUGATION: ConjugationBundle = {
  tenses: [], regularities: ['regular', 'ortho', 'stem', 'irregular'],
  view: 'grid', verbsSize: '100',
};

const VERBS_SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: '25',  label: 'Top 25' },
  { value: '50',  label: 'Top 50' },
  { value: '100', label: 'Top 100' },
  { value: '250', label: 'Top 250' },
  { value: '500', label: 'Top 500' },
  { value: 'max', label: 'All Verbs' },
];

const REGULARITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'regular',   label: 'Regular' },
  { value: 'ortho',     label: 'Spelling' },
  { value: 'stem',      label: 'Stem-change' },
  { value: 'irregular', label: 'Irregular' },
];

const CONJ_VIEW_OPTIONS: { value: string; label: string }[] = [
  { value: 'grid',        label: 'Grid' },
  { value: 'full',        label: 'Full Conjugation' },
  { value: 'oneatatime',  label: 'One at a Time' },
  { value: 'randomtable', label: 'Random Table' },
  { value: 'cardmatch',   label: 'Card Match' },
];

export function renderProfilePanel(ctx: ListsCtx, mode: FilterScope, name: string): void {
  const bundle = getPreset(mode, name);
  if (!bundle) { ctx.selectedProfile = null; ctx.renderPanel(); return; }

  ctx.panel.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'ml-panel-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'ml-panel-title-group';
  const modeTag = document.createElement('span');
  modeTag.className = 'ml-profile-mode-tag';
  modeTag.textContent = SCOPE_LABELS[mode];
  const title = document.createElement('h2');
  title.className = 'ml-panel-title';
  title.textContent = name;
  titleGroup.append(modeTag, title);
  header.appendChild(titleGroup);

  const desc = document.createElement('p');
  desc.className = 'ml-smart-desc';
  desc.textContent = describePreset(bundle);
  header.appendChild(desc);

  const editor = document.createElement('div');
  editor.className = 'ml-smart-editor ml-profile-editor';

  /** Save and redraw — same "re-enter through renderPanel" reasoning as
   *  smart-panel.ts's persist(): calling renderProfilePanel again directly
   *  would stack a second copy of the editor under the first. */
  function persist(next: PresetBundle): void {
    savePreset(mode, name, next);
    ctx.renderPanel();
  }

  /**
   * The "Apply this filter" checkbox shared by the Part of Speech and
   * Domains sections — active/selected are independent, the same way the
   * live filter boxes work (a filter can be off with a selection still
   * remembered), so a profile has to be able to say "off" and have that
   * survive a save/reapply round-trip rather than only ever recording what
   * was picked.
   */
  function activeToggle(checked: boolean, onChange: (active: boolean) => void): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = 'ml-profile-editor-chip ml-profile-editor-active';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    label.append(input, document.createTextNode('Apply this filter'));
    return label;
  }

  /**
   * A labelled, collapsible group of sections — "Word Pool", "Filters",
   * "Quiz Behavior" — so the editor reads as three decisions rather than one
   * flat stack of near-identical boxes.
   *
   * `id` is a stable slug (not per-profile) so collapsing "Filters" while
   * editing one profile stays collapsed when you open another — the same
   * "remembered once opened" behavior the live filter boxes use via
   * section-collapse.ts's `s_section_open_` keys. This reuses that exact
   * storage convention and its `.filter-collapse-btn`/`.filter-body` CSS,
   * but binds its own click handler rather than calling
   * initSectionCollapse() — that function walks *every* `[data-collapse]`
   * element on the page, and this editor rebuilds its buttons from scratch
   * on every single edit (persist() re-renders the whole panel), so calling
   * it here would re-bind a fresh listener onto the live Domains/Class/Tense
   * &amp; Forms boxes elsewhere on the page each time, stacking duplicates.
   */
  function group(id: string, titleText: string, ...sections: HTMLElement[]): HTMLElement {
    const storageKey = 'ml_profile_group_open_' + id;
    const g = document.createElement('div');
    g.className = 'ml-profile-editor-group';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-collapse-btn ml-profile-editor-group-title';
    const bodyId = `mlProfileGroupBody-${id}`;
    btn.setAttribute('aria-controls', bodyId);

    const arrow = document.createElement('span');
    arrow.className = 'filter-collapse-arrow';
    arrow.textContent = '▾';
    const label = document.createElement('span');
    label.className = 'filter-section-label';
    label.textContent = titleText;
    btn.append(arrow, label);

    const body = document.createElement('div');
    body.id = bodyId;
    body.className = 'filter-body ml-profile-editor-group-body';
    body.append(...sections);

    const open = readString(storageKey) !== 'false';
    btn.setAttribute('aria-expanded', String(open));
    body.classList.toggle('filter-body--collapsed', !open);
    btn.addEventListener('click', () => {
      const nowOpen = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(nowOpen));
      body.classList.toggle('filter-body--collapsed', !nowOpen);
      writeString(storageKey, String(nowOpen));
    });

    g.append(btn, body);
    return g;
  }

  /**
   * `activeToggleEl`, when given, sits inline with the label on the same
   * header row — "Apply this filter" reads as answering the label right next
   * to it rather than as one more stacked control underneath.
   */
  function section(labelText: string, activeToggleEl: HTMLElement | null, ...children: (HTMLElement | null)[]): HTMLElement {
    const el = document.createElement('div');
    el.className = 'ml-profile-editor-section';
    const headerRow = document.createElement('div');
    headerRow.className = 'ml-profile-editor-header';
    const label = document.createElement('div');
    label.className = 'ml-profile-editor-label';
    label.textContent = labelText;
    headerRow.appendChild(label);
    if (activeToggleEl) headerRow.appendChild(activeToggleEl);
    el.append(headerRow, ...children.filter((c): c is HTMLElement => c !== null));
    return el;
  }

  // ── Language ─────────────────────────────────────────────────────────────
  const langRow = document.createElement('div');
  langRow.className = 'ml-profile-editor-chips';
  const langSelectEl = document.createElement('select');
  langSelectEl.className = 'ml-profile-editor-select';
  LANGUAGES.forEach(({ name: langName, label }) => {
    const opt = document.createElement('option');
    opt.value = langName; opt.textContent = label;
    opt.selected = (bundle.language ?? ctx.lang) === langName;
    langSelectEl.appendChild(opt);
  });
  langSelectEl.addEventListener('change', () => persist({ ...bundle, language: langSelectEl.value }));
  langRow.appendChild(langSelectEl);
  const langSection = section('Language', null, langRow);

  // ── Extra languages ("+ Languages" merge, Table/Conjugation only) ──────────
  const extraRow = document.createElement('div');
  extraRow.className = 'ml-profile-editor-chips';
  const primaryLang = bundle.language ?? ctx.lang;
  LANGUAGES.filter(l => l.name !== primaryLang).forEach(({ name: langName, label }) => {
    const chipLabel = document.createElement('label');
    chipLabel.className = 'ml-profile-editor-chip';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = (bundle.extraLanguages ?? []).includes(langName);
    input.addEventListener('change', () => {
      const current = bundle.extraLanguages ?? [];
      const extraLanguages = input.checked ? [...current, langName] : current.filter(n => n !== langName);
      persist({ ...bundle, extraLanguages });
    });
    chipLabel.append(input, document.createTextNode(label));
    extraRow.appendChild(chipLabel);
  });
  const extraHint = document.createElement('span');
  extraHint.className = 'ml-profile-editor-hint';
  extraHint.textContent = 'Merges into the pool on Table and Conjugation only';
  const extraSection = section('Languages (+)', null, extraRow, extraHint);

  // ── Words: pool mode + whichever sub-control that mode uses ────────────────
  const words = bundle.words ?? DEFAULT_WORDS;
  const poolRow = document.createElement('div');
  poolRow.className = 'ml-profile-editor-chips';
  POOL_MODE_OPTIONS.forEach(({ value, label }) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pos-chip' + (words.poolMode === value ? ' active' : '');
    chip.textContent = label;
    chip.addEventListener('click', () => persist({ ...bundle, words: { ...words, poolMode: value } }));
    poolRow.appendChild(chip);
  });

  const wordsSubRow = document.createElement('div');
  wordsSubRow.className = 'ml-profile-editor-chips ml-profile-editor-words-sub';

  if (words.poolMode === 'range') {
    const from = document.createElement('input');
    from.type = 'number'; from.min = '1'; from.className = 'ml-profile-editor-number';
    from.value = words.rankFrom;
    from.addEventListener('change', () => persist({ ...bundle, words: { ...words, rankFrom: from.value } }));
    const sep = document.createElement('span');
    sep.textContent = '–';
    const to = document.createElement('input');
    to.type = 'number'; to.min = '1'; to.className = 'ml-profile-editor-number';
    to.value = words.rankTo;
    to.addEventListener('change', () => persist({ ...bundle, words: { ...words, rankTo: to.value } }));
    wordsSubRow.append(from, sep, to);
  } else if (words.poolMode === 'band') {
    CEFR_BANDS.forEach(band => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pos-chip' + (words.bands.includes(band) ? ' active' : '');
      chip.textContent = band;
      chip.addEventListener('click', () => {
        const bands = words.bands.includes(band) ? words.bands.filter(b => b !== band) : [...words.bands, band];
        persist({ ...bundle, words: { ...words, bands } });
      });
      wordsSubRow.appendChild(chip);
    });
  } else {
    const sizeSelectEl = document.createElement('select');
    sizeSelectEl.className = 'ml-profile-editor-select';
    SIZE_OPTIONS.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value; opt.textContent = label; opt.selected = words.size === value;
      sizeSelectEl.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = 'custom'; customOpt.textContent = 'Custom…'; customOpt.selected = words.size === 'custom';
    sizeSelectEl.appendChild(customOpt);
    sizeSelectEl.addEventListener('change', () => persist({ ...bundle, words: { ...words, size: sizeSelectEl.value } }));
    wordsSubRow.appendChild(sizeSelectEl);

    if (words.size === 'custom') {
      const customInput = document.createElement('input');
      customInput.type = 'number'; customInput.min = '1'; customInput.className = 'ml-profile-editor-number';
      customInput.placeholder = 'e.g. 750';
      customInput.value = words.customSize;
      customInput.addEventListener('change', () => persist({ ...bundle, words: { ...words, customSize: customInput.value } }));
      wordsSubRow.appendChild(customInput);
    }

    const sizeModeRow = document.createElement('div');
    sizeModeRow.className = 'ml-profile-editor-chips';
    ([['window', 'By Rank'], ['fill', 'Skip Known']] as const).forEach(([value, label]) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pos-chip' + (words.sizeMode === value ? ' active' : '');
      chip.textContent = label;
      chip.addEventListener('click', () => persist({ ...bundle, words: { ...words, sizeMode: value } }));
      sizeModeRow.appendChild(chip);
    });
    wordsSubRow.appendChild(sizeModeRow);
  }
  const wordsSection = section('Words', null, poolRow, wordsSubRow);

  // Part of speech
  const classActive = activeToggle(bundle.classes.active, active => {
    persist({ ...bundle, classes: { ...bundle.classes, active } });
  });
  const classRow = document.createElement('div');
  classRow.className = 'ml-profile-editor-chips';
  POS_CHIPS.filter(c => c.value).forEach(({ value, label }) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pos-chip' + (bundle.classes.selected.includes(value) ? ' active' : '');
    chip.dataset.pos = value;
    chip.textContent = label;
    chip.addEventListener('click', () => {
      const selected = bundle.classes.selected.includes(value)
        ? bundle.classes.selected.filter(c => c !== value)
        : [...bundle.classes.selected, value];
      persist({ ...bundle, classes: { ...bundle.classes, selected } });
    });
    classRow.appendChild(chip);
  });
  const classSection = section('Part of Speech', classActive, classRow);

  // Domains — free-form, comma separated. Per-language and dynamic, so
  // unlike POS there's no fixed list to offer as checkboxes.
  const domainActive = activeToggle(bundle.domains.active, active => {
    persist({ ...bundle, domains: { ...bundle.domains, active } });
  });
  const domainInput = document.createElement('input');
  domainInput.type = 'text';
  domainInput.className = 'ml-profile-editor-text';
  domainInput.value = bundle.domains.selected.join(', ');
  domainInput.addEventListener('change', () => {
    const selected = domainInput.value.split(',').map(d => d.trim()).filter(Boolean);
    persist({ ...bundle, domains: { ...bundle.domains, selected } });
  });
  const domainSection = section('Domains (comma-separated)', domainActive, domainInput);

  // Lists — Active toggle + Hide/Focus + which of the profile's own
  // language's lists. Entries are stored qualified (qualifyListName), the
  // same format the live Lists filter checkboxes use — an unqualified name
  // happens to still resolve today (parseSelected falls back to whatever
  // language is active when nothing is applying it), but only by accident:
  // it breaks the moment this profile's language differs from wherever it
  // gets applied.
  const listActive = activeToggle(bundle.listFilter.active, active => {
    persist({ ...bundle, listFilter: { ...bundle.listFilter, active } });
  });

  const listModeRow = document.createElement('div');
  listModeRow.className = 'ml-profile-editor-chips';
  const hideLabel = document.createElement('label');
  hideLabel.className = 'ml-profile-editor-chip';
  const hideRadio = document.createElement('input');
  hideRadio.type = 'radio'; hideRadio.name = `ml-profile-listmode-${mode}-${name}`;
  hideRadio.checked = bundle.listFilter.mode !== 'focus';
  hideRadio.addEventListener('change', () => {
    // Picking a mode is a clear statement that you want the filter on — same
    // rule the live Lists filter box's own mode buttons follow.
    persist({ ...bundle, listFilter: { ...bundle.listFilter, mode: 'hide', active: true } });
  });
  hideLabel.append(hideRadio, document.createTextNode('Hide'));
  const focusLabel = document.createElement('label');
  focusLabel.className = 'ml-profile-editor-chip';
  const focusRadio = document.createElement('input');
  focusRadio.type = 'radio'; focusRadio.name = `ml-profile-listmode-${mode}-${name}`;
  focusRadio.checked = bundle.listFilter.mode === 'focus';
  focusRadio.addEventListener('change', () => {
    persist({ ...bundle, listFilter: { ...bundle.listFilter, mode: 'focus', active: true } });
  });
  focusLabel.append(focusRadio, document.createTextNode('Focus'));
  listModeRow.append(hideLabel, focusLabel);

  // Every list a Testing Profile can filter by — this language's own plain
  // lists, every Cross-Language list, and this language's smart lists —
  // shared with the live Lists filter box via enumerateFilterableLists()
  // rather than only ever offering plain lists, which is what left Cross-
  // Language and smart lists unreachable from here before.
  const listNamesRow = document.createElement('div');
  listNamesRow.className = 'ml-profile-editor-chips';
  const availableLists = enumerateFilterableLists(primaryLang, bundle.extraLanguages ?? []);
  if (availableLists.length === 0) {
    const none = document.createElement('span');
    none.className = 'ml-profile-editor-hint';
    none.textContent = `No lists yet in ${primaryLang}`;
    listNamesRow.appendChild(none);
  }

  const addListChip = (row: FilterableListRow): void => {
    const chipLabel = document.createElement('label');
    chipLabel.className = 'ml-profile-editor-chip';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = bundle.listFilter.selected.includes(row.qualified);
    input.addEventListener('change', () => {
      const selected = input.checked
        ? [...bundle.listFilter.selected, row.qualified]
        : bundle.listFilter.selected.filter(n => n !== row.qualified);
      persist({ ...bundle, listFilter: { ...bundle.listFilter, selected } });
    });
    chipLabel.append(input, document.createTextNode(row.displayName), buildLangBadge(row.badgeLangs));
    listNamesRow.appendChild(chipLabel);
  };

  const addListGroupLabel = (text: string, cssModifier: string): void => {
    const groupLabel = document.createElement('span');
    groupLabel.className = `list-filter-group-label list-filter-group-label--${cssModifier}`;
    groupLabel.textContent = text;
    listNamesRow.appendChild(groupLabel);
  };

  availableLists.filter(r => r.group === 'single').forEach(addListChip);
  const multiRows = availableLists.filter(r => r.group === 'multi');
  if (multiRows.length > 0) {
    addListGroupLabel('Cross-Language', 'multi');
    multiRows.forEach(addListChip);
  }
  const smartRows = availableLists.filter(r => r.group === 'smart');
  if (smartRows.length > 0) {
    addListGroupLabel('Smart Lists', 'smart');
    smartRows.forEach(addListChip);
  }

  const listSection = section(`Lists (${primaryLang})`, listActive, listModeRow, listNamesRow);

  // Direction
  const dirRow = document.createElement('div');
  dirRow.className = 'ml-profile-editor-chips';
  const dirOptions: { value: PresetBundle['direction']; label: string }[] = [
    { value: 'target-en', label: 'Word → Meaning' },
    { value: 'en-target', label: 'Meaning → Word' },
    { value: 'mixed',     label: 'Mixed' },
  ];
  dirOptions.forEach(({ value, label }) => {
    const chipLabel = document.createElement('label');
    chipLabel.className = 'ml-profile-editor-chip';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = `ml-profile-direction-${mode}-${name}`;
    input.checked = bundle.direction === value;
    input.addEventListener('change', () => persist({ ...bundle, direction: value }));
    chipLabel.append(input, document.createTextNode(label));
    dirRow.appendChild(chipLabel);
  });
  const dirSection = section('Direction', null, dirRow);

  // Quiz Style — Table only, mirrors #tableStyleToggle. Picture/Conjugation
  // have no such control, so this section simply doesn't exist for them.
  let styleSection: HTMLElement | null = null;
  if (mode === 'table') {
    const styleRow = document.createElement('div');
    styleRow.className = 'ml-profile-editor-chips';
    QUIZ_STYLE_OPTIONS.forEach(({ value, label }) => {
      const chipLabel = document.createElement('label');
      chipLabel.className = 'ml-profile-editor-chip';
      const input = document.createElement('input');
      input.type = 'radio'; input.name = `ml-profile-quizstyle-${mode}-${name}`;
      input.checked = (bundle.quizStyle ?? 'standard') === value;
      input.addEventListener('change', () => persist({ ...bundle, quizStyle: value }));
      chipLabel.append(input, document.createTextNode(label));
      styleRow.appendChild(chipLabel);
    });
    styleSection = section('Quiz Style', null, styleRow);
  }

  // Conjugation's own Tense & Forms / View / Verbs — mirrors #conjTenseChips,
  // #conjRegChips, #conjViewToggle and #conjSizeSelect. Table/Picture have no
  // such controls, so this section simply doesn't exist for them.
  let conjugationSection: HTMLElement | null = null;
  if (mode === 'conjugation') {
    const conj = bundle.conjugation ?? DEFAULT_CONJUGATION;
    const tenseDefs = unionTenseDefs(primaryLang, bundle.extraLanguages ?? []);

    const verbsRow = document.createElement('div');
    verbsRow.className = 'ml-profile-editor-chips';
    const verbsSelectEl = document.createElement('select');
    verbsSelectEl.className = 'ml-profile-editor-select';
    VERBS_SIZE_OPTIONS.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value; opt.textContent = label; opt.selected = conj.verbsSize === value;
      verbsSelectEl.appendChild(opt);
    });
    verbsSelectEl.addEventListener('change', () => {
      persist({ ...bundle, conjugation: { ...conj, verbsSize: verbsSelectEl.value } });
    });
    verbsRow.appendChild(verbsSelectEl);
    const verbsSection = section('Verbs', null, verbsRow);

    // Same classes + data-tense the live #conjTenseChips row uses (see
    // conjugation.css's `[data-tense="…"] { --tense-hue: … }` block) — reused
    // as-is rather than re-declaring the same eleven colors a second time,
    // so the two can't quietly drift out of sync with each other.
    const tenseRow = document.createElement('div');
    tenseRow.className = 'ml-profile-editor-chips ml-profile-editor-tense-chips';
    tenseDefs.forEach(({ key, label }) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'conj-tense-chip' + (conj.tenses.includes(key) ? ' active' : '');
      chip.dataset.tense = key;
      chip.textContent = label;
      chip.addEventListener('click', () => {
        const tenses = conj.tenses.includes(key) ? conj.tenses.filter(t => t !== key) : [...conj.tenses, key];
        persist({ ...bundle, conjugation: { ...conj, tenses } });
      });
      tenseRow.appendChild(chip);
    });

    // Same classes + data-reg the live #conjRegChips list uses (conjugation.css's
    // `.conj-reg-chip[data-reg="…"].active` rules) — one definition of the
    // four regularity colors, not a second copy here.
    const regRow = document.createElement('div');
    regRow.className = 'ml-profile-editor-chips ml-profile-editor-reg-chips';
    REGULARITY_OPTIONS.forEach(({ value, label }) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'conj-reg-chip' + (conj.regularities.includes(value) ? ' active' : '');
      chip.dataset.reg = value;
      chip.textContent = label;
      chip.addEventListener('click', () => {
        const regularities = conj.regularities.includes(value)
          ? conj.regularities.filter(r => r !== value)
          : [...conj.regularities, value];
        persist({ ...bundle, conjugation: { ...conj, regularities } });
      });
      regRow.appendChild(chip);
    });
    const tenseFormsSection = section('Tense & Forms', null, tenseRow, regRow);

    const viewRow = document.createElement('div');
    viewRow.className = 'ml-profile-editor-chips';
    CONJ_VIEW_OPTIONS.forEach(({ value, label }) => {
      const chipLabel = document.createElement('label');
      chipLabel.className = 'ml-profile-editor-chip';
      const input = document.createElement('input');
      input.type = 'radio'; input.name = `ml-profile-conjview-${mode}-${name}`;
      input.checked = conj.view === value;
      input.addEventListener('change', () => persist({ ...bundle, conjugation: { ...conj, view: value } }));
      chipLabel.append(input, document.createTextNode(label));
      viewRow.appendChild(chipLabel);
    });
    const viewSection = section('View', null, viewRow);

    conjugationSection = group('conjugation', 'Conjugation', verbsSection, tenseFormsSection, viewSection);
  }

  const behaviorSections = [
    ...(styleSection ? [styleSection] : []),
    dirSection,
  ];

  editor.append(
    group('wordpool', 'Word Pool', langSection, extraSection, wordsSection),
    group('filters', 'Filters', classSection, domainSection, listSection),
    ...(conjugationSection ? [conjugationSection] : []),
    group('quizbehavior', 'Quiz Behavior', ...behaviorSections),
  );
  header.appendChild(editor);
  ctx.panel.appendChild(header);
}
