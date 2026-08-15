import { RATING_LABELS, SCALE_VALUES } from '../types/enums.ts'
import type { RatingLabel, ScaleValue } from '../types/enums.ts'
import type { RatingLevel, RatingMatrix, Score } from '../types/index.ts'
import { pickLabel, pickLanguage } from '../localisation/index.ts'
import {
  DEFAULT_RATING_COLORS,
  DEFAULT_SCALE_NAME_EN,
  DEFAULT_SCALE_NAME_KA,
  defaultImpactLabels,
  defaultLikelihoodLabels,
  defaultRatingFor,
  defaultRatingLevels,
} from './default-matrix.ts'

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

/*
 * --- configured labels (CR-003) ----------------------------------------------
 *
 * Every name, description and probability band the UI renders is read through
 * one of these functions. No component keeps its own copy of a label, so an
 * administrator's rename shows up everywhere at once. All of them fall back to
 * English when the Georgian value is blank (ARCHITECTURE.md §9).
 */

/** The configured word for the scale itself, default "Rating". */
export function scaleName(matrix: RatingMatrix, language: 'en' | 'ka'): string {
  return pickLanguage(matrix.scaleNameEn, matrix.scaleNameKa, language) || DEFAULT_SCALE_NAME_EN
}

/** The configured display name for a rating level, keyed by its stable key. */
export function ratingName(
  matrix: RatingMatrix,
  key: RatingLabel,
  language: 'en' | 'ka',
): string {
  const level = matrix.levels?.find((candidate) => candidate.key === key)
  if (!level) return key
  return pickLanguage(level.nameEn, level.nameKa, language) || key
}

/** Levels in configured order, for dropdowns, legends and filters. */
export function ratingLevels(matrix: RatingMatrix): RatingLevel[] {
  const configured = matrix.levels ?? []
  const known = RATING_LABELS.map(
    (key, index) =>
      configured.find((level) => level.key === key) ?? {
        key,
        nameEn: key,
        nameKa: '',
        order: index + 1,
      },
  )
  return [...known].sort((a, b) => a.order - b.order)
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

export function impactDescription(
  value: ScaleValue,
  matrix: RatingMatrix,
  language: 'en' | 'ka',
): string {
  const label = matrix.impactLabels[value]
  if (!label) return ''
  return pickLanguage(label.descriptionEn ?? '', label.descriptionKa ?? '', language)
}

export function likelihoodDescription(
  value: ScaleValue,
  matrix: RatingMatrix,
  language: 'en' | 'ka',
): string {
  const label = matrix.likelihoodLabels[value]
  if (!label) return ''
  return pickLanguage(label.descriptionEn ?? '', label.descriptionKa ?? '', language)
}

/**
 * The probability band as displayed.
 *
 * The percentage band is optional: an organisation may express likelihood as
 * text alone ("Once in 10 years"). When both are configured the percentage
 * comes first and the text follows it (CR-003).
 */
export function likelihoodBand(
  value: ScaleValue,
  matrix: RatingMatrix,
  language: 'en' | 'ka',
): string {
  const label = matrix.likelihoodLabels[value]
  if (!label) return ''

  const text = pickLanguage(label.textEn ?? '', label.textKa ?? '', language).trim()
  const hasPercent = typeof label.percentFrom === 'number' && typeof label.percentTo === 'number'
  const percent = hasPercent ? `${String(label.percentFrom)}%-${String(label.percentTo)}%` : ''

  if (percent && text) return `${percent} · ${text}`
  return percent || text
}

/** `2 — Unlikely (6%-35%)`, used by every likelihood dropdown. */
export function likelihoodOptionLabel(
  value: ScaleValue,
  matrix: RatingMatrix,
  language: 'en' | 'ka',
): string {
  const band = likelihoodBand(value, matrix, language)
  const name = likelihoodLabel(value, matrix, language)
  return band ? `${String(value)} — ${name} (${band})` : `${String(value)} — ${name}`
}

/** `5 — Critical`, used by every impact dropdown. */
export function impactOptionLabel(
  value: ScaleValue,
  matrix: RatingMatrix,
  language: 'en' | 'ka',
): string {
  return `${String(value)} — ${impactLabel(value, matrix, language)}`
}

/**
 * Rebuilds the whole 2026 default configuration (ARCHITECTURE.md §7, CR-003).
 *
 * Everything resets: cells, colours, the scale name, the level names, the
 * impact and likelihood names, descriptions and probability bands. The version
 * is NOT reset — it keeps counting up, because restoring defaults is itself a
 * new configuration that later snapshots must be able to point at.
 */
export function restoreDefaultMatrix(current: RatingMatrix): RatingMatrix {
  const cells = []
  for (const impact of SCALE_VALUES) {
    for (const likelihood of SCALE_VALUES) {
      cells.push({ impact, likelihood, rating: defaultRatingFor(impact, likelihood) })
    }
  }

  return {
    version: current.version,
    scaleNameEn: DEFAULT_SCALE_NAME_EN,
    scaleNameKa: DEFAULT_SCALE_NAME_KA,
    cells,
    levels: defaultRatingLevels(),
    colors: { ...DEFAULT_RATING_COLORS },
    impactLabels: defaultImpactLabels(),
    likelihoodLabels: defaultLikelihoodLabels(),
  }
}

/*
 * Cell editing lives in `src/domain/matrix` with the rest of the
 * configuration transforms — this module reads the matrix, it does not edit it.
 */

export * from './default-matrix.ts'
