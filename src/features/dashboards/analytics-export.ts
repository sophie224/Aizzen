import type { DashboardAnalytics, StackedBar } from '../../domain/dashboard/analytics.ts'
import type { ExportRow } from '../../domain/export/index.ts'
import { impactLabel, likelihoodLabel } from '../../domain/risk-engine/index.ts'
import type { RatingMatrix } from '../../domain/types/index.ts'

/*
 * CSV shapes for the dashboard widgets (CR-004).
 *
 * Built from the same aggregation the widgets render, so an export always
 * matches what is on screen. Header text is passed in already localised — this
 * module owns no vocabulary of its own.
 */

export function kpiExportRows(
  analytics: DashboardAnalytics,
  label: (id: string) => string,
): ExportRow[] {
  return analytics.kpis.map((tile) => ({ Measure: label(tile.id), Count: tile.value }))
}

export function heatmapExportRows(
  analytics: DashboardAnalytics,
  matrix: RatingMatrix,
  language: 'en' | 'ka',
  headers: { impact: string; likelihood: string; count: string },
): ExportRow[] {
  return analytics.heatmap.cells.map((cell) => ({
    [headers.impact]: impactLabel(cell.impact, matrix, language),
    [headers.likelihood]: likelihoodLabel(cell.likelihood, matrix, language),
    [headers.count]: cell.count,
  }))
}

export function barsExportRows(
  bars: readonly StackedBar[],
  labelFor: (bar: StackedBar) => string,
  headers: { dimension: string; total: string },
): ExportRow[] {
  return bars.map((bar) => {
    const row: ExportRow = { [headers.dimension]: labelFor(bar), [headers.total]: bar.total }
    for (const segment of bar.segments) row[segment.label] = segment.count
    return row
  })
}
