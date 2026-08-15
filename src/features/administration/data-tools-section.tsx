import { useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import { useTranslation } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'

/*
 * Data Tools (ARCHITECTURE.md §4.2).
 *
 * Export full backup, import a backup, export the audit trail, and reset to
 * the packaged seed. Reset is destructive and requires typed confirmation.
 */

/** Offers `text` as a download. A no-op where the URL API is unavailable. */
function downloadJson(filename: string, text: string): void {
  if (typeof URL.createObjectURL !== 'function') return

  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

type Notice = { tone: 'ok' | 'error'; messageKey: 'admin.data.importSuccess' | 'admin.data.importFailed' | 'admin.data.resetDone' }

export function DataToolsSection() {
  const { t } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user } = useCurrentUser()

  const [notice, setNotice] = useState<Notice | null>(null)
  const [confirmText, setConfirmText] = useState('')

  if (!state || !user) return null

  const exportState = () => {
    downloadJson('aizzen-backup.json', store.exportJson())
  }

  const exportAudit = () => {
    // Audit-only JSON is review data, not a restore package.
    downloadJson('aizzen-audit.json', JSON.stringify(state.auditEvents, null, 2))
  }

  const importBackup = async (file: File) => {
    const text = await file.text()
    try {
      await store.importJson(text)
      setNotice({ tone: 'ok', messageKey: 'admin.data.importSuccess' })
    } catch {
      // Invalid JSON or structure leaves stored state untouched — the
      // repository rejects before writing (ARCHITECTURE.md §10).
      setNotice({ tone: 'error', messageKey: 'admin.data.importFailed' })
    }
  }

  const reset = async () => {
    await store.reset()
    setConfirmText('')
    setNotice({ tone: 'ok', messageKey: 'admin.data.resetDone' })
  }

  return (
    <section aria-labelledby="data-title">
      <div className="admin-section__header">
        <h2 id="data-title">{t('admin.section.dataTools')}</h2>
      </div>

      <p className="panel__meta">{t('admin.data.intro')}</p>

      {notice ? (
        <p
          className={notice.tone === 'error' ? 'admin-errors' : 'admin-warning'}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {t(notice.messageKey)}
        </p>
      ) : null}

      <div className="data-tools">
        <button type="button" onClick={exportState}>{t('admin.data.exportState')}</button>
        <button type="button" onClick={exportAudit}>{t('admin.data.exportAudit')}</button>

        <label className="branding-upload">
          <span>{t('admin.data.import')}</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importBackup(file)
            }}
          />
        </label>
      </div>

      {/*
       * Reset is irreversible and destroys every local change, so it takes a
       * typed confirmation rather than a single click.
       */}
      <fieldset className="data-tools__reset">
        <legend>{t('admin.data.reset')}</legend>
        <p className="panel__meta">{t('admin.data.resetConfirm')}</p>

        <label>
          <span>{t('admin.data.resetConfirmLabel')}</span>
          <input
            value={confirmText}
            onChange={(event) => { setConfirmText(event.target.value) }}
          />
        </label>

        <button
          type="button"
          disabled={confirmText.trim() !== 'RESET'}
          onClick={() => void reset()}
        >
          {t('admin.data.reset')}
        </button>
      </fieldset>
    </section>
  )
}
