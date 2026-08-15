import type { AppState, BusinessUnit, PermissionSet, RatingMatrix } from '../../domain/types/index.ts'
import { MODULE_NAMES, SCALE_VALUES } from '../../domain/types/index.ts'
import { isPermissionLevel, isRatingLabel, isRecord } from '../../domain/validation/guards.ts'
import { createSeedMatrix } from '../seed/matrix.ts'
import {
  createSeedDashboards,
  createSeedReportTemplates,
  createSeedSiteContent,
} from '../seed/reporting.ts'
import { createSeedRoles } from '../seed/roles.ts'
import { createSeedUsers } from '../seed/organisation.ts'

/*
 * Reference and structure repair (ARCHITECTURE.md §4.1).
 *
 * Every function here is idempotent: applying it to already-valid state must
 * leave that state unchanged. Repairs are conservative — they never delete a
 * risk, control, action, history item or audit event.
 *
 * Each repair appends a human-readable note so the caller can surface a
 * reconciliation summary.
 */

export type RepairNotes = string[]

/** Columns a Saved View falls back to when it predates column persistence. */
export const DEFAULT_REGISTER_COLUMNS = [
  'ref',
  'title',
  'category',
  'businessUnit',
  'riskOwner',
  'residual',
  'status',
]

const SUPER_ADMIN_ROLE_ID = 'role_super_admin'

/** Fills any module missing from a role's permission set with `none`. */
function completePermissions(raw: unknown): PermissionSet {
  const source = isRecord(raw) ? raw : {}
  const permissions = {} as PermissionSet
  for (const module of MODULE_NAMES) {
    const value = source[module]
    permissions[module] = isPermissionLevel(value) ? value : 'none'
  }
  return permissions
}

export function repairRoles(state: AppState, notes: RepairNotes): void {
  for (const role of state.roles) {
    const completed = completePermissions(role.permissions)
    if (MODULE_NAMES.some((module) => role.permissions[module] !== completed[module])) {
      notes.push(`role ${role.id}: filled missing module permissions with "none"`)
    }
    role.permissions = completed
  }

  if (!state.roles.some((role) => role.id === SUPER_ADMIN_ROLE_ID)) {
    const seeded = createSeedRoles().find((role) => role.id === SUPER_ADMIN_ROLE_ID)
    if (seeded) {
      state.roles.unshift(seeded)
      notes.push('restored missing Super Administrator role')
    }
  }
}

export function repairSuperAdminUser(state: AppState, notes: RepairNotes): void {
  const hasSuperAdmin = state.users.some((user) => user.roleIds.includes(SUPER_ADMIN_ROLE_ID))
  if (hasSuperAdmin) return

  const seeded = createSeedUsers().find((user) => user.roleIds.includes(SUPER_ADMIN_ROLE_ID))
  if (!seeded) return

  // Keep the account reachable: scope it to a unit that actually exists.
  const rootUnit = state.businessUnits.find((unit) => unit.parentId === null) ?? state.businessUnits[0]
  state.users.unshift({ ...seeded, businessUnitIds: rootUnit ? [rootUnit.id] : seeded.businessUnitIds })
  notes.push('restored missing Super Administrator user')
}

/**
 * Repairs the Business Unit tree: absent parents become roots, self-parents
 * are cleared, dangling parents are cleared, and cycles are broken at the node
 * that closes them.
 */
export function repairBusinessUnitTree(state: AppState, notes: RepairNotes): void {
  const units = state.businessUnits
  const byId = new Map<string, BusinessUnit>(units.map((unit) => [unit.id, unit]))

  for (const unit of units) {
    // Flat v7-era units carry no parentId at all — treat them as roots.
    if (unit.parentId === undefined) {
      unit.parentId = null
      notes.push(`business unit ${unit.id}: missing parentId, promoted to root`)
      continue
    }
    if (unit.parentId === null) continue

    if (unit.parentId === unit.id) {
      unit.parentId = null
      notes.push(`business unit ${unit.id}: was its own parent, link cleared`)
      continue
    }

    if (!byId.has(unit.parentId)) {
      notes.push(`business unit ${unit.id}: parent ${unit.parentId} does not exist, link cleared`)
      unit.parentId = null
    }
  }

  // Break cycles by clearing the link on the node where the walk revisits.
  for (const unit of units) {
    const seen = new Set<string>([unit.id])
    let cursor = unit.parentId ? byId.get(unit.parentId) : undefined

    while (cursor) {
      if (seen.has(cursor.id)) {
        notes.push(`business unit ${cursor.id}: parent link formed a cycle, link cleared`)
        cursor.parentId = null
        break
      }
      seen.add(cursor.id)
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
    }
  }
}

/** Strips Business Unit IDs from user scopes when the unit no longer exists. */
export function repairUserScopes(state: AppState, notes: RepairNotes): void {
  const unitIds = new Set(state.businessUnits.map((unit) => unit.id))
  const roleIds = new Set(state.roles.map((role) => role.id))

  for (const user of state.users) {
    const validUnits = user.businessUnitIds.filter((id) => unitIds.has(id))
    if (validUnits.length !== user.businessUnitIds.length) {
      notes.push(`user ${user.id}: removed business unit references that no longer exist`)
      user.businessUnitIds = validUnits
    }

    const validRoles = user.roleIds.filter((id) => roleIds.has(id))
    if (validRoles.length !== user.roleIds.length) {
      notes.push(`user ${user.id}: removed role references that no longer exist`)
      user.roleIds = validRoles
    }
  }
}

/** Adds `visibleColumns` and `viewMode` to Saved Views that predate them. */
export function repairSavedViews(state: AppState, notes: RepairNotes): void {
  for (const view of state.savedViews) {
    if (!Array.isArray(view.visibleColumns) || view.visibleColumns.length === 0) {
      view.visibleColumns = [...DEFAULT_REGISTER_COLUMNS]
      notes.push(`saved view ${view.id}: restored default visible columns`)
    }
    if (view.viewMode !== 'compact' && view.viewMode !== 'detailed') {
      view.viewMode = 'detailed'
      notes.push(`saved view ${view.id}: restored default view mode`)
    }
    if (!isRecord(view.filters)) view.filters = {}
    if (typeof view.search !== 'string') view.search = ''
    if (!isRecord(view.sort)) view.sort = { field: 'ref', direction: 'asc' }
  }
}

/** Restores seeded defaults for collections that must never be empty. */
export function repairDefaults(state: AppState, notes: RepairNotes): void {
  if (state.dashboards.length === 0) {
    state.dashboards = createSeedDashboards()
    notes.push('restored default dashboard')
  }
  if (state.reportTemplates.length === 0) {
    state.reportTemplates = createSeedReportTemplates()
    notes.push('restored default report template')
  }
  if (!isRecord(state.siteContent) || Object.keys(state.siteContent).length === 0) {
    state.siteContent = createSeedSiteContent()
    notes.push('restored default public site content')
  }
  if (!isRecord(state.branding)) {
    state.branding = { clientLogo: null }
    notes.push('restored default branding')
  }
}

/**
 * Merges any missing or invalid matrix cell and colour from the 2026 defaults,
 * preserving every valid configured cell.
 */
export function repairMatrix(state: AppState, notes: RepairNotes): void {
  const defaults = createSeedMatrix()
  const current: Partial<RatingMatrix> = isRecord(state.matrix)
    ? (state.matrix as RatingMatrix)
    : {}

  const configured = new Map<string, (typeof defaults.cells)[number]>()
  if (Array.isArray(current.cells)) {
    for (const cell of current.cells) {
      if (!isRecord(cell)) continue
      const key = `${String(cell.impact)}:${String(cell.likelihood)}`
      if (!configured.has(key) && isRatingLabel(cell.rating)) configured.set(key, cell)
    }
  }

  let restoredCells = 0
  const cells = defaults.cells.map((fallback) => {
    const key = `${String(fallback.impact)}:${String(fallback.likelihood)}`
    const existing = configured.get(key)
    if (existing) return { impact: fallback.impact, likelihood: fallback.likelihood, rating: existing.rating }
    restoredCells += 1
    return fallback
  })
  if (restoredCells > 0) {
    notes.push(`rating matrix: restored ${String(restoredCells)} missing or invalid cell(s)`)
  }

  const colors = { ...defaults.colors }
  let restoredColors = 0
  if (isRecord(current.colors)) {
    for (const rating of Object.keys(colors) as (keyof typeof colors)[]) {
      const value = current.colors[rating]
      if (typeof value === 'string' && value.trim().length > 0) colors[rating] = value
      else restoredColors += 1
    }
  } else {
    restoredColors = 4
  }
  if (restoredColors > 0) {
    notes.push(`rating matrix: restored ${String(restoredColors)} missing colour(s)`)
  }

  state.matrix = {
    cells,
    colors,
    impactLabels: isRecord(current.impactLabels)
      ? (current.impactLabels as RatingMatrix['impactLabels'])
      : defaults.impactLabels,
    likelihoodLabels: isRecord(current.likelihoodLabels)
      ? (current.likelihoodLabels as RatingMatrix['likelihoodLabels'])
      : defaults.likelihoodLabels,
  }

  // Guarantee a label for every point on both scales.
  for (const value of SCALE_VALUES) {
    state.matrix.impactLabels[value] ??= defaults.impactLabels[value]
    state.matrix.likelihoodLabels[value] ??= defaults.likelihoodLabels[value]
  }
}
