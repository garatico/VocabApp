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
  },
  resolve: {
    alias: {
      'better-sqlite3': path.resolve(__dirname, 'tests/helpers/sqlite-shim.js'),
    },
  },
});
