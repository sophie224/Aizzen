import { useMemo, useState } from 'react'
import { useAppData } from '../../data/app-data-context.ts'
import { canCreateRisk, visibleRisks } from '../../domain/permissions/index.ts'
import {
  buildRegisterIndex,
  DEFAULT_SORT,
  EMPTY_QUERY,
  isQueryActive,
  queryRegister,
  toggleSort,
} from '../../domain/register/index.ts'
import {
  DEFAULT_VISIBLE_COLUMNS,
  reconcileVisibleColumns,
  selectableColumns,
} from '../../domain/register/columns.ts'
import { buildExportRows, toCsv, toSpreadsheetXml } from '../../domain/export/index.ts'
import type { RegisterViewMode, Risk, RiskFilters, SortState } from '../../domain/types/index.ts'
import { useTranslation } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { RiskEditorModal } from '../risk-editor/risk-editor-modal.tsx'
import { RegisterTable } from './register-table.tsx'
import { RegisterToolbar } from './register-toolbar.tsx'
import './register.css'

/*
 * Risk Register (ARCHITECTURE.md §8.2).
 *
 * The pipeline is deliberately ordered and one-directional:
 *
 *   visibleRisks(currentUser)  ->  search  ->  filters  ->  sort
 *
 * Visibility is applied FIRST and never re-widened, which is what guarantees a
 * hidden risk cannot be reached by any search term or filter combination.
 */
export function RegisterPage() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const { context } = useCurrentUser()

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<RiskFilters>({})
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
  const [viewMode, setViewMode] = useState<RegisterViewMode>('detailed')
  const [visibleColumns, setVisibleColumns] = useState<string[]>([...DEFAULT_VISIBLE_COLUMNS])
  // null = closed. Opening clones the record; the editor never mutates state.
  const [editing, setEditing] = useState<{ risk: Risk | null } | null>(null)

  const columns = useMemo(
    () => selectableColumns(state?.customAttributes ?? [], language),
    [state?.customAttributes, language],
  )

  const index = useMemo(() => {
    if (!state) return null
    return buildRegisterIndex({
      categories: state.categories,
      businessUnits: state.businessUnits,
      users: state.users,
      matrix: state.matrix,
      language,
    })
  }, [state, language])

  // Gate 4 first: everything downstream operates on this set only.
  const scoped = useMemo(
    () => (state ? visibleRisks(context, state.risks) : []),
    [state, context],
  )

  const results = useMemo(() => {
    if (!state || !index) return []
    return queryRegister(scoped, { search, filters, sort }, index, state.businessUnits, state.matrix)
  }, [state, index, scoped, search, filters, sort])

  if (!state || !index) return null

  /*
   * Export covers the CURRENT filtered dataset, which is already narrowed to
   * the user's visible records — never the whole register
   * (ARCHITECTURE.md §4.2).
   */
  const download = (filename: string, text: string, mime: string) => {
    if (typeof URL.createObjectURL !== 'function') return
    const url = URL.createObjectURL(new Blob([text], { type: mime }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const exportRows = () =>
    buildExportRows(results, {
      categories: state.categories,
      businessUnits: state.businessUnits,
      users: state.users,
      customAttributes: state.customAttributes,
      matrix: state.matrix,
      language,
    })

  const reconciled = reconcileVisibleColumns(visibleColumns, columns)
  const queryActive = isQueryActive({ search, filters, sort })
  const showCreate = canCreateRisk(context)

  return (
    <section aria-labelledby="register-title">
      <div className="register-header">
        <h1 id="register-title">{t('page.register.title')}</h1>
        {/* Only users who may actually create a risk see the control. */}
        <div className="register-header__actions">
          <button
            type="button"
            onClick={() => {
              download('ERM-Risk-Register.csv', toCsv(exportRows()), 'text/csv;charset=utf-8')
            }}
          >
            {t('export.csv')}
          </button>
          <button
            type="button"
            onClick={() => {
              download('ERM-Risk-Register.xls', toSpreadsheetXml(exportRows()), 'application/vnd.ms-excel')
            }}
          >
            {t('export.excel')}
          </button>

          {showCreate ? (
            <button
              type="button"
              className="register-header__create"
              onClick={() => {
                setEditing({ risk: null })
              }}
            >
              {t('register.newRisk')}
            </button>
          ) : null}
        </div>
      </div>

      <RegisterToolbar
        search={search}
        onSearchChange={setSearch}
        filters={filters}
        onFiltersChange={setFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        columns={columns}
        visibleColumns={reconciled}
        onVisibleColumnsChange={setVisibleColumns}
        categories={state.categories}
        businessUnits={state.businessUnits}
        language={language}
      />

      <p className="register-count" role="status" aria-live="polite">
        {results.length} {t('register.count')}
      </p>

      {/*
       * Three distinct states. An empty scope is not the same as a filter that
       * matched nothing, and conflating them would tell a Risk Owner with no
       * assignments to "clear filters" they never set.
       */}
      {scoped.length === 0 ? (
        <div className="panel panel--notice">
          <h2>{t('register.empty.title')}</h2>
          <p>{t('register.empty.body')}</p>
        </div>
      ) : results.length === 0 ? (
        <div className="panel panel--notice">
          <h2>{t('register.noResults.title')}</h2>
          <p>{t('register.noResults.body')}</p>
          <button
            type="button"
            onClick={() => {
              setSearch(EMPTY_QUERY.search)
              setFilters({})
            }}
          >
            {t('register.filter.clear')}
          </button>
        </div>
      ) : (
        <RegisterTable
          risks={results}
          columns={columns}
          visibleColumns={reconciled}
          viewMode={viewMode}
          sort={sort}
          onSortChange={(field) => {
            setSort((current) => toggleSort(current, field))
          }}
          index={index}
          matrix={state.matrix}
        />
      )}

      {editing ? (
        <RiskEditorModal
          risk={editing.risk}
          onClose={() => {
            setEditing(null)
          }}
        />
      ) : null}

      {queryActive && results.length > 0 ? (
        <button
          type="button"
          className="register-clear"
          onClick={() => {
            setSearch('')
            setFilters({})
          }}
        >
          {t('register.filter.clear')}
        </button>
      ) : null}
    </section>
  )
}
