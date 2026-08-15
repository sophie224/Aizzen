// Registers @testing-library/jest-dom matchers with Vitest's expect,
// and clears the DOM between tests. Loaded via vitest.config.ts setupFiles.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
