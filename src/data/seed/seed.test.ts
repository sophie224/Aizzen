import { describe, expect, it } from 'vitest'
import { MODULE_NAMES, SCALE_VALUES, SCHEMA_VERSION } from '../../domain/types/index.ts'
import type { ModuleName, PermissionLevel, RatingLabel, ScaleValue } from '../../domain/types/index.ts'
import { validateAppState } from '../../domain/validation/index.ts'
import { createSeedState, LEVEL_1_GROUPS } from './index.ts'

/** The default role matrix from ARCHITECTURE.md §5.2, transcribed for assertion. */
const EXPECTED_PERMISSIONS: Record<string, Record<ModuleName, PermissionLevel>> = {
  role_super_admin: {
    dashboard: 'edit', register: 'edit', risks: 'edit', controls: 'edit',
    actions: 'edit', reports: 'edit', audit: 'edit', administration: 'edit',
  },
  role_admin: {
    dashboard: 'edit', register: 'edit', risks: 'edit', controls: 'edit',
    actions: 'edit', reports: 'edit', audit: 'edit', administration: 'edit',
  },
  role_risk_manager: {
    dashboard: 'read', register: 'edit', risks: 'edit', controls: 'edit',
    actions: 'edit', reports: 'edit', audit: 'read', administration: 'none',
  },
  role_risk_owner: {
    dashboard: 'read', register: 'read', risks: 'edit', controls: 'edit',
    actions: 'edit', reports: 'read', audit: 'read', administration: 'none',
  },
  role_control_owner: {
    dashboard: 'read', register: 'read', risks: 'read', controls: 'edit',
    actions: 'read', reports: 'none', audit: 'read', administration: 'none',
  },
  role_action_owner: {
    dashboard: 'read', register: 'read', risks: 'read', controls: 'read',
    actions: 'edit', reports: 'none', audit: 'read', administration: 'none',
  },
  role_auditor: {
    dashboard: 'read', register: 'read', risks: 'read', controls: 'read',
    actions: 'read', reports: 'read', audit: 'read', administration: 'none',
  },
}

describe('seed state', () => {
  it('is at the current schema version', () => {
    expect(createSeedState().schemaVersion).toBe(SCHEMA_VERSION)
    expect(SCHEMA_VERSION).toBe(13)
  })

  it('passes canonical validation', () => {
    const result = validateAppState(createSeedState())
    expect(result.ok ? [] : result.errors).toEqual([])
  })

  it('returns independent objects on each call', () => {
    const first = createSeedState()
    const second = createSeedState()

    first.categories[0].active = false
    expect(second.categories[0].active).toBe(true)
    expect(first.matrix).not.toBe(second.matrix)
  })
})

describe('seed roles', () => {
  it('defines exactly seven roles', () => {
    expect(createSeedState().roles).toHaveLength(7)
  })

  it('matches the documented permission matrix for every role and module', () => {
    const roles = createSeedState().roles

    expect(roles.map((role) => role.id).sort()).toEqual(Object.keys(EXPECTED_PERMISSIONS).sort())

    for (const role of roles) {
      for (const module of MODULE_NAMES) {
        expect(
          role.permissions[module],
          `${role.id}.${module}`,
        ).toBe(EXPECTED_PERMISSIONS[role.id][module])
      }
    }
  })

  it('grants Administration only to the two administrator roles', () => {
    const withAdmin = createSeedState()
      .roles.filter((role) => role.permissions.administration !== 'none')
      .map((role) => role.id)

    expect(withAdmin.sort()).toEqual(['role_admin', 'role_super_admin'])
  })

  it('gives the Auditor read everywhere except Administration', () => {
    const auditor = createSeedState().roles.find((role) => role.id === 'role_auditor')
    expect(auditor).toBeDefined()

    for (const module of MODULE_NAMES) {
      expect(auditor?.permissions[module]).toBe(module === 'administration' ? 'none' : 'read')
    }
  })

  it('marks all seven as system roles', () => {
    expect(createSeedState().roles.every((role) => role.system)).toBe(true)
  })
})

describe('seed categories', () => {
  it('provides 38 Level-2 categories across 5 Level-1 groups', () => {
    const categories = createSeedState().categories

    expect(categories).toHaveLength(38)
    expect(new Set(categories.map((category) => category.level1En)).size).toBe(5)
    expect(LEVEL_1_GROUPS).toEqual([
      'Strategic',
      'Reputational',
      'Operational',
      'Legal and Compliance',
      'Financial',
    ])
  })

  it('keeps the legacy id sequence so v7 risk references still resolve', () => {
    const categories = createSeedState().categories

    expect(categories[0].id).toBe('cat_01')
    expect(categories[37].id).toBe('cat_38')
    expect(categories.find((category) => category.id === 'cat_16')?.level2En).toBe('Data Governance')
  })

  it('gives every Level-1 group a Georgian label and every category an English one', () => {
    for (const category of createSeedState().categories) {
      expect(category.level1Ka.length).toBeGreaterThan(0)
      expect(category.level1En.length).toBeGreaterThan(0)
      expect(category.level2En.length).toBeGreaterThan(0)
    }
  })
})

describe('seed rating matrix', () => {
  const DEFAULT_2026: Record<ScaleValue, readonly RatingLabel[]> = {
    5: ['Medium', 'High', 'High', 'Significant', 'Significant'],
    4: ['Low', 'Medium', 'High', 'High', 'Significant'],
    3: ['Low', 'Medium', 'Medium', 'High', 'High'],
    2: ['Low', 'Low', 'Medium', 'Medium', 'High'],
    1: ['Low', 'Low', 'Low', 'Low', 'Medium'],
  }

  it('defines all 25 cells exactly once', () => {
    const cells = createSeedState().matrix.cells
    expect(cells).toHaveLength(25)

    const keys = cells.map((cell) => `${String(cell.impact)}:${String(cell.likelihood)}`)
    expect(new Set(keys).size).toBe(25)
  })

  it('matches the 2026 defaults cell by cell', () => {
    const cells = createSeedState().matrix.cells

    for (const impact of SCALE_VALUES) {
      for (const likelihood of SCALE_VALUES) {
        const cell = cells.find((c) => c.impact === impact && c.likelihood === likelihood)
        expect(
          cell?.rating,
          `impact ${String(impact)} x likelihood ${String(likelihood)}`,
        ).toBe(DEFAULT_2026[impact][likelihood - 1])
      }
    }
  })

  it('uses the documented default colours', () => {
    expect(createSeedState().matrix.colors).toEqual({
      Low: '#00B050',
      Medium: '#FFF200',
      High: '#FFB900',
      Significant: '#F32121',
    })
  })

  it('carries bilingual impact and likelihood labels with probability bands', () => {
    const matrix = createSeedState().matrix

    expect(matrix.impactLabels[1].en).toBe('Minor')
    expect(matrix.impactLabels[5].en).toBe('Critical')
    expect(matrix.likelihoodLabels[3].percentFrom).toBe(36)
    expect(matrix.likelihoodLabels[3].percentTo).toBe(65)
    expect(matrix.likelihoodLabels[5].en).toBe('Almost Certain')
  })
})

describe('seed business units', () => {
  it('forms a single-rooted tree', () => {
    const units = createSeedState().businessUnits
    const roots = units.filter((unit) => unit.parentId === null)

    expect(roots).toHaveLength(1)
    expect(roots[0].id).toBe('bu_enterprise')
  })

  it('resolves every parent reference', () => {
    const units = createSeedState().businessUnits
    const ids = new Set(units.map((unit) => unit.id))

    for (const unit of units) {
      if (unit.parentId !== null) expect(ids.has(unit.parentId)).toBe(true)
    }
  })

  it('nests Information Security and IT Operations under Technology Division', () => {
    const units = createSeedState().businessUnits
    const parentOf = (id: string) => units.find((unit) => unit.id === id)?.parentId

    expect(parentOf('bu_security')).toBe('bu_technology')
    expect(parentOf('bu_operations')).toBe('bu_technology')
    expect(parentOf('bu_technology')).toBe('bu_enterprise')
  })

  it('uses unique uppercase codes', () => {
    const codes = createSeedState().businessUnits.map((unit) => unit.code)

    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) expect(code).toBe(code.toUpperCase())
  })
})

describe('seed users', () => {
  it('includes the PRD test administrators', () => {
    const emails = createSeedState().users.map((user) => user.email)

    expect(emails).toContain('admin@erm.local')
    expect(emails).toContain('s.pkhikidze@aizzen.com')
    expect(emails).toContain('d.baghdavadze@aizzen.com')
  })

  it('covers every system role at least once', () => {
    const state = createSeedState()
    const assigned = new Set(state.users.flatMap((user) => user.roleIds))

    for (const role of state.roles) expect(assigned.has(role.id)).toBe(true)
  })

  it('gives every user at least one role and one direct scope', () => {
    for (const user of createSeedState().users) {
      expect(user.roleIds.length).toBeGreaterThan(0)
      expect(user.businessUnitIds.length).toBeGreaterThan(0)
    }
  })

  it('has no user pre-linked to a Google account', () => {
    // Linking happens on first verified sign-in, never in seed data
    // (ARCHITECTURE.md §6.2).
    expect(createSeedState().users.every((user) => user.googleSub === undefined)).toBe(true)
  })
})

describe('seed reporting defaults', () => {
  it('ships one dashboard and one report template', () => {
    const state = createSeedState()

    expect(state.dashboards).toHaveLength(1)
    expect(state.reportTemplates).toHaveLength(1)
  })

  it('uses all three report section types', () => {
    const sections = createSeedState().reportTemplates[0].sections

    expect(sections.map((section) => section.type)).toEqual([
      'openText',
      'dashboard',
      'compactRegister',
    ])
  })

  it('points the dashboard section at an existing dashboard', () => {
    const state = createSeedState()
    const ids = new Set(state.dashboards.map((dashboard) => dashboard.id))

    for (const section of state.reportTemplates[0].sections) {
      if (section.type === 'dashboard') expect(ids.has(section.dashboardId)).toBe(true)
    }
  })

  it('never leaves a compact register section with zero columns', () => {
    for (const section of createSeedState().reportTemplates[0].sections) {
      if (section.type === 'compactRegister') expect(section.columns.length).toBeGreaterThan(0)
    }
  })
})
