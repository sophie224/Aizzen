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
import { resetSessionStore, useSessionStore } from '../../app/session/session-store.ts'
import type { AppState, Risk } from '../../domain/types/index.ts'
import { RegisterPage } from './register-page.tsx'

/*
 * Renders the Register directly rather than through the route table, so these
 * tests do not depend on routes.tsx.
 */

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, value) }
  removeItem(key: string) { this.map.delete(key) }
}

const STATE_KEY = 'erm-risk-management-v3-state'

function baseRisk(overrides: Partial<Risk> = {}): Risk {
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
    ...overrides,
  }
}

const RISKS: Risk[] = [
  baseRisk(),
  baseRisk({
    id: 'risk_2', ref: 'SEC-001', title: 'Phishing exposure',
    businessUnitId: 'bu_security', riskOwnerId: 'usr_owner', status: 'Monitoring',
    residual: { impact: 5, likelihood: 4 },
    cause: 'Limited awareness training', event: 'Credentials are harvested', consequence: 'Data loss',
    actions: [{
      id: 'act_1', title: 'Roll out simulated phishing', description: '', deliverable: '',
      ownerId: 'usr_action', dueDate: '2026-06-01', status: 'In Progress', priority: 'High',
      progress: 25, notes: '',
    }],
    custom: { attr_appetite: 'Watch Trigger' },
  }),
  baseRisk({
    id: 'risk_3', ref: 'FIN-001', title: 'Liquidity headroom',
    categoryId: 'cat_35', businessUnitId: 'bu_finance', riskOwnerId: 'usr_manager',
    status: 'Monitoring', outlook: 'Increasing',
    residual: { impact: 1, likelihood: 1 },
    cause: 'Concentrated funding', event: 'A facility is withdrawn', consequence: 'Payment delay',
  }),
]

let storage: MemoryStorage

/** Seeds storage, then overwrites the risk list with the fixture above. */
async function seedState(mutate: (state: AppState) => void = () => undefined) {
  storage = new MemoryStorage()
  const repository = new LocalStorageRepository({ storage })
  const state = await repository.getState()
  state.risks = structuredClone(RISKS)
  mutate(state)
  await repository.saveState(state)
}

function renderRegister(signedInAs: string): RenderResult {
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

/**
 * Filter controls, scoped to the Filters group. "Business unit" names both a
 * filter and a column, so an unscoped query is ambiguous.
 */
function filterControl(name: string): HTMLElement {
  return within(screen.getByRole('group', { name: 'Filters' })).getByLabelText(name)
}

/** Reference cells, in the order the table renders them. */
function renderedRefs(): string[] {
  const rows = screen.getAllByRole('row').slice(1)
  return rows.map((row) => within(row).getAllByRole('cell')[0].textContent ?? '')
}

beforeEach(async () => {
  await seedState()
})

afterEach(() => {
  resetSessionStore()
})

// --- visibility -------------------------------------------------------------

describe('record visibility', () => {
  it('shows every risk to an administrator', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')
    expect(renderedRefs()).toHaveLength(3)
  })

  it('shows a Risk Owner only their own risks', async () => {
    renderRegister('usr_owner')
    await screen.findByRole('table')

    const refs = renderedRefs()
    expect(refs).toEqual(['SEC-001', 'TECH-001'])
    expect(refs).not.toContain('FIN-001')
  })

  it('shows an Action Owner only risks holding an action they own', async () => {
    renderRegister('usr_action')
    await screen.findByRole('table')
    expect(renderedRefs()).toEqual(['SEC-001'])
  })

  it('shows all risks to an auditor, read-only', async () => {
    renderRegister('usr_auditor')
    await screen.findByRole('table')

    expect(renderedRefs()).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'New risk' })).toBeNull()
  })

  it('cannot surface a hidden risk through search', async () => {
    renderRegister('usr_owner')
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Search risks'), 'Liquidity')

    // FIN-001 is outside this user's visibility; searching must not reach it.
    await waitFor(() => {
      expect(screen.queryByRole('table')).toBeNull()
    })
    expect(screen.getByText('No matching risks')).toBeInTheDocument()
  })
})

// --- search -----------------------------------------------------------------

describe('search', () => {
  it('matches every documented field, case-insensitively', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')
    const user = userEvent.setup()
    const box = screen.getByLabelText('Search risks')

    const cases: [string, string][] = [
      ['SEC-001', 'SEC-001'],
      ['phishing', 'SEC-001'],
      ['awareness training', 'SEC-001'],
      ['credentials are harvested', 'SEC-001'],
      ['DATA LOSS', 'SEC-001'],
      ['simulated phishing', 'SEC-001'],
      ['Nino', 'TECH-001'],
    ]

    for (const [term, expectedRef] of cases) {
      await user.clear(box)
      await user.type(box, term)
      await waitFor(() => {
        expect(renderedRefs(), term).toContain(expectedRef)
      })
    }
  })

  it('finds descendants when searching an ancestor business unit name', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Search risks'), 'Technology Division')

    // SEC-001 sits on Information Security, a child of Technology Division.
    await waitFor(() => {
      expect(renderedRefs()).toEqual(['SEC-001', 'TECH-001'])
    })
  })
})

// --- filters ----------------------------------------------------------------

describe('filters', () => {
  it('filters by business unit including descendants, excluding siblings', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.selectOptions(filterControl('Business unit'), 'bu_technology')

    await waitFor(() => {
      expect(renderedRefs()).toEqual(['SEC-001', 'TECH-001'])
    })
    expect(renderedRefs()).not.toContain('FIN-001')
  })

  it('filters by status', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.selectOptions(filterControl('Risk status'), 'Monitoring')

    await waitFor(() => {
      expect(renderedRefs()).toEqual(['FIN-001', 'SEC-001'])
    })
  })

  it('filters by residual rating computed from the matrix', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    const user = userEvent.setup()
    // SEC-001 is 5x4 = 20 -> Significant.
    await user.selectOptions(filterControl('Residual rating'), 'Significant')

    await waitFor(() => {
      expect(renderedRefs()).toEqual(['SEC-001'])
    })
  })

  it('filters by outlook', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.selectOptions(filterControl('Risk outlook'), 'Increasing')

    await waitFor(() => {
      expect(renderedRefs()).toEqual(['FIN-001'])
    })
  })

  it('combines filters with search', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.selectOptions(filterControl('Risk status'), 'Monitoring')
    await user.type(screen.getByLabelText('Search risks'), 'Liquidity')

    await waitFor(() => {
      expect(renderedRefs()).toEqual(['FIN-001'])
    })
  })

  it('offers a clear-filters action that restores the full list', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Search risks'), 'nothing-matches-this')
    await screen.findByText('No matching risks')

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    await waitFor(() => {
      expect(renderedRefs()).toHaveLength(3)
    })
  })
})

// --- sorting ----------------------------------------------------------------

describe('sorting', () => {
  it('defaults to reference ascending', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')
    expect(renderedRefs()).toEqual(['FIN-001', 'SEC-001', 'TECH-001'])
  })

  it('toggles direction when the same header is clicked twice', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /Reference/ }))
    await waitFor(() => {
      expect(renderedRefs()).toEqual(['TECH-001', 'SEC-001', 'FIN-001'])
    })

    await user.click(screen.getByRole('button', { name: /Reference/ }))
    await waitFor(() => {
      expect(renderedRefs()).toEqual(['FIN-001', 'SEC-001', 'TECH-001'])
    })
  })

  it('sorts by residual score', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Residual/ }))

    // FIN-001 = 1, TECH-001 = 9, SEC-001 = 20.
    await waitFor(() => {
      expect(renderedRefs()).toEqual(['FIN-001', 'TECH-001', 'SEC-001'])
    })
  })

  it('reports sort state to assistive technology', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Risk title/ }))

    await waitFor(() => {
      const header = screen.getByRole('columnheader', { name: /Risk title/ })
      expect(header).toHaveAttribute('aria-sort', 'ascending')
    })
  })
})

// --- view modes and chips ---------------------------------------------------

describe('view modes', () => {
  it('shows the structured description only in detailed mode', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    expect(screen.getAllByText('Deferred modernisation').length).toBeGreaterThan(0)

    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Compact' }))

    await waitFor(() => {
      expect(screen.queryByText('Deferred modernisation')).toBeNull()
    })
  })

  it('renders the full breakdown on rating chips in detailed mode', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    // 5 x 4 = 20 -> Significant.
    expect(
      screen.getByLabelText('Residual: Significant, score 20, impact 5 by likelihood 4'),
    ).toBeInTheDocument()
  })

  it('never conveys rating by colour alone', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    // The rating word is rendered as text alongside the colour.
    expect(screen.getAllByText('Significant').length).toBeGreaterThan(0)
  })
})

describe('rating chips follow the configured matrix', () => {
  it('re-rates every chip when a matrix cell changes, with no code change', async () => {
    await seedState((state) => {
      const cell = state.matrix.cells.find((c) => c.impact === 3 && c.likelihood === 3)
      if (cell) cell.rating = 'Significant'
    })

    renderRegister('usr_admin')
    await screen.findByRole('table')

    // TECH-001 is 3x3, normally Medium.
    expect(
      screen.getByLabelText('Residual: Significant, score 9, impact 3 by likelihood 3'),
    ).toBeInTheDocument()
  })

  it('uses the configured colour', async () => {
    await seedState((state) => {
      state.matrix.colors.Significant = '#123456'
    })

    renderRegister('usr_admin')
    await screen.findByRole('table')

    const chip = screen.getByLabelText('Residual: Significant, score 20, impact 5 by likelihood 4')
    expect(chip).toHaveStyle({ background: '#123456' })
  })
})

// --- columns ----------------------------------------------------------------

describe('column visibility', () => {
  it('adds an active custom attribute flagged for the register', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.click(screen.getByText('Columns'))

    // Seeded attribute attr_appetite has showInRegister = true.
    expect(screen.getByRole('checkbox', { name: 'Appetite status' })).toBeInTheDocument()
    // attr_kri does not.
    expect(screen.queryByRole('checkbox', { name: 'Primary KRI' })).toBeNull()
  })

  it('shows the custom attribute value once its column is enabled', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.click(screen.getByText('Columns'))
    await user.click(screen.getByRole('checkbox', { name: 'Appetite status' }))

    await waitFor(() => {
      expect(screen.getByText('Watch Trigger')).toBeInTheDocument()
    })
  })

  it('hides a column when it is unchecked', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.click(screen.getByText('Columns'))
    await user.click(screen.getByRole('checkbox', { name: 'Status' }))

    await waitFor(() => {
      expect(screen.queryByRole('columnheader', { name: 'Status' })).toBeNull()
    })
  })
})

// --- states -----------------------------------------------------------------

describe('empty and no-result states', () => {
  it('shows a role-aware empty state when the scope holds no risks', async () => {
    await seedState((state) => {
      state.risks = []
    })
    renderRegister('usr_admin')

    expect(await screen.findByText('No risks in your scope')).toBeInTheDocument()
    expect(screen.queryByText('No matching risks')).toBeNull()
  })

  it('distinguishes a zero-result filter from an empty scope', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Search risks'), 'zzzz-no-match')

    expect(await screen.findByText('No matching risks')).toBeInTheDocument()
    expect(screen.queryByText('No risks in your scope')).toBeNull()
  })
})

describe('create permission', () => {
  it('shows New risk to an administrator', async () => {
    renderRegister('usr_admin')
    await screen.findByRole('table')
    expect(screen.getByRole('button', { name: 'New risk' })).toBeInTheDocument()
  })

  it('hides New risk from roles without create rights', async () => {
    for (const account of ['usr_owner', 'usr_control', 'usr_action', 'usr_auditor']) {
      const view = renderRegister(account)
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'New risk' }), account).toBeNull()
      })
      view.unmount()
      resetSessionStore()
    }
  })
})

describe('bilingual register', () => {
  it('renders labels in Georgian', async () => {
    resetSessionStore()
    useSessionStore.getState().setLanguage('ka')

    const sessionRepository = new MemorySessionRepository()
    sessionRepository.write('usr_admin')
    const store = new AppDataStore({ repository: new LocalStorageRepository({ storage }) })

    render(
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

    expect(await screen.findByLabelText('რისკების ძებნა')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /ნომერი/ })).toBeInTheDocument()
  })
})

describe('storage key', () => {
  it('reads from the retained v3 key', () => {
    expect([...storage.map.keys()]).toContain(STATE_KEY)
  })
})
