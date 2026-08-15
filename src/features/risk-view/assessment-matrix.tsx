import { riskRating, ratingColor, riskScore } from '../../domain/risk-engine/index.ts'
import { SCALE_VALUES } from '../../domain/types/enums.ts'
import type { RatingMatrix, ScaleValue, Score } from '../../domain/types/index.ts'
import {
  impactDescription,
  impactLabel,
  likelihoodBand,
  likelihoodDescription,
  likelihoodLabel,
  ratingName,
} from '../../domain/risk-engine/index.ts'
import { useTranslation } from '../../i18n/index.ts'

/*
 * 5×5 assessment matrix with the selected cell highlighted
 * (ARCHITECTURE.md §8.2).
 *
 * Every cell's rating and colour comes from the risk engine, so an
 * administrator's matrix edit is reflected here without a code change. Cells
 * print their Impact × Likelihood product, and the axes are labelled, so the
 * grid can be read without decoding the colours.
 *
 * Passing `onSelect` turns each cell into a button — that is how the editor
 * lets a user pick a score straight off the matrix.
 */

export interface AssessmentMatrixProps {
  score: Score
  matrix: RatingMatrix
  /** Names the matrix for assistive technology, e.g. "Residual". */
  label: string
  /** Present ⇒ interactive. Receives the clicked cell's impact and likelihood. */
  onSelect?: (score: Score) => void
}

export function AssessmentMatrix({ score, matrix, label, onSelect }: AssessmentMatrixProps) {
  const { t, language } = useTranslation()

  // Impact descends down the rows so 5 sits at the top, as in the printed matrix.
  const impacts = [...SCALE_VALUES].reverse()

  /* Axis tooltips carry the configured name, band and description (CR-003). */
  const impactTitle = (value: ScaleValue) =>
    [impactLabel(value, matrix, language), impactDescription(value, matrix, language)]
      .filter(Boolean)
      .join(' — ')

  const likelihoodTitle = (value: ScaleValue) =>
    [
      likelihoodLabel(value, matrix, language),
      likelihoodBand(value, matrix, language),
      likelihoodDescription(value, matrix, language),
    ]
      .filter(Boolean)
      .join(' — ')

  return (
    <div className="matrix">
      <span className="matrix__axis matrix__axis--impact">{t('editor.field.impact')}</span>

      <table
        className={onSelect ? 'assessment-matrix is-interactive' : 'assessment-matrix'}
        aria-label={`${label} ${t('view.assessment.matrixLabel')}`}
      >
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
              <th key={likelihood} scope="col" title={likelihoodTitle(likelihood)}>
                {likelihood}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {impacts.map((impact: ScaleValue) => (
            <tr key={impact}>
              <th scope="row" title={impactTitle(impact)}>
                {impact}
              </th>
              {SCALE_VALUES.map((likelihood) => {
                const rating = riskRating({ impact, likelihood }, matrix)
                const selected = score.impact === impact && score.likelihood === likelihood
                const value = riskScore({ impact, likelihood })
                const name = ratingName(matrix, rating, language)
                const cellLabel = `${t('editor.field.impact')} ${String(impact)}, ${t('editor.field.likelihood')} ${String(likelihood)}: ${name}${selected ? ` — ${t('view.assessment.selectedCell')}` : ''}`

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
                    aria-label={onSelect ? undefined : cellLabel}
                  >
                    {onSelect ? (
                      <button
                        type="button"
                        className="assessment-matrix__pick"
                        aria-label={cellLabel}
                        aria-pressed={selected}
                        onClick={() => {
                          onSelect({ impact, likelihood })
                        }}
                      >
                        {value}
                      </button>
                    ) : (
                      value
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <span className="matrix__axis matrix__axis--likelihood">{t('editor.field.likelihood')}</span>
    </div>
  )
}
