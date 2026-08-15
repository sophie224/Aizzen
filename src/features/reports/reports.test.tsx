import { render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AppDataProvider } from '../../data/app-data-provider.tsx'
import { AppDataStore } from '../../data/app-data-store.ts'
import { LocalStorageRepository, type StorageLike } from '../../data/local-storage-repository.ts'
import { MemorySessionRepository } from '../../data/session-repository.ts'
import { SessionRepositoryContext } from '../../app/session/session-repository-context.ts'
import { SessionBootstrap } from '../../app/session/session-bootstrap.tsx'
import { resetSessionStore } from '../../app/session/session-store.ts'
import type { AppState, Risk } from '../../domain/types/index.ts'
import { ReportsPage } from './reports-page.tsx'
import { RegisterPage } from '../register/register-page.tsx'

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
    description: '',
    cause: 'c', event: 'e', consequence: 'q', statusNarrative: '',
    inherent: { impact: 4, likelihood: 4 },
    residual: { impact: 3, likelihood: 3 },
    target: { impact: 2, likelihood: 2 },
    controls: [], actions: [],
    acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
    custom: { attr_appetite: 'Watch Trigger' }, history: [], audit: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const RISKS: Risk[] = [
  makeRisk(),
  makeRisk({ id: 'risk_2', ref: 'SEC-001', title: 'Phishing', status: 'Monitoring', residual: { impact: 5, likelihood: 4 } }),
  makeRisk({ id: 'risk_3', ref: 'FIN-001', title: 'Liquidity', status: 'Completed', residual: { impact: 1, likelihood: 1 } }),
]

async function seed(mutate: (state: AppState) => void = () => undefined) {
  storage = new MemoryStorage()
  const repository = new LocalStorageRepository({ storage })
  const state = await repository.getState()
  state.risks = structuredClone(RISKS)
  mutate(state)
  await repository.saveState(state)
}

function renderPage(page: 'reports' | 'register', signedInAs = 'usr_admin'): RenderResult {
  resetSessionStore()
  const sessionRepository = new MemorySessionRepository()
  sessionRepository.write(signedInAs)
  const store = new AppDataStore({ repository: new LocalStorageRepository({ storage }) })

  return render(
    <AppDataProvider store={store}>
      <SessionRepositoryContext.Provider value={sessionRepository}>
        <SessionBootstrap>
          <MemoryRouter>{page === 'reports' ? <ReportsPage /> : <RegisterPage />}</MemoryRouter>
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
  await user.click(await screen.findByRole('button', { name: 'Edit template' }))
  return user
}

beforeEach(async () => {
  await seed()
})

afterEach(() => {
  resetSessionStore()
  vi.restoreAllMocks()
})

// --- section rendering ------------------------------------------------------

describe('the three section types render', () => {
  it('renders the seeded template with all three sections', async () => {
    renderPage('reports')
    await screen.findByRole('heading', { name: 'Reports', level: 1 })

    // Seed ships Executive summary (text), a dashboard section and a register.
    expect(screen.getByRole('heading', { name: 'Executive summary', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Enterprise Risk Overview', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Priority risk register', level: 2 })).toBeInTheDocument()
  })

  it('renders open text narrative as paragraphs', async () => {
    await seed((state) => {
      const section = state.reportTemplates[0].sections.find((candidate) => candidate.type === 'openText')
      if (section && section.type === 'openText') section.bodyEn = 'First para.\n\nSecond para.'
    })

    renderPage('reports')
    await screen.findByRole('heading', { name: 'Executive summary', level: 2 })

    expect(screen.getByText('First para.')).toBeInTheDocument()
    expect(screen.getByText('Second para.')).toBeInTheDocument()
  })

  it('renders the compact register with its selected columns', async () => {
    await seed((state) => {
      const section = state.reportTemplates[0].sections.find((candidate) => candidate.type === 'compactRegister')
      if (section && section.type === 'compactRegister') {
        section.columns = ['ref', 'title', 'status']
        section.filters = {}
      }
    })

    renderPage('reports')
    const heading = await screen.findByRole('heading', { name: 'Priority risk register', level: 2 })
    const table = within(heading.closest('section') as HTMLElement).getByRole('table')

    expect(within(table).getAllByRole('columnheader')).toHaveLength(3)
    expect(within(table).getByRole('columnheader', { name: 'Reference' })).toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(4) // header + 3 risks
  })
})

// --- independent section filters --------------------------------------------

describe('sections carry independent filters', () => {
  it('a register section applies its own filter', async () => {
    await seed((state) => {
      const section = state.reportTemplates[0].sections.find((candidate) => candidate.type === 'compactRegister')
      if (section && section.type === 'compactRegister') section.filters = { status: 'Monitoring' }
    })

    renderPage('reports')
    const heading = await screen.findByRole('heading', { name: 'Priority risk register', level: 2 })
    const table = within(heading.closest('section') as HTMLElement).getByRole('table')

    expect(within(table).getAllByRole('row')).toHaveLength(2) // header + SEC-001
  })

  it('two dashboard sections in one report can show different scopes', async () => {
    await seed((state) => {
      const template = state.reportTemplates[0]
      const dashboardId = state.dashboards[0].id
      template.sections = [
        { id: 'sec_all', type: 'dashboard', dashboardId, filters: {} },
        { id: 'sec_open', type: 'dashboard', dashboardId, filters: { status: 'Monitoring' } },
      ]
      // One metric widget makes the difference readable.
      state.dashboards[0].widgets = [
        { id: 'w1', type: 'metric', titleEn: 'Total', titleKa: '', accentColor: '#1A2151', backgroundColor: '#FFF', span: 12, metric: 'totalRisks' },
      ]
    })

    renderPage('reports')
    await screen.findByRole('heading', { name: 'Reports', level: 1 })

    const counts = screen.getAllByText(/^\d+ risks in this section$/).map((node) => node.textContent)
    expect(counts).toEqual(['3 risks in this section', '1 risks in this section'])
  })
})

// --- section lifecycle ------------------------------------------------------

describe('section lifecycle', () => {
  it('adds each of the three section types', async () => {
    renderPage('reports')
    const user = await enterEditMode()
    const before = persisted().reportTemplates[0].sections.length

    await user.click(screen.getByRole('button', { name: 'Add open text section' }))
    await waitFor(() => {
      expect(persisted().reportTemplates[0].sections).toHaveLength(before + 1)
    })

    await user.click(screen.getByRole('button', { name: 'Add dashboard section' }))
    await user.click(screen.getByRole('button', { name: 'Add register section' }))

    await waitFor(() => {
      expect(persisted().reportTemplates[0].sections).toHaveLength(before + 3)
    })

    const types = persisted().reportTemplates[0].sections.map((section) => section.type)
    expect(types).toContain('openText')
    expect(types).toContain('dashboard')
    expect(types).toContain('compactRegister')
  })

  it('moves a section up', async () => {
    renderPage('reports')
    const user = await enterEditMode()

    const before = persisted().reportTemplates[0].sections.map((section) => section.id)
    const dashboardEditor = screen.getByText('Dashboard section').closest('.report-section__editor')
    await user.click(within(dashboardEditor as HTMLElement).getByRole('button', { name: 'Move section up' }))

    await waitFor(() => {
      const after = persisted().reportTemplates[0].sections.map((section) => section.id)
      expect(after[0]).toBe(before[1])
    })
  })

  it('disables Move up on the first section and Move down on the last', async () => {
    renderPage('reports')
    await enterEditMode()

    // The seeded template orders sections: open text, dashboard, register.
    const first = screen.getByText('Open text section').closest('.report-section__editor')
    expect(within(first as HTMLElement).getByRole('button', { name: 'Move section up' })).toBeDisabled()
    expect(within(first as HTMLElement).getByRole('button', { name: 'Move section down' })).toBeEnabled()

    const last = screen.getByText('Compact register section').closest('.report-section__editor')
    expect(within(last as HTMLElement).getByRole('button', { name: 'Move section down' })).toBeDisabled()
    expect(within(last as HTMLElement).getByRole('button', { name: 'Move section up' })).toBeEnabled()
  })

  it('duplicates a section next to the original', async () => {
    renderPage('reports')
    const user = await enterEditMode()
    const before = persisted().reportTemplates[0].sections.length

    const editor = screen.getByText('Open text section').closest('.report-section__editor')
    await user.click(within(editor as HTMLElement).getByRole('button', { name: 'Duplicate section' }))

    await waitFor(() => {
      expect(persisted().reportTemplates[0].sections).toHaveLength(before + 1)
    })
    const sections = persisted().reportTemplates[0].sections
    expect(sections[0].type).toBe('openText')
    expect(sections[1].type).toBe('openText')
    expect(sections[0].id).not.toBe(sections[1].id)
  })

  it('deletes a section', async () => {
    renderPage('reports')
    const user = await enterEditMode()
    const before = persisted().reportTemplates[0].sections.length

    const editor = screen.getByText('Open text section').closest('.report-section__editor')
    await user.click(within(editor as HTMLElement).getByRole('button', { name: 'Delete section' }))

    await waitFor(() => {
      expect(persisted().reportTemplates[0].sections).toHaveLength(before - 1)
    })
  })

  it('edits an open text narrative', async () => {
    renderPage('reports')
    const user = await enterEditMode()

    const body = screen.getByLabelText(/Open text section 1 Narrative \(English\)/)
    await user.type(body, 'Board commentary.')

    await waitFor(() => {
      const section = persisted().reportTemplates[0].sections[0]
      expect(section.type === 'openText' && section.bodyEn).toContain('Board commentary.')
    })
  })
})

// --- compact register columns -----------------------------------------------

describe('compact register columns', () => {
  it('toggles a column on', async () => {
    renderPage('reports')
    const user = await enterEditMode()

    const editor = screen.getByText('Compact register section').closest('.report-section__editor')
    await user.click(within(editor as HTMLElement).getByRole('checkbox', { name: 'outlook' }))

    await waitFor(() => {
      const section = persisted().reportTemplates[0].sections.find((candidate) => candidate.type === 'compactRegister')
      expect(section?.type === 'compactRegister' && section.columns).toContain('outlook')
    })
  })

  it('refuses to remove the last remaining column', async () => {
    await seed((state) => {
      const section = state.reportTemplates[0].sections.find((candidate) => candidate.type === 'compactRegister')
      if (section && section.type === 'compactRegister') section.columns = ['ref']
    })

    renderPage('reports')
    const user = await enterEditMode()

    const editor = screen.getByText('Compact register section').closest('.report-section__editor')
    await user.click(within(editor as HTMLElement).getByRole('checkbox', { name: 'ref' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one column/i)

    const section = persisted().reportTemplates[0].sections.find((candidate) => candidate.type === 'compactRegister')
    expect(section?.type === 'compactRegister' && section.columns).toEqual(['ref'])
  })

  it('offers active custom attributes as columns', async () => {
    renderPage('reports')
    await enterEditMode()

    const editor = screen.getByText('Compact register section').closest('.report-section__editor')
    expect(within(editor as HTMLElement).getByRole('checkbox', { name: 'Appetite status' })).toBeInTheDocument()
  })
})

// --- template CRUD ----------------------------------------------------------

describe('template CRUD', () => {
  it('adds a template', async () => {
    renderPage('reports')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add template' }))

    await waitFor(() => {
      expect(persisted().reportTemplates).toHaveLength(2)
    })
    expect(persisted().auditEvents.some((event) => event.action === 'report.created')).toBe(true)
  })

  it('duplicates a template with its sections', async () => {
    renderPage('reports')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Duplicate template' }))

    await waitFor(() => {
      expect(persisted().reportTemplates).toHaveLength(2)
    })
    const [original, copy] = persisted().reportTemplates
    expect(copy.nameEn).toContain('(copy)')
    expect(copy.sections).toHaveLength(original.sections.length)
    expect(copy.id).not.toBe(original.id)
  })

  it('deletes a template', async () => {
    renderPage('reports')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add template' }))
    await waitFor(() => {
      expect(persisted().reportTemplates).toHaveLength(2)
    })

    await user.click(screen.getByRole('button', { name: 'Delete template' }))
    await waitFor(() => {
      expect(persisted().reportTemplates).toHaveLength(1)
    })
  })

  it('persists a renamed template', async () => {
    renderPage('reports')
    const user = await enterEditMode()

    const name = screen.getByLabelText('Template name (English)')
    await user.clear(name)
    await user.type(name, 'Quarterly pack')

    await waitFor(() => {
      expect(persisted().reportTemplates[0].nameEn).toBe('Quarterly pack')
    })
  })
})

// --- print ------------------------------------------------------------------

describe('print view', () => {
  it('invokes the browser print dialog', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)

    renderPage('reports')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Print / PDF' }))

    expect(print).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

// --- permissions ------------------------------------------------------------

describe('report permissions', () => {
  it('hides editing controls from a read-only role but still renders the report', async () => {
    renderPage('reports', 'usr_auditor')
    await screen.findByRole('heading', { name: 'Reports', level: 1 })

    expect(screen.queryByRole('button', { name: 'Edit template' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add template' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Print / PDF' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Executive summary', level: 2 })).toBeInTheDocument()
  })

  it('scopes report data to the signed-in user’s visible risks', async () => {
    await seed((state) => {
      const section = state.reportTemplates[0].sections.find((candidate) => candidate.type === 'compactRegister')
      if (section && section.type === 'compactRegister') section.filters = {}
    })

    // usr_owner owns all three seeded risks in this fixture, so use the
    // control owner, who owns none of them.
    renderPage('reports', 'usr_control')
    const heading = await screen.findByRole('heading', { name: 'Priority risk register', level: 2 })

    expect(within(heading.closest('section') as HTMLElement).getByText('0 risks in this section')).toBeInTheDocument()
  })
})

// --- register export --------------------------------------------------------

describe('register export', () => {
  /** Captures what the page hands to the download helper. */
  function captureDownload() {
    const captured: { name: string; type: string; text: string }[] = []
    const createObjectURL = vi.fn(() => 'blob:mock')

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        void blob.text().then((text) => {
          captured.push({ name: '', type: blob.type, text })
        })
        return createObjectURL()
      },
      revokeObjectURL: vi.fn(),
    })

    return captured
  }

  it('offers CSV and Excel export', async () => {
    renderPage('register')
    expect(await screen.findByRole('button', { name: 'Export CSV' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export Excel' })).toBeInTheDocument()
  })

  it('exports the current filtered dataset', async () => {
    const captured = captureDownload()

    renderPage('register')
    const user = userEvent.setup()
    await screen.findByRole('table')

    // Narrow to one risk, then export.
    await user.type(screen.getByLabelText('Search risks'), 'Phishing')
    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(2)
    })

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => {
      expect(captured.length).toBeGreaterThan(0)
    })
    expect(captured[0].text).toContain('SEC-001')
    expect(captured[0].text).not.toContain('FIN-001')
    vi.unstubAllGlobals()
  })

  it('includes active custom attributes in the export', async () => {
    const captured = captureDownload()

    renderPage('register')
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Export Excel' }))

    await waitFor(() => {
      expect(captured.length).toBeGreaterThan(0)
    })
    expect(captured[0].text).toContain('Appetite status')
    expect(captured[0].type).toBe('application/vnd.ms-excel')
    vi.unstubAllGlobals()
  })

  it('exports only what the signed-in user can see', async () => {
    const captured = captureDownload()

    // The control owner sees none of the seeded risks.
    renderPage('register', 'usr_control')
    const user = userEvent.setup()
    await screen.findByText('No risks in your scope')

    // Nothing to export; the button is still present but yields no rows.
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(captured.every((entry) => !entry.text.includes('TECH-001'))).toBe(true)
    vi.unstubAllGlobals()
  })
})
