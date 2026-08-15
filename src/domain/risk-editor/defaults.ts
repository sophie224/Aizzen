import { addMonths } from '../dates/index.ts'
import { effectiveScope } from '../business-units/index.ts'
import { nextRiskReference } from '../reference/index.ts'
import {
  ADMIN_ROLE_ID,
  RISK_MANAGER_ROLE_ID,
  RISK_OWNER_ROLE_ID,
  SUPER_ADMIN_ROLE_ID,
} from '../permissions/index.ts'
import type {
  BusinessUnit,
  Category,
  CustomAttribute,
  CustomFieldValues,
  IsoDate,
  Risk,
  User,
} from '../types/index.ts'

/*
 * Defaults for a new risk (ARCHITECTURE.md §8.2).
 *
 * Pure: `today` and the technical ID are supplied by the caller, so the same
 * inputs always produce the same draft.
 */

export interface DraftContext {
  currentUser: User
  users: readonly User[]
  categories: readonly Category[]
  businessUnits: readonly BusinessUnit[]
  customAttributes: readonly CustomAttribute[]
  risks: readonly Pick<Risk, 'ref'>[]
  today: IsoDate
  /** Technical ID, `risk_<timestamp>_<random>` — generated outside the domain. */
  id: string
}

/**
 * Business Unit default: the first active unit in the user's DIRECT scope,
 * falling back to their effective scope, then to the first active unit.
 */
export function defaultBusinessUnitId(
  currentUser: User,
  businessUnits: readonly BusinessUnit[],
): string {
  const active = businessUnits.filter((unit) => unit.active)
  const isActive = (id: string) => active.some((unit) => unit.id === id)

  const direct = currentUser.businessUnitIds.find(isActive)
  if (direct) return direct

  const inherited = effectiveScope(businessUnits, currentUser.businessUnitIds).find(isActive)
  if (inherited) return inherited

  return active[0]?.id ?? businessUnits[0]?.id ?? ''
}

/**
 * Risk Owner default: the current user when they are a Risk Owner, otherwise
 * the first active Risk Owner, otherwise the current user.
 */
export function defaultRiskOwnerId(currentUser: User, users: readonly User[]): string {
  if (currentUser.roleIds.includes(RISK_OWNER_ROLE_ID)) return currentUser.id

  const owner = users.find(
    (candidate) => candidate.status === 'Active' && candidate.roleIds.includes(RISK_OWNER_ROLE_ID),
  )
  return owner?.id ?? currentUser.id
}

/** Number attributes default to 0; every other type to an empty string. */
export function defaultCustomValues(attributes: readonly CustomAttribute[]): CustomFieldValues {
  const values: CustomFieldValues = {}
  for (const attribute of attributes) {
    if (!attribute.active) continue
    values[attribute.id] = attribute.type === 'number' ? 0 : ''
  }
  return values
}

/** Builds a new risk with every documented default applied. */
export function createDraftRisk(context: DraftContext): Risk {
  const businessUnitId = defaultBusinessUnitId(context.currentUser, context.businessUnits)
  const category = context.categories.find((candidate) => candidate.active)

  return {
    id: context.id,
    ref: nextRiskReference(businessUnitId, context.businessUnits, context.risks),
    title: '',
    type: 'Current',
    categoryId: category?.id ?? '',
    businessUnitId,
    riskOwnerId: defaultRiskOwnerId(context.currentUser, context.users),
    originDate: context.today,
    reviewDate: addMonths(context.today, 12),
    targetDate: addMonths(context.today, 6),
    status: 'Draft',
    responseType: 'Mitigate',
    outlook: 'Stable',
    // Manual free text — a new risk starts empty and is never auto-filled.
    description: '',
    cause: '',
    event: '',
    consequence: '',
    statusNarrative: '',
    inherent: { impact: 3, likelihood: 3 },
    residual: { impact: 2, likelihood: 3 },
    target: { impact: 2, likelihood: 2 },
    controls: [],
    actions: [],
    acceptance: {
      rationale: '',
      initiatorId: '',
      approverId: '',
      approvalDate: '',
      validUntil: '',
      reviewDate: '',
    },
    custom: defaultCustomValues(context.customAttributes),
    history: [],
    audit: [],
    updatedAt: '',
  }
}

/** Roles that may own a record regardless of the specific ownership role. */
const ELEVATED_ROLE_IDS: readonly string[] = [
  SUPER_ADMIN_ROLE_ID,
  ADMIN_ROLE_ID,
  RISK_MANAGER_ROLE_ID,
]

/**
 * Candidates for a Risk / Control / Action Owner dropdown
 * (ARCHITECTURE.md §8.2).
 *
 * Three conditions, all required: the user is Active, they hold the relevant
 * ownership capability, and their effective Business Unit scope covers the
 * risk's unit. Inactive users never appear, so a deactivated account cannot be
 * newly assigned while remaining readable on historical records.
 */
export function ownerCandidates(
  users: readonly User[],
  businessUnits: readonly BusinessUnit[],
  businessUnitId: string,
  requiredRoleId: string,
): User[] {
  return users.filter((candidate) => {
    if (candidate.status !== 'Active') return false

    const capable =
      candidate.roleIds.includes(requiredRoleId) ||
      candidate.roleIds.some((roleId) => ELEVATED_ROLE_IDS.includes(roleId))
    if (!capable) return false

    // Administrators are unrestricted by business unit.
    if (candidate.roleIds.some((roleId) => roleId === ADMIN_ROLE_ID || roleId === SUPER_ADMIN_ROLE_ID)) {
      return true
    }

    return effectiveScope(businessUnits, candidate.businessUnitIds).includes(businessUnitId)
  })
}
