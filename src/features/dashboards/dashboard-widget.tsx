import {
  computeActionProgress,
  computeDistribution,
  computeHeatmap,
  computeMetric,
  computeRecentActivity,
  computeTopRisks,
  computeTrendSummary,
  type DashboardContext,
} from '../../domain/dashboard/index.ts'
import { ratingColor, ratingName } from '../../domain/risk-engine/index.ts'
import { SCALE_VALUES } from '../../domain/types/enums.ts'
import type { DashboardWidget, RatingLabel, Risk } from '../../domain/types/index.ts'
import { Link } from 'react-router-dom'
import { registerLinkFor } from '../../domain/register/filter-params.ts'
import { LARGE_TEXT_TARGET, readableOn } from '../../domain/risk-engine/contrast.ts'
import { computeChartData } from '../../domain/dashboard/series.ts'
import { resolveCssColor } from '../../ui/resolve-color.ts'
import { useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { WidgetChart } from './widget-chart.tsx'

/*
 * Widget renderers (ARCHITECTURE.md §8.3).
 *
 * Every widget reads its numbers from src/domain/dashboard, which in turn uses
 * the shared risk engine — so a matrix edit moves heatmaps, distributions and
 * Top Risks together with the Register.
 */

export interface WidgetProps {
  widget: DashboardWidget
  risks: readonly Risk[]
  context: DashboardContext
}

export function WidgetBody({ widget, risks, context }: WidgetProps) {
  switch (widget.type) {
    case 'metric':
      return <MetricWidget widget={widget} risks={risks} context={context} />
    case 'heatmap':
      return <HeatmapWidget widget={widget} risks={risks} context={context} />
    case 'distribution':
      return <DistributionWidget widget={widget} risks={risks} context={context} />
    case 'topRisks':
      return <TopRisksWidget widget={widget} risks={risks} context={context} />
    case 'actionProgress':
      return <ActionProgressWidget widget={widget} risks={risks} context={context} />
    case 'recentActivity':
      return <RecentActivityWidget widget={widget} risks={risks} context={context} />
    case 'trendSummary':
      return <TrendSummaryWidget widget={widget} risks={risks} context={context} />
  }
}

function MetricWidget({ widget, risks, context }: WidgetProps) {
  const { t } = useTranslation()
  const metric = widget.metric ?? 'totalRisks'
  const value = computeMetric(metric, risks, context)

  return (
    <div className="widget-metric">
      <span className="widget-metric__value" style={{ color: widget.accentColor }}>
        {value}
      </span>
      <span className="widget-metric__label">{t(`metric.${metric}` as TranslationKey)}</span>
    </div>
  )
}

function HeatmapWidget({ widget, risks, context }: WidgetProps) {
  const { t } = useTranslation()
  const basis = widget.scoreBasis ?? 'residual'
  const cells = computeHeatmap(risks, basis, context)
  const impacts = [...SCALE_VALUES].reverse()

  return (
    <table className="widget-heatmap" aria-label={`${t(`editor.assessment.${basis}` as TranslationKey)} heatmap`}>
      <thead>
        <tr>
          <th scope="col"><span className="visually-hidden">{t('editor.field.impact')}</span></th>
          {SCALE_VALUES.map((likelihood) => (
            <th key={likelihood} scope="col">{likelihood}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {impacts.map((impact) => (
          <tr key={impact}>
            <th scope="row">{impact}</th>
            {SCALE_VALUES.map((likelihood) => {
              const cell = cells.find((c) => c.impact === impact && c.likelihood === likelihood)
              const count = cell?.count ?? 0
              const fill = ratingColor((cell?.rating ?? 'Low') as RatingLabel, context.matrix)
              const ink = readableOn(resolveCssColor(fill), LARGE_TEXT_TARGET)
              /*
                * The cell's colour IS the rating, so the rating name must be in
                * the accessible name — colour never carries meaning alone.
                */
              const description = `Impact ${String(impact)}, likelihood ${String(likelihood)}: ${String(count)} risks, ${cell?.rating ?? ''}`

              return (
                <td key={likelihood} style={{ background: fill, color: ink }}>
                  {count > 0 ? (
                    /*
                     * A populated cell opens the register filtered to exactly
                     * those risks. An empty one is not interactive — there is
                     * nothing to open.
                     */
                    <Link
                      className="widget-heatmap__cell"
                      /*
                        * Drills to exactly this cell, not to the whole rating:
                        * the register shares one predicate set with the
                        * dashboard, so the list is the same computation
                        * (CR-004).
                        */
                      to={registerLinkFor({ basis, impact, likelihood })}
                      style={{ color: ink }}
                      aria-label={description}
                    >
                      {count}
                    </Link>
                  ) : (
                    <span className="visually-hidden">{description}</span>
                  )}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DistributionWidget({ widget, risks, context }: WidgetProps) {
  const { t } = useTranslation()
  const grouping = widget.grouping ?? 'rating'
  const buckets = computeDistribution(risks, grouping, context)
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count))

  if (buckets.length === 0) return <p className="panel__meta">{t('dash.noData')}</p>

  /*
   * A chart shape was chosen for this widget (CR-2026-014 FR-01). The data is
   * the same register count either way — only the drawing changes.
   */
  if (widget.chartType) {
    /*
     * Pie and doughnut plot one slice per category (FR-01), so a breakdown has
     * nowhere to go — plotting only its first series would show a fraction of
     * the register while looking like the whole of it.
     */
    const round = widget.chartType === 'pie' || widget.chartType === 'doughnut'
    const data = computeChartData(risks, grouping, round ? undefined : widget.breakdown, context, {
      totalLabel: t(`grouping.${grouping}` as TranslationKey),
      seriesColors: widget.seriesColors,
    })
    return (
      <WidgetChart
        type={widget.chartType}
        data={data}
        label={widget.titleEn || t(`grouping.${grouping}` as TranslationKey)}
        percentLabel={(value) => `${String(Math.round(value * 100))}%`}
      />
    )
  }

  return (
    <ul className="widget-bars">
      {buckets.map((bucket) => (
        <li key={bucket.key}>
          <span className="widget-bars__label">{bucket.label}</span>
          <span className="widget-bars__track">
            <span
              className="widget-bars__fill"
              style={{
                width: `${String((bucket.count / max) * 100)}%`,
                background:
                  /*
                   * A rating keeps the configured matrix colour so a level
                   * looks the same everywhere; anything else takes the
                   * widget's own override, then its accent.
                   */
                  grouping === 'rating'
                    ? ratingColor(bucket.key as RatingLabel, context.matrix)
                    : (widget.seriesColors?.[bucket.key] ?? widget.accentColor),
              }}
            />
          </span>
          <span className="widget-bars__count">{bucket.count}</span>
        </li>
      ))}
    </ul>
  )
}

function TopRisksWidget({ widget, risks, context }: WidgetProps) {
  const { t } = useTranslation()
  const entries = computeTopRisks(risks, widget.scoreBasis ?? 'residual', widget.limit ?? 10, context)

  if (entries.length === 0) return <p className="panel__meta">{t('dash.noData')}</p>

  return (
    <ol className="widget-top">
      {entries.map((entry) => {
        const fill = ratingColor(entry.rating as RatingLabel, context.matrix)
        return (
          <li key={entry.risk.id}>
            {/* The whole row opens the risk, so a listed risk is reachable. */}
            <Link className="widget-top__link" to={`/risks/${entry.risk.id}`}>
              <span className="widget-top__ref">{entry.risk.ref}</span>
              <span className="widget-top__title">{entry.risk.title}</span>
              <span
                className="widget-top__score"
                style={{
                  background: fill,
                  // Computed per fill: the palette is administrator-chosen.
                  color: readableOn(resolveCssColor(fill), LARGE_TEXT_TARGET),
                }}
              >
                <span className="widget-top__value">{entry.score}</span>
                <span className="widget-top__rating">
                  {ratingName(context.matrix, entry.rating as RatingLabel, context.language)}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

function ActionProgressWidget({ risks, context }: WidgetProps) {
  const { t } = useTranslation()
  const summary = computeActionProgress(risks, context)

  return (
    <div className="widget-progress">
      <dl>
        <div><dt>{t('actionProgress.total')}</dt><dd>{summary.total}</dd></div>
        <div><dt>{t('actionProgress.completed')}</dt><dd>{summary.completed}</dd></div>
        <div><dt>{t('actionProgress.overdue')}</dt><dd>{summary.overdue}</dd></div>
        <div><dt>{t('actionProgress.average')}</dt><dd>{Math.round(summary.averageProgress)}%</dd></div>
      </dl>
      <progress value={summary.averageProgress} max={100} />
    </div>
  )
}

function RecentActivityWidget({ widget, context }: WidgetProps) {
  const { t } = useTranslation()
  const events = computeRecentActivity(context.auditEvents, widget.limit ?? 8)

  if (events.length === 0) return <p className="panel__meta">{t('view.audit.noEvents')}</p>

  return (
    <ul className="widget-activity">
      {events.map((event) => (
        <li key={event.id}>
          <span className="widget-activity__action">{event.action}</span>
          <span className="widget-activity__summary">{event.summary}</span>
          <span className="panel__meta">{event.date.slice(0, 10)}</span>
        </li>
      ))}
    </ul>
  )
}

function TrendSummaryWidget({ risks }: WidgetProps) {
  const { t } = useTranslation()
  const summary = computeTrendSummary(risks)

  const entries = [
    { key: 'trendSummary.improving', value: summary.improving },
    { key: 'trendSummary.worsening', value: summary.worsening },
    { key: 'trendSummary.stable', value: summary.stable },
    { key: 'trendSummary.new', value: summary.isNew },
  ] as const satisfies readonly { key: TranslationKey; value: number }[]

  return (
    <dl className="widget-trend">
      {entries.map((entry) => (
        <div key={entry.key}>
          <dt>{t(entry.key)}</dt>
          <dd>{entry.value}</dd>
        </div>
      ))}
    </dl>
  )
}
