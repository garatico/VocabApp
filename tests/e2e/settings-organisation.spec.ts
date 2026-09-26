import { test, expect, type Page } from '@playwright/test';

/**
 * How the Settings screen is organised: sections fall under five nav headings and follow the same
 * order in the page, the display settings and every colour picker live in Appearance, and the
 * "Changed from default" filter finds exactly what has been touched.
 */

async function openSettings(page: Page): Promise<void> {
  // Advanced settings visible; nothing else touched, so "changed from default" starts at zero.
  await page.addInitScript(() => {
    window.localStorage.setItem('s_simple_mode', 'false');
    window.localStorage.setItem('s_advanced_mode', 'true');
  });
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="settings"]').click();
  await expect(page.locator('#settingsSearch')).toBeVisible();
}

test('the nav is grouped under five headings, in the same order as the sections on the page', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('.settings-nav-heading')).toHaveText(['Quizzes', 'Display', 'Content', 'Progress', 'App']);

  const navTargets = await page.locator('.settings-nav-link').evaluateAll(links => links.map(l => (l.getAttribute('href') ?? '').slice(1)));
  const pageOrder = await page.locator('.settings-section').evaluateAll(secs => secs.map(s => s.id));
  expect(navTargets).toEqual(pageOrder);
  expect(navTargets).toEqual([
    'settings-sec-table', 'settings-sec-picture', 'settings-sec-conj', 'settings-sec-guessblank', 'settings-sec-answers',
    'settings-sec-appearance',
    'settings-sec-filters', 'settings-sec-chinese', 'settings-sec-glossary',
    'settings-sec-streak', 'settings-sec-history',
    'settings-sec-general',
  ]);
});

test('display settings and all colour pickers live in Appearance, not scattered across the quiz sections', async ({ page }) => {
  await openSettings(page);
  const inAppearance = (id: string): Promise<boolean> =>
    page.evaluate(i => !!document.querySelector(`#settings-sec-appearance #${i}`), id);
  for (const id of [
    'settingCols', 'settingTableRowDensity', 'settingTableShowRank', 'settingTableShowMarkers', 'settingGenderIndicatorStyle',
    'settingFontSize', 'settingLangIndicator',
    'settingMlColors', 'settingTableColors', 'settingGenderColors', 'settingTenseColors', 'settingPosColors', 'settingLangColors',
  ]) {
    expect(await inAppearance(id), id + ' should be in Appearance').toBe(true);
  }
  // Table Quiz keeps what changes how the quiz behaves.
  expect(await page.evaluate(() => !!document.querySelector('#settings-sec-table #settingCols'))).toBe(false);
  expect(await page.evaluate(() => !!document.querySelector('#settings-sec-table #settingPageSize'))).toBe(true);
  await expect(page.locator('#settings-sec-appearance .settings-subhead')).toHaveText('Colors');
});

test('a fresh browser has nothing marked as changed', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('.settings-row--changed')).toHaveCount(0);
  await expect(page.locator('#settingsChangedCount')).toHaveText('');
});

test('"Changed from default" counts, marks and filters to what was touched', async ({ page }) => {
  await openSettings(page);
  await page.locator('#settingCols .sort-order-btn[data-cols="3"]').evaluate((b: HTMLElement) => b.click());
  await page.locator('#settingTableRowDensity .sort-order-btn[data-density="compact"]').evaluate((b: HTMLElement) => b.click());

  await expect(page.locator('#settingsChangedCount')).toHaveText('2');
  await expect(page.locator('.settings-row--changed')).toHaveCount(2);

  await page.locator('#settingsChangedOnly').click();
  await expect(page.locator('#settingsChangedOnly')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.settings-row:not([hidden])').filter({ has: page.locator('.settings-label') })).toHaveCount(2);
  // Only Appearance has anything in it, so it is the only nav link (and heading) left.
  await expect(page.locator('.settings-nav-link:not([hidden])')).toHaveCount(1);
  await expect(page.locator('.settings-nav-heading:not([hidden])')).toHaveText(['Display']);

  // Put one back: the count follows, but the row stays until the filter is re-applied.
  await page.locator('#settingCols .sort-order-btn[data-cols="2"]').evaluate((b: HTMLElement) => b.click());
  await expect(page.locator('#settingsChangedCount')).toHaveText('1');

  await page.locator('#settingsChangedOnly').click();
  await expect(page.locator('.settings-nav-heading:not([hidden])')).toHaveCount(5);
});

test('a changed setting is still changed after a reload, and search finds a colour group by name', async ({ page }) => {
  await openSettings(page);
  await page.locator('#settingCols .sort-order-btn[data-cols="4"]').evaluate((b: HTMLElement) => b.click());
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="settings"]').click();
  await expect(page.locator('#settingsChangedCount')).toHaveText('1');

  await page.locator('#settingsSearch').fill('colors');
  await expect(page.locator('#settingsGroupMlColors')).toBeVisible();
  await expect(page.locator('.settings-nav-link:not([hidden])')).not.toHaveCount(0);
});

test('nav groups sit in boxes, and the changed marker does not overlap the label', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('.settings-nav-group')).toHaveCount(5);
  await expect(page.locator('.settings-nav-group').first().locator('.settings-nav-link')).toHaveCount(5);
  const bg = await page.locator('.settings-nav-group').first().evaluate(el => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');

  await page.locator('#settingCols .sort-order-btn[data-cols="3"]').evaluate((b: HTMLElement) => b.click());
  await page.locator('.settings-nav-link[href="#settings-sec-appearance"]').click();
  const overlap = await page.evaluate(() => {
    const row = document.querySelector('.settings-row--changed') as HTMLElement;
    const bar = row.getBoundingClientRect().left + parseFloat(getComputedStyle(row, '::before').left) + 3;
    const label = (row.querySelector('.settings-label') as HTMLElement).getBoundingClientRect().left;
    return bar - label;                      // > 0 would mean the bar reaches into the text
  });
  expect(overlap).toBeLessThanOrEqual(0);
});

test('Reset all to defaults clears every preference but keeps lists and progress', async ({ page }) => {
  await openSettings(page);
  await page.evaluate(() => {
    localStorage.setItem('vq_lists_spanish', JSON.stringify({ Keepers: [] }));
    localStorage.setItem('s_table_cols', '4');
    localStorage.setItem('s_list_color_profile', '#00aa55');
  });
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="settings"]').click();
  await expect(page.locator('#settingsChangedCount')).toHaveText('2');      // the column count and the colour

  page.once('dialog', d => { void d.dismiss(); });
  await page.locator('#settingsResetAll').click();                     // cancelled: nothing changes
  expect(await page.evaluate(() => localStorage.getItem('s_table_cols'))).toBe('4');

  page.once('dialog', d => { void d.accept(); });
  await Promise.all([page.waitForEvent('load'), page.locator('#settingsResetAll').click()]);
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  expect(await page.evaluate(() => [localStorage.getItem('s_table_cols'), localStorage.getItem('s_list_color_profile')])).toEqual([null, null]);
  expect(await page.evaluate(() => localStorage.getItem('vq_lists_spanish'))).toContain('Keepers');
  await page.locator('.mode-tab[data-mode="settings"]').click();
  await expect(page.locator('#settingsChangedCount')).toHaveText('');
});

test('advanced-only groups sit together in one Advanced fold per section, closed until searched for', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('.settings-fold')).toHaveCount(10);
  expect(await page.evaluate(() => document.querySelectorAll('.settings-group[data-advanced]').length)).toBe(0);
  await expect(page.locator('#settingsFold-appearance')).toHaveClass(/filter-body--collapsed/);
  await expect(page.locator('#settingsFold-appearance #settingsGroupGenderColors')).toHaveCount(1);

  await page.locator('#settingsSearch').fill('gender colors');
  await expect(page.locator('#settingsFold-appearance')).not.toHaveClass(/filter-body--collapsed/);
  await expect(page.locator('#settingsGroupGenderColors')).toBeVisible();
  await page.locator('#settingsSearch').fill('');
  await expect(page.locator('#settingsFold-appearance')).toHaveClass(/filter-body--collapsed/);
});

test('the nav uses one icon set, keeps every label on one line, and shares each section colour', async ({ page }) => {
  await openSettings(page);
  await expect(page.locator('.settings-nav-link svg.settings-icon')).toHaveCount(12);
  await expect(page.locator('.settings-section > .settings-collapse-btn svg.settings-icon')).toHaveCount(12);

  const heights = await page.locator('.settings-nav-link').evaluateAll(links => links.map(l => (l as HTMLElement).getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeLessThan(36);                    // a wrapped label would be ~50px

  const pairs = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLAnchorElement>('.settings-nav-link')).map(a => {
    const sec = document.getElementById(a.getAttribute('href')!.slice(1))!;
    return [getComputedStyle(a).getPropertyValue('--sec').trim(), getComputedStyle(sec).getPropertyValue('--sec').trim()];
  }));
  for (const [link, section] of pairs) expect(link).toBe(section);
  expect(new Set(pairs.map(p => p[0])).size).toBe(12);                  // every section has its own colour
});

test('a changed row can be reset on its own, and a whole section from its head', async ({ page }) => {
  await openSettings(page);
  await page.locator('.settings-nav-link[href="#settings-sec-appearance"]').click();
  await page.locator('#settingCols .sort-order-btn[data-cols="4"]').evaluate((b: HTMLElement) => b.click());
  await page.locator('#settingTableRowDensity .sort-order-btn[data-density="ultra"]').evaluate((b: HTMLElement) => b.click());
  await expect(page.locator('#settingsChangedCount')).toHaveText('2');

  // One row: its own ↺ appears and restores just that setting, through the setting's own handler.
  const colsRow = page.locator('.settings-row', { has: page.locator('#settingCols') });
  await expect(colsRow.locator('.settings-row-reset')).toBeVisible();
  await colsRow.locator('.settings-row-reset').click();
  await expect(page.locator('#settingsChangedCount')).toHaveText('1');
  await expect(page.locator('#settingCols .sort-order-btn.active')).toHaveAttribute('data-cols', '2');
  await expect(page.locator('body')).toHaveClass(/table-ultra-compact-rows/);       // the other row is untouched

  // The section head: only shown while something in the section is changed.
  await expect(page.locator('#settings-sec-table > .settings-section-reset')).toBeHidden();
  await page.locator('#settings-sec-appearance > .settings-section-reset').click();
  await expect(page.locator('#settingsChangedCount')).toHaveText('');
  await expect(page.locator('body')).not.toHaveClass(/table-ultra-compact-rows/);   // repainted, not just re-stored
  await expect(page.locator('#settings-sec-appearance > .settings-section-reset')).toBeHidden();
});

test('Settings reopens on the section you were last reading', async ({ page }) => {
  await openSettings(page);
  await page.locator('.settings-nav-link[href="#settings-sec-glossary"]').click();
  await expect(page.locator('.settings-nav-link.is-current')).toHaveAttribute('href', '#settings-sec-glossary');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('s_settings_section'))).toBe('settings-sec-glossary');

  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="settings"]').click();
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('settings-sec-glossary')!.getBoundingClientRect().top))).toBeLessThan(220);
  await expect(page.locator('#settingsBodyGlossary')).not.toHaveClass(/filter-body--collapsed/);
});

test('the Glossary explains what the trimmed descriptions no longer do', async ({ page }) => {
  await openSettings(page);
  for (const term of ['Progress bar label', 'Row density', 'Answer matching and typo tolerance', 'Simple Mode', 'Gloss cutoff']) {
    await expect(page.locator('.glossary-term', { hasText: term })).toHaveCount(1);
  }
  // No setting description is a paragraph any more.
  const long = await page.evaluate(() => Array.from(document.querySelectorAll('.settings-section:not(.settings-section--glossary) .settings-desc'))
    .map(e => (e.textContent ?? '').length).filter(n => n > 130).length);
  expect(long).toBe(0);
});

test('an Advanced fold opens and closes when its heading is clicked', async ({ page }) => {
  await openSettings(page);
  await page.locator('.settings-nav-link[href="#settings-sec-table"]').click();
  const body = page.locator('#settingsFold-table');
  const head = page.locator('[data-collapse="settingsFold-table"]');
  await expect(body).toBeHidden();
  await head.click();
  await expect(body).toBeVisible();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(body.locator('#settingTimedQuiz')).toBeVisible();
  await head.click();
  await expect(body).toBeHidden();
  await expect(head).toHaveAttribute('aria-expanded', 'false');
});

test('a new user sees only the essentials; the rest is behind Advanced', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('s_simple_mode', 'false'));
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="settings"]').click();
  // Advanced mode is off: these are not on the page at all.
  for (const id of ['settingTimedQuiz', 'settingTableRowDensity', 'settingQuestionGlosses', 'settingConjPageSize', 'settingStreakGoal']) {
    if (await page.locator('#' + id).count()) await expect(page.locator('#' + id)).toBeHidden();
  }
  const visibleRows = await page.evaluate(() => Array.from(document.querySelectorAll('.settings-section:not(.settings-section--glossary) .settings-row'))
    .filter(r => (r as HTMLElement).offsetParent !== null).length);
  expect(visibleRows).toBeLessThanOrEqual(26);
  // Essentials are still there (Appearance opens from the nav, like any collapsed section).
  await page.locator('.settings-nav-link[href="#settings-sec-appearance"]').click();
  for (const id of ['settingPageSize', 'settingHintButton', 'settingFontSize', 'settingCols']) {
    await expect(page.locator('#' + id)).toBeVisible();
  }
});

test('the corner buttons sit inside the top bar and never overlap the page below, on every tab', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('s_simple_mode', 'false'));
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  for (const tab of ['mylists', 'myContent', 'history', 'settings', 'table']) {
    await page.locator(`.mode-tab[data-mode="${tab}"]`).click();
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const bar = document.getElementById('controls')!.getBoundingClientRect();
      const corner = document.getElementById('controlsCorner')!.getBoundingClientRect();
      return { barTop: bar.top, barBottom: bar.bottom, cTop: corner.top, cBottom: corner.bottom, barRight: bar.right, cRight: corner.right };
    });
    expect(r.cBottom, tab + ': corner must end inside the bar').toBeLessThanOrEqual(r.barBottom - 1);
    expect(r.cTop, tab + ': corner must start inside the bar').toBeGreaterThanOrEqual(r.barTop);
    expect(r.barRight - r.cRight, tab + ': corner hugs the right edge').toBeLessThan(14);
  }
});

// ═══ Undo ═══════════════════════════════════════════════════════════════════════
test('resetting one row can be undone', async ({ page }) => {
  await openSettings(page);
  await page.locator('.settings-nav-link[href="#settings-sec-appearance"]').click();
  await page.locator('#settingCols .sort-order-btn[data-cols="4"]').evaluate((b: HTMLElement) => b.click());
  const row = page.locator('.settings-row', { has: page.locator('#settingCols') });
  await row.locator('.settings-row-reset').click();
  await expect(page.locator('#settingCols .sort-order-btn.active')).toHaveAttribute('data-cols', '2');
  await expect(page.locator('.ml-undo-msg')).toContainText('Default columns');
  // Focus stays on the setting rather than falling to <body> when the reset button disappears.
  expect(await page.evaluate(() => document.activeElement?.closest('.settings-row')?.querySelector('#settingCols') !== null)).toBe(true);

  await page.locator('.ml-undo-btn').click();
  await expect(page.locator('#settingCols .sort-order-btn.active')).toHaveAttribute('data-cols', '4');
  await expect(page.locator('#settingsChangedCount')).toHaveText('1');
});

test('resetting a section can be undone, colours and repainting included', async ({ page }) => {
  await openSettings(page);
  await page.locator('.settings-nav-link[href="#settings-sec-appearance"]').click();
  await page.locator('#settingTableRowDensity .sort-order-btn[data-density="ultra"]').evaluate((b: HTMLElement) => b.click());
  await page.locator('#settingMlColors input[type="color"]').first().evaluate((el: HTMLInputElement) => {
    el.value = '#00aa55'; el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#settingsChangedCount')).toHaveText('2');
  await expect(page.locator('.settings-group--changed')).toHaveCount(1);

  await page.locator('#settings-sec-appearance > .settings-section-reset').click();
  await expect(page.locator('#settingsChangedCount')).toHaveText('');
  await expect(page.locator('body')).not.toHaveClass(/table-ultra-compact-rows/);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('s_list_color_')))).toEqual([]);

  await page.locator('.ml-undo-btn').click();
  await expect(page.locator('#settingsChangedCount')).toHaveText('2');
  await expect(page.locator('body')).toHaveClass(/table-ultra-compact-rows/);
});

test('"Reset all" offers Undo after the page reloads', async ({ page }) => {
  await openSettings(page);
  await page.evaluate(() => { localStorage.setItem('s_table_cols', '4'); localStorage.setItem('vq_daily_goal', JSON.stringify({ words: 25, minutes: 0, streak: 0 })); });
  await page.reload();
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="settings"]').click();
  await expect(page.locator('#settingsChangedCount')).toHaveText('2');            // the column count and the words goal

  page.once('dialog', d => { void d.accept(); });
  await Promise.all([page.waitForEvent('load'), page.locator('#settingsResetAll').click()]);
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await expect(page.locator('.ml-undo-msg')).toContainText('reset to its default');
  expect(await page.evaluate(() => [localStorage.getItem('s_table_cols'), localStorage.getItem('vq_daily_goal')])).toEqual([null, null]);

  await Promise.all([page.waitForEvent('load'), page.locator('.ml-undo-btn').click()]);
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  expect(await page.evaluate(() => localStorage.getItem('s_table_cols'))).toBe('4');
  expect(await page.evaluate(() => localStorage.getItem('vq_daily_goal'))).toContain('25');
});

test('goals and the timed-quiz minutes count as changed and can be reset', async ({ page }) => {
  await openSettings(page);
  await page.locator('.settings-nav-link[href="#settings-sec-streak"]').click();
  await page.locator('[data-goal-presets="words"] .sort-order-btn[data-goal="25"]').evaluate((b: HTMLElement) => b.click());
  const goalRow = page.locator('[data-goal-row="words"]');
  await expect(goalRow).toHaveClass(/settings-row--changed/);
  await goalRow.locator('.settings-row-reset').evaluate((b: HTMLElement) => b.click());
  await expect(page.locator('[data-goal-presets="words"] .sort-order-btn.active')).toHaveAttribute('data-goal', '0');
  await page.locator('.ml-undo-btn').click();
  await expect(page.locator('[data-goal-presets="words"] .sort-order-btn.active')).toHaveAttribute('data-goal', '25');

  await page.locator('#settingTimedQuizMinutes').evaluate((el: HTMLInputElement) => { el.value = '15'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  const timedRow = page.locator('.settings-row', { has: page.locator('#settingTimedQuizMinutes') });
  await expect(timedRow).toHaveClass(/settings-row--changed/);
  await timedRow.locator('.settings-row-reset').evaluate((b: HTMLElement) => b.click());
  await expect(page.locator('#settingTimedQuizMinutes')).toHaveValue('10');
});

// ═══ Jumping to a setting, and search ═══════════════════════════════════════════
test('a #setting= link opens Settings at that setting', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('s_simple_mode', 'false'));
  await page.goto('/#setting=settingHintButton');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await expect(page.locator('#settingsArea')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#settingHintButton')).toBeInViewport({ timeout: 15000 });    // scrolled to (the flash is too brief to assert on a slow load)
  expect(await page.evaluate(() => window.location.hash)).toBe('');                    // consumed, so it can be used again
});

test('the quiz screen links straight to a setting, switching Advanced on when it has to', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('s_simple_mode', 'false'));
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator('.mode-tab[data-mode="table"]').click();
  await page.locator('#tableSettingsLinks [data-setting-link="settingTableRowDensity"]').evaluate((b: HTMLElement) => b.click());
  await expect(page.locator('#settingsArea')).toBeVisible();
  await expect(page.locator('#settingTableRowDensity')).toBeVisible();                 // Appearance + its Advanced fold opened
  await expect(page.locator('body')).toHaveClass(/advanced-mode/);
});

test('a Glossary entry links to the setting it explains', async ({ page }) => {
  await openSettings(page);
  await page.locator('.settings-nav-link[href="#settings-sec-glossary"]').click();
  await page.locator('.glossary-term', { hasText: 'Progress bar label' }).locator('[data-setting-link]').click();
  await expect(page.locator('#settingProgressBarPercentMode')).toBeVisible();
  await expect(page.locator('.settings-row--flash')).toHaveCount(1);
});

test('"/" focuses the search box, but not while typing elsewhere', async ({ page }) => {
  await openSettings(page);
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('/');
  await expect(page.locator('#settingsSearch')).toBeFocused();
  await page.keyboard.type('timer');
  await expect(page.locator('#settingsSearch')).toHaveValue('timer');                  // the slash was not typed into it
  await page.keyboard.press('/');
  await expect(page.locator('#settingsSearch')).toHaveValue('timer/');                 // and inside a field it is an ordinary character
});

test('search understands plain words, shows where each hit lives, and finds Glossary entries', async ({ page }) => {
  await openSettings(page);
  await page.locator('#settingsSearch').fill('clock');                                 // "timer" is what the row is called
  const hit = page.locator('.settings-row:not([hidden])', { has: page.locator('#settingShowTimer') });
  await expect(hit).toBeVisible();
  await expect(hit.locator('.settings-crumb')).toHaveText('Table Quiz › Advanced › Progress & Timing');

  await page.locator('#settingsSearch').fill('gloss cutoff');
  await expect(page.locator('.glossary-term:not([hidden])', { hasText: 'Gloss cutoff' })).toBeVisible();
  await page.locator('#settingsSearch').fill('');
  await expect(page.locator('.settings-crumb:not([hidden])')).toHaveCount(0);
});

// ═══ Accessibility, narrow screens ══════════════════════════════════════════════
test('a changed row says so in text, not only in colour', async ({ page }) => {
  await openSettings(page);
  await page.locator('.settings-nav-link[href="#settings-sec-appearance"]').click();
  await page.locator('#settingCols .sort-order-btn[data-cols="3"]').evaluate((b: HTMLElement) => b.click());
  const row = page.locator('.settings-row', { has: page.locator('#settingCols') });
  await expect(row.locator('.settings-changed-sr')).toHaveText('(changed from default)');
  await row.locator('.settings-row-reset').evaluate((b: HTMLElement) => b.click());
  await expect(row.locator('.settings-changed-sr')).toHaveText('');
});

test('on a phone-width screen the nav is a row of chips and nothing spills sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openSettings(page);
  await page.locator('#settingCols .sort-order-btn[data-cols="3"]').evaluate((b: HTMLElement) => b.click());
  await expect(page.locator('.settings-nav-heading').first()).toBeHidden();
  const nav = await page.locator('.settings-nav').evaluate(el => ({ dir: getComputedStyle(el).flexDirection, scrolls: el.scrollWidth > el.clientWidth }));
  expect(nav.dir).toBe('row');
  expect(nav.scrolls).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // The section's Reset button must not sit on top of its title.
  await page.locator('.settings-nav-link[href="#settings-sec-appearance"]').click();
  const boxes = await page.evaluate(() => {
    const sec = document.getElementById('settings-sec-appearance')!;
    const title = sec.querySelector('.settings-section-title')!.getBoundingClientRect();
    const btn = sec.querySelector('.settings-section-reset')!.getBoundingClientRect();
    return { titleRight: title.right, btnLeft: btn.left, btnW: btn.width };
  });
  if (boxes.btnW > 0) expect(boxes.btnLeft).toBeGreaterThanOrEqual(boxes.titleRight - 1);
});
