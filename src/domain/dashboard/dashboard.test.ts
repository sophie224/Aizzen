import { describe, expect, it } from 'vitest'
import { buildRegisterIndex } from '../register/index.ts'
import { createDefaultMatrix } from '../risk-engine/default-matrix.ts'
import type {
  AssessmentHistoryItem,
  AuditEvent,
  BusinessUnit,
  Category,
  RatingMatrix,
  RemediationAction,
  Risk,
  Score,
  User,
} from '../types/index.ts'
import {
  canDeleteDashboard,
  computeActionProgress,
  computeDistribution,
  computeHeatmap,
  computeMetric,
  computeRecentActivity,
  computeTopRisks,
  computeTrendSummary,
  duplicateDashboard,
  filterRisks,
  reorderWidgets,
  type DashboardContext,
} from './index.ts'

// --- fixtures ---------------------------------------------------------------

const UNITS: BusinessUnit[] = [
  { id: 'bu_ent', code: 'ENT', nameEn: 'Enterprise', nameKa: '', parentId: null, active: true },
  { id: 'bu_tech', code: 'TECH', nameEn: 'Technology', nameKa: '', parentId: 'bu_ent', active: true },
  { id: 'bu_sec', code: 'SEC', nameEn: 'Security', nameKa: '', parentId: 'bu_tech', active: true },
  { id: 'bu_fin', code: 'FIN', nameEn: 'Finance', nameKa: '', parentId: 'bu_ent', active: true },
]

const CATEGORIES: Category[] = [
  { id: 'cat_cyber', level1En: 'Operational', level1Ka: '', level2En: 'Cyber Security', level2Ka: '', active: true },
  { id: 'cat_credit', level1En: 'Financial', level1Ka: '', level2En: 'Credit', level2Ka: '', active: true },
]

const USERS: User[] = [
  { id: 'usr_a', name: 'Ana', title: '', email: 'a@erm.local', password: 'x', status: 'Active', roleIds: [], businessUnitIds: [] },
]

function makeMatrix(): RatingMatrix {
  return createDefaultMatrix()
}

function action(overrides: Partial<RemediationAction> = {}): RemediationAction {
  return {
    id: 'act', title: 'An action', description: '', deliverable: '', ownerId: 'usr_a',
    dueDate: '2026-12-01', status: 'In Progress', priority: 'Medium', progress: 40, notes: '',
    ...overrides,
  }
}

function snapshot(residual: Score, date: string): AssessmentHistoryItem {
  return {
    id: `h_${date}`, date,
    inherent: { impact: 4, likelihood: 4 }, residual, target: { impact: 2, likelihood: 2 },
    note: '', actorId: 'usr_a',
  }
}

function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk_1', ref: 'TECH-001', title: 'A risk', type: 'Current',
    categoryId: 'cat_cyber', businessUnitId: 'bu_tech', riskOwnerId: 'usr_a',
    originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
    status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
    description: '',
    cause: 'c', event: 'e', consequence: 'q', statusNarrative: '',
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

function makeContext(risks: readonly Risk[], events: readonly AuditEvent[] = []): DashboardContext {
  return {
    risks, businessUnits: UNITS, categories: CATEGORIES, users: USERS,
    customAttributes: [], matrix, index, auditEvents: events,
    dashboards: [], today: '2026-06-01', language: 'en',
  }
}

// --- metrics ----------------------------------------------------------------

describe('metric rules', () => {
  const risks = [
    risk({ id: 'r1', status: 'In Progress', type: 'Current', residual: { impact: 5, likelihood: 4 } }),
    risk({ id: 'r2', status: 'Completed', type: 'Emerging', residual: { impact: 1, likelihood: 1 } }),
    risk({
      id: 'r3', status: 'Monitoring', type: 'Emerging', residual: { impact: 5, likelihood: 5 },
      actions: [
        action({ id: 'a1', dueDate: '2026-01-01', status: 'In Progress' }),
        action({ id: 'a2', dueDate: '2026-01-01', status: 'Completed' }),
        action({ id: 'a3', dueDate: '2026-12-01', status: 'Not Started' }),
      ],
    }),
  ]
  const context = makeContext(risks)

  it('Total Risks counts every filtered risk', () => {
    expect(computeMetric('totalRisks', risks, context)).toBe(3)
  })

  it('Open Risks excludes Completed', () => {
    expect(computeMetric('openRisks', risks, context)).toBe(2)
  })

  it('Significant Residual counts residual rating Significant', () => {
    // 5x4 = Significant and 5x5 = Significant; 1x1 = Low.
    expect(computeMetric('significantResidual', risks, context)).toBe(2)
  })

  it('Overdue Actions counts past-due actions that are not Completed', () => {
    // a1 is overdue; a2 is Completed; a3 is not yet due.
    expect(computeMetric('overdueActions', risks, context)).toBe(1)
  })

  it('Emerging Risks counts type Emerging', () => {
    expect(computeMetric('emergingRisks', risks, context)).toBe(2)
  })

  it('Completed Actions counts actions with status Completed', () => {
    expect(computeMetric('completedActions', risks, context)).toBe(1)
  })

  it('returns zero for an empty set', () => {
    const empty = makeContext([])
    for (const metric of ['totalRisks', 'openRisks', 'significantResidual', 'overdueActions', 'emergingRisks', 'completedActions'] as const) {
      expect(computeMetric(metric, [], empty), metric).toBe(0)
    }
  })

  it('follows the configured matrix for Significant Residual', () => {
    const edited = makeMatrix()
    const cell = edited.cells.find((c) => c.impact === 1 && c.likelihood === 1)
    if (cell) cell.rating = 'Significant'
    const editedIndex = buildRegisterIndex({ categories: CATEGORIES, businessUnits: UNITS, users: USERS, matrix: edited })

    expect(
      computeMetric('significantResidual', risks, { matrix: edited, index: editedIndex, today: '2026-06-01' }),
    ).toBe(3)
  })
})

// --- filters ----------------------------------------------------------------

describe('dashboard filters', () => {
  const risks = [
    risk({ id: 'r1', businessUnitId: 'bu_sec', status: 'Monitoring' }),
    risk({ id: 'r2', businessUnitId: 'bu_fin', status: 'Completed' }),
  ]
  const context = makeContext(risks)

  it('narrows by business unit including descendants', () => {
    expect(filterRisks(risks, { businessUnitId: 'bu_tech' }, context).map((r) => r.id)).toEqual(['r1'])
  })

  it('narrows by status', () => {
    expect(filterRisks(risks, { status: 'Completed' }, context).map((r) => r.id)).toEqual(['r2'])
  })

  it('returns everything for an empty filter set', () => {
    expect(filterRisks(risks, {}, context)).toHaveLength(2)
  })

  it('never widens the set it was given', () => {
    expect(filterRisks([risks[0]], {}, context)).toHaveLength(1)
  })
})

// --- heatmap ----------------------------------------------------------------

describe('heatmap', () => {
  const risks = [
    risk({ id: 'r1', residual: { impact: 3, likelihood: 3 } }),
    risk({ id: 'r2', residual: { impact: 3, likelihood: 3 } }),
    risk({ id: 'r3', residual: { impact: 5, likelihood: 5 } }),
  ]
  const context = makeContext(risks)

  it('always returns all 25 cells', () => {
    expect(computeHeatmap(risks, 'residual', context)).toHaveLength(25)
  })

  it('counts risks into their exact cell', () => {
    const cells = computeHeatmap(risks, 'residual', context)
    expect(cells.find((c) => c.impact === 3 && c.likelihood === 3)?.count).toBe(2)
    expect(cells.find((c) => c.impact === 5 && c.likelihood === 5)?.count).toBe(1)
    expect(cells.find((c) => c.impact === 1 && c.likelihood === 1)?.count).toBe(0)
  })

  it('reads each cell rating from the configured matrix', () => {
    const cells = computeHeatmap(risks, 'residual', context)
    expect(cells.find((c) => c.impact === 1 && c.likelihood === 1)?.rating).toBe('Low')

    const edited = makeMatrix()
    const target = edited.cells.find((c) => c.impact === 1 && c.likelihood === 1)
    if (target) target.rating = 'Significant'
    const editedIndex = buildRegisterIndex({ categories: CATEGORIES, businessUnits: UNITS, users: USERS, matrix: edited })

    const updated = computeHeatmap(risks, 'residual', { matrix: edited, index: editedIndex })
    expect(updated.find((c) => c.impact === 1 && c.likelihood === 1)?.rating).toBe('Significant')
  })

  it('supports all three assessment bases', () => {
    for (const basis of ['inherent', 'residual', 'target'] as const) {
      const cells = computeHeatmap(risks, basis, context)
      expect(cells.reduce((total, cell) => total + cell.count, 0), basis).toBe(3)
    }
  })
})

// --- distribution -----------------------------------------------------------

describe('distribution', () => {
  const risks = [
    risk({ id: 'r1', status: 'Monitoring', responseType: 'Mitigate', outlook: 'Stable', categoryId: 'cat_cyber', businessUnitId: 'bu_sec' }),
    risk({ id: 'r2', status: 'Monitoring', responseType: 'Accept', outlook: 'Increasing', categoryId: 'cat_credit', businessUnitId: 'bu_fin' }),
    risk({ id: 'r3', status: 'Completed', responseType: 'Mitigate', outlook: 'Stable', categoryId: 'cat_cyber', businessUnitId: 'bu_sec' }),
  ]
  const context = makeContext(risks)

  it('groups by status', () => {
    const buckets = computeDistribution(risks, 'status', context)
    expect(buckets.find((b) => b.key === 'Monitoring')?.count).toBe(2)
    expect(buckets.find((b) => b.key === 'Completed')?.count).toBe(1)
  })

  it('groups by category using the Level 2 label', () => {
    const buckets = computeDistribution(risks, 'category', context)
    expect(buckets.find((b) => b.key === 'cat_cyber')?.label).toBe('Cyber Security')
    expect(buckets.find((b) => b.key === 'cat_cyber')?.count).toBe(2)
  })

  it('groups by business unit using the full hierarchy path', () => {
    const buckets = computeDistribution(risks, 'businessUnit', context)
    expect(buckets.find((b) => b.key === 'bu_sec')?.label).toBe('Enterprise / Technology / Security')
  })

  it('groups by response and outlook', () => {
    expect(computeDistribution(risks, 'response', context).find((b) => b.key === 'Mitigate')?.count).toBe(2)
    expect(computeDistribution(risks, 'outlook', context).find((b) => b.key === 'Increasing')?.count).toBe(1)
  })

  it('lists every rating even when a rating has no risks', () => {
    const buckets = computeDistribution(risks, 'rating', context)
    expect(buckets.map((b) => b.key).sort()).toEqual(['High', 'Low', 'Medium', 'Significant'])
  })

  it('groups by computed trend', () => {
    const trended = [
      risk({ id: 't1', history: [snapshot({ impact: 4, likelihood: 4 }, '2026-01-01'), snapshot({ impact: 2, likelihood: 2 }, '2026-06-01')] }),
      risk({ id: 't2', history: [] }),
    ]
    const buckets = computeDistribution(trended, 'trend', makeContext(trended))

    expect(buckets.find((b) => b.key === 'Improving')?.count).toBe(1)
    expect(buckets.find((b) => b.key === 'New')?.count).toBe(1)
  })

  it('groups by action status across every risk', () => {
    const withActions = [
      risk({ id: 'a1', actions: [action({ id: 'x', status: 'Completed' }), action({ id: 'y', status: 'Blocked' })] }),
      risk({ id: 'a2', actions: [action({ id: 'z', status: 'Completed' })] }),
    ]
    const buckets = computeDistribution(withActions, 'actionStatus', makeContext(withActions))

    expect(buckets.find((b) => b.key === 'Completed')?.count).toBe(2)
    expect(buckets.find((b) => b.key === 'Blocked')?.count).toBe(1)
  })

  it('sorts by count descending, then label', () => {
    const buckets = computeDistribution(risks, 'status', context)
    expect(buckets[0].key).toBe('Monitoring')
  })
})

// --- top risks --------------------------------------------------------------

describe('top risks', () => {
  const risks = [
    risk({ id: 'low', ref: 'A-001', residual: { impact: 1, likelihood: 1 } }),
    risk({ id: 'high', ref: 'B-001', residual: { impact: 5, likelihood: 5 } }),
    risk({ id: 'mid', ref: 'C-001', residual: { impact: 3, likelihood: 3 } }),
  ]
  const context = makeContext(risks)

  it('orders by score descending', () => {
    expect(computeTopRisks(risks, 'residual', 10, context).map((entry) => entry.risk.id)).toEqual([
      'high', 'mid', 'low',
    ])
  })

  it('applies the limit', () => {
    expect(computeTopRisks(risks, 'residual', 2, context)).toHaveLength(2)
  })

  it('clamps the limit to 1-20', () => {
    expect(computeTopRisks(risks, 'residual', 0, context)).toHaveLength(1)
    expect(computeTopRisks(risks, 'residual', 999, context)).toHaveLength(3)
  })

  it('breaks ties on reference so ordering is stable', () => {
    const tied = [
      risk({ id: 'x', ref: 'Z-002', residual: { impact: 3, likelihood: 3 } }),
      risk({ id: 'y', ref: 'Z-001', residual: { impact: 3, likelihood: 3 } }),
    ]
    expect(computeTopRisks(tied, 'residual', 10, context).map((entry) => entry.risk.ref)).toEqual([
      'Z-001', 'Z-002',
    ])
  })

  it('carries the rating from the engine', () => {
    expect(computeTopRisks(risks, 'residual', 1, context)[0].rating).toBe('Significant')
  })
})

// --- action progress --------------------------------------------------------

describe('action plan progress', () => {
  const risks = [
    risk({
      id: 'r1',
      actions: [
        action({ id: 'a1', status: 'Completed', progress: 100, dueDate: '2026-01-01' }),
        action({ id: 'a2', status: 'In Progress', progress: 50, dueDate: '2026-01-01' }),
      ],
    }),
  ]
  const context = makeContext(risks)

  it('summarises totals, completion, overdue and average progress', () => {
    const summary = computeActionProgress(risks, context)

    expect(summary.total).toBe(2)
    expect(summary.completed).toBe(1)
    expect(summary.overdue).toBe(1) // a2 only; a1 is Completed
    expect(summary.averageProgress).toBe(75)
  })

  it('includes a status breakdown', () => {
    const summary = computeActionProgress(risks, context)
    expect(summary.byStatus.find((bucket) => bucket.key === 'Completed')?.count).toBe(1)
  })

  it('handles a risk set with no actions', () => {
    const empty = computeActionProgress([risk()], makeContext([risk()]))
    expect(empty).toMatchObject({ total: 0, completed: 0, overdue: 0, averageProgress: 0 })
  })
})

// --- trend summary ----------------------------------------------------------

describe('trend summary', () => {
  it('counts by computed trend, not by the manual outlook', () => {
    const risks = [
      // Outlook says Increasing, but the history shows improvement.
      risk({ id: 'r1', outlook: 'Increasing', history: [snapshot({ impact: 4, likelihood: 4 }, '2026-01-01'), snapshot({ impact: 2, likelihood: 2 }, '2026-06-01')] }),
      risk({ id: 'r2', history: [snapshot({ impact: 2, likelihood: 2 }, '2026-01-01'), snapshot({ impact: 4, likelihood: 4 }, '2026-06-01')] }),
      risk({ id: 'r3', history: [snapshot({ impact: 3, likelihood: 3 }, '2026-01-01'), snapshot({ impact: 3, likelihood: 3 }, '2026-06-01')] }),
      risk({ id: 'r4', history: [] }),
    ]

    expect(computeTrendSummary(risks)).toEqual({ improving: 1, worsening: 1, stable: 1, isNew: 1 })
  })
})

// --- recent activity --------------------------------------------------------

describe('recent activity', () => {
  const events: AuditEvent[] = Array.from({ length: 30 }, (_, i) => ({
    id: `a${String(i)}`, date: `2026-06-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    actorId: 'usr_a', action: 'risk.updated', entityType: 'Risk', entityId: 'r1', summary: `event ${String(i)}`,
  }))

  it('takes the first N, which are newest-first in stored order', () => {
    expect(computeRecentActivity(events, 5)).toHaveLength(5)
    expect(computeRecentActivity(events, 5)[0].id).toBe('a0')
  })

  it('clamps the limit to 1-20', () => {
    expect(computeRecentActivity(events, 0)).toHaveLength(1)
    expect(computeRecentActivity(events, 999)).toHaveLength(20)
  })
})

// --- lifecycle --------------------------------------------------------------

describe('dashboard lifecycle', () => {
  it('blocks deleting the last dashboard', () => {
    expect(canDeleteDashboard(1)).toBe(false)
    expect(canDeleteDashboard(0)).toBe(false)
    expect(canDeleteDashboard(2)).toBe(true)
  })

  it('duplicates with a new ID and an independent widget collection', () => {
    const original = { id: 'dash_1', nameEn: 'Overview', widgets: [{ id: 'w1' }, { id: 'w2' }] }
    const copy = duplicateDashboard(original, 'dash_2', (index) => `w_copy_${String(index)}`)

    expect(copy.id).toBe('dash_2')
    expect(copy.nameEn).toBe('Overview (copy)')
    expect(copy.widgets.map((widget) => widget.id)).toEqual(['w_copy_0', 'w_copy_1'])

    // Editing the copy must not reach the original.
    copy.widgets[0].id = 'changed'
    expect(original.widgets[0].id).toBe('w1')
  })

  it('reorders widgets', () => {
    const widgets = ['a', 'b', 'c']
    expect(reorderWidgets(widgets, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(reorderWidgets(widgets, 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('ignores an out-of-range reorder', () => {
    const widgets = ['a', 'b']
    expect(reorderWidgets(widgets, -1, 0)).toEqual(['a', 'b'])
    expect(reorderWidgets(widgets, 0, 5)).toEqual(['a', 'b'])
  })

  it('does not mutate the input on reorder', () => {
    const widgets = ['a', 'b', 'c']
    reorderWidgets(widgets, 0, 2)
    expect(widgets).toEqual(['a', 'b', 'c'])
  })
})
