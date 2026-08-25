import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  canCreateControl,
  canEditControlRecord,
  isDeficiencyOverdue,
  scaleLabel,
  scaleLevels,
  visibleControls,
  visibleDeficiencies,
} from '../../domain/controls/index.ts'
import { pickLanguage, useTranslation } from '../../i18n/index.ts'
import type { ControlDeficiency } from '../../domain/types/index.ts'
import { EmptyState } from '../../ui/empty-state.tsx'
import { IconPlus } from '../../ui/icons.tsx'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { DeficiencyEditorModal } from './deficiency-editor-modal.tsx'
import { LevelSelect } from './level-select.tsx'
import { updateDeficiency } from './mutations.ts'
import { ScaleChip } from './scale-chip.tsx'
import { TableSkeleton } from './register-table-states.tsx'
import { useDebounced } from './use-debounced.ts'
import { useColumnOrder } from './use-column-order.ts'
import './controls.css'

/*
 * Control Deficiency Register (CR-2026, FR-CD-01…07).
 *
 * Sits under the Control Register in the navigation, and scopes exactly as the
 * Control Register does: a finding is visible only to users of the mapped
 * control's organisational unit (FR-CD-07).
 *
 * `?control=<id>` filters to one control, which is how the Control Register's
 * findings count drills through.
 */

export function DeficiencyRegisterPage() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user, context } = useCurrentUser()
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [classificationFilter, setClassificationFilter] = useState('')
  const [editing, setEditing] = useState<{ deficiency: ControlDeficiency | null } | null>(null)
  const [lastSaved, setLastSaved] = useState('')

  const { columns, move, reset, reordered } = useColumnOrder('deficiency', user?.id ?? null, language)
  const settledSearch = useDebounced(search)

  const controlFilter = params.get('control') ?? ''

  const visible = useMemo(
    () => (state ? visibleDeficiencies(context, state.controlDeficiencies) : []),
    [state, context],
  )

  const controlsById = useMemo(() => {
    const reachable = state ? visibleControls(context, state.controls) : []
    return new Map(reachable.map((control) => [control.id, control]))
  }, [state, context])

  const rows = useMemo(() => {
    const needle = settledSearch.trim().toLowerCase()

    return visible
      .filter((deficiency) => {
        if (controlFilter !== '' && deficiency.controlId !== controlFilter) return false
        if (classificationFilter !== '' && deficiency.classification !== classificationFilter) return false
        if (needle === '') return true

        const control = controlsById.get(deficiency.controlId)
        return [deficiency.ref, deficiency.description, control?.ref ?? '', control?.name ?? '']
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }))
  }, [visible, settledSearch, classificationFilter, controlFilter, controlsById])

  if (!state || !user) {
    return (
      <section aria-labelledby="deficiencies-title" className="control-register">
        <header className="control-register__head">
          <h1 id="deficiencies-title">{t('page.deficiencies.title')}</h1>
        </header>
        <TableSkeleton columns={5} />
      </section>
    )
  }

  const config = state.controlConfig
  const today = new Date().toISOString().slice(0, 10)
  const canCreate = canCreateControl(context)
  const filteredControl = controlFilter === '' ? null : controlsById.get(controlFilter) ?? null
  const filtered = settledSearch !== '' || classificationFilter !== '' || controlFilter !== ''

  /*
   * Classification is edited in place for the same reason effectiveness is:
   * it is triaged from the list, not from inside the record. One field
   * replaced, everything else restored from the stored finding.
   */
  const changeClassification = async (deficiency: ControlDeficiency, next: string) => {
    await updateDeficiency(
      store,
      user.id,
      deficiency.id,
      {
        businessUnitId: deficiency.businessUnitId,
        controlId: deficiency.controlId,
        description: deficiency.description,
        classification: next,
        remediationOwnerId: deficiency.remediationOwnerId,
        remediationDescription: deficiency.remediationDescription,
        targetDate: deficiency.targetDate,
        custom: deficiency.custom,
      },
      ['classification'],
    )

    setLastSaved(
      `${deficiency.ref} · ${t('deficiency.column.classification')}: ${scaleLabel(
        config,
        'classifications',
        next,
        language,
      )}`,
    )
  }

  const cell = (deficiency: ControlDeficiency, columnId: string) => {
    switch (columnId) {
      case 'ref':
        return <span className="code">{deficiency.ref}</span>
      case 'control': {
        const control = controlsById.get(deficiency.controlId)
        return control ? (
          <button
            type="button"
            className="control-table__title"
            onClick={() => {
              setEditing({ deficiency })
            }}
          >
            <span className="code">{control.ref}</span> {control.name}
          </button>
        ) : (
          '—'
        )
      }
      case 'businessUnit':
        return state.businessUnits.find((unit) => unit.id === deficiency.businessUnitId)?.code ?? '—'
      case 'description':
        return <span className="control-table__objective">{deficiency.description}</span>
      case 'classification': {
        const control = controlsById.get(deficiency.controlId)
        const editable = control !== undefined && canEditControlRecord(context, control)

        return editable ? (
          <LevelSelect
            config={config}
            scale="classifications"
            value={deficiency.classification}
            language={language}
            label={`${t('deficiency.column.classification')}: ${deficiency.ref}`}
            onChange={(next) => changeClassification(deficiency, next)}
          />
        ) : (
          <ScaleChip
            config={config}
            scale="classifications"
            value={deficiency.classification}
            language={language}
          />
        )
      }
      case 'remediationOwner':
        return state.users.find((entry) => entry.id === deficiency.remediationOwnerId)?.name ?? '—'
      case 'remediation':
        return <span className="control-table__objective">{deficiency.remediationDescription}</span>
      case 'targetDate':
        if (deficiency.targetDate === '') return '—'
        return (
          <span className="control-target-date">
            {deficiency.targetDate}
            {/* Overdue is derived at render time, never stored. */}
            {isDeficiencyOverdue(deficiency, today) ? (
              <span className="control-badge control-badge--overdue">{t('deficiency.overdue')}</span>
            ) : null}
          </span>
        )
      default: {
        const raw = deficiency.custom[columnId]
        return raw === undefined || raw === '' ? '—' : String(raw)
      }
    }
  }

  return (
    <section aria-labelledby="deficiencies-title" className="control-register">
      <header className="control-register__head">
        <div>
          <h1 id="deficiencies-title">{t('page.deficiencies.title')}</h1>
          <p className="panel__meta">
            {rows.length} {t('deficiency.count')}
            {reordered ? (
              <>
                {' · '}
                <button type="button" className="link-button" onClick={() => void reset()}>
                  {t('controls.reorderReset')}
                </button>
              </>
            ) : null}
          </p>
          <p className="control-register__saved" role="status">
            {lastSaved === '' ? '' : `${t('controls.inline.saved')} ${lastSaved}`}
          </p>
        </div>

        {canCreate ? (
          <div className="control-register__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setEditing({ deficiency: null })
              }}
            >
              <IconPlus />
              {t('deficiency.add')}
            </button>
          </div>
        ) : null}
      </header>

      <div className="control-filters register-filters">
        <label className="control-filters__search">
          <span className="visually-hidden">{t('controls.search')}</span>
          <input
            type="search"
            value={search}
            placeholder={t('deficiency.editor.controlSearch')}
            onChange={(event) => {
              setSearch(event.target.value)
            }}
          />
        </label>

        <label>
          <span className="visually-hidden">{t('deficiency.column.classification')}</span>
          <select
            value={classificationFilter}
            onChange={(event) => {
              setClassificationFilter(event.target.value)
            }}
          >
            <option value="">
              {t('deficiency.column.classification')}: {t('controls.filter.all')}
            </option>
            {scaleLevels(config, 'classifications').map((level) => (
              <option key={level.key} value={level.key}>
                {pickLanguage(level.labelEn, level.labelKa, language)}
              </option>
            ))}
          </select>
        </label>

        {filteredControl ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              const next = new URLSearchParams(params)
              next.delete('control')
              setParams(next, { replace: true })
            }}
          >
            {filteredControl.ref} ✕
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title={t('controls.empty.filteredTitle')}
            body={t('controls.empty.filtered')}
            action={
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSearch('')
                  setClassificationFilter('')
                  const next = new URLSearchParams(params)
                  next.delete('control')
                  setParams(next, { replace: true })
                }}
              >
                {t('controls.empty.clearFilters')}
              </button>
            }
          />
        ) : (
          <EmptyState title={t('deficiency.empty.title')} body={t('deficiency.empty.body')} />
        )
      ) : (
        <>
          <p className="panel__meta control-register__hint">{t('controls.reorderHint')}</p>
          <div className="scroll-x">
            <table className="control-table">
              <caption className="visually-hidden">{t('page.deficiencies.title')}</caption>
              <thead>
                <tr>
                  {columns.map((column) => {
                    const label = column.customLabel ?? (column.labelKey ? t(column.labelKey) : column.id)
                    return (
                      <th key={column.id} scope="col">
                        {label}
                        <span className="control-table__move">
                          <button
                            type="button"
                            aria-label={`${t('controls.moveLeft')}: ${label}`}
                            title={t('controls.moveLeft')}
                            onClick={() => {
                              const index = columns.findIndex((entry) => entry.id === column.id)
                              if (index > 0) void move(column.id, columns[index - 1].id)
                            }}
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            aria-label={`${t('controls.moveRight')}: ${label}`}
                            title={t('controls.moveRight')}
                            onClick={() => {
                              const index = columns.findIndex((entry) => entry.id === column.id)
                              if (index < columns.length - 1) void move(column.id, columns[index + 1].id)
                            }}
                          >
                            ›
                          </button>
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((deficiency) => (
                  <tr key={deficiency.id}>
                    {columns.map((column) => (
                      <td key={column.id}>{cell(deficiency, column.id)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing ? (
        <DeficiencyEditorModal
          deficiency={editing.deficiency}
          defaultControlId={controlFilter}
          onClose={() => {
            setEditing(null)
          }}
        />
      ) : null}
    </section>
  )
}
