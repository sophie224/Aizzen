import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    /*
     * Two projects: the SPA runs in jsdom, the auth service in node. They need
     * different environments, so they cannot share one include list.
     */
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'app',
          environment: 'jsdom',
          setupFiles: ['./src/test-setup.ts'],
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.{test,spec}.ts'],
        },
      },
    ],
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // The skeleton must stay green before any feature tests exist (PLAN.md M1).
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test-setup.ts', 'src/main.tsx'],
    },
  },
})
