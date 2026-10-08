import { test, expect, type Page } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * Layout requests, mostly for phones: the filter pills collapse; Conjugation's View and Display share a line;
 * My Lists' language picker has flags; Settings' top bar collapses and its switches clear the button; on a
 * phone only the progress line stays pinned in Table and Conjugation; and My Content's phone layout keeps
 * its filters on two rows and shows no empty editor until a word is picked.
 */

async function open(page: Page, width: number, seed: () => void = () => {}): Promise<void> {
  await disableSimpleMode(page);
  await page.addInitScript(() => { localStorage.setItem('s_onboarding_seen', 'true'); });
  await page.addInitScript(seed);
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
}

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;

test('the filter pills collapse and expand, and stay as left', async ({ page }) => {
  await open(page, 1400);
  const toggle = page.locator('.filters-section-toggle');
  await expect(page.locator('#listFilter')).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#filtersRow')).toBeHidden();
  await expect(page.locator('#startBtn')).toBeVisible();
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await expect(page.locator('#filtersRow')).toBeHidden();
  await toggle.click();
  await expect(page.locator('#listFilter')).toBeVisible();
});

test('Conjugation on a phone: View and Display labels share a line, their controls the next', async ({ page }) => {
  await open(page, 390);
  await page.locator('.mode-tab[data-mode="conjugation"]').click();
  await expect(page.locator('#conjViewSelect')).toBeVisible();
  const [viewLabel, dispLabel] = [await box(page, '#conjViewGroup > label'), await box(page, '#conjDisplayGroup > label')];
  const [view, disp] = [await box(page, '#conjViewSelect'), await box(page, '#conjDisplayCycle')];
  expect(Math.round(dispLabel.y)).toBe(Math.round(viewLabel.y));
  expect(Math.round(disp.y)).toBe(Math.round(view.y));
  expect(view.y).toBeGreaterThan(viewLabel.y);
});

test('My Lists\' language picker shows flags, and still switches the language', async ({ page }) => {
  await open(page, 1400);
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  const trigger = page.locator('#mlLangSelectBtn');
  await expect(trigger.locator('img.lang-dd-flag')).toBeVisible();
  await expect(trigger).toContainText('Spanish');
  await trigger.click();
  await page.locator('#mlLangSelectList li', { hasText: 'French' }).click();
  await expect(trigger).toContainText('French');
  await expect(page.locator('.ml-lang-select')).toHaveValue('french');
});

for (const width of [390, 1400]) {
  test(`Settings' top bar collapses, and its switches clear the button (${width}px)`, async ({ page }) => {
    await open(page, width);
    await page.locator('.mode-tab[data-mode="settings"]').click();
    const btn = page.locator('#settingsBarCollapseBtn');
    await expect(btn).toBeVisible();
    const b = await box(page, '#settingsBarCollapseBtn');
    for (const item of await page.locator('#controls > .settings-toolbar .settings-toolbar-item').all()) {
      const r = (await item.boundingBox())!;
      const overlaps = r.x < b.x + b.width && r.x + r.width > b.x && r.y < b.y + b.height && r.y + r.height > b.y;
      expect(overlaps).toBe(false);
    }
    await btn.click();
    await expect(page.locator('#settingsToolbar')).toBeHidden();
    const card = await box(page, '#controls');
    const corner = await box(page, '#controlsCorner');
    expect(corner.y + corner.height).toBeLessThanOrEqual(card.y + card.height);
    await page.locator('.mode-tab[data-mode="table"]').click();
    await expect(page.locator('#settingsBarCollapseBtn')).toBeHidden();
    await expect(page.locator('#controlsBody')).toBeVisible();   // its own section: Table's controls stay open
    await page.locator('.mode-tab[data-mode="settings"]').click();
    await btn.click();
    await expect(page.locator('#settingsToolbar')).toBeVisible();
  });
}

test('Table on a phone: scrolled, only the progress line stays pinned', async ({ page }) => {
  await open(page, 390);
  await page.locator('#startBtn').click();
  await expect(page.locator('#tableWrap input[type="text"]').first()).toBeVisible();
  await page.mouse.wheel(0, 2000);
  await expect.poll(async () => Math.round((await box(page, '#tableStickyBar > .progressWrap')).y)).toBe(0);
  const strip = await box(page, '#tableStickyBar > .progressWrap');
  expect(strip.height).toBeLessThan(60);
  expect((await box(page, '#tableJumpTop')).y + (await box(page, '#tableJumpTop')).height).toBeLessThan(0);   // actions scrolled away
});

test('Conjugation on a phone: scrolled, only the progress bar stays pinned', async ({ page }) => {
  await open(page, 390);
  await page.locator('.mode-tab[data-mode="conjugation"]').click();
  await page.locator('#startBtn').click();
  await expect(page.locator('.conj-progress-bars')).toBeVisible();
  await page.mouse.wheel(0, 3000);
  await expect.poll(async () => Math.round((await box(page, '.conj-progress-bars')).y)).toBe(0);
  expect((await box(page, '.conj-progress-bars')).height).toBeLessThan(70);
  const header = await box(page, '.conj-full-header');
  expect(header.y + header.height).toBeLessThan(0);
});

test('My Content on a phone: filters on two rows, and no empty editor until a word is picked', async ({ page }) => {
  await open(page, 390);
  await page.locator('.mode-tab[data-mode="myContent"]').click();
  await expect(page.locator('.mc-we .word-item').first()).toBeVisible();
  const chips = await page.locator('.mc-we .filter-bar > .filter-chip-field').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(chips).size).toBe(1);
  expect(Math.round((await box(page, '#mcwe-searchBtn')).y)).toBe(Math.round((await box(page, '#mcwe-clearFiltersBtn')).y));
  expect((await box(page, '#mcwe-searchBtn')).y).toBeGreaterThan(chips[0]);
  await expect(page.locator('.mc-we .form-panel')).toBeHidden();
  await page.locator('.mc-we .word-item').nth(1).click();
  await expect(page.locator('.mc-we .edit-form-card')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

test('on a phone, Start brings the quiz into view (the setup panel stays open)', async ({ page }) => {
  await open(page, 360);
  await page.locator('#startBtn').click();
  await expect(page.locator('#tableWrap input[type="text"]').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('tableArea')!.getBoundingClientRect().top))).toBeLessThan(40);
  await expect(page.locator('#controlsBody')).not.toHaveClass(/filter-body--collapsed/);
});

test('History\'s language picker shows flags', async ({ page }) => {
  await open(page, 390);
  await page.locator('.mode-tab[data-mode="history"]').click();
  await expect(page.locator('#historyLangSelectBtn img.lang-dd-flag')).toBeVisible();
});

test('on a phone, chip groups are even grids: no option left alone on a row of its own', async ({ page }) => {
  await open(page, 360);
  await page.locator('.mode-tab[data-mode="picture"]').click();
  const widths = await page.locator('#controls-top .control-group--chip .sort-order-toggle:visible .sort-order-btn')
    .evaluateAll(els => els.filter(e => (e as HTMLElement).offsetParent).map(e => Math.round(e.getBoundingClientRect().width)));
  expect(widths.length).toBeGreaterThan(3);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2);
});

test('on a phone, the controls people tap are at least 30px tall', async ({ page }) => {
  await open(page, 360);
  const tooSmall = async (): Promise<string[]> => page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('button, select, [role="button"]'))
    .filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 30
      && !e.closest('.filters-row')                       // the pill itself (38px) is the target there
      && !e.classList.contains('lang-dd-native') && !e.classList.contains('ml-lang-select'); })
    .map(e => `${e.id || e.className} ${Math.round(e.getBoundingClientRect().height)}px`));
  expect(await tooSmall()).toEqual([]);
  await page.locator('#startBtn').click();
  await expect(page.locator('#tableWrap input[type="text"]').first()).toBeVisible();
  expect(await tooSmall()).toEqual([]);
  for (const mode of ['trivia', 'mylists', 'history', 'settings']) {
    await page.locator(`.mode-tab[data-mode="${mode}"]`).click();
    await page.waitForTimeout(600);
    expect(await tooSmall(), mode).toEqual([]);
  }
});
