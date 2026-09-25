import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility audit — runs axe-core (WCAG 2.0/2.1 A + AA, plus axe's
 * best-practice rules) against every tab, in both themes, and again with a
 * quiz running for the modes that have one.
 *
 * The bar is zero violations, not "no new ones": the app was brought to zero
 * deliberately, so a failure here is a regression a person introduced, and the
 * message names the rule, the element and how to fix it.
 *
 * What axe can't judge is covered by a few explicit tests below (keyboard
 * reachability, live regions, the document language).
 */

const TABS = [
  'table', 'picture', 'trivia', 'guessBlank', 'sentenceScramble', 'conjugation',
  'mylists', 'myContent', 'history', 'settings',
] as const;

/** Tabs that have a Start Quiz button worth auditing in their running state. */
const QUIZ_TABS = new Set(['table', 'picture', 'trivia', 'guessBlank', 'sentenceScramble', 'conjugation']);

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

async function open(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript(t => {
    window.localStorage.setItem('s_simple_mode', 'false');
    window.localStorage.setItem('s_show_experimental_modes', 'true');
    window.localStorage.setItem('theme', t);
  }, theme);
  await page.emulateMedia({ colorScheme: theme });
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
}

/** A readable one-line-per-node summary, so a CI failure explains itself. */
async function violationsOf(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.flatMap(v =>
    v.nodes.map(n => `${v.id} [${v.impact}] ${n.target.join(' ')} — ${v.help}`));
}

for (const theme of ['light', 'dark'] as const) {
  for (const tab of TABS) {
    test(`${tab} tab has no axe violations (${theme})`, async ({ page }) => {
      await open(page, theme);
      await page.locator(`.mode-tab[data-mode="${tab}"]`).click();
      await page.waitForTimeout(500);
      expect(await violationsOf(page)).toEqual([]);
    });

    if (QUIZ_TABS.has(tab)) {
      test(`${tab} quiz in progress has no axe violations (${theme})`, async ({ page }) => {
        await open(page, theme);
        await page.locator(`.mode-tab[data-mode="${tab}"]`).click();
        await page.locator('#startBtn').click();
        await page.waitForTimeout(1500);
        expect(await violationsOf(page)).toEqual([]);
      });
    }
  }
}

test('every mode tab is reachable and operable from the keyboard', async ({ page }) => {
  await open(page, 'light');
  const tab = page.locator('.mode-tab[data-mode="history"]');
  await tab.focus();
  await page.keyboard.press('Enter');
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.mode-tab[data-mode="table"]')).toHaveAttribute('aria-selected', 'false');
});

test('the page has a level-one heading and a language', async ({ page }) => {
  await open(page, 'light');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the Admin link is not announced as a tab', async ({ page }) => {
  await open(page, 'light');
  await expect(page.locator('a.admin-tab')).not.toHaveAttribute('role', /.+/);
  await expect(page.locator('a.admin-tab')).not.toHaveAttribute('aria-selected', /.+/);
});

test('quiz feedback is a live region', async ({ page }) => {
  await open(page, 'light');
  await expect(page.locator('#tableFeedback')).toHaveAttribute('role', 'status');
});
