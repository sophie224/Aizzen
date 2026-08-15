import type {
  BusinessUnit,
  Control,
  ModuleName,
  PermissionLevel,
  RemediationAction,
  Risk,
  Role,
  User,
} from '../types/index.ts'
import { PERMISSION_RANK } from '../types/enums.ts'
import { effectiveScope } from '../business-units/index.ts'

/*
 * Authorization engine (ARCHITECTURE.md §5).
 *
 * Five gates decide every read and every mutation:
 *
 *   Authenticated user
 *   AND Module permission        (None < Read < Edit, max across roles)
 *   AND Route / action permission
 *   AND Record-level scope
 *   AND Field-level role rule
 *
 * `risks: edit` alone never means "may edit every risk".
 */

export const SUPER_ADMIN_ROLE_ID = 'role_super_admin'
export const ADMIN_ROLE_ID = 'role_admin'
export const RISK_MANAGER_ROLE_ID = 'role_risk_manager'
export const RISK_OWNER_ROLE_ID = 'role_risk_owner'
export const CONTROL_OWNER_ROLE_ID = 'role_control_owner'
export const ACTION_OWNER_ROLE_ID = 'role_action_owner'
export const AUDITOR_ROLE_ID = 'role_auditor'

/**
 * Built-in roles whose visibility is deliberately narrow. Holding one of these
 * prevents the "custom role sees its Business Unit scope" fallback from
 * applying (ARCHITECTURE.md §5.6).
 */
const NARROW_ROLE_IDS: readonly string[] = [
  RISK_OWNER_ROLE_ID,
  CONTROL_OWNER_ROLE_ID,
  ACTION_OWNER_ROLE_ID,
  AUDITOR_ROLE_ID,
]

export interface AccessContext {
  readonly user: User | null
  readonly roles: readonly Role[]
  readonly businessUnits: readonly BusinessUnit[]
}

function hasRole(user: User, roleId: string): boolean {
  return user.roleIds.includes(roleId)
}

/** Administrators and Super Administrators are unrestricted by Business Unit. */
export function isAdministrator(user: User | null): boolean {
  if (!user) return false
  return hasRole(user, ADMIN_ROLE_ID) || hasRole(user, SUPER_ADMIN_ROLE_ID)
}

/** Website Administration sits outside the module matrix, behind this guard. */
export function isSuperAdministrator(user: User | null): boolean {
  return user !== null && hasRole(user, SUPER_ADMIN_ROLE_ID)
}

/**
 * Gate 2 — effective module permission is the HIGHEST level across every
 * assigned role (ARCHITECTURE.md §5.2).
 */
export function effectiveModulePermission(
  context: AccessContext,
  module: ModuleName,
): PermissionLevel {
  const { user, roles } = context
  if (!user) return 'none'

  const assigned = roles.filter((role) => user.roleIds.includes(role.id))
  let best: PermissionLevel = 'none'
  for (const role of assigned) {
    const level = role.permissions[module]
    if (PERMISSION_RANK[level] > PERMISSION_RANK[best]) best = level
  }
  return best
}

/** Gates 1 + 2 — an active session holding at least `required` on `module`. */
export function canAccess(
  context: AccessContext,
  module: ModuleName,
  required: PermissionLevel,
): boolean {
  const { user } = context
  if (!user || user.status !== 'Active') return false
  return PERMISSION_RANK[effectiveModulePermission(context, module)] >= PERMISSION_RANK[required]
}

/** Every Business Unit the user can reach. Administrators reach all of them. */
export function userScope(context: AccessContext): string[] {
  const { user, businessUnits } = context
  if (!user) return []
  if (isAdministrator(user)) return businessUnits.map((unit) => unit.id)
  return effectiveScope(businessUnits, user.businessUnitIds)
}

/** Gate 4 — record-level Business Unit scope. */
export function hasBusinessUnitAccess(context: AccessContext, unitId: string): boolean {
  const { user } = context
  if (!user) return false
  if (isAdministrator(user)) return true
  return userScope(context).includes(unitId)
}

function ownsAControl(risk: Risk, userId: string): boolean {
  return risk.controls.some((control) => control.ownerId === userId)
}

function ownsAnAction(risk: Risk, userId: string): boolean {
  return risk.actions.some((action) => action.ownerId === userId)
}

function holdsNarrowRole(user: User): boolean {
  return user.roleIds.some((roleId) => NARROW_ROLE_IDS.includes(roleId))
}

/**
 * Gate 4 — whether this risk is visible at all (ARCHITECTURE.md §5.3).
 *
 * The ownership checks accumulate: a user holding both Risk Owner and Control
 * Owner is visible any risk satisfying either. The documented Phase 1
 * limitation is narrower than it first appears — see `holdsNarrowRole`: a
 * built-in narrow role suppresses the Business-Unit-scope fallback that a
 * custom role would otherwise grant.
 */
export function canSeeRisk(context: AccessContext, risk: Risk): boolean {
  const { user } = context
  if (!user) return false
  if (!canAccess(context, 'risks', 'read')) return false
  if (!hasBusinessUnitAccess(context, risk.businessUnitId)) return false

  if (isAdministrator(user)) return true
  if (hasRole(user, RISK_MANAGER_ROLE_ID) || hasRole(user, AUDITOR_ROLE_ID)) return true

  if (hasRole(user, RISK_OWNER_ROLE_ID) && risk.riskOwnerId === user.id) return true
  if (hasRole(user, CONTROL_OWNER_ROLE_ID) && ownsAControl(risk, user.id)) return true
  if (hasRole(user, ACTION_OWNER_ROLE_ID) && ownsAnAction(risk, user.id)) return true

  // Custom roles fall back to their Business Unit scope, already checked above.
  return !holdsNarrowRole(user)
}

/** Filters a risk collection to what the current user may see. */
export function visibleRisks(context: AccessContext, risks: readonly Risk[]): Risk[] {
  return risks.filter((risk) => canSeeRisk(context, risk))
}

/** Creation is limited to Super Administrator, Administrator and Risk Manager. */
export function canCreateRisk(context: AccessContext): boolean {
  const { user } = context
  if (!user) return false
  if (!canAccess(context, 'risks', 'edit')) return false
  if (isAdministrator(user)) return true
  if (userScope(context).length === 0) return false
  if (hasRole(user, RISK_MANAGER_ROLE_ID)) return true
  return !holdsNarrowRole(user)
}

export function canEditRisk(context: AccessContext, risk: Risk): boolean {
  const { user } = context
  if (!user) return false
  if (!canAccess(context, 'risks', 'edit')) return false
  if (!hasBusinessUnitAccess(context, risk.businessUnitId)) return false

  if (isAdministrator(user) || hasRole(user, RISK_MANAGER_ROLE_ID)) return true
  if (hasRole(user, RISK_OWNER_ROLE_ID) && risk.riskOwnerId === user.id) return true
  return !holdsNarrowRole(user)
}

export function canEditControl(context: AccessContext, risk: Risk, control: Control): boolean {
  const { user } = context
  if (!user) return false
  if (!canAccess(context, 'controls', 'edit')) return false
  if (!hasBusinessUnitAccess(context, risk.businessUnitId)) return false

  if (isAdministrator(user) || hasRole(user, RISK_MANAGER_ROLE_ID)) return true
  if (hasRole(user, RISK_OWNER_ROLE_ID) && risk.riskOwnerId === user.id) return true
  if (hasRole(user, CONTROL_OWNER_ROLE_ID) && control.ownerId === user.id) return true
  return !holdsNarrowRole(user)
}

export function canEditAction(context: AccessContext, risk: Risk, action: RemediationAction): boolean {
  const { user } = context
  if (!user) return false
  if (!canAccess(context, 'actions', 'edit')) return false
  if (!hasBusinessUnitAccess(context, risk.businessUnitId)) return false

  if (isAdministrator(user) || hasRole(user, RISK_MANAGER_ROLE_ID)) return true
  if (hasRole(user, RISK_OWNER_ROLE_ID) && risk.riskOwnerId === user.id) return true
  if (hasRole(user, ACTION_OWNER_ROLE_ID) && action.ownerId === user.id) return true
  return !holdsNarrowRole(user)
}

/** Master-data fields only a manager or administrator may change. */
export const MANAGER_ONLY_RISK_FIELDS = [
  'ref',
  'title',
  'type',
  'categoryId',
  'businessUnitId',
  'riskOwnerId',
  'status',
] as const

/**
 * Gate 5 — field-level merge (ARCHITECTURE.md §5.5).
 *
 * A submitted risk is NEVER trusted wholesale. Protected properties are
 * restored from the original record and only authorised sub-records are
 * merged, so a crafted payload from a Control or Action Owner cannot alter
 * master data, assessments, or another owner's records.
 */
export function mergeAuthorisedRiskUpdate(
  context: AccessContext,
  original: Risk,
  submitted: Risk,
): Risk {
  const { user } = context
  if (!user) return original

  const isManager = isAdministrator(user) || hasRole(user, RISK_MANAGER_ROLE_ID)
  if (isManager && canEditRisk(context, original)) return submitted

  const result: Risk = structuredClone(original)

  // --- Risk Owner: everything except manager-only master data ---------------
  const isOwner = hasRole(user, RISK_OWNER_ROLE_ID) && original.riskOwnerId === user.id
  if (isOwner && canAccess(context, 'risks', 'edit')) {
    result.originDate = submitted.originDate
    result.reviewDate = submitted.reviewDate
    result.targetDate = submitted.targetDate
    result.responseType = submitted.responseType
    result.outlook = submitted.outlook
    result.cause = submitted.cause
    result.event = submitted.event
    result.consequence = submitted.consequence
    result.statusNarrative = submitted.statusNarrative
    result.inherent = submitted.inherent
    result.residual = submitted.residual
    result.target = submitted.target
    result.acceptance = submitted.acceptance
    result.custom = submitted.custom
    result.controls = submitted.controls
    result.actions = submitted.actions
    return result
  }

  // --- Control Owner: only controls they own --------------------------------
  if (hasRole(user, CONTROL_OWNER_ROLE_ID) && canAccess(context, 'controls', 'edit')) {
    const submittedById = new Map(submitted.controls.map((control) => [control.id, control]))
    result.controls = original.controls.map((control) => {
      const replacement = submittedById.get(control.id)
      return replacement && control.ownerId === user.id ? replacement : control
    })
  }

  // --- Action Owner: only actions they own ----------------------------------
  if (hasRole(user, ACTION_OWNER_ROLE_ID) && canAccess(context, 'actions', 'edit')) {
    const submittedById = new Map(submitted.actions.map((action) => [action.id, action]))
    result.actions = original.actions.map((action) => {
      const replacement = submittedById.get(action.id)
      return replacement && action.ownerId === user.id ? replacement : action
    })
  }

  return result
}

/** Only Administrators and Super Administrators reach Risk Administration. */
export function canOpenAdministration(context: AccessContext): boolean {
  return isAdministrator(context.user) && canAccess(context, 'administration', 'read')
}

/** Website Administration is Super Administrator only, outside the module matrix. */
export function canOpenWebsiteAdministration(context: AccessContext): boolean {
  const { user } = context
  return user !== null && user.status === 'Active' && isSuperAdministrator(user)
}
