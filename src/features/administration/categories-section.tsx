import { useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  categoryUsageCount,
  validateCategory,
  type ValidationIssue,
} from '../../domain/administration/index.ts'
import type { Category } from '../../domain/types/index.ts'
import { useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'

/*
 * Risk Categories (ARCHITECTURE.md §8.5).
 *
 * A used category is deactivated, never deleted: old risks keep the reference
 * and historical reporting still resolves the label.
 */

function blankCategory(id: string): Category {
  return { id, level1En: '', level1Ka: '', level2En: '', level2Ka: '', active: true }
}

export function CategoriesSection() {
  const { t } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user } = useCurrentUser()

  const [draft, setDraft] = useState<Category | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [issues, setIssues] = useState<ValidationIssue[]>([])

  if (!state || !user) return null

  const issueFor = (field: string) => issues.some((issue) => issue.field === field)

  const save = async () => {
    if (!draft) return

    const found = validateCategory(draft)
    if (found.length > 0) {
      setIssues(found)
      return
    }
    setIssues([])

    await store.update({
      mutate: (next) => {
        const index = next.categories.findIndex((candidate) => candidate.id === draft.id)
        if (index >= 0) next.categories[index] = draft
        else next.categories.push(draft)
      },
      audit: {
        actorId: user.id,
        action: isNew ? 'category.created' : 'category.updated',
        entityType: 'Category',
        entityId: draft.id,
        summary: `${draft.level1En} / ${draft.level2En}`,
      },
    })
    setDraft(null)
  }

  const toggleActive = async (category: Category) => {
    await store.update({
      mutate: (next) => {
        const target = next.categories.find((candidate) => candidate.id === category.id)
        if (target) target.active = !target.active
      },
      audit: {
        actorId: user.id,
        action: 'category.status_changed',
        entityType: 'Category',
        entityId: category.id,
        summary: `${category.level2En} ${category.active ? 'deactivated' : 'activated'}`,
      },
    })
  }

  return (
    <section aria-labelledby="categories-title">
      <div className="admin-section__header">
        <h2 id="categories-title">{t('admin.section.categories')}</h2>
        <button
          type="button"
          onClick={() => {
            setIsNew(true)
            setIssues([])
            setDraft(blankCategory(`cat_${Date.now().toString(36)}`))
          }}
        >
          {t('admin.category.addTitle')}
        </button>
      </div>

      <div className="scroll-x">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t('admin.category.level1En')}</th>
              <th scope="col">{t('admin.category.level2En')}</th>
              <th scope="col">{t('register.column.status')}</th>
              <th scope="col">{t('admin.inUse')}</th>
              <th scope="col"><span className="visually-hidden">{t('admin.edit')}</span></th>
            </tr>
          </thead>
          <tbody>
            {state.categories.map((category) => {
              const usage = categoryUsageCount(state.risks, category.id)
              return (
                <tr key={category.id}>
                  <td>{category.level1En}</td>
                  <td>{category.level2En}</td>
                  <td>{category.active ? t('admin.active') : t('admin.inactive')}</td>
                  <td>{usage} {t('admin.records')}</td>
                  <td className="admin-table__actions">
                    <button
                      type="button"
                      onClick={() => {
                        setIsNew(false)
                        setIssues([])
                        setDraft({ ...category })
                      }}
                    >
                      {t('admin.edit')}
                    </button>
                    <button type="button" onClick={() => void toggleActive(category)}>
                      {category.active ? t('admin.deactivate') : t('admin.activate')}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {draft ? (
        <div className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="category-dialog-title">
          <h3 id="category-dialog-title">
            {t(isNew ? 'admin.category.addTitle' : 'admin.category.editTitle')}
          </h3>

          {issues.length > 0 ? (
            <ul className="admin-errors" role="alert">
              {issues.map((issue) => (
                <li key={issue.field}>{t(issue.messageKey as TranslationKey)}</li>
              ))}
            </ul>
          ) : null}

          <div className="admin-form">
            {([
              ['level1En', 'admin.category.level1En'],
              ['level1Ka', 'admin.category.level1Ka'],
              ['level2En', 'admin.category.level2En'],
              ['level2Ka', 'admin.category.level2Ka'],
            ] as const).map(([field, labelKey]) => (
              <label key={field}>
                <span>{t(labelKey)}</span>
                <input
                  value={draft[field]}
                  aria-invalid={issueFor(field)}
                  onChange={(event) => {
                    setDraft({ ...draft, [field]: event.target.value })
                  }}
                />
              </label>
            ))}
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
