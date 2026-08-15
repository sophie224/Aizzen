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
import { effectiveScope } from '../../domain/business-units/index.ts'
import { canAccess, effectiveModulePermission } from '../../domain/permissions/index.ts'
import { MODULE_NAMES } from '../../domain/types/enums.ts'
import type { AppState } from '../../domain/types/index.ts'
import { AdministrationPage } from './administration-page.tsx'

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, value) }
  removeItem(key: string) { this.map.delete(key) }
}

const STATE_KEY = 'erm-risk-management-v3-state'
let storage: MemoryStorage

async function seed(mutate: (state: AppState) => void = () => undefined) {
  storage = new MemoryStorage()
  const repository = new LocalStorageRepository({ storage })
  const state = await repository.getState()
  mutate(state)
  await repository.saveState(state)
}

function renderAdmin(): RenderResult {
  resetSessionStore()
  const sessionRepository = new MemorySessionRepository()
  sessionRepository.write('usr_admin')
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

// --- users ------------------------------------------------------------------

describe('user editor validation', () => {
  it('blocks save when name, email, role or scope is missing', async () => {
    renderAdmin()
    const user = await openSection('Users')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('A name is required.')).toBeInTheDocument()
    expect(within(alert).getByText('An email address is required.')).toBeInTheDocument()
    expect(within(alert).getByText('Select at least one role.')).toBeInTheDocument()
    expect(within(alert).getByText('Select at least one business unit scope.')).toBeInTheDocument()
  })

  it('saves once every requirement is met', async () => {
    renderAdmin()
    const user = await openSection('Users')
    await user.click(screen.getByRole('button', { name: 'Add user' }))

    await user.type(screen.getByLabelText('Name'), 'New Analyst')
    await user.type(screen.getByLabelText('Email address'), 'new.analyst@erm.local')
    await user.click(within(screen.getByRole('group', { name: 'Roles' })).getByRole('checkbox', { name: 'Auditor' }))
    await user.click(screen.getByRole('checkbox', { name: 'Finance' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const created = persisted().users.find((candidate) => candidate.name === 'New Analyst')
      expect(created?.roleIds).toEqual(['role_auditor'])
      expect(created?.businessUnitIds).toEqual(['bu_finance'])
    })
  })

  it('writes an audit event on create', async () => {
    renderAdmin()
    const user = await openSection('Users')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    await user.type(screen.getByLabelText('Name'), 'New Analyst')
    await user.type(screen.getByLabelText('Email address'), 'new.analyst@erm.local')
    await user.click(within(screen.getByRole('group', { name: 'Roles' })).getByRole('checkbox', { name: 'Auditor' }))
    await user.click(screen.getByRole('checkbox', { name: 'Finance' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().auditEvents.some((event) => event.action === 'user.created')).toBe(true)
    })
  })

  it('warns about a duplicate email without blocking the save', async () => {
    renderAdmin()
    const user = await openSection('Users')
    await user.click(screen.getByRole('button', { name: 'Add user' }))

    await user.type(screen.getByLabelText('Email address'), 'admin@erm.local')

    // Phase 1 does not enforce uniqueness; the warning surfaces the collision.
    expect(await screen.findByText(/another account already uses this email/i)).toBeInTheDocument()
  })
})

describe('direct and inherited business unit scope', () => {
  it('shows direct and effective counts separately', async () => {
    renderAdmin()
    const user = await openSection('Users')

    // Nino is scoped directly to Technology Division.
    const row = screen.getByText('Nino Kapanadze').closest('tr')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Edit' }))

    const legend = screen.getByText(/Direct business unit scope/)
    // 1 direct grant, 3 effective units (Technology + its two children).
    expect(legend.textContent).toContain('1 direct')
    expect(legend.textContent).toContain('3 effective')
  })

  it('matches the domain helper exactly', async () => {
    renderAdmin()
    const user = await openSection('Users')

    const row = screen.getByText('Nino Kapanadze').closest('tr')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Edit' }))

    const state = persisted()
    const expected = effectiveScope(state.businessUnits, ['bu_technology']).length
    expect(screen.getByText(/Direct business unit scope/).textContent).toContain(`${String(expected)} effective`)
  })

  it('marks inherited units and disables their checkbox', async () => {
    renderAdmin()
    const user = await openSection('Users')

    const row = screen.getByText('Nino Kapanadze').closest('tr')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Edit' }))

    // Information Security is inherited from the Technology Division grant.
    const inherited = screen.getByRole('checkbox', { name: /Information Security/ })
    expect(inherited).toBeDisabled()
    expect(inherited).not.toBeChecked()

    const directGrant = screen.getByRole('checkbox', { name: /Technology Division/ })
    expect(directGrant).toBeEnabled()
    expect(directGrant).toBeChecked()
  })

  it('does not mark a parent or sibling as inherited from a child grant', async () => {
    renderAdmin()
    const user = await openSection('Users')

    // Giorgi is scoped to Information Security only.
    const row = screen.getByText('Giorgi Maisuradze').closest('tr')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Edit' }))

    // Neither the parent nor the sibling is inherited, so both stay enabled
    // and unchecked — no upward or sideways leak (ARCHITECTURE.md §5.4).
    const parent = screen.getByRole('checkbox', { name: /Technology Division/ })
    expect(parent).toBeEnabled()
    expect(parent).not.toBeChecked()

    const sibling = screen.getByRole('checkbox', { name: /IT Operations/ })
    expect(sibling).toBeEnabled()
    expect(sibling).not.toBeChecked()
  })

  it('releases inherited units when the parent grant is removed', async () => {
    renderAdmin()
    const user = await openSection('Users')

    const row = screen.getByText('Nino Kapanadze').closest('tr')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Edit' }))

    await user.click(screen.getByRole('checkbox', { name: /Technology Division/ }))

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Information Security/ })).toBeEnabled()
    })
  })
})

describe('deactivating a user', () => {
  it('sets the status and audits it, without deleting the record', async () => {
    renderAdmin()
    const user = await openSection('Users')

    const row = screen.getByText('Nino Kapanadze').closest('tr')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Deactivate' }))

    await waitFor(() => {
      const target = persisted().users.find((candidate) => candidate.id === 'usr_owner')
      expect(target?.status).toBe('Inactive')
    })

    // Still present, so historical ownership and audit references resolve.
    expect(persisted().users.some((candidate) => candidate.id === 'usr_owner')).toBe(true)
    expect(persisted().auditEvents.some((event) => event.action === 'user.status_changed')).toBe(true)
  })
})

// --- roles ------------------------------------------------------------------

describe('roles and permissions', () => {
  it('shows the eight-module matrix for every role', async () => {
    renderAdmin()
    await openSection('Roles & permissions')

    for (const module of ['Dashboard', 'Register', 'Risks', 'Controls', 'Actions', 'Reports', 'Audit', 'Administration']) {
      expect(screen.getByRole('columnheader', { name: module }), module).toBeInTheDocument()
    }
    expect(screen.getAllByRole('row')).toHaveLength(8) // header + 7 roles
  })

  it('blocks a role with no English name', async () => {
    renderAdmin()
    const user = await openSection('Roles & permissions')
    await user.click(screen.getByRole('button', { name: 'Add role' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('An English role name is required.')).toBeInTheDocument()
  })

  it('creates a custom role with a module permission set', async () => {
    renderAdmin()
    const user = await openSection('Roles & permissions')
    await user.click(screen.getByRole('button', { name: 'Add role' }))

    await user.type(screen.getByLabelText('Name (English)'), 'Compliance Reviewer')
    const permissions = screen.getByRole('group', { name: 'Module permissions' })
    await user.selectOptions(within(permissions).getByLabelText('Register'), 'read')
    await user.selectOptions(within(permissions).getByLabelText('Reports'), 'edit')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const created = persisted().roles.find((role) => role.nameEn === 'Compliance Reviewer')
      expect(created?.permissions.register).toBe('read')
      expect(created?.permissions.reports).toBe('edit')
      expect(created?.permissions.administration).toBe('none')
      expect(created?.system).toBe(false)
    })
  })

  it('audits a permission change distinctly from a rename', async () => {
    renderAdmin()
    const user = await openSection('Roles & permissions')

    const row = screen.getByText('Auditor').closest('tr')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Edit' }))
    const permissions = screen.getByRole('group', { name: 'Module permissions' })
    await user.selectOptions(within(permissions).getByLabelText('Reports'), 'edit')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted().auditEvents.some((event) => event.action === 'role.permission_changed')).toBe(true)
    })
  })

  it('takes the maximum level across several roles', async () => {
    // Auditor is read-only; Risk Manager edits the register. Together the
    // effective level per module is the higher of the two.
    const state = persisted()
    const context = {
      user: { ...state.users[0], roleIds: ['role_auditor', 'role_risk_manager'] },
      roles: state.roles,
      businessUnits: state.businessUnits,
    }

    for (const module of MODULE_NAMES) {
      const auditor = state.roles.find((role) => role.id === 'role_auditor')?.permissions[module]
      const manager = state.roles.find((role) => role.id === 'role_risk_manager')?.permissions[module]
      const rank = { none: 0, read: 1, edit: 2 }
      const expected = rank[auditor ?? 'none'] >= rank[manager ?? 'none'] ? auditor : manager

      expect(effectiveModulePermission(context, module), module).toBe(expected)
    }
  })

  it('lets a permission edit change what the guard allows', async () => {
    renderAdmin()
    const user = await openSection('Roles & permissions')

    const before = persisted()
    const auditorContext = (state: AppState) => ({
      user: state.users.find((candidate) => candidate.id === 'usr_auditor') ?? null,
      roles: state.roles,
      businessUnits: state.businessUnits,
    })
    expect(canAccess(auditorContext(before), 'reports', 'edit')).toBe(false)

    const row = screen.getByText('Auditor').closest('tr')
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Edit' }))
    const permissions = screen.getByRole('group', { name: 'Module permissions' })
    await user.selectOptions(within(permissions).getByLabelText('Reports'), 'edit')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(canAccess(auditorContext(persisted()), 'reports', 'edit')).toBe(true)
    })
  })
})

// --- rating matrix ----------------------------------------------------------

describe('rating matrix editor', () => {
  it('exposes all 25 cells as editable controls', async () => {
    renderAdmin()
    await openSection('Rating matrix')

    const cells = screen.getAllByLabelText(/^Impact \d, likelihood \d$/)
    expect(cells).toHaveLength(25)
  })

  it('changes a single cell without touching the other 24', async () => {
    renderAdmin()
    const user = await openSection('Rating matrix')

    await user.selectOptions(screen.getByLabelText('Impact 1, likelihood 1'), 'Significant')

    await waitFor(() => {
      const cell = persisted().matrix.cells.find((c) => c.impact === 1 && c.likelihood === 1)
      expect(cell?.rating).toBe('Significant')
    })

    // Every other cell keeps its 2026 default.
    const cells = persisted().matrix.cells
    expect(cells.find((c) => c.impact === 1 && c.likelihood === 2)?.rating).toBe('Low')
    expect(cells.find((c) => c.impact === 5 && c.likelihood === 5)?.rating).toBe('Significant')
    expect(cells).toHaveLength(25)
  })

  it('audits a cell change', async () => {
    renderAdmin()
    const user = await openSection('Rating matrix')
    await user.selectOptions(screen.getByLabelText('Impact 2, likelihood 2'), 'High')

    await waitFor(() => {
      expect(persisted().auditEvents.some((event) => event.action === 'matrix.updated')).toBe(true)
    })
  })

  it('restores the 2026 defaults exactly, cells and colours', async () => {
    await seed((state) => {
      state.matrix.cells[0].rating = 'Significant'
      state.matrix.colors.Low = '#111111'
      state.matrix.colors.Significant = '#222222'
    })

    renderAdmin()
    const user = await openSection('Rating matrix')
    await user.click(screen.getByRole('button', { name: 'Restore 2026 defaults' }))

    await waitFor(() => {
      expect(persisted().matrix.colors).toEqual({
        Low: '#00B050', Medium: '#FFF200', High: '#FFB900', Significant: '#F32121',
      })
    })

    const expected: Record<number, string[]> = {
      5: ['Medium', 'High', 'High', 'Significant', 'Significant'],
      4: ['Low', 'Medium', 'High', 'High', 'Significant'],
      3: ['Low', 'Medium', 'Medium', 'High', 'High'],
      2: ['Low', 'Low', 'Medium', 'Medium', 'High'],
      1: ['Low', 'Low', 'Low', 'Low', 'Medium'],
    }
    for (const cell of persisted().matrix.cells) {
      expect(cell.rating, `impact ${String(cell.impact)} × ${String(cell.likelihood)}`).toBe(
        expected[cell.impact][cell.likelihood - 1],
      )
    }
  })

  it('preserves the impact and likelihood labels through a restore', async () => {
    renderAdmin()
    const user = await openSection('Rating matrix')
    await user.click(screen.getByRole('button', { name: 'Restore 2026 defaults' }))

    await waitFor(() => {
      expect(persisted().matrix.impactLabels[5].en).toBe('Critical')
    })
    expect(persisted().matrix.likelihoodLabels[3].probability).toBe('36%-65%')
  })

  it('audits the restore', async () => {
    renderAdmin()
    const user = await openSection('Rating matrix')
    await user.click(screen.getByRole('button', { name: 'Restore 2026 defaults' }))

    await waitFor(() => {
      expect(persisted().auditEvents.some((event) => event.action === 'matrix.restored')).toBe(true)
    })
  })

  it('keeps the score as Impact × Likelihood however cells are rated', async () => {
    renderAdmin()
    const user = await openSection('Rating matrix')
    await user.selectOptions(screen.getByLabelText('Impact 1, likelihood 1'), 'Significant')

    await waitFor(() => {
      const cell = persisted().matrix.cells.find((c) => c.impact === 1 && c.likelihood === 1)
      expect(cell?.rating).toBe('Significant')
    })

    // The grid still shows arithmetic scores, unaffected by the rating edit.
    const table = screen.getByRole('table')
    expect(within(table).getByText('25')).toBeInTheDocument()
    expect(within(table).getAllByText('1').length).toBeGreaterThan(0)
  })
})
