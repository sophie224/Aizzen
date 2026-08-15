import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  impactLabel,
  likelihoodLabel,
  ratingColor,
  restoreDefaultMatrix,
  riskRating,
  setMatrixCell,
} from '../../domain/risk-engine/index.ts'
import { RATING_LABELS, SCALE_VALUES } from '../../domain/types/enums.ts'
import type { RatingLabel, ScaleValue } from '../../domain/types/index.ts'
import { useTranslation } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'

/*
 * Rating Matrix configuration (ARCHITECTURE.md §8.5).
 *
 * All 25 cells are editable, plus the four rating colours. Score is always
 * Impact × Likelihood and is never configurable — only the RATING attached to
 * each intersection is.
 */
export function MatrixSection() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user: actor } = useCurrentUser()

  if (!state || !actor) return null
  const matrix = state.matrix

  const changeCell = async (impact: ScaleValue, likelihood: ScaleValue, rating: RatingLabel) => {
    await store.update({
      mutate: (next) => {
        next.matrix = setMatrixCell(next.matrix, impact, likelihood, rating)
      },
      audit: {
        actorId: actor.id,
        action: 'matrix.updated',
        entityType: 'Matrix',
        entityId: 'rating-matrix',
        summary: `Impact ${String(impact)} × likelihood ${String(likelihood)} set to ${rating}`,
      },
    })
  }

  const changeColor = async (rating: RatingLabel, color: string) => {
    await store.update({
      mutate: (next) => {
        next.matrix = { ...next.matrix, colors: { ...next.matrix.colors, [rating]: color } }
      },
      audit: {
        actorId: actor.id,
        action: 'matrix.updated',
        entityType: 'Matrix',
        entityId: 'rating-matrix',
        summary: `${rating} colour set to ${color}`,
      },
    })
  }

  const restore = async () => {
    await store.update({
      mutate: (next) => {
        next.matrix = restoreDefaultMatrix(next.matrix)
      },
      audit: {
        actorId: actor.id,
        action: 'matrix.restored',
        entityType: 'Matrix',
        entityId: 'rating-matrix',
        summary: 'Risk Rating Matrix 2026 defaults applied.',
      },
    })
  }

  // Impact descends so 5 sits at the top, matching the printed matrix.
  const impacts = [...SCALE_VALUES].reverse()

  return (
    <section aria-labelledby="matrix-title">
      <div className="admin-section__header">
        <h2 id="matrix-title">{t('admin.section.matrix')}</h2>
        <button type="button" onClick={() => void restore()}>{t('admin.matrix.restore')}</button>
      </div>

      <p className="panel__meta">{t('admin.matrix.intro')}</p>

      <div className="scroll-x">
        <table className="matrix-editor">
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">
                  {t('editor.field.impact')} / {t('editor.field.likelihood')}
                </span>
              </th>
              {SCALE_VALUES.map((likelihood) => (
                <th key={likelihood} scope="col">
                  {likelihood}
                  <span className="matrix-editor__scale">
                    {likelihoodLabel(likelihood, matrix, language)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {impacts.map((impact) => (
              <tr key={impact}>
                <th scope="row">
                  {impact}
                  <span className="matrix-editor__scale">{impactLabel(impact, matrix, language)}</span>
                </th>
                {SCALE_VALUES.map((likelihood) => {
                  const rating = riskRating({ impact, likelihood }, matrix)
                  const label = t('admin.matrix.cellLabel')
                    .replace('{impact}', String(impact))
                    .replace('{likelihood}', String(likelihood))

                  return (
                    <td key={likelihood} style={{ background: ratingColor(rating, matrix) }}>
                      <select
                        aria-label={label}
                        value={rating}
                        onChange={(event) => {
                          void changeCell(impact, likelihood, event.target.value as RatingLabel)
                        }}
                      >
                        {RATING_LABELS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      {/* Score is fixed arithmetic, shown for orientation only. */}
                      <span className="matrix-editor__score">{impact * likelihood}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <fieldset className="admin-colors">
        <legend>{t('admin.matrix.colors')}</legend>
        {RATING_LABELS.map((rating) => (
          <label key={rating}>
            <span>{rating}</span>
            <input
              type="color"
              value={matrix.colors[rating]}
              onChange={(event) => { void changeColor(rating, event.target.value) }}
            />
            <output>{matrix.colors[rating]}</output>
          </label>
        ))}
      </fieldset>
    </section>
  )
}
