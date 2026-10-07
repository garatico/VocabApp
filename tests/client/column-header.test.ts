// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  COLUMNS, parseSort, serializeSort, createCellReader, applyColumnFilters, applyColumnSort, hasColumnFilters,
  createColumnHeader, type ColumnItem, type ColumnView,
} from '../../src/client/modes/my-lists/column-header.ts';
import type { VocabEntry } from '../../src/client/modes/my-lists/types.ts';

const entry = (o: Partial<VocabEntry> & { word: string }): VocabEntry =>
  ({ translation: '', glosses: [], ...o }) as unknown as VocabEntry;

const E = {
  de:    entry({ word: 'de',    translation: 'of',    pos: 'preposition', band: 'A1', rank: 1 }),
  casa:  entry({ word: 'casa',  translation: 'house',  glosses: ['home'], pos: 'noun', band: 'A1', rank: 68 }),
  comer: entry({ word: 'comer', translation: 'eat',    pos: 'verb', band: 'A2', rank: 339 }),
  hablar: entry({ word: 'hablar', translation: 'talk', glosses: ['speak'], pos: 'verb', band: 'B1', rank: 113 }),
  zzz:   entry({ word: 'zzz',   translation: 'nothing' }),                       // no pos, band or rank
};
const items: ColumnItem[] = Object.values(E).map(e => ({ lang: 'spanish', word: e.word, entry: e }));
const info = (it: ColumnItem): ColumnItem => it;

const view = (over: Partial<ColumnView> = {}): ColumnView => ({
  sort: { key: null, dir: 'asc' },
  filters: new Map(),
  sets: { pos: new Set(), band: new Set(), mastered: new Set() },
  ...over,
});

beforeEach(() => { localStorage.clear(); });

describe('saved sort', () => {
  const fallback = { key: 'rank', dir: 'asc' } as const;

  it('round-trips a column and direction, and "none"', () => {
    expect(parseSort(serializeSort({ key: 'percent', dir: 'desc' }), fallback)).toEqual({ key: 'percent', dir: 'desc' });
    expect(parseSort(serializeSort({ key: null, dir: 'asc' }), fallback)).toEqual({ key: null, dir: 'asc' });
  });

  it('still reads what the old Browse dropdown saved', () => {
    expect(parseSort('alpha-desc', fallback)).toEqual({ key: 'word', dir: 'desc' });
    expect(parseSort('rank-desc', fallback)).toEqual({ key: 'rank', dir: 'desc' });
  });

  it('falls back on anything unknown', () => {
    expect(parseSort(null, fallback)).toBe(fallback);
    expect(parseSort('garbage', fallback)).toBe(fallback);
    expect(parseSort('nonsense-asc', fallback)).toBe(fallback);
  });
});

describe('the cell reader', () => {
  it('reads each column, blank where there is nothing', () => {
    const r = createCellReader();
    const casa = items[1], zzz = items[4];
    expect(r.cell(casa, 'word')).toBe('casa');
    expect(r.cell(casa, 'pos')).toBe('noun');
    expect(r.cell(casa, 'band')).toBe('A1');
    expect(r.cell(casa, 'rank')).toBe('68');
    expect(r.cell(casa, 'definition')).toBe('house');
    expect(r.cell(zzz, 'pos')).toBe('');
    expect(r.cell(zzz, 'band')).toBe('');
    expect(r.cell(zzz, 'rank')).toBe('');
  });

  it('reads quiz percentage and mastery level from storage, once per language', () => {
    localStorage.setItem('vq_tally_spanish', JSON.stringify({ casa: { correct: 3, wrong: 1 } }));
    localStorage.setItem('vq_mastery_scale_spanish', JSON.stringify({ casa: 3 }));
    const r = createCellReader();
    expect(r.cell(items[1], 'percent')).toBe('75');
    expect(r.cell(items[0], 'percent')).toBe('');         // never quizzed
    expect(r.cell(items[1], 'mastered')).toBe('3');
    expect(r.cell(items[0], 'mastered')).toBe('0');
    expect(r.text(items[1], 'mastered')).toContain('Confident');
  });

  it('matches a part of speech by name, abbreviation or label, and a definition by its glosses too', () => {
    const r = createCellReader();
    expect(r.text(items[2], 'pos')).toContain('verb');
    expect(r.text(items[2], 'pos')).toContain('Verbs');
    expect(r.text(items[1], 'definition')).toContain('home');
  });

  it('sorts Word without regard to accents or case', () => {
    const r = createCellReader();
    expect(r.sortValue({ lang: 'spanish', word: 'Árbol' }, 'word')).toBe('arbol');
  });
});

describe('applyColumnFilters', () => {
  const run = (v: ColumnView): string[] => applyColumnFilters(items, v, info, createCellReader()).map(i => i.word);

  it('hands back the same array when nothing is filtered', () => {
    const v = view();
    expect(hasColumnFilters(v)).toBe(false);
    expect(applyColumnFilters(items, v, info, createCellReader())).toBe(items);
  });

  it('filters text columns by substring and numeric columns by comparison', () => {
    expect(run(view({ filters: new Map([['word', 'ab']]) }))).toEqual(['hablar']);
    expect(run(view({ filters: new Map([['definition', 'home']]) }))).toEqual(['casa']);       // via a gloss
    expect(run(view({ filters: new Map([['rank', '>100']]) }))).toEqual(['comer', 'hablar']);
    expect(run(view({ filters: new Map([['rank', '1-70']]) }))).toEqual(['de', 'casa']);
  });

  it('keeps only the values left on in the POS and CEFR checklists', () => {
    const none = new Set<string>();
    expect(run(view({ sets: { pos: new Set(['verb']), band: none, mastered: none } }))).toEqual(['comer', 'hablar']);
    expect(run(view({ sets: { pos: none, band: new Set(['A1']), mastered: none } }))).toEqual(['de', 'casa']);
    expect(run(view({ sets: { pos: new Set(['verb']), band: new Set(['A2']), mastered: none } }))).toEqual(['comer']);
  });

  it('drops a word with no part of speech once a POS is chosen, as the old chips did', () => {
    expect(run(view({ sets: { pos: new Set(['noun', 'verb']), band: new Set(), mastered: new Set() } }))).not.toContain('zzz');
  });

  it('combines every filter', () => {
    const v = view({ filters: new Map([['rank', '<200']]), sets: { pos: new Set(['verb', 'noun']), band: new Set(), mastered: new Set() } });
    expect(run(v)).toEqual(['casa', 'hablar']);
  });
});

describe('applyColumnSort', () => {
  const sorted = (key: 'word' | 'rank' | 'band', dir: 'asc' | 'desc'): string[] | undefined =>
    applyColumnSort(items, view({ sort: { key, dir } }), info, createCellReader())?.map(i => i.word);

  it('returns null when no column is selected, so the panel sorts as it always did', () => {
    expect(applyColumnSort(items, view(), info, createCellReader())).toBeNull();
  });

  it('sorts numbers as numbers with blanks last in either direction', () => {
    expect(sorted('rank', 'asc')).toEqual(['de', 'casa', 'hablar', 'comer', 'zzz']);
    expect(sorted('rank', 'desc')).toEqual(['comer', 'hablar', 'casa', 'de', 'zzz']);
  });

  it('sorts CEFR levels in their natural order', () => {
    // A1 (de, casa — a tie keeps their order), A2, B1; the word with no level is last in either direction.
    expect(sorted('band', 'asc')).toEqual(['de', 'casa', 'comer', 'hablar', 'zzz']);
    expect(sorted('band', 'desc')).toEqual(['hablar', 'comer', 'de', 'casa', 'zzz']);
  });
});

describe('the header element', () => {
  function make(over: Record<string, unknown> = {}): { header: ReturnType<typeof createColumnHeader>; onChange: ReturnType<typeof vi.fn> } {
    const onChange = vi.fn();
    const header = createColumnHeader({ hasCheckbox: true, onChange, ...over });
    return { header, onChange };
  }
  const sortBtn = (h: ReturnType<typeof createColumnHeader>, label: string): HTMLButtonElement =>
    [...h.el.querySelectorAll<HTMLButtonElement>('.ml-colhead-sort')].find(b => b.textContent?.startsWith(label)) as HTMLButtonElement;

  it('has one sort button per column and a filter under each', () => {
    const { header } = make();
    expect(header.el.querySelectorAll('.ml-colhead-sort')).toHaveLength(COLUMNS.length);
    expect(header.el.querySelectorAll('input.ml-colhead-filter')).toHaveLength(COLUMNS.filter(c => c.kind === 'text').length);
    expect(header.el.querySelectorAll('.ml-colhead-choice')).toHaveLength(3);          // POS, CEFR and Mastered
    expect(header.el.querySelectorAll('.ml-colhead-resize')).toHaveLength(COLUMNS.length);
  });

  it('cycles ascending -> descending -> off on a click, announcing it, and asks for a redraw each time', () => {
    const { header, onChange } = make();
    const btn = sortBtn(header, 'Rank');
    expect(btn.getAttribute('aria-label')).toBe('Sort by Rank (not sorted)');

    btn.click();
    expect(header.sort).toEqual({ key: 'rank', dir: 'asc' });
    expect(btn.getAttribute('aria-label')).toBe('Sort by Rank (sorted ascending)');
    expect(btn.textContent).toContain('▲');

    btn.click();
    expect(header.sort).toEqual({ key: 'rank', dir: 'desc' });
    expect(btn.textContent).toContain('▼');

    btn.click();
    expect(header.sort.key).toBeNull();
    expect(btn.textContent).not.toMatch(/[▲▼]/);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('remembers the sort only when given a storage key', () => {
    const a = make({ storageKey: 'ml_test_sort' }).header;
    sortBtn(a, 'Word').click();
    expect(localStorage.getItem('ml_test_sort')).toBe('word-asc');
    expect(make({ storageKey: 'ml_test_sort' }).header.sort).toEqual({ key: 'word', dir: 'asc' });
    expect(make().header.sort.key).toBeNull();
  });

  it('records a text filter, drops it when emptied, and asks for a redraw', () => {
    const { header, onChange } = make();
    const box = header.el.querySelector<HTMLInputElement>('.ml-colhead-col--rank input')!;
    box.value = ' >100 ';
    box.dispatchEvent(new Event('input'));
    expect(header.filters.get('rank')).toBe('>100');
    expect(header.hasFilters()).toBe(true);
    box.value = '';
    box.dispatchEvent(new Event('input'));
    expect(header.filters.size).toBe(0);
    expect(header.hasFilters()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('setFilter fills a box without asking for a redraw; reset clears the lot', () => {
    const { header, onChange } = make();
    header.setFilter('word', 'hab');
    expect(header.el.querySelector<HTMLInputElement>('.ml-colhead-col--word input')!.value).toBe('hab');
    expect(header.filters.get('word')).toBe('hab');
    expect(onChange).not.toHaveBeenCalled();

    header.setSort({ key: 'rank', dir: 'desc' });
    header.reset();
    expect(header.filters.size).toBe(0);
    expect(header.sort.key).toBeNull();
    expect(header.el.querySelector<HTMLInputElement>('.ml-colhead-col--word input')!.value).toBe('');
  });

  it('changes its signature whenever the view does (for "back to page 1")', () => {
    const { header } = make();
    const seen = new Set<string>([header.signature()]);
    header.setSort({ key: 'rank', dir: 'asc' }); seen.add(header.signature());
    header.setFilter('word', 'a'); seen.add(header.signature());
    header.sets.pos.add('verb'); seen.add(header.signature());
    expect(seen.size).toBe(4);
  });
});

describe('the POS / CEFR / Mastered checklists', () => {
  function checklist(kind: 'pos' | 'band' | 'mastered', over: Record<string, unknown> = {}): {
    boxes: HTMLInputElement[]; toggle: HTMLButtonElement; all: HTMLButtonElement; onChange: ReturnType<typeof vi.fn>;
    header: ReturnType<typeof createColumnHeader>;
  } {
    const onChange = vi.fn();
    const header = createColumnHeader({ hasCheckbox: false, onChange, ...over });
    const cell = header.el.querySelector(`.ml-colhead-col--${kind}`)!;
    return {
      boxes: [...cell.querySelectorAll<HTMLInputElement>('input[type=checkbox]')],
      toggle: cell.querySelector<HTMLButtonElement>('.ml-chip-dropdown-toggle')!,
      all: cell.querySelector<HTMLButtonElement>('.pos-chip-all')!,
      onChange, header,
    };
  }
  const flip = (cb: HTMLInputElement): void => { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); };

  it('starts with every value on', () => {
    const { boxes, toggle, header } = checklist('pos');
    expect(boxes.length).toBeGreaterThan(5);
    expect(boxes.every(b => b.checked)).toBe(true);
    expect(toggle.textContent).toBe('All');
    expect(header.sets.pos.size).toBe(0);                       // empty = all on, the convention everything else reads
  });

  it('unticking one turns just that one off', () => {
    const { boxes, toggle, header, onChange } = checklist('pos');
    flip(boxes[0]);
    expect(boxes[0].checked).toBe(false);
    expect(boxes.slice(1).every(b => b.checked)).toBe(true);
    expect(toggle.textContent).toBe(`${boxes.length - 1} of ${boxes.length}`);
    expect(header.sets.pos.size).toBe(boxes.length - 1);
    expect(onChange).toHaveBeenCalled();
  });

  it('ticking it again puts everything back to "all on"', () => {
    const { boxes, toggle, header } = checklist('pos');
    flip(boxes[2]);
    flip(boxes[2]);
    expect(header.sets.pos.size).toBe(0);
    expect(toggle.textContent).toBe('All');
  });

  it('cannot untick the last value left on — that would read as "all"', () => {
    const { boxes, header } = checklist('band');
    boxes.slice(1).forEach(flip);                               // leave only the first on
    expect([...header.sets.band]).toEqual([boxes[0] && 'A1']);
    flip(boxes[0]);
    expect(boxes[0].checked).toBe(true);
    expect(header.sets.band.size).toBe(1);
  });

  it('Select all clears the narrowing', () => {
    const { boxes, all, header, toggle } = checklist('pos');
    flip(boxes[0]); flip(boxes[1]);
    all.click();
    expect(header.sets.pos.size).toBe(0);
    expect(boxes.every(b => b.checked)).toBe(true);
    expect(toggle.textContent).toBe('All');
  });

  it('shares its selection with whoever passed the set in (Add Vocabulary narrows by the same one)', () => {
    const shared = new Set<string>();
    const { boxes } = checklist('pos', { posSet: shared });
    flip(boxes[0]);
    expect(shared.size).toBe(boxes.length - 1);
    shared.clear();                                              // changed from elsewhere
  });

  it('shows how many words each value holds', () => {
    const { header, boxes } = checklist('pos');
    header.setCounts('pos', { verb: 7, noun: 3 });
    const hints = [...header.el.querySelectorAll('.ml-colhead-col--pos .ml-chip-dropdown-item-hint')].map(h => h.textContent);
    expect(hints).toContain('7');
    expect(hints).toContain('3');
    expect(hints.length).toBe(boxes.length);
  });
});

describe('the Mastered checklist (what "Hide mastered" became)', () => {
  const rated = (): ColumnItem[] => {
    localStorage.setItem('vq_mastery_scale_spanish', JSON.stringify({ de: 4, casa: 3, comer: 1 }));
    return items;
  };

  it('has one value per mastery level, starting with every level on', () => {
    const header = createColumnHeader({ hasCheckbox: false, onChange: () => {} });
    const labels = [...header.el.querySelectorAll('.ml-colhead-col--mastered .ml-chip-dropdown-item-text')].map(e => e.textContent);
    expect(labels).toEqual(['○ New', '◔ Learning', '◑ Familiar', '◕ Confident', '● Mastered']);   // glyph + name, coloured like the rows
    expect(header.sets.mastered.size).toBe(0);
  });

  it('unticking Mastered hides the words you have mastered', () => {
    const header = createColumnHeader({ hasCheckbox: false, onChange: () => {} });
    const boxes = [...header.el.querySelectorAll<HTMLInputElement>('.ml-colhead-col--mastered input[type=checkbox]')];
    boxes[4].checked = false;
    boxes[4].dispatchEvent(new Event('change'));
    expect(header.sets.mastered.has('4')).toBe(false);
    expect(header.sets.mastered.size).toBe(4);

    const shown = applyColumnFilters(rated(), header, info, createCellReader()).map(i => i.word);
    expect(shown).not.toContain('de');                       // level 4
    expect(shown).toContain('casa');                         // level 3
    expect(shown).toContain('zzz');                          // never rated: level 0
  });

  it('counts as an active filter and is cleared by reset', () => {
    const header = createColumnHeader({ hasCheckbox: false, onChange: () => {} });
    const box = header.el.querySelector<HTMLInputElement>('.ml-colhead-col--mastered input[type=checkbox]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(header.hasFilters()).toBe(true);
    header.reset();
    expect(header.hasFilters()).toBe(false);
    expect(header.sets.mastered.size).toBe(0);
  });
});
