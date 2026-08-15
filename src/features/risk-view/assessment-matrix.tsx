import { riskRating, ratingColor } from '../../domain/risk-engine/index.ts'
import { SCALE_VALUES } from '../../domain/types/enums.ts'
import type { RatingMatrix, ScaleValue, Score } from '../../domain/types/index.ts'
import { impactLabel, likelihoodLabel } from '../../domain/risk-engine/index.ts'
import { useTranslation } from '../../i18n/index.ts'

/*
 * Read-only 5×5 assessment matrix with the selected cell highlighted
 * (ARCHITECTURE.md §8.2).
 *
 * Every cell's rating and colour comes from the risk engine, so an
 * administrator's matrix edit is reflected here without a code change.
 */

export interface AssessmentMatrixProps {
  score: Score
  matrix: RatingMatrix
  /** Names the matrix for assistive technology, e.g. "Residual". */
  label: string
}

export function AssessmentMatrix({ score, matrix, label }: AssessmentMatrixProps) {
  const { t, language } = useTranslation()

  // Impact descends down the rows so 5 sits at the top, as in the printed matrix.
  const impacts = [...SCALE_VALUES].reverse()

  return (
    <table className="assessment-matrix" aria-label={`${label} ${t('view.assessment.matrixLabel')}`}>
      <caption className="visually-hidden">
        {label}: {t('view.assessment.selectedCell')} {score.impact} × {score.likelihood}
      </caption>
      <thead>
        <tr>
          <th scope="col">
            <span className="visually-hidden">
              {t('editor.field.impact')} / {t('editor.field.likelihood')}
            </span>
          </th>
          {SCALE_VALUES.map((likelihood) => (
            <th key={likelihood} scope="col" title={likelihoodLabel(likelihood, matrix, language)}>
              {likelihood}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {impacts.map((impact: ScaleValue) => (
          <tr key={impact}>
            <th scope="row" title={impactLabel(impact, matrix, language)}>
              {impact}
            </th>
            {SCALE_VALUES.map((likelihood) => {
              const rating = riskRating({ impact, likelihood }, matrix)
              const selected = score.impact === impact && score.likelihood === likelihood

              return (
                <td
                  key={likelihood}
                  className={selected ? 'assessment-matrix__cell is-selected' : 'assessment-matrix__cell'}
                  style={{ background: ratingColor(rating, matrix) }}
                  /*
                   * The selected cell is marked with aria-current and a visible
                   * ring, not colour alone (ARCHITECTURE.md §9).
                   */
                  aria-current={selected ? 'true' : undefined}
                  aria-label={`${t('editor.field.impact')} ${String(impact)}, ${t('editor.field.likelihood')} ${String(likelihood)}: ${rating}${selected ? ` — ${t('view.assessment.selectedCell')}` : ''}`}
                >
                  {selected ? <span aria-hidden="true">●</span> : null}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
