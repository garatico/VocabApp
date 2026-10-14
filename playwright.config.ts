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
  // One warm-up load before the first spec — see tests/e2e/global-setup.ts.
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  // One retry locally too: every worker shares the one dev API (see `expect` below), so under a full
  // run a spec can lose a race it wins alone. A retry that passes is reported as "flaky", not hidden.
  retries: process.env['CI'] ? 2 : 1,
  // Three browsers at a time, not half the cores: past that the shared API is the bottleneck and the
  // run gets slower and flakier, not faster.
  workers: process.env['CI'] ? 2 : 3,
  reporter: process.env['CI'] ? 'github' : 'list',

  // Assertions get 10 s (default 5). Every worker talks to one single-threaded
  // dev API that blocks ~1–2 s each time it (re)loads a language — after every
  // admin write, for one — so with four browsers a UI update can legitimately
  // land a few seconds late. That is contention, not a bug worth failing on.
  expect: { timeout: 10_000 },

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
