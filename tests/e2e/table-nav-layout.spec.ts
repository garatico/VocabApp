import { test, expect, type Page } from '@playwright/test';
import { startMode } from './helpers.ts';

/**
 * Table quiz sticky bar: two rows. Row 1 is the progress bar (and the clock); row 2 is the counts, the pager,
 * the in-quiz actions and a ⋯ menu that holds everything that is set up rather than used mid-quiz.
 */

const IN_MENU = ['#tableOrderSelect', '#tableSortByToggle'];
const ON_ROW = ['#tableScoreTop', '#tablePagerTop', '#tableJumpTop [data-jump="top"]', '#tableJumpTop [data-jump="bottom"]', '#tableJumpBtn', '#tableReset', '#tableRetry', '#tableMoreBtn'];

async function rowTops(page: Page, sels: string[]): Promise<Array<number | null>> {
  return page.evaluate(s => s.map(sel => {
    const e = document.querySelector(sel) as HTMLElement | null;
    if (!e || e.offsetParent === null) return null;
    const r = e.getBoundingClientRect();
    return (r.top + r.bottom) / 2;
  }), sels);
}

for (const width of [1400, 1100]) {
  test(`counts, pager, actions and ⋯ share one row (${width}px wide)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await startMode(page, 'table');
    await expect(page.locator('input[data-word]').first()).toBeVisible();
    await expect(page.locator('#tablePagerTop')).toBeVisible();

    const ys = await rowTops(page, ON_ROW);
    ys.forEach((y, i) => expect(y, `${ON_ROW[i]} is on screen`).not.toBeNull());
    expect(Math.max(...(ys as number[])) - Math.min(...(ys as number[])), 'one line').toBeLessThan(14);
  });
}

test('the ⋯ menu holds Order and Sort; opens, and closes on Escape and outside click', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await startMode(page, 'table');
  await expect(page.locator('input[data-word]').first()).toBeVisible();

  const menu = page.locator('#tableMoreMenu');
  await expect(menu).toBeHidden();
  for (const sel of IN_MENU) await expect(page.locator(sel)).toBeHidden();

  await page.locator('#tableMoreBtn').click();
  await expect(menu).toBeVisible();
  await expect(page.locator('#tableMoreBtn')).toHaveAttribute('aria-expanded', 'true');
  for (const sel of IN_MENU) await expect(page.locator(sel)).toBeVisible();
  // Fully inside the page.
  const box = await menu.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1400);

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await page.locator('#tableMoreBtn').click();
  await expect(menu).toBeVisible();
  await page.locator('#tableWrap').click({ position: { x: 5, y: 5 } });
  await expect(menu).toBeHidden();
});

test('Jump to Top / Bottom are icon-only buttons on the row, named by their tooltip', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await startMode(page, 'table');
  await expect(page.locator('input[data-word]').first()).toBeVisible();
  for (const [which, name] of [['top', /top/i], ['bottom', /bottom/i]] as const) {
    const btn = page.locator(`#tableJumpTop [data-jump="${which}"]`);
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('title', name);
    await expect(btn).toHaveAccessibleName(name);
    expect((await btn.innerText()).trim().length, 'no text label').toBeLessThanOrEqual(1);
  }
});
