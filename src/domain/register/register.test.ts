import { describe, expect, it } from 'vitest'
import type {
  BusinessUnit,
  Category,
  RatingMatrix,
  RemediationAction,
  Risk,
  User,
} from '../types/index.ts'
import { createDefaultMatrix } from '../risk-engine/default-matrix.ts'
import {
  BASE_COLUMNS,
  DEFAULT_VISIBLE_COLUMNS,
  reconcileVisibleColumns,
  selectableColumns,
} from './columns.ts'
import {
  buildRegisterIndex,
  DEFAULT_SORT,
  EMPTY_QUERY,
  isQueryActive,
  level1Groups,
  matchesFilters,
  matchesSearch,
  queryRegister,
  sortRisks,
  toggleSort,
} from './index.ts'

// --- fixtures ---------------------------------------------------------------

const UNITS: BusinessUnit[] = [
  { id: 'bu_enterprise', code: 'ENT', nameEn: 'Enterprise', nameKa: 'საწარმო', parentId: null, active: true },
  { id: 'bu_technology', code: 'TECH', nameEn: 'Technology Division', nameKa: '', parentId: 'bu_enterprise', active: true },
  { id: 'bu_security', code: 'SEC', nameEn: 'Information Security', nameKa: '', parentId: 'bu_technology', active: true },
  { id: 'bu_operations', code: 'OPS', nameEn: 'IT Operations', nameKa: '', parentId: 'bu_technology', active: true },
  { id: 'bu_finance', code: 'FIN', nameEn: 'Finance', nameKa: '', parentId: 'bu_enterprise', active: true },
]

const CATEGORIES: Category[] = [
  { id: 'cat_cyber', level1En: 'Operational', level1Ka: 'ოპერაციული', level2En: 'Cyber Security', level2Ka: '', active: true },
  { id: 'cat_data', level1En: 'Operational', level1Ka: 'ოპერაციული', level2En: 'Data Governance', level2Ka: '', active: true },
  { id: 'cat_credit', level1En: 'Financial', level1Ka: 'ფინანსური', level2En: 'Credit', level2Ka: '', active: true },
  { id: 'cat_old', level1En: 'Strategic', level1Ka: '', level2En: 'Retired', level2Ka: '', active: false },
]

const USERS: User[] = [
  { id: 'usr_nino', name: 'Nino Kapanadze', title: '', email: 'n@erm.local', password: 'x', status: 'Active', roleIds: [], businessUnitIds: [] },
  { id: 'usr_giorgi', name: 'Giorgi Maisuradze', title: '', email: 'g@erm.local', password: 'x', status: 'Active', roleIds: [], businessUnitIds: [] },
]

function makeMatrix(): RatingMatrix {
  return createDefaultMatrix()
}

function action(title: string): RemediationAction {
  return {
    id: `act_${title}`, title, description: '', deliverable: '', ownerId: 'usr_nino',
    dueDate: '2026-06-01', status: 'In Progress', priority: 'Medium', progress: 0, notes: '',
  }
}

function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk_x', ref: 'TECH-001', title: 'A risk', type: 'Current',
    categoryId: 'cat_cyber', businessUnitId: 'bu_technology', riskOwnerId: 'usr_nino',
    originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
    status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
    description: '',
    cause: 'A cause', event: 'An event', consequence: 'A consequence', statusNarrative: '',
    inherent: { impact: 4, likelihood: 4 },
    residual: { impact: 3, likelihood: 3 },
    target: { impact: 2, likelihood: 2 },
    controls: [], actions: [],
    acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
    custom: {}, history: [], audit: [], updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const matrix = makeMatrix()
const index = buildRegisterIndex({ categories: CATEGORIES, businessUnits: UNITS, users: USERS, matrix })

// --- search -----------------------------------------------------------------

describe('search', () => {
  const target = risk({
    ref: 'SEC-004',
    title: 'Unpatched perimeter systems',
    description: '',
    cause: 'Patch backlog in the estate',
    event: 'An attacker exploits a known vulnerability',
    consequence: 'Regulatory penalty and outage',
    categoryId: 'cat_cyber',
    businessUnitId: 'bu_security',
    riskOwnerId: 'usr_giorgi',
    actions: [action('Deploy quarterly patch cycle')],
  })

  it('matches every documented field', () => {
    const cases: [string, string][] = [
      ['risk reference', 'SEC-004'],
      ['risk title', 'perimeter'],
      ['cause', 'backlog'],
      ['event', 'exploits'],
      ['consequence', 'penalty'],
      ['category name', 'Cyber Security'],
      ['business unit name', 'Information Security'],
      ['risk owner name', 'Maisuradze'],
      ['remediation action title', 'quarterly patch'],
    ]

    for (const [field, term] of cases) {
      expect(matchesSearch(target, term, index), field).toBe(true)
    }
  })

  it('matches the full business unit hierarchy path', () => {
    // The risk sits on Information Security; searching its ancestor's name
    // must still find it, because the path is searchable.
    expect(matchesSearch(target, 'Technology Division', index)).toBe(true)
    expect(matchesSearch(target, 'Enterprise', index)).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(matchesSearch(target, 'PERIMETER', index)).toBe(true)
    expect(matchesSearch(target, 'perimeter', index)).toBe(true)
    expect(matchesSearch(target, 'PeRiMeTeR', index)).toBe(true)
  })

  it('ignores surrounding whitespace and treats an empty term as no filter', () => {
    expect(matchesSearch(target, '   perimeter  ', index)).toBe(true)
    expect(matchesSearch(target, '', index)).toBe(true)
    expect(matchesSearch(target, '    ', index)).toBe(true)
  })

  it('does not match an unrelated term', () => {
    expect(matchesSearch(target, 'liquidity', index)).toBe(false)
  })

  it('does not bleed across fields', () => {
    // 'perimeter' and 'backlog' are in different fields; the concatenation is
    // separated so a term spanning both must not match.
    expect(matchesSearch(target, 'perimeter systems Patch', index)).toBe(false)
  })
})

// --- filters ----------------------------------------------------------------

describe('filters', () => {
  const inSecurity = risk({ id: 'r1', businessUnitId: 'bu_security', categoryId: 'cat_cyber' })
  const inOperations = risk({ id: 'r2', businessUnitId: 'bu_operations' })
  const inTechnology = risk({ id: 'r3', businessUnitId: 'bu_technology' })
  const inFinance = risk({ id: 'r4', businessUnitId: 'bu_finance', categoryId: 'cat_credit' })

  const apply = (candidate: Risk, filters: Parameters<typeof matchesFilters>[1]) =>
    matchesFilters(candidate, filters, UNITS, index, matrix)

  it('filters by Level-1 category group, not by the specific category', () => {
    expect(apply(inSecurity, { categoryLevel1: 'Operational' })).toBe(true)
    expect(apply(inFinance, { categoryLevel1: 'Operational' })).toBe(false)
    expect(apply(inFinance, { categoryLevel1: 'Financial' })).toBe(true)
  })

  it('filters by exact category when one is pinned', () => {
    expect(apply(inSecurity, { categoryId: 'cat_cyber' })).toBe(true)
    expect(apply(inSecurity, { categoryId: 'cat_data' })).toBe(false)
  })

  it('includes descendants of the selected business unit', () => {
    expect(apply(inTechnology, { businessUnitId: 'bu_technology' })).toBe(true)
    expect(apply(inSecurity, { businessUnitId: 'bu_technology' })).toBe(true)
    expect(apply(inOperations, { businessUnitId: 'bu_technology' })).toBe(true)
  })

  it('excludes parents and siblings of the selected business unit', () => {
    expect(apply(inTechnology, { businessUnitId: 'bu_security' })).toBe(false)
    expect(apply(inOperations, { businessUnitId: 'bu_security' })).toBe(false)
    expect(apply(inFinance, { businessUnitId: 'bu_technology' })).toBe(false)
  })

  it('filters by residual rating, computed from the matrix', () => {
    const medium = risk({ residual: { impact: 2, likelihood: 3 } }) // 6 -> Medium
    const significant = risk({ residual: { impact: 5, likelihood: 4 } }) // 20 -> Significant

    expect(apply(medium, { residualRating: 'Medium' })).toBe(true)
    expect(apply(medium, { residualRating: 'Significant' })).toBe(false)
    expect(apply(significant, { residualRating: 'Significant' })).toBe(true)
  })

  it('re-filters when the matrix is reconfigured, with no code change', () => {
    const candidate = risk({ residual: { impact: 3, likelihood: 3 } })
    expect(matchesFilters(candidate, { residualRating: 'Medium' }, UNITS, index, matrix)).toBe(true)

    const edited = makeMatrix()
    const cell = edited.cells.find((c) => c.impact === 3 && c.likelihood === 3)
    if (cell) cell.rating = 'Significant'
    const editedIndex = buildRegisterIndex({ categories: CATEGORIES, businessUnits: UNITS, users: USERS, matrix: edited })

    expect(matchesFilters(candidate, { residualRating: 'Medium' }, UNITS, editedIndex, edited)).toBe(false)
    expect(matchesFilters(candidate, { residualRating: 'Significant' }, UNITS, editedIndex, edited)).toBe(true)
  })

  it('filters by status, outlook, type and owner with exact matches', () => {
    expect(apply(risk({ status: 'Monitoring' }), { status: 'Monitoring' })).toBe(true)
    expect(apply(risk({ status: 'Monitoring' }), { status: 'Completed' })).toBe(false)
    expect(apply(risk({ outlook: 'Increasing' }), { outlook: 'Increasing' })).toBe(true)
    expect(apply(risk({ type: 'Emerging' }), { riskType: 'Emerging' })).toBe(true)
    expect(apply(risk({ riskOwnerId: 'usr_giorgi' }), { riskOwnerId: 'usr_giorgi' })).toBe(true)
    expect(apply(risk({ riskOwnerId: 'usr_nino' }), { riskOwnerId: 'usr_giorgi' })).toBe(false)
  })

  it('treats an empty filter set as matching everything', () => {
    expect(apply(inSecurity, {})).toBe(true)
  })

  it('combines filters with AND', () => {
    const candidate = risk({ businessUnitId: 'bu_security', status: 'Monitoring', categoryId: 'cat_cyber' })

    expect(apply(candidate, { businessUnitId: 'bu_technology', status: 'Monitoring' })).toBe(true)
    expect(apply(candidate, { businessUnitId: 'bu_technology', status: 'Completed' })).toBe(false)
    expect(apply(candidate, { businessUnitId: 'bu_finance', status: 'Monitoring' })).toBe(false)
  })
})

// --- sorting ----------------------------------------------------------------

describe('sorting', () => {
  const risks = [
    risk({ id: 'a', ref: 'TECH-003', title: 'Carol', riskOwnerId: 'usr_nino', residual: { impact: 1, likelihood: 1 }, targetDate: '2026-12-01' }),
    risk({ id: 'b', ref: 'TECH-001', title: 'Alice', riskOwnerId: 'usr_giorgi', residual: { impact: 5, likelihood: 5 }, targetDate: '2026-01-01' }),
    risk({ id: 'c', ref: 'TECH-002', title: 'Bob', riskOwnerId: 'usr_nino', residual: { impact: 3, likelihood: 3 }, targetDate: '2026-06-01' }),
  ]

  it('defaults to risk reference ascending', () => {
    expect(sortRisks(risks, DEFAULT_SORT, index).map((r) => r.ref)).toEqual([
      'TECH-001', 'TECH-002', 'TECH-003',
    ])
  })

  it('sorts references numerically, not lexically', () => {
    const many = [risk({ ref: 'TECH-010' }), risk({ ref: 'TECH-009' }), risk({ ref: 'TECH-100' })]
    expect(sortRisks(many, DEFAULT_SORT, index).map((r) => r.ref)).toEqual([
      'TECH-009', 'TECH-010', 'TECH-100',
    ])
  })

  it('sorts by title, owner, residual score and target date', () => {
    expect(sortRisks(risks, { field: 'title', direction: 'asc' }, index).map((r) => r.title)).toEqual(['Alice', 'Bob', 'Carol'])
    // Giorgi first; a and c share an owner, so the reference tie-break orders
    // TECH-002 (c) before TECH-003 (a).
    expect(sortRisks(risks, { field: 'owner', direction: 'asc' }, index).map((r) => r.id)).toEqual(['b', 'c', 'a'])
    expect(sortRisks(risks, { field: 'residual', direction: 'asc' }, index).map((r) => r.id)).toEqual(['a', 'c', 'b'])
    expect(sortRisks(risks, { field: 'targetDate', direction: 'asc' }, index).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('reverses on descending', () => {
    expect(sortRisks(risks, { field: 'residual', direction: 'desc' }, index).map((r) => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('breaks ties by reference so ordering never jitters', () => {
    const tied = [
      risk({ id: 'x', ref: 'TECH-005', title: 'Same' }),
      risk({ id: 'y', ref: 'TECH-002', title: 'Same' }),
    ]
    expect(sortRisks(tied, { field: 'title', direction: 'asc' }, index).map((r) => r.ref)).toEqual([
      'TECH-002', 'TECH-005',
    ])
  })

  it('does not mutate the input collection', () => {
    const original = [...risks]
    sortRisks(risks, { field: 'title', direction: 'desc' }, index)
    expect(risks).toEqual(original)
  })
})

describe('toggleSort', () => {
  it('flips direction when the same field is clicked again', () => {
    expect(toggleSort({ field: 'title', direction: 'asc' }, 'title')).toEqual({ field: 'title', direction: 'desc' })
    expect(toggleSort({ field: 'title', direction: 'desc' }, 'title')).toEqual({ field: 'title', direction: 'asc' })
  })

  it('starts a newly selected field ascending', () => {
    expect(toggleSort({ field: 'title', direction: 'desc' }, 'residual')).toEqual({ field: 'residual', direction: 'asc' })
  })
})

// --- combined query ---------------------------------------------------------

describe('queryRegister', () => {
  const risks = [
    risk({ id: 'a', ref: 'SEC-001', title: 'Phishing', businessUnitId: 'bu_security', status: 'Monitoring' }),
    risk({ id: 'b', ref: 'OPS-001', title: 'Capacity', businessUnitId: 'bu_operations', status: 'Completed' }),
    risk({ id: 'c', ref: 'FIN-001', title: 'Liquidity', businessUnitId: 'bu_finance', categoryId: 'cat_credit', status: 'Monitoring' }),
  ]

  const run = (query: Parameters<typeof queryRegister>[1]) =>
    queryRegister(risks, query, index, UNITS, matrix).map((r) => r.id)

  it('returns everything, reference-sorted, for an empty query', () => {
    // FIN-001 < OPS-001 < SEC-001, which is ids c, b, a.
    expect(run(EMPTY_QUERY)).toEqual(['c', 'b', 'a'])
  })

  it('applies search and filters together', () => {
    expect(run({ ...EMPTY_QUERY, search: 'Phishing' })).toEqual(['a'])
    expect(run({ ...EMPTY_QUERY, filters: { status: 'Monitoring' } })).toEqual(['c', 'a'])
    expect(run({ ...EMPTY_QUERY, search: 'Liquidity', filters: { status: 'Monitoring' } })).toEqual(['c'])
    expect(run({ ...EMPTY_QUERY, search: 'Liquidity', filters: { status: 'Completed' } })).toEqual([])
  })

  it('never widens the set it was given', () => {
    // Visibility is applied before the query; a term cannot reach past it.
    const visible = [risks[0]]
    expect(queryRegister(visible, { ...EMPTY_QUERY, search: 'Liquidity' }, index, UNITS, matrix)).toEqual([])
    expect(queryRegister(visible, EMPTY_QUERY, index, UNITS, matrix)).toHaveLength(1)
  })
})

describe('isQueryActive', () => {
  it('is false for an untouched query', () => {
    expect(isQueryActive(EMPTY_QUERY)).toBe(false)
  })

  it('is true when a search term or any filter is set', () => {
    expect(isQueryActive({ ...EMPTY_QUERY, search: 'x' })).toBe(true)
    expect(isQueryActive({ ...EMPTY_QUERY, filters: { status: 'Completed' } })).toBe(true)
  })

  it('ignores whitespace-only search terms', () => {
    expect(isQueryActive({ ...EMPTY_QUERY, search: '   ' })).toBe(false)
  })
})

// --- columns ----------------------------------------------------------------

describe('columns', () => {
  const attributes = [
    { id: 'attr_appetite', labelEn: 'Appetite status', labelKa: 'აპეტიტი', type: 'select' as const, options: [], active: true, showInRegister: true },
    { id: 'attr_kri', labelEn: 'Primary KRI', labelKa: '', type: 'text' as const, options: [], active: true, showInRegister: false },
    { id: 'attr_old', labelEn: 'Retired', labelKa: '', type: 'text' as const, options: [], active: false, showInRegister: true },
  ]

  it('adds an active attribute flagged for the register', () => {
    const columns = selectableColumns(attributes)
    expect(columns.map((c) => c.id)).toContain('attr_appetite')
  })

  it('excludes attributes not flagged for the register', () => {
    expect(selectableColumns(attributes).map((c) => c.id)).not.toContain('attr_kri')
  })

  it('excludes inactive attributes without deleting their values', () => {
    expect(selectableColumns(attributes).map((c) => c.id)).not.toContain('attr_old')
  })

  it('uses the Georgian attribute label when present, falling back to English', () => {
    const ka = selectableColumns(attributes, 'ka')
    expect(ka.find((c) => c.id === 'attr_appetite')?.customLabel).toBe('აპეტიტი')

    const withBlankKa = selectableColumns([{ ...attributes[0], labelKa: '' }], 'ka')
    expect(withBlankKa.find((c) => c.id === 'attr_appetite')?.customLabel).toBe('Appetite status')
  })

  it('offers a sensible default selection', () => {
    expect(DEFAULT_VISIBLE_COLUMNS).toContain('n')
    expect(DEFAULT_VISIBLE_COLUMNS).toContain('residual')
    expect(DEFAULT_VISIBLE_COLUMNS.length).toBeLessThan(BASE_COLUMNS.length)
  })

  it('drops stored columns that no longer exist, keeping order', () => {
    const available = selectableColumns(attributes)
    expect(reconcileVisibleColumns(['title', 'attr_gone', 'ref'], available)).toEqual(['title', 'ref'])
  })

  it('falls back to defaults when nothing survives', () => {
    const available = selectableColumns([])
    expect(reconcileVisibleColumns(['attr_gone'], available)).toEqual([...DEFAULT_VISIBLE_COLUMNS])
  })
})

describe('level1Groups', () => {
  it('returns distinct active groups', () => {
    expect(level1Groups(CATEGORIES)).toEqual(['Operational', 'Financial'])
  })
})
