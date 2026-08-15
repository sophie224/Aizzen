import { assess, ratingName } from '../../domain/risk-engine/index.ts'
import type { RatingLabel, RatingMatrix, Score } from '../../domain/types/index.ts'
import { useTranslation } from '../../i18n/index.ts'

/*
 * Rating chip.
 *
 * Every value shown here comes from the risk engine — score, rating and
 * colour alike. The component holds NO rating logic of its own; duplicating it
 * is prohibited (ARCHITECTURE.md §7).
 *
 * Variants share one accessible name so the chip reads identically wherever it
 * appears:
 *   compact  — Register rows: score, rating and Impact × Likelihood, condensed
 *   detailed — the same information at reading size
 *   pill     — rating word only, for the KPI strip where the score is printed
 *              beside the chip at display size
 */

export interface RatingChipProps {
  score: Score
  matrix: RatingMatrix
  variant?: 'compact' | 'detailed' | 'pill'
  /** Accessible prefix, e.g. "Residual". */
  label: string
}

/**
 * Picks readable text for an arbitrary administrator-chosen background.
 * Uses the WCAG relative-luminance threshold rather than a fixed pairing,
 * because the palette is configurable.
 */
function readableTextColor(background: string): string {
  const hex = background.replace('#', '')
  if (hex.length !== 6) return '#1c2033'

  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }

  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  return luminance > 0.45 ? '#1c2033' : '#ffffff'
}

export function RatingChip({ score, matrix, variant = 'compact', label }: RatingChipProps) {
  const { language } = useTranslation()
  const view = assess(score, matrix)
  // The displayed word is the CONFIGURED name; `view.rating` stays the key.
  const name = ratingName(matrix, view.rating, language)

  return (
    <span
      className={`rating-chip rating-chip--${variant}`}
      style={{ background: view.color, color: readableTextColor(view.color) }}
      /*
       * Colour never carries the meaning alone — the rating word is always
       * rendered, and the accessible name spells the whole thing out
       * (ARCHITECTURE.md §9).
       */
      aria-label={`${label}: ${name}, score ${String(view.score)}, impact ${String(view.impact)} by likelihood ${String(view.likelihood)}`}
    >
      {variant === 'pill' ? null : <span className="rating-chip__score">{view.score}</span>}
      <span className="rating-chip__rating">{name}</span>
      {variant === 'pill' ? null : (
        <span className="rating-chip__breakdown">
          {view.impact} × {view.likelihood}
        </span>
      )}
    </span>
  )
}

/** Rating swatch used by the filter control, so the legend matches the table. */
export function RatingSwatch({ rating, matrix }: { rating: RatingLabel; matrix: RatingMatrix }) {
  const color = matrix.colors[rating]
  return <span className="rating-swatch" style={{ background: color }} aria-hidden="true" />
}
