import { useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import type { SsoConfig } from '../../domain/types/index.ts'
import { useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'

/*
 * SSO / SAML roadmap (ARCHITECTURE.md §6.3).
 *
 * Stores a configuration DRAFT only. Phase 1 performs no SAML authentication;
 * the fields exist so the integration can be specified ahead of the Phase 2
 * backend that will validate signatures, audience and timing.
 */

const TEXT_FIELDS = [
  ['providerName', 'admin.sso.providerName'],
  ['entityId', 'admin.sso.entityId'],
  ['metadataUrl', 'admin.sso.metadataUrl'],
  ['acsUrl', 'admin.sso.acsUrl'],
  ['emailAttribute', 'admin.sso.emailAttribute'],
  ['roleAttribute', 'admin.sso.roleAttribute'],
] as const satisfies readonly [keyof SsoConfig, TranslationKey][]

export function SsoSection() {
  const { t } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user } = useCurrentUser()

  const [draft, setDraft] = useState<SsoConfig | null>(null)

  if (!state || !user) return null
  const current = draft ?? state.ssoConfig

  const save = async (next: SsoConfig, summary: string) => {
    await store.update({
      mutate: (appState) => {
        appState.ssoConfig = next
      },
      audit: {
        actorId: user.id,
        action: 'sso.updated',
        entityType: 'SsoConfig',
        entityId: 'sso',
        summary,
      },
    })
    setDraft(null)
  }

  /**
   * The Enabled toggle raises its own audit event — it is the field that
   * changes behaviour, and the specification calls it out explicitly.
   */
  const toggleEnabled = async () => {
    const next = { ...current, enabled: !current.enabled }
    setDraft(next)
    await store.update({
      mutate: (appState) => {
        appState.ssoConfig = next
      },
      audit: {
        actorId: user.id,
        action: next.enabled ? 'sso.enabled' : 'sso.disabled',
        entityType: 'SsoConfig',
        entityId: 'sso',
        summary: `SAML configuration ${next.enabled ? 'enabled' : 'disabled'}`,
      },
    })
    setDraft(null)
  }

  return (
    <section aria-labelledby="sso-title">
      <div className="admin-section__header">
        <h2 id="sso-title">{t('admin.section.sso')}</h2>
        <button type="button" onClick={() => void save(current, 'SSO draft updated')}>
          {t('action.save')}
        </button>
      </div>

      <p className="panel__meta">{t('admin.sso.intro')}</p>

      <label className="admin-form__checkbox sso-toggle">
        <input
          type="checkbox"
          checked={current.enabled}
          onChange={() => void toggleEnabled()}
        />
        <span>{t('admin.sso.enabled')}</span>
      </label>

      <div className="admin-form">
        {TEXT_FIELDS.map(([field, labelKey]) => (
          <label key={field}>
            <span>{t(labelKey)}</span>
            <input
              value={String(current[field])}
              onChange={(event) => {
                setDraft({ ...current, [field]: event.target.value })
              }}
            />
          </label>
        ))}
      </div>

      <label className="sso-mappings">
        <span>{t('admin.sso.roleMappings')}</span>
        <textarea
          value={current.roleMappings}
          rows={4}
          onChange={(event) => {
            setDraft({ ...current, roleMappings: event.target.value })
          }}
        />
      </label>

      <p className="panel__meta">{t('admin.sso.preprovisionNote')}</p>
    </section>
  )
}
