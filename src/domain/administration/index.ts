import { canReparent, descendantIds, effectiveScope } from '../business-units/index.ts'
import type {
  AppState,
  BusinessUnit,
  Category,
  CustomAttribute,
  Risk,
  Role,
  User,
} from '../types/index.ts'

/*
 * Risk Administration master-data rules (ARCHITECTURE.md §8.5).
 *
 * Pure validation and counting. The UI renders these results; it never decides
 * for itself whether a code is duplicated or a parent would form a cycle.
 */

export interface ValidationIssue {
  field: string
  messageKey: string
}

// --- overview metrics -------------------------------------------------------

export interface AdministrationMetrics {
  readonly activeCategories: number
  readonly activeBusinessUnits: number
  readonly activeUsers: number
  readonly activeCustomAttributes: number
  readonly roles: number
  readonly auditEvents: number
}

/**
 * Overview counts (ARCHITECTURE.md §8.5).
 *
 *   active count = items where active / status is true / Active
 *   role count   = ALL configured roles, active or not
 *   audit count  = AppState.auditEvents.length
 */
export function administrationMetrics(state: AppState): AdministrationMetrics {
  return {
    activeCategories: state.categories.filter((category) => category.active).length,
    activeBusinessUnits: state.businessUnits.filter((unit) => unit.active).length,
    activeUsers: state.users.filter((user) => user.status === 'Active').length,
    activeCustomAttributes: state.customAttributes.filter((attribute) => attribute.active).length,
    roles: state.roles.length,
    auditEvents: state.auditEvents.length,
  }
}

// --- categories -------------------------------------------------------------

/**
 * English labels are required; Georgian is optional and falls back at render
 * time (ARCHITECTURE.md §9).
 */
export function validateCategory(category: Category): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (category.level1En.trim().length === 0) {
    issues.push({ field: 'level1En', messageKey: 'admin.error.level1Required' })
  }
  if (category.level2En.trim().length === 0) {
    issues.push({ field: 'level2En', messageKey: 'admin.error.level2Required' })
  }
  return issues
}

/** How many risks reference this category, deciding whether it is safe to retire. */
export function categoryUsageCount(risks: readonly Risk[], categoryId: string): number {
  return risks.filter((risk) => risk.categoryId === categoryId).length
}

// --- business units ---------------------------------------------------------

export interface BusinessUnitValidationContext {
  units: readonly BusinessUnit[]
  /** Omitted when creating. */
  editingId?: string
}

/**
 * Business Unit save rules (ARCHITECTURE.md §8.5).
 *
 * Blocks: empty code or English name, a duplicate code, the node as its own
 * parent, and any parent choice that would create a cycle.
 */
export function validateBusinessUnit(
  unit: BusinessUnit,
  context: BusinessUnitValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const code = unit.code.trim()

  if (code.length === 0) issues.push({ field: 'code', messageKey: 'admin.error.codeRequired' })
  if (unit.nameEn.trim().length === 0) {
    issues.push({ field: 'nameEn', messageKey: 'admin.error.nameRequired' })
  }

  // Codes are compared case-insensitively; they are uppercased on save.
  const duplicate = context.units.some(
    (candidate) =>
      candidate.id !== context.editingId &&
      candidate.code.trim().toUpperCase() === code.toUpperCase() &&
      code.length > 0,
  )
  if (duplicate) issues.push({ field: 'code', messageKey: 'admin.error.codeDuplicate' })

  if (unit.parentId !== null) {
    if (context.editingId !== undefined && unit.parentId === context.editingId) {
      issues.push({ field: 'parentId', messageKey: 'admin.error.selfParent' })
    } else if (
      context.editingId !== undefined &&
      !canReparent(context.units, context.editingId, unit.parentId)
    ) {
      issues.push({ field: 'parentId', messageKey: 'admin.error.cycle' })
    } else if (!context.units.some((candidate) => candidate.id === unit.parentId)) {
      issues.push({ field: 'parentId', messageKey: 'admin.error.parentMissing' })
    }
  }

  return issues
}

export interface BusinessUnitCounts {
  /** Users with this unit as a DIRECT grant. */
  readonly directUsers: number
  /** Risks whose businessUnitId is exactly this unit. */
  readonly directRisks: number
  /** Descendants, excluding the unit itself. */
  readonly descendants: number
}

/**
 * The three counts the tree displays per node (ARCHITECTURE.md §8.5).
 *
 * Direct rather than inherited on purpose: an administrator deciding whether
 * to deactivate a unit needs to know what is attached to it specifically.
 */
export function businessUnitCounts(
  unit: BusinessUnit,
  units: readonly BusinessUnit[],
  users: readonly User[],
  risks: readonly Risk[],
): BusinessUnitCounts {
  return {
    directUsers: users.filter((user) => user.businessUnitIds.includes(unit.id)).length,
    directRisks: risks.filter((risk) => risk.businessUnitId === unit.id).length,
    descendants: descendantIds(units, unit.id).length - 1,
  }
}

/**
 * Direct grants split from the units they pull in by inheritance.
 *
 * Inherited entries are shown as `Inherited` and cannot be unchecked while the
 * parent grant stands (ARCHITECTURE.md §5.4).
 */
export function splitScope(
  units: readonly BusinessUnit[],
  directUnitIds: readonly string[],
): { direct: string[]; inherited: string[] } {
  const direct = new Set(directUnitIds)
  const effective = effectiveScope(units, directUnitIds)
  return {
    direct: [...direct],
    inherited: effective.filter((id) => !direct.has(id)),
  }
}

// --- users ------------------------------------------------------------------

/**
 * User save rules (ARCHITECTURE.md §8.5).
 *
 * Name, email, at least one role and at least one direct Business Unit scope.
 * Email UNIQUENESS is deliberately not enforced — the specification records it
 * as a Phase 1 limitation, and blocking here would diverge from the as-built.
 * `duplicateEmailIds` surfaces it as a warning instead.
 */
export function validateUser(user: User): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (user.name.trim().length === 0) {
    issues.push({ field: 'name', messageKey: 'admin.error.userNameRequired' })
  }
  if (user.email.trim().length === 0) {
    issues.push({ field: 'email', messageKey: 'admin.error.emailRequired' })
  }
  if (user.roleIds.length === 0) {
    issues.push({ field: 'roleIds', messageKey: 'admin.error.roleRequired' })
  }
  if (user.businessUnitIds.length === 0) {
    issues.push({ field: 'businessUnitIds', messageKey: 'admin.error.scopeRequired' })
  }

  return issues
}

/**
 * Other accounts sharing this email, compared case-insensitively.
 *
 * Non-blocking: it drives a warning so an administrator can see the collision
 * that would otherwise make sign-in resolve to whichever record comes first.
 */
export function duplicateEmailIds(user: User, users: readonly User[]): string[] {
  const normalised = user.email.trim().toLowerCase()
  if (normalised.length === 0) return []

  return users
    .filter((candidate) => candidate.id !== user.id && candidate.email.trim().toLowerCase() === normalised)
    .map((candidate) => candidate.id)
}

// --- roles ------------------------------------------------------------------

export function validateRole(role: Role): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (role.nameEn.trim().length === 0) {
    issues.push({ field: 'nameEn', messageKey: 'admin.error.roleNameRequired' })
  }
  return issues
}

/** Users currently holding this role, so an administrator sees the blast radius. */
export function roleUsageCount(users: readonly User[], roleId: string): number {
  return users.filter((user) => user.roleIds.includes(roleId)).length
}

// --- branding ---------------------------------------------------------------

/**
 * Client logo upload limits (ARCHITECTURE.md §8.5).
 *
 * Phase 1 stores the image as a base64 data URL inside AppState, which lands
 * in browser storage — so an oversized file exhausts the quota and the whole
 * save fails. Checking up front turns that into a clear message instead of a
 * silent write failure. Phase 2 moves this to object storage with server-side
 * MIME and size validation.
 */
export const MAX_LOGO_BYTES = 512 * 1024

export const ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']

export function validateLogoFile(file: { size: number; type: string }): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
    issues.push({ field: 'logo', messageKey: 'admin.error.logoType' })
  }
  if (file.size > MAX_LOGO_BYTES) {
    issues.push({ field: 'logo', messageKey: 'admin.error.logoSize' })
  }

  return issues
}

// --- custom attributes ------------------------------------------------------

/**
 * Parses the administrator's comma-separated select options: each value is
 * trimmed and empties are dropped (ARCHITECTURE.md §3.7).
 */
export function parseAttributeOptions(raw: string): string[] {
  return raw
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option.length > 0)
}

/** Renders stored options back into the editable comma-separated form. */
export function formatAttributeOptions(options: readonly string[]): string {
  return options.join(', ')
}

export function validateCustomAttribute(attribute: CustomAttribute): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (attribute.labelEn.trim().length === 0) {
    issues.push({ field: 'labelEn', messageKey: 'admin.error.labelRequired' })
  }
  // A select with no options would render an unusable control.
  if (attribute.type === 'select' && attribute.options.length === 0) {
    issues.push({ field: 'options', messageKey: 'admin.error.optionsRequired' })
  }

  return issues
}

/** How many risks hold a non-empty value for this attribute. */
export function attributeUsageCount(risks: readonly Risk[], attributeId: string): number {
  return risks.filter((risk) => {
    const value = risk.custom[attributeId]
    return value !== undefined && value !== ''
  }).length
}
