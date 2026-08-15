import { useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  attributeUsageCount,
  formatAttributeOptions,
  parseAttributeOptions,
  validateCustomAttribute,
  type ValidationIssue,
} from '../../domain/administration/index.ts'
import { ATTRIBUTE_TYPES } from '../../domain/types/enums.ts'
import type { CustomAttribute } from '../../domain/types/index.ts'
import { useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'

/*
 * Custom Attributes — the dynamic risk schema (ARCHITECTURE.md §8.5).
 *
 * Deactivating an attribute hides the field but NEVER deletes stored values;
 * reactivating brings them back.
 */

function blankAttribute(id: string): CustomAttribute {
  return { id, labelEn: '', labelKa: '', type: 'text', options: [], active: true, showInRegister: false }
}

export function CustomAttributesSection() {
  const { t } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user } = useCurrentUser()

  const [draft, setDraft] = useState<CustomAttribute | null>(null)
  const [optionsText, setOptionsText] = useState('')
  const [isNew, setIsNew] = useState(false)
  const [issues, setIssues] = useState<ValidationIssue[]>([])

  if (!state || !user) return null

  const openDraft = (attribute: CustomAttribute, creating: boolean) => {
    setIsNew(creating)
    setIssues([])
    setDraft(attribute)
    setOptionsText(formatAttributeOptions(attribute.options))
  }

  const save = async () => {
    if (!draft) return

    // Options are parsed from the raw text at save time, so trimming and
    // empty-value removal apply exactly once.
    const candidate: CustomAttribute = { ...draft, options: parseAttributeOptions(optionsText) }

    const found = validateCustomAttribute(candidate)
    if (found.length > 0) {
      setIssues(found)
      return
    }
    setIssues([])

    await store.update({
      mutate: (next) => {
        const index = next.customAttributes.findIndex((existing) => existing.id === candidate.id)
        if (index >= 0) next.customAttributes[index] = candidate
        else next.customAttributes.push(candidate)
      },
      audit: {
        actorId: user.id,
        action: isNew ? 'custom_attribute.created' : 'custom_attribute.updated',
        entityType: 'CustomAttribute',
        entityId: candidate.id,
        summary: `${candidate.labelEn} (${candidate.type})`,
      },
    })
    setDraft(null)
  }

  const toggleActive = async (attribute: CustomAttribute) => {
    await store.update({
      mutate: (next) => {
        const target = next.customAttributes.find((candidate) => candidate.id === attribute.id)
        // Only the flag changes — risk.custom values are never touched.
        if (target) target.active = !target.active
      },
      audit: {
        actorId: user.id,
        action: 'custom_attribute.status_changed',
        entityType: 'CustomAttribute',
        entityId: attribute.id,
        summary: `${attribute.labelEn} ${attribute.active ? 'deactivated' : 'activated'}`,
      },
    })
  }

  return (
    <section aria-labelledby="attributes-title">
      <div className="admin-section__header">
        <h2 id="attributes-title">{t('admin.section.customAttributes')}</h2>
        <button
          type="button"
          onClick={() => {
            openDraft(blankAttribute(`attr_${Date.now().toString(36)}`), true)
          }}
        >
          {t('admin.attr.addTitle')}
        </button>
      </div>

      <p className="panel__meta">{t('admin.attr.deactivateNote')}</p>

      <div className="scroll-x">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t('admin.attr.labelEn')}</th>
              <th scope="col">{t('admin.attr.type')}</th>
              <th scope="col">{t('admin.attr.showInRegister')}</th>
              <th scope="col">{t('register.column.status')}</th>
              <th scope="col">{t('admin.inUse')}</th>
              <th scope="col"><span className="visually-hidden">{t('admin.edit')}</span></th>
            </tr>
          </thead>
          <tbody>
            {state.customAttributes.map((attribute) => (
              <tr key={attribute.id}>
                <td>{attribute.labelEn}</td>
                <td>{attribute.type}</td>
                <td>{attribute.showInRegister ? '✓' : '—'}</td>
                <td>{attribute.active ? t('admin.active') : t('admin.inactive')}</td>
                <td>{attributeUsageCount(state.risks, attribute.id)} {t('admin.records')}</td>
                <td className="admin-table__actions">
                  <button type="button" onClick={() => { openDraft({ ...attribute }, false) }}>
                    {t('admin.edit')}
                  </button>
                  <button type="button" onClick={() => void toggleActive(attribute)}>
                    {attribute.active ? t('admin.deactivate') : t('admin.activate')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft ? (
        <div className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="attr-dialog-title">
          <h3 id="attr-dialog-title">{t(isNew ? 'admin.attr.addTitle' : 'admin.attr.editTitle')}</h3>

          {issues.length > 0 ? (
            <ul className="admin-errors" role="alert">
              {issues.map((issue) => (
                <li key={issue.field}>{t(issue.messageKey as TranslationKey)}</li>
              ))}
            </ul>
          ) : null}

          <div className="admin-form">
            <label>
              <span>{t('admin.attr.labelEn')}</span>
              <input
                value={draft.labelEn}
                aria-invalid={issues.some((issue) => issue.field === 'labelEn')}
                onChange={(event) => {
                  setDraft({ ...draft, labelEn: event.target.value })
                }}
              />
            </label>
            <label>
              <span>{t('admin.attr.labelKa')}</span>
              <input
                value={draft.labelKa}
                onChange={(event) => {
                  setDraft({ ...draft, labelKa: event.target.value })
                }}
              />
            </label>
            <label>
              <span>{t('admin.attr.type')}</span>
              <select
                value={draft.type}
                onChange={(event) => {
                  setDraft({ ...draft, type: event.target.value as CustomAttribute['type'] })
                }}
              >
                {ATTRIBUTE_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            {draft.type === 'select' ? (
              <label>
                <span>{t('admin.attr.options')}</span>
                <input
                  value={optionsText}
                  aria-invalid={issues.some((issue) => issue.field === 'options')}
                  onChange={(event) => {
                    setOptionsText(event.target.value)
                  }}
                />
              </label>
            ) : null}

            <label className="admin-form__checkbox">
              <input
                type="checkbox"
                checked={draft.showInRegister}
                onChange={(event) => {
                  setDraft({ ...draft, showInRegister: event.target.checked })
                }}
              />
              <span>{t('admin.attr.showInRegister')}</span>
            </label>
          </div>

          <div className="admin-dialog__footer">
            <button type="button" onClick={() => { setDraft(null) }}>{t('action.cancel')}</button>
            <button type="button" onClick={() => void save()}>{t('action.save')}</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
