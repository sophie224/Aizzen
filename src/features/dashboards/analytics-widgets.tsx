import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { DashboardAnalytics, HeatCell, StackedBar } from '../../domain/dashboard/analytics.ts'
import { UNASSIGNED_COLOR, UNASSIGNED_KEY } from '../../domain/dashboard/analytics.ts'
import { toCsv, type ExportRow } from '../../domain/export/index.ts'
import { registerLinkFor } from '../../domain/register/filter-params.ts'
import {
  impactDescription,
  impactLabel,
  likelihoodBand,
  likelihoodDescription,
  likelihoodLabel,
} from '../../domain/risk-engine/index.ts'
import { SCALE_VALUES } from '../../domain/types/enums.ts'
import type { AssessmentType, RatingMatrix, RiskFilters, ScaleValue } from '../../domain/types/index.ts'
import { useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { EmptyState } from '../../ui/empty-state.tsx'
import { IconDownload } from '../../ui/icons.tsx'

/*
 * Dashboard widgets (CR-004).
 *
 * Every label and colour arrives already resolved from the saved matrix
 * configuration by the aggregation — these components read no palette and no
 * vocabulary of their own. Each cell, segment and tile is a link into the
 * Register carrying the filters that reproduce exactly what it counts.
 */

/** Downloads a CSV of what a widget currently displays. */
function downloadCsv(filename: string, rows: readonly ExportRow[]): void {
  if (rows.length === 0 || typeof URL.createObjectURL !== 'function') return

  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export interface WidgetFrameProps {
  title: string
  /** Shown as the header's info tooltip. */
  info?: string
  /** Rows exported by the overflow menu; empty disables the action. */
  exportRows: readonly ExportRow[]
  exportName: string
  /** Widget arrangement controls, rendered in the header when editing. */
  controls?: ReactNode
  children: ReactNode
}

export function WidgetFrame(props: WidgetFrameProps) {
  const { t } = useTranslation()

  return (
    <section className="widget">
      <header className="widget__head">
        <h2 title={props.info}>{props.title}</h2>
        <div className="widget__actions">
          {props.controls}
          <button
            type="button"
            className="btn btn--icon"
            aria-label={`${t('dash.exportCsv')}: ${props.title}`}
            title={t('dash.exportCsv')}
            disabled={props.exportRows.length === 0}
            onClick={() => {
              downloadCsv(props.exportName, props.exportRows)
            }}
          >
            <IconDownload size={14} />
          </button>
        </div>
      </header>
      {props.children}
    </section>
  )
}

/** Shown instead of an empty chart frame. */
export function WidgetEmpty() {
  const { t } = useTranslation()
  return <EmptyState inline body={t('dash.noMatch')} />
}

// --- KPI tiles ---------------------------------------------------------------

export function KpiRow({ analytics }: { analytics: DashboardAnalytics }) {
  const { t } = useTranslation()

  return (
    <div className="kpi-row">
      {analytics.kpis.map((tile) => (
        <Link key={tile.id} to={registerLinkFor(tile.filters)} className="kpi">
          {/*
            * Severity rail on the top edge: a configured rating colour, or the
            * neutral accent. Decorative — the caption always names the metric.
            */}
          <span className="kpi__accent" style={{ background: tile.color }} aria-hidden="true" />
          <span className="kpi__value">{tile.value}</span>
          <span className="kpi__caption">{t(`dash.kpi.${tile.id}` as TranslationKey)}</span>
        </Link>
      ))}
    </div>
  )
}

// --- heat map ----------------------------------------------------------------

export interface HeatmapProps {
  analytics: DashboardAnalytics
  matrix: RatingMatrix
  basis: AssessmentType
  onBasisChange: (basis: AssessmentType) => void
  filters: RiskFilters
}

const ASSESSMENTS: readonly AssessmentType[] = ['inherent', 'residual', 'target']

export function HeatmapWidget(props: HeatmapProps) {
  const { t, language } = useTranslation()
  const { matrix } = props

  const cellAt = (impact: ScaleValue, likelihood: ScaleValue): HeatCell | undefined =>
    props.analytics.heatmap.cells.find(
      (cell) => cell.impact === impact && cell.likelihood === likelihood,
    )

  // Rows are likelihood, columns are impact (CR-004 §3.1).
  const rows = [...SCALE_VALUES].reverse()

  return (
    <>
      <fieldset className="segmented heatmap__basis">
        <legend className="visually-hidden">{t('dash.basis')}</legend>
        {ASSESSMENTS.map((basis) => (
          <label key={basis} className={props.basis === basis ? 'is-active' : undefined}>
            <input
              type="radio"
              name="heatmap-basis"
              value={basis}
              checked={props.basis === basis}
              onChange={() => {
                props.onBasisChange(basis)
              }}
            />
            <span>{t(`editor.assessment.${basis}` as TranslationKey)}</span>
          </label>
        ))}
      </fieldset>

      <div className="scroll-x">
        <table className="heatmap">
          <caption className="visually-hidden">
            {t('dash.heatmap')} — {t(`editor.assessment.${props.basis}` as TranslationKey)}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">
                  {t('editor.field.likelihood')} / {t('editor.field.impact')}
                </span>
              </th>
              {SCALE_VALUES.map((impact) => (
                <th
                  key={impact}
                  scope="col"
                  title={[impactLabel(impact, matrix, language), impactDescription(impact, matrix, language)]
                    .filter(Boolean)
                    .join(' — ')}
                >
                  {impactLabel(impact, matrix, language)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((likelihood) => (
              <tr key={likelihood}>
                <th
                  scope="row"
                  title={[
                    likelihoodLabel(likelihood, matrix, language),
                    likelihoodBand(likelihood, matrix, language),
                    likelihoodDescription(likelihood, matrix, language),
                  ]
                    .filter(Boolean)
                    .join(' — ')}
                >
                  {likelihoodLabel(likelihood, matrix, language)}
                </th>
                {SCALE_VALUES.map((impact) => {
                  const cell = cellAt(impact, likelihood)
                  if (!cell) return <td key={impact} />

                  const label = `${impactLabel(impact, matrix, language)} × ${likelihoodLabel(likelihood, matrix, language)}: ${String(cell.count)}`

                  return (
                    <td key={impact} style={{ background: cell.color }}>
                      <Link
                        to={registerLinkFor({
                          ...props.filters,
                          basis: props.basis,
                          impact,
                          likelihood,
                        })}
                        className={cell.count === 0 ? 'heatmap__cell is-empty' : 'heatmap__cell'}
                        aria-label={label}
                        title={label}
                      >
                        {cell.count}
                      </Link>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="widget__foot">
        <span>{t('editor.field.impact')} →</span>
        {props.analytics.heatmap.unassessed > 0 ? (
          <span>
            {props.analytics.heatmap.unassessed} {t('dash.unassessed')}
          </span>
        ) : null}
      </p>
    </>
  )
}

// --- stacked bars ------------------------------------------------------------

/** Below this share of the widest bar a segment shows no inline label. */
const LABEL_THRESHOLD = 0.08

export interface StackedBarsProps {
  bars: readonly StackedBar[]
  /** Resolves the Unassigned and Other sentinels to localised text. */
  labelFor: (bar: StackedBar) => string
}

export function StackedBars(props: StackedBarsProps) {
  const { t } = useTranslation()
  const max = Math.max(1, ...props.bars.map((bar) => bar.total))

  if (props.bars.length === 0) return <WidgetEmpty />

  return (
    <ul className="bars">
      {props.bars.map((bar) => (
        <li key={bar.key} className="bars__row">
          <span className="bars__label" title={bar.contains?.join(', ') ?? props.labelFor(bar)}>
            {props.labelFor(bar)}
          </span>

          <span className="bars__track">
            {bar.segments
              .filter((segment) => segment.count > 0)
              .map((segment) => {
                const share = segment.count / max
                const title = `${props.labelFor(bar)} · ${segment.label}: ${String(segment.count)}`

                return (
                  <Link
                    key={segment.key}
                    to={registerLinkFor(segment.filters)}
                    className="bars__segment"
                    style={{
                      width: `${String(share * 100)}%`,
                      background: bar.key === UNASSIGNED_KEY ? UNASSIGNED_COLOR : segment.color,
                    }}
                    aria-label={title}
                    title={title}
                  >
                    {/* The count hides on a narrow segment; the tooltip keeps it. */}
                    {share >= LABEL_THRESHOLD ? (
                      <span className="bars__count">{segment.count}</span>
                    ) : null}
                  </Link>
                )
              })}
            {bar.total === 0 ? <span className="bars__none">{t('dash.zero')}</span> : null}
          </span>

          <span className="bars__total">{bar.total}</span>
        </li>
      ))}
    </ul>
  )
}
