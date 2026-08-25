import type {
  AppState,
  BusinessUnit,
  DemoRequest,
  PermissionSet,
  RatingMatrix,
} from '../../domain/types/index.ts'
import { MODULE_NAMES, SCALE_VALUES } from '../../domain/types/index.ts'
import {
  createDefaultControlConfig,
  nextControlRef,
  nextDeficiencyRef,
} from '../../domain/controls/index.ts'
import { normaliseCompactColumns } from '../../domain/export/index.ts'
import { RISK_DESCRIPTION_MAX_LENGTH } from '../../domain/risk-editor/index.ts'
import {
  isDemoRequestStatus,
  isLanguage,
  isNonEmptyString,
  isPermissionLevel,
  isRatingLabel,
  isRecord,
  isStringArray,
} from '../../domain/validation/guards.ts'
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

/**
 * Adds the manual `description` to risks that predate it (CR-002).
 *
 * Conservative and idempotent: a stored description is never replaced, and it
 * is never back-filled from cause / event / consequence — an empty field means
 * "nobody has written one yet", which is exactly what the Register shows.
 */
export function repairRisks(state: AppState, notes: RepairNotes): void {
  let filled = 0
  let clamped = 0

  for (const risk of state.risks) {
    if (typeof risk.description !== 'string') {
      risk.description = ''
      filled += 1
      continue
    }
    if (risk.description.length > RISK_DESCRIPTION_MAX_LENGTH) {
      risk.description = risk.description.slice(0, RISK_DESCRIPTION_MAX_LENGTH)
      clamped += 1
    }
  }

  if (filled > 0) notes.push(`risks: added an empty description to ${String(filled)} record(s)`)
  if (clamped > 0) notes.push(`risks: clamped ${String(clamped)} over-length description(s)`)
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

/**
 * Normalises the column list of every Compact Register report section.
 *
 * A section stores raw column ids, so a template written against an older build
 * — or carrying an attribute that was removed by hand — can name a column no
 * renderer covers. Such a column has no label to resolve, which used to blank
 * the whole Reports page. Unknown ids are dropped and a section left with none
 * falls back to the default column set, since the section must always keep at
 * least one (ARCHITECTURE.md §8.4).
 */
export function repairReportSections(state: AppState, notes: RepairNotes): void {
  const attributeIds = new Set(state.customAttributes.map((attribute) => attribute.id))

  for (const template of state.reportTemplates) {
    for (const section of template.sections) {
      if (section.type !== 'compactRegister') continue

      const columns = Array.isArray(section.columns) ? section.columns : []
      const next = normaliseCompactColumns(columns, attributeIds) ?? [...DEFAULT_REGISTER_COLUMNS]

      if (next.length !== columns.length || next.some((column, at) => column !== columns[at])) {
        notes.push(`report ${template.id} / section ${section.id}: normalised register columns`)
        section.columns = next
      }
    }
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
  } else {
    repairSiteContentFields(state, notes)
  }
  if (!isRecord(state.branding)) {
    state.branding = { clientLogo: null }
    notes.push('restored default branding')
  }
}

/**
 * Fills site-content fields a stored record predates.
 *
 * Every schema step that adds public copy — the request-demo page in 12 — would
 * otherwise render blank for an organisation whose content was saved before it.
 * Only ABSENT keys are filled: a value an administrator configured, including a
 * deliberately emptied one, is never overwritten.
 */
function repairSiteContentFields(state: AppState, notes: RepairNotes): void {
  const defaults = createSeedSiteContent() as unknown as Record<string, unknown>
  const content = state.siteContent as unknown as Record<string, unknown>
  const filled: string[] = []

  for (const [key, value] of Object.entries(defaults)) {
    if (content[key] === undefined) {
      content[key] = structuredClone(value)
      filled.push(key)
    }
  }

  if (filled.length > 0) {
    notes.push(`site content: filled ${String(filled.length)} missing field(s)`)
  }
}

/**
 * Parses a legacy probability string such as `36%-65%` into a band.
 *
 * Anything that does not parse is preserved as free text rather than dropped —
 * an organisation may already have written "Once in 10 years" there.
 */
function parseLegacyBand(probability: unknown): {
  percentFrom: number | null
  percentTo: number | null
  textEn: string
} {
  if (typeof probability !== 'string' || probability.trim().length === 0) {
    return { percentFrom: null, percentTo: null, textEn: '' }
  }

  const match = /^\s*(\d{1,3})\s*%?\s*[-–—]\s*(\d{1,3})\s*%?\s*$/.exec(probability)
  if (!match) return { percentFrom: null, percentTo: null, textEn: probability.trim() }

  const from = Number(match[1])
  const to = Number(match[2])
  if (from > 100 || to > 100) {
    return { percentFrom: null, percentTo: null, textEn: probability.trim() }
  }
  return { percentFrom: from, percentTo: to, textEn: '' }
}

/**
 * Merges any missing or invalid matrix cell and colour from the 2026 defaults,
 * preserving every valid configured cell.
 *
 * Also brings a pre-CR-003 matrix up to the configurable shape: version, scale
 * name, level display names, criterion descriptions and percentage bands. Every
 * value an administrator had already configured is preserved; only absent ones
 * are filled.
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

  // --- CR-003 configuration fields -------------------------------------------

  const scaleNameEn =
    typeof current.scaleNameEn === 'string' && current.scaleNameEn.trim().length > 0
      ? current.scaleNameEn
      : defaults.scaleNameEn
  const scaleNameKa = typeof current.scaleNameKa === 'string' ? current.scaleNameKa : defaults.scaleNameKa

  // Level display names are keyed by the stable rating key, so a configured
  // rename survives while a missing entry falls back to the default name.
  const configuredLevels = Array.isArray(current.levels) ? current.levels : []
  const levels = defaults.levels.map((fallback) => {
    const existing = configuredLevels.find(
      (level) => isRecord(level) && level.key === fallback.key,
    )
    if (!isRecord(existing)) return fallback
    return {
      key: fallback.key,
      nameEn:
        typeof existing.nameEn === 'string' && existing.nameEn.trim().length > 0
          ? existing.nameEn
          : fallback.nameEn,
      nameKa: typeof existing.nameKa === 'string' ? existing.nameKa : fallback.nameKa,
      order: typeof existing.order === 'number' ? existing.order : fallback.order,
    }
  })

  state.matrix = {
    version: typeof current.version === 'number' && current.version > 0 ? current.version : 1,
    scaleNameEn,
    scaleNameKa,
    cells,
    levels,
    colors,
    impactLabels: isRecord(current.impactLabels)
      ? (current.impactLabels as RatingMatrix['impactLabels'])
      : defaults.impactLabels,
    likelihoodLabels: isRecord(current.likelihoodLabels)
      ? (current.likelihoodLabels as RatingMatrix['likelihoodLabels'])
      : defaults.likelihoodLabels,
  }

  // Guarantee a complete criterion for every point on both scales.
  let filledCriteria = 0
  for (const value of SCALE_VALUES) {
    const impact = state.matrix.impactLabels[value]
    if (!isRecord(impact)) {
      state.matrix.impactLabels[value] = defaults.impactLabels[value]
      filledCriteria += 1
    } else {
      impact.descriptionEn ??= defaults.impactLabels[value].descriptionEn
      impact.descriptionKa ??= defaults.impactLabels[value].descriptionKa
    }

    const likelihood = state.matrix.likelihoodLabels[value]
    if (!isRecord(likelihood)) {
      state.matrix.likelihoodLabels[value] = defaults.likelihoodLabels[value]
      filledCriteria += 1
      continue
    }

    likelihood.descriptionEn ??= defaults.likelihoodLabels[value].descriptionEn
    likelihood.descriptionKa ??= defaults.likelihoodLabels[value].descriptionKa
    likelihood.textKa ??= ''

    // A pre-CR-003 matrix carries the band as the display string `36%-65%`.
    if (likelihood.percentFrom === undefined && likelihood.percentTo === undefined) {
      const parsed = parseLegacyBand((likelihood as { probability?: unknown }).probability)
      likelihood.percentFrom = parsed.percentFrom
      likelihood.percentTo = parsed.percentTo
      likelihood.textEn ??= parsed.textEn
      filledCriteria += 1
    }
    likelihood.textEn ??= ''
  }

  if (filledCriteria > 0) {
    notes.push(`rating matrix: completed ${String(filledCriteria)} scale criterion field(s)`)
  }

  if (!Array.isArray(state.matrixVersions)) state.matrixVersions = []
}

/**
 * Normalises the public demo-request intake (schema 12).
 *
 * The collection is appended to by unauthenticated visitors, so stored records
 * are treated as untrusted input on the way back in: every field is coerced to
 * its declared type, the handling state falls back to `New`, and unknown
 * solution references are dropped rather than left dangling. Entries that are
 * not objects at all are the one thing removed — there is nothing in them to
 * preserve.
 */
export function repairDemoRequests(state: AppState, notes: RepairNotes): void {
  if (!Array.isArray(state.demoRequests)) {
    state.demoRequests = []
    return
  }

  const solutionIds = new Set(
    (Array.isArray(state.siteContent.solutions) ? state.siteContent.solutions : []).map(
      (solution) => solution.id,
    ),
  )

  const dropped = state.demoRequests.length
  const repaired: DemoRequest[] = []

  state.demoRequests.forEach((candidate, index) => {
    if (!isRecord(candidate)) return

    const raw = candidate as unknown as Record<string, unknown>
    const text = (key: string): string => (typeof raw[key] === 'string' ? (raw[key] as string) : '')

    repaired.push({
      id: isNonEmptyString(raw.id) ? raw.id : `demo_recovered_${String(index)}`,
      submittedAt: text('submittedAt'),
      firstName: text('firstName'),
      lastName: text('lastName'),
      email: text('email'),
      jobTitle: text('jobTitle'),
      company: text('company'),
      country: text('country'),
      phone: text('phone'),
      solutionIds: (isStringArray(raw.solutionIds) ? raw.solutionIds : []).filter((id) =>
        solutionIds.has(id),
      ),
      message: text('message'),
      consent: raw.consent === true,
      language: isLanguage(raw.language) ? raw.language : 'en',
      status: isDemoRequestStatus(raw.status) ? raw.status : 'New',
      handledBy: text('handledBy'),
      handledAt: text('handledAt'),
      notes: text('notes'),
    })
  })

  state.demoRequests = repaired

  if (repaired.length !== dropped) {
    notes.push(`demo requests: dropped ${String(dropped - repaired.length)} unreadable entry(ies)`)
  }
}

/**
 * Control Register, findings, links and configuration (CR-2026).
 *
 * Additive and conservative, in that order of priority:
 *
 *   - a missing collection or configuration is created from defaults;
 *   - a configured scale is NEVER overwritten, only completed when a whole
 *     scale is missing, so an administrator's levels and colours survive;
 *   - a control whose business unit no longer exists is re-homed to the root
 *     unit rather than deleted — the CR forbids destructive repair, and a
 *     control still carries its evidence and its findings;
 *   - only genuinely unresolvable records are dropped: a finding pointing at
 *     no control, and a link pointing at no risk or no control.
 */
export function repairControlRegister(state: AppState, notes: RepairNotes): void {
  if (!isRecord(state.controlConfig)) {
    state.controlConfig = createDefaultControlConfig()
    notes.push('Seeded the default control scales.')
  } else {
    const defaults = createDefaultControlConfig()
    for (const scale of ['effectiveness', 'maturity', 'assurance', 'classifications'] as const) {
      const configured = state.controlConfig[scale]
      if (!Array.isArray(configured) || configured.length === 0) {
        state.controlConfig[scale] = defaults[scale]
        notes.push(`Restored the default ${scale} scale.`)
      }
    }
    if (!Array.isArray(state.controlConfig.customColumns)) state.controlConfig.customColumns = []
    if (typeof state.controlConfig.version !== 'number') state.controlConfig.version = 1
  }

  const rootUnit = state.businessUnits.find((unit) => unit.parentId === null) ?? state.businessUnits[0]
  const unitIds = new Set(state.businessUnits.map((unit) => unit.id))
  const userIds = new Set(state.users.map((user) => user.id))

  const seenRefs = new Set<string>()
  state.controls = state.controls.filter(isRecord).map((control, index) => {
    if (!isNonEmptyString(control.id)) control.id = `ctl_recovered_${String(index)}`

    // References must stay unique: they are the register's business key.
    if (!isNonEmptyString(control.ref) || seenRefs.has(control.ref)) {
      control.ref = nextControlRef(state.controls.filter((other) => other !== control))
      notes.push(`Reissued the Control ID for control ${control.id}.`)
    }
    seenRefs.add(control.ref)

    if (!unitIds.has(control.businessUnitId) && rootUnit) {
      notes.push(`Control ${control.ref} pointed at a missing business unit; re-homed to ${rootUnit.code}.`)
      control.businessUnitId = rootUnit.id
    }
    if (control.ownerId !== '' && !userIds.has(control.ownerId)) {
      notes.push(`Control ${control.ref} pointed at a missing owner; ownership cleared.`)
      control.ownerId = ''
    }
    if (!Array.isArray(control.evidence)) control.evidence = []
    if (!isRecord(control.custom)) control.custom = {}
    return control
  })

  const controlIds = new Set(state.controls.map((control) => control.id))

  const findingsBefore = state.controlDeficiencies.length
  const seenFindingRefs = new Set<string>()
  state.controlDeficiencies = state.controlDeficiencies
    .filter(isRecord)
    .filter((deficiency) => controlIds.has(deficiency.controlId))
    .map((deficiency, index) => {
      if (!isNonEmptyString(deficiency.id)) deficiency.id = `cdf_recovered_${String(index)}`
      if (!isNonEmptyString(deficiency.ref) || seenFindingRefs.has(deficiency.ref)) {
        deficiency.ref = nextDeficiencyRef(
          state.controlDeficiencies.filter((other) => other !== deficiency),
        )
      }
      seenFindingRefs.add(deficiency.ref)

      if (!unitIds.has(deficiency.businessUnitId)) {
        // A finding follows its control's unit, which the step above repaired.
        const parent = state.controls.find((control) => control.id === deficiency.controlId)
        deficiency.businessUnitId = parent?.businessUnitId ?? rootUnit?.id ?? ''
      }
      if (deficiency.remediationOwnerId !== '' && !userIds.has(deficiency.remediationOwnerId)) {
        deficiency.remediationOwnerId = ''
      }
      if (!isRecord(deficiency.custom)) deficiency.custom = {}
      return deficiency
    })
  if (state.controlDeficiencies.length !== findingsBefore) {
    notes.push(
      `Dropped ${String(findingsBefore - state.controlDeficiencies.length)} finding(s) with no matching control.`,
    )
  }

  const riskIds = new Set(state.risks.map((risk) => risk.id))
  const linksBefore = state.controlRiskLinks.length
  const seenLinks = new Set<string>()
  state.controlRiskLinks = state.controlRiskLinks.filter((link) => {
    if (!isRecord(link)) return false
    if (!riskIds.has(link.riskId) || !controlIds.has(link.controlId)) return false

    const key = `${link.riskId}::${link.controlId}`
    if (seenLinks.has(key)) return false
    seenLinks.add(key)
    return true
  })
  if (state.controlRiskLinks.length !== linksBefore) {
    notes.push(
      `Dropped ${String(linksBefore - state.controlRiskLinks.length)} risk–control link(s) that no longer resolve.`,
    )
  }

  // A stale column preference must never block rendering, so it is repaired
  // rather than trusted: unknown users go, unknown ids are filtered on read.
  state.controlColumnPreferences = state.controlColumnPreferences.filter(
    (preference) =>
      isRecord(preference) && userIds.has(preference.userId) && Array.isArray(preference.columnIds),
  )
}
