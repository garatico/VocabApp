// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { seedStarterLists, STARTER_LISTS, FOLDER_COMMON, FOLDER_TOPICS, LEGACY_STARTER_FOLDER, TOPIC_LIST_SIZE } from '../../src/client/modes/my-lists/starter-lists.ts';
import { getSmartLists, saveSmartRule, deleteSmartList, DEFAULT_SMART_RULE } from '../../src/client/modes/my-lists/smart-lists.ts';
import { getFolderRegistry, addFolder } from '../../src/client/modes/my-lists/folders.ts';

beforeEach(() => localStorage.clear());

describe('seedStarterLists', () => {
  it('creates small, rank-ordered, starter-flagged lists in two folders of their own', () => {
    seedStarterLists('spanish');
    const rules = getSmartLists('spanish');
    expect(Object.keys(rules).sort()).toEqual(STARTER_LISTS.map(s => s.name).sort());
    for (const r of Object.values(rules)) {
      expect(r.starter).toBe(true);
      expect(r.sort).toBe('rank');
      expect(r.limit).toBeGreaterThan(0);          // nothing unbounded — that was the problem with the old ones
      expect(r.limit).toBeLessThanOrEqual(TOPIC_LIST_SIZE);
    }
    expect(rules['Top 20 Words'].limit).toBe(20);
    expect(rules['Top 20 Verbs'].pos).toEqual(['verb']);
    expect(getFolderRegistry('starter_spanish').sort()).toEqual([FOLDER_COMMON, FOLDER_TOPICS].sort());
    expect(getFolderRegistry('smart_spanish')).toEqual([]);     // nothing in the Smart Lists folders
  });

  it('seeds once per language, and never puts back what was deleted', () => {
    seedStarterLists('spanish');
    deleteSmartList('spanish', 'Top 20 Nouns');
    seedStarterLists('spanish');
    expect(getSmartLists('spanish')['Top 20 Nouns']).toBeUndefined();
    seedStarterLists('french');
    expect(getSmartLists('french')['Top 20 Nouns']).toBeDefined();
  });

  it('does not overwrite a list the learner already has under the same name', () => {
    saveSmartRule('spanish', 'School', { ...DEFAULT_SMART_RULE, wordStartsWith: 'a' });
    seedStarterLists('spanish');
    expect(getSmartLists('spanish')['School'].wordStartsWith).toBe('a');
    expect(getSmartLists('spanish')['School'].starter).toBeUndefined();
  });

  describe('coming from the first version (unlimited topic lists inside Smart Lists)', () => {
    const legacy = (domains: string[], emoji: string, over = {}) => ({
      ...DEFAULT_SMART_RULE, domains, emoji, mastered: 'any' as const, listed: 'any' as const, limit: 0,
      folders: [LEGACY_STARTER_FOLDER], ...over,
    });

    it('removes the ones still exactly as the app made them, and the emptied folder', () => {
      addFolder('smart_spanish', LEGACY_STARTER_FOLDER);
      saveSmartRule('spanish', 'School', legacy(['education'], '🎓'));
      saveSmartRule('spanish', 'Medicine', legacy(['medicine', 'health', 'body'], '🩺'));
      localStorage.setItem('ml_starter_seeded_spanish', 'true');
      seedStarterLists('spanish');
      const rules = getSmartLists('spanish');
      // The names are back — as the new, small, starter-flagged versions, not the old unlimited ones.
      expect(rules['School'].starter).toBe(true);
      expect(rules['School'].limit).toBe(TOPIC_LIST_SIZE);
      expect(getFolderRegistry('smart_spanish')).not.toContain(LEGACY_STARTER_FOLDER);
    });

    it('keeps one the learner edited, and the folder it is still in', () => {
      addFolder('smart_spanish', LEGACY_STARTER_FOLDER);
      saveSmartRule('spanish', 'School', legacy(['education'], '🎓', { meaningContains: 'teach' }));
      localStorage.setItem('ml_starter_seeded_spanish', 'true');
      seedStarterLists('spanish');
      const school = getSmartLists('spanish')['School'];
      expect(school.meaningContains).toBe('teach');
      expect(school.starter).toBeUndefined();
      expect(getFolderRegistry('smart_spanish')).toContain(LEGACY_STARTER_FOLDER);
    });
  });
});
