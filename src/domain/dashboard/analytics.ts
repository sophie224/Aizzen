import { isActionOverdue } from '../actions/index.ts'
import { pickNamed } from '../localisation/index.ts'
import {
  isAboveAppetite,
  isAboveTarget,
  isReviewDueSoon,
  matchesFilters,
  REVIEW_SOON_DAYS,
  type RegisterIndex,
} from '../register/index.ts'
import { ratingColor, ratingLevels, ratingName, riskRating } from '../risk-engine/index.ts'
import { RISK_STATUSES, SCALE_VALUES } from '../types/enums.ts'
import type {
  AssessmentType,
  BusinessUnit,
  Category,
  IsoDate,
  Language,
  RatingLabel,
  RatingMatrix,
  Risk,
  RiskFilters,
  ScaleValue,
} from '../types/index.ts'

/*
 * Dashboard aggregation (CR-004).
 *
 * ONE function computes every widget on the dashboard. In Phase 1 it runs in
 * the browser over the already-scoped risk set; in Phase 2 the same function
 * is what the single aggregation endpoint hosts — which is why it is pure,
 * takes `today` as an argument and never reads the clock or storage.
 *
 * Two invariants hold it together:
 *
 *   1. It filters through `matchesFilters`, the SAME predicate the Register
 *      uses, so a widget total and the register result count reconcile exactly.
 *   2. Every name and colour comes from the saved matrix configuration
 *      (CR-003) — no palette or label is defined here.
 */

/** The bucket used for an empty dimension value. Always ordered last. */
export const UNASSIGNED_KEY = '__unassigned__'

/** Neutral grey for the Unassigned bucket — never a rating colour. */
export const UNASSIGNED_COLOR = '#b9bfd4'

/** Neutral palette for non-rating dimensions, so no false severity is implied. */
export const NEUTRAL_ACCENT = '#1a2151'

export interface AnalyticsInput {
  /** ALREADY narrowed by `visibleRisks` — aggregation never widens scope. */
  risks: readonly Risk[]
  filters: RiskFilters
  /** Which assessment the heat map counts. Residual is the documented default. */
  basis: AssessmentType
  businessUnits: readonly BusinessUnit[]
  categories: readonly Category[]
  matrix: RatingMatrix
  index: RegisterIndex
  today: IsoDate
  language: Language
  /** Categories beyond this many collapse into one "Other" bar. */
  categoryLimit?: number
  /** Include active business units that currently hold no risks. */
  includeEmptyBusinessUnits?: boolean
}

export interface KpiTile {
  id: 'openRisks' | 'aboveAppetite' | 'overdueActions' | 'aboveTarget' | 'reviewsDue'
  value: number
  /** Accent colour: a configured rating colour, or the neutral accent. */
  color: string
  /** Filters that reproduce exactly this population in the Register. */
  filters: RiskFilters
}

export interface HeatCell {
  impact: ScaleValue
  likelihood: ScaleValue
  count: number
  rating: RatingLabel
  color: string
}

export interface StackedSegment {
  /** Stable rating key; the label is resolved for display. */
  key: RatingLabel
  label: string
  color: string
  count: number
  /** Filters reproducing this segment in the Register. */
  filters: RiskFilters
}

export interface StackedBar {
  /** Stable identity: a business unit ID, a status, a category ID, or the
   *  Unassigned / Other sentinels. */
  key: string
  label: string
  total: number
  segments: StackedSegment[]
  /** Absent for the "Other" bar, which has no single equivalent filter. */
  filters?: RiskFilters
  /** Populated for the "Other" bar: what it rolled up. */
  contains?: string[]
}

export interface DashboardAnalytics {
  /** Risks matching the filters — reconciles with the Register result count. */
  total: number
  kpis: KpiTile[]
  heatmap: {
    basis: AssessmentType
    cells: HeatCell[]
    /** Risks excluded because their assessment is missing or out of range. */
    unassessed: number
  }
  byBusinessUnit: StackedBar[]
  byStatus: StackedBar[]
  byCategory: StackedBar[]
}

const isScale = (value: unknown): value is ScaleValue =>
  typeof value === 'number' && SCALE_VALUES.includes(value as ScaleValue)

/** Builds the rating segments of one bar, in configured order. */
function segmentsFor(
  risks: readonly Risk[],
  matrix: RatingMatrix,
  index: RegisterIndex,
  language: Language,
  filtersFor: (rating: RatingLabel) => RiskFilters,
): StackedSegment[] {
  const counts = new Map<RatingLabel, number>()
  for (const risk of risks) {
    const rating = riskRating(risk.residual, matrix, index.ratingLookup)
    counts.set(rating, (counts.get(rating) ?? 0) + 1)
  }

  return ratingLevels(matrix).map((level) => ({
    key: level.key,
    label: ratingName(matrix, level.key, language),
    color: ratingColor(level.key, matrix),
    count: counts.get(level.key) ?? 0,
    filters: filtersFor(level.key),
  }))
}

/** Groups risks by a key, keeping the Unassigned bucket separate. */
function groupBy(risks: readonly Risk[], keyOf: (risk: Risk) => string) {
  const groups = new Map<string, Risk[]>()
  for (const risk of risks) {
    const key = keyOf(risk) || UNASSIGNED_KEY
    const bucket = groups.get(key)
    if (bucket) bucket.push(risk)
    else groups.set(key, [risk])
  }
  return groups
}

/** Sorts by total descending, with the Unassigned bucket pinned last. */
function byTotalUnassignedLast(a: StackedBar, b: StackedBar): number {
  if (a.key === UNASSIGNED_KEY) return 1
  if (b.key === UNASSIGNED_KEY) return -1
  return b.total - a.total
}

export function computeDashboardAnalytics(input: AnalyticsInput): DashboardAnalytics {
  const { matrix, index, language, today } = input

  // Gate first: everything below counts the same population the Register does.
  const risks = input.risks.filter((risk) =>
    matchesFilters(risk, input.filters, input.businessUnits, index, matrix, today),
  )

  const unassignedLabel = UNASSIGNED_KEY
  const withFilters = (extra: RiskFilters): RiskFilters => ({ ...input.filters, ...extra })

  // --- KPI tiles -------------------------------------------------------------

  const levels = ratingLevels(matrix)
  const mostSevere = levels[levels.length - 1]

  const kpis: KpiTile[] = [
    {
      id: 'openRisks',
      value: risks.filter((risk) => risk.status !== 'Completed').length,
      color: NEUTRAL_ACCENT,
      // A real predicate, so the tile and its drill-through agree exactly.
      filters: withFilters({ open: true }),
    },
    {
      id: 'aboveAppetite',
      value: risks.filter((risk) => isAboveAppetite(risk, matrix, index.ratingLookup)).length,
      // Rating-based, so it carries the configured colour of that level.
      color: mostSevere ? ratingColor(mostSevere.key, matrix) : NEUTRAL_ACCENT,
      filters: withFilters({ aboveAppetite: true }),
    },
    {
      id: 'overdueActions',
      value: risks.reduce(
        (total, risk) => total + risk.actions.filter((action) => isActionOverdue(action, today)).length,
        0,
      ),
      color: NEUTRAL_ACCENT,
      filters: withFilters({ hasOverdueAction: true }),
    },
    {
      id: 'aboveTarget',
      value: risks.filter(isAboveTarget).length,
      color: NEUTRAL_ACCENT,
      filters: withFilters({ aboveTarget: true }),
    },
    {
      id: 'reviewsDue',
      value: risks.filter((risk) => isReviewDueSoon(risk, today)).length,
      color: NEUTRAL_ACCENT,
      filters: withFilters({ reviewDueSoon: true }),
    },
  ]

  // --- heat map --------------------------------------------------------------

  const counts = new Map<string, number>()
  let unassessed = 0

  for (const risk of risks) {
    const score = risk[input.basis]
    // A risk whose assessment is missing or out of range is reported, not hidden.
    if (!score || !isScale(score.impact) || !isScale(score.likelihood)) {
      unassessed += 1
      continue
    }
    const key = `${String(score.impact)}:${String(score.likelihood)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const cells: HeatCell[] = []
  for (const impact of SCALE_VALUES) {
    for (const likelihood of SCALE_VALUES) {
      const rating = riskRating({ impact, likelihood }, matrix, index.ratingLookup)
      cells.push({
        impact,
        likelihood,
        count: counts.get(`${String(impact)}:${String(likelihood)}`) ?? 0,
        rating,
        color: ratingColor(rating, matrix),
      })
    }
  }

  // --- stacked bars ----------------------------------------------------------

  /*
   * "Unassigned" covers an empty reference AND one that no longer resolves —
   * a category or unit that was deactivated and removed leaves the risk
   * pointing at nothing, and it must still be counted somewhere (CR-004 §10).
   */
  const knownUnits = new Set(input.businessUnits.map((unit) => unit.id))
  const knownCategories = new Set(input.categories.map((category) => category.id))

  const businessUnitGroups = groupBy(risks, (risk) =>
    knownUnits.has(risk.businessUnitId) ? risk.businessUnitId : '',
  )
  if (input.includeEmptyBusinessUnits) {
    // "Show all": units with no risks join the chart as empty bars.
    for (const unit of input.businessUnits) {
      if (unit.active && !businessUnitGroups.has(unit.id)) businessUnitGroups.set(unit.id, [])
    }
  }

  const businessUnitBars: StackedBar[] = [...businessUnitGroups]
    .map(([key, group]) => ({
      key,
      label:
        key === unassignedLabel ? UNASSIGNED_KEY : index.businessUnitLabel.get(key) ?? UNASSIGNED_KEY,
      total: group.length,
      segments: segmentsFor(group, matrix, index, language, (rating) =>
        withFilters({ businessUnitId: key, residualRating: rating }),
      ),
      filters: key === unassignedLabel ? undefined : withFilters({ businessUnitId: key }),
    }))
    .sort(byTotalUnassignedLast)

  /*
   * Status bars follow the application's own status order, not a count order —
   * a workflow reads wrong when its stages are shuffled.
   */
  const statusGroups = groupBy(risks, (risk) => risk.status)
  const statusBars: StackedBar[] = [...RISK_STATUSES, UNASSIGNED_KEY]
    .filter((status) => statusGroups.has(status))
    .map((status) => {
      const group = statusGroups.get(status) ?? []
      return {
        key: status,
        label: status,
        total: group.length,
        segments: segmentsFor(group, matrix, index, language, (rating) =>
          withFilters({ status: status as Risk['status'], residualRating: rating }),
        ),
        filters:
          status === UNASSIGNED_KEY
            ? undefined
            : withFilters({ status: status as Risk['status'] }),
      }
    })

  const categoryBars = buildCategoryBars(risks, input, withFilters, knownCategories)

  return {
    total: risks.length,
    kpis,
    heatmap: { basis: input.basis, cells, unassessed },
    byBusinessUnit: businessUnitBars,
    byStatus: statusBars,
    byCategory: categoryBars,
  }
}

/**
 * Category bars, capped at `categoryLimit` with the remainder rolled into one
 * "Other" bar that names what it contains (CR-004 §3.4).
 */
function buildCategoryBars(
  risks: readonly Risk[],
  input: AnalyticsInput,
  withFilters: (extra: RiskFilters) => RiskFilters,
  knownCategories: ReadonlySet<string>,
): StackedBar[] {
  const { matrix, index, language } = input
  const limit = input.categoryLimit ?? 10

  const label = (id: string) => {
    const category = input.categories.find((candidate) => candidate.id === id)
    return category ? pickNamed(category, 'level2', language) : UNASSIGNED_KEY
  }

  const bars: StackedBar[] = [
    ...groupBy(risks, (risk) => (knownCategories.has(risk.categoryId) ? risk.categoryId : '')),
  ]
    .map(([key, group]) => ({
      key,
      label: key === UNASSIGNED_KEY ? UNASSIGNED_KEY : label(key),
      total: group.length,
      segments: segmentsFor(group, matrix, index, language, (rating) =>
        withFilters({ categoryId: key, residualRating: rating }),
      ),
      filters: key === UNASSIGNED_KEY ? undefined : withFilters({ categoryId: key }),
    }))
    .sort(byTotalUnassignedLast)

  if (bars.length <= limit) return bars

  const kept = bars.slice(0, limit)
  const rolled = bars.slice(limit)
  const rolledKeys = new Set(rolled.map((bar) => bar.key))
  const rolledRisks = risks.filter((risk) =>
    rolledKeys.has(knownCategories.has(risk.categoryId) ? risk.categoryId : UNASSIGNED_KEY),
  )

  kept.push({
    key: '__other__',
    label: '__other__',
    total: rolled.reduce((sum, bar) => sum + bar.total, 0),
    segments: segmentsFor(rolledRisks, matrix, index, language, () => withFilters({})),
    contains: rolled.map((bar) => bar.label),
  })

  return kept
}

export { REVIEW_SOON_DAYS }
