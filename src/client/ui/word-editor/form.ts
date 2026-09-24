/**
 * word-editor/form.ts — the edit form: Identity, Classification, Linguistic
 * Data, Examples & Notes, with collapsible sections, chip inputs, an emoji
 * picker, dirty tracking and Save / Reset / Collapse All / ✕.
 *
 * Extracted from the Admin panel's Word Editor (which used to be static HTML
 * in admin.html wired up by element id) so My Content can offer the very same
 * form. The markup and class names are unchanged; what is new is that every
 * id can be prefixed (so two hosts can never collide) and that a host can mark
 * fields read-only.
 */

import { createChipInput, type ChipInputHandle } from './chip-input.ts';
import { setupEmojiPicker } from './emoji-picker.ts';
import type { WordData } from './types.ts';

/** Fields a host may lock. Names match the concept, not the element id. */
export type FormField =
  | 'translation' | 'glosses' | 'pos' | 'difficulty' | 'domains'
  | 'ipa' | 'syllables' | 'gender' | 'plural' | 'infinitive' | 'register' | 'reflexive'
  | 'rank' | 'corpusFrequency' | 'emoji' | 'disambiguator' | 'examples' | 'notes';

export interface WordFormOptions {
  idPrefix?: string;
  /** Fields shown but not editable (disabled and greyed). Their values are still
   *  returned by `collect()`, unchanged, so a host can diff against the original. */
  readOnlyFields?: FormField[];
  /** Extra buttons placed in the header, after the standard ones. */
  extraHeaderButtons?: HTMLElement[];
  /** Show Tags / Synonyms / Antonyms chip fields (My Content). */
  relationFields?: boolean;
  /** A note input under Glosses for each sense — "work" → "function". */
  meaningNotes?: boolean;
  /** Show ‹ › on each gloss chip so senses can be reordered. */
  reorderGlosses?: boolean;
  /**
   * When a word carries `original`, mark each field that differs from it
   * ("edited") with a ↺ to put just that field back, and list original
   * glosses that have been removed so they can be restored.
   */
  trackOriginal?: boolean;
}

export interface WordFormHandle {
  /** The whole `.form-panel` (placeholder + form card), ready to append. */
  host: HTMLElement;
  /** The `.edit-form-card` itself. */
  root: HTMLElement;
  /** The "Select a word to edit it" placeholder shown when nothing is open. */
  emptyState: HTMLElement;
  saveBtn: HTMLButtonElement;
  resetBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
  populate(word: WordData): void;
  /** Blank form for a new word, with the word-key box made typeable. */
  startNew(): void;
  collect(): Omit<WordData, 'word'>;
  /** The word-key box's value. */
  getKey(): string;
  isCreating(): boolean;
  setCreating(creating: boolean): void;
  isDirty(): boolean;
  setDirty(dirty: boolean): void;
  /** Hides the form and shows the empty-state placeholder. */
  close(): void;
  /** Meta the host learns after load: real POS values, domain suggestions, disambiguator support. */
  applyMeta(meta: { pos: string[]; domains: string[]; disambiguatorSupported?: boolean }): void;
  /** Header text after a save, and the derived band/colour. */
  showSaved(word: WordData): void;
}

const POS_DEFAULTS = ['adjective', 'adverb', 'article', 'conjunction', 'noun', 'preposition', 'pronoun', 'verb'];

export function buildWordForm(options: WordFormOptions = {}): WordFormHandle {
  const p = options.idPrefix ?? '';
  const id = (name: string): string => p + name;
  const readOnly = new Set<FormField>(options.readOnlyFields ?? []);

  const host = document.createElement('div');
  host.className = 'form-panel';
  host.id = id('formPanel');
  host.innerHTML = `
    <div class="form-panel-empty" id="${id('formPanelEmpty')}">
      <div class="hint-icon">✏️</div>
      <div class="hint-text">Select a word to edit it</div>
    </div>

    <div class="edit-form-card" id="${id('editFormCard')}" style="display:none;">
      <div class="edit-form-header">
        <div class="edit-form-title-row">
          <span class="edit-form-word" id="${id('editFormWordTitle')}"></span>
          <span class="edit-form-word-meta" id="${id('editFormWordMeta')}"></span>
        </div>
        <div class="edit-form-actions">
          <button id="${id('saveBtn')}">💾 Save</button>
          <button class="secondary" id="${id('resetBtn')}">Reset</button>
          <button class="secondary" id="${id('toggleAllSectionsBtn')}">Collapse All</button>
          <button class="ghost" id="${id('cancelBtn')}">✕</button>
        </div>
      </div>

      <div class="edit-form-body">

        <div class="form-section">
          <div class="form-section-title">Identity</div>
          <div class="form-row">
            <div class="form-group">
              <label id="${id('editWordLabel')}">Word key (read-only)</label>
              <input type="text" id="${id('editWord')}" class="readonly-field" readonly placeholder="e.g. hablar">
            </div>
            <div class="form-group">
              <label>Translation (primary English)</label>
              <input type="text" id="${id('editTranslation')}" placeholder="Primary English translation">
            </div>
          </div>
          <div class="form-group">
            <label>Glosses <span class="hint">type one, press Enter or comma to add</span></label>
            <div class="chip-input" id="${id('editGlossesChips')}">
              <input type="text" id="${id('editGlossesInput')}" class="chip-input-field" placeholder="Add a gloss…">
            </div>
            <div class="we-removed-glosses" id="${id('removedGlosses')}" hidden></div>
          </div>
          ${options.meaningNotes ? `
          <div class="form-group we-meaning-notes" id="${id('meaningNotesGroup')}">
            <label>Sense notes <span class="hint">optional — shown as "gloss (note)" to tell similar senses apart</span></label>
            <div class="we-meaning-list" id="${id('meaningNotesList')}"></div>
          </div>` : ''}
        </div>

        <div class="form-section">
          <div class="form-section-title">Classification</div>
          <div class="form-row-3">
            <div class="form-group">
              <label>Part of Speech</label>
              <select id="${id('editPos')}" class="we-pos">
                ${POS_DEFAULTS.map(v => `<option value="${v}">${v}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Difficulty</label>
              <select id="${id('editDifficulty')}" title="1 = most common, 5 = rarest">
                <option value="">—</option>
                <option value="1">1 — most common</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5 — rarest</option>
              </select>
            </div>
            <div class="form-group">
              <label>CEFR Band <span class="hint">derived from rank, read-only</span></label>
              <input type="text" id="${id('editBand')}" class="readonly-field we-band" data-band readonly>
            </div>
          </div>
          <div class="form-group">
            <label>Domains <span class="hint">type one, press Enter or comma to add</span></label>
            <div class="chip-input" id="${id('editDomainsChips')}">
              <input type="text" id="${id('editDomainsInput')}" class="chip-input-field" placeholder="Add a domain…" list="${id('editDomainSuggestions')}">
            </div>
            <datalist id="${id('editDomainSuggestions')}"></datalist>
          </div>
          ${options.relationFields ? ['Tags', 'Synonyms', 'Antonyms'].map(name => `
          <div class="form-group">
            <label>${name} <span class="hint">type one, press Enter or comma to add</span></label>
            <div class="chip-input" id="${id(`edit${name}Chips`)}">
              <input type="text" id="${id(`edit${name}Input`)}" class="chip-input-field" placeholder="Add…">
            </div>
          </div>`).join('') : ''}
        </div>

        <div class="form-section">
          <div class="form-section-title">Linguistic Data</div>
          <div class="form-row">
            <div class="form-group">
              <label>IPA Pronunciation</label>
              <input type="text" id="${id('editIPA')}" placeholder="[aˈβlaɾ]">
            </div>
            <div class="form-group">
              <label>Syllables (hyphen-separated)</label>
              <input type="text" id="${id('editSyllables')}" placeholder="ha-blar">
            </div>
          </div>
          <div class="form-row-5">
            <div class="form-group">
              <label>Gender</label>
              <select id="${id('editGender')}" class="we-gender">
                <option value="">— none —</option>
                <option value="masculine">masculine</option>
                <option value="feminine">feminine</option>
              </select>
            </div>
            <div class="form-group">
              <label>Plural form</label>
              <input type="text" id="${id('editPlural')}" placeholder="casas">
            </div>
            <div class="form-group">
              <label>Infinitive</label>
              <input type="text" id="${id('editInfinitive')}" placeholder="hablar">
            </div>
            <div class="form-group">
              <label>Register</label>
              <select id="${id('editRegister')}">
                <option value="">—</option>
                <option value="formal">formal</option>
                <option value="informal">informal</option>
                <option value="colloquial">colloquial</option>
                <option value="literary">literary</option>
                <option value="technical">technical</option>
              </select>
            </div>
            <div class="form-group">
              <label>&nbsp;</label>
              <div class="checkbox-row">
                <input type="checkbox" id="${id('editReflexive')}">
                <label for="${id('editReflexive')}">Reflexive Verb</label>
              </div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Frequency Rank</label>
              <input type="number" id="${id('editRank')}" placeholder="1" min="1">
            </div>
            <div class="form-group">
              <label>Corpus Frequency</label>
              <input type="number" id="${id('editCorpusFrequency')}" placeholder="0.00" step="0.01" min="0">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Emoji fallback <span class="hint">shown when no SVG exists</span></label>
              <div class="emoji-field" id="${id('editEmojiField')}">
                <input type="text" id="${id('editEmoji')}" placeholder="🍎" maxlength="8">
                <button type="button" class="secondary emoji-picker-trigger" id="${id('editEmojiPickerBtn')}" title="Browse emoji" aria-haspopup="true" aria-expanded="false">🔍</button>
                <div class="emoji-picker-panel" id="${id('editEmojiPickerPanel')}" hidden></div>
              </div>
            </div>
            <div class="form-group">
              <label>Disambiguator <span id="${id('editDisambiguatorHint')}" class="hint" hidden></span></label>
              <input type="text" id="${id('editDisambiguator')}" placeholder='e.g. auxiliary — shown as "haber (auxiliary)"'/>
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-title">Examples &amp; Notes</div>
          <div class="form-group">
            <label>Examples (one per line)</label>
            <textarea id="${id('editExamples')}" placeholder="Yo hablo español.&#10;¿Hablas inglés?"></textarea>
          </div>
          <div class="form-group">
            <label>Usage notes, common mistakes, context</label>
            <textarea id="${id('editNotes')}" class="short" placeholder="Regular -ar verb. Commonly confused with…"></textarea>
          </div>
        </div>

      </div>
    </div>
  `;

  const q = <T extends HTMLElement>(name: string): T => host.querySelector<T>(`[id="${id(name)}"]`) as T;

  const emptyState = q<HTMLElement>('formPanelEmpty');
  const card       = q<HTMLElement>('editFormCard');
  const titleEl    = q<HTMLElement>('editFormWordTitle');
  const metaEl     = q<HTMLElement>('editFormWordMeta');
  const saveBtn    = q<HTMLButtonElement>('saveBtn');
  const resetBtn   = q<HTMLButtonElement>('resetBtn');
  const cancelBtn  = q<HTMLButtonElement>('cancelBtn');
  const toggleAll  = q<HTMLButtonElement>('toggleAllSectionsBtn');
  const body       = host.querySelector<HTMLElement>('.edit-form-body') as HTMLElement;

  const wordInput   = q<HTMLInputElement>('editWord');
  const wordLabel   = q<HTMLElement>('editWordLabel');
  const translation = q<HTMLInputElement>('editTranslation');
  const posSel      = q<HTMLSelectElement>('editPos');
  const difficulty  = q<HTMLSelectElement>('editDifficulty');
  const band        = q<HTMLInputElement>('editBand');
  const ipa         = q<HTMLInputElement>('editIPA');
  const syllables   = q<HTMLInputElement>('editSyllables');
  const gender      = q<HTMLSelectElement>('editGender');
  const plural      = q<HTMLInputElement>('editPlural');
  const infinitive  = q<HTMLInputElement>('editInfinitive');
  const register    = q<HTMLSelectElement>('editRegister');
  const reflexive   = q<HTMLInputElement>('editReflexive');
  const rank        = q<HTMLInputElement>('editRank');
  const corpusFreq  = q<HTMLInputElement>('editCorpusFrequency');
  const emoji       = q<HTMLInputElement>('editEmoji');
  const disambig    = q<HTMLInputElement>('editDisambiguator');
  const disambigHint = q<HTMLElement>('editDisambiguatorHint');
  const examples    = q<HTMLTextAreaElement>('editExamples');
  const notes       = q<HTMLTextAreaElement>('editNotes');
  const domainSuggestions = q<HTMLDataListElement>('editDomainSuggestions');

  // Chip edits made through the UI (add / remove / reorder) mark the form dirty
  // and refresh anything derived from the list — see onChipsChanged below.
  const chipChanged = (): void => onChipsChanged();
  const glossesChip: ChipInputHandle = createChipInput(
    q('editGlossesChips'), q<HTMLInputElement>('editGlossesInput'), 'gloss',
    { reorderable: options.reorderGlosses, onChange: chipChanged },
  );
  const domainsChip: ChipInputHandle = createChipInput(
    q('editDomainsChips'), q<HTMLInputElement>('editDomainsInput'), 'domain', { onChange: chipChanged });
  const relationChips = options.relationFields
    ? {
        tags:     createChipInput(q('editTagsChips'),     q<HTMLInputElement>('editTagsInput'),     'tag',     { onChange: chipChanged }),
        synonyms: createChipInput(q('editSynonymsChips'), q<HTMLInputElement>('editSynonymsInput'), 'synonym', { onChange: chipChanged }),
        antonyms: createChipInput(q('editAntonymsChips'), q<HTMLInputElement>('editAntonymsInput'), 'antonym', { onChange: chipChanged }),
      }
    : null;
  const removedGlossesEl = q<HTMLElement>('removedGlosses');
  const meaningList = options.meaningNotes ? q<HTMLElement>('meaningNotesList') : null;

  let currentOriginal: WordData | null = null;
  const meaningNotes: Record<string, string> = {};

  options.extraHeaderButtons?.forEach(b => host.querySelector('.edit-form-actions')?.appendChild(b));

  let creating = false;
  let dirty = false;
  let disambiguatorSupported = true;

  // ── Read-only fields ─────────────────────────────────────────────────────
  const controlsFor: Record<FormField, HTMLElement[]> = {
    translation: [translation], glosses: [q('editGlossesInput')], pos: [posSel], difficulty: [difficulty],
    domains: [q('editDomainsInput')],
    ipa: [ipa], syllables: [syllables], gender: [gender], plural: [plural], infinitive: [infinitive],
    register: [register], reflexive: [reflexive], rank: [rank], corpusFrequency: [corpusFreq],
    emoji: [emoji, q('editEmojiPickerBtn')], disambiguator: [disambig], examples: [examples], notes: [notes],
  };
  readOnly.forEach(field => {
    controlsFor[field].forEach(el => {
      (el as HTMLInputElement).disabled = true;
      el.classList.add('readonly-field');
    });
  });
  const isLocked = (f: FormField): boolean => readOnly.has(f);

  // ── Dirty tracking ───────────────────────────────────────────────────────
  // Save stays disabled until something changes — there is nothing to save
  // otherwise. Delegated on the body: 'input'/'change' cover every field, and
  // a chip's remove button is a plain click neither event fires for.
  function setDirty(next: boolean): void { dirty = next; saveBtn.disabled = !next; }
  saveBtn.disabled = true;
  body.addEventListener('input',  () => setDirty(true));
  body.addEventListener('change', () => setDirty(true));
  body.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('.chip-input-tag-remove, .chip-input-tag-move')) setDirty(true);
  });
  // Every field edit refreshes the "edited" markers (cheap: a dozen string compares).
  body.addEventListener('input',  () => refreshMarkers());
  body.addEventListener('change', () => refreshMarkers());

  // ── Collapsible sections ─────────────────────────────────────────────────
  const sections = [...host.querySelectorAll<HTMLElement>('.form-section')];
  function updateToggleAllLabel(): void {
    toggleAll.textContent = sections.some(s => !s.classList.contains('collapsed')) ? 'Collapse All' : 'Expand All';
  }
  sections.forEach(section => {
    const title = section.querySelector<HTMLElement>(':scope > .form-section-title');
    if (!title) return;
    const sectionBody = document.createElement('div');
    sectionBody.className = 'form-section-body';
    [...section.children].forEach(child => { if (child !== title) sectionBody.appendChild(child); });
    section.appendChild(sectionBody);
    title.classList.add('form-section-toggle');
    title.setAttribute('role', 'button');
    title.setAttribute('aria-expanded', 'true');
    title.tabIndex = 0;
    title.insertAdjacentHTML('beforeend', '<span class="form-section-caret">▾</span>');
    const toggle = (): void => {
      const collapsed = section.classList.toggle('collapsed');
      title.setAttribute('aria-expanded', String(!collapsed));
      updateToggleAllLabel();
    };
    title.addEventListener('click', toggle);
    title.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
  toggleAll.addEventListener('click', () => {
    const anyExpanded = sections.some(s => !s.classList.contains('collapsed'));
    sections.forEach(section => {
      section.classList.toggle('collapsed', anyExpanded);
      section.querySelector('.form-section-title')?.setAttribute('aria-expanded', String(!anyExpanded));
    });
    updateToggleAllLabel();
  });

  setupEmojiPicker(q('editEmojiField'), q<HTMLButtonElement>('editEmojiPickerBtn'), q('editEmojiPickerPanel'), emoji);

  // ── Colour attributes ────────────────────────────────────────────────────
  // A [data-pos]/[data-band]/[data-gender] attribute is what the editor's CSS
  // reads its per-value hue off — the same scheme used everywhere else.
  function setColorAttr(el: HTMLElement, attr: string, value: string | null | undefined): void {
    if (value) el.setAttribute(attr, value); else el.removeAttribute(attr);
  }
  function setSelectValue(el: HTMLSelectElement, value: string): void {
    el.value = value;
    if (el.value !== value && value) {
      // A real value the fixed option list does not carry (German "neuter",
      // a handful of odd Spanish genders): show it rather than blanking it.
      const opt = document.createElement('option');
      opt.value = opt.textContent = value;
      el.appendChild(opt);
      el.value = value;
    }
  }
  posSel.addEventListener('change', () => setColorAttr(posSel, 'data-pos', posSel.value));
  gender.addEventListener('change', () => setColorAttr(gender, 'data-gender', gender.value));

  function setCreating(next: boolean): void {
    creating = next;
    wordInput.readOnly = !next;
    wordInput.classList.toggle('readonly-field', !next);
    wordLabel.textContent = next ? 'Word key' : 'Word key (read-only)';
  }

  function metaLine(word: WordData): string {
    return [word.pos ?? null, word.frequency?.band ?? null, word.linguistic?.ipa ?? null]
      .filter(Boolean).join('  ·  ');
  }

  function show(): void {
    emptyState.style.display = 'none';
    card.style.display = 'flex';
  }

  // ── "Edited" markers, restore-a-removed-gloss, per-sense notes ─────────────

  interface Binding {
    group: HTMLElement | null;
    get(): string;
    of(w: WordData): string;
    restore(w: WordData): void;
  }
  const arr = (a: string[] | undefined): string => JSON.stringify(a ?? []);
  const groupOf = (el: HTMLElement): HTMLElement | null => el.closest<HTMLElement>('.form-group');
  const bindings: Binding[] = [
    { group: groupOf(translation), get: () => translation.value.trim(), of: w => (w.translation ?? '').trim(),
      restore: w => { translation.value = w.translation ?? ''; } },
    { group: groupOf(posSel), get: () => posSel.value || '', of: w => w.pos ?? '',
      restore: w => { setSelectValue(posSel, w.pos ?? ''); setColorAttr(posSel, 'data-pos', w.pos); } },
    { group: groupOf(difficulty), get: () => difficulty.value, of: w => w.difficulty ?? '',
      restore: w => { difficulty.value = w.difficulty ?? ''; } },
    { group: groupOf(q('editDomainsChips')), get: () => arr(domainsChip.get()), of: w => arr(w.domains),
      restore: w => domainsChip.set(w.domains ?? []) },
    { group: groupOf(q('editGlossesChips')), get: () => arr(glossesChip.get()), of: w => arr(w.glosses),
      restore: w => glossesChip.set(w.glosses ?? []) },
    { group: groupOf(rank), get: () => rank.value.trim(), of: w => String(w.frequency?.rank ?? ''),
      restore: w => { rank.value = String(w.frequency?.rank ?? ''); } },
    { group: groupOf(disambig), get: () => disambig.value.trim(), of: w => (w.disambiguator ?? '').trim(),
      restore: w => { disambig.value = w.disambiguator ?? ''; } },
    { group: groupOf(examples), get: () => JSON.stringify(examples.value.split('\n').map(e => e.trim()).filter(Boolean)),
      of: w => arr(w.examples), restore: w => { examples.value = (w.examples ?? []).join('\n'); } },
    { group: groupOf(notes), get: () => notes.value.trim(), of: w => (w.notes ?? '').trim(),
      restore: w => { notes.value = w.notes ?? ''; } },
  ];
  if (relationChips) {
    (['tags', 'synonyms', 'antonyms'] as const).forEach(k => {
      bindings.push({
        group: groupOf(q(`edit${k[0].toUpperCase()}${k.slice(1)}Chips`)),
        get: () => arr(relationChips[k].get()), of: w => arr(w[k]),
        restore: w => relationChips[k].set(w[k] ?? []),
      });
    });
  }

  function refreshMarkers(): void {
    bindings.forEach(b => {
      if (!b.group) return;
      const label = b.group.querySelector<HTMLElement>(':scope > label');
      const existing = b.group.querySelector<HTMLButtonElement>(':scope > label > .we-revert');
      const differs = !!(options.trackOriginal && currentOriginal && b.get() !== b.of(currentOriginal));
      b.group.classList.toggle('we-modified', differs);
      if (differs && !existing && label) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'we-revert';
        btn.textContent = '↺ original';
        btn.title = 'Put just this field back the way it was originally';
        btn.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          if (currentOriginal) b.restore(currentOriginal);
          setDirty(true);
          refreshMarkers(); renderRemovedGlosses(); renderMeaningNotes();
        });
        label.appendChild(btn);
      } else if (!differs && existing) {
        existing.remove();
      }
    });
  }

  /** Original glosses that were taken out — shown as ghost chips that put them back. */
  function renderRemovedGlosses(): void {
    removedGlossesEl.innerHTML = '';
    const orig = options.trackOriginal ? currentOriginal?.glosses ?? [] : [];
    const now = new Set(glossesChip.get());
    const removed = orig.filter(g => !now.has(g));
    removedGlossesEl.hidden = removed.length === 0;
    if (!removed.length) return;
    const label = document.createElement('span');
    label.className = 'we-removed-label';
    label.textContent = 'Removed:';
    removedGlossesEl.appendChild(label);
    removed.forEach(g => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'we-ghost-chip';
      btn.textContent = `+ ${g}`;
      btn.title = `Put "${g}" back`;
      btn.addEventListener('click', () => {
        // Back where it was, not at the end: its original position, or as close
        // to it as the senses now present allow.
        const next = [...glossesChip.get()];
        const at = Math.min(Math.max(0, orig.indexOf(g)), next.length);
        next.splice(at, 0, g);
        glossesChip.set(next);
        setDirty(true);
        onChipsChanged();
      });
      removedGlossesEl.appendChild(btn);
    });
  }

  /** One note input per current gloss. */
  function renderMeaningNotes(): void {
    if (!meaningList) return;
    meaningList.innerHTML = '';
    const glosses = glossesChip.get();
    (meaningList.parentElement as HTMLElement).hidden = glosses.length === 0;
    glosses.forEach(g => {
      const row = document.createElement('div');
      row.className = 'we-meaning-row';
      const name = document.createElement('span');
      name.className = 'we-meaning-gloss';
      name.textContent = g;
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'note, e.g. function';
      input.value = meaningNotes[g] ?? '';
      input.addEventListener('input', () => { meaningNotes[g] = input.value; });
      row.append(name, input);
      meaningList.appendChild(row);
    });
  }

  function onChipsChanged(): void {
    setDirty(true);
    refreshMarkers();
    renderRemovedGlosses();
    renderMeaningNotes();
  }

  function populate(word: WordData): void {
    currentOriginal = word.original ?? null;
    Object.keys(meaningNotes).forEach(k => delete meaningNotes[k]);
    Object.assign(meaningNotes, word.meaningDisambiguators ?? {});
    setCreating(false);
    show();
    titleEl.textContent = word.word;
    metaEl.textContent = metaLine(word);

    wordInput.value = word.word;
    translation.value = word.translation ?? '';
    setSelectValue(posSel, word.pos ?? '');
    setColorAttr(posSel, 'data-pos', word.pos);
    difficulty.value = word.difficulty ?? '';
    band.value = word.frequency?.band ?? '';
    setColorAttr(band, 'data-band', word.frequency?.band);
    domainsChip.set(word.domains ?? []);
    glossesChip.set(word.glosses ?? []);
    relationChips?.tags.set(word.tags ?? []);
    relationChips?.synonyms.set(word.synonyms ?? []);
    relationChips?.antonyms.set(word.antonyms ?? []);

    ipa.value = word.linguistic?.ipa ?? '';
    const syl = word.linguistic?.syllables;
    syllables.value = syl ? (Array.isArray(syl) ? syl.join('-') : syl) : '';
    setSelectValue(gender, word.linguistic?.gender ?? '');
    setColorAttr(gender, 'data-gender', word.linguistic?.gender);
    plural.value = word.linguistic?.plural ?? '';
    infinitive.value = word.linguistic?.infinitive ?? '';
    setSelectValue(register, word.linguistic?.register ?? '');
    reflexive.checked = Boolean(word.linguistic?.reflexive);

    rank.value = String(word.frequency?.rank ?? '');
    corpusFreq.value = String(word.frequency?.corpus_frequency ?? '');
    examples.value = (word.examples ?? []).join('\n');
    emoji.value = word.emoji ?? '';
    notes.value = word.notes ?? '';
    disambig.value = word.disambiguator ?? '';
    setDirty(false);
    refreshMarkers(); renderRemovedGlosses(); renderMeaningNotes();
  }

  function startNew(): void {
    show();
    setCreating(true);
    titleEl.textContent = 'New word';
    metaEl.textContent = '';
    [wordInput, translation, band, ipa, syllables, plural, infinitive, rank, corpusFreq, emoji, disambig]
      .forEach(el => { el.value = ''; });
    [posSel, gender, register].forEach(el => setSelectValue(el, ''));
    difficulty.value = '';
    setColorAttr(posSel, 'data-pos', null);
    setColorAttr(band, 'data-band', null);
    setColorAttr(gender, 'data-gender', null);
    domainsChip.set([]);
    glossesChip.set([]);
    relationChips?.tags.set([]); relationChips?.synonyms.set([]); relationChips?.antonyms.set([]);
    currentOriginal = null;
    Object.keys(meaningNotes).forEach(k => delete meaningNotes[k]);
    reflexive.checked = false;
    examples.value = '';
    notes.value = '';
    setDirty(false);
    refreshMarkers(); renderRemovedGlosses(); renderMeaningNotes();
    wordInput.focus();
  }

  function collect(): Omit<WordData, 'word'> {
    glossesChip.addFromInput(); // pick up whatever is still sitting in the text field, unconfirmed
    domainsChip.addFromInput();
    const rankRaw = rank.value;
    const corpusRaw = corpusFreq.value;
    const out: Omit<WordData, 'word'> = {
      translation: translation.value.trim(),
      pos: posSel.value || null,
      emoji: emoji.value.trim() || null,
      difficulty: difficulty.value.trim() || null,
      notes: notes.value.trim(),
      glosses: [...glossesChip.get()],
      examples: examples.value.split('\n').map(e => e.trim()).filter(Boolean),
      domains: [...domainsChip.get()],
      linguistic: {
        ipa: ipa.value.trim() || null,
        syllables: syllables.value.trim() || null,
        gender: gender.value || null,
        plural: plural.value.trim() || null,
        infinitive: infinitive.value.trim() || null,
        register: register.value || null,
        reflexive: reflexive.checked,
      },
      frequency: {
        rank: rankRaw ? parseInt(rankRaw, 10) : null,
        corpus_frequency: corpusRaw ? parseFloat(corpusRaw) : null,
      },
    };
    // Omitted entirely (rather than sent as null) when the store has no such
    // column — a database without support never even sees the field.
    if (disambiguatorSupported) out.disambiguator = disambig.value.trim() || null;
    if (relationChips) {
      relationChips.tags.addFromInput(); relationChips.synonyms.addFromInput(); relationChips.antonyms.addFromInput();
      out.tags = [...relationChips.tags.get()];
      out.synonyms = [...relationChips.synonyms.get()];
      out.antonyms = [...relationChips.antonyms.get()];
    }
    if (meaningList) {
      const present = new Set(glossesChip.get());
      out.meaningDisambiguators = Object.fromEntries(
        Object.entries(meaningNotes).filter(([g, note]) => present.has(g) && note.trim()).map(([g, note]) => [g, note.trim()]));
    }
    return out;
  }

  function close(): void {
    currentOriginal = null;
    emptyState.style.display = '';
    card.style.display = 'none';
    setCreating(false);
    setDirty(false);
  }

  function applyMeta(meta: { pos: string[]; domains: string[]; disambiguatorSupported?: boolean }): void {
    if (meta.disambiguatorSupported !== undefined) {
      disambiguatorSupported = Boolean(meta.disambiguatorSupported);
      if (!isLocked('disambiguator')) disambig.disabled = !disambiguatorSupported;
      disambigHint.hidden = disambiguatorSupported;
      disambigHint.textContent = disambiguatorSupported ? '' : '(requires a database column not yet added)';
    }
    if (meta.pos.length) {
      const cur = posSel.value;
      posSel.innerHTML = meta.pos.map(v => {
        const safe = v.replace(/"/g, '&quot;').replace(/</g, '&lt;');
        return `<option value="${safe}">${safe}</option>`;
      }).join('');
      if (cur) posSel.value = cur;
    }
    if (meta.domains.length) {
      domainSuggestions.innerHTML = meta.domains
        .map(d => `<option value="${d.replace(/"/g, '&quot;').replace(/</g, '&lt;')}"></option>`).join('');
    }
  }

  function showSaved(word: WordData): void {
    setCreating(false);
    setDirty(false);
    titleEl.textContent = word.word;
    metaEl.textContent = metaLine(word);
    // Band is derived from rank — refresh it (and its colour) with whatever
    // the save actually produced, since a rank edit in the same save can change it.
    band.value = word.frequency?.band ?? '';
    setColorAttr(band, 'data-band', word.frequency?.band);
    setColorAttr(posSel, 'data-pos', word.pos);
  }

  return {
    host, root: card, emptyState, saveBtn, resetBtn, cancelBtn,
    populate, startNew, collect,
    getKey: () => wordInput.value.trim(),
    isCreating: () => creating, setCreating,
    isDirty: () => dirty, setDirty,
    close, applyMeta, showSaved,
  };
}
