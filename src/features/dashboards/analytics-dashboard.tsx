import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import { flattenTree } from '../../domain/business-units/index.ts'
import {
  computeDashboardAnalytics,
  UNASSIGNED_KEY,
  type StackedBar,
} from '../../domain/dashboard/analytics.ts'
import {
  createDashboardView,
  DASHBOARD_WIDGETS,
  defaultViewFor,
  deleteDashboardView,
  moveWidget,
  resolveLayout,
  saveLayout,
  setDefaultDashboardView,
  toggleWidget,
  viewsForUser,
  type DashboardWidgetId,
} from '../../domain/dashboard/views.ts'
import { visibleRisks } from '../../domain/permissions/index.ts'
import { filtersFromParams, filtersToParams, hasActiveFilters } from '../../domain/register/filter-params.ts'
import { buildRegisterIndex, level1Groups } from '../../domain/register/index.ts'
import { ratingLevels, ratingName, scaleName } from '../../domain/risk-engine/index.ts'
import { RISK_STATUSES, RISK_TYPES } from '../../domain/types/enums.ts'
import type { AssessmentType, DashboardView, RiskFilters } from '../../domain/types/index.ts'
import { pickNamed, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { IconClose, IconPlus, IconStar, IconTrash } from '../../ui/icons.tsx'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { barsExportRows, heatmapExportRows, kpiExportRows } from './analytics-export.ts'
import {
  HeatmapWidget,
  KpiRow,
  StackedBars,
  WidgetEmpty,
  WidgetFrame,
} from './analytics-widgets.tsx'
import './analytics.css'

/*
 * Dashboard module (CR-004).
 *
 * One aggregation over the Risk Register drives every widget, so a widget
 * total and the register result count under the same filters are the same
 * computation. Filter state lives in the URL — the page reads it rather than
 * mirroring it into React state, which is what makes a filtered dashboard
 * shareable and the back button work.
 */

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

const isBasis = (value: string | null): value is AssessmentType =>
  value === 'inherent' || value === 'residual' || value === 'target'

export function AnalyticsDashboard() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user, context } = useCurrentUser()
  const [params, setParams] = useSearchParams()

  const [naming, setNaming] = useState(false)
  const [viewName, setViewName] = useState('')
  const [arranging, setArranging] = useState(false)
  const [showEmptyUnits, setShowEmptyUnits] = useState(false)
  // Stamped when the aggregation was last (re)computed from stored data.
  const [generatedAt, setGeneratedAt] = useState(() => new Date().toISOString())

  const filters = useMemo(() => filtersFromParams(params), [params])
  const basis: AssessmentType = isBasis(params.get('basis')) ? (params.get('basis') as AssessmentType) : 'residual'

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

  // Gate 4 first: the aggregation never widens record-level scope.
  const scoped = useMemo(
    () => (state ? visibleRisks(context, state.risks) : []),
    [state, context],
  )

  const analytics = useMemo(() => {
    if (!state || !index) return null
    return computeDashboardAnalytics({
      risks: scoped,
      filters,
      basis,
      businessUnits: state.businessUnits,
      categories: state.categories,
      matrix: state.matrix,
      index,
      today: new Date().toISOString().slice(0, 10),
      language,
      includeEmptyBusinessUnits: showEmptyUnits,
    })
  }, [state, index, scoped, filters, basis, language, showEmptyUnits])

  const savedViews = useMemo(
    () => (state && user ? viewsForUser(state.dashboardViews, user.id) : []),
    [state, user],
  )

  const layout = useMemo(
    () => (state && user ? resolveLayout(state.dashboardLayouts, user.id) : null),
    [state, user],
  )

  /*
   * The user's default view seeds the URL only when the page is opened with no
   * query of its own — an explicit link always wins over a saved preference.
   */
  const preferred = useMemo(
    () => (state && user && params.toString().length === 0 ? defaultViewFor(state.dashboardViews, user.id) : null),
    [state, user, params],
  )

  if (!state || !index || !user || !analytics || !layout) {
    /*
     * Loading skeleton rather than an empty frame. It deliberately renders no
     * heading of its own: a heading here would be a different DOM node from the
     * loaded one, and anything that resolved against it would hold a detached
     * element once the data arrives.
     */
    return (
      <section aria-label={t('page.dashboard.title')} className="dash">
        <div className="dash-skeleton" role="status" aria-live="polite">
          <span className="visually-hidden">{t('state.loading')}</span>
        </div>
      </section>
    )
  }

  const active = preferred ?? null
  const effectiveFilters: RiskFilters = active ? active.filters : filters
  const effectiveBasis: AssessmentType = active ? active.basis : basis

  const setFilters = (next: RiskFilters, nextBasis: AssessmentType = effectiveBasis) => {
    const search = filtersToParams(next)
    if (nextBasis !== 'residual') search.set('basis', nextBasis)
    /*
     * An empty query is what re-applies the user's default view, so it cannot
     * also mean "the user chose exactly the defaults" — a visitor whose default
     * view is on Target could never switch the heat map back to Residual: the
     * choice emptied the query and the view immediately reinstated Target.
     *
     * Writing the basis keeps a deliberate choice in the URL, where it is also
     * shareable and survives a reload. `applyView` solves the same ambiguity
     * with its own marker.
     */
    if (search.toString().length === 0) search.set('basis', nextBasis)
    setParams(search)
  }

  const setFilter = <K extends keyof RiskFilters>(key: K, raw: string) => {
    const next: RiskFilters = { ...effectiveFilters }
    if (raw === '') delete next[key]
    else next[key] = raw as RiskFilters[K]
    setFilters(next)
  }

  const clearFilter = (key: keyof RiskFilters) => {
    const next = { ...effectiveFilters }
    delete next[key]
    setFilters(next)
  }

  // --- labels ---------------------------------------------------------------

  const units = flattenTree(state.businessUnits, { includeInactive: false })
  const owners = state.users.filter((candidate) => candidate.status === 'Active')
  const scale = scaleName(state.matrix, language)

  /** Resolves the Unassigned / Other sentinels the aggregation emits. */
  const labelFor = (bar: StackedBar): string => {
    if (bar.key === UNASSIGNED_KEY || bar.label === UNASSIGNED_KEY) return t('dash.unassigned')
    if (bar.key === '__other__') return t('dash.other')
    return bar.label
  }

  /** One human-readable chip per applied filter. */
  const chips: { key: keyof RiskFilters; label: string }[] = []
  const chip = (key: keyof RiskFilters, label: string, value: string) => {
    chips.push({ key, label: `${label}: ${value}` })
  }

  if (effectiveFilters.businessUnitId) {
    chip(
      'businessUnitId',
      t('register.filter.businessUnit'),
      index.businessUnitLabel.get(effectiveFilters.businessUnitId) ?? effectiveFilters.businessUnitId,
    )
  }
  if (effectiveFilters.categoryLevel1) {
    chip('categoryLevel1', t('register.filter.category'), effectiveFilters.categoryLevel1)
  }
  if (effectiveFilters.categoryId) {
    chip(
      'categoryId',
      t('register.filter.category'),
      index.categoryLabel.get(effectiveFilters.categoryId) ?? effectiveFilters.categoryId,
    )
  }
  if (effectiveFilters.riskOwnerId) {
    chip(
      'riskOwnerId',
      t('dash.filter.riskOwner'),
      index.userName.get(effectiveFilters.riskOwnerId) ?? effectiveFilters.riskOwnerId,
    )
  }
  if (effectiveFilters.status) chip('status', t('register.filter.status'), effectiveFilters.status)
  if (effectiveFilters.residualRating) {
    chip(
      'residualRating',
      scale,
      ratingName(state.matrix, effectiveFilters.residualRating, language),
    )
  }
  if (effectiveFilters.riskType) chip('riskType', t('dash.filter.riskType'), effectiveFilters.riskType)
  if (effectiveFilters.targetFrom) chip('targetFrom', t('dash.filter.from'), effectiveFilters.targetFrom)
  if (effectiveFilters.targetTo) chip('targetTo', t('dash.filter.to'), effectiveFilters.targetTo)
  for (const key of ['open', 'aboveTarget', 'aboveAppetite', 'hasOverdueAction', 'reviewDueSoon'] as const) {
    if (effectiveFilters[key]) chips.push({ key, label: t(`dash.chip.${key}` as TranslationKey) })
  }

  // --- saved views and layout ------------------------------------------------

  const saveCurrentView = async (name: string) => {
    const id = generateId('dview')
    await store.update({
      mutate: (draft) => {
        draft.dashboardViews = createDashboardView(draft.dashboardViews, {
          id,
          userId: user.id,
          name,
          filters: effectiveFilters,
          basis: effectiveBasis,
        })
      },
      audit: {
        actorId: user.id,
        action: 'dashboardView.created',
        entityType: 'DashboardView',
        entityId: id,
        summary: name,
      },
    })
  }

  const toggleDefaultView = async (view: DashboardView) => {
    await store.update({
      mutate: (draft) => {
        draft.dashboardViews = setDefaultDashboardView(draft.dashboardViews, user.id, view.id)
      },
      audit: {
        actorId: user.id,
        action: view.isDefault ? 'dashboardView.defaultCleared' : 'dashboardView.defaultSet',
        entityType: 'DashboardView',
        entityId: view.id,
        summary: view.name,
      },
    })
  }

  const removeView = async (view: DashboardView) => {
    await store.update({
      mutate: (draft) => {
        draft.dashboardViews = deleteDashboardView(draft.dashboardViews, user.id, view.id)
      },
      audit: {
        actorId: user.id,
        action: 'dashboardView.deleted',
        entityType: 'DashboardView',
        entityId: view.id,
        summary: view.name,
      },
    })
  }

  const writeLayout = async (next: { order: DashboardWidgetId[]; hidden: DashboardWidgetId[] }) => {
    await store.update({
      mutate: (draft) => {
        draft.dashboardLayouts = saveLayout(draft.dashboardLayouts, user.id, next)
      },
    })
  }

  const applyView = (view: DashboardView) => {
    const search = filtersToParams(view.filters)
    if (view.basis !== 'residual') search.set('basis', view.basis)
    // A saved view with no filters still needs a query, or the default reapplies.
    if (search.toString().length === 0) search.set('view', view.id)
    setParams(search)
  }

  // --- widgets ---------------------------------------------------------------

  const empty = analytics.total === 0

  const widgetControls = (id: DashboardWidgetId) =>
    arranging ? (
      <>
        <button
          type="button"
          className="btn btn--icon"
          aria-label={`${t('dash.widget.moveUp')}: ${t(`dash.widget.${id}` as TranslationKey)}`}
          onClick={() => void writeLayout({ ...layout, order: moveWidget(layout.order, id, -1) })}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn btn--icon"
          aria-label={`${t('dash.widget.moveDown')}: ${t(`dash.widget.${id}` as TranslationKey)}`}
          onClick={() => void writeLayout({ ...layout, order: moveWidget(layout.order, id, 1) })}
        >
          ↓
        </button>
        <button
          type="button"
          className="btn btn--icon"
          aria-label={`${t('dash.widget.hide')}: ${t(`dash.widget.${id}` as TranslationKey)}`}
          onClick={() => void writeLayout({ ...layout, hidden: toggleWidget(layout.hidden, id) })}
        >
          <IconClose size={14} />
        </button>
      </>
    ) : null

  const renderWidget = (id: DashboardWidgetId) => {
    if (layout.hidden.includes(id)) return null

    switch (id) {
      case 'kpis':
        return (
          <div key={id} className="analytics-grid__full">
            <WidgetFrame
              title={t('dash.widget.kpis')}
              exportName="dashboard-kpis.csv"
              exportRows={kpiExportRows(analytics, (tileId) => t(`dash.kpi.${tileId}` as TranslationKey))}
              controls={widgetControls(id)}
            >
              <KpiRow analytics={analytics} />
            </WidgetFrame>
          </div>
        )

      case 'heatmap':
        return (
          <div key={id} className="analytics-grid__half">
            <WidgetFrame
              title={t('dash.widget.heatmap')}
              info={t('dash.heatmapInfo')}
              exportName="dashboard-heatmap.csv"
              exportRows={heatmapExportRows(analytics, state.matrix, language, {
                impact: t('editor.field.impact'),
                likelihood: t('editor.field.likelihood'),
                count: t('dash.count'),
              })}
              controls={widgetControls(id)}
            >
              {empty ? (
                <WidgetEmpty />
              ) : (
                <HeatmapWidget
                  analytics={analytics}
                  matrix={state.matrix}
                  basis={effectiveBasis}
                  filters={effectiveFilters}
                  onBasisChange={(next) => {
                    setFilters(effectiveFilters, next)
                  }}
                />
              )}
            </WidgetFrame>
          </div>
        )

      case 'byBusinessUnit':
      case 'byStatus':
      case 'byCategory': {
        const bars =
          id === 'byBusinessUnit'
            ? analytics.byBusinessUnit
            : id === 'byStatus'
              ? analytics.byStatus
              : analytics.byCategory

        return (
          <div key={id} className="analytics-grid__half">
            <WidgetFrame
              title={`${t(`dash.widget.${id}` as TranslationKey)} — ${scale}`}
              exportName={`dashboard-${id}.csv`}
              exportRows={barsExportRows(bars, labelFor, {
                dimension: t(`dash.widget.${id}` as TranslationKey),
                total: t('dash.total'),
              })}
              controls={
                <>
                  {id === 'byBusinessUnit' ? (
                    <label className="widget__toggle">
                      <input
                        type="checkbox"
                        checked={showEmptyUnits}
                        onChange={() => {
                          setShowEmptyUnits(!showEmptyUnits)
                        }}
                      />
                      <span>{t('dash.showAll')}</span>
                    </label>
                  ) : null}
                  {widgetControls(id)}
                </>
              }
            >
              {empty ? <WidgetEmpty /> : <StackedBars bars={bars} labelFor={labelFor} />}
            </WidgetFrame>
          </div>
        )
      }
    }
  }

  return (
    <section aria-labelledby="dashboard-title" className="dash">
      <div className="page-head">
        <p className="page-head__eyebrow">{t('dash.eyebrow')}</p>
        <div className="page-head__row">
          <div className="page-head__identity">
            <h1 id="dashboard-title">{t('page.dashboard.title')}</h1>
            <p className="page-head__subtitle">
              {analytics.total} {t('dash.risksCounted')} · {t('dash.asOf')} {generatedAt.slice(0, 16).replace('T', ' ')}
            </p>
          </div>

          <div className="page-head__actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setArranging(!arranging)
              }}
            >
              {arranging ? t('dash.doneArranging') : t('dash.arrange')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void store.load()
                setGeneratedAt(new Date().toISOString())
              }}
            >
              {t('dash.refresh')}
            </button>
          </div>
        </div>
      </div>

      {/* --- filter bar ------------------------------------------------------ */}

      <fieldset className="dash-filters">
        <legend>{t('register.filters.legend')}</legend>

        <label>
          <span>{t('register.filter.businessUnit')}</span>
          <select
            value={effectiveFilters.businessUnitId ?? ''}
            onChange={(event) => {
              setFilter('businessUnitId', event.target.value)
            }}
          >
            <option value="">{t('register.filter.all')}</option>
            {units.map(({ unit, depth }) => (
              <option key={unit.id} value={unit.id}>
                {`${' '.repeat(depth * 2)}${pickNamed(unit, 'name', language)}`}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('register.filter.category')}</span>
          <select
            value={effectiveFilters.categoryLevel1 ?? ''}
            onChange={(event) => {
              setFilter('categoryLevel1', event.target.value)
            }}
          >
            <option value="">{t('register.filter.all')}</option>
            {level1Groups(state.categories).map((group) => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('dash.filter.riskOwner')}</span>
          <select
            value={effectiveFilters.riskOwnerId ?? ''}
            onChange={(event) => {
              setFilter('riskOwnerId', event.target.value)
            }}
          >
            <option value="">{t('register.filter.all')}</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>{owner.name}</option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('register.filter.status')}</span>
          <select
            value={effectiveFilters.status ?? ''}
            onChange={(event) => {
              setFilter('status', event.target.value)
            }}
          >
            <option value="">{t('register.filter.all')}</option>
            {RISK_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>

        <label>
          <span>{scale}</span>
          <select
            value={effectiveFilters.residualRating ?? ''}
            onChange={(event) => {
              setFilter('residualRating', event.target.value)
            }}
          >
            <option value="">{t('register.filter.all')}</option>
            {/* Keyed by the stable key; the label is configured (CR-003). */}
            {ratingLevels(state.matrix).map((level) => (
              <option key={level.key} value={level.key}>
                {ratingName(state.matrix, level.key, language)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('dash.filter.riskType')}</span>
          <select
            value={effectiveFilters.riskType ?? ''}
            onChange={(event) => {
              setFilter('riskType', event.target.value)
            }}
          >
            <option value="">{t('register.filter.all')}</option>
            {RISK_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('dash.filter.from')}</span>
          <input
            type="date"
            value={effectiveFilters.targetFrom ?? ''}
            onChange={(event) => {
              setFilter('targetFrom', event.target.value)
            }}
          />
        </label>

        <label>
          <span>{t('dash.filter.to')}</span>
          <input
            type="date"
            value={effectiveFilters.targetTo ?? ''}
            onChange={(event) => {
              setFilter('targetTo', event.target.value)
            }}
          />
        </label>
      </fieldset>

      {/* --- active filters and saved views ---------------------------------- */}

      <div className="dash-chips">
        {chips.map((entry) => (
          <button
            key={String(entry.key)}
            type="button"
            className="dash-chip"
            onClick={() => {
              clearFilter(entry.key)
            }}
          >
            {entry.label}
            <IconClose size={12} />
          </button>
        ))}

        {hasActiveFilters(effectiveFilters) ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setFilters({})
            }}
          >
            {t('dash.clearAll')}
          </button>
        ) : null}

        <ul className="saved-views__list" aria-label={t('dash.views')}>
          {savedViews.map((view) => (
            <li key={view.id} className="saved-views__item">
              <button
                type="button"
                className="saved-views__apply"
                onClick={() => {
                  applyView(view)
                }}
              >
                {view.name}
              </button>
              <button
                type="button"
                className={view.isDefault ? 'btn btn--icon is-default' : 'btn btn--icon'}
                aria-pressed={view.isDefault}
                aria-label={`${view.isDefault ? t('register.views.isDefault') : t('register.views.setDefault')}: ${view.name}`}
                onClick={() => void toggleDefaultView(view)}
              >
                <IconStar filled={view.isDefault} size={14} />
              </button>
              <button
                type="button"
                className="btn btn--icon btn--danger"
                aria-label={`${t('register.views.delete')}: ${view.name}`}
                onClick={() => void removeView(view)}
              >
                <IconTrash size={14} />
              </button>
            </li>
          ))}
        </ul>

        {naming ? (
          <span className="saved-views__save">
            <label htmlFor="dash-view-name" className="visually-hidden">
              {t('register.views.namePrompt')}
            </label>
            <input
              id="dash-view-name"
              value={viewName}
              placeholder={t('register.views.namePrompt')}
              onChange={(event) => {
                setViewName(event.target.value)
              }}
            />
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                if (viewName.trim().length === 0) return
                void saveCurrentView(viewName.trim())
                setViewName('')
                setNaming(false)
              }}
            >
              {t('action.save')}
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setNaming(true)
            }}
          >
            <IconPlus size={14} />
            {t('register.views.save')}
          </button>
        )}
      </div>

      {arranging && layout.hidden.length > 0 ? (
        <p className="dash-hidden">
          <span>{t('dash.hiddenWidgets')}</span>
          {layout.hidden.map((id) => (
            <button
              key={id}
              type="button"
              className="btn"
              onClick={() => void writeLayout({ ...layout, hidden: toggleWidget(layout.hidden, id) })}
            >
              {t(`dash.widget.${id}` as TranslationKey)}
            </button>
          ))}
        </p>
      ) : null}

      <div className="analytics-grid">{layout.order.map(renderWidget)}</div>

      {DASHBOARD_WIDGETS.every((id) => layout.hidden.includes(id)) ? (
        <p className="panel__meta">{t('dash.allHidden')}</p>
      ) : null}
    </section>
  )
}
