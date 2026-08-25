import { useState, type FormEvent } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  activeCustomColumns,
  canEditControlRecord,
  defaultScaleKey,
  deficienciesForControl,
  linkedRiskIds,
  scaleLevels,
} from '../../domain/controls/index.ts'
import { pickLanguage, useTranslation } from '../../i18n/index.ts'
import type { ControlEvidence, RegisterControl } from '../../domain/types/index.ts'
import { IconClose, IconPlus, IconTrash } from '../../ui/icons.tsx'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import {
  blankEvidence,
  createControl,
  deleteControl,
  updateControl,
  type ControlDraft,
} from './mutations.ts'

/*
 * Control editor (CR-2026 §5.2).
 *
 * Reuses the Risk Editor's dialog chrome (`editor-*` classes) so the two
 * editors are the same product, not two designs. Nothing about the risk
 * editor is modified to achieve that.
 *
 * The Control ID is issued by the system and read-only after creation, and
 * the organisation list offers ONLY units the user may write to — scope is
 * decided from the session, never from the form (SEC-01).
 */

export interface ControlEditorModalProps {
  control: RegisterControl | null
  /** Pre-selected organisation for a new control. */
  defaultBusinessUnitId: string
  onClose: () => void
}

function draftFrom(control: RegisterControl): ControlDraft {
  return {
    businessUnitId: control.businessUnitId,
    name: control.name,
    objective: control.objective,
    ownerId: control.ownerId,
    effectiveness: control.effectiveness,
    maturity: control.maturity,
    assurance: control.assurance,
    evidence: control.evidence.map((item) => ({ ...item })),
    custom: { ...control.custom },
  }
}

export function ControlEditorModal({
  control,
  defaultBusinessUnitId,
  onClose,
}: ControlEditorModalProps) {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user, context } = useCurrentUser()

  const isNew = control === null
  const config = state?.controlConfig ?? null

  const [draft, setDraft] = useState<ControlDraft>(() =>
    control
      ? draftFrom(control)
      : {
          businessUnitId: defaultBusinessUnitId,
          name: '',
          objective: '',
          ownerId: '',
          effectiveness: config ? defaultScaleKey(config, 'effectiveness') : '',
          maturity: config ? defaultScaleKey(config, 'maturity') : '',
          assurance: config ? defaultScaleKey(config, 'assurance') : '',
          evidence: [],
          custom: {},
        },
  )
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  if (!state || !user || !config) return null

  const writableUnits = state.businessUnits.filter(
    (unit) => unit.active && context.businessUnits.some((candidate) => candidate.id === unit.id),
  )
  // The scope check itself lives in the domain; this only decides the options.
  const allowedUnits = writableUnits.filter((unit) =>
    canEditControlRecord(context, { ...(control ?? ({} as RegisterControl)), businessUnitId: unit.id }),
  )

  const owners = state.users.filter((candidate) => candidate.status === 'Active')
  const customColumns = activeCustomColumns(config, 'control')

  const findingCount = control ? deficienciesForControl(state.controlDeficiencies, control.id).length : 0
  const riskCount = control ? linkedRiskIds(state.controlRiskLinks, control.id).length : 0

  const set = <K extends keyof ControlDraft>(key: K, value: ControlDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const setEvidence = (id: string, patch: Partial<ControlEvidence>) => {
    setDraft((current) => ({
      ...current,
      evidence: current.evidence.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    const found: string[] = []
    if (draft.name.trim() === '') found.push(t('controls.error.name'))
    if (draft.businessUnitId === '') found.push(t('controls.error.businessUnit'))
    else if (!allowedUnits.some((unit) => unit.id === draft.businessUnitId)) {
      found.push(t('controls.error.scope'))
    }
    if (found.length > 0) {
      setErrors(found)
      return
    }

    const cleaned: ControlDraft = {
      ...draft,
      name: draft.name.trim(),
      objective: draft.objective.trim(),
      // An evidence item with no title is dropped, matching how the risk
      // editor treats an empty control or action.
      evidence: draft.evidence.filter((item) => item.title.trim() !== ''),
    }

    setSaving(true)
    try {
      if (control) {
        const changes: string[] = []
        if (control.name !== cleaned.name) changes.push('name')
        if (control.effectiveness !== cleaned.effectiveness) changes.push('effectiveness')
        if (control.assurance !== cleaned.assurance) changes.push('assurance')
        if (control.maturity !== cleaned.maturity) changes.push('maturity')
        if (control.ownerId !== cleaned.ownerId) changes.push('owner')
        if (control.businessUnitId !== cleaned.businessUnitId) changes.push('organization')
        await updateControl(store, user.id, control.id, cleaned, changes)
      } else {
        await createControl(store, user.id, cleaned)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!control) return
    if (!window.confirm(t('controls.editor.deleteConfirm'))) return

    setSaving(true)
    try {
      await deleteControl(store, user.id, control)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="editor-backdrop">
      <div
        className="editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="control-editor-title"
      >
        <header className="editor-dialog__header">
          <div className="editor-dialog__identity">
            <p className="editor-dialog__ref">{control ? control.ref : t('controls.editor.refNote')}</p>
            <h2 id="control-editor-title">
              {t(isNew ? 'controls.editor.newTitle' : 'controls.editor.editTitle')}
            </h2>
          </div>
          <button
            type="button"
            className="editor-dialog__close"
            aria-label={t('action.close')}
            title={t('action.close')}
            onClick={onClose}
          >
            <IconClose />
          </button>
        </header>

        {errors.length > 0 ? (
          <div className="editor-errors" role="alert">
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <form className="control-form" onSubmit={(event) => void submit(event)} noValidate>
          <div className="editor-panel">
            <div className="editor-grid">
              <label className="editor-field">
                <span>{t('controls.column.businessUnit')} *</span>
                <select
                  value={draft.businessUnitId}
                  onChange={(event) => {
                    set('businessUnitId', event.target.value)
                  }}
                >
                  <option value="">—</option>
                  {allowedUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.code} · {pickLanguage(unit.nameEn, unit.nameKa, language)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="editor-field">
                <span>{t('controls.column.owner')}</span>
                <select
                  value={draft.ownerId}
                  onChange={(event) => {
                    set('ownerId', event.target.value)
                  }}
                >
                  <option value="">—</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="editor-field editor-grid__full">
                <span>{t('controls.column.name')} *</span>
                <input
                  type="text"
                  value={draft.name}
                  maxLength={200}
                  onChange={(event) => {
                    set('name', event.target.value)
                  }}
                />
              </label>

              <label className="editor-field editor-grid__full">
                <span>{t('controls.column.objective')}</span>
                <textarea
                  rows={3}
                  value={draft.objective}
                  maxLength={2000}
                  onChange={(event) => {
                    set('objective', event.target.value)
                  }}
                />
              </label>

              {(['effectiveness', 'maturity', 'assurance'] as const).map((scale) => (
                <label className="editor-field" key={scale}>
                  <span>{t(`controls.column.${scale}`)}</span>
                  <select
                    value={draft[scale]}
                    onChange={(event) => {
                      set(scale, event.target.value)
                    }}
                  >
                    {scaleLevels(config, scale).map((level) => (
                      <option key={level.key} value={level.key}>
                        {pickLanguage(level.labelEn, level.labelKa, language)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
          </div>

          {customColumns.length > 0 ? (
            <fieldset className="editor-acceptance">
              <legend>{t('controls.editor.custom')}</legend>
              <div className="editor-grid">
                {customColumns.map((column) => (
                  <label className="editor-field" key={column.id}>
                    <span>{pickLanguage(column.labelEn, column.labelKa, language)}</span>
                    {column.type === 'select' ? (
                      <select
                        value={String(draft.custom[column.id] ?? '')}
                        onChange={(event) => {
                          set('custom', { ...draft.custom, [column.id]: event.target.value })
                        }}
                      >
                        <option value="">—</option>
                        {column.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'}
                        value={String(draft.custom[column.id] ?? '')}
                        onChange={(event) => {
                          set('custom', { ...draft.custom, [column.id]: event.target.value })
                        }}
                      />
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset className="editor-acceptance">
            <legend>{t('controls.editor.evidence')}</legend>

            {draft.evidence.length === 0 ? (
              <p className="panel__meta">{t('controls.editor.evidenceEmpty')}</p>
            ) : (
              <ul className="editor-list">
                {draft.evidence.map((item) => (
                  <li key={item.id} className="editor-card control-evidence__item">
                    <label className="editor-field">
                      <span>{t('controls.editor.evidenceTitle')}</span>
                      <input
                        type="text"
                        value={item.title}
                        maxLength={200}
                        onChange={(event) => {
                          setEvidence(item.id, { title: event.target.value })
                        }}
                      />
                    </label>
                    <label className="editor-field">
                      <span>{t('controls.editor.evidenceReference')}</span>
                      <input
                        type="text"
                        value={item.reference}
                        maxLength={500}
                        onChange={(event) => {
                          setEvidence(item.id, { reference: event.target.value })
                        }}
                      />
                    </label>
                    <label className="editor-field">
                      <span>{t('controls.editor.evidenceNote')}</span>
                      <input
                        type="text"
                        value={item.note}
                        maxLength={500}
                        onChange={(event) => {
                          setEvidence(item.id, { note: event.target.value })
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn--icon"
                      aria-label={t('controls.editor.evidenceRemove')}
                      title={t('controls.editor.evidenceRemove')}
                      onClick={() => {
                        setDraft((current) => ({
                          ...current,
                          evidence: current.evidence.filter((entry) => entry.id !== item.id),
                        }))
                      }}
                    >
                      <IconTrash />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setDraft((current) => ({ ...current, evidence: [...current.evidence, blankEvidence()] }))
              }}
            >
              <IconPlus />
              {t('controls.editor.evidenceAdd')}
            </button>
          </fieldset>

          </div>

          <footer className="editor-dialog__footer">
            <div className="editor-summary">
              {control ? (
                <span className="panel__meta">
                  {findingCount} {t('deficiency.count')} · {riskCount} {t('controls.risk.linked').toLowerCase()}
                </span>
              ) : null}
            </div>
            <div className="editor-dialog__buttons">
              {control ? (
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={saving}
                  onClick={() => void remove()}
                >
                  {t('controls.editor.delete')}
                </button>
              ) : null}
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                {t('action.cancel')}
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                data-loading={saving}
                aria-busy={saving}
                disabled={saving}
              >
                {t('action.save')}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}
