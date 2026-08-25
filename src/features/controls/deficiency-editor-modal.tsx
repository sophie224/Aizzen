import { useMemo, useState, type FormEvent } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  activeCustomColumns,
  defaultScaleKey,
  scaleLevels,
  searchControls,
  visibleControls,
} from '../../domain/controls/index.ts'
import { hasBusinessUnitAccess } from '../../domain/permissions/index.ts'
import { pickLanguage, useTranslation } from '../../i18n/index.ts'
import type { ControlDeficiency } from '../../domain/types/index.ts'
import { IconClose } from '../../ui/icons.tsx'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import {
  createDeficiency,
  deleteDeficiency,
  updateDeficiency,
  type DeficiencyDraft,
} from './mutations.ts'

/*
 * Control Deficiency editor (CR-2026 §5.4).
 *
 * Control Mapping is a type-ahead over the Control Register (FR-CD-04) and is
 * mandatory: a finding must map to an existing control. The candidate list is
 * the user's VISIBLE controls, so the picker cannot be used to discover a
 * control in another organisational unit (SEC-01, QA-14).
 */

export interface DeficiencyEditorModalProps {
  deficiency: ControlDeficiency | null
  /** Pre-selected control, e.g. when raising a finding from a control row. */
  defaultControlId: string
  onClose: () => void
}

export function DeficiencyEditorModal({
  deficiency,
  defaultControlId,
  onClose,
}: DeficiencyEditorModalProps) {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user, context } = useCurrentUser()

  const isNew = deficiency === null
  const config = state?.controlConfig ?? null

  const [draft, setDraft] = useState<DeficiencyDraft>(() =>
    deficiency
      ? {
          businessUnitId: deficiency.businessUnitId,
          controlId: deficiency.controlId,
          description: deficiency.description,
          classification: deficiency.classification,
          remediationOwnerId: deficiency.remediationOwnerId,
          remediationDescription: deficiency.remediationDescription,
          targetDate: deficiency.targetDate,
          custom: { ...deficiency.custom },
        }
      : {
          businessUnitId: '',
          controlId: defaultControlId,
          description: '',
          classification: config ? defaultScaleKey(config, 'classifications') : '',
          remediationOwnerId: '',
          remediationDescription: '',
          targetDate: '',
          custom: {},
        },
  )
  const [term, setTerm] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const candidates = useMemo(() => {
    if (!state) return []
    return searchControls(visibleControls(context, state.controls), term, 12)
  }, [state, context, term])

  if (!state || !user || !config) return null

  const selected = state.controls.find((control) => control.id === draft.controlId) ?? null
  const owners = state.users.filter((candidate) => candidate.status === 'Active')
  const customColumns = activeCustomColumns(config, 'deficiency')

  const chooseControl = (controlId: string) => {
    const control = state.controls.find((candidate) => candidate.id === controlId)
    setDraft((current) => ({
      ...current,
      controlId,
      // Findings follow the control's organisational unit (FR-CD-07).
      businessUnitId: control?.businessUnitId ?? current.businessUnitId,
    }))
    setTerm('')
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    const found: string[] = []
    if (draft.controlId === '' || !selected) found.push(t('deficiency.error.control'))
    if (draft.description.trim() === '') found.push(t('deficiency.error.description'))
    if (selected && !hasBusinessUnitAccess(context, selected.businessUnitId)) {
      found.push(t('controls.error.scope'))
    }
    if (found.length > 0) {
      setErrors(found)
      return
    }

    const cleaned: DeficiencyDraft = {
      ...draft,
      description: draft.description.trim(),
      remediationDescription: draft.remediationDescription.trim(),
      businessUnitId: selected?.businessUnitId ?? draft.businessUnitId,
    }

    setSaving(true)
    try {
      if (deficiency) {
        const changes: string[] = []
        if (deficiency.classification !== cleaned.classification) changes.push('classification')
        if (deficiency.remediationOwnerId !== cleaned.remediationOwnerId) changes.push('remediation owner')
        if (deficiency.targetDate !== cleaned.targetDate) changes.push('target date')
        await updateDeficiency(store, user.id, deficiency.id, cleaned, changes)
      } else {
        await createDeficiency(store, user.id, cleaned)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!deficiency) return
    if (!window.confirm(t('deficiency.editor.deleteConfirm'))) return

    setSaving(true)
    try {
      await deleteDeficiency(store, user.id, deficiency)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="editor-backdrop">
      <div
        className="editor-dialog control-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deficiency-editor-title"
      >
        <header className="editor-dialog__header">
          <div className="editor-dialog__identity">
            <p className="editor-dialog__ref">{deficiency ? deficiency.ref : ''}</p>
            <h2 id="deficiency-editor-title">
              {t(isNew ? 'deficiency.editor.newTitle' : 'deficiency.editor.editTitle')}
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
            <div className="editor-field editor-grid__full control-typeahead">
              <label htmlFor="deficiency-control-search">
                <span>{t('deficiency.column.control')} *</span>
              </label>
              {selected ? (
                <p className="control-typeahead__selected">
                  <span className="code">{selected.ref}</span> {selected.name}
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      setDraft((current) => ({ ...current, controlId: '' }))
                    }}
                  >
                    {t('controls.risk.unlink')}
                  </button>
                </p>
              ) : (
                <>
                  <input
                    id="deficiency-control-search"
                    type="search"
                    value={term}
                    placeholder={t('deficiency.editor.controlSearch')}
                    onChange={(event) => {
                      setTerm(event.target.value)
                    }}
                  />
                  <p className="panel__meta">{t('deficiency.editor.controlHint')}</p>
                  <ul className="control-typeahead__list">
                    {(term.trim() === '' ? [] : candidates).map((control) => (
                      <li key={control.id}>
                        <button
                          type="button"
                          onClick={() => {
                            chooseControl(control.id)
                          }}
                        >
                          <span className="code">{control.ref}</span> {control.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
          </div>

          <div className="editor-grid">
            <label className="editor-field">
              <span>{t('deficiency.column.businessUnit')}</span>
              <input
                type="text"
                readOnly
                value={
                  state.businessUnits.find((unit) => unit.id === draft.businessUnitId)?.code ?? '—'
                }
              />
            </label>

            <label className="editor-field">
              <span>{t('deficiency.column.classification')}</span>
              <select
                value={draft.classification}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, classification: event.target.value }))
                }}
              >
                {scaleLevels(config, 'classifications').map((level) => (
                  <option key={level.key} value={level.key}>
                    {pickLanguage(level.labelEn, level.labelKa, language)}
                  </option>
                ))}
              </select>
            </label>

            <label className="editor-field editor-grid__full">
              <span>{t('deficiency.column.description')} *</span>
              <textarea
                rows={3}
                value={draft.description}
                maxLength={4000}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }}
              />
            </label>

            <label className="editor-field">
              <span>{t('deficiency.column.remediationOwner')}</span>
              <select
                value={draft.remediationOwnerId}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, remediationOwnerId: event.target.value }))
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

            <label className="editor-field">
              <span>{t('deficiency.column.targetDate')}</span>
              <input
                type="date"
                value={draft.targetDate}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, targetDate: event.target.value }))
                }}
              />
            </label>

            <label className="editor-field editor-grid__full">
              <span>{t('deficiency.column.remediation')}</span>
              <textarea
                rows={3}
                value={draft.remediationDescription}
                maxLength={4000}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, remediationDescription: event.target.value }))
                }}
              />
            </label>

            {customColumns.map((column) => (
              <label className="editor-field" key={column.id}>
                <span>{pickLanguage(column.labelEn, column.labelKa, language)}</span>
                {column.type === 'select' ? (
                  <select
                    value={String(draft.custom[column.id] ?? '')}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        custom: { ...current.custom, [column.id]: event.target.value },
                      }))
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
                      setDraft((current) => ({
                        ...current,
                        custom: { ...current.custom, [column.id]: event.target.value },
                      }))
                    }}
                  />
                )}
              </label>
            ))}
          </div>

          </div>

          <footer className="editor-dialog__footer">
            <div className="editor-summary" />
            <div className="editor-dialog__buttons">
              {deficiency ? (
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={saving}
                  onClick={() => void remove()}
                >
                  {t('deficiency.editor.delete')}
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
