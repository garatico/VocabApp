import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config — see docs/testing scope discussion. Chromium only for now:
 * this is a single-maintainer app, and Firefox/WebKit would roughly triple
 * runtime for very little extra bug-catching return here.
 *
 * `webServer` starts the real dev server (API + Vite, same as `npm run dev`)
 * and waits for it to answer before any test runs, so there's no manual
 * server-juggling either locally or in CI. It's left running between test
 * files locally (`reuseExistingServer`) so repeat runs during development
 * don't pay the startup cost each time; CI always starts fresh.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
