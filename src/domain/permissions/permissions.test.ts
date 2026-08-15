import { describe, expect, it } from 'vitest'
import type {
  BusinessUnit,
  Control,
  ModuleName,
  PermissionLevel,
  PermissionSet,
  RemediationAction,
  Risk,
  Role,
  User,
} from '../types/index.ts'
import { MODULE_NAMES } from '../types/enums.ts'
import {
  ACTION_OWNER_ROLE_ID,
  ADMIN_ROLE_ID,
  AUDITOR_ROLE_ID,
  CONTROL_OWNER_ROLE_ID,
  RISK_MANAGER_ROLE_ID,
  RISK_OWNER_ROLE_ID,
  SUPER_ADMIN_ROLE_ID,
  canAccess,
  canCreateRisk,
  canEditAction,
  canEditControl,
  canEditRisk,
  canOpenAdministration,
  canOpenWebsiteAdministration,
  canSeeRisk,
  effectiveModulePermission,
  isAdministrator,
  isSuperAdministrator,
  mergeAuthorisedRiskUpdate,
  userScope,
  visibleRisks,
  type AccessContext,
} from './index.ts'

// --- fixtures ---------------------------------------------------------------

function permissions(overrides: Partial<Record<ModuleName, PermissionLevel>>): PermissionSet {
  const set = {} as PermissionSet
  for (const module of MODULE_NAMES) set[module] = overrides[module] ?? 'none'
  return set
}

const ALL_EDIT = permissions(Object.fromEntries(MODULE_NAMES.map((m) => [m, 'edit'])))

function role(id: string, perms: PermissionSet): Role {
  return { id, nameEn: id, nameKa: '', description: '', system: true, permissions: perms }
}

const ROLES: Role[] = [
  role(SUPER_ADMIN_ROLE_ID, ALL_EDIT),
  role(ADMIN_ROLE_ID, ALL_EDIT),
  role(RISK_MANAGER_ROLE_ID, permissions({
    dashboard: 'read', register: 'edit', risks: 'edit', controls: 'edit',
    actions: 'edit', reports: 'edit', audit: 'read',
  })),
  role(RISK_OWNER_ROLE_ID, permissions({
    dashboard: 'read', register: 'read', risks: 'edit', controls: 'edit',
    actions: 'edit', reports: 'read', audit: 'read',
  })),
  role(CONTROL_OWNER_ROLE_ID, permissions({
    dashboard: 'read', register: 'read', risks: 'read', controls: 'edit',
    actions: 'read', audit: 'read',
  })),
  role(ACTION_OWNER_ROLE_ID, permissions({
    dashboard: 'read', register: 'read', risks: 'read', controls: 'read',
    actions: 'edit', audit: 'read',
  })),
  role(AUDITOR_ROLE_ID, permissions({
    dashboard: 'read', register: 'read', risks: 'read', controls: 'read',
    actions: 'read', reports: 'read', audit: 'read',
  })),
  role('role_custom', permissions({ dashboard: 'read', register: 'read', risks: 'edit' })),
]

const UNITS: BusinessUnit[] = [
  { id: 'bu_enterprise', code: 'ENT', nameEn: 'Enterprise', nameKa: '', parentId: null, active: true },
  { id: 'bu_technology', code: 'TECH', nameEn: 'Technology', nameKa: '', parentId: 'bu_enterprise', active: true },
  { id: 'bu_security', code: 'SEC', nameEn: 'Security', nameKa: '', parentId: 'bu_technology', active: true },
  { id: 'bu_finance', code: 'FIN', nameEn: 'Finance', nameKa: '', parentId: 'bu_enterprise', active: true },
]

function user(id: string, roleIds: string[], businessUnitIds: string[] = ['bu_enterprise']): User {
  return {
    id, name: id, title: '', email: `${id}@erm.local`, password: 'x',
    status: 'Active', roleIds, businessUnitIds,
  }
}

function context(current: User | null): AccessContext {
  return { user: current, roles: ROLES, businessUnits: UNITS }
}

function control(id: string, ownerId: string): Control {
  return {
    id, title: id, ownerId, performer: '', description: '', frequency: '',
    intendedOutcome: '', evidenceLocation: '', keyControl: false,
    type: 'Preventative', automation: 'Manual', status: 'Effective',
  }
}

function action(id: string, ownerId: string): RemediationAction {
  return {
    id, title: id, description: '', deliverable: '', ownerId,
    dueDate: '2026-06-01', status: 'In Progress', priority: 'Medium', progress: 50, notes: '',
  }
}

function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk_1', ref: 'TECH-001', title: 'A risk', type: 'Current',
    categoryId: 'cat_01', businessUnitId: 'bu_technology', riskOwnerId: 'usr_owner',
    originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
    status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
    description: '',
    cause: 'c', event: 'e', consequence: 'q', statusNarrative: '',
    inherent: { impact: 4, likelihood: 4 },
    residual: { impact: 3, likelihood: 3 },
    target: { impact: 2, likelihood: 2 },
    controls: [], actions: [],
    acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
    custom: {}, history: [], audit: [], updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// --- gate 2: module permission ---------------------------------------------

describe('effectiveModulePermission', () => {
  it('returns the level for a single role', () => {
    expect(effectiveModulePermission(context(user('u', [AUDITOR_ROLE_ID])), 'risks')).toBe('read')
  })

  it('returns the HIGHEST level across multiple roles, for every module', () => {
    const combined = context(user('u', [AUDITOR_ROLE_ID, RISK_MANAGER_ROLE_ID]))

    for (const module of MODULE_NAMES) {
      const auditor = effectiveModulePermission(context(user('u', [AUDITOR_ROLE_ID])), module)
      const manager = effectiveModulePermission(context(user('u', [RISK_MANAGER_ROLE_ID])), module)
      const rank = { none: 0, read: 1, edit: 2 }
      const expected = rank[auditor] >= rank[manager] ? auditor : manager

      expect(effectiveModulePermission(combined, module), module).toBe(expected)
    }
  })

  it('never lowers a permission by adding a weaker role', () => {
    const strong = context(user('u', [ADMIN_ROLE_ID]))
    const mixed = context(user('u', [ADMIN_ROLE_ID, AUDITOR_ROLE_ID]))

    for (const module of MODULE_NAMES) {
      expect(effectiveModulePermission(mixed, module)).toBe(
        effectiveModulePermission(strong, module),
      )
    }
  })

  it('returns none for an unknown role or no user', () => {
    expect(effectiveModulePermission(context(user('u', ['role_ghost'])), 'risks')).toBe('none')
    expect(effectiveModulePermission(context(null), 'risks')).toBe('none')
  })
})

describe('canAccess — gate 1 and 2', () => {
  it('denies an inactive user regardless of role', () => {
    const inactive = { ...user('u', [ADMIN_ROLE_ID]), status: 'Inactive' as const }
    expect(canAccess(context(inactive), 'risks', 'read')).toBe(false)
  })

  it('denies when there is no session', () => {
    expect(canAccess(context(null), 'risks', 'read')).toBe(false)
  })

  it('treats edit as satisfying a read requirement', () => {
    const manager = context(user('u', [RISK_MANAGER_ROLE_ID]))
    expect(canAccess(manager, 'risks', 'read')).toBe(true)
    expect(canAccess(manager, 'risks', 'edit')).toBe(true)
  })

  it('does not treat read as satisfying an edit requirement', () => {
    const auditor = context(user('u', [AUDITOR_ROLE_ID]))
    expect(auditor && canAccess(auditor, 'risks', 'read')).toBe(true)
    expect(canAccess(auditor, 'risks', 'edit')).toBe(false)
  })
})

// --- gate 4: record visibility ---------------------------------------------

describe('canSeeRisk', () => {
  const owned = risk({ riskOwnerId: 'usr_owner' })
  const other = risk({ id: 'risk_2', riskOwnerId: 'usr_someone_else' })

  it('shows every risk to administrators, managers and auditors', () => {
    for (const roleId of [SUPER_ADMIN_ROLE_ID, ADMIN_ROLE_ID, RISK_MANAGER_ROLE_ID, AUDITOR_ROLE_ID]) {
      const ctx = context(user('u', [roleId]))
      expect(canSeeRisk(ctx, owned), roleId).toBe(true)
      expect(canSeeRisk(ctx, other), roleId).toBe(true)
    }
  })

  it('shows a Risk Owner only their own risks', () => {
    const ctx = context(user('usr_owner', [RISK_OWNER_ROLE_ID]))
    expect(canSeeRisk(ctx, owned)).toBe(true)
    expect(canSeeRisk(ctx, other)).toBe(false)
  })

  it('shows a Control Owner only risks holding a control they own', () => {
    const withControl = risk({ id: 'risk_3', riskOwnerId: 'x', controls: [control('c1', 'usr_control')] })
    const ctx = context(user('usr_control', [CONTROL_OWNER_ROLE_ID]))

    expect(canSeeRisk(ctx, withControl)).toBe(true)
    expect(canSeeRisk(ctx, other)).toBe(false)
  })

  it('shows an Action Owner only risks holding an action they own', () => {
    const withAction = risk({ id: 'risk_4', riskOwnerId: 'x', actions: [action('a1', 'usr_action')] })
    const ctx = context(user('usr_action', [ACTION_OWNER_ROLE_ID]))

    expect(canSeeRisk(ctx, withAction)).toBe(true)
    expect(canSeeRisk(ctx, other)).toBe(false)
  })

  it('unions ownership grants when a user holds two narrow roles', () => {
    const viaControl = risk({ id: 'risk_5', riskOwnerId: 'x', controls: [control('c1', 'usr_both')] })
    const viaOwnership = risk({ id: 'risk_6', riskOwnerId: 'usr_both' })
    const ctx = context(user('usr_both', [RISK_OWNER_ROLE_ID, CONTROL_OWNER_ROLE_ID]))

    expect(canSeeRisk(ctx, viaControl)).toBe(true)
    expect(canSeeRisk(ctx, viaOwnership)).toBe(true)
    expect(canSeeRisk(ctx, other)).toBe(false)
  })

  it('gives a custom role its Business Unit scope', () => {
    const inScope = context(user('u', ['role_custom'], ['bu_technology']))
    const outOfScope = context(user('u', ['role_custom'], ['bu_finance']))

    expect(canSeeRisk(inScope, owned)).toBe(true)
    expect(canSeeRisk(outOfScope, owned)).toBe(false)
  })

  it('applies Business Unit scope before ownership', () => {
    // Owns the risk, but is scoped to a sibling branch.
    const ctx = context(user('usr_owner', [RISK_OWNER_ROLE_ID], ['bu_finance']))
    expect(canSeeRisk(ctx, owned)).toBe(false)
  })

  it('denies everything without risks:read', () => {
    const noAccess = context(user('u', ['role_ghost']))
    expect(canSeeRisk(noAccess, owned)).toBe(false)
  })

  /*
   * Documented Phase 1 limitation (ARCHITECTURE.md §5.6). Holding a built-in
   * narrow role suppresses the Business-Unit fallback a custom role would
   * otherwise grant, so this user sees LESS than the custom role alone.
   * Phase 2 must union record-level grants server-side.
   */
  it('lets a narrow role suppress a custom role’s wider scope', () => {
    const customOnly = context(user('u', ['role_custom'], ['bu_technology']))
    const customPlusNarrow = context(user('u', ['role_custom', RISK_OWNER_ROLE_ID], ['bu_technology']))

    expect(canSeeRisk(customOnly, other)).toBe(true)
    expect(canSeeRisk(customPlusNarrow, other)).toBe(false)
  })

  it('filters a collection through visibleRisks', () => {
    const ctx = context(user('usr_owner', [RISK_OWNER_ROLE_ID]))
    expect(visibleRisks(ctx, [owned, other]).map((r) => r.id)).toEqual(['risk_1'])
  })
})

describe('userScope', () => {
  it('gives administrators every unit', () => {
    expect(userScope(context(user('u', [ADMIN_ROLE_ID], ['bu_finance'])))).toHaveLength(UNITS.length)
  })

  it('gives everyone else their effective scope only', () => {
    expect(userScope(context(user('u', [RISK_OWNER_ROLE_ID], ['bu_technology']))).sort()).toEqual(
      ['bu_security', 'bu_technology'].sort(),
    )
  })
})

// --- creation and edit gates ------------------------------------------------

describe('canCreateRisk', () => {
  it('allows administrators and risk managers', () => {
    for (const roleId of [SUPER_ADMIN_ROLE_ID, ADMIN_ROLE_ID, RISK_MANAGER_ROLE_ID]) {
      expect(canCreateRisk(context(user('u', [roleId]))), roleId).toBe(true)
    }
  })

  it('denies risk, control and action owners and auditors', () => {
    for (const roleId of [RISK_OWNER_ROLE_ID, CONTROL_OWNER_ROLE_ID, ACTION_OWNER_ROLE_ID, AUDITOR_ROLE_ID]) {
      expect(canCreateRisk(context(user('u', [roleId]))), roleId).toBe(false)
    }
  })
})

describe('canEditRisk / canEditControl / canEditAction', () => {
  const target = risk({ controls: [control('c1', 'usr_control')], actions: [action('a1', 'usr_action')] })

  it('denies an auditor every mutation', () => {
    const ctx = context(user('u', [AUDITOR_ROLE_ID]))
    expect(canEditRisk(ctx, target)).toBe(false)
    expect(canEditControl(ctx, target, target.controls[0])).toBe(false)
    expect(canEditAction(ctx, target, target.actions[0])).toBe(false)
  })

  it('allows a Risk Owner on their own risk only', () => {
    const owner = context(user('usr_owner', [RISK_OWNER_ROLE_ID]))
    expect(canEditRisk(owner, target)).toBe(true)
    expect(canEditRisk(owner, risk({ id: 'r2', riskOwnerId: 'someone' }))).toBe(false)
  })

  it('allows a Control Owner only on controls they own', () => {
    const ctx = context(user('usr_control', [CONTROL_OWNER_ROLE_ID]))
    expect(canEditControl(ctx, target, target.controls[0])).toBe(true)
    expect(canEditControl(ctx, target, control('c2', 'someone_else'))).toBe(false)
  })

  it('allows an Action Owner only on actions they own', () => {
    const ctx = context(user('usr_action', [ACTION_OWNER_ROLE_ID]))
    expect(canEditAction(ctx, target, target.actions[0])).toBe(true)
    expect(canEditAction(ctx, target, action('a2', 'someone_else'))).toBe(false)
  })
})

// --- gate 5: field-level merge ---------------------------------------------

describe('mergeAuthorisedRiskUpdate', () => {
  const original = risk({
    controls: [control('c1', 'usr_control'), control('c2', 'usr_other')],
    actions: [action('a1', 'usr_action'), action('a2', 'usr_other')],
  })

  /** A hostile payload: every field changed, including protected ones. */
  function tamperedPayload(): Risk {
    const submitted = structuredClone(original)
    submitted.title = 'HIJACKED'
    submitted.status = 'Completed'
    submitted.riskOwnerId = 'attacker'
    submitted.businessUnitId = 'bu_finance'
    submitted.residual = { impact: 1, likelihood: 1 }
    submitted.controls = submitted.controls.map((c) => ({ ...c, title: `${c.title}-edited` }))
    submitted.actions = submitted.actions.map((a) => ({ ...a, progress: 100 }))
    return submitted
  }

  it('accepts the whole record from a manager', () => {
    const ctx = context(user('u', [RISK_MANAGER_ROLE_ID]))
    expect(mergeAuthorisedRiskUpdate(ctx, original, tamperedPayload()).title).toBe('HIJACKED')
  })

  it('restores manager-only fields for a Risk Owner', () => {
    const ctx = context(user('usr_owner', [RISK_OWNER_ROLE_ID]))
    const merged = mergeAuthorisedRiskUpdate(ctx, original, tamperedPayload())

    expect(merged.title).toBe(original.title)
    expect(merged.status).toBe(original.status)
    expect(merged.riskOwnerId).toBe(original.riskOwnerId)
    expect(merged.businessUnitId).toBe(original.businessUnitId)

    // But their own editable fields do land.
    expect(merged.residual).toEqual({ impact: 1, likelihood: 1 })
  })

  it('merges only the controls a Control Owner owns', () => {
    const ctx = context(user('usr_control', [CONTROL_OWNER_ROLE_ID]))
    const merged = mergeAuthorisedRiskUpdate(ctx, original, tamperedPayload())

    expect(merged.controls[0].title).toBe('c1-edited')
    expect(merged.controls[1].title).toBe('c2')
    // Nothing else moves.
    expect(merged.title).toBe(original.title)
    expect(merged.residual).toEqual(original.residual)
    expect(merged.actions).toEqual(original.actions)
  })

  it('merges only the actions an Action Owner owns', () => {
    const ctx = context(user('usr_action', [ACTION_OWNER_ROLE_ID]))
    const merged = mergeAuthorisedRiskUpdate(ctx, original, tamperedPayload())

    expect(merged.actions[0].progress).toBe(100)
    expect(merged.actions[1].progress).toBe(action('a2', 'usr_other').progress)
    expect(merged.controls).toEqual(original.controls)
    expect(merged.title).toBe(original.title)
  })

  it('discards everything from an auditor', () => {
    const ctx = context(user('u', [AUDITOR_ROLE_ID]))
    expect(mergeAuthorisedRiskUpdate(ctx, original, tamperedPayload())).toEqual(original)
  })

  it('discards everything when there is no session', () => {
    expect(mergeAuthorisedRiskUpdate(context(null), original, tamperedPayload())).toEqual(original)
  })

  it('does not mutate the original record', () => {
    const snapshot = JSON.stringify(original)
    mergeAuthorisedRiskUpdate(context(user('usr_control', [CONTROL_OWNER_ROLE_ID])), original, tamperedPayload())
    expect(JSON.stringify(original)).toBe(snapshot)
  })
})

// --- administration guards --------------------------------------------------

describe('administration guards', () => {
  it('opens Risk Administration for administrators only', () => {
    expect(canOpenAdministration(context(user('u', [ADMIN_ROLE_ID])))).toBe(true)
    expect(canOpenAdministration(context(user('u', [SUPER_ADMIN_ROLE_ID])))).toBe(true)

    for (const roleId of [RISK_MANAGER_ROLE_ID, RISK_OWNER_ROLE_ID, CONTROL_OWNER_ROLE_ID, ACTION_OWNER_ROLE_ID, AUDITOR_ROLE_ID]) {
      expect(canOpenAdministration(context(user('u', [roleId]))), roleId).toBe(false)
    }
  })

  it('opens Website Administration for the Super Administrator only', () => {
    expect(canOpenWebsiteAdministration(context(user('u', [SUPER_ADMIN_ROLE_ID])))).toBe(true)
    expect(canOpenWebsiteAdministration(context(user('u', [ADMIN_ROLE_ID])))).toBe(false)
  })

  it('identifies administrator roles', () => {
    expect(isAdministrator(user('u', [ADMIN_ROLE_ID]))).toBe(true)
    expect(isAdministrator(user('u', [SUPER_ADMIN_ROLE_ID]))).toBe(true)
    expect(isAdministrator(user('u', [RISK_MANAGER_ROLE_ID]))).toBe(false)
    expect(isSuperAdministrator(user('u', [ADMIN_ROLE_ID]))).toBe(false)
  })
})
