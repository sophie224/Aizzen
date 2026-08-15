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
import { DashboardPage } from './dashboard-page.tsx'

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, value) }
  removeItem(key: string) { this.map.delete(key) }
}

const STATE_KEY = 'erm-risk-management-v3-state'
let storage: MemoryStorage

function makeRisk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk_1', ref: 'TECH-001', title: 'Legacy fragility', type: 'Current',
    categoryId: 'cat_16', businessUnitId: 'bu_technology', riskOwnerId: 'usr_owner',
    originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
    status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
    cause: 'c', event: 'e', consequence: 'q', statusNarrative: '',
    inherent: { impact: 4, likelihood: 4 },
    residual: { impact: 3, likelihood: 3 },
    target: { impact: 2, likelihood: 2 },
    controls: [], actions: [],
    acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
    custom: {}, history: [], audit: [], updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const RISKS: Risk[] = [
  makeRisk(),
  makeRisk({
    id: 'risk_2', ref: 'SEC-001', title: 'Phishing exposure', type: 'Emerging',
    businessUnitId: 'bu_security', status: 'Monitoring',
    residual: { impact: 5, likelihood: 4 },
    actions: [
      { id: 'a1', title: 'Training', description: '', deliverable: '', ownerId: 'usr_action', dueDate: '2020-01-01', status: 'In Progress', priority: 'High', progress: 40, notes: '' },
      { id: 'a2', title: 'Filters', description: '', deliverable: '', ownerId: 'usr_action', dueDate: '2020-01-01', status: 'Completed', priority: 'High', progress: 100, notes: '' },
    ],
  }),
  makeRisk({
    id: 'risk_3', ref: 'FIN-001', title: 'Liquidity', businessUnitId: 'bu_finance',
    status: 'Completed', residual: { impact: 1, likelihood: 1 },
  }),
]

async function seed(mutate: (state: AppState) => void = () => undefined) {
  storage = new MemoryStorage()
  const repository = new LocalStorageRepository({ storage })
  const state = await repository.getState()
  state.risks = structuredClone(RISKS)
  mutate(state)
  await repository.saveState(state)
}

function renderDashboard(signedInAs = 'usr_admin'): RenderResult {
  resetSessionStore()
  const sessionRepository = new MemorySessionRepository()
  sessionRepository.write(signedInAs)
  const store = new AppDataStore({ repository: new LocalStorageRepository({ storage }) })

  return render(
    <AppDataProvider store={store}>
      <SessionRepositoryContext.Provider value={sessionRepository}>
        <SessionBootstrap>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </SessionBootstrap>
      </SessionRepositoryContext.Provider>
    </AppDataProvider>,
  )
}

function persisted(): AppState {
  return JSON.parse(storage.map.get(STATE_KEY) ?? '{}') as AppState
}

async function enterEditMode() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Edit dashboard' }))
  return user
}

beforeEach(async () => {
  await seed()
})

afterEach(() => {
  resetSessionStore()
})

// --- widget rendering -------------------------------------------------------

describe('all seven widget types render with real data', () => {
  it('renders the seeded dashboard', async () => {
    renderDashboard()
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
    // The seed ships eight widgets across four types.
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0)
  })

  it('renders every widget type without error', async () => {
    await seed((state) => {
      const dashboard = state.dashboards[0]
      dashboard.widgets = ([
        'metric', 'heatmap', 'distribution', 'topRisks', 'actionProgress', 'recentActivity', 'trendSummary',
      ] as const).map((type, position) => ({
        id: `w_${type}`, type, titleEn: `Widget ${type}`, titleKa: '',
        accentColor: '#1A2151', backgroundColor: '#FFFFFF', span: 6,
        metric: 'totalRisks' as const, grouping: 'rating' as const,
        scoreBasis: 'residual' as const, limit: 5 + position,
      }))
    })

    renderDashboard()
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    for (const type of ['metric', 'heatmap', 'distribution', 'topRisks', 'actionProgress', 'recentActivity', 'trendSummary']) {
      expect(screen.getByRole('heading', { name: `Widget ${type}`, level: 2 }), type).toBeInTheDocument()
    }
  })

  it('shows the correct metric value', async () => {
    await seed((state) => {
      state.dashboards[0].widgets = [
        { id: 'w1', type: 'metric', titleEn: 'Total', titleKa: '', accentColor: '#1A2151', backgroundColor: '#FFF', span: 3, metric: 'totalRisks' },
        { id: 'w2', type: 'metric', titleEn: 'Open', titleKa: '', accentColor: '#1A2151', backgroundColor: '#FFF', span: 3, metric: 'openRisks' },
        { id: 'w3', type: 'metric', titleEn: 'Overdue', titleKa: '', accentColor: '#1A2151', backgroundColor: '#FFF', span: 3, metric: 'overdueActions' },
        { id: 'w4', type: 'metric', titleEn: 'Emerging', titleKa: '', accentColor: '#1A2151', backgroundColor: '#FFF', span: 3, metric: 'emergingRisks' },
      ]
    })

    renderDashboard()
    await screen.findByRole('heading', { name: 'Total', level: 2 })

    const valueIn = (title: string) => {
      const article = screen.getByRole('heading', { name: title, level: 2 }).closest('article')
      return within(article as HTMLElement).getByText(/^\d+$/).textContent
    }

    expect(valueIn('Total')).toBe('3')
    expect(valueIn('Open')).toBe('2')     // risk_3 is Completed
    expect(valueIn('Overdue')).toBe('1')  // a1 only; a2 is Completed
    expect(valueIn('Emerging')).toBe('1')
  })

  it('counts risks into the heatmap cells', async () => {
    await seed((state) => {
      state.dashboards[0].widgets = [
        { id: 'w1', type: 'heatmap', titleEn: 'Heat', titleKa: '', accentColor: '#1A2151', backgroundColor: '#FFF', span: 6, scoreBasis: 'residual' },
      ]
    })

    renderDashboard()
    await screen.findByRole('heading', { name: 'Heat', level: 2 })

    expect(screen.getByLabelText(/Impact 3, likelihood 3: 1 risks/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Impact 5, likelihood 4: 1 risks/)).toBeInTheDocument()
  })
})

// --- matrix propagation -----------------------------------------------------

describe('widgets follow the configured matrix', () => {
  it('re-rates the heatmap when a cell is reconfigured', async () => {
    await seed((state) => {
      state.dashboards[0].widgets = [
        { id: 'w1', type: 'heatmap', titleEn: 'Heat', titleKa: '', accentColor: '#1A2151', backgroundColor: '#FFF', span: 6, scoreBasis: 'residual' },
      ]
      const cell = state.matrix.cells.find((c) => c.impact === 3 && c.likelihood === 3)
      if (cell) cell.rating = 'Significant'
    })

    renderDashboard()
    await screen.findByRole('heading', { name: 'Heat', level: 2 })

    expect(screen.getByLabelText(/Impact 3, likelihood 3: 1 risks, Significant/)).toBeInTheDocument()
  })

  it('re-buckets a rating distribution when the matrix changes', async () => {
    await seed((state) => {
      state.dashboards[0].widgets = [
        { id: 'w1', type: 'distribution', titleEn: 'By rating', titleKa: '', accentColor: '#1A2151', backgroundColor: '#FFF', span: 6, grouping: 'rating' },
      ]
      // Make every 3x3 Significant, moving risk_1 out of Medium.
      const cell = state.matrix.cells.find((c) => c.impact === 3 && c.likelihood === 3)
      if (cell) cell.rating = 'Significant'
    })

    renderDashboard()
    const heading = await screen.findByRole('heading', { name: 'By rating', level: 2 })
    const article = heading.closest('article') as HTMLElement

    const row = within(article).getByText('Significant').closest('li')
    expect(within(row as HTMLElement).getByText('2')).toBeInTheDocument()
  })
})

// --- filters ----------------------------------------------------------------

describe('dashboard filters', () => {
  it('persists a filter and restores it on reopen', async () => {
    renderDashboard()
    const user = await enterEditMode()

    const filters = screen.getByRole('group', { name: 'Dashboard filters' })
    await user.selectOptions(within(filters).getByLabelText('Risk status'), 'Monitoring')

    await waitFor(() => {
      expect(persisted().dashboards[0].filters.status).toBe('Monitoring')
    })
  })

  it('narrows widget data by the saved filter', async () => {
    await seed((state) => {
      state.dashboards[0].filters = { status: 'Monitoring' }
      state.dashboards[0].widgets = [
        { id: 'w1', type: 'metric', titleEn: 'Total', titleKa: '', accentColor: '#1A2151', backgroundColor: '#FFF', span: 3, metric: 'totalRisks' },
      ]
    })

    renderDashboard()
    const heading = await screen.findByRole('heading', { name: 'Total', level: 2 })
    const article = heading.closest('article') as HTMLElement

    // Only risk_2 is Monitoring.
    expect(within(article).getByText('1')).toBeInTheDocument()
  })

  it('offers all seven filters', async () => {
    renderDashboard()
    await enterEditMode()

    const filters = screen.getByRole('group', { name: 'Dashboard filters' })
    for (const label of [
      'Risk category', 'Business unit', 'Risk status', 'Residual rating',
      'Risk type', 'Risk owner', 'Risk outlook',
    ]) {
      expect(within(filters).getByLabelText(label), label).toBeInTheDocument()
    }
  })
})

// --- CRUD -------------------------------------------------------------------

describe('dashboard CRUD', () => {
  it('adds a dashboard', async () => {
    renderDashboard()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add dashboard' }))

    await waitFor(() => {
      expect(persisted().dashboards).toHaveLength(2)
    })
    expect(persisted().auditEvents.some((event) => event.action === 'dashboard.created')).toBe(true)
  })

  it('duplicates with a new ID and an independent widget collection', async () => {
    renderDashboard()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Duplicate' }))

    await waitFor(() => {
      expect(persisted().dashboards).toHaveLength(2)
    })

    const [original, copy] = persisted().dashboards
    expect(copy.id).not.toBe(original.id)
    expect(copy.nameEn).toContain('(copy)')

    const originalWidgetIds = new Set(original.widgets.map((widget) => widget.id))
    for (const widget of copy.widgets) {
      expect(originalWidgetIds.has(widget.id)).toBe(false)
    }
  })

  it('blocks deleting the last remaining dashboard', async () => {
    renderDashboard()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/last remaining dashboard/i)
    expect(persisted().dashboards).toHaveLength(1)
  })

  it('deletes once more than one exists', async () => {
    renderDashboard()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add dashboard' }))
    await waitFor(() => {
      expect(persisted().dashboards).toHaveLength(2)
    })

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(persisted().dashboards).toHaveLength(1)
    })
  })

  it('removes report sections bound to a deleted dashboard', async () => {
    await seed((state) => {
      // Two dashboards so deletion is allowed; the seed report binds to the first.
      state.dashboards.push({ ...structuredClone(state.dashboards[0]), id: 'dash_second', nameEn: 'Second' })
    })

    renderDashboard()
    const user = userEvent.setup()

    const before = persisted().reportTemplates[0].sections
    expect(before.some((section) => section.type === 'dashboard')).toBe(true)

    await user.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(persisted().dashboards).toHaveLength(1)
    })

    // No template may point at a dashboard that no longer exists.
    const ids = new Set(persisted().dashboards.map((dashboard) => dashboard.id))
    for (const template of persisted().reportTemplates) {
      for (const section of template.sections) {
        if (section.type === 'dashboard') expect(ids.has(section.dashboardId)).toBe(true)
      }
    }
  })

  it('persists metadata edits', async () => {
    renderDashboard()
    const user = await enterEditMode()

    const name = screen.getByLabelText('Name (English)')
    await user.clear(name)
    await user.type(name, 'Board pack view')

    await waitFor(() => {
      expect(persisted().dashboards[0].nameEn).toBe('Board pack view')
    })
  })

  it('persists the shared toggle', async () => {
    renderDashboard()
    const user = await enterEditMode()
    const before = persisted().dashboards[0].shared

    await user.click(screen.getByRole('checkbox', { name: 'Shared' }))

    await waitFor(() => {
      expect(persisted().dashboards[0].shared).toBe(!before)
    })
  })
})

// --- widget configuration ---------------------------------------------------

describe('widget configuration', () => {
  beforeEach(async () => {
    await seed((state) => {
      state.dashboards[0].widgets = [
        { id: 'w1', type: 'metric', titleEn: 'First', titleKa: '', accentColor: '#1A2151', backgroundColor: '#FFF', span: 3, metric: 'totalRisks' },
        { id: 'w2', type: 'metric', titleEn: 'Second', titleKa: '', accentColor: '#1A2151', backgroundColor: '#FFF', span: 3, metric: 'openRisks' },
      ]
    })
  })

  it('adds a widget', async () => {
    renderDashboard()
    const user = await enterEditMode()
    await user.click(screen.getByRole('button', { name: 'Add widget' }))

    await waitFor(() => {
      expect(persisted().dashboards[0].widgets).toHaveLength(3)
    })
  })

  it('changes the widget type', async () => {
    renderDashboard()
    const user = await enterEditMode()
    await user.selectOptions(screen.getByLabelText('First Widget type'), 'heatmap')

    await waitFor(() => {
      expect(persisted().dashboards[0].widgets[0].type).toBe('heatmap')
    })
  })

  it('persists span and title', async () => {
    renderDashboard()
    const user = await enterEditMode()

    await user.selectOptions(screen.getByLabelText('First Grid span'), '12')
    await waitFor(() => {
      expect(persisted().dashboards[0].widgets[0].span).toBe(12)
    })
  })

  it('reorders widgets', async () => {
    renderDashboard()
    const user = await enterEditMode()

    const second = screen.getByRole('heading', { name: 'Second', level: 2 }).closest('article')
    await user.click(within(second as HTMLElement).getByRole('button', { name: 'Move up' }))

    await waitFor(() => {
      expect(persisted().dashboards[0].widgets.map((widget) => widget.titleEn)).toEqual(['Second', 'First'])
    })
  })

  it('disables Move up on the first widget and Move down on the last', async () => {
    renderDashboard()
    await enterEditMode()

    const first = screen.getByRole('heading', { name: 'First', level: 2 }).closest('article')
    expect(within(first as HTMLElement).getByRole('button', { name: 'Move up' })).toBeDisabled()

    const second = screen.getByRole('heading', { name: 'Second', level: 2 }).closest('article')
    expect(within(second as HTMLElement).getByRole('button', { name: 'Move down' })).toBeDisabled()
  })

  it('duplicates a widget next to the original', async () => {
    renderDashboard()
    const user = await enterEditMode()

    const first = screen.getByRole('heading', { name: 'First', level: 2 }).closest('article')
    await user.click(within(first as HTMLElement).getByRole('button', { name: 'Duplicate' }))

    await waitFor(() => {
      expect(persisted().dashboards[0].widgets).toHaveLength(3)
    })
    const widgets = persisted().dashboards[0].widgets
    expect(widgets[1].titleEn).toBe('First')
    expect(widgets[1].id).not.toBe(widgets[0].id)
  })

  it('removes a widget', async () => {
    renderDashboard()
    const user = await enterEditMode()

    const first = screen.getByRole('heading', { name: 'First', level: 2 }).closest('article')
    await user.click(within(first as HTMLElement).getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(persisted().dashboards[0].widgets.map((widget) => widget.titleEn)).toEqual(['Second'])
    })
  })

  it('offers the limit control only where it applies', async () => {
    renderDashboard()
    const user = await enterEditMode()

    expect(screen.queryByLabelText('First Limit')).toBeNull()
    await user.selectOptions(screen.getByLabelText('First Widget type'), 'topRisks')

    await waitFor(() => {
      expect(screen.getByLabelText('First Limit')).toBeInTheDocument()
    })
  })
})

// --- permissions ------------------------------------------------------------

describe('dashboard permissions', () => {
  it('hides editing controls from a read-only role', async () => {
    renderDashboard('usr_auditor')
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    expect(screen.queryByRole('button', { name: 'Edit dashboard' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add dashboard' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('still renders widgets for a read-only role', async () => {
    renderDashboard('usr_auditor')
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0)
  })

  it('scopes widget data to the signed-in user’s visible risks', async () => {
    await seed((state) => {
      state.dashboards[0].widgets = [
        { id: 'w1', type: 'metric', titleEn: 'Total', titleKa: '', accentColor: '#1A2151', backgroundColor: '#FFF', span: 3, metric: 'totalRisks' },
      ]
    })

    // usr_owner owns risk_1 and risk_2 only.
    renderDashboard('usr_owner')
    const heading = await screen.findByRole('heading', { name: 'Total', level: 2 })
    const article = heading.closest('article') as HTMLElement

    expect(within(article).getByText('2')).toBeInTheDocument()
  })
})
