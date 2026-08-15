import { useRef, useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  ACCEPTED_LOGO_TYPES,
  validateLogoFile,
  type ValidationIssue,
} from '../../domain/administration/index.ts'
import { useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'

/*
 * Branding (ARCHITECTURE.md §8.5).
 *
 * Manages the CLIENT company logo only. The AIZEN cotton-flower mark and the
 * public website belong to Website Administration, which a Risk Administrator
 * cannot reach.
 *
 * Phase 1 stores the image as a base64 data URL inside AppState. Phase 2 moves
 * it to object storage with signed upload and server-side validation.
 */
export function BrandingSection() {
  const { t } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user } = useCurrentUser()

  const inputRef = useRef<HTMLInputElement>(null)
  const [issues, setIssues] = useState<ValidationIssue[]>([])

  if (!state || !user) return null
  const logo = state.branding.clientLogo

  const write = async (value: string | null, summary: string) => {
    await store.update({
      mutate: (next) => {
        next.branding = { ...next.branding, clientLogo: value }
      },
      audit: {
        actorId: user.id,
        action: 'branding.updated',
        entityType: 'Branding',
        entityId: 'client-logo',
        summary,
      },
    })
  }

  const onFile = async (file: File) => {
    // Checked before reading: an oversized file would otherwise exhaust the
    // storage quota and fail on write, with nothing useful to show the user.
    const found = validateLogoFile({ size: file.size, type: file.type })
    if (found.length > 0) {
      setIssues(found)
      return
    }
    setIssues([])

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => { resolve(String(reader.result)) }
      reader.onerror = () => { reject(new Error('read failed')) }
      reader.readAsDataURL(file)
    })

    try {
      await write(dataUrl, `Client logo replaced (${file.name})`)
    } catch {
      // A quota failure still reaches here for a file that passed the size
      // check but pushed total state over the limit.
      setIssues([{ field: 'logo', messageKey: 'admin.error.logoSize' }])
    }
  }

  return (
    <section aria-labelledby="branding-title">
      <div className="admin-section__header">
        <h2 id="branding-title">{t('admin.section.branding')}</h2>
      </div>

      <p className="panel__meta">{t('admin.branding.intro')}</p>

      {issues.length > 0 ? (
        <ul className="admin-errors" role="alert">
          {issues.map((issue) => (
            <li key={issue.messageKey}>{t(issue.messageKey as TranslationKey)}</li>
          ))}
        </ul>
      ) : null}

      <div className="branding-preview">
        {logo ? (
          <img src={logo} alt={t('admin.branding.current')} className="branding-preview__image" />
        ) : (
          <p className="panel__meta">{t('admin.branding.none')}</p>
        )}
      </div>

      <div className="admin-dialog__footer branding-actions">
        <label className="branding-upload">
          <span>{t('admin.branding.upload')}</span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_LOGO_TYPES.join(',')}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onFile(file)
            }}
          />
        </label>

        {logo ? (
          <button
            type="button"
            onClick={() => {
              setIssues([])
              // Removing returns the header to its placeholder state.
              void write(null, 'Client logo removed')
              if (inputRef.current) inputRef.current.value = ''
            }}
          >
            {t('admin.branding.remove')}
          </button>
        ) : null}
      </div>

      <p className="panel__meta">{t('admin.branding.aizenNote')}</p>
    </section>
  )
}
