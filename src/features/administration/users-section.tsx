import { useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  duplicateEmailIds,
  splitScope,
  validateUser,
  type ValidationIssue,
} from '../../domain/administration/index.ts'
import { effectiveScope, flattenTree } from '../../domain/business-units/index.ts'
import type { User } from '../../domain/types/index.ts'
import { pickNamed, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'

/*
 * User directory (ARCHITECTURE.md §8.5).
 *
 * Users are deactivated, never deleted — they are referenced by risk
 * ownership, controls, actions, assessments and audit events, all of which
 * must stay readable.
 */

function blankUser(id: string): User {
  return {
    id, name: '', title: '', email: '', password: '',
    status: 'Active', roleIds: [], businessUnitIds: [],
  }
}

export function UsersSection() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user: actor } = useCurrentUser()

  const [draft, setDraft] = useState<User | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [issues, setIssues] = useState<ValidationIssue[]>([])

  if (!state || !actor) return null

  const units = flattenTree(state.businessUnits, { includeInactive: false })

  const save = async () => {
    if (!draft) return

    const found = validateUser(draft)
    if (found.length > 0) {
      setIssues(found)
      return
    }
    setIssues([])

    await store.update({
      mutate: (next) => {
        const index = next.users.findIndex((candidate) => candidate.id === draft.id)
        if (index >= 0) next.users[index] = draft
        else next.users.push(draft)
      },
      audit: {
        actorId: actor.id,
        action: isNew ? 'user.created' : 'user.updated',
        entityType: 'User',
        entityId: draft.id,
        summary: `${draft.name} (${draft.email})`,
      },
    })
    setDraft(null)
  }

  const toggleStatus = async (target: User) => {
    const next = target.status === 'Active' ? 'Inactive' : 'Active'
    await store.update({
      mutate: (state_) => {
        const found = state_.users.find((candidate) => candidate.id === target.id)
        if (found) found.status = next
      },
      audit: {
        actorId: actor.id,
        action: 'user.status_changed',
        entityType: 'User',
        entityId: target.id,
        summary: `${target.name} set to ${next}`,
      },
    })
  }

  // Direct grants versus what they pull in by inheritance.
  const scope = draft ? splitScope(state.businessUnits, draft.businessUnitIds) : null
  const effectiveCount = draft ? effectiveScope(state.businessUnits, draft.businessUnitIds).length : 0
  const duplicates = draft ? duplicateEmailIds(draft, state.users) : []

  const toggleScope = (unitId: string) => {
    if (!draft) return
    const has = draft.businessUnitIds.includes(unitId)
    setDraft({
      ...draft,
      businessUnitIds: has
        ? draft.businessUnitIds.filter((id) => id !== unitId)
        : [...draft.businessUnitIds, unitId],
    })
  }

  const toggleRole = (roleId: string) => {
    if (!draft) return
    const has = draft.roleIds.includes(roleId)
    setDraft({
      ...draft,
      roleIds: has ? draft.roleIds.filter((id) => id !== roleId) : [...draft.roleIds, roleId],
    })
  }

  return (
    <section aria-labelledby="users-title">
      <div className="admin-section__header">
        <h2 id="users-title">{t('admin.section.users')}</h2>
        <button
          type="button"
          onClick={() => {
            setIsNew(true)
            setIssues([])
            setDraft(blankUser(`usr_${Date.now().toString(36)}`))
          }}
        >
          {t('admin.user.addTitle')}
        </button>
      </div>

      <div className="scroll-x">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t('admin.user.name')}</th>
              <th scope="col">{t('admin.user.email')}</th>
              <th scope="col">{t('admin.user.roles')}</th>
              <th scope="col">{t('admin.user.status')}</th>
              <th scope="col"><span className="visually-hidden">{t('admin.edit')}</span></th>
            </tr>
          </thead>
          <tbody>
            {state.users.map((candidate) => (
              <tr key={candidate.id}>
                <td>{candidate.name}</td>
                <td>{candidate.email}</td>
                <td>
                  {candidate.roleIds
                    .map((roleId) => state.roles.find((role) => role.id === roleId))
                    .map((role) => (role ? pickNamed(role, 'name', language) : '—'))
                    .join(', ')}
                </td>
                <td>{candidate.status === 'Active' ? t('admin.active') : t('admin.inactive')}</td>
                <td className="admin-table__actions">
                  <button
                    type="button"
                    onClick={() => {
                      setIsNew(false)
                      setIssues([])
                      setDraft({ ...candidate })
                    }}
                  >
                    {t('admin.edit')}
                  </button>
                  <button type="button" onClick={() => void toggleStatus(candidate)}>
                    {candidate.status === 'Active' ? t('admin.deactivate') : t('admin.activate')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft && scope ? (
        <div className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="user-dialog-title">
          <h3 id="user-dialog-title">{t(isNew ? 'admin.user.addTitle' : 'admin.user.editTitle')}</h3>

          {issues.length > 0 ? (
            <ul className="admin-errors" role="alert">
              {issues.map((issue) => (
                <li key={issue.field}>{t(issue.messageKey as TranslationKey)}</li>
              ))}
            </ul>
          ) : null}

          {/* Non-blocking: Phase 1 does not enforce email uniqueness. */}
          {duplicates.length > 0 ? (
            <p className="admin-warning" role="status">{t('admin.user.duplicateEmail')}</p>
          ) : null}

          <div className="admin-form">
            <label>
              <span>{t('admin.user.name')}</span>
              <input
                value={draft.name}
                aria-invalid={issues.some((issue) => issue.field === 'name')}
                onChange={(event) => { setDraft({ ...draft, name: event.target.value }) }}
              />
            </label>
            <label>
              <span>{t('admin.user.title')}</span>
              <input
                value={draft.title}
                onChange={(event) => { setDraft({ ...draft, title: event.target.value }) }}
              />
            </label>
            <label>
              <span>{t('admin.user.email')}</span>
              <input
                type="email"
                value={draft.email}
                aria-invalid={issues.some((issue) => issue.field === 'email')}
                onChange={(event) => { setDraft({ ...draft, email: event.target.value }) }}
              />
            </label>
            <label>
              <span>{t('admin.user.password')}</span>
              <input
                type="text"
                value={draft.password}
                onChange={(event) => { setDraft({ ...draft, password: event.target.value }) }}
              />
            </label>
            <label>
              <span>{t('admin.user.status')}</span>
              <select
                value={draft.status}
                onChange={(event) => { setDraft({ ...draft, status: event.target.value as User['status'] }) }}
              >
                <option value="Active">{t('admin.active')}</option>
                <option value="Inactive">{t('admin.inactive')}</option>
              </select>
            </label>
          </div>

          <p className="panel__meta">{t('admin.user.passwordNote')}</p>

          <fieldset
            className="admin-checklist"
            aria-invalid={issues.some((issue) => issue.field === 'roleIds')}
          >
            <legend>{t('admin.user.roles')}</legend>
            {state.roles.map((role) => (
              <label key={role.id}>
                <input
                  type="checkbox"
                  checked={draft.roleIds.includes(role.id)}
                  onChange={() => { toggleRole(role.id) }}
                />
                <span>{pickNamed(role, 'name', language)}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="admin-checklist">
            <legend>
              {t('admin.user.directScope')} — {scope.direct.length} {t('admin.user.directCount')},{' '}
              {effectiveCount} {t('admin.user.effectiveCount')}
            </legend>
            <p className="panel__meta">{t('admin.user.inheritedNote')}</p>

            {units.map(({ unit, depth }) => {
              const isDirect = draft.businessUnitIds.includes(unit.id)
              const isInherited = scope.inherited.includes(unit.id)

              return (
                <label key={unit.id} style={{ marginInlineStart: `${String(depth)}rem` }}>
                  <input
                    type="checkbox"
                    checked={isDirect}
                    /*
                     * An inherited unit cannot be unchecked on its own — the
                     * grant lives on its parent (ARCHITECTURE.md §5.4).
                     */
                    disabled={isInherited && !isDirect}
                    onChange={() => { toggleScope(unit.id) }}
                  />
                  <span>{pickNamed(unit, 'name', language)}</span>
                  {isInherited && !isDirect ? (
                    <span className="admin-inherited-tag">{t('admin.user.inherited')}</span>
                  ) : null}
                </label>
              )
            })}
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
