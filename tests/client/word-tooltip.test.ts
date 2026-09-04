// @vitest-environment jsdom
/**
 * word-tooltip.test.ts — the hover tooltip attached by attachTooltips()
 * (src/client/utils/word-tooltip.ts): the one file in this codebase that's
 * pure DOM construction/positioning with no separable pure-logic function,
 * so — unlike every other tests/client/*.test.ts file — this one runs under
 * jsdom (a devDependency added just for this file) rather than plain node.
 * Scoped to this file only via the docblock above; every other test file
 * keeps running in the lighter, stub-based node environment untouched.
 *
 * The shared tooltip element and its hide-timer are module-level state (see
 * that file's header) — vi.resetModules() plus a fresh dynamic import per
 * test gets a clean slate for that, and the DOM itself is cleared in
 * beforeEach since resetModules doesn't touch it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Word } from '../../src/client/types.js';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = '';
});

async function load() {
  return import('../../src/client/utils/word-tooltip.js');
}

function baseWord(over: Partial<Word> = {}): Word {
  return {
    word: 'hablar', translation: 'to speak', pos: null, difficulty: null,
    notes: '', glosses: ['to speak', 'to talk'], examples: [],
    svg_url: null, emoji: null, linguistic: null, frequency: null,
    domains: [], tags: [], rank: 1,
    ...over,
  } as Word;
}

function tooltipEl(): HTMLElement {
  const tt = document.getElementById('wordTooltip');
  if (!tt) throw new Error('tooltip element was never created');
  return tt;
}

/** A [data-word-json] element with no other structure around it — no table
 *  row, no picture card, no recall class — the fallback case. */
function plainAnchor(word: Word): HTMLElement {
  const el = document.createElement('span');
  el.dataset.wordJson = JSON.stringify(word);
  document.body.appendChild(el);
  return el;
}

/** Table mode: the word cell, with a sibling input cell carrying whatever
 *  answer-state class table-mode.ts would apply. */
function tableAnchor(word: Word, inputClass?: string): HTMLElement {
  const wordTd  = document.createElement('td');
  wordTd.dataset.wordJson = JSON.stringify(word);
  const inputTd = document.createElement('td');
  if (inputClass !== undefined) {
    const input = document.createElement('input');
    if (inputClass) input.className = inputClass;
    inputTd.appendChild(input);
  }
  const tr = document.createElement('tr');
  tr.append(wordTd, inputTd);
  document.body.appendChild(tr);
  return wordTd;
}

/** Picture mode: the card is the anchor, holding an input whose class says
 *  whether the guess has been revealed. */
function pictureAnchor(word: Word, inputClass?: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'picture-card';
  card.dataset.wordJson = JSON.stringify(word);
  if (inputClass !== undefined) {
    const input = document.createElement('input');
    if (inputClass) input.className = inputClass;
    card.appendChild(input);
  }
  document.body.appendChild(card);
  return card;
}

/** Recall mode: revealed-ness is the anchor's own class, no lookup needed. */
function recallAnchor(word: Word, cls: string): HTMLElement {
  const el = document.createElement('td');
  el.className = cls;
  el.dataset.wordJson = JSON.stringify(word);
  document.body.appendChild(el);
  return el;
}

function hover(el: HTMLElement): void {
  el.dispatchEvent(new Event('mouseenter'));
}
function unhover(el: HTMLElement): void {
  el.dispatchEvent(new Event('mouseleave'));
}

describe('attachTooltips — basic wiring', () => {
  it('does nothing for a container with no [data-word-json] elements', async () => {
    const { attachTooltips } = await load();
    const container = document.createElement('div');
    expect(() => attachTooltips(container)).not.toThrow();
    expect(document.getElementById('wordTooltip')).toBeNull();
  });

  it('populates and shows the tooltip on hover', async () => {
    const { attachTooltips } = await load();
    const anchor = plainAnchor(baseWord());
    attachTooltips(document.body);
    hover(anchor);
    const tt = tooltipEl();
    expect(tt.classList.contains('visible')).toBe(true);
    expect(tt.querySelector('.tt-word')?.textContent).toBe('hablar');
  });

  it('logs a warning and does not throw or show the tooltip on malformed JSON', async () => {
    const { attachTooltips } = await load();
    const { logger } = await import('../../src/client/utils/logger.js');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    const anchor = document.createElement('span');
    anchor.dataset.wordJson = '{not json';
    document.body.appendChild(anchor);
    attachTooltips(document.body);

    expect(() => hover(anchor)).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    expect(document.getElementById('wordTooltip')?.classList.contains('visible')).not.toBe(true);
  });

  it('re-populates for a second anchor rather than appending to the first', async () => {
    const { attachTooltips } = await load();
    const a = plainAnchor(baseWord({ word: 'hablar' }));
    const b = plainAnchor(baseWord({ word: 'comer' }));
    attachTooltips(document.body);
    hover(a);
    hover(b);
    const tt = tooltipEl();
    expect(tt.querySelectorAll('.tt-word')).toHaveLength(1);
    expect(tt.querySelector('.tt-word')?.textContent).toBe('comer');
  });
});

describe('attachTooltips — hide-word-when-unrevealed', () => {
  it('shows the real word by default even when not revealed', async () => {
    const { attachTooltips } = await load();
    const anchor = tableAnchor(baseWord(), '');
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-word')?.textContent).toBe('hablar');
  });

  it('masks the word behind "???" when hideWordWhenUnrevealed is true and not revealed', async () => {
    const { attachTooltips } = await load();
    const anchor = tableAnchor(baseWord(), '');
    attachTooltips(document.body, { hideWordWhenUnrevealed: true });
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-word')?.textContent).toBe('???');
  });

  it('shows the real word once revealed, even with hideWordWhenUnrevealed set', async () => {
    const { attachTooltips } = await load();
    const anchor = tableAnchor(baseWord(), 'correct');
    attachTooltips(document.body, { hideWordWhenUnrevealed: true });
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-word')?.textContent).toBe('hablar');
  });

  it('accepts a per-element function instead of a flat boolean', async () => {
    const { attachTooltips } = await load();
    const a = tableAnchor(baseWord({ word: 'hablar' }), '');
    const b = tableAnchor(baseWord({ word: 'comer' }), '');
    attachTooltips(document.body, { hideWordWhenUnrevealed: el => el === a });
    hover(a);
    expect(tooltipEl().querySelector('.tt-word')?.textContent).toBe('???');
    hover(b);
    expect(tooltipEl().querySelector('.tt-word')?.textContent).toBe('comer');
  });
});

describe('isWordRevealed — table mode', () => {
  it('is revealed when the sibling input is marked correct', async () => {
    const { attachTooltips } = await load();
    const anchor = tableAnchor(baseWord(), 'correct');
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-hidden-hint')).toBeNull();
  });

  it('is revealed when the sibling input is marked incorrect', async () => {
    const { attachTooltips } = await load();
    const anchor = tableAnchor(baseWord(), 'incorrect');
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-hidden-hint')).toBeNull();
  });

  it('is not revealed when the sibling input carries no answer-state class yet', async () => {
    const { attachTooltips } = await load();
    const anchor = tableAnchor(baseWord(), '');
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-hidden-hint')).not.toBeNull();
  });

  it('is revealed when the sibling cell has no input at all (a display-only column)', async () => {
    const { attachTooltips } = await load();
    const anchor = tableAnchor(baseWord()); // no inputClass -> sibling td has no <input>
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-hidden-hint')).toBeNull();
  });
});

describe('isWordRevealed — picture mode', () => {
  it('is revealed when the card\'s input is marked correct', async () => {
    const { attachTooltips } = await load();
    const anchor = pictureAnchor(baseWord(), 'correct');
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-hidden-hint')).toBeNull();
  });

  it('is revealed when the card\'s input is marked revealed', async () => {
    const { attachTooltips } = await load();
    const anchor = pictureAnchor(baseWord(), 'revealed');
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-hidden-hint')).toBeNull();
  });

  it('is not revealed for an untouched input', async () => {
    const { attachTooltips } = await load();
    const anchor = pictureAnchor(baseWord(), '');
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-hidden-hint')).not.toBeNull();
  });

  it('is not revealed for a card with no input element at all', async () => {
    const { attachTooltips } = await load();
    const anchor = pictureAnchor(baseWord());
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-hidden-hint')).not.toBeNull();
  });
});

describe('isWordRevealed — recall mode', () => {
  it('"recalled" is revealed', async () => {
    const { attachTooltips } = await load();
    const anchor = recallAnchor(baseWord(), 'recalled');
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-hidden-hint')).toBeNull();
  });

  it('"missed" is revealed', async () => {
    const { attachTooltips } = await load();
    const anchor = recallAnchor(baseWord(), 'missed');
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-hidden-hint')).toBeNull();
  });

  it('"recall-cell" alone is not revealed', async () => {
    const { attachTooltips } = await load();
    const anchor = recallAnchor(baseWord(), 'recall-cell');
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-hidden-hint')).not.toBeNull();
  });
});

describe('a word merged in from Compare/multi-language table mode (word.language)', () => {
  const merged = baseWord({ language: 'french' });

  it('shows a language badge in the meta row regardless of the indicator setting', async () => {
    const { attachTooltips } = await load();
    localStorage.setItem('s_lang_indicator', 'off');
    const anchor = tableAnchor(merged, 'correct');
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-lang')?.textContent).toContain('French');
  });

  it('tags the tooltip background by language when the indicator is "color" (the default)', async () => {
    const { attachTooltips } = await load();
    const anchor = tableAnchor(merged, 'correct');
    attachTooltips(document.body);
    hover(anchor);
    const tt = tooltipEl();
    expect(tt.classList.contains('lang-tag-french')).toBe(true);
    expect(tt.classList.contains('lang-indicator-flag')).toBe(false);
  });

  it('also sets the flag background image when the indicator is "flag"', async () => {
    const { attachTooltips } = await load();
    localStorage.setItem('s_lang_indicator', 'flag');
    const anchor = tableAnchor(merged, 'correct');
    attachTooltips(document.body);
    hover(anchor);
    const tt = tooltipEl();
    expect(tt.classList.contains('lang-indicator-flag')).toBe(true);
    expect(tt.style.getPropertyValue('--flag-img')).toMatch(/^url\(".+"\)$/);
  });

  it('does not tag the tooltip background at all when the indicator is "off"', async () => {
    const { attachTooltips } = await load();
    localStorage.setItem('s_lang_indicator', 'off');
    const anchor = tableAnchor(merged, 'correct');
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().classList.contains('lang-tag-french')).toBe(false);
  });

  it('clears the previous hover\'s language background before applying the new one', async () => {
    const { attachTooltips } = await load();
    const frAnchor = tableAnchor(merged, 'correct');
    const plain = tableAnchor(baseWord(), 'correct');
    attachTooltips(document.body);
    hover(frAnchor);
    expect(tooltipEl().classList.contains('lang-tag-french')).toBe(true);
    hover(plain);
    expect(tooltipEl().classList.contains('lang-tag-french')).toBe(false);
  });
});

describe('tooltip content', () => {
  it('shows a part-of-speech badge only when the word has one', async () => {
    const { attachTooltips } = await load();
    const withPos = tableAnchor(baseWord({ pos: 'verb' }), 'correct');
    attachTooltips(document.body);
    hover(withPos);
    expect(tooltipEl().querySelector('.tt-pos')?.textContent).toBe('verb');
  });

  it('omits the part-of-speech badge when the word has none', async () => {
    const { attachTooltips } = await load();
    const anchor = tableAnchor(baseWord({ pos: null }), 'correct');
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().querySelector('.tt-pos')).toBeNull();
  });

  it('shows the frequency band and difficulty badges when present', async () => {
    const { attachTooltips } = await load();
    const anchor = tableAnchor(baseWord({
      frequency: { band: 'A2', rank: 100, corpus_frequency: 100 }, difficulty: 3,
    }), 'correct');
    attachTooltips(document.body);
    hover(anchor);
    const tt = tooltipEl();
    expect(tt.querySelector('.tt-band')?.textContent).toBe('A2');
    expect(tt.querySelector('.tt-diff')?.textContent).toBe('Intermediate');
  });

  it('shows the register badge only for a non-neutral register', async () => {
    const { attachTooltips } = await load();
    const neutral = tableAnchor(baseWord({ word: 'a', linguistic: { register: 'neutral' } as Word['linguistic'] }), 'correct');
    attachTooltips(document.body);
    hover(neutral);
    expect(tooltipEl().querySelector('.tt-register')).toBeNull();
  });

  it('shows the register badge for a non-neutral register', async () => {
    const { attachTooltips } = await load();
    const vulgar = tableAnchor(baseWord({ linguistic: { register: 'vulgar' } as Word['linguistic'] }), 'correct');
    attachTooltips(document.body);
    hover(vulgar);
    expect(tooltipEl().querySelector('.tt-register')?.textContent).toBe('vulgar');
  });

  it('shows glosses when revealed', async () => {
    const { attachTooltips } = await load();
    const revealed = tableAnchor(baseWord(), 'correct');
    attachTooltips(document.body);
    hover(revealed);
    expect(tooltipEl().querySelector('.tt-glosses')?.textContent).toBe('to speak / to talk');
  });

  it('shows the hint instead of glosses when not revealed', async () => {
    const { attachTooltips } = await load();
    const hidden = tableAnchor(baseWord(), '');
    attachTooltips(document.body);
    hover(hidden);
    expect(tooltipEl().querySelector('.tt-hidden-hint')?.textContent)
      .toBe('Solve the word to see the translation');
  });

  it('hides synonyms/antonyms when not revealed, even if present', async () => {
    const { attachTooltips } = await load();
    const withRelations = baseWord({ relations: { synonyms: ['charlar'], antonyms: ['callar'] } });
    const hidden = tableAnchor(withRelations, '');
    attachTooltips(document.body);
    hover(hidden);
    expect(tooltipEl().querySelector('.tt-relations')).toBeNull();
  });

  it('shows synonyms/antonyms once revealed', async () => {
    const { attachTooltips } = await load();
    const withRelations = baseWord({ relations: { synonyms: ['charlar'], antonyms: ['callar'] } });
    const revealed = tableAnchor(withRelations, 'correct');
    attachTooltips(document.body);
    hover(revealed);
    const rel = tooltipEl().querySelector('.tt-relations');
    expect(rel?.textContent).toContain('charlar');
    expect(rel?.textContent).toContain('callar');
  });
});

describe('conjugation section', () => {
  const verb = baseWord({
    word: 'hablar', pos: 'verb',
    linguistic: {
      conjugations: {
        present: ['hablo', 'hablas', 'habla', 'hablamos', 'habláis', 'hablan'],
        past_participle: 'hablado',
        gerund: 'hablando',
      },
    } as Word['linguistic'],
  });

  it('is absent for an unrevealed verb', async () => {
    const { attachTooltips } = await load();
    const unrevealed = tableAnchor(verb, '');
    attachTooltips(document.body);
    hover(unrevealed);
    expect(tooltipEl().querySelector('.tt-conj')).toBeNull();
  });

  it('is absent for a revealed non-verb, even with conjugation data present', async () => {
    const { attachTooltips } = await load();
    const nonVerb = tableAnchor(baseWord({ pos: 'noun', linguistic: verb.linguistic }), 'correct');
    attachTooltips(document.body);
    hover(nonVerb);
    expect(tooltipEl().querySelector('.tt-conj')).toBeNull();
  });

  it('appears for a revealed verb', async () => {
    const { attachTooltips } = await load();
    const revealedVerb = tableAnchor(verb, 'correct');
    attachTooltips(document.body);
    hover(revealedVerb);
    expect(tooltipEl().querySelector('.tt-conj')).not.toBeNull();
  });

  it('shows the present tense by default and expands to every tense on click', async () => {
    const { attachTooltips } = await load();
    const anchor = tableAnchor(verb, 'correct');
    attachTooltips(document.body);
    hover(anchor);
    const tt = tooltipEl();

    const presentWrap = tt.querySelector<HTMLElement>('.tt-conj-present');
    const fullWrap    = tt.querySelector<HTMLElement>('.tt-conj-full');
    const expandBtn   = tt.querySelector<HTMLButtonElement>('.tt-expand-btn');
    expect(presentWrap?.hidden).toBe(false);
    expect(fullWrap?.hidden).toBe(true);
    expect(expandBtn?.textContent).toBe('Show all tenses');

    expandBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(presentWrap?.hidden).toBe(true);
    expect(fullWrap?.hidden).toBe(false);
    expect(expandBtn?.textContent).toBe('Show less');

    expandBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(presentWrap?.hidden).toBe(false);
    expect(fullWrap?.hidden).toBe(true);
    expect(expandBtn?.textContent).toBe('Show all tenses');
  });

  it('lists every pronoun\'s present-tense form', async () => {
    const { attachTooltips } = await load();
    const anchor = tableAnchor(verb, 'correct');
    attachTooltips(document.body);
    hover(anchor);
    const forms = [...tooltipEl().querySelectorAll('.tt-conj-present td:not(.tt-pronoun)')].map(td => td.textContent);
    expect(forms).toEqual(['hablo', 'hablas', 'habla', 'hablamos', 'habláis', 'hablan']);
  });

  it('shows a non-finite section with the gerund and past participle', async () => {
    const { attachTooltips } = await load();
    const anchor = tableAnchor(verb, 'correct');
    attachTooltips(document.body);
    hover(anchor);
    const rows = [...tooltipEl().querySelectorAll('.tt-nonfinite-table tr')].map(
      tr => [...tr.children].map(td => td.textContent),
    );
    // Native-language labels (from TENSE_DEFS.spanish), not the English
    // fallback — Spanish does define both keys.
    expect(rows).toEqual([['Gerundio', 'hablando'], ['Participio Pasado', 'hablado']]);
  });

  it('omits the non-finite section when there is neither form', async () => {
    const { attachTooltips } = await load();
    const noNonFinite = tableAnchor(baseWord({
      pos: 'verb',
      linguistic: { conjugations: { present: ['a', 'b', 'c', 'd', 'e', 'f'] } } as Word['linguistic'],
    }), 'correct');
    attachTooltips(document.body);
    hover(noNonFinite);
    expect(tooltipEl().querySelector('.tt-nonfinite')).toBeNull();
  });
});

describe('hide timing', () => {
  beforeEach(() => vi.useFakeTimers());

  it('hides 120ms after the mouse leaves the anchor', async () => {
    const { attachTooltips } = await load();
    const anchor = plainAnchor(baseWord());
    attachTooltips(document.body);
    hover(anchor);
    expect(tooltipEl().classList.contains('visible')).toBe(true);

    unhover(anchor);
    vi.advanceTimersByTime(119);
    expect(tooltipEl().classList.contains('visible')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(tooltipEl().classList.contains('visible')).toBe(false);
  });

  it('cancels the pending hide if the pointer moves onto the tooltip itself', async () => {
    const { attachTooltips } = await load();
    const anchor = plainAnchor(baseWord());
    attachTooltips(document.body);
    hover(anchor);
    unhover(anchor);

    vi.advanceTimersByTime(50);
    tooltipEl().dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(200);
    expect(tooltipEl().classList.contains('visible')).toBe(true);
  });
});
