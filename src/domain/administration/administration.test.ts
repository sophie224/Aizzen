import { describe, expect, it } from 'vitest'
import type { BusinessUnit, Category, CustomAttribute, Risk, User } from '../types/index.ts'
import {
  administrationMetrics,
  attributeUsageCount,
  businessUnitCounts,
  categoryUsageCount,
  formatAttributeOptions,
  parseAttributeOptions,
  splitScope,
  validateBusinessUnit,
  validateCategory,
  validateCustomAttribute,
} from './index.ts'
import type { AppState } from '../types/index.ts'

// --- fixtures ---------------------------------------------------------------

const UNITS: BusinessUnit[] = [
  { id: 'bu_enterprise', code: 'ENT', nameEn: 'Enterprise', nameKa: '', parentId: null, active: true },
  { id: 'bu_technology', code: 'TECH', nameEn: 'Technology Division', nameKa: '', parentId: 'bu_enterprise', active: true },
  { id: 'bu_security', code: 'SEC', nameEn: 'Information Security', nameKa: '', parentId: 'bu_technology', active: true },
  { id: 'bu_operations', code: 'OPS', nameEn: 'IT Operations', nameKa: '', parentId: 'bu_technology', active: true },
  { id: 'bu_retired', code: 'OLD', nameEn: 'Retired', nameKa: '', parentId: 'bu_enterprise', active: false },
]

function category(overrides: Partial<Category> = {}): Category {
  return { id: 'cat_1', level1En: 'Operational', level1Ka: '', level2En: 'Cyber', level2Ka: '', active: true, ...overrides }
}

function unit(overrides: Partial<BusinessUnit> = {}): BusinessUnit {
  return { id: 'bu_new', code: 'NEW', nameEn: 'New unit', nameKa: '', parentId: null, active: true, ...overrides }
}

function attribute(overrides: Partial<CustomAttribute> = {}): CustomAttribute {
  return { id: 'attr_1', labelEn: 'Appetite', labelKa: '', type: 'text', options: [], active: true, showInRegister: false, ...overrides }
}

function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk_1', ref: 'TECH-001', title: 'A risk', type: 'Current',
    categoryId: 'cat_1', businessUnitId: 'bu_technology', riskOwnerId: 'usr_1',
    originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
    status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
    cause: 'c', event: 'e', consequence: 'q', statusNarrative: '',
    inherent: { impact: 3, likelihood: 3 }, residual: { impact: 2, likelihood: 2 }, target: { impact: 1, likelihood: 1 },
    controls: [], actions: [],
    acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
    custom: {}, history: [], audit: [], updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'usr_1', name: 'A user', title: '', email: 'a@erm.local', password: 'p',
    status: 'Active', roleIds: ['role_admin'], businessUnitIds: ['bu_technology'], ...overrides,
  }
}

// --- overview metrics -------------------------------------------------------

describe('administrationMetrics', () => {
  const state = {
    categories: [category(), category({ id: 'cat_2', active: false })],
    businessUnits: UNITS,
    users: [user(), user({ id: 'usr_2', status: 'Inactive' })],
    customAttributes: [attribute(), attribute({ id: 'attr_2', active: false })],
    roles: [{ id: 'role_admin' }, { id: 'role_auditor' }],
    auditEvents: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }],
  } as unknown as AppState

  it('counts only active categories, units, users and attributes', () => {
    const metrics = administrationMetrics(state)

    expect(metrics.activeCategories).toBe(1)
    expect(metrics.activeBusinessUnits).toBe(4) // bu_retired is inactive
    expect(metrics.activeUsers).toBe(1)
    expect(metrics.activeCustomAttributes).toBe(1)
  })

  it('counts ALL roles, not just active ones', () => {
    expect(administrationMetrics(state).roles).toBe(2)
  })

  it('counts every audit event', () => {
    expect(administrationMetrics(state).auditEvents).toBe(3)
  })
})

// --- categories -------------------------------------------------------------

describe('validateCategory', () => {
  it('accepts a category with both English labels', () => {
    expect(validateCategory(category())).toEqual([])
  })

  it('blocks an empty Level 1 English label', () => {
    expect(validateCategory(category({ level1En: '' })).map((i) => i.field)).toContain('level1En')
    expect(validateCategory(category({ level1En: '   ' })).map((i) => i.field)).toContain('level1En')
  })

  it('blocks an empty Level 2 English label', () => {
    expect(validateCategory(category({ level2En: '' })).map((i) => i.field)).toContain('level2En')
  })

  it('does not require Georgian labels', () => {
    expect(validateCategory(category({ level1Ka: '', level2Ka: '' }))).toEqual([])
  })
})

describe('categoryUsageCount', () => {
  it('counts risks still referencing the category', () => {
    const risks = [risk(), risk({ id: 'r2', categoryId: 'cat_2' }), risk({ id: 'r3' })]
    expect(categoryUsageCount(risks, 'cat_1')).toBe(2)
    expect(categoryUsageCount(risks, 'cat_none')).toBe(0)
  })
})

// --- business units ---------------------------------------------------------

describe('validateBusinessUnit', () => {
  it('accepts a valid new unit', () => {
    expect(validateBusinessUnit(unit(), { units: UNITS })).toEqual([])
  })

  it('blocks an empty code or English name', () => {
    expect(validateBusinessUnit(unit({ code: '' }), { units: UNITS }).map((i) => i.field)).toContain('code')
    expect(validateBusinessUnit(unit({ nameEn: '  ' }), { units: UNITS }).map((i) => i.field)).toContain('nameEn')
  })

  it('blocks a duplicate code, case-insensitively', () => {
    expect(validateBusinessUnit(unit({ code: 'TECH' }), { units: UNITS }).map((i) => i.field)).toContain('code')
    expect(validateBusinessUnit(unit({ code: 'tech' }), { units: UNITS }).map((i) => i.field)).toContain('code')
  })

  it('allows a unit to keep its own code while editing', () => {
    const editing = { units: UNITS, editingId: 'bu_technology' }
    expect(validateBusinessUnit(unit({ id: 'bu_technology', code: 'TECH', parentId: 'bu_enterprise' }), editing)).toEqual([])
  })

  it('blocks a unit set as its own parent', () => {
    const issues = validateBusinessUnit(
      unit({ id: 'bu_technology', code: 'TECH', parentId: 'bu_technology' }),
      { units: UNITS, editingId: 'bu_technology' },
    )
    expect(issues.map((i) => i.messageKey)).toContain('admin.error.selfParent')
  })

  it('blocks a descendant chosen as parent, which would create a cycle', () => {
    const issues = validateBusinessUnit(
      unit({ id: 'bu_technology', code: 'TECH', parentId: 'bu_security' }),
      { units: UNITS, editingId: 'bu_technology' },
    )
    expect(issues.map((i) => i.messageKey)).toContain('admin.error.cycle')
  })

  it('blocks a parent that does not exist', () => {
    const issues = validateBusinessUnit(unit({ parentId: 'bu_ghost' }), { units: UNITS })
    expect(issues.map((i) => i.messageKey)).toContain('admin.error.parentMissing')
  })

  it('allows a valid move to another branch', () => {
    const issues = validateBusinessUnit(
      unit({ id: 'bu_security', code: 'SEC', parentId: 'bu_enterprise' }),
      { units: UNITS, editingId: 'bu_security' },
    )
    expect(issues).toEqual([])
  })
})

describe('businessUnitCounts', () => {
  const users = [
    user({ id: 'u1', businessUnitIds: ['bu_technology'] }),
    user({ id: 'u2', businessUnitIds: ['bu_technology', 'bu_finance'] }),
    user({ id: 'u3', businessUnitIds: ['bu_security'] }),
  ]
  const risks = [
    risk({ id: 'r1', businessUnitId: 'bu_technology' }),
    risk({ id: 'r2', businessUnitId: 'bu_security' }),
    risk({ id: 'r3', businessUnitId: 'bu_security' }),
  ]

  it('counts DIRECT users only, not inherited ones', () => {
    const technology = UNITS[1]
    expect(businessUnitCounts(technology, UNITS, users, risks).directUsers).toBe(2)
  })

  it('counts DIRECTLY scoped risks only', () => {
    expect(businessUnitCounts(UNITS[1], UNITS, users, risks).directRisks).toBe(1)
    expect(businessUnitCounts(UNITS[2], UNITS, users, risks).directRisks).toBe(2)
  })

  it('counts descendants excluding the unit itself', () => {
    expect(businessUnitCounts(UNITS[1], UNITS, users, risks).descendants).toBe(2)
    expect(businessUnitCounts(UNITS[2], UNITS, users, risks).descendants).toBe(0)
    expect(businessUnitCounts(UNITS[0], UNITS, users, risks).descendants).toBe(4)
  })
})

describe('splitScope', () => {
  it('separates a direct parent grant from the units it inherits', () => {
    const { direct, inherited } = splitScope(UNITS, ['bu_technology'])

    expect(direct).toEqual(['bu_technology'])
    expect(inherited.sort()).toEqual(['bu_operations', 'bu_security'].sort())
  })

  it('reports no inherited units for a leaf grant', () => {
    expect(splitScope(UNITS, ['bu_security']).inherited).toEqual([])
  })

  it('never leaks a parent or sibling into the inherited set', () => {
    const { inherited } = splitScope(UNITS, ['bu_security'])

    expect(inherited).not.toContain('bu_technology') // parent
    expect(inherited).not.toContain('bu_operations') // sibling
    expect(inherited).not.toContain('bu_enterprise') // grandparent
  })
})

// --- custom attributes ------------------------------------------------------

describe('parseAttributeOptions', () => {
  it('splits on commas and trims each value', () => {
    expect(parseAttributeOptions('Within Appetite, Watch Trigger ,Limit')).toEqual([
      'Within Appetite', 'Watch Trigger', 'Limit',
    ])
  })

  it('drops empty values', () => {
    expect(parseAttributeOptions('One,,  ,Two,')).toEqual(['One', 'Two'])
  })

  it('returns nothing for an empty string', () => {
    expect(parseAttributeOptions('')).toEqual([])
    expect(parseAttributeOptions('   ')).toEqual([])
  })

  it('round-trips through the formatted form', () => {
    const options = ['Monthly', 'Quarterly', 'Annual']
    expect(parseAttributeOptions(formatAttributeOptions(options))).toEqual(options)
  })
})

describe('validateCustomAttribute', () => {
  it('accepts a valid text attribute', () => {
    expect(validateCustomAttribute(attribute())).toEqual([])
  })

  it('blocks an empty English label', () => {
    expect(validateCustomAttribute(attribute({ labelEn: '' })).map((i) => i.field)).toContain('labelEn')
  })

  it('blocks a select attribute with no options', () => {
    expect(validateCustomAttribute(attribute({ type: 'select', options: [] })).map((i) => i.field)).toContain('options')
  })

  it('accepts a select attribute once options are supplied', () => {
    expect(validateCustomAttribute(attribute({ type: 'select', options: ['A', 'B'] }))).toEqual([])
  })

  it('does not require options for non-select types', () => {
    for (const type of ['text', 'number', 'date', 'user'] as const) {
      expect(validateCustomAttribute(attribute({ type, options: [] })), type).toEqual([])
    }
  })
})

describe('attributeUsageCount', () => {
  it('counts risks holding a non-empty value', () => {
    const risks = [
      risk({ id: 'r1', custom: { attr_1: 'Limit' } }),
      risk({ id: 'r2', custom: { attr_1: '' } }),
      risk({ id: 'r3', custom: {} }),
      risk({ id: 'r4', custom: { attr_1: 0 } }),
    ]
    // Zero is a real value for a number attribute, so it counts.
    expect(attributeUsageCount(risks, 'attr_1')).toBe(2)
  })
})
