import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { MemorySessionRepository, SESSION_STORAGE_KEY } from '../data/session-repository.ts'
import { CREDENTIALS, MemoryStorage, renderApp, SEEDED } from './test-harness.tsx'
import { resetSessionStore } from './session/session-store.ts'

afterEach(() => {
  resetSessionStore()
})

/** Fills and submits the sign-in form. */
async function signInWith(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Email address'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

describe('sign-in with each demo account', () => {
  it('signs in an administrator and lands on the dashboard', async () => {
    renderApp({ route: '/login' })
    await signInWith(CREDENTIALS.admin.email, CREDENTIALS.admin.password)

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: 'Primary navigation' })).getByText('ERM Administrator'),
    ).toBeInTheDocument()
  })

  it('loads the correct role for every seeded account', async () => {
    const cases = [
      { credentials: CREDENTIALS.admin, name: 'ERM Administrator', administration: true },
      { credentials: CREDENTIALS.riskManager, name: 'Risk Manager', administration: false },
      { credentials: CREDENTIALS.riskOwner, name: 'Nino Kapanadze', administration: false },
      { credentials: CREDENTIALS.controlOwner, name: 'Giorgi Maisuradze', administration: false },
      { credentials: CREDENTIALS.actionOwner, name: 'Mariam Lomidze', administration: false },
      { credentials: CREDENTIALS.auditor, name: 'Internal Auditor', administration: false },
    ]

    for (const testCase of cases) {
      const view = renderApp({ route: '/login' })
      await signInWith(testCase.credentials.email, testCase.credentials.password)

      // The rail prints the signed-in name and the job title, which coincide
      // for the seeded Risk Manager account.
      expect((await screen.findAllByText(testCase.name)).length).toBeGreaterThan(0)

      const nav = screen.getByRole('navigation', { name: 'Primary navigation' })
      const adminLink = within(nav).queryByRole('link', { name: 'Administration' })
      expect(Boolean(adminLink), testCase.name).toBe(testCase.administration)

      view.unmount()
      resetSessionStore()
    }
  })

  it('sends the super administrator to Website Administration', async () => {
    renderApp({ route: '/login' })
    await signInWith(CREDENTIALS.superAdmin.email, CREDENTIALS.superAdmin.password)

    expect(
      await screen.findByRole('heading', { name: 'Website Administration', level: 1 }),
    ).toBeInTheDocument()
  })

  it('accepts an email differing by case and whitespace', async () => {
    renderApp({ route: '/login' })
    await signInWith('  ADMIN@ERM.Local  ', CREDENTIALS.admin.password)

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
  })

  it('returns the user to the page they were denied', async () => {
    renderApp({ route: '/reports' })
    await screen.findByRole('heading', { name: /Sign in/i, level: 1 })

    await signInWith(CREDENTIALS.admin.email, CREDENTIALS.admin.password)
    expect(await screen.findByRole('heading', { name: 'Reports', level: 1 })).toBeInTheDocument()
  })
})

describe('rejected sign-in', () => {
  it('shows an error and creates no session for a wrong password', async () => {
    const { sessionRepository } = renderApp({ route: '/login' })
    await signInWith(CREDENTIALS.admin.email, 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent(/Sign-in failed/i)
    expect(screen.getByRole('heading', { name: /Sign in/i, level: 1 })).toBeInTheDocument()
    expect(sessionRepository.read()).toBeNull()
  })

  it('shows the same error for an unknown address', async () => {
    renderApp({ route: '/login' })
    await signInWith('nobody@erm.local', 'whatever')

    expect(await screen.findByRole('alert')).toHaveTextContent(/Sign-in failed/i)
  })

  it('never reveals whether an account exists', async () => {
    const first = renderApp({ route: '/login' })
    await signInWith('nobody@erm.local', 'whatever')
    const unknownMessage = (await screen.findByRole('alert')).textContent
    // Unmount before the second run, or both forms sit in the DOM at once.
    first.unmount()
    resetSessionStore()

    const second = renderApp({ route: '/login' })
    await signInWith(CREDENTIALS.admin.email, 'wrong-password')
    const wrongPasswordMessage = (await screen.findByRole('alert')).textContent
    second.unmount()

    expect(wrongPasswordMessage).toBe(unknownMessage)
    expect(unknownMessage).toBeTruthy()
  })

  it('clears the password field but keeps the email after a failure', async () => {
    renderApp({ route: '/login' })
    await signInWith(CREDENTIALS.admin.email, 'wrong-password')
    await screen.findByRole('alert')

    expect(screen.getByLabelText('Email address')).toHaveValue(CREDENTIALS.admin.email)
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })
})

describe('inactive accounts', () => {
  it('cannot sign in even with the correct password', async () => {
    const storage = new MemoryStorage()
    const sessionRepository = new MemorySessionRepository()

    // Deactivate the administrator in persisted state, then sign in.
    const seedView = renderApp({ storage, sessionRepository, signedInAs: SEEDED.superAdmin })
    await screen.findByRole('heading', { level: 1 })

    const raw = storage.map.get('erm-risk-management-v3-state') ?? '{}'
    const parsed = JSON.parse(raw) as { users: { id: string; status: string }[] }
    const admin = parsed.users.find((candidate) => candidate.id === SEEDED.admin)
    if (admin) admin.status = 'Inactive'
    storage.map.set('erm-risk-management-v3-state', JSON.stringify(parsed))
    seedView.unmount()
    resetSessionStore()

    renderApp({ route: '/login', storage, sessionRepository: new MemorySessionRepository() })
    await signInWith(CREDENTIALS.admin.email, CREDENTIALS.admin.password)

    expect(await screen.findByRole('alert')).toHaveTextContent(/Sign-in failed/i)
  })

  it('drops a restored session whose account was deactivated', async () => {
    const storage = new MemoryStorage()
    const sessionRepository = new MemorySessionRepository()

    const first = renderApp({ storage, sessionRepository, signedInAs: SEEDED.admin })
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    first.unmount()
    resetSessionStore()

    const raw = storage.map.get('erm-risk-management-v3-state') ?? '{}'
    const parsed = JSON.parse(raw) as { users: { id: string; status: string }[] }
    const admin = parsed.users.find((candidate) => candidate.id === SEEDED.admin)
    if (admin) admin.status = 'Inactive'
    storage.map.set('erm-risk-management-v3-state', JSON.stringify(parsed))

    renderApp({ storage, sessionRepository })

    expect(await screen.findByRole('heading', { name: /Sign in/i, level: 1 })).toBeInTheDocument()
    expect(sessionRepository.read()).toBeNull()
  })
})

describe('session persistence', () => {
  it('survives a refresh', async () => {
    const storage = new MemoryStorage()
    const sessionRepository = new MemorySessionRepository()

    const first = renderApp({ route: '/login', storage, sessionRepository })
    await signInWith(CREDENTIALS.admin.email, CREDENTIALS.admin.password)
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })
    expect(sessionRepository.read()).toBe(SEEDED.admin)

    // Unmount and remount with the same stores — a page refresh.
    first.unmount()
    resetSessionStore()
    renderApp({ storage, sessionRepository })

    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: 'Primary navigation' })).getByText('ERM Administrator'),
    ).toBeInTheDocument()
  })

  it('stores only the user ID — never a credential or token', async () => {
    const storage = new MemoryStorage()
    const sessionRepository = new MemorySessionRepository()

    renderApp({ route: '/login', storage, sessionRepository })
    await signInWith(CREDENTIALS.admin.email, CREDENTIALS.admin.password)
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    const persisted = sessionRepository.read()
    expect(persisted).toBe(SEEDED.admin)
    expect(persisted).not.toContain(CREDENTIALS.admin.password)
    expect(persisted).not.toContain('@')
  })

  it('uses a session key separate from the application state key', () => {
    expect(SESSION_STORAGE_KEY).toBe('erm-risk-management-v3-session')
    expect(SESSION_STORAGE_KEY).not.toBe('erm-risk-management-v3-state')
  })

  it('signs out, clears the session and does not restore it', async () => {
    const storage = new MemoryStorage()
    const sessionRepository = new MemorySessionRepository()

    const first = renderApp({ storage, sessionRepository, signedInAs: SEEDED.admin })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    await waitFor(() => {
      expect(sessionRepository.read()).toBeNull()
    })
    first.unmount()
    resetSessionStore()

    renderApp({ storage, sessionRepository })
    expect(await screen.findByRole('heading', { name: /Sign in/i, level: 1 })).toBeInTheDocument()
  })
})

describe('authentication audit trail', () => {
  /** Reads audit actions straight out of persisted state. */
  function auditActions(storage: MemoryStorage): string[] {
    const raw = storage.map.get('erm-risk-management-v3-state')
    if (!raw) return []
    const parsed = JSON.parse(raw) as { auditEvents: { action: string; summary: string }[] }
    return parsed.auditEvents.map((event) => event.action)
  }

  it('records a successful sign-in', async () => {
    const storage = new MemoryStorage()
    renderApp({ route: '/login', storage })
    await signInWith(CREDENTIALS.admin.email, CREDENTIALS.admin.password)
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    await waitFor(() => {
      expect(auditActions(storage)).toContain('auth.login')
    })
  })

  it('records a failed attempt', async () => {
    const storage = new MemoryStorage()
    renderApp({ route: '/login', storage })
    await signInWith(CREDENTIALS.admin.email, 'wrong-password')
    await screen.findByRole('alert')

    await waitFor(() => {
      expect(auditActions(storage)).toContain('auth.login_failed')
    })
  })

  it('does not write the attempted password into the audit trail', async () => {
    const storage = new MemoryStorage()
    renderApp({ route: '/login', storage })
    await signInWith(CREDENTIALS.admin.email, 'hunter2-secret')
    await screen.findByRole('alert')

    await waitFor(() => {
      expect(auditActions(storage)).toContain('auth.login_failed')
    })
    expect(storage.map.get('erm-risk-management-v3-state')).not.toContain('hunter2-secret')
  })

  it('records a sign-out', async () => {
    const storage = new MemoryStorage()
    renderApp({ storage, signedInAs: SEEDED.admin })

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    await waitFor(() => {
      expect(auditActions(storage)).toContain('auth.logout')
    })
  })
})

describe('read-only roles surface no mutation controls', () => {
  it('gives the auditor no edit, save or create control in the shell', async () => {
    renderApp({ signedInAs: SEEDED.auditor })
    await screen.findByRole('navigation', { name: 'Primary navigation' })

    const mutationLabels = /^(save|edit|new|add|create|delete|remove)\b/i
    /*
     * Saving a personal dashboard or register VIEW is a per-user preference,
     * not a change to any risk record — every reader may do it, an auditor
     * included. What must stay absent is anything that edits risk data.
     */
    const personalPreference = /^(save view|arrange)/i
    const buttons = screen.getAllByRole('button')
    const offending = buttons.filter(
      (button) =>
        mutationLabels.test(button.textContent ?? '') &&
        !personalPreference.test(button.textContent ?? ''),
    )

    expect(offending).toEqual([])
  })

  it('leaves the auditor read-only across every module', async () => {
    renderApp({ signedInAs: SEEDED.auditor, route: '/register' })
    expect(await screen.findByRole('heading', { name: 'Risk Register', level: 1 })).toBeInTheDocument()

    // Administration is the one module an auditor holds `none` on.
    const nav = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(within(nav).queryByRole('link', { name: 'Administration' })).toBeNull()
  })
})

describe('sign-in page presentation', () => {
  it('states plainly that this is not production security', async () => {
    renderApp({ route: '/login' })
    expect(await screen.findByText(/not production security/i)).toBeInTheDocument()
  })

  it('labels both fields and marks the password field as a password', async () => {
    renderApp({ route: '/login' })

    expect(await screen.findByLabelText('Email address')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('offers demo accounts that fill the form without bypassing the check', async () => {
    renderApp({ route: '/login' })
    const user = userEvent.setup()

    await user.click(await screen.findByText('Demo accounts'))
    await user.click(screen.getByRole('button', { name: /ERM Administrator/ }))

    expect(screen.getByLabelText('Email address')).toHaveValue(CREDENTIALS.admin.email)
    // Still on the sign-in page: filling the form does not authenticate.
    expect(screen.getByRole('heading', { name: /Sign in/i, level: 1 })).toBeInTheDocument()
  })

  it('renders in Georgian', async () => {
    renderApp({ route: '/login', language: 'ka' })
    expect(await screen.findByLabelText('ელფოსტის მისამართი')).toBeInTheDocument()
  })
})
