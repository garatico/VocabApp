import { test, expect, type Page } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * Layout requests: the quiz setup panel stays open on Start unless asked otherwise; the corner cluster
 * (due badge, streak, dice, Profiles, ?) never sits on a control; Quiz Style and Direction share the first
 * row on a laptop-width window; a My Lists word table is as wide as the Add Vocabulary box above it, with
 * its columns fitted to what they hold; and the CSV guide in Settings → Help & Tips is reachable.
 */

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
}

/** Twelve common words fell due yesterday or earlier, so the 🔁 badge shows in the corner. */
async function seedDueWords(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state: Record<string, { box: number; dueAt: number; ease: number }> = {};
    ['de', 'que', 'no', 'la', 'el', 'en', 'y', 'a', 'los', 'se', 'un', 'por']
      .forEach((w, i) => { state[w] = { box: 1, dueAt: Date.now() - 86_400_000 * (i + 1), ease: 1 }; });
    window.localStorage.setItem('vq_srs_spanish', JSON.stringify(state));
  });
}

test.describe('Collapse controls on Start', () => {
  test('is off by default: the setup panel stays open once the quiz starts', async ({ page }) => {
    await open(page);
    await page.locator('#startBtn').click();
    await expect(page.locator('#tableWrap input[type="text"]').first()).toBeVisible();
    await expect(page.locator('#startBtn')).toBeVisible();
    await expect(page.locator('#controlsBody')).not.toHaveClass(/filter-body--collapsed/);
  });

  test('turned on, Start closes the panel', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('s_collapse_controls_on_start', 'true'));
    await open(page);
    await page.locator('#startBtn').click();
    await expect(page.locator('#tableWrap input[type="text"]').first()).toBeVisible();
    await expect(page.locator('#controlsBody')).toHaveClass(/filter-body--collapsed/);
  });
});

test.describe('the controls corner', () => {
  test.beforeEach(async ({ page }) => { await disableSimpleMode(page); await seedDueWords(page); });

  for (const width of [1024, 1280]) {
    test(`at ${width}px nothing in the controls sits under the corner cluster`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page);
      await expect(page.locator('#dueBadge')).toBeVisible();
      const overlapping = await page.evaluate(() => {
        const c = document.getElementById('controlsCorner')!.getBoundingClientRect();
        return Array.from(document.querySelectorAll<HTMLElement>('#controls-top button, #controls-top select, #controls-top input'))
          .filter(e => e.offsetParent && !e.closest('.lang-dd-native, .ctl-proxied') && e.id !== 'langSelect')
          .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top; })
          .map(e => e.id || e.className);
      });
      expect(overlapping).toEqual([]);
    });
  }

  test('at 1280px Quiz Style and Direction stay on the first row', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    const lang = await page.locator('#langGroup').boundingBox();
    const style = await page.locator('#tableStyleGroup').boundingBox();
    const direction = await page.locator('#directionGroup').boundingBox();
    expect(Math.abs((style?.y ?? 0) - (lang?.y ?? -100))).toBeLessThan(5);
    expect(Math.abs((direction?.y ?? 0) - (lang?.y ?? -100))).toBeLessThan(5);
  });

  test('the word count reads as a number — the pool button beside it already says "Most Common"', async ({ page }) => {
    await open(page);
    await expect(page.locator('#sizeSelect option:checked')).toHaveText('1000');
  });
});

test.describe('My Lists word table', () => {
  test.beforeEach(async ({ page }) => {
    await disableSimpleMode(page);
    // Wide enough for the full table (the sidebar takes ~440px; under ~800px of list it goes compact).
    await page.setViewportSize({ width: 1400, height: 900 });
    await open(page);
    await page.locator('.mode-tab[data-mode="mylists"]').click();
    await page.locator('.ml-single-head .ml-new-list-btn:not(.ml-new-folder-btn)').click();
    await page.locator('.ml-list-name-input').fill('Layout');
    await page.locator('.ml-list-name-input').press('Enter');
    for (const word of ['casa', 'hablar', 'bonito']) {
      await page.locator('.ml-add-input').fill(word);
      await page.locator('.ml-add-result-word', { hasText: new RegExp(`^${word}$`) }).locator('xpath=..').locator('.ml-add-btn').click();
    }
    await page.locator('.ml-add-input').fill('');
    await expect(page.locator('.ml-word-item')).toHaveCount(3);
  });

  test('is exactly as wide as the Add Vocabulary box, just below it', async ({ page }) => {
    const add = await page.locator('.ml-add-section').boundingBox();
    const table = await page.locator('.ml-table').boundingBox();
    expect(add && table).toBeTruthy();
    if (!add || !table) return;
    expect(Math.abs(table.x - add.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(table.x + table.width - (add.x + add.width))).toBeLessThanOrEqual(1);
    expect(table.y - (add.y + add.height)).toBeLessThanOrEqual(8);
  });

  test('fits its columns to their contents by default, without saving that as the learner\'s widths', async ({ page }) => {
    await expect(page.locator('.ml-table')).not.toHaveClass(/ml-cols--compact/);
    const vars = await page.locator('.ml-word-list--cols').evaluate(list =>
      ['word', 'pos', 'band', 'rank', 'trans'].map(k => list.style.getPropertyValue(`--ml-w-${k}`)));
    expect(vars.slice(0, 4).every(v => /^\d+px$/.test(v))).toBe(true);
    expect(vars[4]).toBe('');   // Definition stays flexible and takes what is left
    const cut = await page.locator('.ml-word-item [class*="ml-cell-"]').evaluateAll(cells =>
      cells.filter(c => c.clientWidth > 0 && c.scrollWidth > c.clientWidth + 1).length);
    expect(cut).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('ml_col_widths'))).toBeNull();
  });
});

test('Settings → Help & Tips: the Glossary\'s CSV entry opens the CSV guide', async ({ page }) => {
  await disableSimpleMode(page);
  await open(page);
  await page.locator('.mode-tab[data-mode="settings"]').click();
  await page.locator('[data-collapse="settingsBodyGlossary"]').click();
  await page.locator('[data-setting-link="csvGuide"]').click();
  await expect(page.locator('#csvGuide table.csv-sheet').first()).toBeVisible();
  await expect(page.locator('.help-tip')).toHaveCount(9);
});
