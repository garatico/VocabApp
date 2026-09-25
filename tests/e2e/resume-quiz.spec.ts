import { test, expect, type Page } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * An unfinished Table quiz survives a reload and can be resumed with its
 * answers intact; finishing or giving up discards it.
 */

async function startQuizAndAnswerFirstWord(page: Page): Promise<string> {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('#startBtn').click();
  const first = page.locator('#tableWrap input[type="text"]').first();
  await first.waitFor();
  // A *correct* answer locks and marks the row, so it is the state worth
  // proving survives. The expected text comes from the real vocabulary.
  const word = (await first.getAttribute('data-word')) ?? '';
  const body = await (await page.request.get('/api/vocab/spanish')).json() as
    { data: { word: string; translation: string }[] };
  const vocab = body.data;
  await first.fill(vocab.find(v => v.word === word)?.translation ?? '');
  await first.press('Enter');
  await expect(first).toBeDisabled();
  // The debounce is 400ms; wait for the save rather than sleeping blindly.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('vq_resume_table'))).not.toBeNull();
  return word;
}

test('a reload offers the unfinished quiz and resume restores the answers', async ({ page }) => {
  const word = await startQuizAndAnswerFirstWord(page);
  expect(word).not.toBe('');

  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  const banner = page.locator('.resume-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/Unfinished quiz — 1 of \d+ answered/);

  await banner.getByRole('button', { name: 'Resume' }).click();
  await expect(banner).toHaveCount(0);

  const restored = page.locator(`#tableWrap input[data-word="${word}"]`);
  await expect(restored).toBeVisible();
  // The answer, its lock and its marking all came back with the row.
  await expect(restored).toBeDisabled();
  await expect(restored).toHaveClass(/correct/);
  await expect(restored).not.toHaveValue('');
});

test('discarding the offer forgets the quiz', async ({ page }) => {
  await startQuizAndAnswerFirstWord(page);
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });

  await page.locator('.resume-banner').getByRole('button', { name: 'Discard the unfinished quiz' }).click();
  expect(await page.evaluate(() => localStorage.getItem('vq_resume_table'))).toBeNull();

  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await expect(page.locator('.resume-banner')).toHaveCount(0);
});

test('giving up discards the saved quiz', async ({ page }) => {
  await startQuizAndAnswerFirstWord(page);
  page.once('dialog', d => d.accept());
  await page.locator('#tableReset').click();
  expect(await page.evaluate(() => localStorage.getItem('vq_resume_table'))).toBeNull();

  // ...and it must stay gone: the page-hide flush may not resurrect it.
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await expect(page.locator('.resume-banner')).toHaveCount(0);
});

test('a quiz with nothing answered is not worth saving', async ({ page }) => {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('#startBtn').click();
  await page.locator('#tableWrap input[type="text"]').first().waitFor();
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await expect(page.locator('.resume-banner')).toHaveCount(0);
});
