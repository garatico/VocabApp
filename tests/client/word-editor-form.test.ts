// @vitest-environment jsdom
/**
 * word-editor-form.test.ts — the shared Word Editor's form
 * (src/client/ui/word-editor/form.ts), used by the Admin panel and My
 * Content. Covers the populate → collect round trip (what gets sent on Save),
 * dirty tracking, "+ New", id prefixing, and read-only fields.
 */
import { describe, it, expect } from 'vitest';
import { buildWordForm } from '../../src/client/ui/word-editor/form.ts';
import type { WordData } from '../../src/client/ui/word-editor/types.ts';

const HABLAR: WordData = {
  word: 'hablar',
  translation: 'to talk',
  pos: 'verb',
  difficulty: '1',
  notes: 'Regular -ar verb.',
  glosses: ['talk', 'speak'],
  examples: ['Yo hablo español.', '¿Hablas inglés?'],
  domains: ['communication'],
  emoji: '🗣',
  frequency: { band: 'A1', rank: 127, corpus_frequency: 327201.5 },
  linguistic: {
    ipa: '/aˈblaɾ/', syllables: ['ha', 'blar'], gender: null, plural: null,
    infinitive: null, register: 'neutral', reflexive: false,
  },
  disambiguator: null,
};

function build(opts = {}) {
  const form = buildWordForm(opts);
  document.body.appendChild(form.host);
  return form;
}

describe('word-editor form', () => {
  it('round-trips a word through populate → collect', () => {
    const form = build();
    form.populate(HABLAR);
    const out = form.collect();

    expect(out.translation).toBe('to talk');
    expect(out.pos).toBe('verb');
    expect(out.difficulty).toBe('1');
    expect(out.notes).toBe('Regular -ar verb.');
    expect(out.glosses).toEqual(['talk', 'speak']);
    expect(out.examples).toEqual(['Yo hablo español.', '¿Hablas inglés?']);
    expect(out.domains).toEqual(['communication']);
    expect(out.emoji).toBe('🗣');
    expect(out.frequency).toEqual({ rank: 127, corpus_frequency: 327201.5 });
    expect(out.linguistic?.ipa).toBe('/aˈblaɾ/');
    // syllables arrive as an array and are edited as one hyphenated string
    expect(out.linguistic?.syllables).toBe('ha-blar');
    expect(out.linguistic?.register).toBe('neutral');
    expect(out.linguistic?.reflexive).toBe(false);
    form.host.remove();
  });

  it('sends blanks as null rather than empty strings', () => {
    const form = build();
    form.populate({ word: 'x', translation: 't' });
    const out = form.collect();
    expect(out.pos ?? null).not.toBe('');
    expect(out.emoji).toBeNull();
    expect(out.linguistic?.ipa).toBeNull();
    expect(out.frequency).toEqual({ rank: null, corpus_frequency: null });
    form.host.remove();
  });

  it('starts clean, goes dirty on an edit, and is clean again after populate', () => {
    const form = build();
    form.populate(HABLAR);
    expect(form.isDirty()).toBe(false);
    expect(form.saveBtn.disabled).toBe(true);

    const notes = form.host.querySelector<HTMLTextAreaElement>('#editNotes')!;
    notes.value = 'changed';
    notes.dispatchEvent(new Event('input', { bubbles: true }));
    expect(form.isDirty()).toBe(true);
    expect(form.saveBtn.disabled).toBe(false);

    form.populate(HABLAR);
    expect(form.isDirty()).toBe(false);
    form.host.remove();
  });

  it('a chip removed by its × marks the form dirty', () => {
    const form = build();
    form.populate(HABLAR);
    form.host.querySelector<HTMLButtonElement>('#editGlossesChips .chip-input-tag-remove')!.click();
    expect(form.isDirty()).toBe(true);
    expect(form.collect().glosses).toEqual(['speak']);
    form.host.remove();
  });

  it('collect() picks up a gloss still sitting unconfirmed in the text field', () => {
    const form = build();
    form.populate(HABLAR);
    form.host.querySelector<HTMLInputElement>('#editGlossesInput')!.value = 'chat';
    expect(form.collect().glosses).toEqual(['talk', 'speak', 'chat']);
    form.host.remove();
  });

  it('"+ New" opens a blank form with a typeable word key', () => {
    const form = build();
    form.populate(HABLAR);
    form.startNew();
    expect(form.isCreating()).toBe(true);
    const key = form.host.querySelector<HTMLInputElement>('#editWord')!;
    expect(key.readOnly).toBe(false);
    expect(key.value).toBe('');
    expect(form.collect().glosses).toEqual([]);
    key.value = '  nuevo ';
    expect(form.getKey()).toBe('nuevo');
    form.close();
    expect(form.isCreating()).toBe(false);
    expect(key.readOnly).toBe(true);
    form.host.remove();
  });

  it('keeps a value the fixed option list lacks (e.g. German "neuter")', () => {
    const form = build();
    form.populate({ word: 'Kind', linguistic: { gender: 'neuter' } });
    expect(form.collect().linguistic?.gender).toBe('neuter');
    form.host.remove();
  });

  it('omits disambiguator when the store cannot hold one', () => {
    const form = build();
    form.applyMeta({ pos: [], domains: [], disambiguatorSupported: false });
    form.populate(HABLAR);
    expect('disambiguator' in form.collect()).toBe(false);
    form.applyMeta({ pos: [], domains: [], disambiguatorSupported: true });
    expect('disambiguator' in form.collect()).toBe(true);
    form.host.remove();
  });

  it('prefixes every id, so two hosts on one page never collide', () => {
    const a = build({ idPrefix: 'a-' });
    const b = build({ idPrefix: 'b-' });
    expect(document.querySelectorAll('#a-editNotes')).toHaveLength(1);
    expect(document.querySelectorAll('#b-editNotes')).toHaveLength(1);
    expect(document.getElementById('editNotes')).toBeNull();
    a.host.remove(); b.host.remove();
  });

  it('disables read-only fields but still reports their values', () => {
    const form = build({ readOnlyFields: ['ipa', 'gender'] });
    form.populate(HABLAR);
    expect(form.host.querySelector<HTMLInputElement>('#editIPA')!.disabled).toBe(true);
    expect(form.host.querySelector<HTMLInputElement>('#editTranslation')!.disabled).toBe(false);
    expect(form.collect().linguistic?.ipa).toBe('/aˈblaɾ/');
    form.host.remove();
  });
});
