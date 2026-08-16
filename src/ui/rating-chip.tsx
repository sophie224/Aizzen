import { LARGE_TEXT_TARGET, readableOn } from '../domain/risk-engine/contrast.ts'
import { assess, ratingName } from '../domain/risk-engine/index.ts'
import type { RatingLabel, RatingMatrix, Score } from '../domain/types/index.ts'
import { useTranslation } from '../i18n/index.ts'
import './rating-chip.css'

/*
 * Rating chip.
 *
 * Every value shown here comes from the risk engine — score, rating and
 * colour alike. The component holds NO rating logic of its own; duplicating it
 * is prohibited (ARCHITECTURE.md §7).
 *
 * Variants share one accessible name so the chip reads identically wherever it
 * appears:
 *
 * There are no variants. A score badge always carries all three parts at one
 * size — the same in Compact and Detailed, on the detail hero, the Assessment
 * cards and the editor — so a rating never changes shape as the user moves
 * between views.
 */

export interface RatingChipProps {
  score: Score
  matrix: RatingMatrix
  /** Accessible prefix, e.g. "Residual". */
  label: string
}

export function RatingChip({ score, matrix, label }: RatingChipProps) {
  const { language } = useTranslation()
  const view = assess(score, matrix)
  // The displayed word is the CONFIGURED name; `view.rating` stays the key.
  const name = ratingName(matrix, view.rating, language)

  return (
    <span
      className="rating-chip"
      /*
       * Every part of the badge is bold and set above body size, so the label
       * colour is computed against the large-text threshold.
       */
      style={{ background: view.color, color: readableOn(view.color, LARGE_TEXT_TARGET) }}
      /*
       * Colour never carries the meaning alone — the rating word is always
       * rendered, and the accessible name spells the whole thing out
       * (ARCHITECTURE.md §9).
       */
      aria-label={`${label}: ${name}, score ${String(view.score)}, impact ${String(view.impact)} by likelihood ${String(view.likelihood)}`}
    >
      <span className="rating-chip__score">{view.score}</span>
      <span className="rating-chip__rating">{name}</span>
      <span className="rating-chip__breakdown">
        {view.impact}×{view.likelihood}
      </span>
    </span>
  )
}

/** Rating swatch used by the filter control, so the legend matches the table. */
export function RatingSwatch({ rating, matrix }: { rating: RatingLabel; matrix: RatingMatrix }) {
  const color = matrix.colors[rating]
  return <span className="rating-swatch" style={{ background: color }} aria-hidden="true" />
}
