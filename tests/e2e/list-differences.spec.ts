import { test, expect, type Page } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * Three ways to quiz the difference between two lists — Reading (4 words) and Writing (1 of them):
 *   1. a Smart List with In list: Reading, Not in list: Writing
 *   2. a list Made of Reading, Minus Writing
 *   3. Table's Lists filter: Focus on Reading, Except words in Writing
 * Each should come to the 3 words Reading has that Writing doesn't.
 */

const DIFF = ['comer', 'vivir', 'casa'];

async function seed(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await disableSimpleMode(page);
  await page.addInitScript(more => {
    localStorage.setItem('vq_lists_spanish', JSON.stringify({
      Reading: ['hablar', 'comer', 'vivir', 'casa'], Writing: ['hablar'], ...(more.lists as object ?? {}),
    }));
    for (const [k, v] of Object.entries(more.keys as Record<string, unknown> ?? {})) localStorage.setItem(k, JSON.stringify(v));
  }, extra);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
}

/** Open a My Lists checklist dropdown by its label and tick one option. */
async function tick(page: Page, label: RegExp, option: string): Promise<void> {
  const dd = page.locator('.ml-chip-dropdown', { has: page.locator('.ml-chip-dropdown-toggle', { hasText: label }) }).first();
  await dd.locator('.ml-chip-dropdown-toggle').click();
  await dd.locator('.ml-chip-dropdown-item', { hasText: option }).first().click();
  await page.keyboard.press('Escape');
}

async function shownWords(page: Page): Promise<string[]> {
  return (await page.locator('.ml-word-item .ml-word-text').allTextContents()).map(s => s.trim()).sort();
}

test('a Smart List: In list Reading, Not in list Writing', async ({ page }) => {
  await seed(page, { keys: { vq_smart_spanish: {
    Difference: {
      bands: [], pos: [], domains: [], mastered: 'any', listed: 'no', due: 'any', wordStartsWith: '',
      meaningContains: '', limit: 0, sort: 'rank', manualWords: [], folders: [], hiddenModes: [],
    },
  } } });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await page.locator('.ml-list-name', { hasText: /^Difference$/ }).click();
  await expect(page.locator('.ml-word-item').first()).toBeVisible();   // the rule has evaluated over the vocabulary
  await tick(page, /^In list/, 'Reading');
  await expect(page.locator('.ml-word-item')).toHaveCount(4);   // "not in any list" no longer applies
  await tick(page, /^Not in list/, 'Writing');
  await expect(page.locator('.ml-word-item')).toHaveCount(3);
  expect(await shownWords(page)).toEqual([...DIFF].sort());
});

test('a list Made of Reading, Minus Writing', async ({ page }) => {
  await seed(page, {
    lists: { 'To write': [] },
    keys: { vq_lists_meta_spanish: { 'To write': { sources: [{ lang: 'spanish', list: 'Reading' }] } } },
  });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await page.locator('.ml-list-name', { hasText: /^To write$/ }).click();
  await expect(page.locator('.ml-word-item')).toHaveCount(4);
  await tick(page, /^Minus/, 'Writing');
  await expect(page.locator('.ml-word-item')).toHaveCount(3);
  expect(await shownWords(page)).toEqual([...DIFF].sort());
});

test('Table\'s Lists filter: Focus on Reading, Except words in Writing', async ({ page }) => {
  await seed(page, { keys: { vq_listfilter_spanish__shared: { active: true, mode: 'focus', selected: ['Reading'], excluded: ['Writing'] } } });
  await expect(page.locator('.list-filter-except')).toBeAttached();
  await expect(page.locator('.filters-summary-group', { hasText: 'Except' })).toContainText('Writing');
  await page.locator('#startBtn').click();
  await expect(page.locator('#tableWrap input[data-word]')).toHaveCount(3);
  const words = await page.locator('#tableWrap input[data-word]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.word ?? ''));
  expect(words.sort()).toEqual([...DIFF].sort());
});
