import { describe, expect, it } from 'vitest'
import {
  TOTAL_SERIES,
  computeChartData,
  maxStack,
  maxValue,
  seriesColorAt,
  stackTotal,
} from './series.ts'
import { computeDistribution, type DashboardContext } from './index.ts'
import { buildRegisterIndex } from '../register/index.ts'
import { createDefaultMatrix } from '../risk-engine/default-matrix.ts'
import type { Category, Risk } from '../types/index.ts'

const matrix = createDefaultMatrix()

const CATEGORIES: Category[] = [
  {
    id: 'cat_16', level1En: 'Operational', level1Ka: '',
    level2En: 'Data Governance', level2Ka: '', active: true,
  },
]

/*
 * CR-2026-014 FR-01. The chart data is COUNTED FROM THE REGISTER — these tests
 * exist to keep it that way, so a widget can never disagree with the register
 * under the same filters.
 */

function makeRisk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk_1', ref: 'TECH-001', title: 'Risk', type: 'Current',
    categoryId: 'cat_16', businessUnitId: 'bu_technology', riskOwnerId: 'usr_owner',
    originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
    status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
    description: '', cause: 'c', event: 'e', consequence: 'q', statusNarrative: '',
    inherent: { impact: 5, likelihood: 5 },
    residual: { impact: 1, likelihood: 1 },
    target: { impact: 1, likelihood: 1 },
    controls: [], actions: [],
    acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
    custom: {}, history: [], audit: [], updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const RISKS: Risk[] = [
  makeRisk({ id: 'r1', status: 'In Progress', residual: { impact: 1, likelihood: 1 } }),
  makeRisk({ id: 'r2', status: 'In Progress', residual: { impact: 5, likelihood: 5 } }),
  makeRisk({ id: 'r3', status: 'Monitoring', residual: { impact: 5, likelihood: 5 } }),
]

const index = buildRegisterIndex({ categories: CATEGORIES, businessUnits: [], users: [], matrix })

function makeContext(risks: readonly Risk[]): DashboardContext {
  return {
    risks, businessUnits: [], categories: CATEGORIES, users: [],
    customAttributes: [], matrix, index, auditEvents: [],
    dashboards: [], today: '2026-08-16', language: 'en',
  }
}

describe('computeChartData', () => {
  const context = makeContext(RISKS)

  it('produces one series that matches computeDistribution exactly', () => {
    const data = computeChartData(RISKS, 'status', undefined, context, { totalLabel: 'Risks' })
    const buckets = computeDistribution(RISKS, 'status', context)

    expect(data.series).toHaveLength(1)
    expect(data.series[0].key).toBe(TOTAL_SERIES)
    expect(data.points.map((point) => point.values[TOTAL_SERIES])).toEqual(
      buckets.map((bucket) => bucket.count),
    )
  })

  it('breaks a category down into a second dimension', () => {
    const data = computeChartData(RISKS, 'status', 'rating', context)

    const inProgress = data.points.find((point) => point.key === 'In Progress')
    expect(inProgress).toBeDefined()
    // r1 is Low (1×1), r2 is Significant (5×5).
    expect(inProgress?.values.Low).toBe(1)
    expect(inProgress?.values.Significant).toBe(1)
  })

  it('keeps every stack total equal to the category count', () => {
    const data = computeChartData(RISKS, 'status', 'rating', context)
    const buckets = computeDistribution(RISKS, 'status', context)

    for (const point of data.points) {
      const bucket = buckets.find((candidate) => candidate.key === point.key)
      expect(stackTotal(point, data.series), point.name).toBe(bucket?.count)
    }
  })

  it('enumerates rating series in matrix order, present in the data or not', () => {
    const data = computeChartData(RISKS, 'status', 'rating', context)
    expect(data.series.map((entry) => entry.key)).toEqual([
      'Low', 'Medium', 'High', 'Significant',
    ])
  })

  it('colours a rating series from the matrix, never from the palette', () => {
    const data = computeChartData(RISKS, 'status', 'rating', context)
    const significant = data.series.find((entry) => entry.key === 'Significant')
    expect(significant?.color).toBe(matrix.colors.Significant)
  })

  it('gives every point every series key, so a stack has no holes', () => {
    const data = computeChartData(RISKS, 'status', 'rating', context)
    for (const point of data.points) {
      for (const entry of data.series) {
        expect(typeof point.values[entry.key], `${point.name}/${entry.key}`).toBe('number')
      }
    }
  })

  it('treats a breakdown equal to the grouping as no breakdown', () => {
    const data = computeChartData(RISKS, 'status', 'status', context)
    expect(data.series).toHaveLength(1)
  })

  it('applies per-series colour overrides', () => {
    const data = computeChartData(RISKS, 'status', 'category', context, {
      seriesColors: { cat_16: '#123456' },
    })
    expect(data.series.find((entry) => entry.key === 'cat_16')?.color).toBe('#123456')
  })

  it('returns an empty plot for an empty register rather than throwing', () => {
    const empty = makeContext([])
    const data = computeChartData([], 'status', 'rating', empty)
    expect(data.points).toEqual([])
    expect(maxValue(data)).toBe(1)
    expect(maxStack(data)).toBe(1)
  })
})

describe('seriesColorAt', () => {
  it('cycles so adjacent series always differ', () => {
    expect(seriesColorAt(0)).not.toBe(seriesColorAt(1))
    expect(seriesColorAt(0)).toBe(seriesColorAt(6))
  })
})
