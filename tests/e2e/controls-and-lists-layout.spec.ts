import { test, expect, type Page } from '@playwright/test';
import { disableSimpleMode, openMode } from './helpers.ts';

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
    await openMode(page, 'mylists');
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

for (const width of [390, 1024]) {
  test(`compact My Lists rows (${width}px): a short word shows whole, and one long word can't squeeze every meaning`, async ({ page }) => {
    await disableSimpleMode(page);
    await page.addInitScript(() => {
      localStorage.setItem('vq_lists_spanish', JSON.stringify({ Reading: ['comer', 'hablar', 'vivir', 'desafortunadamente'] }));
    });
    await page.setViewportSize({ width, height: 844 });
    await open(page);
    await openMode(page, 'mylists');
    if (width < 600) await page.locator('.ml-list-item', { hasText: 'Reading' }).click();   // a phone starts on the index of lists
    await expect(page.locator('.ml-table.ml-cols--compact')).toBeVisible();
    await expect(page.locator('.ml-word-item')).toHaveCount(4);
    await expect.poll(() => page.locator('.ml-word-list').evaluate(l => (l as HTMLElement).style.getPropertyValue('--ml-cword-w'))).not.toBe('');
    const rows = await page.locator('.ml-word-item').evaluateAll(items => items.map(r => {
      const text = r.querySelector('.ml-word-text') as HTMLElement;
      const word = r.querySelector('.ml-cell-word') as HTMLElement;
      const trans = r.querySelector('.ml-cell-trans') as HTMLElement;
      return { word: text.innerText, clipped: text.scrollWidth > text.clientWidth + 1, x: word.getBoundingClientRect().width, t: trans.getBoundingClientRect().width };
    }));
    for (const r of rows.filter(r => r.word !== 'desafortunadamente')) expect(r.clipped, r.word).toBe(false);
    expect(new Set(rows.map(r => Math.round(r.x))).size).toBe(1);   // one shared width: the columns line up
    expect(rows[0].x).toBeLessThanOrEqual(Math.ceil((rows[0].x + rows[0].t) * 0.6) + 1);   // the meaning keeps 40%
  });
}

/** Top edge of an element, rounded — two controls "share a line" when their tops match. */
async function top(page: Page, sel: string): Promise<number> {
  return Math.round((await page.locator(sel).first().boundingBox())!.y);
}

test.describe('Table controls on a phone (390px)', () => {
  test.beforeEach(async ({ page }) => {
    await disableSimpleMode(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
  });

  test('Language and + Languages share a line; Words is pool | count, then the take mode', async ({ page }) => {
    expect(await top(page, '#langPickerBtn')).toBe(await top(page, '#langGroup .lang-dd-trigger'));
    expect(await top(page, '#sizeSelect')).toBe(await top(page, '#poolModeSelect'));
    expect(await top(page, '#sizeModeSelect')).toBeGreaterThan(await top(page, '#poolModeSelect'));   // the take mode goes underneath
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });

  test('Quiz Style and Direction sit side by side: labels on one line, controls on the next', async ({ page }) => {
    expect(await top(page, '#directionGroup > label')).toBe(await top(page, '#tableStyleGroup > label'));
    expect(await top(page, '#directionSelect')).toBe(await top(page, '#tableStyleSelect'));
    expect(await top(page, '#tableStyleSelect')).toBeGreaterThan(await top(page, '#tableStyleGroup > label'));
  });

  test('every setting is a dropdown: the cycle buttons give way to pickers, and they drive the real controls', async ({ page }) => {
    await expect(page.locator('#poolModeCycle')).toBeHidden();
    await expect(page.locator('#directionCycle')).toBeHidden();
    await page.locator('#directionSelect').selectOption('mixed');
    await expect(page.locator('#directionToggle .conj-toggle-btn.active')).toHaveAttribute('data-direction', 'mixed');
    await page.locator('#poolModeSelect').selectOption('range');
    await expect(page.locator('#rankRangeRow')).toBeVisible();
    await page.locator('#poolModeSelect').selectOption('topn');
    await expect(page.locator('#sizeSelect')).toBeVisible();
  });

  test('the three filters share one row; On/Off and the link are at the top of each panel', async ({ page }) => {
    const tops = await page.locator('#filtersRow > :is(#classFilter, #listFilter, #domainFilterWrap)').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
    await expect(page.locator('#listFilterActive')).toBeHidden();
    await page.locator('#listFilter .filter-collapse-btn').click();
    await expect(page.locator('#listFilterBody #listFilterActive')).toBeVisible();
    const panel = (await page.locator('#listFilterBody').boundingBox())!;
    expect(panel.x + panel.width).toBeLessThanOrEqual(390);
  });

  test('collapsed, the card still holds the corner box (streak, dice…)', async ({ page }) => {
    await page.locator('#controlsCollapseBtn').click();
    await expect(page.locator('#controlsBody')).toHaveClass(/filter-body--collapsed/);
    const card = (await page.locator('#controls').boundingBox())!;
    const corner = (await page.locator('#controlsCorner').boundingBox())!;
    expect(corner.y + corner.height).toBeLessThanOrEqual(card.y + card.height - 1);
  });
});

test.describe('Active filters', () => {
  test.beforeEach(async ({ page }) => {
    await disableSimpleMode(page);
    await page.addInitScript(() => {
      localStorage.setItem('vq_lists_spanish', JSON.stringify({ Reading: ['hablar', 'comer'] }));
      localStorage.setItem('vq_listfilter_spanish__shared', JSON.stringify({ active: true, mode: 'focus', selected: ['Reading'] }));
    });
  });

  test('on a phone, Start Quiz sits below the active filters', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await open(page);
    const summary = (await page.locator('#filtersSummary').boundingBox())!;
    const start = (await page.locator('#startBtn').boundingBox())!;
    expect(start.y).toBeGreaterThanOrEqual(summary.y + summary.height);
  });

  for (const width of [1024, 1400]) {
    test(`on desktop, Start Quiz sits under the corner box, clear of every control (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      const corner = (await page.locator('#controlsCorner').boundingBox())!;
      const start = (await page.locator('#startBtn').boundingBox())!;
      const card = (await page.locator('#controls').boundingBox())!;
      expect(start.y).toBeGreaterThanOrEqual(corner.y + corner.height);
      expect(Math.abs(start.x + start.width - (corner.x + corner.width))).toBeLessThanOrEqual(2);   // right edges line up
      expect(start.y + start.height).toBeLessThanOrEqual(card.y + card.height);
      const overlaps = await page.evaluate(() => {
        const s = document.getElementById('startBtn')!.getBoundingClientRect();
        return Array.from(document.querySelectorAll<HTMLElement>('#controls-top button, #controls-top select, #filtersRow > *, #filtersSummary'))
          .filter(e => { const r = e.getBoundingClientRect(); return r.width && r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top; })
          .map(e => e.id || e.className);
      });
      expect(overlaps).toEqual([]);
    });
  }

  test('the active filters collapse and expand, and stay as left', async ({ page }) => {
    await open(page);
    const toggle = page.locator('.filters-summary-toggle');
    await expect(page.locator('#filtersSummaryCount')).toHaveText('1');
    await expect(page.locator('#filtersSummaryBody .filters-summary-chip')).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#filtersSummaryBody')).toBeHidden();
    await page.reload();
    await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
    await expect(page.locator('#filtersSummaryBody')).toBeHidden();
    await expect(page.locator('#filtersSummaryCount')).toHaveText('1');   // still says how many, collapsed
    await toggle.click();
    await expect(page.locator('#filtersSummaryBody .filters-summary-chip')).toBeVisible();
  });
});

test('Settings → Help & Tips: the Glossary\'s CSV entry opens the CSV guide', async ({ page }) => {
  await disableSimpleMode(page);
  await open(page);
  await openMode(page, 'settings');
  await page.locator('[data-collapse="settingsBodyGlossary"]').click();
  await page.locator('[data-setting-link="csvGuide"]').click();
  await expect(page.locator('#csvGuide table.csv-sheet').first()).toBeVisible();
  await expect(page.locator('.help-tip')).toHaveCount(9);
});

test('Settings → Help & Tips fits a phone: the CSV sheets scroll inside their cards, not the page', async ({ page }) => {
  await disableSimpleMode(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await openMode(page, 'settings');
  await page.locator('.settings-nav-toggle').click();                            // on a phone the sections fold behind "Section ▾"
  await page.locator('.settings-nav-link[href="#settings-sec-help"]').click();
  await expect(page.locator('#csvGuide table.csv-sheet').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
