import { test, expect, type Page } from '@playwright/test';
import { startMode } from './helpers.ts';

/**
 * Table quiz top bar: the Jump to Top / Bottom buttons sit on the pagination row and never overlap Order,
 * the action cluster or the timer beside them, at ordinary and at cramped desktop widths.
 */

interface Box { left: number; right: number; top: number; bottom: number }

async function boxes(page: Page): Promise<Record<string, Box>> {
  return page.evaluate(() => {
    const box = (sel: string): Box => {
      const r = (document.querySelector(sel) as HTMLElement).getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    return {
      order: box('#tableJumpTop .table-nav-side:not(.table-nav-side--end)'),
      jump: box('#tableJumpTop .tnav-center'),
      cluster: box('#tableJumpTop .tnav-right-cluster'),
      pager: box('#tableJumpTop .table-pager'),
      topBtn: box('#tableJumpTop [data-jump="top"]'),
      bottomBtn: box('#tableJumpTop [data-jump="bottom"]'),
    };
  });
}

const overlaps = (a: Box, b: Box): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

for (const width of [1400, 1100, 800]) {
  test(`Jump buttons share the pagination row, below Order and the action cluster (${width}px wide)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    // The widest the bar ever gets: the clock and the Settings shortcuts both switched on.
    await page.addInitScript(() => {
      window.localStorage.setItem('s_table_show_timer', 'true');
      window.localStorage.setItem('s_show_settings_links', 'true');
    });
    await startMode(page, 'table');
    await expect(page.locator('#tableJumpTop .jump-btn').first()).toBeVisible();

    const b = await boxes(page);
    expect(overlaps(b.jump, b.order), 'Jump overlaps Order').toBe(false);
    expect(overlaps(b.jump, b.cluster), 'Jump overlaps the action cluster').toBe(false);
    expect(b.jump.top, 'Jump is below Order and the cluster').toBeGreaterThanOrEqual(Math.max(b.order.bottom, b.cluster.bottom) - 1);
    if (width >= 1100) {
      // Room for it all: same row as the pager, Jump to Top on its left and Jump to Bottom on its right.
      expect(Math.abs(b.topBtn.top - b.pager.top), 'Jump to Top shares the pager row').toBeLessThan(b.pager.bottom - b.pager.top);
      expect(b.topBtn.right, 'Jump to Top is left of the pager').toBeLessThanOrEqual(b.pager.left + 1);
      expect(b.bottomBtn.left, 'Jump to Bottom is right of the pager').toBeGreaterThanOrEqual(b.pager.right - 1);
    } else {
      // Too narrow for one line: the buttons take the row above the pager, and never overlap it.
      expect(overlaps(b.jump, b.pager), 'Jump overlaps the pager').toBe(false);
    }
    // Both buttons are fully inside the page.
    const jumpBtns = await page.locator('#tableJumpTop .jump-btn').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; }));
    for (const [l, r] of jumpBtns) { expect(l).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(width); }
  });
}
