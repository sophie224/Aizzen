import { filterRisks, type DashboardContext } from '../../domain/dashboard/index.ts'
import { isCompactColumn } from '../../domain/export/index.ts'
import { assess } from '../../domain/risk-engine/index.ts'
import type {
  CompactRegisterReportSection,
  DashboardReportSection,
  OpenTextReportSection,
  Risk,
} from '../../domain/types/index.ts'
import { pickNamed, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { WidgetBody } from '../dashboards/dashboard-widget.tsx'

/*
 * Report section renderers (ARCHITECTURE.md §8.4).
 *
 * Each section carries its OWN filters, so one report can present the same
 * dashboard at several scopes.
 */

export interface SectionRenderProps<T> {
  section: T
  risks: readonly Risk[]
  context: DashboardContext
}

export function DashboardSectionView({
  section,
  risks,
  context,
}: SectionRenderProps<DashboardReportSection>) {
  const { t, language } = useTranslation()
  const dashboard = context.dashboards.find((candidate) => candidate.id === section.dashboardId)

  if (!dashboard) return null

  // The section's own filters, not the dashboard's saved ones.
  const scoped = filterRisks(risks, section.filters, context)

  return (
    <section className="report-section" aria-labelledby={`section-${section.id}`}>
      <h2 id={`section-${section.id}`}>{pickNamed(dashboard, 'name', language)}</h2>
      <p className="panel__meta">
        {scoped.length} {t('report.rowCount')}
      </p>

      <div className="report-widgets">
        {dashboard.widgets.map((widget) => (
          <article
            key={widget.id}
            className="report-widget"
            style={{ gridColumn: `span ${String(widget.span)}`, borderTopColor: widget.accentColor }}
          >
            <h3>{pickNamed(widget, 'title', language)}</h3>
            <WidgetBody widget={widget} risks={scoped} context={context} />
          </article>
        ))}
      </div>
    </section>
  )
}

export function OpenTextSectionView({ section }: SectionRenderProps<OpenTextReportSection>) {
  const { language } = useTranslation()
  const body = pickNamed(section, 'body', language)

  return (
    <section className="report-section" aria-labelledby={`section-${section.id}`}>
      <h2 id={`section-${section.id}`}>{pickNamed(section, 'title', language)}</h2>
      {/* Narrative text, kept as authored — used for Executive Summary,
          Management Commentary, Recommendations and Decisions Required. */}
      {body.split('\n').map((paragraph, index) =>
        paragraph.trim().length > 0 ? <p key={`${section.id}-${String(index)}`}>{paragraph}</p> : null,
      )}
    </section>
  )
}

export function CompactRegisterSectionView({
  section,
  risks,
  context,
}: SectionRenderProps<CompactRegisterReportSection>) {
  const { t, language } = useTranslation()
  const scoped = filterRisks(risks, section.filters, context)

  const cell = (risk: Risk, column: string): string => {
    switch (column) {
      case 'ref': return risk.ref
      case 'title': return risk.title
      case 'category': return context.index.categoryLabel.get(risk.categoryId) ?? '—'
      case 'businessUnit': return context.index.businessUnitLabel.get(risk.businessUnitId) ?? '—'
      case 'riskOwner': return context.index.userName.get(risk.riskOwnerId) ?? '—'
      case 'inherent': {
        const view = assess(risk.inherent, context.matrix)
        return `${String(view.score)} · ${view.rating}`
      }
      case 'residual': {
        const view = assess(risk.residual, context.matrix)
        return `${String(view.score)} · ${view.rating}`
      }
      case 'target': {
        const view = assess(risk.target, context.matrix)
        return `${String(view.score)} · ${view.rating}`
      }
      case 'status': return risk.status
      case 'outlook': return risk.outlook
      case 'targetDate': return risk.targetDate
      default: {
        // Custom attribute, keyed by attribute ID.
        const value = risk.custom[column]
        return value === undefined || value === '' ? '—' : String(value)
      }
    }
  }

  const headerLabel = (column: string): string => {
    const attribute = context.customAttributes.find((candidate) => candidate.id === column)
    if (attribute) return pickNamed(attribute, 'label', language)
    // Columns come from a stored template, so an id the dictionary does not
    // cover is reachable (a legacy slug, or an attribute removed by hand). Show
    // the raw id rather than looking up a key that does not exist.
    if (!isCompactColumn(column)) return column
    return t(`register.column.${column}` as TranslationKey)
  }

  return (
    <section className="report-section" aria-labelledby={`section-${section.id}`}>
      <h2 id={`section-${section.id}`}>{pickNamed(section, 'title', language)}</h2>
      <p className="panel__meta">
        {scoped.length} {t('report.rowCount')}
      </p>

      <div className="scroll-x">
        <table className="report-table">
          <thead>
            <tr>
              {section.columns.map((column) => (
                <th key={column} scope="col">{headerLabel(column)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scoped.map((risk) => (
              <tr key={risk.id}>
                {section.columns.map((column) => (
                  <td key={column}>{cell(risk, column)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
