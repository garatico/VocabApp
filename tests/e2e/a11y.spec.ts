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
    window.localStorage.setItem('s_show_my_content', 'true');
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

// Every colour theme (Settings → Appearance) keeps the audit at zero, in both light and dark.
for (const palette of ['ocean', 'violet', 'rose', 'amber', 'teal', 'slate'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`colour theme "${palette}" has no axe violations (${theme})`, async ({ page }) => {
      await page.addInitScript(p => window.localStorage.setItem('s_palette', p), palette);
      await open(page, theme);
      expect(await page.evaluate(() => document.documentElement.dataset.palette)).toBe(palette);
      for (const tab of ['table', 'mylists', 'settings'] as const) {
        await page.locator(`.mode-tab[data-mode="${tab}"]`).click();
        await page.waitForTimeout(300);
        expect(await violationsOf(page), `${tab}`).toEqual([]);
      }
    });
  }
}

// Settings → Help & Tips is collapsed by default, so the tab test above never reaches its tips, CSV sheets
// and examples. Open it, with every disclosure inside it open too.
for (const theme of ['light', 'dark'] as const) {
  test(`Settings → Help & Tips, opened, has no axe violations (${theme})`, async ({ page }) => {
    await open(page, theme);
    await page.locator('.mode-tab[data-mode="settings"]').click();
    await page.locator('.settings-nav-link[href="#settings-sec-help"]').click();
    await expect(page.locator('#csvGuide table.csv-sheet').first()).toBeVisible();
    await page.locator('#settings-sec-help details').evaluateAll(ds => ds.forEach(d => { (d as HTMLDetailsElement).open = true; }));
    await page.waitForTimeout(300);
    expect(await violationsOf(page)).toEqual([]);
  });
}

// The Settings tab test above sees only what is open by default: every section but the first is collapsed
// and the Advanced folds are hidden. With Advanced on and everything expanded, five violations had sat
// unseen (an unnamed select, title-only labels, a contrast miss on the folds' tint, a skipped heading level).
for (const theme of ['light', 'dark'] as const) {
  test(`Settings with every section, group and fold open has no axe violations (${theme})`, async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('s_advanced_mode', 'true'));
    await open(page, theme);
    await page.locator('.mode-tab[data-mode="settings"]').click();
    // Opening a section reveals the groups and folds inside it, so expand until nothing is left closed.
    for (let pass = 0; pass < 4; pass++) {
      await page.evaluate(() => document.querySelectorAll<HTMLElement>('#settingsArea [data-collapse][aria-expanded="false"]').forEach(b => b.click()));
      await page.waitForTimeout(200);
    }
    await page.locator('#settingsArea details').evaluateAll(ds => ds.forEach(d => { (d as HTMLDetailsElement).open = true; }));
    await page.waitForTimeout(300);
    expect(await page.locator('#settingsArea [data-collapse][aria-expanded="false"]').count()).toBe(0);
    expect(await violationsOf(page)).toEqual([]);
  });
}

// The My Lists tab test above sees an empty list. With words in it — rows, pills, checkboxes, the row's
// actions menu and the naming dialog — it had title-only checkbox labels and four contrast misses.
for (const theme of ['light', 'dark'] as const) {
  test(`My Lists with words, its row menu and a naming dialog have no axe violations (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await open(page, theme);
    await page.locator('.mode-tab[data-mode="mylists"]').click();
    await page.locator('.ml-single-head .ml-new-list-btn:not(.ml-new-folder-btn)').click();
    await page.locator('.ml-list-name-input').fill('A11y');
    await page.locator('.ml-list-name-input').press('Enter');
    for (const word of ['casa', 'hablar']) {
      await page.locator('.ml-add-input').fill(word);
      await page.locator('.ml-add-result-word', { hasText: new RegExp(`^${word}$`) }).locator('xpath=..').locator('.ml-add-btn').click();
    }
    expect(await violationsOf(page)).toEqual([]);              // search results open over the list
    await page.locator('.ml-add-input').fill('');
    await expect(page.locator('.ml-word-item')).toHaveCount(2);
    expect(await violationsOf(page)).toEqual([]);              // the list itself
    await page.locator('.ml-word-item').first().hover();
    expect(await violationsOf(page)).toEqual([]);              // a highlighted row
    await page.locator('.ml-single-head .ml-new-folder-btn').click();
    await expect(page.locator('.app-dialog-input')).toBeVisible();
    expect(await violationsOf(page)).toEqual([]);              // the naming dialog
  });
}

// States reached only by using the app: a finished quiz's summary, History with a session in it, words
// due (the 🔁 badge), and My Content's Word Editor with a word open. Among them they had unnamed selects
// in the Word Editor (labels without `for`), white text on dark mode's light result fills, and several
// pill colours under 4.5:1.
for (const theme of ['light', 'dark'] as const) {
  test(`quiz summary, History with data, due badge and the Word Editor have no axe violations (${theme})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1400, height: 900 });
    await open(page, theme);

    await page.locator('#startBtn').click();
    await page.locator('#tableWrap input[type="text"]').first().fill('the');
    await page.locator('#tableReset').click();                        // Give Up: summary, and missed words fall due
    await expect(page.locator('.progress-pct').first()).toBeVisible();
    expect(await violationsOf(page)).toEqual([]);

    await page.locator('.mode-tab[data-mode="history"]').click();
    await page.waitForTimeout(800);
    expect(await violationsOf(page)).toEqual([]);

    await page.locator('.mode-tab[data-mode="myContent"]').click();
    const item = page.locator('[id^="mcwe-"] .word-item').first();
    await item.click();
    await expect(page.locator('#mcwe-editPos')).toBeVisible();
    expect(await violationsOf(page)).toEqual([]);
  });
}

// Language of parts (WCAG 3.1.2), which axe can't judge: a target-language word must say so, or a screen
// reader voices "casa" with English pronunciation. English beside it says so too, since with the interface
// in Spanish the page itself is lang="es". What's typed carries the language being typed.
test('quiz words and answer boxes carry the language they are in', async ({ page }) => {
  await open(page, 'light');
  await page.locator('#startBtn').click();
  const firstWord = page.locator('#tableWrap .spanish-word').first();
  const firstInput = page.locator('#tableWrap input[type="text"]').first();
  await expect(firstWord).toHaveAttribute('lang', 'es');     // Word → Meaning: Spanish shown, English typed
  await expect(firstInput).toHaveAttribute('lang', 'en');

  await page.locator('#directionToggle [data-direction="en-target"]').evaluate((b: HTMLElement) => b.click());
  await page.locator('#startBtn').evaluate((b: HTMLElement) => b.click());
  await expect(page.locator('#tableWrap .spanish-word').first()).toHaveAttribute('lang', 'en');
  await expect(page.locator('#tableWrap input[type="text"]').first()).toHaveAttribute('lang', 'es');

  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await page.locator('.ml-single-head .ml-new-list-btn:not(.ml-new-folder-btn)').click();
  await page.locator('.ml-list-name-input').fill('Lang');
  await page.locator('.ml-list-name-input').press('Enter');
  await page.locator('.ml-add-input').fill('casa');
  await page.locator('.ml-add-result-word', { hasText: /^casa$/ }).locator('xpath=..').locator('.ml-add-btn').click();
  await page.locator('.ml-add-input').fill('');
  await expect(page.locator('.ml-word-item .ml-word-text').first()).toHaveAttribute('lang', 'es');
});
