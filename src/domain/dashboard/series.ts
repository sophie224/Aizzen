import { RATING_LABELS } from '../types/enums.ts'
import type { RatingLabel, Risk, WidgetGrouping } from '../types/index.ts'
import { ratingColor, ratingName } from '../risk-engine/index.ts'
import { computeDistribution, type DashboardContext } from './index.ts'

/*
 * Chart data for a distribution widget (CR-2026-014 FR-01).
 *
 * A widget plots one grouping on the category axis and, optionally, a second
 * grouping as the series — "risks by business unit, broken down by rating", the
 * shape the change request's own example uses.
 *
 * The data is COUNTED FROM THE REGISTER, never entered by hand. That is the
 * whole point of a risk dashboard: a widget total and the register result under
 * the same filters have to be the same number, and a hand-typed series could
 * contradict it silently (ARCHITECTURE.md §7, CR-004).
 *
 * Pure: no React, no I/O, no storage.
 */

/** One plotted series — a column in the stack, or a line. */
export interface ChartSeries {
  /** Stable key; matches the keys in every `ChartPoint.values`. */
  key: string
  label: string
  color: string
}

/** One category on the axis, with a value per series. */
export interface ChartPoint {
  key: string
  name: string
  values: Record<string, number>
  /**
   * Slice colour, for pie and doughnut. Those plot one series with a slice per
   * CATEGORY, so the colour control is per slice rather than per series
   * (FR-01, FR-04).
   */
  color?: string
}

export interface ChartData {
  points: ChartPoint[]
  series: ChartSeries[]
}

/** Single-series key, used when a widget has no breakdown. */
export const TOTAL_SERIES = 'total'

/**
 * Palette for series a widget colours itself.
 *
 * Rating series are excluded: their colour is the configured matrix colour and
 * is never overridden, so a level always looks the same everywhere (CR-003).
 * Cycles, so adjacent series differ (FR-04).
 */
export const SERIES_PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const

export function seriesColorAt(index: number): string {
  return SERIES_PALETTE[index % SERIES_PALETTE.length]
}

/**
 * The series dimension for a risk, as a stable key and a display label.
 * Mirrors `computeDistribution`'s bucketing so both axes speak the same
 * vocabulary.
 */
function seriesOf(
  risk: Risk,
  grouping: WidgetGrouping,
  context: DashboardContext,
): { key: string; label: string } {
  const [bucket] = computeDistribution([risk], grouping, context).filter(
    (candidate) => candidate.count > 0,
  )
  return bucket
    ? { key: bucket.key, label: bucket.label }
    : { key: 'unassigned', label: '—' }
}

/**
 * Counts risks into a category × series matrix.
 *
 * With no `breakdown` the result is one series carrying the same counts
 * `computeDistribution` produces, so a plain column chart and the existing bar
 * list always agree.
 */
export interface ChartDataOptions {
  /** Legend label for the single series when there is no breakdown. */
  totalLabel?: string
  /** Per-series colour overrides, keyed by series key (FR-04). */
  seriesColors?: Readonly<Record<string, string>>
}

export function computeChartData(
  risks: readonly Risk[],
  grouping: WidgetGrouping,
  breakdown: WidgetGrouping | undefined,
  context: DashboardContext,
  options: ChartDataOptions = {},
): ChartData {
  const seriesColors = options.seriesColors ?? {}
  const buckets = computeDistribution(risks, grouping, context)

  if (!breakdown || breakdown === grouping) {
    return {
      series: [
        {
          key: TOTAL_SERIES,
          label: options.totalLabel ?? TOTAL_SERIES,
          color: seriesColors[TOTAL_SERIES] ?? seriesColorAt(0),
        },
      ],
      points: buckets.map((bucket, index) => ({
        key: bucket.key,
        name: bucket.label,
        values: { [TOTAL_SERIES]: bucket.count },
        color: seriesColors[bucket.key] ?? seriesColorAt(index),
      })),
    }
  }

  /*
   * Rating series are enumerated in matrix order so the stack always reads
   * Low → Significant, whether or not every level is present in the data.
   */
  const series = new Map<string, ChartSeries>()
  if (breakdown === 'rating') {
    RATING_LABELS.forEach((rating: RatingLabel) => {
      series.set(rating, {
        key: rating,
        label: ratingName(context.matrix, rating, context.language),
        color: ratingColor(rating, context.matrix),
      })
    })
  }

  const points = new Map<string, ChartPoint>()
  buckets.forEach((bucket, index) => {
    points.set(bucket.key, {
      key: bucket.key,
      name: bucket.label,
      values: {},
      color: seriesColors[bucket.key] ?? seriesColorAt(index),
    })
  })

  for (const risk of risks) {
    const [category] = computeDistribution([risk], grouping, context).filter(
      (candidate) => candidate.count > 0,
    )
    if (!category) continue
    const point = points.get(category.key)
    if (!point) continue

    const dimension = seriesOf(risk, breakdown, context)
    if (!series.has(dimension.key)) {
      series.set(dimension.key, {
        key: dimension.key,
        label: dimension.label,
        color: seriesColors[dimension.key] ?? seriesColorAt(series.size),
      })
    }
    point.values[dimension.key] = (point.values[dimension.key] ?? 0) + 1
  }

  // Every point carries every series key, so a stack never has a hole in it.
  const resolved = [...series.values()].map((entry) => ({
    ...entry,
    color: seriesColors[entry.key] ?? entry.color,
  }))
  for (const point of points.values()) {
    for (const entry of resolved) {
      point.values[entry.key] = point.values[entry.key] ?? 0
    }
  }

  return { series: resolved, points: [...points.values()] }
}

/** Largest single value, for a clustered or line axis. */
export function maxValue(data: ChartData): number {
  return Math.max(
    1,
    ...data.points.flatMap((point) => data.series.map((entry) => point.values[entry.key] ?? 0)),
  )
}

/** Largest stack total, for a stacked axis. */
export function maxStack(data: ChartData): number {
  return Math.max(
    1,
    ...data.points.map((point) =>
      data.series.reduce((sum, entry) => sum + (point.values[entry.key] ?? 0), 0),
    ),
  )
}

/** Stack total for one category — the denominator of a 100% chart. */
export function stackTotal(point: ChartPoint, series: readonly ChartSeries[]): number {
  return series.reduce((sum, entry) => sum + (point.values[entry.key] ?? 0), 0)
}
