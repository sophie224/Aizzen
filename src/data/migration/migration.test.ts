import { describe, expect, it } from 'vitest'
import baseline from '../../../fixtures/legacy-state.json'
import type { AppState } from '../../domain/types/index.ts'
import { validateAppState } from '../../domain/validation/app-state.ts'
import { createSeedState } from '../seed/index.ts'
import { migrateState } from './index.ts'

/** Migrates and fails loudly with the validation errors if it did not work. */
function migrate(raw: unknown): { state: AppState; notes: string[] } {
  const outcome = migrateState(raw)
  if (!outcome.ok) throw new Error(`migration failed: ${outcome.errors.slice(0, 5).join('; ')}`)
  return { state: outcome.result.state, notes: outcome.result.notes }
}

const BASELINE_COUNTS = {
  users: 8,
  roles: 7,
  categories: 38,
  businessUnits: 7,
  customAttributes: 3,
  risks: 8,
  controls: 6,
  actions: 10,
  historyItems: 13,
  riskAuditEvents: 3,
  auditEvents: 4,
  matrixCells: 25,
}

const BASELINE_REFS = ['IT-001', 'IT-002', 'PPL-001', 'IT-003', 'LRC-001', 'IT-004', 'IT-005', 'LRC-002']

function countNested(state: AppState, key: 'controls' | 'actions' | 'history' | 'audit'): number {
  return state.risks.reduce((total, risk) => total + risk[key].length, 0)
}

describe('legacy v7 -> v8 migration', () => {
  it('produces state that satisfies canonical validation', () => {
    const { state } = migrate(baseline)
    expect(validateAppState(state).ok).toBe(true)
    expect(state.schemaVersion).toBe(8)
  })

  it('preserves every collection count', () => {
    const { state } = migrate(baseline)

    expect({
      users: state.users.length,
      roles: state.roles.length,
      categories: state.categories.length,
      businessUnits: state.businessUnits.length,
      customAttributes: state.customAttributes.length,
      risks: state.risks.length,
      controls: countNested(state, 'controls'),
      actions: countNested(state, 'actions'),
      historyItems: countNested(state, 'history'),
      riskAuditEvents: countNested(state, 'audit'),
      auditEvents: state.auditEvents.length,
      matrixCells: state.matrix.cells.length,
    }).toEqual(BASELINE_COUNTS)
  })

  it('preserves risk IDs and references exactly', () => {
    const { state } = migrate(baseline)

    expect(state.risks.map((risk) => risk.ref)).toEqual(BASELINE_REFS)
    expect(state.risks.map((risk) => risk.id)).toEqual(baseline.state.risks.map((risk) => risk.id))
  })

  it('preserves every assessment score unchanged', () => {
    const { state } = migrate(baseline)

    state.risks.forEach((risk, index) => {
      const original = baseline.state.risks[index]
      expect(risk.inherent).toEqual(original.inherent)
      expect(risk.residual).toEqual(original.residual)
      expect(risk.target).toEqual(original.target)
    })
  })

  it('preserves control and action IDs', () => {
    const { state } = migrate(baseline)

    const controlIds = state.risks.flatMap((risk) => risk.controls.map((control) => control.id))
    const originalControlIds = baseline.state.risks.flatMap((risk) => risk.controls.map((c) => c.id))
    expect(controlIds).toEqual(originalControlIds)

    const actionIds = state.risks.flatMap((risk) => risk.actions.map((action) => action.id))
    const originalActionIds = baseline.state.risks.flatMap((risk) => risk.actions.map((a) => a.id))
    expect(actionIds).toEqual(originalActionIds)
  })

  it('renames the top-level keys', () => {
    const { state } = migrate(baseline)
    const keys = Object.keys(state)

    for (const canonical of ['schemaVersion', 'customAttributes', 'auditEvents', 'savedViews', 'ssoConfig', 'branding']) {
      expect(keys).toContain(canonical)
    }
    for (const legacy of ['version', 'attributes', 'globalAudit', 'savedFilters', 'sso', 'clientLogo']) {
      expect(keys).not.toContain(legacy)
    }
  })

  it('renames per-record fields', () => {
    const { state } = migrate(baseline)

    expect(state.categories[0].level1En).toBe(baseline.state.categories[0].level1)
    expect(state.categories[0].level2En).toBe(baseline.state.categories[0].level2)
    expect(state.businessUnits[0].nameEn).toBe(baseline.state.businessUnits[0].name)
    expect(state.customAttributes[0].labelEn).toBe(baseline.state.attributes[0].nameEn)
    expect(state.users[0].roleIds).toEqual(baseline.state.users[0].roles)
    expect(state.roles[0].nameEn).toBe(baseline.state.roles[0].name)
  })

  it('adds the acceptance record v7 never stored', () => {
    expect('acceptance' in baseline.state.risks[0]).toBe(false)

    const { state } = migrate(baseline)
    for (const risk of state.risks) {
      expect(risk.acceptance).toEqual({
        rationale: '', initiatorId: '', approverId: '',
        approvalDate: '', validUntil: '', reviewDate: '',
      })
    }
  })

  it('drops session-local values from persisted state', () => {
    const keys = Object.keys(migrate(baseline).state)
    expect(keys).not.toContain('language')
    expect(keys).not.toContain('currentUserId')
  })

  it('moves the client logo into branding', () => {
    const { state } = migrate(baseline)
    expect(state.branding.clientLogo).toBe(baseline.state.clientLogo)
  })

  it('normalises widget and report section type slugs', () => {
    const { state } = migrate(baseline)

    const legacyWidgetTypes = new Set(
      baseline.state.dashboards.flatMap((d) => d.widgets.map((w) => w.type)),
    )
    expect(legacyWidgetTypes.has('top-risks')).toBe(true)

    for (const dashboard of state.dashboards) {
      for (const widget of dashboard.widgets) {
        expect(widget.type).not.toContain('-')
      }
    }
    for (const template of state.reportTemplates) {
      for (const section of template.sections) {
        expect(['dashboard', 'openText', 'compactRegister']).toContain(section.type)
      }
    }
  })

  it('keeps report sections pointing at dashboards that exist', () => {
    const { state } = migrate(baseline)
    const ids = new Set(state.dashboards.map((dashboard) => dashboard.id))

    for (const template of state.reportTemplates) {
      for (const section of template.sections) {
        if (section.type === 'dashboard') expect(ids.has(section.dashboardId)).toBe(true)
      }
    }
  })
})

describe('migration idempotence', () => {
  it('produces a byte-identical result when run twice', () => {
    const once = migrate(baseline).state
    const twice = migrate(once).state

    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })

  it('is a no-op on freshly seeded state', () => {
    const seeded = createSeedState()
    const migrated = migrate(seeded).state

    expect(JSON.stringify(migrated)).toBe(JSON.stringify(seeded))
  })

  it('reports no repairs for already-valid state', () => {
    expect(migrate(createSeedState()).notes).toEqual([])
  })

  it('converges after the first pass — a third run changes nothing', () => {
    const first = migrate(baseline).state
    const second = migrate(first).state
    const third = migrate(second).state

    expect(JSON.stringify(third)).toBe(JSON.stringify(second))
  })
})

describe('migration rejects unusable input', () => {
  it('rejects a non-object root', () => {
    for (const value of [null, 42, 'nope', []]) {
      expect(migrateState(value).ok).toBe(false)
    }
  })

  it('rejects a payload missing risks or users', () => {
    expect(migrateState({ users: [] }).ok).toBe(false)
    expect(migrateState({ risks: [] }).ok).toBe(false)
  })

  it('does not mutate the input payload', () => {
    const before = JSON.stringify(baseline)
    migrate(baseline)
    expect(JSON.stringify(baseline)).toBe(before)
  })
})

describe('repair: missing Super Administrator', () => {
  it('restores the role when it has been deleted', () => {
    const seeded = createSeedState()
    seeded.roles = seeded.roles.filter((role) => role.id !== 'role_super_admin')

    const { state, notes } = migrate(seeded)
    expect(state.roles.some((role) => role.id === 'role_super_admin')).toBe(true)
    expect(notes.join(' ')).toContain('Super Administrator role')
  })

  it('restores a user holding the role when none remains', () => {
    const seeded = createSeedState()
    seeded.users = seeded.users.filter((user) => !user.roleIds.includes('role_super_admin'))

    const { state, notes } = migrate(seeded)
    expect(state.users.some((user) => user.roleIds.includes('role_super_admin'))).toBe(true)
    expect(notes.join(' ')).toContain('Super Administrator user')
  })
})

describe('repair: business unit tree', () => {
  it('promotes flat units with no parentId to roots', () => {
    const seeded = createSeedState()
    seeded.businessUnits = seeded.businessUnits.map((unit) => {
      const copy = { ...unit } as Partial<typeof unit>
      delete copy.parentId
      return copy as typeof unit
    })

    const { state, notes } = migrate(seeded)
    expect(state.businessUnits.every((unit) => unit.parentId === null)).toBe(true)
    expect(notes.join(' ')).toContain('promoted to root')
  })

  it('clears a unit that is its own parent', () => {
    const seeded = createSeedState()
    seeded.businessUnits[1].parentId = seeded.businessUnits[1].id

    const { state, notes } = migrate(seeded)
    expect(state.businessUnits[1].parentId).toBeNull()
    expect(notes.join(' ')).toContain('its own parent')
  })

  it('clears a parent reference that does not resolve', () => {
    const seeded = createSeedState()
    seeded.businessUnits[2].parentId = 'bu_deleted'

    const { state, notes } = migrate(seeded)
    expect(state.businessUnits[2].parentId).toBeNull()
    expect(notes.join(' ')).toContain('does not exist')
  })

  it('breaks a cycle between two units', () => {
    const seeded = createSeedState()
    // Enterprise -> Technology -> Enterprise
    seeded.businessUnits[0].parentId = seeded.businessUnits[1].id
    seeded.businessUnits[1].parentId = seeded.businessUnits[0].id

    const { state, notes } = migrate(seeded)
    expect(notes.join(' ')).toContain('cycle')

    // No node may still reach itself through parent links.
    const byId = new Map(state.businessUnits.map((unit) => [unit.id, unit]))
    for (const unit of state.businessUnits) {
      const seen = new Set<string>([unit.id])
      let cursor = unit.parentId ? byId.get(unit.parentId) : undefined
      while (cursor) {
        expect(seen.has(cursor.id)).toBe(false)
        seen.add(cursor.id)
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
      }
    }
  })
})

describe('repair: dangling references', () => {
  it('removes business unit IDs from user scopes when the unit is gone', () => {
    const seeded = createSeedState()
    seeded.users[0].businessUnitIds = ['bu_enterprise', 'bu_deleted']

    const { state, notes } = migrate(seeded)
    expect(state.users[0].businessUnitIds).toEqual(['bu_enterprise'])
    expect(notes.join(' ')).toContain('business unit references')
  })

  it('fills a role permission set that is missing modules', () => {
    const seeded = createSeedState()
    delete (seeded.roles[2].permissions as Record<string, unknown>).administration

    const { state, notes } = migrate(seeded)
    expect(state.roles[2].permissions.administration).toBe('none')
    expect(notes.join(' ')).toContain('module permissions')
  })
})

describe('repair: saved views', () => {
  it('restores missing columns and view mode', () => {
    const seeded = createSeedState()
    seeded.savedViews = [
      {
        id: 'view_old', name: 'Legacy view', userId: 'usr_admin',
        search: '', filters: {}, sort: { field: 'ref', direction: 'asc' },
        visibleColumns: [], viewMode: undefined as unknown as 'compact', isDefault: false,
      },
    ]

    const { state, notes } = migrate(seeded)
    expect(state.savedViews[0].visibleColumns.length).toBeGreaterThan(0)
    expect(state.savedViews[0].viewMode).toBe('detailed')
    expect(notes.join(' ')).toContain('saved view')
  })
})

describe('repair: missing defaults', () => {
  it('restores the default dashboard, report template and site content', () => {
    const seeded = createSeedState()
    seeded.dashboards = []
    seeded.reportTemplates = []
    seeded.siteContent = {} as AppState['siteContent']

    const { state, notes } = migrate(seeded)
    expect(state.dashboards.length).toBeGreaterThan(0)
    expect(state.reportTemplates.length).toBeGreaterThan(0)
    expect(Object.keys(state.siteContent).length).toBeGreaterThan(0)
    expect(notes.join(' ')).toContain('default dashboard')
  })
})

describe('repair: rating matrix', () => {
  it('restores missing cells while preserving configured ones', () => {
    const seeded = createSeedState()
    // Keep a deliberately non-default rating, then delete the rest.
    const kept = seeded.matrix.cells.find((cell) => cell.impact === 1 && cell.likelihood === 1)
    if (kept) kept.rating = 'Significant'
    seeded.matrix.cells = seeded.matrix.cells.slice(0, 3)

    const { state, notes } = migrate(seeded)
    expect(state.matrix.cells).toHaveLength(25)
    expect(
      state.matrix.cells.find((cell) => cell.impact === 1 && cell.likelihood === 1)?.rating,
    ).toBe('Significant')
    expect(notes.join(' ')).toContain('missing or invalid cell')
  })

  it('restores missing colours while preserving configured ones', () => {
    const seeded = createSeedState()
    seeded.matrix.colors.Low = '#123456'
    delete (seeded.matrix.colors as Record<string, unknown>).Significant

    const { state, notes } = migrate(seeded)
    expect(state.matrix.colors.Low).toBe('#123456')
    expect(state.matrix.colors.Significant).toBe('#F32121')
    expect(notes.join(' ')).toContain('colour')
  })

  it('rebuilds the matrix entirely when it is absent', () => {
    const seeded = createSeedState()
    delete (seeded as Partial<AppState>).matrix

    const { state } = migrate(seeded)
    expect(state.matrix.cells).toHaveLength(25)
    expect(state.matrix.colors.Low).toBe('#00B050')
  })
})
