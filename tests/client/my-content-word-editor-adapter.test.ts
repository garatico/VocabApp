// @vitest-environment jsdom
/**
 * my-content-word-editor-adapter.test.ts — the translation between the shared
 * Word Editor's flat WordData and My Content's "only what differs" overrides
 * (src/client/modes/my-content/word-editor-adapter.ts). The property that
 * matters: an override built from an edit, applied back to the original,
 * reads as that edit — and an unedited form produces no override at all.
 */
import { describe, it, expect } from 'vitest';
import { rawToData, effectiveToData, diffToOverride } from '../../src/client/modes/my-content/word-editor-adapter.ts';
import { applyWordOverrideRecord } from '../../src/client/data/user-content.ts';
import type { Word } from '../../src/client/types.ts';

const HABLAR = {
  word: 'hablar',
  translation: 'to talk',
  pos: 'verb',
  difficulty: '1',
  notes: 'Regular -ar verb.',
  glosses: ['talk', 'speak', 'say'],
  examples: ['Yo hablo.'],
  linguistic: { reflexive: false, ipa: '/aˈblaɾ/', syllables: ['ha', 'blar'], register: 'neutral' },
  frequency: { band: 'A1', rank: 127, corpus_frequency: 327201 },
  domains: ['communication'],
  tags: [],
  rank: 127,
} as unknown as Word;

/** What the form would send for an unedited `HABLAR`. */
const untouched = () => {
  const { word: _word, original: _o, edited: _e, custom: _c, ...rest } = rawToData(HABLAR);
  return rest;
};

describe('rawToData', () => {
  it('maps a real word into the editor shape', () => {
    const d = rawToData(HABLAR);
    expect(d.difficulty).toBe('1');
    expect(d.frequency).toEqual({ band: 'A1', rank: 127, corpus_frequency: 327201 });
    expect(d.linguistic?.ipa).toBe('/aˈblaɾ/');
    expect(d.glosses).toEqual(['talk', 'speak', 'say']);
  });

  it('derives the band from the rank when the word carries none', () => {
    const d = rawToData({ ...HABLAR, frequency: null, rank: 2000 } as unknown as Word);
    expect(d.frequency?.band).toBe('B1');
  });
});

describe('diffToOverride', () => {
  it('an unedited form produces no override at all', () => {
    expect(diffToOverride(HABLAR, untouched())).toEqual({});
  });

  it('records only the field that changed', () => {
    expect(diffToOverride(HABLAR, { ...untouched(), translation: 'to chat' })).toEqual({ translation: 'to chat' });
    expect(diffToOverride(HABLAR, { ...untouched(), notes: 'x' })).toEqual({ notes: 'x' });
  });

  it('editing a field back to its original value un-overrides it', () => {
    expect(diffToOverride(HABLAR, { ...untouched(), translation: 'to talk' })).toEqual({});
  });

  it('compares difficulty as numbers, so the server\'s "1" is not a change', () => {
    expect(diffToOverride(HABLAR, { ...untouched(), difficulty: '1' })).toEqual({});
    expect(diffToOverride(HABLAR, { ...untouched(), difficulty: '3' })).toEqual({ difficulty: 3 });
    expect(diffToOverride(HABLAR, { ...untouched(), difficulty: null })).toEqual({ difficulty: null });
  });

  it('a changed rank is an override; a cleared rank is not', () => {
    expect(diffToOverride(HABLAR, { ...untouched(), frequency: { rank: 900 } })).toEqual({ rank: 900 });
    expect(diffToOverride(HABLAR, { ...untouched(), frequency: { rank: null } })).toEqual({});
  });

  it('removing a gloss hides it', () => {
    expect(diffToOverride(HABLAR, { ...untouched(), glosses: ['talk', 'say'] })).toEqual({ hiddenGlosses: ['speak'] });
  });

  it('adding a gloss adds it, after the originals', () => {
    expect(diffToOverride(HABLAR, { ...untouched(), glosses: ['talk', 'speak', 'say', 'chat'] }))
      .toEqual({ addedGlosses: ['chat'] });
  });

  it('reordering records the full order', () => {
    expect(diffToOverride(HABLAR, { ...untouched(), glosses: ['say', 'talk', 'speak'] }))
      .toEqual({ glossOrder: ['say', 'talk', 'speak'] });
  });

  it('a removed, an added and a reordered gloss together', () => {
    const o = diffToOverride(HABLAR, { ...untouched(), glosses: ['chat', 'say', 'talk'] });
    expect(o.hiddenGlosses).toEqual(['speak']);
    expect(o.addedGlosses).toEqual(['chat']);
    expect(o.glossOrder).toEqual(['chat', 'say', 'talk']);
  });

  it('blanking a real disambiguator is an override (it hides it)', () => {
    const withD = { ...HABLAR, disambiguator: 'auxiliary' } as unknown as Word;
    const base = { ...(() => { const { word: _w, original: _o, edited: _e, custom: _c, ...r } = rawToData(withD); return r; })() };
    expect(diffToOverride(withD, base)).toEqual({});
    expect(diffToOverride(withD, { ...base, disambiguator: '' })).toEqual({ disambiguator: '' });
  });

  it('keeps only the sense notes that differ from the original', () => {
    const o = diffToOverride(HABLAR, { ...untouched(), meaningDisambiguators: { talk: 'converse', say: '' } });
    expect(o.meaningDisambiguators).toEqual({ talk: 'converse' });
  });
});

describe('an override applied to the original reads as the edit', () => {
  it('round-trips glosses, fields and rank', () => {
    const edit = {
      ...untouched(),
      translation: 'to chat',
      glosses: ['chat', 'say', 'talk'],
      domains: ['communication', 'social'],
      frequency: { rank: 900 },
    };
    const o = diffToOverride(HABLAR, edit);
    const shown = rawToData(applyWordOverrideRecord(HABLAR, { ...o, updatedAt: 1 }));
    expect(shown.translation).toBe('to chat');
    expect(shown.glosses).toEqual(['chat', 'say', 'talk']);
    expect(shown.domains).toEqual(['communication', 'social']);
    expect(shown.frequency?.rank).toBe(900);
  });
});

describe('effectiveToData', () => {
  it('attaches the original and flags an edited word', () => {
    const d = effectiveToData(HABLAR, { translation: 'to chat', updatedAt: 1 }, false);
    expect(d.translation).toBe('to chat');
    expect(d.original?.translation).toBe('to talk');
    expect(d.edited).toBe(true);
    expect(d.custom).toBe(false);
  });

  it('an unedited word is not flagged', () => {
    expect(effectiveToData(HABLAR, null, true)).toMatchObject({ edited: false, custom: true });
  });
});
