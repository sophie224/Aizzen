import { useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  diffMatrixConfiguration,
  setImpactLevel,
  setLikelihoodLevel,
  setMatrixCell,
  setRatingColor,
  setRatingLevelName,
  setScaleName,
  validateMatrixConfiguration,
  type MatrixConfigIssue,
} from '../../domain/matrix/index.ts'
import {
  impactLabel,
  likelihoodLabel,
  ratingColor,
  ratingLevels,
  ratingName,
  restoreDefaultMatrix,
  riskRating,
  scaleName,
} from '../../domain/risk-engine/index.ts'
import { SCALE_VALUES } from '../../domain/types/enums.ts'
import type { RatingLabel, RatingMatrix, ScaleValue } from '../../domain/types/index.ts'
import { useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { BilingualField } from '../../ui/bilingual-field.tsx'
import { useCurrentUser } from '../../app/session/use-current-user.ts'

/*
 * Rating Matrix configuration (ARCHITECTURE.md §8.5, CR-003).
 *
 * The WHOLE matrix is configurable: the name of the scale, the four level
 * names, the impact and likelihood criteria with their descriptions and
 * probability bands, the colours and all 25 cells.
 *
 * Editing happens on a local DRAFT. Nothing reaches AppState until Save
 * configuration succeeds, so a half-finished rename never propagates to the
 * Register, the assessments or the exports. Score is always Impact ×
 * Likelihood and no edit here can change it.
 */

/** Reads a percentage input back as a number, or null when it is cleared. */
function parsePercent(raw: string): number | null {
  if (raw.trim().length === 0) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function MatrixSection() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user: actor } = useCurrentUser()

  // null = no unsaved edits; the live configuration is shown as-is.
  const [draft, setDraft] = useState<RatingMatrix | null>(null)
  const [confirmingRestore, setConfirmingRestore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  if (!state || !actor) return null

  const matrix = draft ?? state.matrix
  const dirty = draft !== null
  const { errors, warnings } = validateMatrixConfiguration(matrix)
  const blocked = errors.length > 0

  const edit = (next: RatingMatrix) => {
    setDraft(next)
    setSaved(false)
  }

  const errorFor = (field: string): MatrixConfigIssue | undefined =>
    errors.find((issue) => issue.field === field)

  const save = async () => {
    if (!dirty || blocked) return
    setSaving(true)

    const previous = state.matrix
    const changes = diffMatrixConfiguration(previous, matrix)
    const version = previous.version + 1
    // Read the clock at the edge; the mutator itself stays deterministic.
    const savedAt = new Date().toISOString()

    try {
      await store.update({
        mutate: (next) => {
          /*
           * The superseded configuration is archived before the new one lands,
           * so an assessment recorded against version N stays readable after
           * version N+1 is saved (CR-003).
           */
          next.matrixVersions = [
            { version: previous.version, savedAt, matrix: previous },
            ...next.matrixVersions,
          ]
          next.matrix = { ...matrix, version }
        },
        audit: {
          actorId: actor.id,
          action: 'matrix.saved',
          entityType: 'Matrix',
          entityId: 'rating-matrix',
          summary: `Configuration v${String(version)} saved`,
          changes,
        },
      })
      setDraft(null)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const restore = () => {
    edit(restoreDefaultMatrix(matrix))
    setConfirmingRestore(false)
  }

  // Impact descends so 5 sits at the top, matching the printed matrix.
  const impacts = [...SCALE_VALUES].reverse()
  const levels = ratingLevels(matrix)
  const scale = scaleName(matrix, language)

  return (
    <section aria-labelledby="matrix-title">
      <div className="admin-section__header">
        <h2 id="matrix-title">
          {scale} {t('admin.matrix.suffix')}
        </h2>
        <div className="admin-section__actions">
          <span className="admin-matrix__version">
            {t('admin.matrix.version')} {matrix.version}
          </span>
          <button
            type="button"
            onClick={() => {
              setConfirmingRestore(true)
            }}
          >
            {t('admin.matrix.restore')}
          </button>
          <button
            type="button"
            className="admin-matrix__save"
            disabled={!dirty || blocked || saving}
            onClick={() => void save()}
          >
            {t('admin.matrix.save')}
          </button>
        </div>
      </div>

      <p className="panel__meta">{t('admin.matrix.intro')}</p>

      {/* Dirty-state indicator: nothing is applied until Save configuration. */}
      {dirty ? (
        <p className="admin-matrix__dirty" role="status">
          {t('admin.matrix.unsaved')}
        </p>
      ) : null}
      {saved ? (
        <p className="admin-matrix__saved" role="status">
          {t('admin.matrix.savedNotice')}
        </p>
      ) : null}

      {errors.length > 0 ? (
        <div className="editor-errors" role="alert">
          <p>{t('admin.matrix.blocked')}</p>
          <ul>
            {errors.map((issue) => (
              <li key={`${issue.field}:${issue.messageKey}`}>
                <code>{issue.field}</code> <span>{t(issue.messageKey as TranslationKey)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.map((issue) => (
        <p key={issue.field} className="admin-matrix__warning" role="status">
          {t(issue.messageKey as TranslationKey)}
        </p>
      ))}

      {confirmingRestore ? (
        <p className="admin-matrix__confirm" role="alert">
          <span>{t('admin.matrix.restoreConfirm')}</span>
          <button type="button" onClick={restore}>
            {t('admin.matrix.restore')}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmingRestore(false)
            }}
          >
            {t('action.cancel')}
          </button>
        </p>
      ) : null}

      {/* --- scale name -------------------------------------------------- */}

      <fieldset className="admin-matrix__scale">
        <legend>{t('admin.matrix.scaleName')}</legend>
        <BilingualField
          labelEn={t('admin.matrix.scaleNameEn')}
          labelKa={t('admin.matrix.scaleNameKa')}
          valueEn={matrix.scaleNameEn}
          valueKa={matrix.scaleNameKa}
          invalid={errorFor('scaleName') !== undefined}
          onChangeEn={(value) => {
            edit(setScaleName(matrix, 'en', value))
          }}
          onChangeKa={(value) => {
            edit(setScaleName(matrix, 'ka', value))
          }}
        />
      </fieldset>

      {/* --- cells --------------------------------------------------------- */}

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
                          edit(setMatrixCell(matrix, impact, likelihood, event.target.value as RatingLabel))
                        }}
                      >
                        {levels.map((level) => (
                          <option key={level.key} value={level.key}>
                            {ratingName(matrix, level.key, language)}
                          </option>
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

      {/* --- rating levels ------------------------------------------------- */}

      <fieldset className="admin-levels">
        <legend>
          {scale} {t('admin.matrix.levelsSuffix')}
        </legend>
        {levels.map((level) => (
          <div key={level.key} className="admin-levels__row">
            <BilingualField
              labelEn={t('admin.matrix.levelNameEn')}
              labelKa={t('admin.matrix.levelNameKa')}
              valueEn={level.nameEn}
              valueKa={level.nameKa}
              invalid={errorFor(`level.${level.key}.name`) !== undefined}
              onChangeEn={(value) => {
                edit(setRatingLevelName(matrix, level.key, 'en', value))
              }}
              onChangeKa={(value) => {
                edit(setRatingLevelName(matrix, level.key, 'ka', value))
              }}
            />
            <label>
              <span>{t('admin.matrix.levelColor')}</span>
              <input
                type="color"
                value={matrix.colors[level.key]}
                onChange={(event) => {
                  edit(setRatingColor(matrix, level.key, event.target.value))
                }}
              />
            </label>
            <output>{matrix.colors[level.key]}</output>
          </div>
        ))}
      </fieldset>

      {/* --- impact criteria ------------------------------------------------ */}

      <fieldset className="admin-criteria">
        <legend>{t('admin.matrix.impactCriteria')}</legend>
        {SCALE_VALUES.map((value: ScaleValue) => {
          const label = matrix.impactLabels[value]
          return (
            <div key={value} className="admin-criteria__row">
              <span className="admin-criteria__value">{value}</span>
              <BilingualField
                labelEn={t('admin.matrix.criterionNameEn')}
                labelKa={t('admin.matrix.criterionNameKa')}
                valueEn={label.en}
                valueKa={label.ka}
                invalid={errorFor(`impact.${String(value)}.name`) !== undefined}
                onChangeEn={(next) => {
                  edit(setImpactLevel(matrix, value, { en: next }))
                }}
                onChangeKa={(next) => {
                  edit(setImpactLevel(matrix, value, { ka: next }))
                }}
              />
              <div className="admin-criteria__description">
                <BilingualField
                  multiline
                  labelEn={t('admin.matrix.criterionDescriptionEn')}
                  labelKa={t('admin.matrix.criterionDescriptionKa')}
                  valueEn={label.descriptionEn}
                  valueKa={label.descriptionKa}
                  invalid={errorFor(`impact.${String(value)}.description`) !== undefined}
                  onChangeEn={(next) => {
                    edit(setImpactLevel(matrix, value, { descriptionEn: next }))
                  }}
                  onChangeKa={(next) => {
                    edit(setImpactLevel(matrix, value, { descriptionKa: next }))
                  }}
                />
              </div>
            </div>
          )
        })}
      </fieldset>

      {/* --- likelihood criteria -------------------------------------------- */}

      <fieldset className="admin-criteria">
        <legend>{t('admin.matrix.likelihoodCriteria')}</legend>
        <p className="panel__meta">{t('admin.matrix.likelihoodIntro')}</p>
        {SCALE_VALUES.map((value: ScaleValue) => {
          const label = matrix.likelihoodLabels[value]
          return (
            <div key={value} className="admin-criteria__row">
              <span className="admin-criteria__value">{value}</span>
              <BilingualField
                labelEn={t('admin.matrix.criterionNameEn')}
                labelKa={t('admin.matrix.criterionNameKa')}
                valueEn={label.en}
                valueKa={label.ka}
                invalid={errorFor(`likelihood.${String(value)}.name`) !== undefined}
                onChangeEn={(next) => {
                  edit(setLikelihoodLevel(matrix, value, { en: next }))
                }}
                onChangeKa={(next) => {
                  edit(setLikelihoodLevel(matrix, value, { ka: next }))
                }}
              />
              <label className="admin-criteria__percent">
                <span>{t('admin.matrix.percentFrom')}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={label.percentFrom ?? ''}
                  aria-invalid={
                    errorFor(`likelihood.${String(value)}.percentFrom`) !== undefined ||
                    errorFor(`likelihood.${String(value)}.percent`) !== undefined
                  }
                  onChange={(event) => {
                    edit(setLikelihoodLevel(matrix, value, { percentFrom: parsePercent(event.target.value) }))
                  }}
                />
              </label>
              <label className="admin-criteria__percent">
                <span>{t('admin.matrix.percentTo')}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={label.percentTo ?? ''}
                  aria-invalid={
                    errorFor(`likelihood.${String(value)}.percentTo`) !== undefined ||
                    errorFor(`likelihood.${String(value)}.percent`) !== undefined
                  }
                  onChange={(event) => {
                    edit(setLikelihoodLevel(matrix, value, { percentTo: parsePercent(event.target.value) }))
                  }}
                />
              </label>
              <BilingualField
                labelEn={t('admin.matrix.textValueEn')}
                labelKa={t('admin.matrix.textValueKa')}
                valueEn={label.textEn}
                valueKa={label.textKa}
                onChangeEn={(next) => {
                  edit(setLikelihoodLevel(matrix, value, { textEn: next }))
                }}
                onChangeKa={(next) => {
                  edit(setLikelihoodLevel(matrix, value, { textKa: next }))
                }}
              />
              <div className="admin-criteria__description">
                <BilingualField
                  multiline
                  labelEn={t('admin.matrix.criterionDescriptionEn')}
                  labelKa={t('admin.matrix.criterionDescriptionKa')}
                  valueEn={label.descriptionEn}
                  valueKa={label.descriptionKa}
                  invalid={errorFor(`likelihood.${String(value)}.description`) !== undefined}
                  onChangeEn={(next) => {
                    edit(setLikelihoodLevel(matrix, value, { descriptionEn: next }))
                  }}
                  onChangeKa={(next) => {
                    edit(setLikelihoodLevel(matrix, value, { descriptionKa: next }))
                  }}
                />
              </div>
            </div>
          )
        })}
      </fieldset>
    </section>
  )
}
