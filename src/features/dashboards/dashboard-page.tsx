import { useMemo, useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import { flattenTree } from '../../domain/business-units/index.ts'
import {
  canDeleteDashboard,
  duplicateDashboard,
  filterRisks,
  reorderWidgets,
  type DashboardContext,
} from '../../domain/dashboard/index.ts'
import { canAccess, visibleRisks } from '../../domain/permissions/index.ts'
import { ratingLevels, ratingName } from '../../domain/risk-engine/index.ts'
import { buildRegisterIndex, level1Groups } from '../../domain/register/index.ts'
import {
  CHART_TYPES,
  OUTLOOKS,
  RISK_STATUSES,
  RISK_TYPES,
  WIDGET_GROUPINGS,
  WIDGET_METRICS,
  WIDGET_SPANS,
  WIDGET_TYPES,
} from '../../domain/types/enums.ts'
import type { Dashboard, DashboardWidget, RiskFilters, RatingMatrix } from '../../domain/types/index.ts'
import { pickNamed, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import { AnalyticsDashboard } from './analytics-dashboard.tsx'
import { resolveCssColor } from '../../ui/resolve-color.ts'
import { ChartGlyph } from './chart-glyph.tsx'
import { computeChartData, type ChartData } from '../../domain/dashboard/series.ts'
import { WidgetBody } from './dashboard-widget.tsx'
import './dashboards.css'

/*
 * Dashboard Builder (ARCHITECTURE.md §8.3).
 *
 * Dashboards read the live Risk Register dataset, already narrowed to the
 * current user's visible set — a dashboard never widens record-level scope.
 * Filters are stored in the definition and restored when it opens.
 */

function blankWidget(id: string): DashboardWidget {
  return {
    id, type: 'metric', titleEn: 'New widget', titleKa: '',
    accentColor: '#1A2151', backgroundColor: '#FFFFFF', span: 3, metric: 'totalRisks',
  }
}

function blankDashboard(id: string): Dashboard {
  return {
    id, nameEn: 'New dashboard', nameKa: '', descriptionEn: '', descriptionKa: '',
    accentColor: '#1A2151', shared: false, filters: {}, widgets: [],
  }
}

/**
 * The configurable dashboard builder (ARCHITECTURE.md §8.3).
 *
 * Retained alongside the CR-004 analytics dashboard: report templates bind
 * their dashboard sections to these definitions, so removing the builder would
 * break Reports.
 */
export function ConfigurableDashboards() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user, context: access } = useCurrentUser()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const scoped = useMemo(
    () => (state ? visibleRisks(access, state.risks) : []),
    [state, access],
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

  if (!state || !index || !user) return null

  const dashboards = state.dashboards
  const dashboard = dashboards.find((candidate) => candidate.id === selectedId) ?? dashboards[0]
  const canEdit = canAccess(access, 'dashboard', 'edit')

  if (!dashboard) {
    return (
      <section aria-labelledby="dashboard-title">
        <h1 id="dashboard-title">{t('page.dashboard.title')}</h1>
        <p className="panel__meta">{t('dash.noWidgets')}</p>
      </section>
    )
  }

  const dashboardContext: DashboardContext = {
    risks: scoped,
    businessUnits: state.businessUnits,
    categories: state.categories,
    users: state.users,
    customAttributes: state.customAttributes,
    matrix: state.matrix,
    index,
    auditEvents: state.auditEvents,
    dashboards: state.dashboards,
    today: new Date().toISOString().slice(0, 10),
    language,
  }

  // Saved filters are applied every render, which is what "restored on open" means.
  const filtered = filterRisks(scoped, dashboard.filters, dashboardContext)

  const writeDashboard = async (next: Dashboard, action: string, summary: string) => {
    await store.update({
      mutate: (appState) => {
        const position = appState.dashboards.findIndex((candidate) => candidate.id === next.id)
        if (position >= 0) appState.dashboards[position] = next
        else appState.dashboards.push(next)
      },
      audit: { actorId: user.id, action, entityType: 'Dashboard', entityId: next.id, summary },
    })
  }

  const addDashboard = async () => {
    const created = blankDashboard(`dash_${Date.now().toString(36)}`)
    await writeDashboard(created, 'dashboard.created', created.nameEn)
    setSelectedId(created.id)
    setEditing(true)
  }

  const duplicate = async () => {
    const copy = duplicateDashboard(
      dashboard,
      `dash_${Date.now().toString(36)}`,
      (position) => `wid_${Date.now().toString(36)}_${String(position)}`,
    )
    await writeDashboard(copy, 'dashboard.duplicated', copy.nameEn)
    setSelectedId(copy.id)
  }

  const remove = async () => {
    if (!canDeleteDashboard(dashboards.length)) {
      setNotice(t('dash.deleteBlocked'))
      return
    }
    setNotice(null)

    await store.update({
      mutate: (appState) => {
        appState.dashboards = appState.dashboards.filter((candidate) => candidate.id !== dashboard.id)
        // Report sections bound to this dashboard go with it, so no template
        // is left pointing at something that no longer exists.
        appState.reportTemplates = appState.reportTemplates.map((template) => ({
          ...template,
          sections: template.sections.filter(
            (section) => section.type !== 'dashboard' || section.dashboardId !== dashboard.id,
          ),
        }))
      },
      audit: {
        actorId: user.id,
        action: 'dashboard.deleted',
        entityType: 'Dashboard',
        entityId: dashboard.id,
        summary: `${dashboard.nameEn} deleted; bound report sections removed`,
      },
    })
    setSelectedId(null)
  }

  const patch = (changes: Partial<Dashboard>) =>
    writeDashboard({ ...dashboard, ...changes }, 'dashboard.updated', dashboard.nameEn)

  /**
   * Writes one filter, removing the key entirely when cleared so an unset
   * filter never persists as an empty string.
   */
  const setFilter = (key: keyof RiskFilters, value: string) => {
    // Every RiskFilters member is an optional string, so a widened record is
    // the simplest way to write one key without a per-key overload.
    const filters = { ...dashboard.filters } as Record<string, string | undefined>
    if (value === '') delete filters[key]
    else filters[key] = value
    void patch({ filters: filters as RiskFilters })
  }

  return (
    <section aria-labelledby="dashboard-title">
      <div className="dash-header">
        <h1 id="dashboard-title">{t('page.dashboard.title')}</h1>

        <div className="dash-header__controls">
          <label>
            <span className="visually-hidden">{t('dash.select')}</span>
            <select
              value={dashboard.id}
              onChange={(event) => {
                setSelectedId(event.target.value)
                setNotice(null)
              }}
            >
              {dashboards.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {pickNamed(candidate, 'name', language)}
                </option>
              ))}
            </select>
          </label>

          {canEdit ? (
            <>
              <button type="button" onClick={() => void addDashboard()}>{t('dash.add')}</button>
              <button type="button" onClick={() => void duplicate()}>{t('dash.duplicate')}</button>
              <button type="button" onClick={() => void remove()}>{t('dash.delete')}</button>
              <button type="button" onClick={() => { setEditing(!editing) }}>
                {editing ? t('dash.done') : t('dash.edit')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {notice ? <p className="admin-errors" role="alert">{notice}</p> : null}

      <p className="panel__meta">{pickNamed(dashboard, 'description', language)}</p>

      {editing && canEdit ? (
        <DashboardSettings
          dashboard={dashboard}
          onPatch={(changes) => void patch(changes)}
          onFilter={setFilter}
          categories={level1Groups(state.categories)}
          units={flattenTree(state.businessUnits, { includeInactive: false })}
          owners={state.users.filter((candidate) => candidate.status === 'Active')}
          matrix={state.matrix}
          language={language}
        />
      ) : null}

      <div className="dash-grid">
        {dashboard.widgets.length === 0 ? (
          <p className="panel__meta">{t('dash.noWidgets')}</p>
        ) : (
          dashboard.widgets.map((widget, position) => (
            <article
              key={widget.id}
              className="dash-widget"
              style={{
                gridColumn: `span ${String(widget.span)}`,
                background: widget.backgroundColor,
                borderTopColor: widget.accentColor,
              }}
            >
              <h2>{pickNamed(widget, 'title', language)}</h2>
              <WidgetBody widget={widget} risks={filtered} context={dashboardContext} />

              {editing && canEdit ? (
                <WidgetSettings
                  widget={widget}
                  series={
                    widget.type === 'distribution'
                      ? computeChartData(
                          filtered,
                          widget.grouping ?? 'rating',
                          widget.breakdown,
                          dashboardContext,
                          {
                            totalLabel: t(`grouping.${widget.grouping ?? 'rating'}` as TranslationKey),
                            seriesColors: widget.seriesColors,
                          },
                        )
                      : null
                  }
                  position={position}
                  total={dashboard.widgets.length}
                  onPatch={(changes) => {
                    const widgets = [...dashboard.widgets]
                    widgets[position] = { ...widget, ...changes }
                    void patch({ widgets })
                  }}
                  onMove={(to) => { void patch({ widgets: reorderWidgets(dashboard.widgets, position, to) }) }}
                  onDuplicate={() => {
                    const copy = { ...widget, id: `wid_${Date.now().toString(36)}` }
                    const widgets = [...dashboard.widgets]
                    widgets.splice(position + 1, 0, copy)
                    void patch({ widgets })
                  }}
                  onRemove={() => {
                    void patch({ widgets: dashboard.widgets.filter((candidate) => candidate.id !== widget.id) })
                  }}
                />
              ) : null}
            </article>
          ))
        )}
      </div>

      {editing && canEdit ? (
        <button
          type="button"
          className="dash-add-widget"
          onClick={() => {
            void patch({ widgets: [...dashboard.widgets, blankWidget(`wid_${Date.now().toString(36)}`)] })
          }}
        >
          {t('dash.addWidget')}
        </button>
      ) : null}
    </section>
  )
}

// --- dashboard settings -----------------------------------------------------

function DashboardSettings(props: {
  dashboard: Dashboard
  onPatch: (changes: Partial<Dashboard>) => void
  onFilter: (key: keyof RiskFilters, value: string) => void
  categories: readonly string[]
  units: readonly { unit: { id: string; nameEn: string; nameKa: string }; depth: number }[]
  owners: readonly { id: string; name: string }[]
  /** Rating filter options read their names from the saved configuration. */
  matrix: RatingMatrix
  language: 'en' | 'ka'
}) {
  const { t } = useTranslation()
  const { dashboard } = props

  return (
    <div className="dash-settings">
      <div className="admin-form">
        <label>
          <span>{t('dash.nameEn')}</span>
          <input value={dashboard.nameEn} onChange={(event) => { props.onPatch({ nameEn: event.target.value }) }} />
        </label>
        <label>
          <span>{t('dash.nameKa')}</span>
          <input value={dashboard.nameKa} onChange={(event) => { props.onPatch({ nameKa: event.target.value }) }} />
        </label>
        <label>
          <span>{t('dash.descriptionEn')}</span>
          <input value={dashboard.descriptionEn} onChange={(event) => { props.onPatch({ descriptionEn: event.target.value }) }} />
        </label>
        <label>
          <span>{t('dash.accentColor')}</span>
          <input type="color" value={dashboard.accentColor} onChange={(event) => { props.onPatch({ accentColor: event.target.value }) }} />
        </label>
        <label className="admin-form__checkbox">
          <input type="checkbox" checked={dashboard.shared} onChange={(event) => { props.onPatch({ shared: event.target.checked }) }} />
          <span>{t('dash.shared')}</span>
        </label>
      </div>

      {/* All seven filters, persisted in the dashboard definition. */}
      <fieldset className="admin-permissions">
        <legend>{t('dash.filters')}</legend>

        <label>
          <span>{t('register.filter.category')}</span>
          <select value={dashboard.filters.categoryLevel1 ?? ''} onChange={(event) => { props.onFilter('categoryLevel1', event.target.value) }}>
            <option value="">{t('register.filter.all')}</option>
            {props.categories.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
        </label>

        <label>
          <span>{t('register.filter.businessUnit')}</span>
          <select value={dashboard.filters.businessUnitId ?? ''} onChange={(event) => { props.onFilter('businessUnitId', event.target.value) }}>
            <option value="">{t('register.filter.all')}</option>
            {props.units.map(({ unit }) => (
              <option key={unit.id} value={unit.id}>{pickNamed(unit, 'name', props.language)}</option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('register.filter.status')}</span>
          <select value={dashboard.filters.status ?? ''} onChange={(event) => { props.onFilter('status', event.target.value) }}>
            <option value="">{t('register.filter.all')}</option>
            {RISK_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>

        <label>
          <span>{t('register.filter.residualRating')}</span>
          <select value={dashboard.filters.residualRating ?? ''} onChange={(event) => { props.onFilter('residualRating', event.target.value) }}>
            <option value="">{t('register.filter.all')}</option>
            {/* Keyed by the stable rating key; the label is configured (CR-003). */}
            {ratingLevels(props.matrix).map((level) => (
              <option key={level.key} value={level.key}>
                {ratingName(props.matrix, level.key, props.language)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{t('dash.filter.riskType')}</span>
          <select value={dashboard.filters.riskType ?? ''} onChange={(event) => { props.onFilter('riskType', event.target.value) }}>
            <option value="">{t('register.filter.all')}</option>
            {RISK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>

        <label>
          <span>{t('dash.filter.riskOwner')}</span>
          <select value={dashboard.filters.riskOwnerId ?? ''} onChange={(event) => { props.onFilter('riskOwnerId', event.target.value) }}>
            <option value="">{t('register.filter.all')}</option>
            {props.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
          </select>
        </label>

        <label>
          <span>{t('register.filter.outlook')}</span>
          <select value={dashboard.filters.outlook ?? ''} onChange={(event) => { props.onFilter('outlook', event.target.value) }}>
            <option value="">{t('register.filter.all')}</option>
            {OUTLOOKS.map((outlook) => <option key={outlook} value={outlook}>{outlook}</option>)}
          </select>
        </label>
      </fieldset>
    </div>
  )
}

// --- widget settings --------------------------------------------------------

function WidgetSettings(props: {
  widget: DashboardWidget
  /** Resolved chart data, so colour controls can be listed per series. */
  series: ChartData | null
  position: number
  total: number
  onPatch: (changes: Partial<DashboardWidget>) => void
  onMove: (to: number) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const { widget } = props
  const name = widget.titleEn || t('dash.widgets')

  return (
    <div className="dash-widget__settings">
      <label>
        <span>{t('dash.widget.type')}</span>
        <select
          aria-label={`${name} ${t('dash.widget.type')}`}
          value={widget.type}
          onChange={(event) => { props.onPatch({ type: event.target.value as DashboardWidget['type'] }) }}
        >
          {WIDGET_TYPES.map((type) => (
            <option key={type} value={type}>{t(`widget.${type}` as TranslationKey)}</option>
          ))}
        </select>
      </label>

      <label>
        <span>{t('dash.widget.titleEn')}</span>
        <input
          aria-label={`${name} ${t('dash.widget.titleEn')}`}
          value={widget.titleEn}
          onChange={(event) => { props.onPatch({ titleEn: event.target.value }) }}
        />
      </label>

      <label>
        <span>{t('dash.widget.span')}</span>
        <select
          aria-label={`${name} ${t('dash.widget.span')}`}
          value={widget.span}
          onChange={(event) => { props.onPatch({ span: Number(event.target.value) as DashboardWidget['span'] }) }}
        >
          {WIDGET_SPANS.map((span) => <option key={span} value={span}>{span}</option>)}
        </select>
      </label>

      <label>
        <span>{t('dash.widget.accent')}</span>
        <input
          type="color"
          aria-label={`${name} ${t('dash.widget.accent')}`}
          value={widget.accentColor}
          onChange={(event) => { props.onPatch({ accentColor: event.target.value }) }}
        />
      </label>

      {widget.type === 'metric' ? (
        <label>
          <span>{t('dash.widget.metric')}</span>
          <select
            aria-label={`${name} ${t('dash.widget.metric')}`}
            value={widget.metric ?? 'totalRisks'}
            onChange={(event) => { props.onPatch({ metric: event.target.value as DashboardWidget['metric'] }) }}
          >
            {WIDGET_METRICS.map((metric) => (
              <option key={metric} value={metric}>{t(`metric.${metric}` as TranslationKey)}</option>
            ))}
          </select>
        </label>
      ) : null}

      {widget.type === 'distribution' ? (
        <label>
          <span>{t('dash.widget.grouping')}</span>
          <select
            aria-label={`${name} ${t('dash.widget.grouping')}`}
            value={widget.grouping ?? 'rating'}
            onChange={(event) => { props.onPatch({ grouping: event.target.value as DashboardWidget['grouping'] }) }}
          >
            {WIDGET_GROUPINGS.map((grouping) => (
              <option key={grouping} value={grouping}>{t(`grouping.${grouping}` as TranslationKey)}</option>
            ))}
          </select>
        </label>
      ) : null}

      {widget.type === 'distribution' ? (
        <>
          {/*
            * Chart type picker (CR-2026-014 FR-01). Radios, not a select: the
            * ten shapes are shown as a grid of glyphs grouped by family, and a
            * radio group is already keyboard-operable and announces its state.
            */}
          <fieldset className="chart-picker">
            <legend>{t('dash.widget.chartType')}</legend>
            <div className="chart-picker__grid">
              <label className="chart-picker__option">
                <input
                  type="radio"
                  name={`${widget.id}-chart`}
                  checked={!widget.chartType}
                  onChange={() => { props.onPatch({ chartType: undefined }) }}
                />
                <ChartGlyph type={null} />
                <span>{t('dash.widget.chartList')}</span>
              </label>

              {CHART_TYPES.map((type) => (
                <label key={type} className="chart-picker__option">
                  <input
                    type="radio"
                    name={`${widget.id}-chart`}
                    checked={widget.chartType === type}
                    onChange={() => { props.onPatch({ chartType: type }) }}
                  />
                  <ChartGlyph type={type} />
                  <span>{t(`chart.${type}` as TranslationKey)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* The series dimension: what the stack or the line set is made of. */}
          <label>
            <span>{t('dash.widget.breakdown')}</span>
            <select
              aria-label={`${name} ${t('dash.widget.breakdown')}`}
              value={widget.breakdown ?? ''}
              onChange={(event) => {
                const value = event.target.value
                props.onPatch({ breakdown: value === '' ? undefined : (value as DashboardWidget['breakdown']) })
              }}
            >
              <option value="">{t('dash.widget.breakdownNone')}</option>
              {WIDGET_GROUPINGS.map((grouping) => (
                <option key={grouping} value={grouping}>{t(`grouping.${grouping}` as TranslationKey)}</option>
              ))}
            </select>
          </label>

          {/*
            * One colour control per series — or per SLICE for pie and doughnut,
            * which plot categories rather than series (FR-04). A rating series
            * is omitted: its colour is the configured matrix colour, so a level
            * looks the same on every surface (CR-003).
            */}
          {props.series ? (
            <fieldset className="widget-series">
              <legend>{t('dash.widget.seriesColour')}</legend>
              <div className="widget-series__list">
                {(widget.chartType === 'pie' || widget.chartType === 'doughnut'
                  ? props.series.points.map((point) => ({ key: point.key, label: point.name, color: point.color ?? '' }))
                  : props.series.series
                ).map((entry) => (
                  <label key={entry.key} className="widget-series__item">
                    <input
                      type="color"
                      aria-label={`${entry.label} ${t('dash.widget.seriesColour')}`}
                      value={resolveCssColor(entry.color)}
                      onChange={(event) => {
                        props.onPatch({
                          seriesColors: { ...widget.seriesColors, [entry.key]: event.target.value },
                        })
                      }}
                    />
                    <span>{entry.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </>
      ) : null}

      {widget.type === 'heatmap' || widget.type === 'topRisks' ? (
        <label>
          <span>{t('dash.widget.scoreBasis')}</span>
          <select
            aria-label={`${name} ${t('dash.widget.scoreBasis')}`}
            value={widget.scoreBasis ?? 'residual'}
            onChange={(event) => { props.onPatch({ scoreBasis: event.target.value as DashboardWidget['scoreBasis'] }) }}
          >
            {(['inherent', 'residual', 'target'] as const).map((basis) => (
              <option key={basis} value={basis}>{t(`editor.assessment.${basis}` as TranslationKey)}</option>
            ))}
          </select>
        </label>
      ) : null}

      {widget.type === 'topRisks' || widget.type === 'recentActivity' ? (
        <label>
          <span>{t('dash.widget.limit')}</span>
          <input
            type="number"
            min={1}
            max={20}
            aria-label={`${name} ${t('dash.widget.limit')}`}
            value={widget.limit ?? 10}
            onChange={(event) => { props.onPatch({ limit: Number(event.target.value) }) }}
          />
        </label>
      ) : null}

      <div className="dash-widget__actions">
        {/* A disabled control states why, rather than just going grey. */}
        <button
          type="button"
          disabled={props.position === 0}
          title={props.position === 0 ? t('dash.widget.atStart') : undefined}
          onClick={() => { props.onMove(props.position - 1) }}
        >
          {t('dash.widget.moveUp')}
        </button>
        <button
          type="button"
          disabled={props.position === props.total - 1}
          title={props.position === props.total - 1 ? t('dash.widget.atEnd') : undefined}
          onClick={() => { props.onMove(props.position + 1) }}
        >
          {t('dash.widget.moveDown')}
        </button>
        <button type="button" onClick={props.onDuplicate}>{t('dash.duplicate')}</button>
        <button type="button" onClick={props.onRemove}>{t('editor.remove')}</button>
      </div>
    </div>
  )
}


/*
 * Dashboard module shell (CR-004).
 *
 * Analytics is the module's front door: a fixed widget set over the Risk
 * Register. The configurable dashboards stay one tab away because report
 * templates render them.
 */
export function DashboardPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'analytics' | 'custom'>('analytics')

  return (
    <>
      <div className="dash-tabs" role="tablist" aria-label={t('page.dashboard.title')}>
        {(['analytics', 'custom'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className="dash-tabs__tab"
            onClick={() => {
              setTab(id)
            }}
          >
            {t(id === 'analytics' ? 'dash.tab.analytics' : 'dash.tab.custom')}
          </button>
        ))}
      </div>

      {tab === 'analytics' ? <AnalyticsDashboard /> : <ConfigurableDashboards />}
    </>
  )
}
