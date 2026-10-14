import { test, expect } from '@playwright/test';
import { appReady } from './helpers.ts';

/**
 * Articles — der/die/das and friends, one noun at a time (modes/articles-mode.ts). The data decides which
 * nouns come up and what their gender is, so these read the right answer off the page (the button the mode
 * marks right, the "das Haus" line) rather than pinning a word.
 */
async function startArticles(page: import('@playwright/test').Page, lang: string): Promise<void> {
  await page.addInitScript((l: string) => { window.localStorage.setItem('vq_lang', l); }, lang);
  await page.goto('/');
  await appReady(page);
  await page.locator('.mode-tab[data-mode="articles"]').click();
  await page.locator('#startBtn').click();
  await expect(page.locator('.ar-word')).not.toBeEmpty();
}

test('German offers der/die/das, and a number key answers', async ({ page }) => {
  await startArticles(page, 'german');
  await expect(page.locator('.ar-choice')).toHaveText(['der', 'die', 'das']);
  const word = (await page.locator('.ar-word').textContent())!;

  await page.keyboard.press('1');
  const feedback = page.locator('.ar-feedback');
  await expect(feedback).toHaveText(new RegExp(`^[✓✗] (der|die|das) ${word}$`));
  await expect(page.locator('.ar-choice--right')).toHaveCount(1);
  // The right button is the article the feedback line says.
  const said = /^[✓✗] (\S+)/.exec((await feedback.textContent())!)![1];
  await expect(page.locator('.ar-choice--right')).toHaveText(said);
  await expect(page.locator('.ar-choice')).toHaveCount(3);
  for (const btn of await page.locator('.ar-choice').all()) await expect(btn).toBeDisabled();
});

test('Dutch offers de/het, and Give Up ends with a summary', async ({ page }) => {
  await startArticles(page, 'dutch');
  await expect(page.locator('.ar-choice')).toHaveText(['de', 'het']);
  await page.locator('.ar-choice', { hasText: 'het' }).click();
  await expect(page.locator('.ar-feedback')).toHaveText(/^[✓✗] (de|het) /);

  await page.locator('.ar-giveup-btn').click();
  await expect(page.locator('#articlesSummaryTop')).toBeVisible();
  await expect(page.locator('#articlesSummaryTop')).toContainText('correct');
});

test('the tab is hidden for a language without articles', async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.setItem('vq_lang', 'japanese'); });
  await page.goto('/');
  await appReady(page);
  await expect(page.locator('.mode-tab[data-mode="articles"]')).toBeHidden();
});
