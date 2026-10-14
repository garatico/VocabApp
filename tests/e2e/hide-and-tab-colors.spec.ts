import { test, expect, type Page } from '@playwright/test';
import { appReady, disableSimpleMode, openMode } from './helpers.ts';

async function open(page: Page, width = 1280, height = 900): Promise<void> {
  await disableSimpleMode(page);
  await page.addInitScript(() => { localStorage.setItem('s_onboarding_seen', 'true'); });
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await appReady(page);
}

test('a word hidden in My Content never comes up in a quiz, and comes back when shown again', async ({ page }) => {
  await open(page);

  // Which word would be asked first?
  await page.locator('#startBtn').click();
  const first = page.locator('#tableWrap .spanish-word').first();
  await expect(first).toBeVisible();
  const word = (await first.getAttribute('data-word-json').then(j => (j ? (JSON.parse(j) as { word: string }).word : null)))!;
  expect(word).toBeTruthy();

  // Hide it.
  await openMode(page, 'myContent');
  await page.locator('#mcwe-searchInput').fill(word);
  await page.locator('#mcwe-searchInput').press('Enter');
  const item = page.locator('.mc-we .word-item', { has: page.locator('.word-item-key', { hasText: new RegExp(`^${word}$`) }) }).first();
  await item.click();
  const hide = page.locator('.mc-we .we-hide-btn');
  await expect(hide).toHaveText('Hide from quizzes');
  await hide.click();
  await expect(hide).toHaveText('Hidden — show again');
  await expect(item).toHaveClass(/word-item--hidden/);

  // A new quiz does not ask for it.
  await openMode(page, 'table');
  await page.locator('#startBtn').click();
  await expect(page.locator('#tableWrap .spanish-word').first()).toBeVisible();
  const asked = await page.locator('#tableWrap .spanish-word').evaluateAll(
    els => els.map(e => (JSON.parse((e as HTMLElement).dataset['wordJson'] ?? '{}') as { word?: string }).word));
  expect(asked.length).toBeGreaterThan(5);
  expect(asked).not.toContain(word);

  // Show it again: it is back as the most frequent word it was.
  await openMode(page, 'myContent');
  await page.locator('#mcwe-searchInput').fill(word);
  await page.locator('#mcwe-searchInput').press('Enter');
  await page.locator('.mc-we .word-item', { has: page.locator('.word-item-key', { hasText: new RegExp(`^${word}$`) }) }).first().click();
  await page.locator('.mc-we .we-hide-btn').click();
  await expect(page.locator('.mc-we .we-hide-btn')).toHaveText('Hide from quizzes');
  await openMode(page, 'table');
  await page.locator('#startBtn').click();
  await expect(page.locator('#tableWrap .spanish-word').first()).toBeVisible();
  const again = await page.locator('#tableWrap .spanish-word').evaluateAll(
    els => els.map(e => (JSON.parse((e as HTMLElement).dataset['wordJson'] ?? '{}') as { word?: string }).word));
  expect(again).toContain(word);
});

test.describe('tab colours', () => {
  test('each tab is tinted in its own colour, and a colour picked in Settings recolours that tab', async ({ page }) => {
    await open(page);
    const colorOf = (mode: string) => page.locator(`.mode-tab[data-mode="${mode}"]`).evaluate(e => getComputedStyle(e).getPropertyValue('--tc').trim());
    const table = await colorOf('table');
    const history = await colorOf('history');
    expect(table).not.toBe('');
    expect(history).not.toBe('');
    expect(table).not.toBe(history);

    await openMode(page, 'settings');
    await page.locator('#settingsSearch').fill('tab colors');   // search opens the fold and the group
    const swatch = page.locator('#settingTabColors .conj-color-row', { hasText: /^History$/ }).locator('input[type="color"]');
    await expect(swatch).toBeVisible();
    await swatch.evaluate((el: HTMLInputElement) => { el.value = '#cc3366'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(await colorOf('history')).toBe('#cc3366');
    expect(await colorOf('table')).toBe(table);               // only that one changed

    await page.reload();
    await appReady(page);
    expect(await colorOf('history')).toBe('#cc3366');         // and it was saved

    await openMode(page, 'settings');
    await page.locator('#settingsSearch').fill('tab colors');
    await page.locator('#settingResetTabColors').click();
    expect(await colorOf('history')).toBe(history);           // reset puts the default back
  });

  test('on a phone, the mode menu button and its entries carry the tab colours', async ({ page }) => {
    await open(page, 390, 844);
    const btn = page.locator('#modeMenuBtn');
    await expect(btn).toHaveAttribute('data-mode', 'table');
    const tableColor = await btn.evaluate(e => getComputedStyle(e).getPropertyValue('--tc').trim());
    await btn.click();
    const history = page.locator('#modeMenuList li[data-mode="history"]');
    const historyColor = await history.evaluate(e => getComputedStyle(e).getPropertyValue('--tc').trim());
    expect(historyColor).not.toBe('');
    expect(historyColor).not.toBe(tableColor);
    expect(await history.evaluate(e => getComputedStyle(e).borderLeftWidth)).toBe('4px');
  });
});

test.describe('My Content on a phone', () => {
  test('the form is not squeezed by padding, its header buttons all show, and a long gloss wraps', async ({ page }) => {
    await open(page, 360, 780);
    await openMode(page, 'myContent');
    await expect(page.locator('.mc-we .word-item').first()).toBeVisible();
    await page.locator('.mc-we .word-item').nth(1).click();
    const card = page.locator('.mc-we .edit-form-card');
    await expect(card).toBeVisible();

    // Less than ~20px of page and box padding either side of the card (it was ~35).
    const box = (await card.boundingBox())!;
    expect(box.x).toBeLessThan(20);
    expect(360 - (box.x + box.width)).toBeLessThan(20);

    // Save, Reset and Collapse All are all inside the card, not cut off at its edge.
    for (const id of ['saveBtn', 'resetBtn', 'toggleAllSectionsBtn']) {
      const b = (await page.locator(`#mcwe-${id}`).boundingBox())!;
      expect(b.x, id).toBeGreaterThanOrEqual(box.x);
      expect(b.x + b.width, id).toBeLessThanOrEqual(box.x + box.width + 1);
    }

    // A gloss far longer than the line stays inside its box.
    const longText = 'to put something away in a place where it will not be found again very easily at all';
    const fit = await page.locator('.mc-we .chip-input').first().evaluate((inp, text) => {
      const tag = document.createElement('span');
      tag.className = 'chip-input-tag';
      const label = document.createElement('span');
      label.textContent = text;
      tag.append(label);
      inp.prepend(tag);
      const t = tag.getBoundingClientRect();
      const b = inp.getBoundingClientRect();
      return { inside: t.right <= b.right + 0.5 && t.left >= b.left - 0.5, twoLines: t.height > 30 };
    }, longText);
    expect(fit.inside).toBe(true);
    expect(fit.twoLines).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });
});
