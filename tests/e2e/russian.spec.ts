import { test, expect, type Page } from '@playwright/test';
import { appReady } from './helpers.ts';
import { cyrillicToLatin } from '../../src/shared/russian-translit.ts';

/**
 * Russian in a real Table quiz, against the checked-in vocabulary.db: words show stress-marked and in
 * a font that draws the mark on its vowel, and answers are accepted in Cyrillic or Latin letters —
 * live, and without Sudden Death marking a correct Latin answer wrong halfway through. The answers
 * are read off each row's data-word-json, never hard-coded.
 */
async function startRussianTable(page: Page, dir: 'target-en' | 'en-target', suddenDeath = false): Promise<void> {
  await page.addInitScript(([d, sd]) => {
    window.localStorage.setItem('vq_lang', 'russian');
    window.localStorage.setItem('vq_dir', d as string);
    if (sd) window.localStorage.setItem('s_sudden_death', 'true');
  }, [dir, suddenDeath] as const);
  await page.goto('/');
  await appReady(page);
  await page.locator('.mode-tab[data-mode="table"]').click();
  await page.locator('#startBtn').click();
  await expect(page.locator('input[data-word]').first()).toBeVisible();
}

async function rowWord(page: Page, i: number): Promise<{ word: string; linguistic?: { stressed?: string } }> {
  return JSON.parse((await page.locator('[data-word-json]').nth(i).getAttribute('data-word-json')) ?? '{}');
}

test('Russian is offered, and words show with their stress marked', async ({ page }) => {
  await startRussianTable(page, 'target-en');
  let checked = 0;
  for (let i = 0; i < 20 && checked < 3; i++) {
    const w = await rowWord(page, i);
    if (!w.linguistic?.stressed) continue;
    await expect(page.locator('[data-word-json]').nth(i)).toHaveText(w.linguistic.stressed);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
});

test('Russian words are drawn in one font that has Cyrillic, not per-letter fallbacks', async ({ page }) => {
  await startRussianTable(page, 'target-en');
  const cell = page.locator('[data-word-json][lang="ru"]').first();
  const font = await cell.evaluate(el => getComputedStyle(el).fontFamily);
  expect(font).not.toMatch(/^"?(DM Mono|Sora)/);
});

test('an answer typed in Latin letters is accepted, and so is one in Cyrillic', async ({ page }) => {
  await startRussianTable(page, 'en-target');
  const inputs = page.locator('input[data-word]');

  const first = await rowWord(page, 0);
  await inputs.nth(0).fill(cyrillicToLatin(first.word));
  await expect(inputs.nth(0)).toHaveClass(/correct/);

  const second = await rowWord(page, 1);
  await inputs.nth(1).fill(second.word);
  await expect(inputs.nth(1)).toHaveClass(/correct/);

  await inputs.nth(2).fill('zzzz');
  await expect(inputs.nth(2)).not.toHaveClass(/correct/);
});

test('Sudden Death lets a correct Latin answer be typed letter by letter', async ({ page }) => {
  await startRussianTable(page, 'en-target', true);
  const inputs = page.locator('input[data-word]');
  for (let i = 0; i < 5; i++) {
    const latin = cyrillicToLatin((await rowWord(page, i)).word);
    await inputs.nth(i).click();
    await inputs.nth(i).pressSequentially(latin, { delay: 10 });
    await expect(inputs.nth(i), latin).toHaveClass(/(^|\s)correct(\s|$)/);
  }
});

test('the Articles tab stays hidden for Russian, which has no articles', async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.setItem('vq_lang', 'russian'); });
  await page.goto('/');
  await appReady(page);
  await expect(page.locator('.mode-tab[data-mode="articles"]')).toBeHidden();
});
