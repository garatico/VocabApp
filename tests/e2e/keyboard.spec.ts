import { test, expect, type Page } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * Keyboard-only flows: nothing here uses a mouse after the page loads.
 */

async function open(page: Page): Promise<void> {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
}

test('the first Tab stop is a skip link that lands on the quiz controls', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Tab');
  const skip = page.locator('.skip-link');
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  await page.keyboard.press('Enter');
  await expect(page.locator('#controls')).toBeFocused();
});

test('the tab bar is one Tab stop and the arrow keys move along it', async ({ page }) => {
  await open(page);

  // Only the active tab is in the Tab order (roving tabindex).
  const stops = await page.locator('.mode-tablist [role="tab"]').evaluateAll(
    tabs => tabs.filter(t => (t as HTMLElement).tabIndex >= 0).map(t => (t as HTMLElement).dataset['mode']));
  expect(stops).toEqual(['table']);

  await page.locator('.mode-tab[data-mode="table"]').focus();
  await page.keyboard.press('ArrowRight');
  const second = await page.evaluate(() => (document.activeElement as HTMLElement).dataset['mode']);
  expect(second).not.toBe('table');
  // Moving focus along the bar does not switch tabs.
  await expect(page.locator('.mode-tab[data-mode="table"]')).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('End');
  await page.keyboard.press('Home');
  await expect(page.locator('.mode-tab[data-mode="table"]')).toBeFocused();

  // Enter activates the focused tab.
  await page.locator('.mode-tab[data-mode="history"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.mode-tab[data-mode="history"]')).toHaveAttribute('aria-selected', 'true');
  // ...and the Tab stop follows the selection.
  await expect(page.locator('.mode-tab[data-mode="history"]')).toHaveAttribute('tabindex', '0');
  await expect(page.locator('.mode-tab[data-mode="table"]')).toHaveAttribute('tabindex', '-1');
});

test('"g" then a letter goes to that tab, and typing in a field is left alone', async ({ page }) => {
  await open(page);
  await page.keyboard.press('g');
  await page.keyboard.press('h');
  await expect(page.locator('.mode-tab[data-mode="history"]')).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('g');
  await page.keyboard.press('t');
  await expect(page.locator('.mode-tab[data-mode="table"]')).toHaveAttribute('aria-selected', 'true');

  // In a text field, g-t is just the letters g and t.
  await page.locator('#startBtn').click();
  const input = page.locator('#tableWrap input[type="text"]').first();
  await input.waitFor();
  await input.focus();
  await page.keyboard.type('gh');
  await expect(input).toHaveValue('gh');
  await expect(page.locator('.mode-tab[data-mode="table"]')).toHaveAttribute('aria-selected', 'true');
});

test('the shortcuts dialog takes focus, holds it, and gives it back', async ({ page }) => {
  await open(page);
  const opener = page.locator('#shortcutsBtn');
  await opener.focus();
  await page.keyboard.press('Enter');

  const close = page.locator('#shortcutsClose');
  await expect(close).toBeFocused();

  // Tab has nowhere else to go inside the dialog.
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();

  // The new shortcuts are documented there.
  await expect(page.locator('#shortcutsOverlay')).toContainText('Go to');
  await expect(page.locator('#shortcutsOverlay')).toContainText('Pick that option');

  await page.keyboard.press('Escape');
  await expect(page.locator('#shortcutsOverlay')).not.toHaveClass(/open/);
  await expect(opener).toBeFocused();
});

test('Trivia choice: a number key answers the question', async ({ page }) => {
  await open(page);
  await page.locator('.mode-tab[data-mode="trivia"]').click();
  await page.locator('#triviaSubMode [data-mode="choice"]').click();
  await page.locator('#startBtn').click();

  const options = page.locator('.tv-option');
  await expect(options).toHaveCount(4);
  await expect(options.first()).toHaveAttribute('data-key-hint', '1');
  await expect(options.nth(3)).toHaveAttribute('data-key-hint', '4');

  await page.keyboard.press('2');
  // Answering marks the chosen option and locks the rest.
  await expect(options.nth(1)).toHaveClass(/tv-option--(correct|wrong)/);
  await expect(options.first()).toBeDisabled();

  // A second press doesn't re-answer.
  await page.keyboard.press('3');
  await expect(options.nth(2)).not.toHaveClass(/tv-option--wrong/);
});

test('Picture click mode: cards are focusable and answerable by number or Enter', async ({ page }) => {
  await open(page);
  await page.locator('.mode-tab[data-mode="picture"]').click();
  await page.locator('#pictureSubMode [data-mode="click"]').click();
  await page.locator('#startBtn').click();

  const cards = page.locator('.pm-click-card');
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toHaveAttribute('role', 'button');
  await expect(cards.first()).toHaveAttribute('tabindex', '0');
  await expect(cards.first()).toHaveAttribute('data-key-hint', '1');

  await cards.nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(cards.nth(1)).toHaveClass(/pm-(correct|wrong)/);
  await expect(cards.first()).toHaveClass(/pm-locked/);
  await expect(cards.first()).toHaveAttribute('aria-disabled', 'true');
});
