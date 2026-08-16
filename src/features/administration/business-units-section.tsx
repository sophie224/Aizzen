import { useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  businessUnitCounts,
  validateBusinessUnit,
  type ValidationIssue,
} from '../../domain/administration/index.ts'
import { descendantIds, hierarchyPath } from '../../domain/business-units/index.ts'
import type { BusinessUnit } from '../../domain/types/index.ts'
import { pickNamed, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { BilingualField } from '../../ui/bilingual-field.tsx'
import { useCurrentUser } from '../../app/session/use-current-user.ts'

/*
 * Business Units — OU-style tree (ARCHITECTURE.md §8.5).
 *
 * Each node shows its hierarchy path and its DIRECT user and risk counts plus
 * its descendant count, which is what an administrator needs before
 * deactivating or moving it.
 */

function blankUnit(id: string, parentId: string | null): BusinessUnit {
  return { id, code: '', nameEn: '', nameKa: '', parentId, active: true }
}

export function BusinessUnitsSection() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user } = useCurrentUser()

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<BusinessUnit | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [issues, setIssues] = useState<ValidationIssue[]>([])

  if (!state || !user) return null

  const units = state.businessUnits
  const childrenOf = (parentId: string | null) =>
    units.filter((unit) => unit.parentId === parentId).sort((a, b) => a.nameEn.localeCompare(b.nameEn))

  const toggleCollapse = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    if (!draft) return

    const normalised: BusinessUnit = { ...draft, code: draft.code.trim().toUpperCase() }
    const found = validateBusinessUnit(normalised, {
      units,
      editingId: isNew ? undefined : normalised.id,
    })
    if (found.length > 0) {
      setIssues(found)
      return
    }
    setIssues([])

    const original = units.find((unit) => unit.id === normalised.id)
    const moved = original !== undefined && original.parentId !== normalised.parentId

    await store.update({
      mutate: (next) => {
        const index = next.businessUnits.findIndex((candidate) => candidate.id === normalised.id)
        if (index >= 0) next.businessUnits[index] = normalised
        else next.businessUnits.push(normalised)
      },
      audit: {
        actorId: user.id,
        // A move is audited distinctly — it changes everyone's effective scope.
        action: isNew ? 'business_unit.created' : moved ? 'business_unit.moved' : 'business_unit.updated',
        entityType: 'BusinessUnit',
        entityId: normalised.id,
        summary: `${normalised.code} ${normalised.nameEn}`,
      },
    })
    setDraft(null)
  }

  const toggleActive = async (unit: BusinessUnit) => {
    await store.update({
      mutate: (next) => {
        const target = next.businessUnits.find((candidate) => candidate.id === unit.id)
        if (target) target.active = !target.active
      },
      audit: {
        actorId: user.id,
        action: 'business_unit.status_changed',
        entityType: 'BusinessUnit',
        entityId: unit.id,
        summary: `${unit.code} ${unit.active ? 'deactivated' : 'activated'}`,
      },
    })
  }

  const renderNode = (unit: BusinessUnit, depth: number) => {
    const children = childrenOf(unit.id)
    const isCollapsed = collapsed.has(unit.id)
    const counts = businessUnitCounts(unit, units, state.users, state.risks)

    return (
      <li key={unit.id} className="bu-tree__node" style={{ marginInlineStart: `${String(depth)}rem` }}>
        <div className="bu-tree__row">
          {children.length > 0 ? (
            <button
              type="button"
              className="bu-tree__toggle"
              aria-expanded={!isCollapsed}
              onClick={() => {
                toggleCollapse(unit.id)
              }}
            >
              <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
              <span className="visually-hidden">
                {isCollapsed ? t('admin.bu.expand') : t('admin.bu.collapse')} {unit.nameEn}
              </span>
            </button>
          ) : (
            <span className="bu-tree__toggle bu-tree__toggle--leaf" aria-hidden="true" />
          )}

          <div className="bu-tree__identity">
            <strong>
              {unit.code} · {pickNamed(unit, 'name', language)}
            </strong>
            <span className="panel__meta">{hierarchyPath(units, unit.id, language)}</span>
            <span className="panel__meta">
              {counts.directUsers} {t('admin.bu.directUsers')} · {counts.directRisks}{' '}
              {t('admin.bu.directRisks')} · {counts.descendants} {t('admin.bu.descendants')}
            </span>
          </div>

          <span className="bu-tree__status">
            {unit.active ? t('admin.active') : t('admin.inactive')}
          </span>

          <div className="bu-tree__actions">
            <button
              type="button"
              onClick={() => {
                setIsNew(false)
                setIssues([])
                setDraft({ ...unit })
              }}
            >
              {t('admin.edit')}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsNew(true)
                setIssues([])
                setDraft(blankUnit(`bu_${Date.now().toString(36)}`, unit.id))
              }}
            >
              {t('admin.bu.addChild')}
            </button>
            <button type="button" onClick={() => void toggleActive(unit)}>
              {unit.active ? t('admin.deactivate') : t('admin.activate')}
            </button>
          </div>
        </div>

        {children.length > 0 && !isCollapsed ? (
          <ul className="bu-tree__children">{children.map((child) => renderNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    )
  }

  /** A unit may not be reparented under itself or any of its descendants. */
  const parentOptions = draft
    ? units.filter((unit) => isNew || !descendantIds(units, draft.id).includes(unit.id))
    : []

  return (
    <section aria-labelledby="bu-title">
      <div className="admin-section__header">
        <h2 id="bu-title">{t('admin.section.businessUnits')}</h2>
        <button
          type="button"
          onClick={() => {
            setIsNew(true)
            setIssues([])
            setDraft(blankUnit(`bu_${Date.now().toString(36)}`, null))
          }}
        >
          {t('admin.bu.addRoot')}
        </button>
      </div>

      <ul className="bu-tree">{childrenOf(null).map((unit) => renderNode(unit, 0))}</ul>

      {draft ? (
        <div className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="bu-dialog-title">
          <h3 id="bu-dialog-title">{t(isNew ? 'admin.bu.addTitle' : 'admin.bu.editTitle')}</h3>

          {issues.length > 0 ? (
            <ul className="admin-errors" role="alert">
              {issues.map((issue) => (
                <li key={`${issue.field}-${issue.messageKey}`}>{t(issue.messageKey as TranslationKey)}</li>
              ))}
            </ul>
          ) : null}

          <div className="admin-form">
            <label>
              <span>{t('admin.bu.code')}</span>
              <input
                value={draft.code}
                aria-invalid={issues.some((issue) => issue.field === 'code')}
                onChange={(event) => {
                  setDraft({ ...draft, code: event.target.value })
                }}
              />
            </label>
            <BilingualField
              labelEn={t('admin.bu.nameEn')}
              labelKa={t('admin.bu.nameKa')}
              valueEn={draft.nameEn}
              valueKa={draft.nameKa}
              invalid={issues.some((issue) => issue.field === 'nameEn')}
              onChangeEn={(value) => {
                setDraft({ ...draft, nameEn: value })
              }}
              onChangeKa={(value) => {
                setDraft({ ...draft, nameKa: value })
              }}
            />
            <label>
              <span>{t('admin.bu.parent')}</span>
              <select
                value={draft.parentId ?? ''}
                aria-invalid={issues.some((issue) => issue.field === 'parentId')}
                onChange={(event) => {
                  setDraft({ ...draft, parentId: event.target.value === '' ? null : event.target.value })
                }}
              >
                <option value="">{t('admin.bu.noParent')}</option>
                {parentOptions.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {hierarchyPath(units, unit.id, language)}
                  </option>
                ))}
              </select>
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
