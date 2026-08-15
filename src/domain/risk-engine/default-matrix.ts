import type { RatingLabel, ScaleValue } from '../types/enums.ts'

/*
 * Risk Rating Matrix 2026 defaults (ARCHITECTURE.md §7).
 *
 * This lives in the domain, not in the seed, because it is a standard the
 * engine reasons about — it supplies the fallback rating when a configured
 * cell is missing, and "Restore defaults" must reproduce it exactly. The data
 * layer imports it to build seed state; the dependency points inward.
 */

/** Ratings indexed by impact, then likelihood 1→5. */
export const DEFAULT_RATING_TABLE: Record<ScaleValue, readonly RatingLabel[]> = {
  5: ['Medium', 'High', 'High', 'Significant', 'Significant'],
  4: ['Low', 'Medium', 'High', 'High', 'Significant'],
  3: ['Low', 'Medium', 'Medium', 'High', 'High'],
  2: ['Low', 'Low', 'Medium', 'Medium', 'High'],
  1: ['Low', 'Low', 'Low', 'Low', 'Medium'],
}

export const DEFAULT_RATING_COLORS: Record<RatingLabel, string> = {
  Low: '#00B050',
  Medium: '#FFF200',
  High: '#FFB900',
  Significant: '#F32121',
}

/** The 2026 rating for one intersection, used when configuration is incomplete. */
export function defaultRatingFor(impact: ScaleValue, likelihood: ScaleValue): RatingLabel {
  return DEFAULT_RATING_TABLE[impact][likelihood - 1]
}
