import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import { canCreateRisk, visibleRisks } from '../../domain/permissions/index.ts'
import {
  buildRegisterIndex,
  DEFAULT_SORT,
  EMPTY_QUERY,
  queryRegister,
  toggleSort,
} from '../../domain/register/index.ts'
import {
  DEFAULT_VISIBLE_COLUMNS,
  reconcileVisibleColumns,
  selectableColumns,
} from '../../domain/register/columns.ts'
import { filtersFromParams } from '../../domain/register/filter-params.ts'
import {
  applySavedView,
  createSavedView,
  defaultViewFor,
  deleteSavedView,
  setDefaultView,
  viewsForUser,
  type SavedViewConfiguration,
} from '../../domain/register/saved-views.ts'
import { buildExportRows, toCsv, toSpreadsheetXml } from '../../domain/export/index.ts'
import type { Risk, SavedView } from '../../domain/types/index.ts'
import { useTranslation } from '../../i18n/index.ts'
import { EmptyState } from '../../ui/empty-state.tsx'
import { IconDownload, IconList, IconPlus } from '../../ui/icons.tsx'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { RiskEditorModal } from '../risk-editor/risk-editor-modal.tsx'
import { RegisterTable } from './register-table.tsx'
import { RegisterToolbar } from './register-toolbar.tsx'
import { SavedViewsBar } from './saved-views-bar.tsx'
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

/** IDs are generated at the edge; the domain stays deterministic. */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** The working configuration plus the saved view it currently reflects. */
interface Selection {
  configuration: SavedViewConfiguration
  viewId: string | null
}

function defaultConfiguration(): SavedViewConfiguration {
  return {
    search: '',
    filters: {},
    sort: DEFAULT_SORT,
    visibleColumns: [...DEFAULT_VISIBLE_COLUMNS],
    // Compact is the target design's default: even row heights, one screenful.
    viewMode: 'compact',
  }
}

export function RegisterPage() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user, context } = useCurrentUser()

  /*
   * The working configuration is DERIVED, not synchronised.
   *
   * `selection` is null until the user touches something; until then the page
   * shows the user's default saved view, or the built-in defaults. Deriving it
   * rather than copying it into state in an effect keeps the default view from
   * causing a second render pass on every load.
   */
  const [selection, setSelection] = useState<Selection | null>(null)
  // null = closed. Opening clones the record; the editor never mutates state.
  const [editing, setEditing] = useState<{ risk: Risk | null } | null>(null)
  const [params] = useSearchParams()

  /*
   * Three sources, in precedence order (CR-004):
   *
   *   1. the user's own edits this session
   *   2. filters handed over in the URL — a dashboard drill-through or a
   *      shared link, which must win over a saved preference
   *   3. the user's default saved view, or the built-in defaults
   */
  const baseSelection = useMemo<Selection>(() => {
    const urlFilters = filtersFromParams(params)
    const search = params.get('search') ?? ''

    if (Object.keys(urlFilters).length > 0 || search.length > 0) {
      return {
        configuration: { ...defaultConfiguration(), filters: urlFilters, search },
        viewId: null,
      }
    }

    const preferred = state && user ? defaultViewFor(state.savedViews, user.id) : null
    return preferred
      ? { configuration: applySavedView(preferred), viewId: preferred.id }
      : { configuration: defaultConfiguration(), viewId: null }
  }, [state, user, params])

  const current = selection ?? baseSelection
  const { search, filters, sort, viewMode } = current.configuration
  const activeViewId = current.viewId

  /** Any edit to the working configuration detaches it from the saved view. */
  const change = (patch: Partial<SavedViewConfiguration>) => {
    setSelection({ configuration: { ...current.configuration, ...patch }, viewId: null })
  }

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
    return queryRegister(
      scoped,
      { search, filters, sort },
      index,
      state.businessUnits,
      state.matrix,
      new Date().toISOString().slice(0, 10),
    )
  }, [state, index, scoped, search, filters, sort])

  const savedViews = useMemo(
    () => (state && user ? viewsForUser(state.savedViews, user.id) : []),
    [state, user],
  )

  const applyView = (view: SavedView) => {
    setSelection({ configuration: applySavedView(view), viewId: view.id })
  }

  if (!state || !index || !user) return null

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

  const reconciled = reconcileVisibleColumns(current.configuration.visibleColumns, columns)
  const showCreate = canCreateRisk(context)
  const today = new Date().toISOString().slice(0, 10)

  // --- saved views: one mutation each, through the single transaction --------

  const saveCurrentView = async (name: string) => {
    const id = generateId('view')
    await store.update({
      mutate: (draft) => {
        draft.savedViews = createSavedView(draft.savedViews, {
          id,
          userId: user.id,
          name,
          configuration: { search, filters, sort, visibleColumns: reconciled, viewMode },
        })
      },
      audit: {
        actorId: user.id,
        action: 'savedView.created',
        entityType: 'SavedView',
        entityId: id,
        summary: name,
      },
    })
    setSelection({ configuration: { ...current.configuration, visibleColumns: reconciled }, viewId: id })
  }

  const toggleDefault = async (view: SavedView) => {
    await store.update({
      mutate: (draft) => {
        draft.savedViews = setDefaultView(draft.savedViews, user.id, view.id)
      },
      audit: {
        actorId: user.id,
        action: view.isDefault ? 'savedView.defaultCleared' : 'savedView.defaultSet',
        entityType: 'SavedView',
        entityId: view.id,
        summary: view.name,
      },
    })
  }

  const removeView = async (view: SavedView) => {
    await store.update({
      mutate: (draft) => {
        draft.savedViews = deleteSavedView(draft.savedViews, user.id, view.id)
      },
      audit: {
        actorId: user.id,
        action: 'savedView.deleted',
        entityType: 'SavedView',
        entityId: view.id,
        summary: view.name,
      },
    })
    // The configuration stays exactly as it is; only its link to the view goes.
    setSelection({ configuration: current.configuration, viewId: null })
  }

  return (
    <section aria-labelledby="register-title" className="register">
      <div className="page-head">
        <p className="page-head__eyebrow">{t('register.eyebrow')}</p>
        <div className="page-head__row">
          <div className="page-head__identity">
            <h1 id="register-title">{t('page.register.title')}</h1>
            <p className="page-head__subtitle">{t('register.subtitle')}</p>
          </div>

          {/* Only users who may actually create a risk see the control. */}
          <div className="page-head__actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                download('ERM-Risk-Register.csv', toCsv(exportRows()), 'text/csv;charset=utf-8')
              }}
            >
              <IconDownload size={14} />
              {t('export.csv')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                download('ERM-Risk-Register.xls', toSpreadsheetXml(exportRows()), 'application/vnd.ms-excel')
              }}
            >
              {t('export.excel')}
            </button>

            {showCreate ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setEditing({ risk: null })
                }}
              >
                <IconPlus size={14} />
                {t('register.newRisk')}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <RegisterToolbar
        search={search}
        onSearchChange={(value) => {
          change({ search: value })
        }}
        filters={filters}
        onFiltersChange={(next) => {
          change({ filters: next })
        }}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          change({ viewMode: mode })
        }}
        columns={columns}
        visibleColumns={reconciled}
        onVisibleColumnsChange={(next) => {
          change({ visibleColumns: next })
        }}
        categories={state.categories}
        businessUnits={state.businessUnits}
        matrix={state.matrix}
        language={language}
      />

      <SavedViewsBar
        resultCount={results.length}
        views={savedViews}
        activeViewId={activeViewId}
        canSave
        onApply={applyView}
        onToggleDefault={(view) => {
          void toggleDefault(view)
        }}
        onDelete={(view) => {
          void removeView(view)
        }}
        onSave={(name) => {
          void saveCurrentView(name)
        }}
      />

      {/*
       * Three distinct states. An empty scope is not the same as a filter that
       * matched nothing, and conflating them would tell a Risk Owner with no
       * assignments to "clear filters" they never set.
       */}
      {scoped.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<IconList size={18} />}
            title={t('register.empty.title')}
            body={t('register.empty.body')}
          />
        </div>
      ) : results.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<IconList size={18} />}
            title={t('register.noResults.title')}
            body={t('register.noResults.body')}
            action={
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  change({ search: EMPTY_QUERY.search, filters: {} })
                }}
              >
                {t('register.filter.clear')}
              </button>
            }
          />
        </div>
      ) : (
        <RegisterTable
          risks={results}
          columns={columns}
          visibleColumns={reconciled}
          viewMode={viewMode}
          sort={sort}
          onSortChange={(field) => {
            change({ sort: toggleSort(sort, field) })
          }}
          index={index}
          matrix={state.matrix}
          today={today}
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
    </section>
  )
}
