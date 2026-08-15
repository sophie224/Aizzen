import { render, screen, waitFor, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppDataProvider } from '../data/app-data-provider.tsx'
import { AppDataStore } from '../data/app-data-store.ts'
import { LocalStorageRepository, type StorageLike } from '../data/local-storage-repository.ts'
import { MemorySessionRepository } from '../data/session-repository.ts'
import type { AuthServiceClient } from '../data/auth-service-client.ts'
import { AuthServiceContext } from './session/auth-service-context.ts'
import { SessionRepositoryContext } from './session/session-repository-context.ts'
import { SessionBootstrap } from './session/session-bootstrap.tsx'
import { resetSessionStore } from './session/session-store.ts'
import { AppRoutes } from './routes.tsx'

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, value) }
  removeItem(key: string) { this.map.delete(key) }
}

/** A stand-in for the auth service, so tests need no server. */
function fakeAuthService(overrides: Partial<AuthServiceClient> = {}): AuthServiceClient {
  return {
    enabled: true,
    startGoogleSignIn: vi.fn(),
    readSession: () => Promise.resolve(null),
    signOut: () => Promise.resolve(),
    ...overrides,
  }
}

function renderApp(options: {
  route?: string
  authService?: AuthServiceClient
  sessionRepository?: MemorySessionRepository
} = {}): RenderResult {
  resetSessionStore()

  const storage = new MemoryStorage()
  const store = new AppDataStore({ repository: new LocalStorageRepository({ storage }) })
  const sessionRepository = options.sessionRepository ?? new MemorySessionRepository()

  return render(
    <AppDataProvider store={store}>
      <AuthServiceContext.Provider value={options.authService ?? fakeAuthService()}>
        <SessionRepositoryContext.Provider value={sessionRepository}>
          <SessionBootstrap>
            <MemoryRouter initialEntries={[options.route ?? '/login']}>
              <AppRoutes />
            </MemoryRouter>
          </SessionBootstrap>
        </SessionRepositoryContext.Provider>
      </AuthServiceContext.Provider>
    </AppDataProvider>,
  )
}

afterEach(() => {
  resetSessionStore()
  vi.restoreAllMocks()
})

// --- the button -------------------------------------------------------------

describe('Sign in with Google button', () => {
  it('appears when an auth service is configured', async () => {
    renderApp()
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  })

  it('is hidden when no auth service is configured', async () => {
    renderApp({ authService: fakeAuthService({ enabled: false }) })
    await screen.findByRole('heading', { name: /Sign in/i, level: 1 })

    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull()
  })

  it('starts the redirect flow rather than posting credentials', async () => {
    const startGoogleSignIn = vi.fn()
    renderApp({ authService: fakeAuthService({ startGoogleSignIn }) })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Sign in with Google' }))

    expect(startGoogleSignIn).toHaveBeenCalledTimes(1)
  })

  it('leaves the credential form available alongside it', async () => {
    renderApp()
    await screen.findByRole('button', { name: 'Sign in with Google' })

    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
})

// --- denial -----------------------------------------------------------------

describe('a denied Google sign-in', () => {
  it('shows a generic message that does not reveal whether the account exists', async () => {
    renderApp({ route: '/login?error=denied' })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/must be created by an administrator/i)
    // No hint about which rule failed.
    expect(alert.textContent).not.toMatch(/disabled|inactive|unverified|not found/i)
  })

  it('shows nothing without the error parameter', async () => {
    renderApp()
    await screen.findByRole('button', { name: 'Sign in with Google' })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// --- server session ---------------------------------------------------------

describe('server session', () => {
  it('signs the user in from the service cookie', async () => {
    renderApp({
      route: '/app/dashboard',
      authService: fakeAuthService({ readSession: () => Promise.resolve('usr_admin') }),
    })

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('ERM Administrator')).toBeInTheDocument()
  })

  it('takes precedence over a stale local reference', async () => {
    const sessionRepository = new MemorySessionRepository()
    sessionRepository.write('usr_auditor')

    renderApp({
      route: '/app/dashboard',
      sessionRepository,
      authService: fakeAuthService({ readSession: () => Promise.resolve('usr_admin') }),
    })

    // The server session wins.
    expect(await screen.findByText('ERM Administrator')).toBeInTheDocument()
    expect(screen.queryByText('Internal Auditor')).toBeNull()
  })

  it('falls back to the local session when the service reports none', async () => {
    const sessionRepository = new MemorySessionRepository()
    sessionRepository.write('usr_admin')

    renderApp({ route: '/app/dashboard', sessionRepository })

    expect(await screen.findByText('ERM Administrator')).toBeInTheDocument()
  })

  it('still re-validates a server session against AppState', async () => {
    // The service claims a user that does not exist in this state.
    renderApp({
      route: '/app/dashboard',
      authService: fakeAuthService({ readSession: () => Promise.resolve('usr_ghost') }),
    })

    expect(await screen.findByRole('heading', { name: /Sign in/i, level: 1 })).toBeInTheDocument()
  })

  it('clears the server session on sign-out', async () => {
    const signOut = vi.fn(() => Promise.resolve())
    renderApp({
      route: '/app/dashboard',
      authService: fakeAuthService({ readSession: () => Promise.resolve('usr_admin'), signOut }),
    })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled()
    })
  })
})
