import { type Page } from '@playwright/test';

/**
 * Simple Mode defaults to *on* for a session with no saved settings
 * (Settings.getSimpleMode()'s own fallback in settings.ts) and, while on,
 * hides the My Lists and My Content tabs entirely (app.ts's
 * syncSimpleModeLocks) — the same as a real first-time visitor, who'd have
 * to find Settings and turn it off before either tab exists to click.
 * Any spec exercising My Lists/My Content (or a feature that reaches into
 * them, like Testing Profiles or a backup/restore round-trip) needs this
 * called before page.goto(), or the tab is there in the DOM but `hidden`.
 */
export async function disableSimpleMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('s_simple_mode', 'false');
    // The proof-of-concept quiz tabs are hidden by default now.
    window.localStorage.setItem('s_show_experimental_modes', 'true');
    window.localStorage.setItem('s_show_my_content', 'true');
  });
}

/** Switches to `mode`'s tab and clicks Start Quiz with whatever the default
 *  controls already are — every Phase 1 spec starts here, since none of
 *  them are testing the controls themselves, only what happens once a quiz
 *  is running. */
export async function startMode(page: Page, mode: string): Promise<void> {
  // Picture Quiz, Trivia, Guess the Blank and Sentence Scramble are hidden
  // until switched on in Settings — see app.ts's syncExperimentalModes.
  await page.addInitScript(() => {
    window.localStorage.setItem('s_show_experimental_modes', 'true');
  });
  await page.goto('/');
  await page.locator('#loadingSpinner').waitFor({ state: 'hidden' });
  await page.locator(`.mode-tab[data-mode="${mode}"]`).click();
  await page.locator('#startBtn').click();
}

/** Pulls the quoted answer out of a "The answer was "X"" / "Correct order:
 *  "X""-style feedback string — used so a spec can assert against whatever
 *  the real vocabulary/question data actually says instead of hard-coding
 *  it, since that data is free to change under a future VocabApp-Data
 *  resync (see CLAUDE.md's whole point about the two projects disagreeing). */
export function extractQuoted(text: string): string {
  const match = /"([^"]+)"/.exec(text);
  if (!match) throw new Error(`No quoted answer found in feedback text: "${text}"`);
  return match[1];
}

/** Answer the next in-app confirmation dialog (src/client/ui/dialog.ts) the moment it appears: `pick` is
 *  the button to press — its first named action ("Delete list", "Reset all"…) or Cancel. Register it
 *  before the click that raises the dialog. (A Playwright locator handler only runs during a later
 *  action, so it can't answer a dialog raised by the very click it precedes.) */
async function answerNextDialog(page: Page, pick: '.app-dialog-choice' | '.app-dialog-cancel'): Promise<void> {
  await page.evaluate(selector => {
    const watcher = new MutationObserver(() => {
      const btn = document.querySelector<HTMLElement>(selector);
      if (btn) { watcher.disconnect(); btn.click(); }
    });
    watcher.observe(document.body, { childList: true, subtree: true });
  }, pick);
}

export function confirmNext(page: Page): Promise<void> { return answerNextDialog(page, '.app-dialog-choice'); }
export function cancelNext(page: Page): Promise<void> { return answerNextDialog(page, '.app-dialog-cancel'); }

/** Answer the next in-app text dialog (askText — naming a folder, a copy, a rename) with `value`, the
 *  moment it appears. Like confirmNext, register it before the click that raises the dialog. */
export async function answerTextNext(page: Page, value: string): Promise<void> {
  await page.evaluate(text => {
    const watcher = new MutationObserver(() => {
      const input = document.querySelector<HTMLInputElement>('.app-dialog-input');
      if (!input) return;
      watcher.disconnect();
      input.value = text;
      document.querySelector<HTMLElement>('.app-dialog .app-dialog-choice')?.click();
    });
    watcher.observe(document.body, { childList: true, subtree: true });
  }, value);
}

/**
 * Click Start Quiz, opening the controls first if the last quiz collapsed them. Starting a quiz closes the setup
 * panel (Settings -> Appearance -> "Collapse controls on Start", on by default), so a second Start in the same test
 * has to reopen it, as a person would.
 */
export async function startQuiz(page: Page): Promise<void> {
  const start = page.locator('#startBtn');
  if (!(await start.isVisible())) await page.locator('#controlsCollapseBtn').click();
  await start.click();
}

/**
 * Open the "⋯" actions menu on a My Lists word row, then click one of its items. The row's buttons (move, remove,
 * edit, due reminders) live in that menu rather than as a row of icons.
 */
export async function rowAction(page: Page, item: string, row = page.locator('.ml-word-item').first()): Promise<void> {
  await row.locator('.ml-row-menu-btn').click();
  await row.locator(item).click();
}
