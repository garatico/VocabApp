import { test, expect } from '@playwright/test';
import { disableSimpleMode } from './helpers.ts';

/**
 * The strip under the filters ("what is filtering right now"): every group sits in its own grey box,
 * and the boxes and chips carry the colour of what they hold.
 */
test('each filter group is a grey box, Part of Speech chips wear their own colour, and a profile has its colour', async ({ page }) => {
  await disableSimpleMode(page);
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="table"]').click();

  // Pick two parts of speech through the real filter chips.
  for (const pos of ['verb', 'noun']) {
    await page.locator(`#classFilterBody .pos-chip[data-pos="${pos}"]`).evaluate((c: HTMLElement) => c.click());
  }
  const strip = page.locator('#filtersSummary');
  await expect(strip).toBeVisible();
  const box = strip.locator('.filters-summary-group[data-kind="pos"]');
  await expect(box).toBeVisible();

  const look = await box.evaluate(el => {
    const cs = getComputedStyle(el);
    const verb = el.querySelector('[data-pos="verb"]') as HTMLElement;
    const noun = el.querySelector('[data-pos="noun"]') as HTMLElement;
    return {
      bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, border: cs.borderTopWidth,
      verbHue: getComputedStyle(verb).getPropertyValue('--pos-hue').trim(),
      nounHue: getComputedStyle(noun).getPropertyValue('--pos-hue').trim(),
      verbColour: getComputedStyle(verb).color, nounColour: getComputedStyle(noun).color,
    };
  });
  expect(look.bg).not.toBe('rgba(0, 0, 0, 0)');                       // a filled box…
  expect(look.border).not.toBe('0px');                                // …with an edge
  expect(look.verbHue).toBe('217');                                   // verbs are blue, as in the filter itself
  expect(look.nounHue).toBe('142');                                   // nouns green
  expect(look.verbColour).not.toBe(look.nounColour);
});
