import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AppDataProvider } from '../../data/app-data-provider.tsx'
import { AppDataStore } from '../../data/app-data-store.ts'
import { LocalStorageRepository, type StorageLike } from '../../data/local-storage-repository.ts'
import { MemorySessionRepository } from '../../data/session-repository.ts'
import { SessionRepositoryContext } from '../../app/session/session-repository-context.ts'
import { SessionBootstrap } from '../../app/session/session-bootstrap.tsx'
import { resetSessionStore, useSessionStore } from '../../app/session/session-store.ts'
import type { AppState, Risk } from '../../domain/types/index.ts'
import { RegisterPage } from '../register/register-page.tsx'
import { AnalyticsDashboard } from './analytics-dashboard.tsx'

/*
 * Dashboard module (CR-004).
 *
 * Drives the real page: widgets over the seeded register, drill-through into
 * the Register, URL-encoded filters and the configured matrix vocabulary.
 */

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, value) }
  removeItem(key: string) { this.map.delete(key) }
}

const STATE_KEY = 'erm-risk-management-v3-state'

function makeRisk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk_1', ref: 'TECH-001', title: 'Legacy platform fragility', type: 'Current',
    categoryId: 'cat_16', businessUnitId: 'bu_technology', riskOwnerId: 'usr_owner',
    originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
    status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
    description: '', cause: 'c', event: 'e', consequence: 'q', statusNarrative: '',
    inherent: { impact: 5, likelihood: 5 },
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
    id: 'risk_2', ref: 'SEC-001', title: 'Phishing exposure',
    businessUnitId: 'bu_security', status: 'Monitoring',
    residual: { impact: 5, likelihood: 5 },
  }),
  makeRisk({
    id: 'risk_3', ref: 'FIN-001', title: 'Liquidity headroom',
    businessUnitId: 'bu_finance', riskOwnerId: 'usr_manager', status: 'Completed',
    // Points at a category that no longer exists — an Unassigned bucket case.
    categoryId: 'cat_removed', residual: { impact: 1, likelihood: 1 },
  }),
]

let storage: MemoryStorage

async function seed(mutate: (state: AppState) => void = () => undefined) {
  storage = new MemoryStorage()
  const repository = new LocalStorageRepository({ storage })
  const state = await repository.getState()
  state.risks = structuredClone(RISKS)
  mutate(state)
  await repository.saveState(state)
}

/** Reports the current URL so the filter-state assertions can read it. */
function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>
}

function renderDashboard(signedInAs = 'usr_admin', route = '/app/dashboard'): RenderResult {
  resetSessionStore()
  const sessionRepository = new MemorySessionRepository()
  sessionRepository.write(signedInAs)
  const store = new AppDataStore({ repository: new LocalStorageRepository({ storage }) })

  return render(
    <AppDataProvider store={store}>
      <SessionRepositoryContext.Provider value={sessionRepository}>
        <SessionBootstrap>
          <MemoryRouter initialEntries={[route]}>
            <LocationProbe />
            <Routes>
              <Route path="/app/dashboard" element={<AnalyticsDashboard />} />
              <Route path="/app/register" element={<RegisterPage />} />
            </Routes>
          </MemoryRouter>
        </SessionBootstrap>
      </SessionRepositoryContext.Provider>
    </AppDataProvider>,
  )
}

const url = () => screen.getByTestId('location').textContent ?? ''

function persisted(): AppState {
  return JSON.parse(storage.map.get(STATE_KEY) ?? '{}') as AppState
}

beforeEach(async () => {
  await seed()
})

afterEach(() => {
  resetSessionStore()
})

// --- widgets -----------------------------------------------------------------

describe('the dashboard renders every widget', () => {
  it('shows KPI tiles, the heat map and the three stacked bar charts', async () => {
    renderDashboard()
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    for (const title of [
      'Key measures',
      'Risk heat map',
      'Risks by business unit — Rating',
      'Risks by status — Rating',
      'Risks by category — Rating',
    ]) {
      expect(screen.getByRole('heading', { name: title, level: 2 }), title).toBeInTheDocument()
    }

    // Every required KPI tile.
    for (const caption of [
      'Open risks', 'Risks above appetite', 'Overdue actions',
      'Risks above target', 'Reviews due in 30 days',
    ]) {
      expect(screen.getByText(caption), caption).toBeInTheDocument()
    }
  })

  it('counts each heat-map intersection and re-counts on the basis toggle', async () => {
    renderDashboard()
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    // Residual is the default: TECH-001 sits at 3 × 3.
    expect(screen.getByRole('link', { name: 'Major × Possible: 1' })).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Inherent' }))

    await waitFor(() => {
      // All three fixtures are 5 × 5 inherent.
      expect(screen.getByRole('link', { name: 'Critical × Almost Certain: 3' })).toBeInTheDocument()
    })
  })

  it('puts a risk with no category in an Unassigned bucket, ordered last', async () => {
    renderDashboard()
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    const widget = screen.getByRole('heading', { name: /Risks by category/ }).closest('section')
    const rows = within(widget as HTMLElement).getAllByRole('listitem')

    expect(rows[rows.length - 1]).toHaveTextContent('Unassigned')
  })
})

// --- configuration -----------------------------------------------------------

describe('the dashboard follows the matrix configuration', () => {
  it('uses renamed levels and recoloured cells everywhere', async () => {
    await seed((state) => {
      state.matrix.scaleNameEn = 'Severity'
      state.matrix.levels = state.matrix.levels.map((level) =>
        level.key === 'Medium' ? { ...level, nameEn: 'Watch' } : level,
      )
      state.matrix.colors.Medium = '#123456'
      state.matrix.impactLabels[3] = { ...state.matrix.impactLabels[3], en: 'Substantial' }
    })

    renderDashboard()
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    // Legend and heading follow the configured scale name.
    expect(screen.getByRole('heading', { name: /Risks by status — Severity/ })).toBeInTheDocument()
    // Axis labels follow the configured impact name.
    expect(screen.getByRole('columnheader', { name: 'Substantial' })).toBeInTheDocument()
    // Segment tooltips carry the configured level name.
    expect(screen.getAllByTitle(/Watch: 1/).length).toBeGreaterThan(0)

    const cell = screen.getByRole('link', { name: 'Substantial × Possible: 1' })
    expect(cell.closest('td')).toHaveStyle({ background: '#123456' })
  })
})

// --- drill-through and filters -----------------------------------------------

describe('drill-through into the Register', () => {
  it('opens the register filtered to a heat-map cell', async () => {
    renderDashboard()
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    const user = userEvent.setup()
    await user.click(screen.getByRole('link', { name: 'Major × Possible: 1' }))

    await screen.findByRole('heading', { name: 'Risk Register', level: 1 })
    expect(url()).toContain('impact=3')
    expect(url()).toContain('likelihood=3')
    expect(url()).toContain('basis=residual')

    // Exactly the risk the cell counted.
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('TECH-001')
  })

  it('opens the register filtered to a KPI tile population', async () => {
    renderDashboard()
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    const user = userEvent.setup()
    await user.click(screen.getByText('Risks above appetite').closest('a') as HTMLElement)

    await screen.findByRole('heading', { name: 'Risk Register', level: 1 })
    expect(url()).toContain('aboveAppetite=1')

    // SEC-001 is the only 5 × 5 residual.
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('SEC-001')
  })
})

describe('dashboard filters', () => {
  it('applies to every widget and is encoded in the URL', async () => {
    renderDashboard()
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Business unit'), 'bu_finance')

    await waitFor(() => {
      expect(url()).toContain('businessUnitId=bu_finance')
    })

    // One risk sits in Finance, and every widget now counts only that one.
    expect(screen.getByText(/^1 /)).toBeInTheDocument()
    const widget = screen.getByRole('heading', { name: /Risks by business unit/ }).closest('section')
    expect(within(widget as HTMLElement).getAllByRole('listitem')).toHaveLength(1)
  })

  it('shows an applied filter as a removable chip', async () => {
    renderDashboard('usr_admin', '/app/dashboard?status=Monitoring')
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    const chip = screen.getByRole('button', { name: /Risk status: Monitoring/ })
    const user = userEvent.setup()
    await user.click(chip)

    await waitFor(() => {
      expect(url()).not.toContain('status=')
    })
  })

  it('reports an empty result rather than an empty chart frame', async () => {
    renderDashboard('usr_admin', '/app/dashboard?businessUnitId=bu_nowhere')
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    expect(screen.getAllByText('No risks match the current filters.').length).toBeGreaterThan(0)
  })
})

// --- permissions -------------------------------------------------------------

describe('record-level permissions', () => {
  it('counts only the risks the signed-in user may see', async () => {
    // The action owner holds no risks in this fixture.
    renderDashboard('usr_owner')
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    // usr_owner owns TECH-001 and SEC-001 only.
    expect(screen.getByText(/^2 /)).toBeInTheDocument()
  })
})

// --- saved views and layout --------------------------------------------------

describe('saved dashboard views', () => {
  it('saves the current filters as a named view', async () => {
    renderDashboard('usr_admin', '/app/dashboard?status=Monitoring')
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Save view' }))
    await user.type(screen.getByLabelText('Name this view'), 'Monitoring only')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().dashboardViews).toHaveLength(1)
    })
    const [view] = persisted().dashboardViews
    expect(view.name).toBe('Monitoring only')
    expect(view.filters.status).toBe('Monitoring')
    expect(view.userId).toBe('usr_admin')
  })

  it('hides a widget and remembers the arrangement', async () => {
    renderDashboard()
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Arrange widgets' }))
    await user.click(screen.getByRole('button', { name: 'Hide widget: Risk heat map' }))

    await waitFor(() => {
      expect(persisted().dashboardLayouts[0].hidden).toContain('heatmap')
    })
    expect(screen.queryByRole('heading', { name: 'Risk heat map', level: 2 })).toBeNull()
  })
})

// --- localisation ------------------------------------------------------------

describe('bilingual dashboard', () => {
  it('renders its own chrome in Georgian', async () => {
    resetSessionStore()
    useSessionStore.getState().setLanguage('ka')

    const sessionRepository = new MemorySessionRepository()
    sessionRepository.write('usr_admin')
    const store = new AppDataStore({ repository: new LocalStorageRepository({ storage }) })

    render(
      <AppDataProvider store={store}>
        <SessionRepositoryContext.Provider value={sessionRepository}>
          <SessionBootstrap>
            <MemoryRouter initialEntries={['/app/dashboard']}>
              <AnalyticsDashboard />
            </MemoryRouter>
          </SessionBootstrap>
        </SessionRepositoryContext.Provider>
      </AppDataProvider>,
    )

    expect(await screen.findByRole('heading', { name: 'დაფა', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('ღია რისკები')).toBeInTheDocument()
  })
})
