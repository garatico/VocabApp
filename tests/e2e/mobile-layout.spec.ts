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

test('My Lists on a phone: a long list name shows whole, and the stats row has no divider before it', async ({ page }) => {
  await open(page, 390, () => {
    localStorage.setItem('vq_lists_spanish', JSON.stringify({ EspañolDeLosLibrosQueLeo: ['hablar', 'comer'] }));
  });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  const title = page.locator('#myListsBar .ml-topbar-title');
  await expect(title).toContainText('EspañolDeLosLibrosQueLeo');
  expect(await title.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);   // not cut off
  await expect(page.locator('#myListsBar .ml-stats-row')).toHaveCSS('border-left-width', '0px');
});

test('the narrowest phone (360px): My Lists rows show a short word whole, and the panel header is two rows', async ({ page }) => {
  await open(page, 360, () => {
    localStorage.setItem('vq_lists_spanish', JSON.stringify({ Reading: ['hablar', 'comer'] }));
  });
  await page.locator('.mode-tab[data-mode="mylists"]').click();
  await expect(page.locator('.ml-word-item')).toHaveCount(2);
  await expect.poll(() => page.locator('.ml-word-item .ml-word-text').evaluateAll(els => els.every(e => e.scrollWidth <= e.clientWidth + 1))).toBe(true);
  const quiz = await box(page, '.ml-panel-header .ml-quiz-btn');
  const close = await box(page, '.ml-panel-close');
  expect(Math.abs(quiz.y - close.y)).toBeLessThan(12);   // ▶ Quiz beside ✕
  const chips = await page.locator('.ml-panel-header .ml-chip-dropdown').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(chips).size).toBe(1);                    // the four chips share one row
});

test('on a phone the Table\'s answer box says "Meaning…", short enough to read', async ({ page }) => {
  await open(page, 360);
  await page.locator('#startBtn').click();
  await expect(page.locator('#tableWrap input[type="text"]').first()).toHaveAttribute('placeholder', 'Meaning…');
});

test('Table on a phone: the four counts are a 2×2 grid (one row of four where it fits), the bar is 18px+', async ({ page }) => {
  for (const [width, rows] of [[360, 2], [540, 1]] as const) {
    await page.setViewportSize({ width, height: 800 });
    if (width === 360) await open(page, width); else await page.reload();
    await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
    await page.locator('#startBtn').click();
    await expect(page.locator('#tableScoreTop .score-pill').first()).toBeVisible();
    const tops = await page.locator('#tableScoreTop .score-pill').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    expect(tops).toHaveLength(4);
    expect(new Set(tops).size).toBe(rows);
    expect((await box(page, '#tableStickyBar .progress')).height).toBeGreaterThanOrEqual(18);
  }
});

test('on a phone the collapse button matches the corner box: same top, same height', async ({ page }) => {
  await open(page, 360);
  const [btn, corner] = [await box(page, '#controlsCollapseBtn'), await box(page, '#controlsCorner')];
  expect(Math.abs(btn.y - corner.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(btn.height - corner.height)).toBeLessThanOrEqual(1);
});

test('Active filters: the chips start on a line of their own, under the heading', async ({ page }) => {
  await open(page, 360, () => {
    localStorage.setItem('vq_lists_spanish', JSON.stringify({ Reading: ['hablar'] }));
    localStorage.setItem('vq_listfilter_spanish__shared', JSON.stringify({ active: true, mode: 'focus', selected: ['Reading'] }));
  });
  const [toggle, body] = [await box(page, '.filters-summary-toggle'), await box(page, '#filtersSummaryBody')];
  expect(body.y).toBeGreaterThanOrEqual(toggle.y + toggle.height - 1);
  expect(Math.round(body.x)).toBeLessThanOrEqual(Math.round(toggle.x) + 1);
});

test('My Content on a phone: the Domain options stay on screen', async ({ page }) => {
  await open(page, 390);
  await page.locator('.mode-tab[data-mode="myContent"]').click();
  await page.locator('#mcwe-domainFilterTrigger').click();
  const panel = await box(page, '#mcwe-domainFilterPanel');
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(390);
});

test('My Content: glosses are numbered and drag into a new order', async ({ page }) => {
  await open(page, 1400);
  await page.locator('.mode-tab[data-mode="myContent"]').click();
  await page.locator('#mcwe-searchInput').fill('hablar');
  await page.locator('#mcwe-searchBtn').click();
  await page.locator('.mc-we .word-item', { hasText: 'hablar' }).first().click();
  const chips = page.locator('#mcwe-editGlossesChips .chip-input-tag');
  const labels = () => chips.evaluateAll(cs => cs.map(c => c.querySelector('span:not(.chip-input-tag-order):not(.chip-input-tag-handle)')!.textContent));
  await expect(chips.nth(1)).toBeVisible();
  const before = await labels();
  await expect(chips.locator('.chip-input-tag-order').first()).toHaveText('1');
  const h = await chips.first().locator('.chip-input-tag-handle').boundingBox();
  const t = await chips.nth(1).boundingBox();
  await page.mouse.move(h!.x + h!.width / 2, h!.y + h!.height / 2);
  await page.mouse.down();
  await page.mouse.move(t!.x + t!.width - 4, t!.y + t!.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await labels()).toEqual([before[1], before[0], ...before.slice(2)]);
  await expect(chips.locator('.chip-input-tag-order')).toHaveText(before.map((_, i) => String(i + 1)));
});

test('History: its four views are tabs in the top bar, one at a time', async ({ page }) => {
  await open(page, 1400, () => { localStorage.setItem('s_due_enabled', 'true'); });
  await page.locator('.mode-tab[data-mode="history"]').click();
  const bar = page.locator('#historyBar');
  await expect(bar.locator('.history-tab-btn')).toHaveText(['Progress', 'Due for Review', 'Words to Review', 'Recent Sessions']);
  await expect(page.locator('#historyView-progress')).toBeVisible();
  await expect(page.locator('#historyView-sessions')).toBeHidden();
  await bar.locator('#historyTab-sessions').click();
  await expect(page.locator('#historyView-sessions')).toBeVisible();
  await expect(page.locator('#historyView-progress')).toBeHidden();
  await expect(bar.locator('#historyTab-sessions')).toHaveAttribute('aria-selected', 'true');
});

test('the collapse button stays put when the controls collapse and expand', async ({ page }) => {
  for (const width of [1400, 390]) {
    await page.setViewportSize({ width, height: 844 });
    if (width === 1400) await open(page, width); else await page.reload();
    await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
    const before = await box(page, '#controlsCollapseBtn');
    await page.locator('#controlsCollapseBtn').click();
    await expect(page.locator('#controlsBody')).toHaveClass(/filter-body--collapsed/);
    const after = await box(page, '#controlsCollapseBtn');
    expect([Math.round(after.x), Math.round(after.y), Math.round(after.height)]).toEqual([Math.round(before.x), Math.round(before.y), Math.round(before.height)]);
    await page.locator('#controlsCollapseBtn').click();
  }
});

test('Table on a phone: no stray divider beside the answers, and the counts fill the width', async ({ page }) => {
  await open(page, 460);
  await page.locator('#startBtn').click();
  await expect(page.locator('#tableWrap .input-cell').first()).toBeVisible();
  const borders = await page.locator('#tableWrap .input-cell').evaluateAll(els => els.slice(0, 6).map(e => getComputedStyle(e).borderRightWidth));
  expect(new Set(borders)).toEqual(new Set(['0px']));
  const score = await box(page, '#tableScoreTop');
  const pills = await page.locator('#tableScoreTop .score-pill').evaluateAll(els => els.map(e => e.getBoundingClientRect().right));
  expect(Math.max(...pills)).toBeGreaterThan(score.x + score.width - 4);   // the right column reaches the edge
});
