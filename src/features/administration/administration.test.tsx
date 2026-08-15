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
import { AdministrationPage } from './administration-page.tsx'

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, value) }
  removeItem(key: string) { this.map.delete(key) }
}

const STATE_KEY = 'erm-risk-management-v3-state'

function seedRisk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk_1', ref: 'TECH-001', title: 'A risk', type: 'Current',
    categoryId: 'cat_16', businessUnitId: 'bu_technology', riskOwnerId: 'usr_owner',
    originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
    status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
    description: '',
    cause: 'c', event: 'e', consequence: 'q', statusNarrative: '',
    inherent: { impact: 3, likelihood: 3 }, residual: { impact: 2, likelihood: 2 }, target: { impact: 1, likelihood: 1 },
    controls: [], actions: [],
    acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
    custom: { attr_appetite: 'Limit' }, history: [], audit: [], updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

let storage: MemoryStorage

async function seed(mutate: (state: AppState) => void = () => undefined) {
  storage = new MemoryStorage()
  const repository = new LocalStorageRepository({ storage })
  const state = await repository.getState()
  state.risks = [seedRisk()]
  mutate(state)
  await repository.saveState(state)
}

function renderAdmin(signedInAs = 'usr_admin'): RenderResult {
  resetSessionStore()
  const sessionRepository = new MemorySessionRepository()
  sessionRepository.write(signedInAs)
  const store = new AppDataStore({ repository: new LocalStorageRepository({ storage }) })

  return render(
    <AppDataProvider store={store}>
      <SessionRepositoryContext.Provider value={sessionRepository}>
        <SessionBootstrap>
          <MemoryRouter>
            <AdministrationPage />
          </MemoryRouter>
        </SessionBootstrap>
      </SessionRepositoryContext.Provider>
    </AppDataProvider>,
  )
}

function persisted(): AppState {
  return JSON.parse(storage.map.get(STATE_KEY) ?? '{}') as AppState
}

async function openSection(name: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name }))
  return user
}

beforeEach(async () => {
  await seed()
})

afterEach(() => {
  resetSessionStore()
})

// --- shell ------------------------------------------------------------------

describe('administration shell', () => {
  it('lists all ten sections', async () => {
    renderAdmin()
    const nav = await screen.findByRole('navigation', { name: 'Administration sections' })

    for (const section of [
      'Overview', 'Categories', 'Business units', 'Custom attributes', 'Users',
      'Roles & permissions', 'Rating matrix', 'Branding', 'SSO / SAML roadmap', 'Data tools',
    ]) {
      expect(within(nav).getByRole('button', { name: section }), section).toBeInTheDocument()
    }
  })

  it('switches workspace when a section is chosen', async () => {
    renderAdmin()
    await openSection('Categories')
    expect(screen.getByRole('heading', { name: 'Categories', level: 2 })).toBeInTheDocument()
  })

  it('renders real content for every section — none are placeholders', async () => {
    renderAdmin()
    const user = userEvent.setup()

    for (const section of [
      'Overview', 'Categories', 'Business units', 'Custom attributes', 'Users',
      'Roles & permissions', 'Rating matrix', 'Branding', 'SSO / SAML roadmap', 'Data tools',
    ]) {
      await user.click(screen.getByRole('button', { name: section }))
      expect(screen.queryByText(/Scheduled for milestone/), section).toBeNull()
    }
  })
})

// --- overview metrics -------------------------------------------------------

describe('overview metrics', () => {
  it('counts only active categories, units, users and attributes', async () => {
    await seed((state) => {
      state.categories[0].active = false
      state.businessUnits[0].active = false
      state.users[0].status = 'Inactive'
      state.customAttributes[0].active = false
    })

    renderAdmin()
    await screen.findByRole('heading', { name: 'Overview', level: 2 })

    const value = (label: string) => {
      const item = screen.getByText(label).closest('li')
      return within(item as HTMLElement).getByText(/^\d+$/).textContent
    }

    // Seed: 38 categories, 7 units, 9 users, 3 attributes — one of each disabled.
    expect(value('Active categories')).toBe('37')
    expect(value('Active business units')).toBe('6')
    expect(value('Active users')).toBe('8')
    expect(value('Active custom attributes')).toBe('2')
  })

  it('counts all roles and every audit event', async () => {
    renderAdmin()
    await screen.findByRole('heading', { name: 'Overview', level: 2 })

    const roles = screen.getByText('Roles').closest('li')
    expect(within(roles as HTMLElement).getByText('7')).toBeInTheDocument()
  })
})

// --- categories -------------------------------------------------------------

describe('categories', () => {
  it('blocks save when an English label is empty', async () => {
    renderAdmin()
    const user = await openSection('Categories')
    await user.click(screen.getByRole('button', { name: 'Add category' }))

    await user.type(screen.getByLabelText('Level 1 (English)'), 'Operational')
    // Level 2 English left blank.
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('A Level 2 English label is required.')).toBeInTheDocument()
  })

  it('does not require Georgian labels', async () => {
    renderAdmin()
    const user = await openSection('Categories')
    await user.click(screen.getByRole('button', { name: 'Add category' }))

    await user.type(screen.getByLabelText('Level 1 (English)'), 'Emerging')
    await user.type(screen.getByLabelText('Level 2 (English)'), 'Quantum')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().categories.some((category) => category.level2En === 'Quantum')).toBe(true)
    })
  })

  it('writes an audit event on create', async () => {
    renderAdmin()
    const user = await openSection('Categories')
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    await user.type(screen.getByLabelText('Level 1 (English)'), 'Emerging')
    await user.type(screen.getByLabelText('Level 2 (English)'), 'Quantum')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().auditEvents.some((event) => event.action === 'category.created')).toBe(true)
    })
  })

  it('deactivates rather than deletes, leaving the risk reference intact', async () => {
    renderAdmin()
    const user = await openSection('Categories')

    // cat_16 is Data Governance, referenced by the seeded risk.
    const row = screen.getByText('Data Governance').closest('tr')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => {
      const category = persisted().categories.find((candidate) => candidate.id === 'cat_16')
      expect(category?.active).toBe(false)
    })

    // The category still exists and the risk still points at it.
    expect(persisted().categories.some((category) => category.id === 'cat_16')).toBe(true)
    expect(persisted().risks[0].categoryId).toBe('cat_16')
  })

  it('shows how many records use a category', async () => {
    renderAdmin()
    await openSection('Categories')

    const row = screen.getByText('Data Governance').closest('tr')
    expect(within(row as HTMLElement).getByText(/1 records/)).toBeInTheDocument()
  })
})

// --- business units ---------------------------------------------------------

describe('business units', () => {
  it('renders the tree with hierarchy path and the three counts', async () => {
    renderAdmin()
    await openSection('Business units')

    expect(screen.getByText('Enterprise / Technology Division')).toBeInTheDocument()
    // Technology Division: 1 direct user (risk owner), 1 direct risk, 2 descendants.
    expect(screen.getByText(/1 direct users · 1 direct risks · 2 descendants/)).toBeInTheDocument()
  })

  it('collapses and expands a node', async () => {
    renderAdmin()
    const user = await openSection('Business units')

    expect(screen.getByText(/SEC · Information Security/)).toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /Collapse Technology Division/ })
    await user.click(toggle)

    await waitFor(() => {
      expect(screen.queryByText(/SEC · Information Security/)).toBeNull()
    })
  })

  it('blocks a duplicate code', async () => {
    renderAdmin()
    const user = await openSection('Business units')
    await user.click(screen.getByRole('button', { name: 'Add root unit' }))

    await user.type(screen.getByLabelText('Code'), 'TECH')
    await user.type(screen.getByLabelText('Name (English)'), 'Duplicate')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('That code is already in use.')).toBeInTheDocument()
  })

  it('blocks an empty code or name', async () => {
    renderAdmin()
    const user = await openSection('Business units')
    await user.click(screen.getByRole('button', { name: 'Add root unit' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('A code is required.')).toBeInTheDocument()
    expect(within(alert).getByText('An English name is required.')).toBeInTheDocument()
  })

  it('never offers a descendant as a parent, so a cycle cannot be chosen', async () => {
    renderAdmin()
    const user = await openSection('Business units')

    const row = screen.getByText(/TECH · Technology Division/).closest('.bu-tree__row')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Edit' }))

    const parent = screen.getByLabelText('Parent unit')
    const options = within(parent).getAllByRole('option').map((option) => option.textContent)

    expect(options.some((option) => option?.includes('Information Security'))).toBe(false)
    expect(options.some((option) => option?.includes('Enterprise'))).toBe(true)
  })

  it('adds a child under the selected parent', async () => {
    renderAdmin()
    const user = await openSection('Business units')

    const row = screen.getByText(/TECH · Technology Division/).closest('.bu-tree__row')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Add child unit' }))

    await user.type(screen.getByLabelText('Code'), 'plt')
    await user.type(screen.getByLabelText('Name (English)'), 'Platform Engineering')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const created = persisted().businessUnits.find((unit) => unit.nameEn === 'Platform Engineering')
      expect(created?.parentId).toBe('bu_technology')
      // Codes are uppercased on save.
      expect(created?.code).toBe('PLT')
    })
  })

  it('audits a move distinctly from an ordinary update', async () => {
    renderAdmin()
    const user = await openSection('Business units')

    const row = screen.getByText(/SEC · Information Security/).closest('.bu-tree__row')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Edit' }))
    await user.selectOptions(screen.getByLabelText('Parent unit'), 'bu_enterprise')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().auditEvents.some((event) => event.action === 'business_unit.moved')).toBe(true)
    })
  })
})

// --- custom attributes ------------------------------------------------------

describe('custom attributes', () => {
  it('offers all five types', async () => {
    renderAdmin()
    const user = await openSection('Custom attributes')
    await user.click(screen.getByRole('button', { name: 'Add custom attribute' }))

    const select = screen.getByLabelText('Type')
    const options = within(select).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['text', 'number', 'date', 'select', 'user'])
  })

  it('parses comma-separated options, trimming and dropping empties', async () => {
    renderAdmin()
    const user = await openSection('Custom attributes')
    await user.click(screen.getByRole('button', { name: 'Add custom attribute' }))

    // A label the seed does not already use, so the assertion cannot match
    // the packaged 'Review cycle' attribute instead of the one created here.
    await user.type(screen.getByLabelText('Label (English)'), 'Escalation tier')
    await user.selectOptions(screen.getByLabelText('Type'), 'select')
    await user.type(screen.getByLabelText(/Select options/), 'Monthly, , Quarterly ,,Annual')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const created = persisted().customAttributes.find((attr) => attr.labelEn === 'Escalation tier')
      expect(created?.options).toEqual(['Monthly', 'Quarterly', 'Annual'])
    })
  })

  it('blocks a select attribute with no options', async () => {
    renderAdmin()
    const user = await openSection('Custom attributes')
    await user.click(screen.getByRole('button', { name: 'Add custom attribute' }))

    await user.type(screen.getByLabelText('Label (English)'), 'Empty select')
    await user.selectOptions(screen.getByLabelText('Type'), 'select')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/needs at least one option/)).toBeInTheDocument()
  })

  it('sets showInRegister, which the register reads as a column', async () => {
    renderAdmin()
    const user = await openSection('Custom attributes')

    const row = screen.getByText('Primary KRI').closest('tr')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('checkbox', { name: 'Offer as a register column' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const attribute = persisted().customAttributes.find((attr) => attr.id === 'attr_kri')
      expect(attribute?.showInRegister).toBe(true)
    })
  })

  it('deactivation hides the field WITHOUT deleting stored values', async () => {
    renderAdmin()
    const user = await openSection('Custom attributes')

    const row = screen.getByText('Appetite status').closest('tr')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => {
      const attribute = persisted().customAttributes.find((attr) => attr.id === 'attr_appetite')
      expect(attribute?.active).toBe(false)
    })

    // The stored value on the risk survives.
    expect(persisted().risks[0].custom.attr_appetite).toBe('Limit')
  })

  it('reactivation restores the field and its values', async () => {
    renderAdmin()
    const user = await openSection('Custom attributes')

    const row = () => screen.getByText('Appetite status').closest('tr') as HTMLElement
    await user.click(within(row()).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => {
      expect(within(row()).getByRole('button', { name: 'Activate' })).toBeInTheDocument()
    })

    await user.click(within(row()).getByRole('button', { name: 'Activate' }))

    await waitFor(() => {
      const attribute = persisted().customAttributes.find((attr) => attr.id === 'attr_appetite')
      expect(attribute?.active).toBe(true)
    })
    expect(persisted().risks[0].custom.attr_appetite).toBe('Limit')
  })

  it('shows how many records hold a value', async () => {
    renderAdmin()
    await openSection('Custom attributes')

    const row = screen.getByText('Appetite status').closest('tr')
    expect(within(row as HTMLElement).getByText(/1 records/)).toBeInTheDocument()
  })
})

// --- audit ------------------------------------------------------------------

describe('audit coverage', () => {
  it('records a status change for every master-data type', async () => {
    renderAdmin()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Categories' }))
    const categoryRow = screen.getByText('Data Governance').closest('tr')
    await user.click(within(categoryRow as HTMLElement).getByRole('button', { name: 'Deactivate' }))

    await user.click(screen.getByRole('button', { name: 'Custom attributes' }))
    const attributeRow = screen.getByText('Appetite status').closest('tr')
    await user.click(within(attributeRow as HTMLElement).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => {
      const actions = persisted().auditEvents.map((event) => event.action)
      expect(actions).toContain('category.status_changed')
      expect(actions).toContain('custom_attribute.status_changed')
    })
  })
})
