import {
  impactDescription,
  impactLabel,
  likelihoodBand,
  likelihoodDescription,
  likelihoodLabel,
  scaleName,
} from '../../domain/risk-engine/index.ts'
import { SCALE_VALUES } from '../../domain/types/enums.ts'
import type { RatingMatrix } from '../../domain/types/index.ts'
import { useTranslation } from '../../i18n/index.ts'
import { IconWarning } from '../../ui/icons.tsx'

/*
 * Matrix guidance.
 *
 * Every name, description and probability band here is read from the saved
 * configuration (CR-003) — there is not one hard-coded label in this file, so
 * an administrator's edit shows up without a code change. The panel also
 * states which configuration version is in force.
 *
 * The `bar` variant is the condensed info strip used inside the risk editor.
 */

export function MatrixGuidance({
  matrix,
  variant = 'panel',
}: {
  matrix: RatingMatrix
  variant?: 'panel' | 'bar'
}) {
  const { t, language } = useTranslation()

  if (variant === 'bar') {
    return (
      <div className="matrix-guidance matrix-guidance--bar">
        <p className="matrix-guidance__title">
          <IconWarning size={14} />
          {t('view.assessment.guidance')}
        </p>
        <p className="matrix-guidance__note">{t('view.assessment.guidanceNote')}</p>
      </div>
    )
  }

  return (
    <section className="panel matrix-guidance">
      <header className="matrix-guidance__head">
        <h2>{t('view.assessment.guidance')}</h2>
        <p className="panel__meta">
          {scaleName(matrix, language)} · {t('admin.matrix.version')} {matrix.version}
        </p>
      </header>

      <div className="matrix-guidance__scales">
        <dl>
          <dt>{t('editor.field.impact')}</dt>
          {SCALE_VALUES.map((value) => {
            const description = impactDescription(value, matrix, language)
            return (
              <dd key={value}>
                <span className="matrix-guidance__value">{value}</span>
                <span className="matrix-guidance__level">
                  <span className="matrix-guidance__name">{impactLabel(value, matrix, language)}</span>
                  {description ? (
                    <span className="matrix-guidance__description">{description}</span>
                  ) : null}
                </span>
              </dd>
            )
          })}
        </dl>

        <dl>
          <dt>{t('editor.field.likelihood')}</dt>
          {SCALE_VALUES.map((value) => {
            const band = likelihoodBand(value, matrix, language)
            const description = likelihoodDescription(value, matrix, language)
            return (
              <dd key={value}>
                <span className="matrix-guidance__value">{value}</span>
                <span className="matrix-guidance__level">
                  <span className="matrix-guidance__name">
                    {likelihoodLabel(value, matrix, language)}
                    {band ? <span className="matrix-guidance__probability">{band}</span> : null}
                  </span>
                  {description ? (
                    <span className="matrix-guidance__description">{description}</span>
                  ) : null}
                </span>
              </dd>
            )
          })}
        </dl>

        <p className="matrix-guidance__note">
          <IconWarning size={14} />
          <span>{t('view.assessment.guidanceNote')}</span>
        </p>
      </div>
    </section>
  )
}
