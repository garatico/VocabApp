import js             from '@eslint/js';
import tseslint        from 'typescript-eslint';

// ── TypeScript configs ─────────────────────────────────────────────────────────

const tsServerConfig = tseslint.config({
  files: ['src/server/**/*.ts'],
  extends: [
    ...tseslint.configs.recommended,
  ],
  languageOptions: {
    parserOptions: {
      project:   './tsconfig.server.json',
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars':        ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any':        'warn',
    '@typescript-eslint/no-floating-promises':   'error',
    '@typescript-eslint/no-non-null-assertion':  'warn',
    'no-empty':                                  ['error', { allowEmptyCatch: true }],
  },
});

const tsClientConfig = tseslint.config({
  files: ['src/client/**/*.ts'],
  extends: [
    ...tseslint.configs.recommended,
  ],
  languageOptions: {
    parserOptions: {
      project:   './tsconfig.json',
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    '@typescript-eslint/no-unused-vars':        ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any':        'warn',
    '@typescript-eslint/no-floating-promises':   'error',
    '@typescript-eslint/no-non-null-assertion':  'warn',
    'no-empty':                                  ['error', { allowEmptyCatch: true }],
  },
});

// ── JS configs ─────────────────────────────────────────────────────────────────

const commonJsRules = {
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
  'no-undef':       'error',
  'no-empty':       ['error', { allowEmptyCatch: true }],
};

export default [
  js.configs.recommended,

  // TypeScript — server
  ...tsServerConfig,

  // TypeScript — client
  ...tsClientConfig,

  {
    // Backend Node.js JS source (rare — most is TS now)
    files: ['src/server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType:  'module',
      globals: {
        process: 'readonly', console: 'readonly',
        __dirname: 'readonly', __filename: 'readonly',
        setTimeout: 'readonly', clearInterval: 'readonly', setInterval: 'readonly',
      },
    },
    rules: commonJsRules,
  },
  {
    // Frontend browser JS source (rare — most is TS now)
    files: ['src/client/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType:  'module',
      globals: {
        window: 'readonly', document: 'readonly', localStorage: 'readonly',
        fetch: 'readonly', console: 'readonly', confirm: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        clearInterval: 'readonly', setInterval: 'readonly',
        URL: 'readonly', URLSearchParams: 'readonly', Blob: 'readonly',
        CSS: 'readonly', speechSynthesis: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        HTMLElement: 'readonly', MutationObserver: 'readonly',
      },
    },
    rules: commonJsRules,
  },
  {
    // Test files
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType:  'module',
      globals: { process: 'readonly', console: 'readonly' },
    },
    rules: commonJsRules,
  },
  {
    // Node.js scripts (data pipeline, validate, test-api, etc.)
    files: ['scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType:  'module',
      globals: {
        process: 'readonly', console: 'readonly',
        __dirname: 'readonly', __filename: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        URL: 'readonly', fetch: 'readonly',
      },
    },
    rules: commonJsRules,
  },

  // Global ignores
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**'] },
];
