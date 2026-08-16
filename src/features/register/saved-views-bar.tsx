import { useId, useState } from 'react'
import type { SavedView } from '../../domain/types/index.ts'
import { useTranslation } from '../../i18n/index.ts'
import { IconPlus, IconStar, IconTrash } from '../../ui/icons.tsx'

/*
 * Saved views bar (ARCHITECTURE.md §8.2).
 *
 * Shows the result count, the current user's saved views and the Save view
 * control. Each view carries a star (make/clear default) and a trash control.
 * Saved views are private: this component only ever receives the signed-in
 * user's own views.
 */

export interface SavedViewsBarProps {
  resultCount: number
  views: readonly SavedView[]
  activeViewId: string | null
  canSave: boolean
  onApply: (view: SavedView) => void
  onToggleDefault: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onSave: (name: string) => void
}

export function SavedViewsBar(props: SavedViewsBarProps) {
  const { t } = useTranslation()
  const nameId = useId()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const submit = () => {
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    props.onSave(trimmed)
    setName('')
    setNaming(false)
  }

  return (
    <div className="saved-views">
      <p className="saved-views__count" role="status" aria-live="polite">
        <strong>{props.resultCount}</strong> {t('register.results')}
      </p>

      <ul className="saved-views__list" aria-label={t('register.views.label')}>
        {props.views.map((view) => (
          <li
            key={view.id}
            className={view.id === props.activeViewId ? 'saved-views__item is-active' : 'saved-views__item'}
          >
            <button
              type="button"
              className="saved-views__apply"
              onClick={() => {
                props.onApply(view)
              }}
            >
              {view.name}
            </button>
            <button
              type="button"
              className={view.isDefault ? 'btn btn--icon is-default' : 'btn btn--icon'}
              aria-pressed={view.isDefault}
              aria-label={`${view.isDefault ? t('register.views.isDefault') : t('register.views.setDefault')}: ${view.name}`}
              title={view.isDefault ? t('register.views.isDefault') : t('register.views.setDefault')}
              onClick={() => {
                props.onToggleDefault(view)
              }}
            >
              <IconStar filled={view.isDefault} size={14} />
            </button>
            <button
              type="button"
              className="btn btn--icon btn--danger"
              aria-label={`${t('register.views.delete')}: ${view.name}`}
              title={t('register.views.delete')}
              onClick={() => {
                props.onDelete(view)
              }}
            >
              <IconTrash size={14} />
            </button>
          </li>
        ))}
        {props.views.length === 0 ? (
          <li className="saved-views__empty">{t('register.views.none')}</li>
        ) : null}
      </ul>

      {props.canSave ? (
        naming ? (
          <div className="saved-views__save">
            <label htmlFor={nameId} className="visually-hidden">
              {t('register.views.namePrompt')}
            </label>
            <input
              id={nameId}
              value={name}
              placeholder={t('register.views.namePrompt')}
              autoFocus
              onChange={(event) => {
                setName(event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
                if (event.key === 'Escape') setNaming(false)
              }}
            />
            <button type="button" className="btn btn--primary" onClick={submit}>
              {t('action.save')}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              aria-label={t('register.views.cancel')}
              onClick={() => {
                setNaming(false)
                setName('')
              }}
            >
              {t('action.cancel')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn--ghost saved-views__trigger"
            onClick={() => {
              setNaming(true)
            }}
          >
            <IconPlus size={12} />
            {t('register.views.save')}
          </button>
        )
      ) : null}
    </div>
  )
}
