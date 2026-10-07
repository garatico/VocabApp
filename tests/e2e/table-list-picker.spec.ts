import { test, expect } from '@playwright/test';
import { disableSimpleMode, startMode, startQuiz } from './helpers.ts';

/**
 * Table mode's add-to-list pickers: each list shows its language's flag and word count, single- and
 * cross-language lists are colour-coded and collapsible sections, and the counts can be turned off in
 * Settings. Also: restarting a quiz must not leave "Add N to List(s)" claiming a selection that is gone.
 */

test.beforeEach(async ({ page }) => {
  await disableSimpleMode(page);
  await page.addInitScript(() => {
    if (window.localStorage.getItem('vq_lists_spanish')) return;
    window.localStorage.setItem('vq_lists_spanish', JSON.stringify({ Food: ['pan', 'queso', 'leche'], Trips: [] }));
    window.localStorage.setItem('vq_lists_multi', JSON.stringify({ Everywhere: [{ word: 'pan', language: 'spanish' }, { word: 'pain', language: 'french' }] }));
  });
  await startMode(page, 'table');
  await page.locator('#tableWrap input[type="text"]').first().waitFor();
});

const openStar = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.locator('#tableWrap .known-btn').first().click();
  await expect(page.locator('#listPickerPopover')).toBeVisible();
};

test('the ★ picker shows each list\'s flag and word count, in colour-coded, collapsible sections', async ({ page }) => {
  await openStar(page);
  const pop = page.locator('#listPickerPopover');
  const food = pop.locator('.list-picker-row', { hasText: 'Food' });
  await expect(food.locator('img')).toHaveCount(1);                         // the flag of the language it holds
  await expect(food.locator('.list-picker-row-count')).toHaveText('3');
  await expect(pop.locator('.list-picker-row', { hasText: 'Everywhere' }).locator('.list-picker-row-count')).toHaveText('2');

  const bars = await page.evaluate(() => {
    const c = (sel: string): string => getComputedStyle(document.querySelector(sel) as Element).borderLeftColor;
    return [c('#listPickerPopover .ml-move-section--single .ml-move-section-head'), c('#listPickerPopover .ml-move-section--multi .ml-move-section-head')];
  });
  expect(bars[0]).not.toBe(bars[1]);                                        // two different colours

  const single = pop.locator('.ml-move-section--single');
  await single.locator('.ml-move-section-head').click();
  await expect(single.locator('.ml-move-section-body')).toBeHidden();
  await expect(pop.locator('.ml-move-section--multi .ml-move-section-body')).toBeVisible();
});

test('the counts can be turned off in Settings', async ({ page }) => {
  await page.evaluate(() => window.localStorage.setItem('s_list_picker_counts', 'false'));
  await openStar(page);
  await expect(page.locator('#listPickerPopover .list-picker-row-count')).toHaveCount(0);
});

test('restarting a quiz resets the "Add N to List(s)" button along with the selection', async ({ page }) => {
  const tick = (n: number): Promise<void> => page.evaluate(i => (document.querySelectorAll('#tableWrap .row-select-cb')[i] as HTMLInputElement).click(), n);
  await tick(0); await tick(1);
  await expect(page.locator('#tableBulkAddBtn')).toHaveText('+ Add 2 to List(s)');

  await page.locator('#tableRetry').click();
  await expect(page.locator('#tableBulkAddBtn')).toHaveText('+ Add to List(s)');
  await expect(page.locator('#tableBulkAddBtn')).toBeDisabled();

  await tick(0);                                                            // and it can be picked again
  await expect(page.locator('#tableBulkAddBtn')).toHaveText('+ Add 1 to List(s)');
  await startQuiz(page);
  await expect(page.locator('#tableBulkAddBtn')).toHaveText('+ Add to List(s)');
});
