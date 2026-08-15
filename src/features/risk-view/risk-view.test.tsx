import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppDataProvider } from '../../data/app-data-provider.tsx'
import { AppDataStore } from '../../data/app-data-store.ts'
import { LocalStorageRepository, type StorageLike } from '../../data/local-storage-repository.ts'
import { MemorySessionRepository } from '../../data/session-repository.ts'
import { SessionRepositoryContext } from '../../app/session/session-repository-context.ts'
import { SessionBootstrap } from '../../app/session/session-bootstrap.tsx'
import { resetSessionStore } from '../../app/session/session-store.ts'
import type { AppState, Risk } from '../../domain/types/index.ts'
import { RiskViewPage } from './risk-view-page.tsx'

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, value) }
  removeItem(key: string) { this.map.delete(key) }
}

/** Fully populated: controls, actions, history, audit, acceptance. */
function fullRisk(): Risk {
  return {
    id: 'risk_full', ref: 'TECH-001', title: 'Legacy platform fragility', type: 'Current',
    categoryId: 'cat_16', businessUnitId: 'bu_security', riskOwnerId: 'usr_owner',
    originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
    status: 'In Progress', responseType: 'Mitigate', outlook: 'Decreasing',
    cause: 'Deferred modernisation', event: 'A core service fails', consequence: 'Customer outage',
    statusNarrative: 'Remediation underway.',
    inherent: { impact: 4, likelihood: 4 },
    residual: { impact: 3, likelihood: 3 },
    target: { impact: 2, likelihood: 2 },
    controls: [{
      id: 'ctrl_1', title: 'Authenticated vulnerability scanning', ownerId: 'usr_control',
      performer: 'Security Operations', description: 'Weekly authenticated scans.',
      frequency: 'Weekly', intendedOutcome: 'Early detection', evidenceLocation: 'Vuln platform',
      keyControl: true, type: 'Detective', automation: 'Automated', status: 'Effective',
    }],
    actions: [{
      id: 'act_1', title: 'Patch cycle rollout', description: 'Roll out quarterly patching.',
      deliverable: 'Approved patch standard', ownerId: 'usr_action', dueDate: '2020-01-01',
      status: 'In Progress', priority: 'High', progress: 45, notes: 'Blocked on migration.',
    }],
    acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
    custom: {},
    history: [
      { id: 'h1', date: '2026-01-01', inherent: { impact: 4, likelihood: 4 }, residual: { impact: 4, likelihood: 4 }, target: { impact: 2, likelihood: 2 }, note: 'Initial assessment', actorId: 'usr_owner' },
      { id: 'h2', date: '2026-06-01', inherent: { impact: 4, likelihood: 4 }, residual: { impact: 3, likelihood: 3 }, target: { impact: 2, likelihood: 2 }, note: 'Assessment updated', actorId: 'usr_owner' },
    ],
    audit: [{
      id: 'aud_1', date: '2026-06-01T10:00:00.000Z', actorId: 'usr_owner', action: 'risk.updated',
      entityType: 'Risk', entityId: 'risk_full', summary: 'TECH-001 Legacy platform fragility',
      changes: ['Residual: 16 → 9'],
    }],
    updatedAt: '2026-06-01T10:00:00.000Z',
  }
}

/** No controls, no actions, no history, no audit. */
function minimalRisk(): Risk {
  return {
    ...fullRisk(),
    id: 'risk_min', ref: 'FIN-001', title: 'Liquidity headroom',
    businessUnitId: 'bu_finance', riskOwnerId: 'usr_manager',
    statusNarrative: '',
    controls: [], actions: [], history: [], audit: [],
  }
}

let storage: MemoryStorage

async function seed(mutate: (state: AppState) => void = () => undefined) {
  storage = new MemoryStorage()
  const repository = new LocalStorageRepository({ storage })
  const state = await repository.getState()
  state.risks = [fullRisk(), minimalRisk()]
  mutate(state)
  await repository.saveState(state)
}

function renderView(riskId: string, signedInAs = 'usr_admin'): RenderResult {
  resetSessionStore()
  const sessionRepository = new MemorySessionRepository()
  sessionRepository.write(signedInAs)
  const store = new AppDataStore({ repository: new LocalStorageRepository({ storage }) })

  return render(
    <AppDataProvider store={store}>
      <SessionRepositoryContext.Provider value={sessionRepository}>
        <SessionBootstrap>
          <MemoryRouter initialEntries={[`/app/risks/${riskId}`]}>
            <Routes>
              <Route path="/app/risks/:riskId" element={<RiskViewPage />} />
              <Route path="/app/register" element={<p>Register</p>} />
            </Routes>
          </MemoryRouter>
        </SessionBootstrap>
      </SessionRepositoryContext.Provider>
    </AppDataProvider>,
  )
}

/** The header band, scoped so its values are not confused with tab content. */
function header(): HTMLElement {
  const heading = screen.getByRole('heading', { level: 1 })
  const element = heading.closest('header')
  if (!element) throw new Error('header band not found')
  return element
}

async function openTab(name: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('tab', { name }))
  return user
}

beforeEach(async () => {
  await seed()
})

afterEach(() => {
  resetSessionStore()
})

// --- header -----------------------------------------------------------------

describe('header band', () => {
  it('shows reference, title, category, business unit path, owner and status', async () => {
    renderView('risk_full')
    await screen.findByRole('heading', { name: 'Legacy platform fragility', level: 1 })

    expect(screen.getByText('TECH-001')).toBeInTheDocument()
    expect(screen.getByText(/Data Governance/)).toBeInTheDocument()
    // Full hierarchy path, not just the leaf name.
    expect(screen.getByText(/Enterprise \/ Technology Division \/ Information Security/)).toBeInTheDocument()
    expect(within(header()).getByText('Nino Kapanadze')).toBeInTheDocument()
    expect(within(header()).getByText('In Progress')).toBeInTheDocument()
    expect(within(header()).getByText('2026-07-01')).toBeInTheDocument()
  })

  it('shows action-owner context', async () => {
    renderView('risk_full')
    await screen.findByRole('heading', { level: 1 })
    expect(within(header()).getByText('Mariam Lomidze')).toBeInTheDocument()
  })

  it('says so when no action owners are assigned', async () => {
    renderView('risk_min')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('None assigned')).toBeInTheDocument()
  })

  it('shows all three scores as equal-sized chips', async () => {
    renderView('risk_full')
    await screen.findByRole('heading', { level: 1 })

    expect(screen.getByLabelText(/Inherent: .*score 16, impact 4 by likelihood 4/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Residual: .*score 9, impact 3 by likelihood 3/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Target: .*score 4, impact 2 by likelihood 2/)).toBeInTheDocument()
  })
})

// --- tabs -------------------------------------------------------------------

describe('all five tabs', () => {
  const TABS = ['Overview', 'Assessment', 'Controls', 'Actions', 'Trend & audit']

  it('renders every tab for a fully populated risk', async () => {
    renderView('risk_full')
    await screen.findByRole('heading', { level: 1 })

    for (const tab of TABS) {
      expect(screen.getByRole('tab', { name: tab }), tab).toBeInTheDocument()
    }
  })

  it('renders every tab for a minimal risk without crashing', async () => {
    renderView('risk_min')
    await screen.findByRole('heading', { level: 1 })

    for (const tab of TABS) {
      const user = userEvent.setup()
      await user.click(screen.getByRole('tab', { name: tab }))
      expect(screen.getByRole('tabpanel'), tab).toBeInTheDocument()
    }
  })

  it('shows empty states rather than blank panels on a minimal risk', async () => {
    renderView('risk_min')
    await screen.findByRole('heading', { level: 1 })

    await openTab('Controls')
    expect(screen.getByText('No controls recorded.')).toBeInTheDocument()

    await openTab('Actions')
    expect(screen.getByText('No remediation actions recorded.')).toBeInTheDocument()

    await openTab('Trend & audit')
    expect(screen.getByText('No audit events recorded for this risk.')).toBeInTheDocument()
  })
})

// --- overview ---------------------------------------------------------------

describe('overview tab', () => {
  it('shows cause, event and consequence as separate cards', async () => {
    renderView('risk_full')
    await screen.findByRole('heading', { level: 1 })

    expect(screen.getByRole('heading', { name: 'Cause', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Deferred modernisation')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Event', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Consequence', level: 2 })).toBeInTheDocument()
  })

  it('shows the action table with the six required columns', async () => {
    renderView('risk_full')
    await screen.findByRole('heading', { level: 1 })

    const table = screen.getAllByRole('table').find((candidate) =>
      within(candidate).queryByText('Patch cycle rollout') !== null,
    )
    expect(table).toBeDefined()
    if (!table) return

    for (const column of ['Action title', 'Description', 'Deliverable', 'Status', 'Deadline', 'Action owner']) {
      expect(within(table).getByRole('columnheader', { name: column }), column).toBeInTheDocument()
    }
  })

  it('marks an overdue action', async () => {
    renderView('risk_full')
    await screen.findByRole('heading', { level: 1 })
    // Due 2020-01-01 and not Completed.
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0)
  })
})

// --- the three indicators ---------------------------------------------------

describe('trend, direction and outlook are three separate indicators', () => {
  it('shows all three with distinct values', async () => {
    renderView('risk_full')
    await screen.findByRole('heading', { level: 1 })

    // Residual fell 16 -> 9 across the two snapshots.
    const trend = screen.getByRole('heading', { name: 'Historical trend', level: 2 }).parentElement
    expect(within(trend as HTMLElement).getByText('Improving')).toBeInTheDocument()

    // Target 4 < residual 9.
    const direction = screen.getByRole('heading', { name: 'Direction to target', level: 2 }).parentElement
    expect(within(direction as HTMLElement).getByText('Decreasing toward target')).toBeInTheDocument()

    // Stored outlook, untouched by the computed trend.
    const outlook = screen.getByRole('heading', { name: '12-month outlook', level: 2 }).parentElement
    expect(within(outlook as HTMLElement).getByText('Decreasing')).toBeInTheDocument()
  })

  it('never lets the computed trend overwrite the manual outlook', async () => {
    // Stored outlook says Increasing while the history shows improvement.
    await seed((state) => {
      const risk = state.risks.find((candidate) => candidate.id === 'risk_full')
      if (risk) risk.outlook = 'Increasing'
    })

    renderView('risk_full')
    await screen.findByRole('heading', { level: 1 })

    const trend = screen.getByRole('heading', { name: 'Historical trend', level: 2 }).parentElement
    expect(within(trend as HTMLElement).getByText('Improving')).toBeInTheDocument()

    const outlook = screen.getByRole('heading', { name: '12-month outlook', level: 2 }).parentElement
    expect(within(outlook as HTMLElement).getByText('Increasing')).toBeInTheDocument()
  })

  it('reports New when there are fewer than two snapshots', async () => {
    renderView('risk_min')
    await screen.findByRole('heading', { level: 1 })

    const trend = screen.getByRole('heading', { name: 'Historical trend', level: 2 }).parentElement
    expect(within(trend as HTMLElement).getByText('New')).toBeInTheDocument()
  })
})

// --- acceptance -------------------------------------------------------------

describe('acceptance summary', () => {
  it('is hidden when the response is not Accept', async () => {
    renderView('risk_full')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('heading', { name: 'Risk acceptance' })).toBeNull()
  })

  it('appears when the response is Accept', async () => {
    await seed((state) => {
      const risk = state.risks.find((candidate) => candidate.id === 'risk_full')
      if (risk) {
        risk.responseType = 'Accept'
        risk.acceptance = {
          rationale: 'Within appetite', initiatorId: 'usr_owner', approverId: 'usr_admin',
          approvalDate: '2026-02-01', validUntil: '2026-08-01', reviewDate: '2026-05-01',
        }
      }
    })

    renderView('risk_full')
    await screen.findByRole('heading', { level: 1 })

    expect(screen.getByRole('heading', { name: 'Risk acceptance', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Within appetite')).toBeInTheDocument()
    expect(screen.getByText('2026-08-01')).toBeInTheDocument()
  })
})

// --- assessment tab ---------------------------------------------------------

describe('assessment tab', () => {
  it('renders three matrices with the correct cell selected', async () => {
    renderView('risk_full')
    await openTab('Assessment')

    const inherent = screen.getByRole('table', { name: /Inherent assessment matrix/ })
    expect(within(inherent).getByLabelText(/Impact 4, Likelihood 4:.*Selected cell/)).toBeInTheDocument()

    const residual = screen.getByRole('table', { name: /Residual assessment matrix/ })
    expect(within(residual).getByLabelText(/Impact 3, Likelihood 3:.*Selected cell/)).toBeInTheDocument()

    const target = screen.getByRole('table', { name: /Target assessment matrix/ })
    expect(within(target).getByLabelText(/Impact 2, Likelihood 2:.*Selected cell/)).toBeInTheDocument()
  })

  it('marks exactly one selected cell per matrix', async () => {
    renderView('risk_full')
    await openTab('Assessment')

    const residual = screen.getByRole('table', { name: /Residual assessment matrix/ })
    const selected = within(residual).getAllByLabelText(/Selected cell/)
    expect(selected).toHaveLength(1)
  })

  it('derives each cell rating from the configured matrix', async () => {
    await seed((state) => {
      const cell = state.matrix.cells.find((c) => c.impact === 3 && c.likelihood === 3)
      if (cell) cell.rating = 'Significant'
    })

    renderView('risk_full')
    await openTab('Assessment')

    const residual = screen.getByRole('table', { name: /Residual assessment matrix/ })
    expect(within(residual).getByLabelText(/Impact 3, Likelihood 3: Significant/)).toBeInTheDocument()
  })

  it('shows the assessment history table', async () => {
    renderView('risk_full')
    await openTab('Assessment')

    expect(screen.getByRole('heading', { name: 'Assessment history', level: 2 })).toBeInTheDocument()
    expect(screen.getAllByText('Initial assessment').length).toBeGreaterThan(0)
  })

  it('renders the residual trend chart with an accessible description', async () => {
    renderView('risk_full')
    await openTab('Assessment')

    // Two snapshots: 16 then 9.
    expect(screen.getByRole('img', { name: /2026-01-01 16, 2026-06-01 9/ })).toBeInTheDocument()
  })
})

// --- controls and actions tabs ----------------------------------------------

describe('controls tab', () => {
  it('shows owner, effectiveness, type, frequency and evidence', async () => {
    renderView('risk_full')
    await openTab('Controls')

    expect(screen.getByRole('heading', { name: 'Authenticated vulnerability scanning', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Giorgi Maisuradze')).toBeInTheDocument()
    expect(screen.getByText('Effective')).toBeInTheDocument()
    expect(screen.getByText('Weekly')).toBeInTheDocument()
    expect(screen.getByText('Vuln platform')).toBeInTheDocument()
    expect(screen.getByText('Detective · Automated')).toBeInTheDocument()
  })
})

describe('actions tab', () => {
  it('shows progress, deadline, owner and notes', async () => {
    renderView('risk_full')
    await openTab('Actions')

    expect(screen.getByRole('heading', { name: 'Patch cycle rollout', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Approved patch standard')).toBeInTheDocument()
    expect(screen.getByText(/45%/)).toBeInTheDocument()
    expect(screen.getByText('Blocked on migration.')).toBeInTheDocument()
  })
})

// --- trend & audit ----------------------------------------------------------

describe('trend and audit tab', () => {
  it('lists risk-specific audit events with actor, timestamp, summary and changes', async () => {
    renderView('risk_full')
    await openTab('Trend & audit')

    expect(screen.getByRole('heading', { name: 'Audit trail', level: 2 })).toBeInTheDocument()
    const auditTable = screen.getAllByRole('table').find((candidate) =>
      within(candidate).queryByText('risk.updated') !== null,
    )
    expect(auditTable).toBeDefined()
    if (!auditTable) return

    expect(within(auditTable).getByText('2026-06-01T10:00:00.000Z')).toBeInTheDocument()
    expect(within(auditTable).getByText('Nino Kapanadze')).toBeInTheDocument()
    expect(within(auditTable).getByText('Residual: 16 → 9')).toBeInTheDocument()
  })

  it('lists events newest first', async () => {
    await seed((state) => {
      const risk = state.risks.find((candidate) => candidate.id === 'risk_full')
      if (risk) {
        risk.audit = [
          { id: 'a2', date: '2026-07-01T10:00:00.000Z', actorId: 'usr_owner', action: 'risk.updated', entityType: 'Risk', entityId: 'risk_full', summary: 'newer' },
          { id: 'a1', date: '2026-01-01T10:00:00.000Z', actorId: 'usr_owner', action: 'risk.created', entityType: 'Risk', entityId: 'risk_full', summary: 'older' },
        ]
      }
    })

    renderView('risk_full')
    await openTab('Trend & audit')

    // The tab also renders the trend chart's data table, so scope to the
    // audit table rather than taking rows from the whole panel.
    const auditTable = screen.getAllByRole('table').find((candidate) =>
      within(candidate).queryByText('risk.created') !== null,
    )
    expect(auditTable).toBeDefined()
    if (!auditTable) return

    const rows = within(auditTable).getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('newer')).toBeInTheDocument()
    expect(within(rows[1]).getByText('older')).toBeInTheDocument()
  })
})

// --- visibility -------------------------------------------------------------

describe('record-level visibility', () => {
  it('shows not-found for a risk that does not exist', async () => {
    renderView('risk_nope')
    expect(await screen.findByRole('heading', { name: 'Risk not available', level: 1 })).toBeInTheDocument()
  })

  it('shows the same not-found for a risk outside the user’s scope', async () => {
    // usr_owner owns risk_full but not risk_min.
    renderView('risk_min', 'usr_owner')
    expect(await screen.findByRole('heading', { name: 'Risk not available', level: 1 })).toBeInTheDocument()
  })

  it('does not reveal that a hidden risk exists', async () => {
    const hidden = renderView('risk_min', 'usr_owner')
    const hiddenText = (await screen.findByRole('heading', { level: 1 })).textContent
    hidden.unmount()
    resetSessionStore()

    renderView('risk_nope', 'usr_owner')
    const missingText = (await screen.findByRole('heading', { level: 1 })).textContent

    expect(hiddenText).toBe(missingText)
  })

  it('lets a visible risk through for its owner', async () => {
    renderView('risk_full', 'usr_owner')
    expect(await screen.findByRole('heading', { name: 'Legacy platform fragility', level: 1 })).toBeInTheDocument()
  })
})

// --- edit entry point -------------------------------------------------------

describe('edit entry point', () => {
  it('offers Edit risk to a user who may edit', async () => {
    renderView('risk_full')
    expect(await screen.findByRole('button', { name: 'Edit risk' })).toBeInTheDocument()
  })

  it('hides Edit risk from an auditor', async () => {
    renderView('risk_full', 'usr_auditor')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('button', { name: 'Edit risk' })).toBeNull()
  })

  it('opens the editor pre-filled with the existing record', async () => {
    renderView('risk_full')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit risk' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Risk title')).toHaveValue('Legacy platform fragility')
  })

  it('closes the editor on Cancel without persisting', async () => {
    renderView('risk_full')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Edit risk' }))
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    const persisted = JSON.parse(storage.map.get('erm-risk-management-v3-state') ?? '{}') as AppState
    expect(persisted.risks.find((risk) => risk.id === 'risk_full')?.title).toBe('Legacy platform fragility')
  })
})
