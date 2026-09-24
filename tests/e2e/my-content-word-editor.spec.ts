import { test, expect } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * My Content — the shared Word Editor (the Words tab).
 * It is the Admin panel's editor pointed at My Content's storage, so unlike
 * admin-word-editor.spec.ts nothing here can touch the real database: every
 * edit is an override in this browser's localStorage, gone with the context.
 */

test.beforeEach(async ({ page }) => {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="myContent"]').click();
  await expect(page.locator('.mc-we .word-item').first()).toBeVisible();
});

async function open(page: import('@playwright/test').Page, word: string): Promise<void> {
  await page.locator('#mcwe-searchInput').fill(word);
  await page.locator('.mc-we .word-item', { has: page.locator('.word-item-key', { hasText: new RegExp(`^${word}$`) }) }).click();
  await expect(page.locator('#mcwe-editFormWordTitle')).toHaveText(word);
}

test('editing a word marks the field, saves an override, and Revert undoes it', async ({ page }) => {
  await open(page, 'hablar');
  const original = await page.locator('#mcwe-editTranslation').inputValue();

  await page.locator('#mcwe-editTranslation').fill('to chat');
  // The changed field is marked, with a control to put just that field back.
  await expect(page.locator('#mcwe-editTranslation').locator('xpath=ancestor::div[contains(@class,"form-group")]'))
    .toHaveClass(/we-modified/);
  await page.locator('#mcwe-saveBtn').click();

  // The list now flags the word as edited, and the edit survives a reload.
  await expect(page.locator('.mc-we .word-item .badge-edited').first()).toBeVisible();
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="myContent"]').click();
  await open(page, 'hablar');
  await expect(page.locator('#mcwe-editTranslation')).toHaveValue('to chat');

  // Settings → "Confirm before removing a word edit" is on by default.
  page.once('dialog', d => void d.accept());
  await page.locator('#mcwe-revertWordBtn').click();
  await expect(page.locator('#mcwe-editTranslation')).toHaveValue(original);
});

test('a removed gloss can be put back from its ghost chip', async ({ page }) => {
  await open(page, 'hablar');
  const chips = page.locator('#mcwe-editGlossesChips .chip-input-tag');
  const before = await chips.count();

  await chips.first().locator('.chip-input-tag-remove').click();
  await expect(chips).toHaveCount(before - 1);
  await page.locator('#mcwe-removedGlosses .we-ghost-chip').first().click();
  await expect(chips).toHaveCount(before);
  await expect(page.locator('#mcwe-removedGlosses')).toBeHidden();
});

test('adding a word creates a custom word, and it can be deleted', async ({ page }) => {
  await page.locator('#mcwe-newWordBtn').click();
  await page.locator('#mcwe-editWord').fill('zzpruebae2e');
  await page.locator('#mcwe-editTranslation').fill('e2e test word');
  await page.locator('#mcwe-saveBtn').click();

  await expect(page.locator('#mcwe-deleteWordBtn')).toBeVisible();
  await page.getByRole('button', { name: 'Added', exact: true }).click();
  await expect(page.locator('.mc-we .word-item .word-item-key')).toHaveText('zzpruebae2e');

  page.once('dialog', d => void d.accept());
  await page.locator('#mcwe-deleteWordBtn').click();
  await expect(page.locator('.mc-we .word-item')).toHaveCount(0);
});

test('linguistic fields are shown but locked', async ({ page }) => {
  await open(page, 'hablar');
  await expect(page.locator('#mcwe-editIPA')).toBeDisabled();
  await expect(page.locator('#mcwe-editTranslation')).toBeEnabled();
});

test('a custom word with additional senses is hideable like a real word', async ({ page }) => {
  // A custom word's glosses are its translation plus any extra senses; once it
  // has several, the same hide/restore that real words get works on it too.
  await page.locator('#mcwe-newWordBtn').click();
  await page.locator('#mcwe-editWord').fill('charlarprueba');
  await page.locator('#mcwe-editTranslation').fill('to chat');
  const glossInput = page.locator('#mcwe-editGlossesInput');
  await glossInput.fill('to converse');
  await glossInput.press('Enter');
  await glossInput.fill('to talk casually');
  await glossInput.press('Enter');
  await page.locator('#mcwe-saveBtn').click();
  await expect(page.locator('#mcwe-deleteWordBtn')).toBeVisible();

  // The translation is the first sense, so three in all.
  const chips = page.locator('#mcwe-editGlossesChips .chip-input-tag');
  await expect(chips).toHaveCount(3);
  await chips.filter({ hasText: 'to converse' }).locator('.chip-input-tag-remove').click();
  await expect(chips).toHaveCount(2);
  await expect(page.locator('#mcwe-removedGlosses .we-ghost-chip')).toHaveText(/to converse/);
});

test('editing a real word only records the field that actually changed', async ({ page }) => {
  await open(page, 'hablar');
  await page.locator('#mcwe-editNotes').fill('e2e note only');
  await page.locator('#mcwe-saveBtn').click();
  await expect(page.locator('.mc-we .word-item .badge-edited').first()).toBeVisible();

  // Regression coverage: this used to also record "difficulty → 1" (hablar's
  // own real difficulty, untouched) alongside the notes edit on every save,
  // because the typed value was coerced to a number but the word's own
  // server-sent string "1" never was.
  const keys = await page.evaluate(() => {
    const overrides = JSON.parse(window.localStorage.getItem('uc_wordoverride_spanish') ?? '{}');
    return Object.keys(overrides['hablar'] ?? {}).sort();
  });
  expect(keys).toEqual(['notes', 'updatedAt']);
});

test("adding and removing a gloss updates the word's sense list", async ({ page }) => {
  await open(page, 'hablar');
  const chips = page.locator('#mcwe-editGlossesChips .chip-input-tag');
  const original = await chips.count();
  expect(original).toBeGreaterThan(0);

  const glossInput = page.locator('#mcwe-editGlossesInput');
  await glossInput.fill('to converse');
  await glossInput.press('Enter');
  await expect(chips).toHaveCount(original + 1);
  await expect(chips.filter({ hasText: 'to converse' })).toHaveCount(1);

  await chips.filter({ hasText: 'to converse' }).locator('.chip-input-tag-remove').click();
  await expect(chips).toHaveCount(original);
});

test('reordering a gloss shows up in a quiz immediately, without a reload', async ({ page }) => {
  // Regression coverage for a real bug: app.ts cached each language's fully
  // processed word list the first time it was loaded and never refreshed it,
  // so any My Content override made afterwards — gloss reorder included — was
  // invisible in every quiz mode until a full page reload. Visiting Table
  // first, before editing anything, is what warmed that (now fixed) cache.
  await page.locator('.mode-tab[data-mode="table"]').click();
  await page.locator('#startBtn').click();

  await page.locator('.mode-tab[data-mode="myContent"]').click();
  await open(page, 'hablar');

  const chips = page.locator('#mcwe-editGlossesChips .chip-input-tag');
  const spoke = chips.filter({ hasText: 'spoke' });
  // hablar's glosses start as talk/talks/speak/speaks/spoke/talked, so moving
  // "spoke" (5th) earlier four times brings it to the front.
  for (let i = 0; i < 4; i++) await spoke.locator('.chip-input-tag-move').first().click();
  await expect(chips.first()).toContainText('spoke');
  await page.locator('#mcwe-saveBtn').click();
  await expect(page.locator('.mc-we .word-item .badge-edited').first()).toBeVisible();

  // Switching tabs alone reuses whatever Table already rendered from the
  // #startBtn click above — a fresh Start Quiz is what has to pick up the
  // edit, the same as a learner starting a new quiz after editing a word.
  await page.locator('.mode-tab[data-mode="table"]').click();
  await page.locator('#startBtn').click();
  const nextPage = page.locator('#tablePagerTop .pager-btn[aria-label="Next page"]');
  await nextPage.click();
  const input = page.locator('input[data-word="hablar"]');
  await input.locator('xpath=..').locator('.reveal-btn').click();
  await expect(input).toHaveValue(/^spoke/);
});
