import { test, expect } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * My Content → Conjugations: the Admin panel's Conjugation editor, pointed at this browser. A verb list
 * beside a table of coloured tense columns; saving stores only the tenses that differ from the real
 * vocabulary; editing back to the original clears that tense; nothing touches the database.
 */

test.beforeEach(async ({ page }) => {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="myContent"]').click();
  await page.locator('.mc-tab-btn', { hasText: 'Conjugations' }).click();
});

const stored = (page: import('@playwright/test').Page): Promise<Record<string, Record<string, unknown>>> =>
  page.evaluate(() => JSON.parse(window.localStorage.getItem('uc_conjoverride_spanish') ?? '{}') as Record<string, Record<string, unknown>>);

test('changing a form stores just that tense, and putting it back removes the override', async ({ page }) => {
  await page.locator('.mcc-search').fill('hablar');
  await page.locator('.mcc-verb-item', { has: page.locator('.mcc-verb-key', { hasText: /^hablar$/ }) }).click();
  await expect(page.locator('.mcc-table-card')).toBeVisible();
  await expect(page.locator('.mcc-th-form')).toHaveCount(1);                     // present, to start with

  const yo = page.locator('.mcc-input[data-tense="present"]').first();
  const original = await yo.inputValue();
  expect(original).not.toBe('');

  await yo.fill('hablito');
  await expect(yo).toHaveClass(/mcc-input--changed/);                            // marked as differing
  await page.getByRole('button', { name: /Save/ }).click();
  await expect.poll(async () => (await stored(page)).hablar?.present).toBeTruthy();
  expect(((await stored(page)).hablar.present as string[])[0]).toBe('hablito');
  expect(Object.keys((await stored(page)).hablar)).toEqual(['present']);        // only the changed tense
  await expect(page.locator('.mcc-verb-item.active .mcc-badge-edited')).toBeVisible();

  // More tenses become more columns; the gerund and participle sit below the table.
  await page.locator('.mcc-tense-trigger').click();                              // the Tenses dropdown
  await page.locator('.mcc-tense-option', { hasText: 'Futuro' }).first().locator('input').check();
  await expect(page.locator('.mcc-th-form')).toHaveCount(2);
  await expect(page.locator('.mcc-extra-forms')).toBeVisible();

  await page.locator('.mcc-input[data-tense="present"]').first().fill(original);
  await page.getByRole('button', { name: /Save/ }).click();
  await expect.poll(async () => Object.keys(await stored(page)).length).toBe(0);
});

test('a verb selected in the Words tab offers to open its conjugations, and only verbs do', async ({ page }) => {
  await page.locator('.mc-tab-btn', { hasText: 'Words' }).click();
  await page.locator('#mcwe-searchInput').fill('hablar');
  await page.locator('.mc-we .word-item', { has: page.locator('.word-item-key', { hasText: /^hablar$/ }) }).click();
  await page.locator('#mcwe-hostActionBtn').click();
  await expect(page.locator('.mc-tab-btn.active')).toHaveText('Conjugations');
  await expect(page.locator('.mcc-verb-item.active .mcc-verb-key')).toHaveText('hablar');
  await expect(page.locator('.mcc-verb-name')).toHaveText('hablar');

  await page.locator('.mc-tab-btn', { hasText: 'Words' }).click();
  await page.locator('#mcwe-searchInput').fill('casa');
  await page.locator('.mc-we .word-item', { has: page.locator('.word-item-key', { hasText: /^casa$/ }) }).click();
  await expect(page.locator('#mcwe-hostActionBtn')).toBeHidden();               // a noun
});

test('the language picker and backup buttons live in the top bar', async ({ page }) => {
  const bar = page.locator('#myContentBar');
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: /Backup & export/ }).click();             // one menu, so it never runs out of room
  await expect(bar.getByRole('menuitem', { name: 'Download my content' })).toBeVisible();
  await expect(bar.getByRole('menuitem', { name: 'Export vocabulary (CSV)' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bar.getByRole('menuitem', { name: 'Download my content' })).toBeHidden();
  // "Add content in" only where it matters: Trivia and Guess the Blank write one row per language.
  await expect(bar.locator('.mc-lang-dropdown')).toBeHidden();                  // the Conjugations tab
  await page.locator('.mc-tab-btn', { hasText: 'Trivia Questions' }).click();
  await expect(bar.locator('.mc-lang-dropdown')).toBeVisible();
  await page.locator('.mc-tab-btn', { hasText: 'Words' }).click();
  await expect(bar.locator('.mc-lang-dropdown')).toBeHidden();
  await expect(page.locator('.mc-tab-desc')).toHaveCount(0);                    // no per-tab blurb
  await expect(page.locator('.mc-wrap .mc-backup-row')).toHaveCount(0);
  await page.locator('.mode-tab[data-mode="history"]').click();
  await expect(bar).toBeHidden();
});
