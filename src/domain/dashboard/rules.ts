import { MEASURES, findDimension, findMeasure, type Cardinality } from './catalog.ts'

/*
 * Chart rules and series resolution (CR-2026-014 Rev 2 §7, §8, FR-04, FR-05).
 *
 * The change request calls this the core of the change, and requires it as a
 * DECLARATIVE TABLE plus a SINGLE validation function — not branching inside
 * the UI — so the builder and the server can run the identical check.
 *
 * Pure: no React, no I/O, no storage. Safe to run on either side.
 */

export type ChartKind =
  | 'summary'
  | 'topN'
  | 'column'
  | 'columnStacked'
  | 'columnPct'
  | 'bar'
  | 'barStacked'
  | 'barPct'
  | 'line'
  | 'area'
  | 'combo'
  | 'pie'
  | 'doughnut'
  | 'matrix'

export interface QueryMeasure {
  id: string
  key: string
  agg: string
  color?: string
  render?: 'bar' | 'line'
  axis?: 'left' | 'right'
}

/** A widget stores a QUERY against the register, never a copy of data (§6). */
export interface WidgetQuery {
  chart: ChartKind
  dimKey: string | null
  breakdownKey: string | null
  measures: QueryMeasure[]
  limit?: number
  matrixSize?: number
}

interface ChartRule {
  minMeasures: number
  maxMeasures: number
  /** Whether a breakdown may be set at all. */
  allowsBreakdown: boolean
  /** 'required' | 'none' | 'fixed' — fixed means the chart chooses it. */
  groupBy: 'required' | 'none' | 'fixed'
  /** Stacked charts need two series, from either source (§7.4). */
  minSeries?: number
  /** 100% stacking is meaningless across mixed units (§7.4). */
  singleUnit?: boolean
  /** Line and area imply progression, so the group-by must be ordinal. */
  ordinalOnly?: boolean
  /** Pie and doughnut are unreadable past a modest number of slices. */
  maxCardinality?: Cardinality
  /** Combo needs a render type and axis per series. */
  perSeriesRender?: boolean
}

/** §8, as a table. Every gate the builder and the server apply lives here. */
export const CHART_RULES: Readonly<Record<ChartKind, ChartRule>> = {
  summary: { minMeasures: 1, maxMeasures: 3, allowsBreakdown: false, groupBy: 'none' },
  topN: { minMeasures: 1, maxMeasures: 1, allowsBreakdown: false, groupBy: 'none' },
  column: { minMeasures: 1, maxMeasures: 4, allowsBreakdown: true, groupBy: 'required' },
  columnStacked: { minMeasures: 1, maxMeasures: 4, allowsBreakdown: true, groupBy: 'required', minSeries: 2 },
  columnPct: { minMeasures: 1, maxMeasures: 4, allowsBreakdown: true, groupBy: 'required', minSeries: 2, singleUnit: true },
  bar: { minMeasures: 1, maxMeasures: 4, allowsBreakdown: true, groupBy: 'required' },
  barStacked: { minMeasures: 1, maxMeasures: 4, allowsBreakdown: true, groupBy: 'required', minSeries: 2 },
  barPct: { minMeasures: 1, maxMeasures: 4, allowsBreakdown: true, groupBy: 'required', minSeries: 2, singleUnit: true },
  line: { minMeasures: 1, maxMeasures: 4, allowsBreakdown: true, groupBy: 'required', ordinalOnly: true },
  area: { minMeasures: 1, maxMeasures: 4, allowsBreakdown: true, groupBy: 'required', ordinalOnly: true },
  combo: { minMeasures: 2, maxMeasures: 4, allowsBreakdown: false, groupBy: 'required', perSeriesRender: true },
  pie: { minMeasures: 1, maxMeasures: 1, allowsBreakdown: false, groupBy: 'required', maxCardinality: 'mid' },
  doughnut: { minMeasures: 1, maxMeasures: 1, allowsBreakdown: false, groupBy: 'required', maxCardinality: 'mid' },
  matrix: { minMeasures: 1, maxMeasures: 1, allowsBreakdown: false, groupBy: 'fixed' },
}

/** Where the plotted series come from. The two sources are exclusive (§7.3). */
export type SeriesSource = 'measures' | 'breakdown'

export function seriesSource(query: WidgetQuery): SeriesSource {
  return query.breakdownKey ? 'breakdown' : 'measures'
}

/**
 * How many series a query resolves to.
 *
 * With a breakdown the count depends on the DATA — how many distinct values
 * the field holds — so the caller supplies it. Without one it is simply the
 * measure count.
 */
export function seriesCount(query: WidgetQuery, breakdownValues = 0): number {
  return query.breakdownKey ? breakdownValues : query.measures.length
}

export interface RuleViolation {
  /** Stable code, so the UI can translate rather than display English. */
  code: string
  /** Which control the reason belongs to, for FR-04's disabled tooltips. */
  field: 'chart' | 'measures' | 'breakdown' | 'dimension'
}

const CARDINALITY_RANK: Record<Cardinality, number> = { low: 0, mid: 1, high: 2 }

/**
 * The single validation function (§8). Runs in the builder and on the server.
 *
 * `breakdownValues` is the number of distinct values the breakdown field holds
 * in the current data; pass 0 when it is not yet known. Rules that depend on
 * the resolved series count are only applied once it is.
 */
export function validateQuery(query: WidgetQuery, breakdownValues = 0): RuleViolation[] {
  const rule = CHART_RULES[query.chart]
  const violations: RuleViolation[] = []
  if (!rule) return [{ code: 'chart.unknown', field: 'chart' }]

  // --- measures -----------------------------------------------------------
  if (query.measures.length < rule.minMeasures) {
    violations.push({ code: 'measures.tooFew', field: 'measures' })
  }
  if (query.measures.length > rule.maxMeasures) {
    violations.push({ code: 'measures.tooMany', field: 'measures' })
  }
  for (const measure of query.measures) {
    const definition = findMeasure(measure.key)
    if (!definition) {
      violations.push({ code: 'measure.unknown', field: 'measures' })
      continue
    }
    if (!definition.aggs.includes(measure.agg as never)) {
      violations.push({ code: 'measure.aggNotPermitted', field: 'measures' })
    }
  }

  // --- the two series sources are mutually exclusive (§7.3) ---------------
  if (query.breakdownKey && query.measures.length > 1) {
    violations.push({ code: 'breakdown.exclusive', field: 'breakdown' })
  }
  if (query.breakdownKey && !rule.allowsBreakdown) {
    violations.push({ code: 'breakdown.notAllowed', field: 'breakdown' })
  }
  if (query.breakdownKey) {
    const breakdown = findDimension(query.breakdownKey)
    if (!breakdown) {
      violations.push({ code: 'breakdown.unknown', field: 'breakdown' })
    } else {
      if (breakdown.cardinality === 'high') {
        violations.push({ code: 'breakdown.tooManyValues', field: 'breakdown' })
      }
      if (query.breakdownKey === query.dimKey) {
        violations.push({ code: 'breakdown.sameAsGroupBy', field: 'breakdown' })
      }
    }
  }

  // --- group-by -----------------------------------------------------------
  const dimension = query.dimKey ? findDimension(query.dimKey) : undefined
  if (rule.groupBy === 'required') {
    if (!query.dimKey) {
      violations.push({ code: 'dimension.required', field: 'dimension' })
    } else if (!dimension) {
      violations.push({ code: 'dimension.unknown', field: 'dimension' })
    }
  }
  if (rule.groupBy === 'none' && query.dimKey) {
    violations.push({ code: 'dimension.notAllowed', field: 'dimension' })
  }
  if (rule.ordinalOnly && dimension && dimension.type !== 'ordinal') {
    violations.push({ code: 'dimension.mustBeOrdinal', field: 'chart' })
  }
  if (rule.maxCardinality && dimension) {
    if (CARDINALITY_RANK[dimension.cardinality] > CARDINALITY_RANK[rule.maxCardinality]) {
      violations.push({ code: 'dimension.tooManyValues', field: 'chart' })
    }
  }

  // --- derived rules (§7.4) ----------------------------------------------
  const resolved = seriesCount(query, breakdownValues)
  if (rule.minSeries && resolved > 0 && resolved < rule.minSeries) {
    violations.push({ code: 'series.tooFew', field: 'chart' })
  }
  if (rule.singleUnit) {
    const units = new Set(
      query.measures.map((measure) => findMeasure(measure.key)?.unit).filter(Boolean),
    )
    if (units.size > 1) violations.push({ code: 'series.mixedUnits', field: 'chart' })
  }
  if (rule.perSeriesRender) {
    for (const measure of query.measures) {
      if (!measure.render || !measure.axis) {
        violations.push({ code: 'measure.renderRequired', field: 'measures' })
        break
      }
    }
  }

  // --- chart-specific options --------------------------------------------
  if (query.chart === 'topN' && query.limit !== undefined && ![5, 10, 15].includes(query.limit)) {
    violations.push({ code: 'limit.notPermitted', field: 'chart' })
  }
  if (query.chart === 'matrix' && query.matrixSize !== undefined) {
    if (query.matrixSize < 3 || query.matrixSize > 6) {
      violations.push({ code: 'matrixSize.outOfRange', field: 'chart' })
    }
  }

  return violations
}

export function isValidQuery(query: WidgetQuery, breakdownValues = 0): boolean {
  return validateQuery(query, breakdownValues).length === 0
}

/**
 * Auto-repair on chart switch (FR-05).
 *
 * Switching chart type must never leave the user stuck: the configuration is
 * ADJUSTED to satisfy the new chart's rules rather than rejected. Trims excess
 * measures, adds one when the minimum is unmet, clears an incompatible
 * breakdown, substitutes a compatible group-by, and fills in combo render
 * types and axes.
 */
export function repairQuery(query: WidgetQuery, chart: ChartKind): WidgetQuery {
  const rule = CHART_RULES[chart]
  if (!rule) return query

  let measures = query.measures.slice(0, rule.maxMeasures)
  /*
   * A stacked chart needs two SERIES, not two measures. Without a breakdown
   * the only way to get them is a second measure, so the floor rises.
   */
  const floor =
    rule.minSeries && !query.breakdownKey
      ? Math.max(rule.minMeasures, Math.min(rule.minSeries, rule.maxMeasures))
      : rule.minMeasures
  if (measures.length < floor) {
    // Fill with the always-available count measure rather than blocking.
    /*
     * Pad from the catalog, never with a duplicate — two identical series
     * stack to nothing useful. A 100% chart additionally needs every series to
     * share a unit, so the filler is drawn from the same unit family.
     */
    const wantedUnit = rule.singleUnit
      ? (findMeasure(measures[0]?.key ?? 'count')?.unit ?? 'count')
      : undefined
    const used = new Set(measures.map((measure) => measure.key))
    const filler: QueryMeasure[] = []
    for (const candidate of MEASURES) {
      if (measures.length + filler.length >= floor) break
      if (used.has(candidate.key)) continue
      if (wantedUnit && candidate.unit !== wantedUnit) continue
      used.add(candidate.key)
      filler.push({
        id: `ms_fill_${String(filler.length)}`,
        key: candidate.key,
        agg: candidate.aggs[0],
      })
    }
    measures = [...measures, ...filler]
  }

  // Combo needs a render type and axis per series; first bar, rest line.
  if (rule.perSeriesRender) {
    measures = measures.map((measure, index) => ({
      ...measure,
      render: measure.render ?? (index === 0 ? 'bar' : 'line'),
      axis: measure.axis ?? (index === 0 ? 'left' : 'right'),
    }))
  }

  let breakdownKey = query.breakdownKey
  if (!rule.allowsBreakdown || measures.length > 1) breakdownKey = null
  if (breakdownKey) {
    const breakdown = findDimension(breakdownKey)
    if (!breakdown || breakdown.cardinality === 'high' || breakdownKey === query.dimKey) {
      breakdownKey = null
    }
  }

  let dimKey = query.dimKey
  if (rule.groupBy === 'none') {
    dimKey = null
  } else if (rule.groupBy === 'required') {
    const current = dimKey ? findDimension(dimKey) : undefined
    const unusable =
      !current ||
      (rule.ordinalOnly && current.type !== 'ordinal') ||
      (rule.maxCardinality &&
        CARDINALITY_RANK[current.cardinality] > CARDINALITY_RANK[rule.maxCardinality])

    if (unusable) {
      // Substitute the first dimension this chart can actually plot.
      const substitute = DIMENSION_FALLBACKS.find((dimension) => {
        if (rule.ordinalOnly && dimension.type !== 'ordinal') return false
        if (rule.maxCardinality) {
          return CARDINALITY_RANK[dimension.cardinality] <= CARDINALITY_RANK[rule.maxCardinality]
        }
        return true
      })
      dimKey = substitute?.key ?? null
    }
  }

  return {
    ...query,
    chart,
    dimKey,
    breakdownKey,
    measures,
    limit: chart === 'topN' ? (query.limit ?? 10) : query.limit,
    matrixSize: chart === 'matrix' ? (query.matrixSize ?? 5) : query.matrixSize,
  }
}

/** Substitution order when a chart cannot plot the current group-by. */
const DIMENSION_FALLBACKS = [
  findDimension('rating'),
  findDimension('status'),
  findDimension('category'),
].filter((dimension): dimension is NonNullable<typeof dimension> => dimension !== undefined)
