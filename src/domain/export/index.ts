import { hierarchyPath } from '../business-units/index.ts'
import { pickNamed } from '../localisation/index.ts'
import { riskRating, riskScore } from '../risk-engine/index.ts'
import { historicalTrend } from '../trend/index.ts'
import type {
  BusinessUnit,
  Category,
  CustomAttribute,
  Language,
  RatingMatrix,
  Risk,
  User,
} from '../types/index.ts'

/*
 * Register export (ARCHITECTURE.md §8.2).
 *
 * The row shape matches the as-built v7 export so a saved spreadsheet keeps
 * the same columns in the same order. Scores and ratings are computed here
 * from the configured matrix — they are never read from stored fields,
 * because they are not stored.
 *
 * Phase 1 caveat: export runs entirely in the browser and contains whatever
 * the current user can see. Phase 2 adds a `data.exported` audit event and
 * server-side authorization (ARCHITECTURE.md §4.2).
 */

export interface ExportContext {
  categories: readonly Category[]
  businessUnits: readonly BusinessUnit[]
  users: readonly User[]
  customAttributes: readonly CustomAttribute[]
  matrix: RatingMatrix
  language?: Language
}

export type ExportRow = Record<string, string | number>

/**
 * Builds one export row per risk, in the documented column order.
 *
 * Active custom attributes are appended, keyed by their English label so the
 * header stays stable when the UI language changes.
 */
export function buildExportRows(risks: readonly Risk[], context: ExportContext): ExportRow[] {
  const language = context.language ?? 'en'
  const userName = (id: string) => context.users.find((user) => user.id === id)?.name ?? ''
  const activeAttributes = context.customAttributes.filter((attribute) => attribute.active)

  return risks.map((risk) => {
    const category = context.categories.find((candidate) => candidate.id === risk.categoryId)
    const unit = context.businessUnits.find((candidate) => candidate.id === risk.businessUnitId)

    const row: ExportRow = {
      'Risk ID': risk.ref,
      'Risk Name': risk.title,
      'Category L1': category ? pickNamed(category, 'level1', language) : '',
      'Category L2': category ? pickNamed(category, 'level2', language) : '',
      'Business Unit': unit ? pickNamed(unit, 'name', language) : '',
      'Business Unit Path': hierarchyPath(context.businessUnits, risk.businessUnitId, language),
      'Risk Owner': userName(risk.riskOwnerId),
      Cause: risk.cause,
      Event: risk.event,
      Consequence: risk.consequence,
      'Inherent Impact': risk.inherent.impact,
      'Inherent Likelihood': risk.inherent.likelihood,
      'Inherent Score': riskScore(risk.inherent),
      'Inherent Rating': riskRating(risk.inherent, context.matrix),
      'Residual Impact': risk.residual.impact,
      'Residual Likelihood': risk.residual.likelihood,
      'Residual Score': riskScore(risk.residual),
      'Residual Rating': riskRating(risk.residual, context.matrix),
      'Target Impact': risk.target.impact,
      'Target Likelihood': risk.target.likelihood,
      'Target Score': riskScore(risk.target),
      'Target Rating': riskRating(risk.target, context.matrix),
      Controls: risk.controls.map((control) => control.title).join('; '),
      'Action Plans': risk.actions
        .map((action) => `${action.title} (${action.status}, ${action.dueDate})`)
        .join('; '),
      Response: risk.responseType,
      'Target Date': risk.targetDate,
      Status: risk.status,
      'Historical Trend': historicalTrend(risk.history),
      Outlook: risk.outlook,
    }

    for (const attribute of activeAttributes) {
      row[attribute.labelEn] = risk.custom[attribute.id] ?? ''
    }

    return row
  })
}

// --- CSV --------------------------------------------------------------------

/**
 * Quotes every field and doubles embedded quotes.
 *
 * Quoting unconditionally rather than only when needed is what makes commas,
 * quotes and newlines all safe with one rule — and it matches the v7 output.
 */
export function csvCell(value: string | number | undefined): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

/**
 * Serialises rows as CSV.
 *
 * Prefixed with a UTF-8 BOM so Excel opens Georgian text correctly instead of
 * mangling it as Latin-1.
 */
export function toCsv(rows: readonly ExportRow[]): string {
  if (rows.length === 0) return ''

  const headers = Object.keys(rows[0])
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ]
  // Escaped rather than literal: an inline BOM is invisible in source.
  return `\uFEFF${lines.join('\n')}`
}

// --- SpreadsheetML ----------------------------------------------------------

/** Escapes the five XML entities. */
export function escapeXml(value: string | number | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * SpreadsheetML 2003 workbook — the `.xls` Excel opens directly.
 *
 * Numeric cells are typed as `Number` so Excel sorts and aggregates scores
 * rather than treating them as text.
 */
export function toSpreadsheetXml(rows: readonly ExportRow[], sheetName = 'Risk Register'): string {
  if (rows.length === 0) return ''

  const headers = Object.keys(rows[0])

  const cell = (value: string | number | undefined) =>
    `<Cell><Data ss:Type="${typeof value === 'number' ? 'Number' : 'String'}">${escapeXml(value)}</Data></Cell>`

  const rowsXml = [
    `<Row>${headers.map((header) => cell(header)).join('')}</Row>`,
    ...rows.map((row) => `<Row>${headers.map((header) => cell(row[header])).join('')}</Row>`),
  ].join('')

  return (
    '<?xml version="1.0"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    `<Worksheet ss:Name="${escapeXml(sheetName)}"><Table>${rowsXml}</Table></Worksheet>` +
    '</Workbook>'
  )
}

// --- compact register section ----------------------------------------------

/** Base columns a Compact Register report section may include. */
export const COMPACT_REGISTER_COLUMNS = [
  'ref',
  'title',
  'category',
  'businessUnit',
  'riskOwner',
  'inherent',
  'residual',
  'target',
  'status',
  'outlook',
  'targetDate',
] as const

export type CompactColumn = (typeof COMPACT_REGISTER_COLUMNS)[number]

/**
 * A compact register section must always keep at least one column
 * (ARCHITECTURE.md §8.4).
 */
export function toggleCompactColumn(columns: readonly string[], column: string): string[] {
  if (!columns.includes(column)) return [...columns, column]

  const next = columns.filter((candidate) => candidate !== column)
  return next.length === 0 ? [...columns] : next
}

/** Base columns plus any active custom attribute, for the section's picker. */
export function availableCompactColumns(
  customAttributes: readonly CustomAttribute[],
): { id: string; label: string }[] {
  return [
    ...COMPACT_REGISTER_COLUMNS.map((id) => ({ id, label: id })),
    ...customAttributes
      .filter((attribute) => attribute.active)
      .map((attribute) => ({ id: attribute.id, label: attribute.labelEn })),
  ]
}
