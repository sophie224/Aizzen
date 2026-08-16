import { describe, expect, it } from 'vitest'
import {
  CHART_RULES,
  isValidQuery,
  repairQuery,
  seriesCount,
  seriesSource,
  validateQuery,
  type ChartKind,
  type WidgetQuery,
} from './rules.ts'
import { DIMENSIONS, MEASURES, findDimension } from './catalog.ts'

/* CR-2026-014 Rev 2 §7, §8 and acceptance tests 1–8, 11. */

const base: WidgetQuery = {
  chart: 'column',
  dimKey: 'category',
  breakdownKey: null,
  measures: [{ id: 'ms_1', key: 'count', agg: 'count' }],
}

const codes = (query: WidgetQuery, values = 0) => validateQuery(query, values).map((v) => v.code)

describe('catalog', () => {
  it('binds every dimension and measure to a declared shape', () => {
    for (const dimension of DIMENSIONS) {
      expect(dimension.key, dimension.key).toBeTruthy()
      expect(['categorical', 'ordinal']).toContain(dimension.type)
      expect(['low', 'mid', 'high']).toContain(dimension.cardinality)
    }
    for (const measure of MEASURES) {
      expect(measure.aggs.length, measure.key).toBeGreaterThan(0)
      expect(['count', 'score']).toContain(measure.unit)
    }
  })

  it('never sorts an ordinal dimension alphabetically', () => {
    const status = findDimension('status')
    expect(status?.order?.[0]).toBe('Draft')
    expect([...(status?.order ?? [])]).not.toEqual([...(status?.order ?? [])].sort())
  })

  it('marks rating dimensions as band-semantic so they use the matrix colours', () => {
    expect(findDimension('rating')?.semantic).toBe('band')
    expect(findDimension('inherentBand')?.semantic).toBe('band')
  })
})

describe('series resolution (§7)', () => {
  it('takes one series per measure when there is no breakdown (§7.1)', () => {
    const query = { ...base, measures: [base.measures[0], { id: 'ms_2', key: 'residualScore', agg: 'avg' }] }
    expect(seriesSource(query)).toBe('measures')
    expect(seriesCount(query)).toBe(2)
  })

  it('takes one series per breakdown value when there is one (§7.2)', () => {
    const query = { ...base, breakdownKey: 'rating' }
    expect(seriesSource(query)).toBe('breakdown')
    expect(seriesCount(query, 4)).toBe(4)
  })

  it('rejects several measures crossed with a breakdown (§7.3)', () => {
    const query = {
      ...base,
      breakdownKey: 'rating',
      measures: [base.measures[0], { id: 'ms_2', key: 'residualScore', agg: 'avg' }],
    }
    expect(codes(query)).toContain('breakdown.exclusive')
  })
})

describe('validation (§8)', () => {
  it('accepts a well-formed query', () => {
    expect(isValidQuery(base)).toBe(true)
  })

  it('rejects an aggregation the measure does not permit', () => {
    expect(codes({ ...base, measures: [{ id: 'm', key: 'count', agg: 'avg' }] })).toContain(
      'measure.aggNotPermitted',
    )
  })

  it('requires two series for a stacked chart (acceptance 4)', () => {
    // One measure, no breakdown — one series, so it is rejected...
    expect(codes({ ...base, chart: 'columnStacked' })).toContain('series.tooFew')
    // ...and a second series from either source clears it.
    const twoMeasures = {
      ...base,
      chart: 'columnStacked' as const,
      measures: [base.measures[0], { id: 'ms_2', key: 'residualScore', agg: 'avg' }],
    }
    expect(codes(twoMeasures)).not.toContain('series.tooFew')
    expect(codes({ ...base, chart: 'columnStacked', breakdownKey: 'rating' }, 1)).toContain('series.tooFew')
    expect(codes({ ...base, chart: 'columnStacked', breakdownKey: 'rating' }, 4)).not.toContain('series.tooFew')
  })

  it('rejects 100% stacking across mixed units (acceptance 5)', () => {
    const mixed: WidgetQuery = {
      ...base,
      chart: 'columnPct',
      measures: [
        { id: 'm1', key: 'count', agg: 'count' },
        { id: 'm2', key: 'residualScore', agg: 'avg' },
      ],
    }
    expect(codes(mixed)).toContain('series.mixedUnits')
  })

  it('allows line and area only on an ordinal group-by (acceptance 8)', () => {
    expect(codes({ ...base, chart: 'line', dimKey: 'category' })).toContain('dimension.mustBeOrdinal')
    expect(codes({ ...base, chart: 'line', dimKey: 'status' })).not.toContain('dimension.mustBeOrdinal')
  })

  it('excludes a high-cardinality field from breakdown and from pie', () => {
    expect(codes({ ...base, breakdownKey: 'owner' })).toContain('breakdown.tooManyValues')
    expect(codes({ ...base, chart: 'pie', dimKey: 'owner' })).toContain('dimension.tooManyValues')
  })

  it('rejects a breakdown equal to the group-by', () => {
    expect(codes({ ...base, breakdownKey: 'category' })).toContain('breakdown.sameAsGroupBy')
  })

  it('requires a render type and axis on every combo series', () => {
    const combo: WidgetQuery = {
      ...base,
      chart: 'combo',
      measures: [
        { id: 'm1', key: 'count', agg: 'count' },
        { id: 'm2', key: 'residualScore', agg: 'avg' },
      ],
    }
    expect(codes(combo)).toContain('measure.renderRequired')
    expect(isValidQuery(repairQuery(combo, 'combo'))).toBe(true)
  })

  it('constrains Top N limit and matrix size', () => {
    expect(codes({ ...base, chart: 'topN', dimKey: null, limit: 7 })).toContain('limit.notPermitted')
    expect(codes({ ...base, chart: 'matrix', dimKey: null, matrixSize: 9 })).toContain('matrixSize.outOfRange')
  })

  it('names the control each violation belongs to, for the disabled reason', () => {
    for (const violation of validateQuery({ ...base, chart: 'line', dimKey: 'category' })) {
      expect(['chart', 'measures', 'breakdown', 'dimension']).toContain(violation.field)
    }
  })
})

describe('auto-repair on chart switch (FR-05, acceptance 7)', () => {
  it('leaves a four-measure column valid when switched to pie', () => {
    const four: WidgetQuery = {
      ...base,
      measures: [
        { id: 'm1', key: 'count', agg: 'count' },
        { id: 'm2', key: 'residualScore', agg: 'avg' },
        { id: 'm3', key: 'inherentScore', agg: 'avg' },
        { id: 'm4', key: 'reduction', agg: 'avg' },
      ],
    }
    const repaired = repairQuery(four, 'pie')
    expect(repaired.measures).toHaveLength(1)
    expect(isValidQuery(repaired)).toBe(true)
  })

  it('clears a breakdown the target chart cannot take', () => {
    const repaired = repairQuery({ ...base, breakdownKey: 'rating' }, 'pie')
    expect(repaired.breakdownKey).toBeNull()
    expect(isValidQuery(repaired)).toBe(true)
  })

  it('substitutes a compatible group-by when switching to line', () => {
    const repaired = repairQuery({ ...base, dimKey: 'category' }, 'line')
    expect(findDimension(repaired.dimKey ?? '')?.type).toBe('ordinal')
    expect(isValidQuery(repaired)).toBe(true)
  })

  it('adds a measure when the target chart needs more', () => {
    const repaired = repairQuery(base, 'combo')
    expect(repaired.measures.length).toBeGreaterThanOrEqual(2)
    expect(isValidQuery(repaired)).toBe(true)
  })

  it('never leaves the user in an unusable state, for any chart', () => {
    for (const chart of Object.keys(CHART_RULES) as ChartKind[]) {
      const repaired = repairQuery(base, chart)
      expect(validateQuery(repaired, 4), chart).toEqual([])
    }
  })
})
