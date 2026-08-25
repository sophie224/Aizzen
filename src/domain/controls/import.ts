import type {
  BusinessUnit,
  ControlConfig,
  RegisterControl,
  User,
} from '../types/index.ts'
import { defaultScaleKey, type ControlScaleName } from './scales.ts'

/*
 * Bulk create/update of controls from a spreadsheet (FR-CR-06).
 *
 * PURE. Parsing, validation and the preview plan are computed here from text
 * the caller has already read; nothing in this module touches a file, a clock
 * or storage. That keeps the validation report testable row by row and lets
 * the same code run server-side in Phase 2.
 *
 * Two security rules from the change request live here (SEC-04):
 *   - a value that could be read as a formula is stored INERTLY, and
 *   - it is neutralised again on export, so a download can never execute in a
 *     spreadsheet client.
 */

export interface ImportColumnSpec {
  key: string
  header: string
  required: boolean
  hint: string
}

/** The upload template's columns, in order (FR-CR-06). */
export const CONTROL_IMPORT_COLUMNS: readonly ImportColumnSpec[] = [
  { key: 'ref', header: 'Control ID', required: false, hint: 'Blank for a new control; an existing ID updates that control' },
  { key: 'businessUnit', header: 'Organization', required: true, hint: 'Business unit code, e.g. TECH' },
  { key: 'name', header: 'Control Name', required: true, hint: 'Required' },
  { key: 'objective', header: 'Control Objective', required: false, hint: 'Free text' },
  { key: 'owner', header: 'Control Owner', required: false, hint: 'Email address of an active user' },
  { key: 'effectiveness', header: 'Control Effectiveness', required: false, hint: 'Configured level name' },
  { key: 'maturity', header: 'Control Maturity', required: false, hint: 'Configured level name' },
  { key: 'assurance', header: 'Assurance Level', required: false, hint: 'Configured level name' },
]

export interface ImportIssue {
  /** 1-based row number as the user sees it in the spreadsheet. */
  row: number
  column: string
  message: string
}

export interface ImportRowPlan {
  row: number
  action: 'create' | 'update' | 'reject'
  /** Present unless the row was rejected. */
  values: {
    ref: string
    businessUnitId: string
    name: string
    objective: string
    ownerId: string
    effectiveness: string
    maturity: string
    assurance: string
  } | null
  /** Set for `update`: the control this row targets. */
  targetId: string | null
  issues: ImportIssue[]
}

export interface ImportPlan {
  rows: ImportRowPlan[]
  created: number
  updated: number
  rejected: number
  /** Problems that stop the whole file, e.g. a missing mandatory header. */
  fileIssues: string[]
}

export interface ImportContext {
  businessUnits: readonly BusinessUnit[]
  users: readonly User[]
  config: ControlConfig
  controls: readonly RegisterControl[]
  /** Business units the importing user may write to (FR-CR-08, SEC-01). */
  allowedBusinessUnitIds: readonly string[]
}

// --- CSV ---------------------------------------------------------------------

/**
 * RFC 4180 reader: quoted fields, escaped quotes, CR/LF inside quotes.
 *
 * Hand-written rather than pulled from a dependency — the format is small,
 * and a parser is a supply-chain surface the change request asks us to keep
 * minimal (SEC-11).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let index = 0

  // A BOM would otherwise become part of the first header.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  while (index < source.length) {
    const char = source[index]

    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }

    if (char === '"') {
      quoted = true
      index += 1
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      index += 1
      continue
    }
    if (char === '\r') {
      index += 1
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      index += 1
      continue
    }

    field += char
    index += 1
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((entry) => entry.some((value) => value.trim().length > 0))
}

/**
 * Neutralises spreadsheet formula injection (SEC-04).
 *
 * A leading `=`, `+`, `-`, `@`, tab or CR makes a spreadsheet client evaluate
 * the cell. Prefixing with an apostrophe keeps the value readable while making
 * it inert; the stored value itself is never altered.
 */
export function neutraliseCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

/** Quotes a value for CSV output, after neutralising it. */
export function toCsvCell(value: string): string {
  const safe = neutraliseCell(value)
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(rows: ReadonlyArray<readonly string[]>): string {
  return rows.map((row) => row.map(toCsvCell).join(',')).join('\r\n')
}

/** The downloadable template: headers plus one worked example row. */
export function importTemplateCsv(exampleUnitCode: string): string {
  return toCsv([
    CONTROL_IMPORT_COLUMNS.map((column) => column.header),
    ['', exampleUnitCode, 'Quarterly access review', 'Privileged access is reviewed each quarter', '', '', '', ''],
  ])
}

// --- validation --------------------------------------------------------------

const MAX_IMPORT_ROWS = 5000
const MAX_CELL_LENGTH = 2000

function normalise(value: string | undefined): string {
  return (value ?? '').trim()
}

/** Accepts either the stable key or the configured display name, either case. */
function resolveScaleKey(config: ControlConfig, scale: ControlScaleName, raw: string): string | null {
  if (raw === '') return defaultScaleKey(config, scale)
  const needle = raw.toLowerCase()

  const match = config[scale].find(
    (level) =>
      level.key.toLowerCase() === needle ||
      level.labelEn.toLowerCase() === needle ||
      level.labelKa.toLowerCase() === needle,
  )
  return match?.key ?? null
}

/**
 * Turns parsed rows into a per-row plan: what would be created, what updated,
 * and exactly why a row is rejected.
 *
 * Nothing is committed here. The caller shows this as the preview the change
 * request requires, and only then applies the accepted rows.
 */
export function planControlImport(rows: readonly (readonly string[])[], context: ImportContext): ImportPlan {
  const plan: ImportPlan = { rows: [], created: 0, updated: 0, rejected: 0, fileIssues: [] }

  if (rows.length === 0) {
    plan.fileIssues.push('The file is empty.')
    return plan
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase())
  const columnIndex = new Map<string, number>()
  for (const column of CONTROL_IMPORT_COLUMNS) {
    const index = headers.indexOf(column.header.toLowerCase())
    if (index >= 0) columnIndex.set(column.key, index)
    else if (column.required) plan.fileIssues.push(`Missing required column "${column.header}".`)
  }
  if (plan.fileIssues.length > 0) return plan

  const body = rows.slice(1)
  if (body.length > MAX_IMPORT_ROWS) {
    plan.fileIssues.push(`The file has ${String(body.length)} rows; the limit is ${String(MAX_IMPORT_ROWS)}.`)
    return plan
  }

  const unitByCode = new Map(context.businessUnits.map((unit) => [unit.code.toUpperCase(), unit]))
  const userByEmail = new Map(context.users.map((user) => [user.email.toLowerCase(), user]))
  const controlByRef = new Map(context.controls.map((control) => [control.ref.toLowerCase(), control]))
  const seenRefs = new Set<string>()

  body.forEach((raw, offset) => {
    // +2: one for the header row, one because users count from 1.
    const rowNumber = offset + 2
    const issues: ImportIssue[] = []
    const cell = (key: string) => normalise(raw[columnIndex.get(key) ?? -1])

    const ref = cell('ref')
    const unitCode = cell('businessUnit')
    const name = cell('name')
    const objective = cell('objective')
    const ownerEmail = cell('owner')

    for (const column of CONTROL_IMPORT_COLUMNS) {
      if (cell(column.key).length > MAX_CELL_LENGTH) {
        issues.push({ row: rowNumber, column: column.header, message: `Longer than ${String(MAX_CELL_LENGTH)} characters.` })
      }
    }

    if (name === '') {
      issues.push({ row: rowNumber, column: 'Control Name', message: 'Required.' })
    }

    const unit = unitByCode.get(unitCode.toUpperCase())
    if (unitCode === '') {
      issues.push({ row: rowNumber, column: 'Organization', message: 'Required.' })
    } else if (!unit) {
      issues.push({ row: rowNumber, column: 'Organization', message: `Unknown business unit code "${unitCode}".` })
    } else if (!context.allowedBusinessUnitIds.includes(unit.id)) {
      // Scope is decided from the session, never from the file (SEC-01).
      issues.push({ row: rowNumber, column: 'Organization', message: 'Outside your access scope.' })
    }

    let ownerId = ''
    if (ownerEmail !== '') {
      const owner = userByEmail.get(ownerEmail.toLowerCase())
      if (!owner) issues.push({ row: rowNumber, column: 'Control Owner', message: `No user with email "${ownerEmail}".` })
      else if (owner.status !== 'Active') issues.push({ row: rowNumber, column: 'Control Owner', message: 'User is not active.' })
      else ownerId = owner.id
    }

    const scales: Array<[ControlScaleName, string, string]> = [
      ['effectiveness', 'Control Effectiveness', cell('effectiveness')],
      ['maturity', 'Control Maturity', cell('maturity')],
      ['assurance', 'Assurance Level', cell('assurance')],
    ]
    const resolved: Record<string, string> = {}
    for (const [scale, header, value] of scales) {
      const key = resolveScaleKey(context.config, scale, value)
      if (key === null) issues.push({ row: rowNumber, column: header, message: `"${value}" is not a configured level.` })
      else resolved[scale] = key
    }

    let target: RegisterControl | null = null
    if (ref !== '') {
      if (seenRefs.has(ref.toLowerCase())) {
        issues.push({ row: rowNumber, column: 'Control ID', message: `Duplicate Control ID "${ref}" in this file.` })
      }
      seenRefs.add(ref.toLowerCase())

      target = controlByRef.get(ref.toLowerCase()) ?? null
      if (target && !context.allowedBusinessUnitIds.includes(target.businessUnitId)) {
        issues.push({ row: rowNumber, column: 'Control ID', message: 'That control is outside your access scope.' })
        target = null
      }
    }

    if (issues.length > 0) {
      plan.rejected += 1
      plan.rows.push({ row: rowNumber, action: 'reject', values: null, targetId: null, issues })
      return
    }

    const action = target ? 'update' : 'create'
    if (action === 'create') plan.created += 1
    else plan.updated += 1

    plan.rows.push({
      row: rowNumber,
      action,
      targetId: target?.id ?? null,
      issues: [],
      values: {
        ref,
        businessUnitId: unit?.id ?? '',
        name,
        objective,
        ownerId,
        effectiveness: resolved.effectiveness,
        maturity: resolved.maturity,
        assurance: resolved.assurance,
      },
    })
  })

  return plan
}
