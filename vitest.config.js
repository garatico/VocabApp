import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false,
    // Only look in tests/ — never pick up frontend or other stray test files
    include: ['tests/**/*.test.{js,ts}'],
    // Several tests drive error paths on purpose (unknown language, bad payloads),
    // and the server logger would dump those stack traces to stderr. Silence it
    // for the suite; tests/logger.test.js sets LOG_LEVEL itself per case.
    env: { LOG_LEVEL: 'silent' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/server/**/*.{js,ts}'],
      exclude: ['src/server/index.js', 'src/server/index.ts'],
    },
  },
  resolve: {
    alias: {
      'better-sqlite3': path.resolve(__dirname, 'tests/helpers/sqlite-shim.js'),
    },
  },
});
