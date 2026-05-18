import { defineConfig } from 'vitest/config';

/**
 * Vitest config for frontend pure-logic tests.
 *
 * Run:   npm run test:frontend
 * Watch: npm run test:frontend:watch
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals:     false,
    include:     ['src/client/__tests__/**/*.test.ts'],
  },
});
