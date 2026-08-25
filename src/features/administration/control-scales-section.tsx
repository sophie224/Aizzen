import { useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import { DEFAULT_LEVEL_COLOR, type ControlScaleName } from '../../domain/controls/index.ts'
import { ATTRIBUTE_TYPES } from '../../domain/types/enums.ts'
import type {
  ControlConfig,
  ControlCustomColumn,
  ControlRegisterName,
  ControlScaleLevel,
} from '../../domain/types/index.ts'
import { useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import '../controls/controls.css'

/*
 * Control scales and custom columns (CR-2026 FR-CR-09, FR-CR-11, QA-08).
 *
 * The contract this screen must hold, and the reason it edits a draft rather
 * than writing on every keystroke: a level's STORED KEY never changes. Renaming
 * "Effective" or recolouring it rewrites nothing — every control, filter and
 * export keeps working, and historical records still render. Saving is
 * explicit, versioned and audited, exactly as the rating matrix is.
 */

const SCALES: ReadonlyArray<{ scale: ControlScaleName; labelKey: TranslationKey }> = [
  { scale: 'effectiveness', labelKey: 'admin.controls.effectiveness' },
  { scale: 'maturity', labelKey: 'admin.controls.maturity' },
  { scale: 'assurance', labelKey: 'admin.controls.assurance' },
  { scale: 'classifications', labelKey: 'admin.controls.classifications' },
]

function slugify(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug === '' ? fallback : slug
}

export function ControlScalesSection() {
  const { t } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user } = useCurrentUser()

  const [draft, setDraft] = useState<ControlConfig | null>(null)
  const [saved, setSaved] = useState(false)

  if (!state || !user) return null

  const config = draft ?? state.controlConfig
  const dirty = draft !== null

  const edit = (mutate: (next: ControlConfig) => void) => {
    setSaved(false)
    setDraft((current) => {
      const base: ControlConfig = structuredClone(current ?? state.controlConfig)
      mutate(base)
      return base
    })
  }

  const setLevel = (scale: ControlScaleName, index: number, patch: Partial<ControlScaleLevel>) => {
    edit((next) => {
      next[scale][index] = { ...next[scale][index], ...patch }
    })
  }

  const save = async () => {
    if (!draft) return

    await store.update({
      mutate: (next) => {
        next.controlConfig = { ...draft, version: state.controlConfig.version + 1 }
      },
      audit: {
        actorId: user.id,
        action: 'control_config.updated',
        entityType: 'ControlConfig',
        entityId: 'controlConfig',
        summary: `Control scales saved as version ${String(state.controlConfig.version + 1)}`,
      },
    })
    setDraft(null)
    setSaved(true)
  }

  return (
    <section aria-labelledby="control-scales-title">
      <div className="admin-section__header">
        <h2 id="control-scales-title">{t('admin.section.controlScales')}</h2>
        <span className="panel__meta">
          {t('admin.controls.version')} {config.version}
        </span>
      </div>

      <p className="panel__meta">{t('admin.controls.keyNote')}</p>
      {saved ? (
        <p className="control-import__result" role="status">
          {t('admin.controls.saved')}
        </p>
      ) : null}

      {SCALES.map(({ scale, labelKey }) => (
        <fieldset className="admin-levels" key={scale}>
          <legend>{t(labelKey)}</legend>

          <div className="scroll-x">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">{t('admin.controls.levelName')}</th>
                  <th scope="col">{t('admin.controls.levelKey')}</th>
                  <th scope="col">{t('admin.controls.colour')}</th>
                  <th scope="col">
                    <span className="visually-hidden">{t('admin.controls.removeLevel')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {config[scale].map((level, index) => (
                  <tr key={level.key}>
                    <td>
                      <input
                        type="text"
                        aria-label={`${t(labelKey)} — ${t('admin.controls.levelName')}`}
                        value={level.labelEn}
                        onChange={(event) => {
                          setLevel(scale, index, { labelEn: event.target.value })
                        }}
                      />
                    </td>
                    <td>
                      {/* Read-only on purpose: the key is the stored value. */}
                      <span className="code">{level.key}</span>
                    </td>
                    <td>
                      <input
                        type="color"
                        aria-label={`${t(labelKey)} — ${t('admin.controls.colour')}`}
                        value={level.color}
                        onChange={(event) => {
                          setLevel(scale, index, { color: event.target.value })
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={config[scale].length <= 1}
                        onClick={() => {
                          edit((next) => {
                            next[scale] = next[scale].filter((_, position) => position !== index)
                          })
                        }}
                      >
                        {t('admin.controls.removeLevel')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className="btn"
            onClick={() => {
              edit((next) => {
                const key = `level_${String(next[scale].length + 1)}`
                next[scale].push({ key, labelEn: '', labelKa: '', color: DEFAULT_LEVEL_COLOR })
              })
            }}
          >
            {t('admin.controls.addLevel')}
          </button>
        </fieldset>
      ))}

      <fieldset className="admin-levels">
        <legend>{t('admin.controls.columns')}</legend>

        <div className="scroll-x">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">{t('admin.controls.columnLabel')}</th>
                <th scope="col">{t('admin.controls.columnRegister')}</th>
                <th scope="col">{t('admin.attr.type')}</th>
                <th scope="col">{t('admin.controls.showInRiskView')}</th>
                <th scope="col">{t('register.column.status')}</th>
              </tr>
            </thead>
            <tbody>
              {config.customColumns.map((column, index) => (
                <tr key={column.id}>
                  <td>
                    <input
                      type="text"
                      aria-label={t('admin.controls.columnLabel')}
                      value={column.labelEn}
                      onChange={(event) => {
                        edit((next) => {
                          next.customColumns[index] = {
                            ...next.customColumns[index],
                            labelEn: event.target.value,
                          }
                        })
                      }}
                    />
                  </td>
                  <td>
                    {t(
                      column.register === 'control'
                        ? 'admin.controls.registerControl'
                        : 'admin.controls.registerDeficiency',
                    )}
                  </td>
                  <td>{column.type}</td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={t('admin.controls.showInRiskView')}
                      checked={column.showInRiskView}
                      disabled={column.register !== 'control'}
                      onChange={(event) => {
                        edit((next) => {
                          next.customColumns[index] = {
                            ...next.customColumns[index],
                            showInRiskView: event.target.checked,
                          }
                        })
                      }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => {
                        // Deactivating hides the column and PRESERVES values.
                        edit((next) => {
                          next.customColumns[index] = {
                            ...next.customColumns[index],
                            active: !next.customColumns[index].active,
                          }
                        })
                      }}
                    >
                      {column.active ? t('admin.deactivate') : t('admin.activate')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <NewColumnForm
          onAdd={(register, labelEn, type) => {
            edit((next) => {
              const id = `ccol_${slugify(labelEn, String(next.customColumns.length + 1))}`
              if (next.customColumns.some((column) => column.id === id)) return

              const column: ControlCustomColumn = {
                id,
                register,
                labelEn,
                labelKa: '',
                type,
                options: [],
                showInRiskView: false,
                active: true,
              }
              next.customColumns.push(column)
            })
          }}
        />
      </fieldset>

      <div className="admin-actions">
        <button type="button" className="btn btn--primary" disabled={!dirty} onClick={() => void save()}>
          {t('action.save')}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={!dirty}
          onClick={() => {
            setDraft(null)
          }}
        >
          {t('action.cancel')}
        </button>
      </div>
    </section>
  )
}

interface NewColumnFormProps {
  onAdd: (
    register: ControlRegisterName,
    labelEn: string,
    type: (typeof ATTRIBUTE_TYPES)[number],
  ) => void
}

function NewColumnForm({ onAdd }: NewColumnFormProps) {
  const { t } = useTranslation()
  const [label, setLabel] = useState('')
  const [register, setRegister] = useState<ControlRegisterName>('control')
  const [type, setType] = useState<(typeof ATTRIBUTE_TYPES)[number]>('text')

  return (
    <div className="admin-form control-upload__actions">
      <label>
        <span className="visually-hidden">{t('admin.controls.columnLabel')}</span>
        <input
          type="text"
          placeholder={t('admin.controls.columnLabel')}
          value={label}
          onChange={(event) => {
            setLabel(event.target.value)
          }}
        />
      </label>

      <label>
        <span className="visually-hidden">{t('admin.controls.columnRegister')}</span>
        <select
          value={register}
          onChange={(event) => {
            setRegister(event.target.value as ControlRegisterName)
          }}
        >
          <option value="control">{t('admin.controls.registerControl')}</option>
          <option value="deficiency">{t('admin.controls.registerDeficiency')}</option>
        </select>
      </label>

      <label>
        <span className="visually-hidden">{t('admin.attr.type')}</span>
        <select
          value={type}
          onChange={(event) => {
            setType(event.target.value as (typeof ATTRIBUTE_TYPES)[number])
          }}
        >
          {ATTRIBUTE_TYPES.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="btn"
        disabled={label.trim() === ''}
        onClick={() => {
          onAdd(register, label.trim(), type)
          setLabel('')
        }}
      >
        {t('admin.controls.addColumn')}
      </button>
    </div>
  )
}
