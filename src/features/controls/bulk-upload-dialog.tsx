import { useRef, useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  CONTROL_IMPORT_COLUMNS,
  importTemplateCsv,
  planControlImport,
  type ImportPlan,
} from '../../domain/controls/index.ts'
import { userScope } from '../../domain/permissions/index.ts'
import { useTranslation } from '../../i18n/index.ts'
import { IconClose, IconDownload } from '../../ui/icons.tsx'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { applyControlImport, type ImportCommitRow } from './mutations.ts'
import { readTabularFile } from './read-tabular-file.ts'

/*
 * Bulk create/update of controls (FR-CR-06, QA-04, QA-05).
 *
 * Three phases, in the order the change request specifies: validate, preview,
 * then commit. Nothing is written until the user confirms, a rejected row is
 * never written silently, and every row's reason for rejection is listed.
 *
 * Scope comes from the session (`userScope`), never from the file, so a
 * spreadsheet cannot smuggle a control into another organisational unit
 * (SEC-01).
 */

export interface BulkUploadDialogProps {
  onClose: () => void
}

export function BulkUploadDialog({ onClose }: BulkUploadDialogProps) {
  const { t } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user, context } = useCurrentUser()
  const inputRef = useRef<HTMLInputElement>(null)

  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  if (!state || !user) return null

  const templateCode = state.businessUnits[0]?.code ?? 'ENT'

  const downloadTemplate = () => {
    const blob = new Blob([importTemplateCsv(templateCode)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'control-register-template.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const choose = async (file: File | undefined) => {
    if (!file) return

    setError('')
    setPlan(null)
    setDone(false)
    setFileName(file.name)

    const read = await readTabularFile(file)
    if (!read.ok) {
      setError(
        read.failure.kind === 'tooLarge'
          ? t('controls.upload.tooLarge')
          : read.failure.kind === 'unreadable'
            ? t('controls.upload.unreadable')
            : t('controls.upload.unsupported'),
      )
      return
    }

    setPlan(
      planControlImport(read.rows, {
        businessUnits: state.businessUnits,
        users: state.users,
        config: state.controlConfig,
        controls: state.controls,
        allowedBusinessUnitIds: userScope(context),
      }),
    )
  }

  const commit = async () => {
    if (!plan) return

    const accepted: ImportCommitRow[] = plan.rows
      .filter((row) => row.action !== 'reject' && row.values !== null)
      .map((row) => ({
        action: row.action as 'create' | 'update',
        targetId: row.targetId,
        values: {
          businessUnitId: row.values?.businessUnitId ?? '',
          name: row.values?.name ?? '',
          objective: row.values?.objective ?? '',
          ownerId: row.values?.ownerId ?? '',
          effectiveness: row.values?.effectiveness ?? '',
          maturity: row.values?.maturity ?? '',
          assurance: row.values?.assurance ?? '',
        },
      }))

    if (accepted.length === 0) return

    setBusy(true)
    try {
      await applyControlImport(store, user.id, accepted)
      setDone(true)
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
        aria-labelledby="control-upload-title"
      >
        <header className="editor-dialog__header">
          <div className="editor-dialog__identity">
            <h2 id="control-upload-title">{t('controls.upload.title')}</h2>
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
          <div className="control-upload__actions">
            <button type="button" className="btn" onClick={downloadTemplate}>
              <IconDownload />
              {t('controls.upload.template')}
            </button>

            <label className="btn control-upload__file">
              {t('controls.upload.pick')}
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => {
                  void choose(event.target.files?.[0])
                }}
              />
            </label>

            <span className="panel__meta">{fileName === '' ? t('controls.upload.noFile') : fileName}</span>
          </div>

          <details className="control-upload__columns">
            <summary>{t('controls.upload.rowsHeading')}</summary>
            <ul>
              {CONTROL_IMPORT_COLUMNS.map((column) => (
                <li key={column.key}>
                  <strong>{column.header}</strong>
                  {column.required ? ' *' : ''} — {column.hint}
                </li>
              ))}
            </ul>
          </details>

          {error !== '' ? (
            <p className="editor-errors" role="alert">
              {error}
            </p>
          ) : null}

          {plan?.fileIssues.length ? (
            <div className="editor-errors" role="alert">
              <ul>
                {plan.fileIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan && plan.fileIssues.length === 0 ? (
            <>
              <p className="control-upload__summary" role="status">
                <strong>{plan.created}</strong> {t('controls.upload.created')} ·{' '}
                <strong>{plan.updated}</strong> {t('controls.upload.updated')} ·{' '}
                <strong>{plan.rejected}</strong> {t('controls.upload.rejected')}
              </p>

              <div className="scroll-x">
                <table className="control-table control-table--preview">
                  <thead>
                    <tr>
                      <th scope="col">{t('controls.upload.row')}</th>
                      <th scope="col">{t('controls.upload.preview')}</th>
                      <th scope="col">{t('controls.column.name')}</th>
                      <th scope="col">{t('controls.upload.rowsHeading')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((row) => (
                      <tr key={row.row} className={row.action === 'reject' ? 'control-row--rejected' : undefined}>
                        <td>{row.row}</td>
                        <td>{row.action}</td>
                        <td>{row.values?.name ?? '—'}</td>
                        <td>
                          {row.issues.length === 0
                            ? '—'
                            : row.issues.map((issue) => `${issue.column}: ${issue.message}`).join(' ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {done ? (
            <p className="control-import__result" role="status">
              {t('controls.upload.commit')} ✓
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
              disabled={busy || done || !plan || plan.created + plan.updated === 0}
              onClick={() => void commit()}
            >
              {t('controls.upload.commit')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
