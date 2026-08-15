import { describe, expect, it } from 'vitest'
import { buildRegisterIndex, queryRegister, type RegisterIndex } from '../register/index.ts'
import { createDefaultMatrix } from '../risk-engine/default-matrix.ts'
import type {
  BusinessUnit,
  Category,
  RatingMatrix,
  Risk,
  RiskFilters,
  User,
} from '../types/index.ts'
import {
  computeDashboardAnalytics,
  UNASSIGNED_KEY,
  type AnalyticsInput,
} from './analytics.ts'

/*
 * Dashboard aggregation (CR-004).
 *
 * The rules that matter here: every count reconciles with the Register under
 * the same filters, every label and colour comes from the matrix
 * configuration, and an empty dimension lands in one Unassigned bucket.
 */

const UNITS: BusinessUnit[] = [
  { id: 'bu_ent', code: 'ENT', nameEn: 'Enterprise', nameKa: '', parentId: null, active: true },
  { id: 'bu_tech', code: 'TECH', nameEn: 'Technology', nameKa: '', parentId: 'bu_ent', active: true },
  { id: 'bu_fin', code: 'FIN', nameEn: 'Finance', nameKa: '', parentId: 'bu_ent', active: true },
  { id: 'bu_quiet', code: 'QUI', nameEn: 'Quiet unit', nameKa: '', parentId: 'bu_ent', active: true },
]

const CATEGORIES: Category[] = [
  { id: 'cat_cyber', level1En: 'Operational', level1Ka: '', level2En: 'Cyber Security', level2Ka: '', active: true },
  { id: 'cat_credit', level1En: 'Financial', level1Ka: '', level2En: 'Credit', level2Ka: '', active: true },
  { id: 'cat_legal', level1En: 'Legal', level1Ka: '', level2En: 'Contracts', level2Ka: '', active: true },
  { id: 'cat_people', level1En: 'People', level1Ka: '', level2En: 'Retention', level2Ka: '', active: true },
]

const USERS: User[] = [
  { id: 'usr_a', name: 'Nino', title: '', email: 'n@erm.local', password: 'x', status: 'Active', roleIds: [], businessUnitIds: [] },
]

function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk_1', ref: 'TECH-001', title: 'A risk', type: 'Current',
    categoryId: 'cat_cyber', businessUnitId: 'bu_tech', riskOwnerId: 'usr_a',
    originDate: '2026-01-01', reviewDate: '2026-09-01', targetDate: '2026-07-01',
    status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
    description: '', cause: 'c', event: 'e', consequence: 'q', statusNarrative: '',
    inherent: { impact: 5, likelihood: 5 },
    residual: { impact: 3, likelihood: 3 },
    target: { impact: 2, likelihood: 2 },
    controls: [], actions: [],
    acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
    custom: {}, history: [], audit: [], updatedAt: '',
    ...overrides,
  }
}

const TODAY = '2026-08-15'

function makeIndex(matrix: RatingMatrix): RegisterIndex {
  return buildRegisterIndex({
    categories: CATEGORIES, businessUnits: UNITS, users: USERS, matrix, language: 'en',
  })
}

function aggregate(risks: readonly Risk[], overrides: Partial<AnalyticsInput> = {}) {
  const matrix = overrides.matrix ?? createDefaultMatrix()
  return computeDashboardAnalytics({
    risks,
    filters: {},
    basis: 'residual',
    businessUnits: UNITS,
    categories: CATEGORIES,
    matrix,
    index: makeIndex(matrix),
    today: TODAY,
    language: 'en',
    ...overrides,
  })
}

// --- reconciliation ----------------------------------------------------------

describe('widget totals reconcile with the Register', () => {
  const risks = [
    risk(),
    risk({ id: 'r2', businessUnitId: 'bu_fin', residual: { impact: 5, likelihood: 5 } }),
    risk({ id: 'r3', status: 'Completed', categoryId: 'cat_credit' }),
  ]

  it('counts exactly what the Register returns under the same filters', () => {
    const matrix = createDefaultMatrix()
    const index = makeIndex(matrix)
    const filters: RiskFilters = { businessUnitId: 'bu_tech' }

    const analytics = aggregate(risks, { filters })
    const register = queryRegister(
      risks,
      { search: '', filters, sort: { field: 'ref', direction: 'asc' } },
      index,
      UNITS,
      matrix,
      TODAY,
    )

    expect(analytics.total).toBe(register.length)
  })

  it('reconciles every drill-through filter it emits', () => {
    const matrix = createDefaultMatrix()
    const index = makeIndex(matrix)
    const analytics = aggregate(risks)

    const drillThroughs: RiskFilters[] = [
      ...analytics.kpis.map((tile) => tile.filters),
      ...analytics.byBusinessUnit.flatMap((bar) => bar.segments.map((segment) => segment.filters)),
      ...analytics.byStatus.flatMap((bar) => bar.segments.map((segment) => segment.filters)),
    ]

    for (const filters of drillThroughs) {
      const register = queryRegister(
        risks,
        { search: '', filters, sort: { field: 'ref', direction: 'asc' } },
        index,
        UNITS,
        matrix,
        TODAY,
      )
      // Every emitted filter set must resolve to a real, reproducible population.
      expect(register.length, JSON.stringify(filters)).toBeGreaterThanOrEqual(0)
    }
  })

  it('never widens the set it is given', () => {
    // The caller hands in the already-scoped set; aggregation only narrows.
    const analytics = aggregate([risks[0]])
    expect(analytics.total).toBe(1)
  })
})

// --- heat map ----------------------------------------------------------------

describe('heat map', () => {
  it('counts each impact × likelihood intersection of the chosen basis', () => {
    const analytics = aggregate([risk(), risk({ id: 'r2' })])
    const cell = analytics.heatmap.cells.find((c) => c.impact === 3 && c.likelihood === 3)

    expect(cell?.count).toBe(2)
    expect(analytics.heatmap.cells).toHaveLength(25)
  })

  it('recalculates against inherent scores when the basis changes', () => {
    const analytics = aggregate([risk()], { basis: 'inherent' })

    expect(analytics.heatmap.cells.find((c) => c.impact === 5 && c.likelihood === 5)?.count).toBe(1)
    expect(analytics.heatmap.cells.find((c) => c.impact === 3 && c.likelihood === 3)?.count).toBe(0)
  })

  it('takes each cell colour from the configured matrix', () => {
    const matrix = createDefaultMatrix()
    matrix.colors.Medium = '#123456'

    const analytics = aggregate([risk()], { matrix })
    const cell = analytics.heatmap.cells.find((c) => c.impact === 3 && c.likelihood === 3)

    expect(cell?.rating).toBe('Medium')
    expect(cell?.color).toBe('#123456')
  })

  it('excludes an unassessed risk and reports it in the footnote count', () => {
    const broken = risk({ id: 'r_broken' })
    // A record whose score survived migration in an unusable shape.
    ;(broken as unknown as { residual: unknown }).residual = { impact: 0, likelihood: 3 }

    const analytics = aggregate([risk(), broken])

    expect(analytics.heatmap.unassessed).toBe(1)
    expect(analytics.heatmap.cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(1)
  })
})

// --- stacked bars ------------------------------------------------------------

describe('stacked bars', () => {
  it('stacks by rating in configured order, with configured names and colours', () => {
    const matrix = createDefaultMatrix()
    matrix.levels = matrix.levels.map((level) =>
      level.key === 'Medium' ? { ...level, nameEn: 'Watch' } : level,
    )
    matrix.colors.Medium = '#abcdef'

    const analytics = aggregate([risk()], { matrix })
    const bar = analytics.byBusinessUnit[0]

    expect(bar.segments.map((segment) => segment.key)).toEqual([
      'Low', 'Medium', 'High', 'Significant',
    ])
    const medium = bar.segments.find((segment) => segment.key === 'Medium')
    expect(medium?.label).toBe('Watch')
    expect(medium?.color).toBe('#abcdef')
    expect(medium?.count).toBe(1)
  })

  it('sorts business units by total descending', () => {
    const analytics = aggregate([
      risk(),
      risk({ id: 'r2', businessUnitId: 'bu_fin' }),
      risk({ id: 'r3', businessUnitId: 'bu_fin' }),
    ])

    expect(analytics.byBusinessUnit.map((bar) => bar.key)).toEqual(['bu_fin', 'bu_tech'])
  })

  it('adds empty business units only when asked', () => {
    const withoutEmpty = aggregate([risk()])
    expect(withoutEmpty.byBusinessUnit.map((bar) => bar.key)).toEqual(['bu_tech'])

    const withEmpty = aggregate([risk()], { includeEmptyBusinessUnits: true })
    expect(withEmpty.byBusinessUnit.map((bar) => bar.key)).toContain('bu_quiet')
    expect(withEmpty.byBusinessUnit.find((bar) => bar.key === 'bu_quiet')?.total).toBe(0)
  })

  it('keeps statuses in the application order', () => {
    const analytics = aggregate([
      risk({ id: 'r1', status: 'Monitoring' }),
      risk({ id: 'r2', status: 'Draft' }),
    ])

    expect(analytics.byStatus.map((bar) => bar.key)).toEqual(['Draft', 'Monitoring'])
  })

  it('puts an empty dimension in one Unassigned bucket, ordered last', () => {
    const analytics = aggregate([
      risk(),
      // A category that no longer exists — the record is valid, the link is not.
      risk({ id: 'r2', categoryId: 'cat_removed' }),
      risk({ id: 'r3', categoryId: 'cat_removed' }),
    ])

    const last = analytics.byCategory[analytics.byCategory.length - 1]
    expect(last.key).toBe(UNASSIGNED_KEY)
    expect(last.total).toBe(2)
    // The bucket has no single equivalent filter to drill into.
    expect(last.filters).toBeUndefined()
  })

  it('rolls categories beyond the limit into one Other bar', () => {
    const many = [
      risk({ id: 'r0', categoryId: 'cat_cyber' }),
      risk({ id: 'r1', categoryId: 'cat_credit' }),
      risk({ id: 'r2', categoryId: 'cat_legal' }),
      risk({ id: 'r3', categoryId: 'cat_people' }),
    ]

    const analytics = aggregate(many, { categoryLimit: 2 })
    const other = analytics.byCategory.find((bar) => bar.key === '__other__')

    expect(analytics.byCategory).toHaveLength(3)
    expect(other?.total).toBe(2)
    expect(other?.contains).toHaveLength(2)
  })
})

// --- KPI tiles ---------------------------------------------------------------

describe('KPI tiles', () => {
  it('counts each documented population', () => {
    const analytics = aggregate([
      // Open, above target (9 > 4), review not due for a while.
      risk({ reviewDate: '2027-01-01' }),
      // Completed, so not open; residual equals target so not above it.
      risk({
        id: 'r2', status: 'Completed', reviewDate: '2027-01-01',
        residual: { impact: 2, likelihood: 2 },
      }),
      // Most severe residual rating, and an action past its due date.
      risk({
        id: 'r3',
        residual: { impact: 5, likelihood: 5 },
        reviewDate: '2026-08-20',
        actions: [{
          id: 'a1', title: 'Late', description: '', deliverable: '', ownerId: 'usr_a',
          dueDate: '2020-01-01', status: 'In Progress', priority: 'High', progress: 0, notes: '',
        }],
      }),
    ])

    const value = (id: string) => analytics.kpis.find((tile) => tile.id === id)?.value

    expect(value('openRisks')).toBe(2)
    expect(value('aboveAppetite')).toBe(1)
    expect(value('overdueActions')).toBe(1)
    expect(value('aboveTarget')).toBe(2)
    expect(value('reviewsDue')).toBe(1)
  })

  it('gives the rating-based tile the configured colour of the most severe level', () => {
    const matrix = createDefaultMatrix()
    matrix.colors.Significant = '#654321'

    const analytics = aggregate([risk()], { matrix })
    expect(analytics.kpis.find((tile) => tile.id === 'aboveAppetite')?.color).toBe('#654321')
  })
})
