import { useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import { roleUsageCount, validateRole, type ValidationIssue } from '../../domain/administration/index.ts'
import { MODULE_NAMES, PERMISSION_LEVELS } from '../../domain/types/enums.ts'
import type { ModuleName, PermissionLevel, PermissionSet, Role } from '../../domain/types/index.ts'
import { pickNamed, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'

/*
 * Roles & Permissions (ARCHITECTURE.md §8.5).
 *
 * The eight-module matrix. Effective permission across several roles is the
 * MAXIMUM per module, computed at runtime — nothing is denormalised onto the
 * user, so a role edit takes effect immediately.
 */

function emptyPermissions(): PermissionSet {
  const set = {} as PermissionSet
  for (const module of MODULE_NAMES) set[module] = 'none'
  return set
}

function blankRole(id: string): Role {
  return { id, nameEn: '', nameKa: '', description: '', system: false, permissions: emptyPermissions() }
}

export function RolesSection() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user: actor } = useCurrentUser()

  const [draft, setDraft] = useState<Role | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [issues, setIssues] = useState<ValidationIssue[]>([])

  if (!state || !actor) return null

  const save = async () => {
    if (!draft) return

    const found = validateRole(draft)
    if (found.length > 0) {
      setIssues(found)
      return
    }
    setIssues([])

    const original = state.roles.find((role) => role.id === draft.id)
    const permissionsChanged =
      original !== undefined &&
      MODULE_NAMES.some((module) => original.permissions[module] !== draft.permissions[module])

    await store.update({
      mutate: (next) => {
        const index = next.roles.findIndex((candidate) => candidate.id === draft.id)
        if (index >= 0) next.roles[index] = draft
        else next.roles.push(draft)
      },
      audit: {
        actorId: actor.id,
        // Permission changes are audited distinctly — they are the
        // privilege-escalation-sensitive edit (ARCHITECTURE.md §8.5).
        action: isNew ? 'role.created' : permissionsChanged ? 'role.permission_changed' : 'role.updated',
        entityType: 'Role',
        entityId: draft.id,
        summary: draft.nameEn,
      },
    })
    setDraft(null)
  }

  const setPermission = (module: ModuleName, level: PermissionLevel) => {
    if (!draft) return
    setDraft({ ...draft, permissions: { ...draft.permissions, [module]: level } })
  }

  return (
    <section aria-labelledby="roles-title">
      <div className="admin-section__header">
        <h2 id="roles-title">{t('admin.section.roles')}</h2>
        <button
          type="button"
          onClick={() => {
            setIsNew(true)
            setIssues([])
            setDraft(blankRole(`role_${Date.now().toString(36)}`))
          }}
        >
          {t('admin.role.addTitle')}
        </button>
      </div>

      <p className="panel__meta">{t('admin.role.aggregationNote')}</p>

      <div className="scroll-x">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t('admin.role.nameEn')}</th>
              {MODULE_NAMES.map((module) => (
                <th key={module} scope="col">{t(`module.${module}` as TranslationKey)}</th>
              ))}
              <th scope="col">{t('admin.role.assignedTo')}</th>
              <th scope="col"><span className="visually-hidden">{t('admin.edit')}</span></th>
            </tr>
          </thead>
          <tbody>
            {state.roles.map((role) => (
              <tr key={role.id}>
                <td>
                  {pickNamed(role, 'name', language)}
                  {role.system ? <span className="panel__meta"> · {t('admin.role.system')}</span> : null}
                </td>
                {MODULE_NAMES.map((module) => (
                  <td key={module}>{t(`permission.${role.permissions[module]}` as TranslationKey)}</td>
                ))}
                <td>{roleUsageCount(state.users, role.id)} {t('admin.role.users')}</td>
                <td className="admin-table__actions">
                  <button
                    type="button"
                    onClick={() => {
                      setIsNew(false)
                      setIssues([])
                      setDraft({ ...role, permissions: { ...role.permissions } })
                    }}
                  >
                    {t('admin.edit')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft ? (
        <div className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="role-dialog-title">
          <h3 id="role-dialog-title">{t(isNew ? 'admin.role.addTitle' : 'admin.role.editTitle')}</h3>

          {issues.length > 0 ? (
            <ul className="admin-errors" role="alert">
              {issues.map((issue) => (
                <li key={issue.field}>{t(issue.messageKey as TranslationKey)}</li>
              ))}
            </ul>
          ) : null}

          <div className="admin-form">
            <label>
              <span>{t('admin.role.nameEn')}</span>
              <input
                value={draft.nameEn}
                aria-invalid={issues.some((issue) => issue.field === 'nameEn')}
                onChange={(event) => { setDraft({ ...draft, nameEn: event.target.value }) }}
              />
            </label>
            <label>
              <span>{t('admin.role.nameKa')}</span>
              <input
                value={draft.nameKa}
                onChange={(event) => { setDraft({ ...draft, nameKa: event.target.value }) }}
              />
            </label>
            <label>
              <span>{t('admin.role.description')}</span>
              <input
                value={draft.description}
                onChange={(event) => { setDraft({ ...draft, description: event.target.value }) }}
              />
            </label>
          </div>

          <fieldset className="admin-permissions">
            <legend>{t('admin.role.permissions')}</legend>
            {MODULE_NAMES.map((module) => (
              <label key={module}>
                <span>{t(`module.${module}` as TranslationKey)}</span>
                <select
                  value={draft.permissions[module]}
                  onChange={(event) => { setPermission(module, event.target.value as PermissionLevel) }}
                >
                  {PERMISSION_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {t(`permission.${level}` as TranslationKey)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>

          <div className="admin-dialog__footer">
            <button type="button" onClick={() => { setDraft(null) }}>{t('action.cancel')}</button>
            <button type="button" onClick={() => void save()}>{t('action.save')}</button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
