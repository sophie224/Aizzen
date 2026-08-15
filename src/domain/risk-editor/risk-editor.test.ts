import { describe, expect, it } from 'vitest'
import type { BusinessUnit, Category, Control, CustomAttribute, RemediationAction, Risk, User } from '../types/index.ts'
import { mergeAuthorisedRiskUpdate, type AccessContext } from '../permissions/index.ts'
import { MODULE_NAMES } from '../types/enums.ts'
import type { ModuleName, PermissionLevel, PermissionSet, Role } from '../types/index.ts'
import {
  assessmentsChanged,
  cleanRisk,
  createDraftRisk,
  defaultBusinessUnitId,
  defaultCustomValues,
  defaultRiskOwnerId,
  diffRisk,
  ownerCandidates,
  prepareSave,
  RISK_DESCRIPTION_MAX_LENGTH,
  validateRisk,
} from './index.ts'

// --- fixtures ---------------------------------------------------------------

const UNITS: BusinessUnit[] = [
  { id: 'bu_enterprise', code: 'ENT', nameEn: 'Enterprise', nameKa: '', parentId: null, active: true },
  { id: 'bu_technology', code: 'TECH', nameEn: 'Technology', nameKa: '', parentId: 'bu_enterprise', active: true },
  { id: 'bu_security', code: 'SEC', nameEn: 'Security', nameKa: '', parentId: 'bu_technology', active: true },
  { id: 'bu_finance', code: 'FIN', nameEn: 'Finance', nameKa: '', parentId: 'bu_enterprise', active: true },
  { id: 'bu_retired', code: 'OLD', nameEn: 'Retired', nameKa: '', parentId: 'bu_enterprise', active: false },
]

const CATEGORIES: Category[] = [
  { id: 'cat_inactive', level1En: 'Strategic', level1Ka: '', level2En: 'Retired', level2Ka: '', active: false },
  { id: 'cat_cyber', level1En: 'Operational', level1Ka: '', level2En: 'Cyber Security', level2Ka: '', active: true },
]

const ATTRIBUTES: CustomAttribute[] = [
  { id: 'attr_text', labelEn: 'KRI', labelKa: '', type: 'text', options: [], active: true, showInRegister: false },
  { id: 'attr_number', labelEn: 'Count', labelKa: '', type: 'number', options: [], active: true, showInRegister: false },
  { id: 'attr_off', labelEn: 'Retired', labelKa: '', type: 'text', options: [], active: false, showInRegister: false },
]

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'usr_x', name: 'User X', title: '', email: 'x@erm.local', password: 'p',
    status: 'Active', roleIds: [], businessUnitIds: ['bu_enterprise'], ...overrides,
  }
}

const USERS: User[] = [
  user({ id: 'usr_admin', name: 'Admin', roleIds: ['role_admin'], businessUnitIds: ['bu_finance'] }),
  user({ id: 'usr_owner', name: 'Nino', roleIds: ['role_risk_owner'], businessUnitIds: ['bu_technology'] }),
  user({ id: 'usr_owner_fin', name: 'Fin Owner', roleIds: ['role_risk_owner'], businessUnitIds: ['bu_finance'] }),
  user({ id: 'usr_owner_off', name: 'Former', roleIds: ['role_risk_owner'], businessUnitIds: ['bu_technology'], status: 'Inactive' }),
  user({ id: 'usr_control', name: 'Giorgi', roleIds: ['role_control_owner'], businessUnitIds: ['bu_security'] }),
]

function control(id: string, ownerId: string, title = id): Control {
  return {
    id, title, ownerId, performer: '', description: '', frequency: '', intendedOutcome: '',
    evidenceLocation: '', keyControl: false, type: 'Preventative', automation: 'Manual', status: 'Effective',
  }
}

function action(id: string, ownerId: string, title = id): RemediationAction {
  return {
    id, title, description: '', deliverable: '', ownerId, dueDate: '2026-06-01',
    status: 'In Progress', priority: 'Medium', progress: 20, notes: '',
  }
}

function risk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk_1', ref: 'TECH-001', title: 'A risk', type: 'Current',
    categoryId: 'cat_cyber', businessUnitId: 'bu_technology', riskOwnerId: 'usr_owner',
    originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
    status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
    description: '',
    cause: 'A cause', event: 'An event', consequence: 'A consequence', statusNarrative: '',
    inherent: { impact: 4, likelihood: 4 },
    residual: { impact: 3, likelihood: 3 },
    target: { impact: 2, likelihood: 2 },
    controls: [], actions: [],
    acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
    custom: {}, history: [], audit: [], updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const SAVE_BASE = {
  actorId: 'usr_owner',
  today: '2026-03-01',
  now: '2026-03-01T09:00:00.000Z',
  historyId: 'hist_test',
  generatedRef: 'TECH-009',
  // The matrix configuration in force when the snapshot is taken (CR-003).
  matrixVersion: 3,
}

// --- validation -------------------------------------------------------------

describe('validateRisk', () => {
  it('accepts a complete record', () => {
    expect(validateRisk(risk())).toEqual([])
  })

  it('blocks an empty or whitespace-only title', () => {
    expect(validateRisk(risk({ title: '' })).map((e) => e.field)).toContain('title')
    expect(validateRisk(risk({ title: '   ' })).map((e) => e.field)).toContain('title')
  })

  it('blocks a missing category', () => {
    expect(validateRisk(risk({ categoryId: '' })).map((e) => e.field)).toContain('categoryId')
  })

  it('blocks a missing risk owner', () => {
    expect(validateRisk(risk({ riskOwnerId: '' })).map((e) => e.field)).toContain('riskOwnerId')
  })

  it('blocks each of cause, event and consequence independently', () => {
    expect(validateRisk(risk({ cause: '' })).map((e) => e.field)).toContain('cause')
    expect(validateRisk(risk({ event: '  ' })).map((e) => e.field)).toContain('event')
    expect(validateRisk(risk({ consequence: '' })).map((e) => e.field)).toContain('consequence')
  })

  it('blocks Accept without an acceptance rationale', () => {
    const fields = validateRisk(risk({ responseType: 'Accept' })).map((e) => e.field)
    expect(fields).toContain('acceptance.rationale')
  })

  it('allows Accept once a rationale is supplied', () => {
    const accepted = risk({
      responseType: 'Accept',
      acceptance: { ...risk().acceptance, rationale: 'Within appetite' },
    })
    expect(validateRisk(accepted)).toEqual([])
  })

  it('blocks Accepted status without approver, approval date and valid until', () => {
    const fields = validateRisk(risk({ status: 'Accepted' })).map((e) => e.field)

    expect(fields).toContain('acceptance.approverId')
    expect(fields).toContain('acceptance.approvalDate')
    expect(fields).toContain('acceptance.validUntil')
  })

  it('allows Accepted once all three are supplied', () => {
    const accepted = risk({
      status: 'Accepted',
      acceptance: {
        rationale: 'Approved', initiatorId: 'usr_owner', approverId: 'usr_admin',
        approvalDate: '2026-02-01', validUntil: '2026-08-01', reviewDate: '2026-05-01',
      },
    })
    expect(validateRisk(accepted)).toEqual([])
  })

  it('reports every failure at once', () => {
    const empty = risk({ title: '', categoryId: '', riskOwnerId: '', cause: '', event: '', consequence: '' })
    expect(validateRisk(empty)).toHaveLength(6)
  })
})

// --- cleaning ---------------------------------------------------------------

describe('cleanRisk', () => {
  const options = { generatedRef: 'TECH-009', now: '2026-03-01T09:00:00.000Z' }

  it('trims the title', () => {
    expect(cleanRisk(risk({ title: '  Padded title  ' }), options).title).toBe('Padded title')
  })

  it('replaces a blank reference with the generated one', () => {
    expect(cleanRisk(risk({ ref: '' }), options).ref).toBe('TECH-009')
    expect(cleanRisk(risk({ ref: '   ' }), options).ref).toBe('TECH-009')
  })

  it('keeps an existing reference untouched', () => {
    expect(cleanRisk(risk({ ref: 'SEC-004' }), options).ref).toBe('SEC-004')
  })

  it('drops controls and actions with an empty title', () => {
    const cleaned = cleanRisk(
      risk({
        controls: [control('c1', 'usr_control', 'Real control'), control('c2', 'usr_control', '   ')],
        actions: [action('a1', 'usr_owner', 'Real action'), action('a2', 'usr_owner', '')],
      }),
      options,
    )

    expect(cleaned.controls.map((c) => c.id)).toEqual(['c1'])
    expect(cleaned.actions.map((a) => a.id)).toEqual(['a1'])
  })

  it('refreshes updatedAt', () => {
    expect(cleanRisk(risk(), options).updatedAt).toBe('2026-03-01T09:00:00.000Z')
  })

  it('keeps custom values bound to their attribute IDs', () => {
    const custom = { attr_text: 'KRI value', attr_number: 42 }
    expect(cleanRisk(risk({ custom }), options).custom).toEqual(custom)
  })

  it('trims the description at its ends but keeps the author’s line breaks', () => {
    const cleaned = cleanRisk(risk({ description: '  First line.\nSecond line.  ' }), options)
    expect(cleaned.description).toBe('First line.\nSecond line.')
  })

  it('clamps a description longer than the documented maximum', () => {
    const cleaned = cleanRisk(risk({ description: 'x'.repeat(2500) }), options)
    expect(cleaned.description).toHaveLength(RISK_DESCRIPTION_MAX_LENGTH)
  })

  it('never fills the description from cause, event or consequence', () => {
    const cleaned = cleanRisk(risk({ description: '' }), options)
    expect(cleaned.description).toBe('')
  })
})

// --- change detection -------------------------------------------------------

describe('assessmentsChanged', () => {
  it('detects a change in any of the three assessments', () => {
    expect(assessmentsChanged(risk(), risk({ inherent: { impact: 5, likelihood: 4 } }))).toBe(true)
    expect(assessmentsChanged(risk(), risk({ residual: { impact: 1, likelihood: 1 } }))).toBe(true)
    expect(assessmentsChanged(risk(), risk({ target: { impact: 1, likelihood: 1 } }))).toBe(true)
  })

  it('ignores everything else', () => {
    expect(assessmentsChanged(risk(), risk({ title: 'Renamed', status: 'Monitoring' }))).toBe(false)
    expect(assessmentsChanged(risk(), risk({ controls: [control('c1', 'usr_control')] }))).toBe(false)
  })
})

describe('diffRisk', () => {
  it('names each changed master field', () => {
    const changes = diffRisk(risk(), risk({ title: 'New', status: 'Monitoring', outlook: 'Increasing' }))

    expect(changes).toContain('Title: changed')
    expect(changes).toContain('Status: changed')
    expect(changes).toContain('Outlook: changed')
  })

  it('records score transitions with before and after values', () => {
    const changes = diffRisk(risk(), risk({ residual: { impact: 5, likelihood: 4 } }))
    expect(changes).toContain('Residual: 9 → 20')
  })

  it('names a description change like any other master field', () => {
    expect(diffRisk(risk(), risk({ description: 'A new summary' }))).toContain('Description: changed')
  })

  it('records control and action changes', () => {
    expect(diffRisk(risk(), risk({ controls: [control('c1', 'usr_control')] }))).toContain('Controls updated')
    expect(diffRisk(risk(), risk({ actions: [action('a1', 'usr_owner')] }))).toContain('Action plans updated')
  })

  it('falls back to Record saved when nothing tracked changed', () => {
    expect(diffRisk(risk(), risk({ statusNarrative: 'Updated narrative' }))).toEqual(['Record saved'])
  })

  it('never returns an empty list', () => {
    expect(diffRisk(risk(), risk()).length).toBeGreaterThan(0)
  })
})

// --- save orchestration -----------------------------------------------------

describe('prepareSave — creating', () => {
  it('refuses to save an invalid draft', () => {
    const result = prepareSave({ ...SAVE_BASE, original: null, draft: risk({ title: '' }) })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.map((e) => e.field)).toContain('title')
  })

  it('opens the history with an initial snapshot', () => {
    const result = prepareSave({ ...SAVE_BASE, original: null, draft: risk({ history: [] }) })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.risk.history).toHaveLength(1)
    expect(result.risk.history[0]).toMatchObject({
      id: 'hist_test', date: '2026-03-01', note: 'Initial assessment', actorId: 'usr_owner',
    })
    expect(result.historyAppended).toBe(true)
    expect(result.action).toBe('risk.created')
  })

  it('snapshots all three assessments', () => {
    const result = prepareSave({ ...SAVE_BASE, original: null, draft: risk() })
    if (!result.ok) throw new Error('expected success')

    expect(result.risk.history[0].inherent).toEqual({ impact: 4, likelihood: 4 })
    expect(result.risk.history[0].residual).toEqual({ impact: 3, likelihood: 3 })
    expect(result.risk.history[0].target).toEqual({ impact: 2, likelihood: 2 })
  })
})

describe('prepareSave — updating', () => {
  it('appends exactly one history item when a score changes', () => {
    const original = risk()
    const draft = risk({ residual: { impact: 5, likelihood: 4 } })

    const result = prepareSave({ ...SAVE_BASE, original, draft })
    if (!result.ok) throw new Error('expected success')

    expect(result.risk.history).toHaveLength(1)
    expect(result.historyAppended).toBe(true)
    expect(result.risk.history[0].residual).toEqual({ impact: 5, likelihood: 4 })
  })

  it('appends NO history item for a title, status, control or action change', () => {
    const original = risk()
    const cases: Partial<Risk>[] = [
      { title: 'Renamed' },
      { status: 'Monitoring' },
      { controls: [control('c1', 'usr_control')] },
      { actions: [action('a1', 'usr_owner')] },
      { statusNarrative: 'New narrative' },
    ]

    for (const change of cases) {
      const result = prepareSave({ ...SAVE_BASE, original, draft: risk(change) })
      if (!result.ok) throw new Error('expected success')

      expect(result.risk.history, JSON.stringify(change)).toHaveLength(0)
      expect(result.historyAppended).toBe(false)
    }
  })

  it('still records an audit event for a non-score change', () => {
    const result = prepareSave({ ...SAVE_BASE, original: risk(), draft: risk({ title: 'Renamed' }) })
    if (!result.ok) throw new Error('expected success')

    expect(result.action).toBe('risk.updated')
    expect(result.changes).toContain('Title: changed')
  })

  it('preserves existing history and appends to it', () => {
    const original = risk({
      history: [{ id: 'hist_1', date: '2026-01-01', inherent: { impact: 4, likelihood: 4 }, residual: { impact: 4, likelihood: 4 }, target: { impact: 2, likelihood: 2 }, note: 'Initial assessment', actorId: 'usr_owner' }],
    })
    const draft = { ...original, residual: { impact: 2, likelihood: 2 } as const }

    const result = prepareSave({ ...SAVE_BASE, original, draft })
    if (!result.ok) throw new Error('expected success')

    expect(result.risk.history).toHaveLength(2)
    expect(result.risk.history[0].id).toBe('hist_1')
    expect(result.risk.history[1].id).toBe('hist_test')
  })

  it('cleans before comparing, so a whitespace-only title edit is not a change', () => {
    const original = risk({ title: 'A risk' })
    const result = prepareSave({ ...SAVE_BASE, original, draft: risk({ title: '  A risk  ' }) })
    if (!result.ok) throw new Error('expected success')

    expect(result.changes).toEqual(['Record saved'])
  })
})

// --- defaults ---------------------------------------------------------------

describe('new risk defaults', () => {
  const context = {
    currentUser: USERS[1], // Nino, Risk Owner scoped to Technology
    users: USERS,
    categories: CATEGORIES,
    businessUnits: UNITS,
    customAttributes: ATTRIBUTES,
    risks: [{ ref: 'TECH-001' }, { ref: 'TECH-002' }],
    today: '2026-03-15',
    id: 'risk_new',
  }

  it('applies every documented default', () => {
    const draft = createDraftRisk(context)

    expect(draft).toMatchObject({
      id: 'risk_new',
      title: '',
      type: 'Current',
      status: 'Draft',
      responseType: 'Mitigate',
      outlook: 'Stable',
      businessUnitId: 'bu_technology',
      categoryId: 'cat_cyber',
      riskOwnerId: 'usr_owner',
      originDate: '2026-03-15',
      reviewDate: '2027-03-15',
      targetDate: '2026-09-15',
    })
    expect(draft.inherent).toEqual({ impact: 3, likelihood: 3 })
    expect(draft.residual).toEqual({ impact: 2, likelihood: 3 })
    expect(draft.target).toEqual({ impact: 2, likelihood: 2 })
    expect(draft.controls).toEqual([])
    expect(draft.actions).toEqual([])
  })

  it('generates the next reference for the default business unit', () => {
    expect(createDraftRisk(context).ref).toBe('TECH-003')
  })

  it('skips inactive categories', () => {
    expect(createDraftRisk(context).categoryId).toBe('cat_cyber')
  })

  it('defaults custom values by type and skips inactive attributes', () => {
    const values = defaultCustomValues(ATTRIBUTES)

    expect(values).toEqual({ attr_text: '', attr_number: 0 })
    expect(values.attr_off).toBeUndefined()
  })
})

describe('defaultBusinessUnitId', () => {
  it('prefers the first active unit in the direct scope', () => {
    expect(defaultBusinessUnitId(user({ businessUnitIds: ['bu_finance'] }), UNITS)).toBe('bu_finance')
  })

  it('falls back through the effective scope when the direct grant is inactive', () => {
    expect(defaultBusinessUnitId(user({ businessUnitIds: ['bu_retired'] }), UNITS)).toBe('bu_enterprise')
  })

  it('falls back to the first active unit when the user has no scope', () => {
    expect(defaultBusinessUnitId(user({ businessUnitIds: [] }), UNITS)).toBe('bu_enterprise')
  })
})

describe('defaultRiskOwnerId', () => {
  it('uses the current user when they are a Risk Owner', () => {
    expect(defaultRiskOwnerId(USERS[1], USERS)).toBe('usr_owner')
  })

  it('otherwise uses the first ACTIVE risk owner', () => {
    expect(defaultRiskOwnerId(USERS[0], USERS)).toBe('usr_owner')
  })

  it('falls back to the current user when no risk owner exists', () => {
    const admin = USERS[0]
    expect(defaultRiskOwnerId(admin, [admin])).toBe('usr_admin')
  })
})

// --- owner candidates -------------------------------------------------------

describe('ownerCandidates', () => {
  it('excludes inactive users', () => {
    const ids = ownerCandidates(USERS, UNITS, 'bu_technology', 'role_risk_owner').map((u) => u.id)
    expect(ids).not.toContain('usr_owner_off')
  })

  it('excludes users outside the effective scope of the risk business unit', () => {
    const ids = ownerCandidates(USERS, UNITS, 'bu_technology', 'role_risk_owner').map((u) => u.id)

    expect(ids).toContain('usr_owner')
    expect(ids).not.toContain('usr_owner_fin')
  })

  it('includes a user scoped to an ancestor of the risk business unit', () => {
    const enterpriseOwner = user({ id: 'usr_ent', roleIds: ['role_risk_owner'], businessUnitIds: ['bu_enterprise'] })
    const ids = ownerCandidates([...USERS, enterpriseOwner], UNITS, 'bu_security', 'role_risk_owner').map((u) => u.id)

    expect(ids).toContain('usr_ent')
  })

  it('excludes a user scoped only to a sibling branch', () => {
    const ids = ownerCandidates(USERS, UNITS, 'bu_security', 'role_risk_owner').map((u) => u.id)
    expect(ids).not.toContain('usr_owner_fin')
  })

  it('excludes users without the required capability', () => {
    const ids = ownerCandidates(USERS, UNITS, 'bu_security', 'role_control_owner').map((u) => u.id)

    expect(ids).toContain('usr_control')
    expect(ids).not.toContain('usr_owner')
  })

  it('always includes administrators, who are unrestricted by business unit', () => {
    const ids = ownerCandidates(USERS, UNITS, 'bu_technology', 'role_risk_owner').map((u) => u.id)
    expect(ids).toContain('usr_admin')
  })
})

// --- field-level protection -------------------------------------------------

describe('field-level protection on save', () => {
  function permissions(overrides: Partial<Record<ModuleName, PermissionLevel>>): PermissionSet {
    const set = {} as PermissionSet
    for (const module of MODULE_NAMES) set[module] = overrides[module] ?? 'none'
    return set
  }

  const ROLES: Role[] = [
    { id: 'role_control_owner', nameEn: 'Control Owner', nameKa: '', description: '', system: true, permissions: permissions({ risks: 'read', controls: 'edit', actions: 'read' }) },
    { id: 'role_action_owner', nameEn: 'Action Owner', nameKa: '', description: '', system: true, permissions: permissions({ risks: 'read', controls: 'read', actions: 'edit' }) },
  ]

  const original = risk({
    controls: [control('c1', 'usr_control', 'Owned control'), control('c2', 'usr_other', 'Other control')],
    actions: [action('a1', 'usr_action', 'Owned action'), action('a2', 'usr_other', 'Other action')],
  })

  /** A crafted payload that changes far more than the role may touch. */
  function tampered(): Risk {
    const draft = structuredClone(original)
    draft.title = 'HIJACKED'
    draft.status = 'Completed'
    draft.riskOwnerId = 'attacker'
    draft.residual = { impact: 1, likelihood: 1 }
    draft.controls = draft.controls.map((c) => ({ ...c, title: `${c.title} EDITED` }))
    draft.actions = draft.actions.map((a) => ({ ...a, progress: 100 }))
    return draft
  }

  it('discards a Control Owner’s attempt to change master data or assessments', () => {
    const context: AccessContext = {
      user: user({ id: 'usr_control', roleIds: ['role_control_owner'], businessUnitIds: ['bu_technology'] }),
      roles: ROLES,
      businessUnits: UNITS,
    }

    const merged = mergeAuthorisedRiskUpdate(context, original, tampered())

    expect(merged.title).toBe(original.title)
    expect(merged.status).toBe(original.status)
    expect(merged.riskOwnerId).toBe(original.riskOwnerId)
    expect(merged.residual).toEqual(original.residual)

    // Only their own control is merged.
    expect(merged.controls[0].title).toBe('Owned control EDITED')
    expect(merged.controls[1].title).toBe('Other control')
    expect(merged.actions).toEqual(original.actions)
  })

  it('feeds the merged record — not the submitted one — into prepareSave', () => {
    const context: AccessContext = {
      user: user({ id: 'usr_action', roleIds: ['role_action_owner'], businessUnitIds: ['bu_technology'] }),
      roles: ROLES,
      businessUnits: UNITS,
    }

    const merged = mergeAuthorisedRiskUpdate(context, original, tampered())
    const result = prepareSave({ ...SAVE_BASE, original, draft: merged })
    if (!result.ok) throw new Error('expected success')

    expect(result.risk.title).toBe(original.title)
    // No assessment change survived, so no history item is created.
    expect(result.historyAppended).toBe(false)
    expect(result.changes).toEqual(['Action plans updated'])
  })
})
