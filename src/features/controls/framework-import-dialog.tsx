import { useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  canCreateControl,
  defaultScaleKey,
  FRAMEWORK_PACKAGES,
} from '../../domain/controls/index.ts'
import { hasBusinessUnitAccess } from '../../domain/permissions/index.ts'
import { pickLanguage, useTranslation } from '../../i18n/index.ts'
import type { ControlFrameworkId } from '../../domain/types/index.ts'
import { IconClose } from '../../ui/icons.tsx'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { importFrameworkControls } from './mutations.ts'

/*
 * Framework library import (FR-CR-02, QA-03).
 *
 * Controls are imported INTO ONE organisational unit, because a control is
 * mapped to exactly one OU (FR-CR-08). Re-importing the same package is safe:
 * a framework identifier already present in that unit is skipped rather than
 * duplicated, and the result is reported.
 */

export interface FrameworkImportDialogProps {
  onClose: () => void
}

export function FrameworkImportDialog({ onClose }: FrameworkImportDialogProps) {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user, context } = useCurrentUser()

  const [frameworkId, setFrameworkId] = useState<ControlFrameworkId>('iso27001')
  const [unitId, setUnitId] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)

  if (!state || !user) return null

  const selected = FRAMEWORK_PACKAGES.find((entry) => entry.id === frameworkId)
  const units = state.businessUnits.filter(
    (unit) => unit.active && hasBusinessUnitAccess(context, unit.id),
  )
  const allowed = canCreateControl(context)

  const run = async () => {
    if (!selected || unitId === '' || !allowed) return

    setBusy(true)
    try {
      const outcome = await importFrameworkControls(store, user.id, {
        frameworkId: selected.id,
        frameworkLabel: selected.labelEn,
        version: selected.version,
        businessUnitId: unitId,
        controls: selected.controls,
        defaults: {
          effectiveness: defaultScaleKey(state.controlConfig, 'effectiveness'),
          maturity: defaultScaleKey(state.controlConfig, 'maturity'),
          assurance: defaultScaleKey(state.controlConfig, 'assurance'),
        },
      })
      setResult(outcome)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="editor-backdrop">
      <div
        className="editor-dialog control-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="framework-import-title"
      >
        <header className="editor-dialog__header">
          <div className="editor-dialog__identity">
            <h2 id="framework-import-title">{t('controls.framework.title')}</h2>
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

        <div className="editor-panel">
          <div className="editor-grid">
            <label className="editor-field">
              <span>{t('controls.framework.pick')}</span>
              <select
                value={frameworkId}
                onChange={(event) => {
                  setFrameworkId(event.target.value as ControlFrameworkId)
                  setResult(null)
                }}
              >
                {FRAMEWORK_PACKAGES.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {pickLanguage(entry.labelEn, entry.labelKa, language)} {entry.version}
                  </option>
                ))}
              </select>
            </label>

            <label className="editor-field">
              <span>{t('controls.framework.unit')} *</span>
              <select
                value={unitId}
                onChange={(event) => {
                  setUnitId(event.target.value)
                  setResult(null)
                }}
              >
                <option value="">—</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.code} · {pickLanguage(unit.nameEn, unit.nameKa, language)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selected ? (
            <p className="panel__meta">
              {selected.sourceNote} · {selected.controls.length} {t('controls.count')}
            </p>
          ) : null}
          <p className="panel__meta">{t('controls.framework.summary')}</p>

          {result ? (
            <p className="control-import__result" role="status">
              {t('controls.framework.result')}: {result.imported} · {result.skipped}{' '}
              {t('controls.framework.skipped')}
            </p>
          ) : null}
        </div>

        <footer className="editor-dialog__footer">
          <div className="editor-summary" />
          <div className="editor-dialog__buttons">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              {t('action.close')}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || unitId === '' || !allowed}
              onClick={() => void run()}
            >
              {t('controls.framework.confirm')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
