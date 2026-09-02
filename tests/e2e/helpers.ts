import { type Page } from '@playwright/test';

/** Switches to `mode`'s tab and clicks Start Quiz with whatever the default
 *  controls already are — every Phase 1 spec starts here, since none of
 *  them are testing the controls themselves, only what happens once a quiz
 *  is running. */
export async function startMode(page: Page, mode: string): Promise<void> {
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
