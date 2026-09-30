import { test, expect } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * Settings → Appearance → Background & Transparency: a solid colour or a gradient behind the app, and
 * cards and panels that can be made see-through so it shows.
 */

test.beforeEach(async ({ page }) => {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="settings"]').click();
});

const pageBg = (page: import('@playwright/test').Page): Promise<string> =>
  page.evaluate(() => getComputedStyle(document.body).backgroundImage + '|' + getComputedStyle(document.body).backgroundColor);

test('a preset turns the background on; Default turns it off; a gradient uses both colours', async ({ page }) => {
  const before = await pageBg(page);
  expect(before).not.toContain('gradient');

  await page.locator('#settingBgPresets .bg-preset[title="Sunrise"]').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#settingBgMode .sort-order-btn.active')).toHaveText('Gradient');
  expect(await pageBg(page)).toContain('linear-gradient');
  expect(await page.evaluate(() => window.localStorage.getItem('s_bg_mode'))).toBe('gradient');

  await page.locator('#settingBgPresets .bg-preset[title="Sand"]').evaluate((el: HTMLElement) => el.click());
  await expect.poll(() => pageBg(page)).toContain('rgb(239, 230, 214)');      // #efe6d6, solid (the colour eases in)

  await page.locator('#settingBgMode .sort-order-btn', { hasText: 'Default' }).evaluate((el: HTMLElement) => el.click());
  await expect.poll(() => pageBg(page)).toBe(before);
});

test('choosing a colour on Default switches to Solid, and the choice survives a reload', async ({ page }) => {
  await page.locator('#settingBgColor').evaluate((el: HTMLInputElement) => {
    el.value = '#123456'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#settingBgMode .sort-order-btn.active')).toHaveText('Solid');
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await expect.poll(() => pageBg(page)).toContain('rgb(18, 52, 86)');
});

test('lower opacity makes cards see-through, but a dialog stays solid', async ({ page }) => {
  // Computed colours come back as rgba(...) or, for a colour-mix, color(srgb r g b / a).
  const alpha = (sel: string): Promise<number> => page.evaluate(s => {
    const c = getComputedStyle(document.querySelector(s) as Element).backgroundColor;
    const slash = /\/\s*([\d.]+%?)\s*\)/.exec(c);
    if (slash) return slash[1].endsWith('%') ? Number(slash[1].slice(0, -1)) / 100 : Number(slash[1]);
    const rgba = /rgba\(([^)]+)\)/.exec(c);
    return rgba ? Number(rgba[1].split(',')[3]) : 1;
  }, sel);
  expect(await alpha('#controls')).toBe(1);

  await page.locator('#settingAppOpacity').evaluate((el: HTMLInputElement) => {
    el.value = '60'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#settingAppOpacityOut')).toHaveText('60%');
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-translucent'))).toBe(true);
  await expect.poll(() => alpha('#controls')).toBeCloseTo(0.6, 1);

  // A confirmation dialog keeps its own solid background.
  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.innerHTML = '<div class="app-dialog" id="probeDialog">x</div>';
    document.body.appendChild(overlay);
  });
  expect(await alpha('#probeDialog')).toBe(1);

  await page.locator('#settingAppOpacity').evaluate((el: HTMLInputElement) => {
    el.value = '100'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-translucent'))).toBe(false);
});
