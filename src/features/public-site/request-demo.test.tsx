import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { STORAGE_KEY, type AppState } from '../../domain/types/index.ts'
import { renderApp, SEEDED, type MemoryStorage } from '../../app/test-harness.tsx'

/*
 * Public "Request a demo" page (ARCHITECTURE.md §8.5).
 *
 * What matters here is the contract, not the marketing copy: the page is
 * reachable without a session, it refuses an incomplete submission, it persists
 * a complete one through the one mutation transaction with an audit event, and
 * it grants nothing.
 */

function persisted(storage: MemoryStorage): AppState {
  return JSON.parse(storage.map.get(STORAGE_KEY) ?? '{}') as AppState
}

/** Fills every field with a valid submission. */
async function completeForm() {
  const user = userEvent.setup()

  await user.type(screen.getByLabelText(/First name/i), 'Nino')
  await user.type(screen.getByLabelText(/Last name/i), 'Beridze')
  await user.type(screen.getByLabelText(/Work email/i), 'Nino.Beridze@Example.com')
  await user.type(screen.getByLabelText(/Job title/i), 'Head of Risk')
  await user.type(screen.getByLabelText(/Company/i), 'Example Bank')
  await user.type(screen.getByLabelText(/Phone number/i), '+995 32 200 00 00')
  await user.selectOptions(screen.getByLabelText(/Country/i), 'GE')
  await user.click(screen.getByRole('checkbox', { name: 'Risk Management' }))
  await user.click(screen.getByRole('checkbox', { name: /I agree/i }))

  return user
}

describe('request a demo', () => {
  it('is reachable from the public header without a session', async () => {
    renderApp({ route: '/' })

    const header = await screen.findByRole('banner')
    const link = within(header).getByRole('link', { name: 'Request demo' })
    expect(link).toHaveAttribute('href', '/request-demo')

    await userEvent.click(link)

    expect(
      await screen.findByRole('heading', { name: /See AIZEN Risk Management/i, level: 1 }),
    ).toBeInTheDocument()
  })

  it('renders the administrator-managed copy, not hard-coded marketing text', async () => {
    renderApp({ route: '/request-demo' })

    // Headline, highlights and consent wording all come from siteContent.
    expect(
      await screen.findByRole('heading', { name: /See AIZEN Risk Management/i, level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByText(/45-minute guided walkthrough/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /I agree that AIZEN may store/i })).toBeInTheDocument()
  })

  it('offers one checkbox per configured solution, by id', async () => {
    renderApp({ route: '/request-demo' })

    const risk = await screen.findByRole('checkbox', { name: 'Risk Management' })
    expect(risk).toHaveAttribute('value', 'solution_risk')
    expect(screen.getByRole('checkbox', { name: 'Compliance Management' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Audit Management' })).toBeInTheDocument()
  })

  it('refuses an empty submission and says which fields are wrong', async () => {
    const { storage } = renderApp({ route: '/request-demo' })

    const submit = await screen.findByRole('button', { name: 'Submit request' })
    await userEvent.click(submit)

    expect(await screen.findByRole('alert')).toHaveTextContent(/check the highlighted fields/i)
    expect(screen.getAllByText('This field is required.').length).toBeGreaterThan(0)
    expect(screen.getByText('Select at least one solution.')).toBeInTheDocument()
    // The message is text, never colour alone, and nothing was stored.
    expect(persisted(storage).demoRequests).toEqual([])
  })

  it('will not submit without consent, however complete the rest is', async () => {
    const { storage } = renderApp({ route: '/request-demo' })

    await screen.findByRole('button', { name: 'Submit request' })
    const user = await completeForm()
    // Untick the consent the helper gave.
    await user.click(screen.getByRole('checkbox', { name: /I agree/i }))
    await user.click(screen.getByRole('button', { name: 'Submit request' }))

    expect(
      await screen.findByText(/Your consent is required before we can store these details./i),
    ).toBeInTheDocument()
    expect(persisted(storage).demoRequests).toEqual([])
  })

  it('rejects a malformed email address', async () => {
    renderApp({ route: '/request-demo' })

    await screen.findByRole('button', { name: 'Submit request' })
    const user = await completeForm()
    await user.clear(screen.getByLabelText(/Work email/i))
    await user.type(screen.getByLabelText(/Work email/i), 'nino')
    await user.click(screen.getByRole('button', { name: 'Submit request' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  })

  it('persists a complete submission and acknowledges it', async () => {
    const { storage } = renderApp({ route: '/request-demo' })

    await screen.findByRole('button', { name: 'Submit request' })
    const user = await completeForm()
    await user.click(screen.getByRole('button', { name: 'Submit request' }))

    expect(
      await screen.findByRole('heading', { name: 'Request received', level: 2 }),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(persisted(storage).demoRequests).toHaveLength(1)
    })

    const [request] = persisted(storage).demoRequests
    expect(request.email).toBe('nino.beridze@example.com')
    expect(request.company).toBe('Example Bank')
    expect(request.country).toBe('GE')
    expect(request.solutionIds).toEqual(['solution_risk'])
    expect(request.consent).toBe(true)
    // Handling state is never set by the visitor.
    expect(request.status).toBe('New')
    expect(request.handledBy).toBe('')
  })

  it('writes an audit event and creates no user account', async () => {
    const { storage } = renderApp({ route: '/request-demo' })

    await screen.findByRole('button', { name: 'Submit request' })
    const userCountBefore = persisted(storage).users.length

    const user = await completeForm()
    await user.click(screen.getByRole('button', { name: 'Submit request' }))
    await screen.findByRole('heading', { name: 'Request received', level: 2 })

    await waitFor(() => {
      expect(persisted(storage).auditEvents[0]?.action).toBe('demo_request.submitted')
    })

    const state = persisted(storage)
    expect(state.auditEvents[0]?.entityType).toBe('DemoRequest')
    // Requesting a demo provisions nothing — accounts stay administrator-made.
    expect(state.users).toHaveLength(userCountBefore)
  })

  it('lets a visitor send a second request without reloading', async () => {
    const { storage } = renderApp({ route: '/request-demo' })

    await screen.findByRole('button', { name: 'Submit request' })
    const user = await completeForm()
    await user.click(screen.getByRole('button', { name: 'Submit request' }))
    await screen.findByRole('heading', { name: 'Request received', level: 2 })

    await user.click(screen.getByRole('button', { name: 'Submit another request' }))

    // A fresh form: nothing from the previous submission is carried over.
    expect(await screen.findByLabelText(/First name/i)).toHaveValue('')
    expect(screen.getByRole('checkbox', { name: /I agree/i })).not.toBeChecked()
    expect(persisted(storage).demoRequests).toHaveLength(1)
  })

  /*
   * The header's action buttons collapse at phone widths, so the mobile menu
   * has to carry the link or the page is unreachable on a phone.
   */
  it('is reachable from the mobile menu', async () => {
    renderApp({ route: '/' })

    await userEvent.click(await screen.findByRole('button', { name: 'Open navigation' }))

    const links = screen.getAllByRole('link', { name: 'Request demo' })
    expect(links.length).toBeGreaterThan(1)
    for (const link of links) expect(link).toHaveAttribute('href', '/request-demo')
  })

  it('does not highlight a navigation item it is not', async () => {
    renderApp({ route: '/request-demo' })

    const nav = await screen.findByRole('navigation', { name: 'Public website navigation' })
    for (const name of ['Home', 'Solutions', 'Product demo', 'About us']) {
      expect(within(nav).getByRole('link', { name })).not.toHaveAttribute('aria-current')
    }
  })
})

describe('demo requests in Website Administration', () => {
  it('shows a submitted request and records a status change', async () => {
    // Submit as a visitor first, then read it back as the Super Administrator.
    const { storage, unmount } = renderApp({ route: '/request-demo' })

    await screen.findByRole('button', { name: 'Submit request' })
    const visitor = await completeForm()
    await visitor.click(screen.getByRole('button', { name: 'Submit request' }))
    await screen.findByRole('heading', { name: 'Request received', level: 2 })
    await waitFor(() => {
      expect(persisted(storage).demoRequests).toHaveLength(1)
    })
    unmount()

    renderApp({ route: '/admin/site', signedInAs: SEEDED.superAdmin, storage })

    await userEvent.click(await screen.findByRole('button', { name: 'Demo requests' }))
    expect(await screen.findByText('Nino Beridze')).toBeInTheDocument()
    expect(screen.getByText(/Head of Risk · Example Bank/)).toBeInTheDocument()
    expect(screen.getByText('Georgia')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Contacted')

    await waitFor(() => {
      expect(persisted(storage).demoRequests[0].status).toBe('Contacted')
    })
    expect(persisted(storage).demoRequests[0].handledBy).toBe(SEEDED.superAdmin)
    expect(persisted(storage).auditEvents[0]?.action).toBe('demo_request.status_changed')
  })
})
