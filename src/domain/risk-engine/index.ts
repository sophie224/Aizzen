import { SCALE_VALUES } from '../types/enums.ts'
import type { RatingLabel, ScaleValue } from '../types/enums.ts'
import type { RatingMatrix, Score } from '../types/index.ts'
import { pickLabel } from '../localisation/index.ts'
import { DEFAULT_RATING_COLORS, defaultRatingFor } from './default-matrix.ts'

/*
 * The one risk engine (ARCHITECTURE.md §7).
 *
 * Register chips, detail cards, heatmaps, dashboard metrics, filters, reports
 * and exports all call these functions. Duplicating rating logic in a UI
 * component is prohibited by the specification.
 *
 *   score  = impact × likelihood
 *   rating = matrix[impact][likelihood]   ← EXACT CELL, never a score band
 *   colour = ratingColors[rating]
 */

/** Numeric risk score. The only arithmetic the rating never depends on. */
export function riskScore(score: Score): number {
  return score.impact * score.likelihood
}

function cellKey(impact: ScaleValue, likelihood: ScaleValue): string {
  return `${String(impact)}:${String(likelihood)}`
}

/**
 * O(1) rating lookup built once per matrix.
 *
 * Prefer this when resolving many risks — building it per row would make the
 * Register O(n × 25).
 */
export function buildRatingLookup(matrix: RatingMatrix): ReadonlyMap<string, RatingLabel> {
  const lookup = new Map<string, RatingLabel>()
  for (const cell of matrix.cells) {
    lookup.set(cellKey(cell.impact, cell.likelihood), cell.rating)
  }
  return lookup
}

/**
 * Resolves the rating for an assessment by exact cell.
 *
 * Two cells sharing a numeric score may carry different ratings — that is the
 * intended behaviour, not an inconsistency. Falls back to the 2026 default
 * when the configured matrix is missing that cell; migration normally repairs
 * such gaps first (ARCHITECTURE.md §10).
 */
export function riskRating(
  score: Score,
  matrix: RatingMatrix,
  lookup?: ReadonlyMap<string, RatingLabel>,
): RatingLabel {
  const table = lookup ?? buildRatingLookup(matrix)
  return table.get(cellKey(score.impact, score.likelihood)) ?? defaultRatingFor(score.impact, score.likelihood)
}

/** Configured colour for a rating, falling back to the 2026 palette. */
export function ratingColor(rating: RatingLabel, matrix: RatingMatrix): string {
  const configured = matrix.colors[rating]
  return typeof configured === 'string' && configured.trim().length > 0
    ? configured
    : DEFAULT_RATING_COLORS[rating]
}

export interface AssessmentView {
  readonly impact: ScaleValue
  readonly likelihood: ScaleValue
  readonly score: number
  readonly rating: RatingLabel
  readonly color: string
}

/**
 * Everything the UI needs to render one assessment chip.
 *
 * The derived values are computed here and never persisted, so a matrix change
 * propagates everywhere at once (ARCHITECTURE.md §2.3).
 */
export function assess(
  score: Score,
  matrix: RatingMatrix,
  lookup?: ReadonlyMap<string, RatingLabel>,
): AssessmentView {
  const rating = riskRating(score, matrix, lookup)
  return {
    impact: score.impact,
    likelihood: score.likelihood,
    score: riskScore(score),
    rating,
    color: ratingColor(rating, matrix),
  }
}

/** Bilingual impact label, falling back to English when Georgian is absent. */
export function impactLabel(value: ScaleValue, matrix: RatingMatrix, language: 'en' | 'ka'): string {
  const label = matrix.impactLabels[value]
  return label ? pickLabel(label, language) : String(value)
}

/** Bilingual likelihood label, falling back to English when Georgian is absent. */
export function likelihoodLabel(
  value: ScaleValue,
  matrix: RatingMatrix,
  language: 'en' | 'ka',
): string {
  const label = matrix.likelihoodLabels[value]
  return label ? pickLabel(label, language) : String(value)
}

/**
 * Rebuilds the 2026 default matrix (ARCHITECTURE.md §7).
 *
 * All 25 cells and the four rating colours are reset exactly. Impact and
 * likelihood labels are PRESERVED from the current configuration: they are not
 * part of what "Restore defaults" resets, and the Phase 1 UI does not expose
 * them for editing anyway.
 */
export function restoreDefaultMatrix(current: RatingMatrix): RatingMatrix {
  const cells = []
  for (const impact of SCALE_VALUES) {
    for (const likelihood of SCALE_VALUES) {
      cells.push({ impact, likelihood, rating: defaultRatingFor(impact, likelihood) })
    }
  }

  return {
    cells,
    colors: { ...DEFAULT_RATING_COLORS },
    impactLabels: current.impactLabels,
    likelihoodLabels: current.likelihoodLabels,
  }
}

/** Replaces one cell's rating, leaving the other 24 untouched. */
export function setMatrixCell(
  matrix: RatingMatrix,
  impact: ScaleValue,
  likelihood: ScaleValue,
  rating: RatingLabel,
): RatingMatrix {
  return {
    ...matrix,
    cells: matrix.cells.map((cell) =>
      cell.impact === impact && cell.likelihood === likelihood ? { ...cell, rating } : cell,
    ),
  }
}

export * from './default-matrix.ts'
