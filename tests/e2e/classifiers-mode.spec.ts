import { test, expect } from '@playwright/test';
import { appReady } from './helpers.ts';

/**
 * Classifiers — the measure word each Chinese or Vietnamese noun is counted with, one noun at a time
 * (modes/classifiers-mode.ts). Like the Articles spec, these read the right answer off the page (the button
 * marked right, the "一只猫" / "một con chó" line) rather than pinning a word.
 */
async function startClassifiers(page: import('@playwright/test').Page, lang: string): Promise<void> {
  await page.addInitScript((l: string) => { window.localStorage.setItem('vq_lang', l); }, lang);
  await page.goto('/');
  await appReady(page);
  await page.locator('.mode-tab[data-mode="classifiers"]').click();
  await page.locator('#startBtn').click();
  await expect(page.locator('.ar-word')).not.toBeEmpty();
}

test('Vietnamese: four classifiers to choose from, and a number key answers', async ({ page }) => {
  await startClassifiers(page, 'vietnamese');
  await expect(page.locator('.ar-choice')).toHaveCount(4);
  const word = (await page.locator('.ar-word').textContent())!;

  await page.keyboard.press('1');
  const feedback = page.locator('.ar-feedback');
  await expect(feedback).toHaveText(new RegExp(`^[✓✗] một \\S+ ${word}`));
  await expect(page.locator('.ar-choice--right')).toHaveCount(1);
  const said = /^[✓✗] một (\S+)/.exec((await feedback.textContent())!)![1];
  await expect(page.locator('.ar-choice--right')).toHaveText(said);
  for (const btn of await page.locator('.ar-choice').all()) await expect(btn).toBeDisabled();
});

test('Chinese: the answer is said counted once, and Give Up ends with a summary', async ({ page }) => {
  await startClassifiers(page, 'chinese');
  await page.locator('.ar-choice').first().click();
  const word = (await page.locator('.ar-word').textContent())!;
  await expect(page.locator('.ar-feedback')).toHaveText(new RegExp(`^[✓✗] 一\\S${word}`));

  await page.locator('.ar-giveup-btn').click();
  await expect(page.locator('#classifiersSummaryTop')).toBeVisible();
  await expect(page.locator('#classifiersSummaryTop')).toContainText('correct');
});

test('the tab is hidden for a language without classifiers', async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.setItem('vq_lang', 'spanish'); });
  await page.goto('/');
  await appReady(page);
  await expect(page.locator('.mode-tab[data-mode="classifiers"]')).toBeHidden();
});
