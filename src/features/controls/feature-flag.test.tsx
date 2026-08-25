import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/*
 * Feature flag OFF (CR-2026 §7.3, QA-16, SEC-12).
 *
 * The change request requires the modules to disappear completely when the
 * flag is off — not merely to be hidden. This file mocks the configuration
 * before the router is imported, so the routes are registered as they would be
 * in an environment with `VITE_FEATURE_CONTROL_REGISTERS=off`.
 */

vi.mock('../../config/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/index.ts')>()
  return {
    ...actual,
    appConfig: { ...actual.appConfig, controlRegistersEnabled: false },
  }
})

const { renderApp, SEEDED } = await import('../../app/test-harness.tsx')
const { resetSessionStore } = await import('../../app/session/session-store.ts')

afterEach(() => {
  resetSessionStore()
})

describe('control registers behind the feature flag', () => {
  it('hides both entries from the navigation', async () => {
    renderApp({ route: '/dashboard', signedInAs: SEEDED.admin })

    const nav = await screen.findByRole('navigation', { name: 'Primary navigation' })
    expect(within(nav).queryByRole('link', { name: 'Control Register' })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Control Deficiencies' })).not.toBeInTheDocument()

    // The rest of the shell is untouched.
    expect(within(nav).getByRole('link', { name: 'Risk Register' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Reports' })).toBeInTheDocument()
  })

  it('does not serve the routes even on a direct URL', async () => {
    renderApp({ route: '/controls', signedInAs: SEEDED.admin })

    expect(await screen.findByRole('heading', { name: 'Page not found', level: 1 })).toBeInTheDocument()
  })

  it('leaves the Risk Register working exactly as before', async () => {
    renderApp({ route: '/register', signedInAs: SEEDED.admin })

    expect(await screen.findByRole('heading', { name: 'Risk Register', level: 1 })).toBeInTheDocument()
  })
})
