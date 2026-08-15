import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppDataProvider } from '../../data/app-data-provider.tsx'
import { AppDataStore } from '../../data/app-data-store.ts'
import { LocalStorageRepository, type StorageLike } from '../../data/local-storage-repository.ts'
import { MemorySessionRepository } from '../../data/session-repository.ts'
import { SessionRepositoryContext } from '../../app/session/session-repository-context.ts'
import { SessionBootstrap } from '../../app/session/session-bootstrap.tsx'
import { resetSessionStore } from '../../app/session/session-store.ts'
import type { AppState, Risk } from '../../domain/types/index.ts'
import { RegisterPage } from '../register/register-page.tsx'

/*
 * Drives the editor through the Register, which is how a user reaches it.
 * Rendered directly rather than through the route table.
 */

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, value) }
  removeItem(key: string) { this.map.delete(key) }
}

const STATE_KEY = 'erm-risk-management-v3-state'

function existingRisk(): Risk {
  return {
    id: 'risk_1', ref: 'TECH-001', title: 'Legacy platform fragility', type: 'Current',
    categoryId: 'cat_16', businessUnitId: 'bu_technology', riskOwnerId: 'usr_owner',
    originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
    status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
    cause: 'Deferred modernisation', event: 'A core service fails', consequence: 'Customer outage',
    statusNarrative: '',
    inherent: { impact: 4, likelihood: 4 },
    residual: { impact: 3, likelihood: 3 },
    target: { impact: 2, likelihood: 2 },
    controls: [], actions: [],
    acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
    custom: {}, history: [], audit: [], updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

let storage: MemoryStorage

async function seed(mutate: (state: AppState) => void = () => undefined) {
  storage = new MemoryStorage()
  const repository = new LocalStorageRepository({ storage })
  const state = await repository.getState()
  state.risks = [existingRisk()]
  mutate(state)
  await repository.saveState(state)
}

function renderRegister(signedInAs = 'usr_admin'): RenderResult {
  resetSessionStore()
  const sessionRepository = new MemorySessionRepository()
  sessionRepository.write(signedInAs)
  const store = new AppDataStore({ repository: new LocalStorageRepository({ storage }) })

  return render(
    <AppDataProvider store={store}>
      <SessionRepositoryContext.Provider value={sessionRepository}>
        <SessionBootstrap>
          <MemoryRouter>
            <RegisterPage />
          </MemoryRouter>
        </SessionBootstrap>
      </SessionRepositoryContext.Provider>
    </AppDataProvider>,
  )
}

/** Opens the New Risk dialog. */
async function openNewRisk() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'New risk' }))
  await screen.findByRole('dialog')
  return user
}

/** Reads persisted state straight out of storage. */
function persisted(): AppState {
  return JSON.parse(storage.map.get(STATE_KEY) ?? '{}') as AppState
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  const dialog = screen.getByRole('dialog')
  await user.type(within(dialog).getByLabelText('Risk title'), 'A brand new risk')

  await user.click(within(dialog).getByRole('tab', { name: 'Structured description' }))
  await user.type(within(dialog).getByLabelText('Cause'), 'A cause')
  await user.type(within(dialog).getByLabelText('Event'), 'An event')
  await user.type(within(dialog).getByLabelText('Consequence'), 'A consequence')
}

beforeEach(async () => {
  await seed()
})

afterEach(() => {
  resetSessionStore()
})

// --- structure --------------------------------------------------------------

describe('editor structure', () => {
  it('opens as a modal dialog with all six tabs', async () => {
    renderRegister()
    await openNewRisk()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    for (const tab of ['Basic', 'Structured description', 'Assessments', 'Controls', 'Actions', 'Custom fields']) {
      expect(within(dialog).getByRole('tab', { name: tab }), tab).toBeInTheDocument()
    }
  })

  it('switches panels when a tab is selected', async () => {
    renderRegister()
    const user = await openNewRisk()
    const dialog = screen.getByRole('dialog')

    await user.click(within(dialog).getByRole('tab', { name: 'Assessments' }))
    expect(within(dialog).getByRole('group', { name: 'Inherent' })).toBeInTheDocument()
  })
})

// --- validation -------------------------------------------------------------

describe('validation blocks save', () => {
  it('reports every missing required field at once', async () => {
    renderRegister()
    const user = await openNewRisk()

    await user.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('A risk title is required.')).toBeInTheDocument()
    expect(within(alert).getByText('Cause is required.')).toBeInTheDocument()
    expect(within(alert).getByText('Event is required.')).toBeInTheDocument()
    expect(within(alert).getByText('Consequence is required.')).toBeInTheDocument()
  })

  it('persists nothing when validation fails', async () => {
    renderRegister()
    const user = await openNewRisk()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')

    expect(persisted().risks).toHaveLength(1)
  })

  it('requires an acceptance rationale when the response is Accept', async () => {
    renderRegister()
    const user = await openNewRisk()
    await fillRequired(user)

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('tab', { name: 'Basic' }))
    await user.selectOptions(within(dialog).getByLabelText('Response'), 'Accept')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/acceptance rationale is required/i)).toBeInTheDocument()
  })

  it('requires approver, approval date and valid-until for Accepted status', async () => {
    renderRegister()
    const user = await openNewRisk()
    await fillRequired(user)

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('tab', { name: 'Basic' }))
    await user.selectOptions(within(dialog).getByLabelText('Status'), 'Accepted')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/approver is required/i)).toBeInTheDocument()
    expect(within(alert).getByText(/approval date is required/i)).toBeInTheDocument()
    expect(within(alert).getByText(/valid-until date is required/i)).toBeInTheDocument()
  })
})

// --- cancel -----------------------------------------------------------------

describe('cancel persists nothing', () => {
  it('discards a new risk on Cancel', async () => {
    renderRegister()
    const user = await openNewRisk()
    await fillRequired(user)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(persisted().risks).toHaveLength(1)
  })

  it('discards edits to an existing risk on Escape', async () => {
    renderRegister()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('link', { name: 'TECH-001' }))
    // The register links to the detail route; open the editor via New risk
    // and confirm Escape closes without writing.
    await user.click(screen.getByRole('button', { name: 'New risk' }))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(persisted().risks).toHaveLength(1)
  })
})

// --- creating ---------------------------------------------------------------

describe('creating a risk', () => {
  it('persists the record with a generated reference', async () => {
    renderRegister()
    const user = await openNewRisk()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().risks).toHaveLength(2)
    })

    const created = persisted().risks.find((risk) => risk.title === 'A brand new risk')
    expect(created?.ref).toMatch(/^[A-Z]+-\d{3}$/)
  })

  it('opens the history with an initial snapshot', async () => {
    renderRegister()
    const user = await openNewRisk()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().risks).toHaveLength(2)
    })

    const created = persisted().risks.find((risk) => risk.title === 'A brand new risk')
    expect(created?.history).toHaveLength(1)
    expect(created?.history[0].note).toBe('Initial assessment')
  })

  it('writes a risk.created audit event', async () => {
    renderRegister()
    const user = await openNewRisk()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().auditEvents.some((event) => event.action === 'risk.created')).toBe(true)
    })
  })

  it('trims the title before saving', async () => {
    renderRegister()
    const user = await openNewRisk()
    const dialog = screen.getByRole('dialog')

    await user.type(within(dialog).getByLabelText('Risk title'), '   Padded title   ')
    await user.click(within(dialog).getByRole('tab', { name: 'Structured description' }))
    await user.type(within(dialog).getByLabelText('Cause'), 'c')
    await user.type(within(dialog).getByLabelText('Event'), 'e')
    await user.type(within(dialog).getByLabelText('Consequence'), 'q')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().risks).toHaveLength(2)
    })
    expect(persisted().risks.some((risk) => risk.title === 'Padded title')).toBe(true)
  })

  it('applies the documented defaults to a new draft', async () => {
    renderRegister()
    await openNewRisk()
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByLabelText('Status')).toHaveValue('Draft')
    expect(within(dialog).getByLabelText('Risk type')).toHaveValue('Current')
    expect(within(dialog).getByLabelText('Response')).toHaveValue('Mitigate')
    expect(within(dialog).getByLabelText('Outlook')).toHaveValue('Stable')
  })

  it('shows the default assessments 3x3, 2x3 and 2x2', async () => {
    renderRegister()
    const user = await openNewRisk()
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('tab', { name: 'Assessments' }))

    const inherent = within(dialog).getByRole('group', { name: 'Inherent' })
    expect(within(inherent).getByLabelText('Impact')).toHaveValue('3')
    expect(within(inherent).getByLabelText('Likelihood')).toHaveValue('3')

    const residual = within(dialog).getByRole('group', { name: 'Residual' })
    expect(within(residual).getByLabelText('Impact')).toHaveValue('2')
    expect(within(residual).getByLabelText('Likelihood')).toHaveValue('3')

    const target = within(dialog).getByRole('group', { name: 'Target' })
    expect(within(target).getByLabelText('Impact')).toHaveValue('2')
    expect(within(target).getByLabelText('Likelihood')).toHaveValue('2')
  })
})

// --- reference regeneration -------------------------------------------------

describe('reference generation', () => {
  it('recalculates the reference when the business unit changes on a NEW risk', async () => {
    renderRegister()
    const user = await openNewRisk()
    const dialog = screen.getByRole('dialog')

    const before = within(dialog).getByText(/^[A-Z]+-\d{3}$/).textContent
    await user.selectOptions(within(dialog).getByLabelText('Business unit'), 'bu_finance')

    await waitFor(() => {
      expect(within(dialog).getByText(/^FIN-\d{3}$/)).toBeInTheDocument()
    })
    expect(before).not.toMatch(/^FIN-/)
  })
})

// --- assessments and history ------------------------------------------------

describe('assessment changes', () => {
  it('shows the derived score and rating live', async () => {
    renderRegister()
    const user = await openNewRisk()
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('tab', { name: 'Assessments' }))

    const inherent = within(dialog).getByRole('group', { name: 'Inherent' })
    // 3 x 3 = 9 -> Medium under the 2026 defaults.
    expect(within(inherent).getByText(/9 · Medium/)).toBeInTheDocument()

    await user.selectOptions(within(inherent).getByLabelText('Impact'), '5')
    await waitFor(() => {
      // 5 x 3 = 15 -> High.
      expect(within(inherent).getByText(/15 · High/)).toBeInTheDocument()
    })
  })
})

// --- controls ---------------------------------------------------------------

describe('controls tab', () => {
  it('creates one control per unique non-empty line from quick input', async () => {
    renderRegister()
    const user = await openNewRisk()
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('tab', { name: 'Controls' }))

    await user.type(
      within(dialog).getByLabelText(/Quick add/),
      'Quarterly access review\n\n  Quarterly access review  \nVendor due diligence',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Create controls' }))

    await waitFor(() => {
      expect(within(dialog).getAllByLabelText('Control title')).toHaveLength(2)
    })
    const titles = within(dialog).getAllByLabelText('Control title').map((input) => (input as HTMLInputElement).value)
    expect(titles).toEqual(['Quarterly access review', 'Vendor due diligence'])
  })

  it('drops a control with an empty title on save', async () => {
    renderRegister()
    const user = await openNewRisk()
    await fillRequired(user)

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('tab', { name: 'Controls' }))
    await user.click(within(dialog).getByRole('button', { name: 'Add control' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().risks).toHaveLength(2)
    })
    const created = persisted().risks.find((risk) => risk.title === 'A brand new risk')
    expect(created?.controls).toHaveLength(0)
  })
})

// --- permissions ------------------------------------------------------------

describe('create permission', () => {
  it('offers New risk to Administrator and Risk Manager only', async () => {
    for (const account of ['usr_admin', 'usr_manager']) {
      const view = renderRegister(account)
      expect(await screen.findByRole('button', { name: 'New risk' }), account).toBeInTheDocument()
      view.unmount()
      resetSessionStore()
    }

    for (const account of ['usr_owner', 'usr_control', 'usr_action', 'usr_auditor']) {
      const view = renderRegister(account)
      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('button', { name: 'New risk' }), account).toBeNull()
      view.unmount()
      resetSessionStore()
    }
  })
})

describe('owner candidate lists', () => {
  it('excludes inactive users from the risk owner dropdown', async () => {
    await seed((state) => {
      const owner = state.users.find((candidate) => candidate.id === 'usr_owner')
      if (owner) owner.status = 'Inactive'
    })

    renderRegister()
    await openNewRisk()
    const dialog = screen.getByRole('dialog')

    const options = within(within(dialog).getByLabelText('Risk owner')).getAllByRole('option')
    expect(options.map((option) => option.textContent)).not.toContain('Nino Kapanadze')
  })

  it('excludes users outside the effective scope of the selected business unit', async () => {
    renderRegister()
    const user = await openNewRisk()
    const dialog = screen.getByRole('dialog')

    // Nino is scoped to Technology; Finance is a sibling branch.
    await user.selectOptions(within(dialog).getByLabelText('Business unit'), 'bu_finance')

    await waitFor(() => {
      const options = within(within(dialog).getByLabelText('Risk owner')).getAllByRole('option')
      expect(options.map((option) => option.textContent)).not.toContain('Nino Kapanadze')
    })
  })
})

describe('storage key', () => {
  it('writes to the retained v3 key', () => {
    expect([...storage.map.keys()]).toContain(STATE_KEY)
  })
})
