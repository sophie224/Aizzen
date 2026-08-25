import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  canCreateControl,
  canEditControlRecord,
  deficienciesForControl,
  matchesControlSearch,
  scaleLabel,
  scaleLevels,
  toCsv,
  visibleControls,
} from '../../domain/controls/index.ts'
import { pickLanguage, useTranslation } from '../../i18n/index.ts'
import type { RegisterControl } from '../../domain/types/index.ts'
import { EmptyState } from '../../ui/empty-state.tsx'
import { IconDownload, IconList, IconPlus } from '../../ui/icons.tsx'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { BulkUploadDialog } from './bulk-upload-dialog.tsx'
import { ControlEditorModal } from './control-editor-modal.tsx'
import { FrameworkImportDialog } from './framework-import-dialog.tsx'
import { LevelSelect } from './level-select.tsx'
import { updateControl } from './mutations.ts'
import { ScaleChip } from './scale-chip.tsx'
import { TableSkeleton } from './register-table-states.tsx'
import { useDebounced } from './use-debounced.ts'
import { useColumnOrder } from './use-column-order.ts'
import './controls.css'

/*
 * Control Register (CR-2026, FR-CR-01…11).
 *
 * The pipeline mirrors the Risk Register's, deliberately:
 *
 *   visibleControls(currentUser)  ->  search  ->  filters  ->  sort
 *
 * Visibility is applied FIRST and never re-widened, so a control in another
 * organisational unit cannot be reached through any search term or filter
 * (FR-CR-08, QA-14, SEC-01).
 */

type SortField = 'ref' | 'name' | 'businessUnit' | 'owner' | 'effectiveness' | 'maturity' | 'assurance' | 'source'

interface Sort {
  field: SortField
  direction: 'asc' | 'desc'
}

export function ControlRegisterPage() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user, context } = useCurrentUser()

  const [search, setSearch] = useState('')
  /*
   * The last saved change, announced politely (§8.4) and left on screen as the
   * quiet "saved" confirmation §10 asks for — not a toast that vanishes.
   */
  const [lastSaved, setLastSaved] = useState('')
  const [unitFilter, setUnitFilter] = useState('')
  const [effectivenessFilter, setEffectivenessFilter] = useState('')
  const [assuranceFilter, setAssuranceFilter] = useState('')
  const [sort, setSort] = useState<Sort>({ field: 'ref', direction: 'asc' })
  const [editing, setEditing] = useState<{ control: RegisterControl | null } | null>(null)
  const [importing, setImporting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragged, setDragged] = useState<string | null>(null)

  const { columns, move, reset, reordered } = useColumnOrder('control', user?.id ?? null, language)
  // The input stays instant; only the filtering is debounced (§9.4).
  const settledSearch = useDebounced(search)

  const visible = useMemo(
    () => (state ? visibleControls(context, state.controls) : []),
    [state, context],
  )

  const rows = useMemo(() => {
    const filtered = visible.filter((control) => {
      if (!matchesControlSearch(control, settledSearch)) return false
      if (unitFilter !== '' && control.businessUnitId !== unitFilter) return false
      if (effectivenessFilter !== '' && control.effectiveness !== effectivenessFilter) return false
      if (assuranceFilter !== '' && control.assurance !== assuranceFilter) return false
      return true
    })

    const unitCode = (id: string) =>
      state?.businessUnits.find((unit) => unit.id === id)?.code ?? ''
    const ownerName = (id: string) => state?.users.find((entry) => entry.id === id)?.name ?? ''

    const value = (control: RegisterControl): string => {
      switch (sort.field) {
        case 'name':
          return control.name
        case 'businessUnit':
          return unitCode(control.businessUnitId)
        case 'owner':
          return ownerName(control.ownerId)
        case 'source':
          return control.source
        case 'effectiveness':
        case 'maturity':
        case 'assurance': {
          // Sorts by configured order, not alphabetically, so a scale reads
          // worst-to-best exactly as an administrator arranged it.
          const scale = sort.field
          const index = state
            ? scaleLevels(state.controlConfig, scale).findIndex(
                (level) => level.key === control[scale],
              )
            : 0
          return String(index).padStart(3, '0')
        }
        default:
          return control.ref
      }
    }

    return [...filtered].sort((a, b) => {
      const compared = value(a).localeCompare(value(b), undefined, { numeric: true })
      return sort.direction === 'asc' ? compared : -compared
    })
  }, [visible, settledSearch, unitFilter, effectivenessFilter, assuranceFilter, sort, state])

  /*
   * Loading is a state, not a blank screen (§9.3): skeleton rows of the real
   * height stand in until AppState arrives, so nothing shifts when it does.
   */
  if (!state || !user) {
    return (
      <section aria-labelledby="controls-title" className="control-register">
        <header className="control-register__head">
          <h1 id="controls-title">{t('page.controls.title')}</h1>
        </header>
        <TableSkeleton columns={6} />
      </section>
    )
  }

  const config = state.controlConfig
  const scopedUnits = state.businessUnits.filter((unit) =>
    visible.some((control) => control.businessUnitId === unit.id),
  )
  const canCreate = canCreateControl(context)
  const defaultUnitId = context.businessUnits.find((unit) => unit.active)?.id ?? ''

  /*
   * Inline scale edit (§9.4): the value is changed where it is read.
   *
   * The draft is rebuilt from the stored record with exactly one field
   * replaced — the same field-level discipline the risk editor uses, so a
   * grid edit can never carry a stale or crafted value into another field.
   * Permission is checked per record, and the write goes through the one
   * audited mutation path.
   */
  const changeLevel = async (
    control: RegisterControl,
    scale: 'effectiveness' | 'maturity' | 'assurance',
    next: string,
  ) => {
    await updateControl(
      store,
      user.id,
      control.id,
      {
        businessUnitId: control.businessUnitId,
        name: control.name,
        objective: control.objective,
        ownerId: control.ownerId,
        effectiveness: control.effectiveness,
        maturity: control.maturity,
        assurance: control.assurance,
        evidence: control.evidence,
        custom: control.custom,
        [scale]: next,
      },
      [scale],
    )

    setLastSaved(
      `${control.ref} · ${t(`controls.column.${scale}`)}: ${scaleLabel(config, scale, next, language)}`,
    )
  }

  const cell = (control: RegisterControl, columnId: string) => {
    switch (columnId) {
      case 'ref':
        return <span className="code">{control.ref}</span>
      case 'name':
        return (
          <button
            type="button"
            className="control-table__title"
            onClick={() => {
              setEditing({ control })
            }}
          >
            {control.name}
          </button>
        )
      case 'objective':
        return <span className="control-table__objective">{control.objective}</span>
      case 'businessUnit': {
        const unit = state.businessUnits.find((entry) => entry.id === control.businessUnitId)
        return unit ? `${unit.code}` : '—'
      }
      case 'owner':
        return state.users.find((entry) => entry.id === control.ownerId)?.name ?? '—'
      case 'effectiveness':
      case 'maturity':
      case 'assurance': {
        const scale = columnId
        if (!canEditControlRecord(context, control)) {
          return <ScaleChip config={config} scale={scale} value={control[scale]} language={language} />
        }

        return (
          <LevelSelect
            config={config}
            scale={scale}
            value={control[scale]}
            language={language}
            label={`${t(`controls.column.${scale}`)}: ${control.ref} ${control.name}`}
            onChange={(next) => changeLevel(control, scale, next)}
          />
        )
      }
      case 'evidence':
        return (
          <span className="control-table__count">
            {control.evidence.length > 0 ? control.evidence.length : '—'}
          </span>
        )
      case 'deficiencies': {
        const count = deficienciesForControl(state.controlDeficiencies, control.id).length
        return (
          <span className="control-table__count">
            {count === 0 ? '—' : <Link to={`/control-deficiencies?control=${control.id}`}>{count}</Link>}
          </span>
        )
      }
      case 'source':
        return control.source === 'Framework'
          ? `${control.frameworkId ?? ''} ${control.frameworkVersion}`.trim()
          : control.source
      default: {
        const raw = control.custom[columnId]
        return raw === undefined || raw === '' ? '—' : String(raw)
      }
    }
  }

  const exportCsv = () => {
    const header = columns.map(
      (column) => column.customLabel ?? (column.labelKey ? t(column.labelKey) : column.id),
    )
    const body = rows.map((control) =>
      columns.map((column) => {
        switch (column.id) {
          case 'ref':
            return control.ref
          case 'name':
            return control.name
          case 'objective':
            return control.objective
          case 'businessUnit':
            return state.businessUnits.find((unit) => unit.id === control.businessUnitId)?.code ?? ''
          case 'owner':
            return state.users.find((entry) => entry.id === control.ownerId)?.name ?? ''
          case 'effectiveness':
          case 'maturity':
          case 'assurance':
            return scaleLabel(config, column.id, control[column.id], language)
          case 'evidence':
            return String(control.evidence.length)
          case 'deficiencies':
            return String(deficienciesForControl(state.controlDeficiencies, control.id).length)
          case 'source':
            return control.source
          default:
            return String(control.custom[column.id] ?? '')
        }
      }),
    )

    // `toCsv` neutralises anything a spreadsheet would evaluate (SEC-04).
    const blob = new Blob([toCsv([header, ...body])], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'control-register.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section aria-labelledby="controls-title" className="control-register">
      <header className="control-register__head">
        <div>
          <h1 id="controls-title">{t('page.controls.title')}</h1>
          <p className="panel__meta">
            {rows.length} {t('controls.count')}
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

        <div className="control-register__actions">
          <button type="button" className="btn" onClick={exportCsv}>
            <IconDownload />
            {t('controls.export')}
          </button>
          {canCreate ? (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setUploading(true)
                }}
              >
                <IconList />
                {t('controls.upload')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setImporting(true)
                }}
              >
                <IconPlus />
                {t('controls.import')}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setEditing({ control: null })
                }}
              >
                <IconPlus />
                {t('controls.add')}
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="control-filters register-filters">
        <label className="control-filters__search">
          <span className="visually-hidden">{t('controls.search')}</span>
          <input
            type="search"
            value={search}
            placeholder={t('controls.searchPlaceholder')}
            onChange={(event) => {
              setSearch(event.target.value)
            }}
          />
        </label>

        <label>
          <span className="visually-hidden">{t('controls.filter.businessUnit')}</span>
          <select
            value={unitFilter}
            onChange={(event) => {
              setUnitFilter(event.target.value)
            }}
          >
            <option value="">
              {t('controls.filter.businessUnit')}: {t('controls.filter.all')}
            </option>
            {scopedUnits.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.code} · {pickLanguage(unit.nameEn, unit.nameKa, language)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="visually-hidden">{t('controls.filter.effectiveness')}</span>
          <select
            value={effectivenessFilter}
            onChange={(event) => {
              setEffectivenessFilter(event.target.value)
            }}
          >
            <option value="">
              {t('controls.filter.effectiveness')}: {t('controls.filter.all')}
            </option>
            {scaleLevels(config, 'effectiveness').map((level) => (
              <option key={level.key} value={level.key}>
                {pickLanguage(level.labelEn, level.labelKa, language)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="visually-hidden">{t('controls.filter.assurance')}</span>
          <select
            value={assuranceFilter}
            onChange={(event) => {
              setAssuranceFilter(event.target.value)
            }}
          >
            <option value="">
              {t('controls.filter.assurance')}: {t('controls.filter.all')}
            </option>
            {scaleLevels(config, 'assurance').map((level) => (
              <option key={level.key} value={level.key}>
                {pickLanguage(level.labelEn, level.labelKa, language)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        /*
         * Empty and filtered-empty are DIFFERENT states with different copy,
         * and the filtered one offers the way out of it (§9.3).
         */
        visible.length === 0 ? (
          <EmptyState title={t('controls.empty.title')} body={t('controls.empty.body')} />
        ) : (
          <EmptyState
            title={t('controls.empty.filteredTitle')}
            body={t('controls.empty.filtered')}
            action={
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSearch('')
                  setUnitFilter('')
                  setEffectivenessFilter('')
                  setAssuranceFilter('')
                }}
              >
                {t('controls.empty.clearFilters')}
              </button>
            }
          />
        )
      ) : (
        <>
          <p className="panel__meta control-register__hint">{t('controls.reorderHint')}</p>
          <div className="scroll-x">
            <table className="control-table">
              <caption className="visually-hidden">{t('page.controls.title')}</caption>
              <thead>
                <tr>
                  {columns.map((column) => {
                    const label = column.customLabel ?? (column.labelKey ? t(column.labelKey) : column.id)
                    const sortable = column.sortable
                    const active = sort.field === (column.id as SortField)

                    return (
                      <th
                        key={column.id}
                        scope="col"
                        draggable
                        aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                        className={dragged === column.id ? 'control-table__th--dragging' : undefined}
                        onDragStart={() => {
                          setDragged(column.id)
                        }}
                        onDragOver={(event) => {
                          event.preventDefault()
                        }}
                        onDrop={() => {
                          if (dragged && dragged !== column.id) void move(dragged, column.id)
                          setDragged(null)
                        }}
                        onDragEnd={() => {
                          setDragged(null)
                        }}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            className="control-table__sort"
                            data-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                            onClick={() => {
                              setSort((current) =>
                                current.field === (column.id as SortField)
                                  ? { field: current.field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
                                  : { field: column.id as SortField, direction: 'asc' },
                              )
                            }}
                          >
                            {label}
                          </button>
                        ) : (
                          label
                        )}
                        {/*
                         * Keyboard equivalent of the drag: reordering must not
                         * be reachable by pointer only.
                         */}
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
                {rows.map((control) => (
                  <tr key={control.id}>
                    {columns.map((column) => (
                      <td key={column.id}>{cell(control, column.id)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing ? (
        <ControlEditorModal
          control={editing.control}
          defaultBusinessUnitId={unitFilter || defaultUnitId}
          onClose={() => {
            setEditing(null)
          }}
        />
      ) : null}

      {importing ? (
        <FrameworkImportDialog
          onClose={() => {
            setImporting(false)
          }}
        />
      ) : null}

      {uploading ? (
        <BulkUploadDialog
          onClose={() => {
            setUploading(false)
          }}
        />
      ) : null}
    </section>
  )
}
