import {
  ACTION_STATUSES,
  OUTLOOKS,
  RATING_LABELS,
  RESPONSE_TYPES,
  RISK_STATUSES,
  SCALE_VALUES,
  TRENDS,
} from '../types/enums.ts'

/*
 * Data series catalog (CR-2026-014 Rev 2 §5, FR-01).
 *
 * Configuration, not code: adding a register field to a chart means adding an
 * entry here, never touching a chart component. The builder UI and the
 * aggregation layer both read this one definition.
 *
 * Every entry is bound to a field that actually exists on the risk entity. The
 * change request's §5.1 uses indicative keys; where one had no matching field
 * it is recorded as a GAP below rather than fabricated (§0.2, §15).
 *
 * Pure: no React, no I/O.
 */

export type DimensionType = 'categorical' | 'ordinal'
export type Cardinality = 'low' | 'mid' | 'high'
export type MeasureUnit = 'count' | 'score'
export type Aggregation = 'count' | 'avg' | 'sum' | 'max'

export interface CatalogDimension {
  key: string
  /** Translation key; the label itself is resolved in the UI layer. */
  labelKey: string
  type: DimensionType
  cardinality: Cardinality
  group: 'classification' | 'lifecycle' | 'assessment'
  /**
   * Explicit ordering for an ordinal field. Never sorted alphabetically —
   * a line chart implies progression between adjacent points.
   */
  order?: readonly string[]
  /**
   * Values map to the configured rating colours, so a widget's "High" matches
   * a badge's "High" everywhere in the product.
   */
  semantic?: 'band'
}

export interface CatalogMeasure {
  key: string
  labelKey: string
  aggs: readonly Aggregation[]
  unit: MeasureUnit
}

/**
 * GAPS between §5.1 and the risk entity, reported rather than invented.
 *
 * `stage` — the change request describes a four-step lifecycle
 * (Identified → Evaluation → Treatment → Monitoring). No such field exists.
 * The nearest is `risk.status`, whose vocabulary is Draft, In Progress,
 * Monitoring, Rescheduled, Overdue, Completed, Accepted — only "Monitoring"
 * overlaps. It is published below as `status` with its real values and its
 * real order. Introducing the four-stage lifecycle would be a field change,
 * which the design brief places out of scope.
 *
 * `likelihood` / `impact` — the register stores these per ASSESSMENT
 * (inherent, residual, target), not once per risk. They are published against
 * the residual assessment, which is what the register and every existing
 * widget already treat as the working figure.
 */
export const CATALOG_GAPS = [
  'stage: no lifecycle field on the risk entity; bound to status instead',
  'likelihood/impact: stored per assessment, bound to residual',
] as const

export const DIMENSIONS: readonly CatalogDimension[] = [
  { key: 'category', labelKey: 'grouping.category', type: 'categorical', cardinality: 'mid', group: 'classification' },
  { key: 'businessUnit', labelKey: 'grouping.businessUnit', type: 'categorical', cardinality: 'mid', group: 'classification' },
  // High cardinality: excluded from breakdown and from pie by the rules module.
  { key: 'owner', labelKey: 'grouping.owner', type: 'categorical', cardinality: 'high', group: 'classification' },

  { key: 'status', labelKey: 'grouping.status', type: 'ordinal', cardinality: 'low', group: 'lifecycle', order: RISK_STATUSES },
  { key: 'response', labelKey: 'grouping.response', type: 'categorical', cardinality: 'low', group: 'lifecycle' },
  { key: 'actionStatus', labelKey: 'grouping.actionStatus', type: 'categorical', cardinality: 'low', group: 'lifecycle', order: ACTION_STATUSES },

  { key: 'inherentBand', labelKey: 'grouping.inherentBand', type: 'ordinal', cardinality: 'low', group: 'assessment', order: RATING_LABELS, semantic: 'band' },
  { key: 'rating', labelKey: 'grouping.rating', type: 'ordinal', cardinality: 'low', group: 'assessment', order: RATING_LABELS, semantic: 'band' },
  { key: 'trend', labelKey: 'grouping.trend', type: 'categorical', cardinality: 'low', group: 'assessment', order: TRENDS },
  { key: 'outlook', labelKey: 'grouping.outlook', type: 'categorical', cardinality: 'low', group: 'assessment', order: OUTLOOKS },

  { key: 'likelihood', labelKey: 'grouping.likelihood', type: 'ordinal', cardinality: 'low', group: 'assessment', order: SCALE_VALUES.map(String) },
  { key: 'impact', labelKey: 'grouping.impact', type: 'ordinal', cardinality: 'low', group: 'assessment', order: SCALE_VALUES.map(String) },
]

export const MEASURES: readonly CatalogMeasure[] = [
  { key: 'count', labelKey: 'measure.count', aggs: ['count'], unit: 'count' },
  { key: 'inherentScore', labelKey: 'measure.inherentScore', aggs: ['avg', 'sum', 'max'], unit: 'score' },
  { key: 'residualScore', labelKey: 'measure.residualScore', aggs: ['avg', 'sum', 'max'], unit: 'score' },
  { key: 'reduction', labelKey: 'measure.reduction', aggs: ['avg', 'sum'], unit: 'score' },
  { key: 'overdueActions', labelKey: 'measure.overdueActions', aggs: ['sum'], unit: 'count' },
]

export function findDimension(key: string): CatalogDimension | undefined {
  return DIMENSIONS.find((dimension) => dimension.key === key)
}

export function findMeasure(key: string): CatalogMeasure | undefined {
  return MEASURES.find((measure) => measure.key === key)
}

/** Response types and outlooks have no natural order; declared for completeness. */
export const RESPONSE_ORDER = RESPONSE_TYPES
