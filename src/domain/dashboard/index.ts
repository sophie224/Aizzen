import { summariseActions, isActionOverdue } from '../actions/index.ts'
import { hierarchyPath } from '../business-units/index.ts'
import { pickNamed } from '../localisation/index.ts'
import { matchesFilters, type RegisterIndex } from '../register/index.ts'
import { riskRating, riskScore } from '../risk-engine/index.ts'
import { historicalTrend } from '../trend/index.ts'
import { RATING_LABELS, SCALE_VALUES } from '../types/enums.ts'
import type {
  AssessmentType,
  AuditEvent,
  BusinessUnit,
  Category,
  CustomAttribute,
  Dashboard,
  IsoDate,
  Language,
  RatingMatrix,
  Risk,
  RiskFilters,
  ScaleValue,
  User,
  WidgetGrouping,
  WidgetMetric,
} from '../types/index.ts'

/*
 * Dashboard computations (ARCHITECTURE.md §8.3).
 *
 * Pure, and built on the SAME engines the Register uses — `matchesFilters` for
 * scoping and `riskRating` for every rating. A matrix change therefore moves
 * heatmaps, distributions and rating filters together, with no code change.
 */

export interface DashboardContext {
  risks: readonly Risk[]
  businessUnits: readonly BusinessUnit[]
  categories: readonly Category[]
  users: readonly User[]
  customAttributes: readonly CustomAttribute[]
  matrix: RatingMatrix
  index: RegisterIndex
  auditEvents: readonly AuditEvent[]
  /** Report sections resolve their dashboard by ID through this list. */
  dashboards: readonly Dashboard[]
  today: IsoDate
  language: Language
}

/**
 * Narrows the visible risk set by a dashboard's saved filters.
 *
 * `risks` must already be the current user's visible set — dashboards never
 * widen record-level scope.
 */
export function filterRisks(
  risks: readonly Risk[],
  filters: RiskFilters,
  context: Pick<DashboardContext, 'businessUnits' | 'index' | 'matrix'>,
): Risk[] {
  return risks.filter((risk) =>
    matchesFilters(risk, filters, context.businessUnits, context.index, context.matrix),
  )
}

// --- metrics ----------------------------------------------------------------

/**
 * The six metric rules, transcribed from the specification:
 *
 *   Total Risks          = all filtered risks
 *   Open Risks           = status != Completed
 *   Significant Residual = residual rating == Significant
 *   Overdue Actions      = due date passed and not Completed
 *   Emerging Risks       = risk.type == Emerging
 *   Completed Actions    = action.status == Completed
 */
export function computeMetric(
  metric: WidgetMetric,
  risks: readonly Risk[],
  context: Pick<DashboardContext, 'matrix' | 'index' | 'today'>,
): number {
  switch (metric) {
    case 'totalRisks':
      return risks.length

    case 'openRisks':
      return risks.filter((risk) => risk.status !== 'Completed').length

    case 'significantResidual':
      return risks.filter(
        (risk) => riskRating(risk.residual, context.matrix, context.index.ratingLookup) === 'Significant',
      ).length

    case 'overdueActions':
      return risks.reduce(
        (total, risk) =>
          total + risk.actions.filter((action) => isActionOverdue(action, context.today)).length,
        0,
      )

    case 'emergingRisks':
      return risks.filter((risk) => risk.type === 'Emerging').length

    case 'completedActions':
      return risks.reduce(
        (total, risk) => total + risk.actions.filter((action) => action.status === 'Completed').length,
        0,
      )
  }
}

// --- heatmap ----------------------------------------------------------------

export interface HeatmapCell {
  readonly impact: ScaleValue
  readonly likelihood: ScaleValue
  readonly count: number
  readonly rating: string
}

/** 5×5 distribution for one assessment type, with each cell's configured rating. */
export function computeHeatmap(
  risks: readonly Risk[],
  basis: AssessmentType,
  context: Pick<DashboardContext, 'matrix' | 'index'>,
): HeatmapCell[] {
  const counts = new Map<string, number>()
  for (const risk of risks) {
    const score = risk[basis]
    const key = `${String(score.impact)}:${String(score.likelihood)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const cells: HeatmapCell[] = []
  for (const impact of SCALE_VALUES) {
    for (const likelihood of SCALE_VALUES) {
      cells.push({
        impact,
        likelihood,
        count: counts.get(`${String(impact)}:${String(likelihood)}`) ?? 0,
        rating: riskRating({ impact, likelihood }, context.matrix, context.index.ratingLookup),
      })
    }
  }
  return cells
}

// --- distribution -----------------------------------------------------------

export interface DistributionBucket {
  readonly key: string
  readonly label: string
  readonly count: number
}

/**
 * Counts risks by one grouping dimension.
 *
 * Rating buckets always list all four labels, even at zero, so the chart does
 * not silently drop a rating nobody currently holds.
 */
export function computeDistribution(
  risks: readonly Risk[],
  grouping: WidgetGrouping,
  context: DashboardContext,
): DistributionBucket[] {
  const counts = new Map<string, { label: string; count: number }>()
  const bump = (key: string, label: string, by = 1) => {
    const existing = counts.get(key)
    if (existing) existing.count += by
    else counts.set(key, { label, count: by })
  }

  if (grouping === 'rating') {
    for (const rating of RATING_LABELS) counts.set(rating, { label: rating, count: 0 })
  }

  for (const risk of risks) {
    switch (grouping) {
      case 'rating': {
        const rating = riskRating(risk.residual, context.matrix, context.index.ratingLookup)
        bump(rating, rating)
        break
      }
      case 'category': {
        const category = context.categories.find((candidate) => candidate.id === risk.categoryId)
        const label = category ? pickNamed(category, 'level2', context.language) : '—'
        bump(risk.categoryId, label)
        break
      }
      case 'businessUnit': {
        const label = hierarchyPath(context.businessUnits, risk.businessUnitId, context.language)
        bump(risk.businessUnitId, label || '—')
        break
      }
      case 'status':
        bump(risk.status, risk.status)
        break
      case 'response':
        bump(risk.responseType, risk.responseType)
        break
      case 'outlook':
        bump(risk.outlook, risk.outlook)
        break
      case 'trend': {
        const trend = historicalTrend(risk.history)
        bump(trend, trend)
        break
      }
      case 'actionStatus':
        for (const action of risk.actions) bump(action.status, action.status)
        break
    }
  }

  return [...counts.entries()]
    .map(([key, value]) => ({ key, label: value.label, count: value.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

// --- top risks --------------------------------------------------------------

export interface TopRisk {
  readonly risk: Risk
  readonly score: number
  readonly rating: string
}

/** Highest-scoring risks on the chosen assessment, descending. */
export function computeTopRisks(
  risks: readonly Risk[],
  basis: AssessmentType,
  limit: number,
  context: Pick<DashboardContext, 'matrix' | 'index'>,
): TopRisk[] {
  return [...risks]
    .map((risk) => ({
      risk,
      score: riskScore(risk[basis]),
      rating: riskRating(risk[basis], context.matrix, context.index.ratingLookup) as string,
    }))
    // Ties break on reference so the order never jitters between renders.
    .sort((a, b) => b.score - a.score || a.risk.ref.localeCompare(b.risk.ref, undefined, { numeric: true }))
    .slice(0, Math.max(1, Math.min(20, limit)))
}

// --- action plan progress ---------------------------------------------------

export interface ActionProgressSummary {
  readonly total: number
  readonly completed: number
  readonly overdue: number
  readonly averageProgress: number
  readonly byStatus: DistributionBucket[]
}

export function computeActionProgress(
  risks: readonly Risk[],
  context: DashboardContext,
): ActionProgressSummary {
  const actions = risks.flatMap((risk) => risk.actions)
  const summary = summariseActions(actions, context.today)

  return {
    ...summary,
    byStatus: computeDistribution(risks, 'actionStatus', context),
  }
}

// --- trend summary ----------------------------------------------------------

export interface TrendSummary {
  readonly improving: number
  readonly worsening: number
  readonly stable: number
  readonly isNew: number
}

/** Counts risks by computed historical trend — never by the manual outlook. */
export function computeTrendSummary(risks: readonly Risk[]): TrendSummary {
  const summary = { improving: 0, worsening: 0, stable: 0, isNew: 0 }

  for (const risk of risks) {
    switch (historicalTrend(risk.history)) {
      case 'Improving': summary.improving += 1; break
      case 'Worsening': summary.worsening += 1; break
      case 'Stable': summary.stable += 1; break
      case 'New': summary.isNew += 1; break
    }
  }
  return summary
}

// --- recent activity --------------------------------------------------------

/** Most recent audit events, newest first. */
export function computeRecentActivity(
  events: readonly AuditEvent[],
  limit: number,
): AuditEvent[] {
  return [...events].slice(0, Math.max(1, Math.min(20, limit)))
}

// --- dashboard lifecycle ----------------------------------------------------

/**
 * Whether this dashboard may be deleted.
 *
 * The last remaining dashboard is protected — the Dashboard route would
 * otherwise have nothing to show (ARCHITECTURE.md §8.3).
 */
export function canDeleteDashboard(dashboardCount: number): boolean {
  return dashboardCount > 1
}

/**
 * Copies a dashboard under a new ID, with an INDEPENDENT widget collection.
 *
 * Widgets are re-identified too, so editing the copy cannot reach back into
 * the original.
 */
export function duplicateDashboard<T extends { id: string; nameEn: string; widgets: { id: string }[] }>(
  dashboard: T,
  newId: string,
  widgetId: (index: number) => string,
): T {
  const copy = structuredClone(dashboard)
  return {
    ...copy,
    id: newId,
    nameEn: `${copy.nameEn} (copy)`,
    widgets: copy.widgets.map((widget, index) => ({ ...widget, id: widgetId(index) })),
  }
}

/** Moves a widget one place up or down. Out-of-range moves are no-ops. */
export function reorderWidgets<T>(widgets: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= widgets.length || to < 0 || to >= widgets.length) return [...widgets]

  const next = [...widgets]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
