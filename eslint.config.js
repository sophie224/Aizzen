import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/*
 * Architectural boundaries are enforced here, not by convention.
 * See ARCHITECTURE.md §2 (layers) and §4 (storage).
 *
 *   1. Only src/data may touch localStorage / sessionStorage.
 *      The PRD requires a backend-portable data model with no business
 *      logic hard-coded to localStorage.
 *
 *   2. src/domain must stay pure — no React, no I/O, no upward imports.
 *      It has to remain reusable server-side at the Phase 2 cutover.
 */

const STORAGE_MESSAGE =
  'Browser storage is only allowed in src/data. Go through AppRepository instead (ARCHITECTURE.md §4).'

const restrictedStorageGlobals = ['localStorage', 'sessionStorage'].map((name) => ({
  name,
  message: STORAGE_MESSAGE,
}))

const restrictedStorageProperties = ['window', 'globalThis', 'self'].flatMap((object) =>
  ['localStorage', 'sessionStorage'].map((property) => ({
    object,
    property,
    message: STORAGE_MESSAGE,
  })),
)

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    'playwright-report',
    'test-results',
    'app.html',
  ]),

  // Base configuration for all application source.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-restricted-globals': ['error', ...restrictedStorageGlobals],
      'no-restricted-properties': ['error', ...restrictedStorageProperties],
    },
  },

  // Boundary 1 — the storage adapter is the one place allowed to persist.
  {
    files: ['src/data/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
    },
  },

  // Boundary 2 — the domain layer stays pure and framework-free.
  {
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'react',
            'react-dom',
            'react-dom/client',
            'react-router',
            'react-router-dom',
            'zustand',
          ].map((name) => ({
            name,
            message:
              'src/domain must stay framework-free — it has to run server-side in Phase 2 (ARCHITECTURE.md §2.1).',
          })),
          patterns: [
            {
              group: ['@tanstack/*', 'react-dom/*', 'zustand/*'],
              message:
                'src/domain must stay framework-free — it has to run server-side in Phase 2 (ARCHITECTURE.md §2.1).',
            },
            {
              group: [
                '**/data/**',
                '**/features/**',
                '**/app/**',
                '**/ui/**',
                '../data',
                '../features',
                '../app',
                '../ui',
              ],
              message:
                'src/domain may not import from outer layers. Dependencies point inward (ARCHITECTURE.md §2).',
            },
          ],
        },
      ],
    },
  },

  // Node-side tooling config files.
  {
    files: ['*.config.{ts,js}', 'e2e/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
    },
  },
])
