import { describe, expect, it } from 'vitest'
import legacyBaseline from '../../../fixtures/legacy-state.json'
import { SCALE_VALUES } from '../types/enums.ts'
import type {
  AppState,
  MatrixCell,
  RatingMatrix,
  Risk,
  Role,
  Score,
  User,
} from '../types/index.ts'
import { parseImportableState, validateAppState, validateImportableState } from './app-state.ts'

/**
 * Compile-time guard: resolves to `never` — and therefore fails the build — if
 * the named key is ever added to the type. Backs the M2 acceptance criterion
 * that no derived value is persisted (ARCHITECTURE.md §2.3).
 */
type KeyAbsent<T, K extends string> = K extends keyof T ? never : true

const scoreOmitsScore: KeyAbsent<Score, 'score'> = true
const scoreOmitsRating: KeyAbsent<Score, 'rating'> = true
const riskOmitsScore: KeyAbsent<Risk, 'score'> = true
const riskOmitsRating: KeyAbsent<Risk, 'rating'> = true

/*
 * Fixtures are built locally rather than imported from src/data/seed: the
 * domain layer may not depend on outer layers, and the lint rule enforces it.
 * Building the matrix independently here also gives the validator a second,
 * unrelated oracle for the 25-cell requirement.
 */
function makeMatrix(): RatingMatrix {
  const cells: MatrixCell[] = []
  for (const impact of SCALE_VALUES) {
    for (const likelihood of SCALE_VALUES) {
      cells.push({ impact, likelihood, rating: 'Low' })
    }
  }
  return {
    cells,
    colors: { Low: '#00B050', Medium: '#FFF200', High: '#FFB900', Significant: '#F32121' },
    impactLabels: {
      1: { en: 'Minor', ka: '' }, 2: { en: 'Moderate', ka: '' }, 3: { en: 'Major', ka: '' },
      4: { en: 'Severe', ka: '' }, 5: { en: 'Critical', ka: '' },
    },
    likelihoodLabels: {
      1: { en: 'Remote', ka: '', probability: '0%-5%' },
      2: { en: 'Unlikely', ka: '', probability: '6%-35%' },
      3: { en: 'Possible', ka: '', probability: '36%-65%' },
      4: { en: 'Likely', ka: '', probability: '66%-95%' },
      5: { en: 'Almost Certain', ka: '', probability: '96%-100%' },
    },
  }
}

function makeRole(): Role {
  return {
    id: 'role_test',
    nameEn: 'Test Role',
    nameKa: '',
    description: '',
    system: false,
    permissions: {
      dashboard: 'read', register: 'read', risks: 'read', controls: 'read',
      actions: 'read', reports: 'read', audit: 'read', administration: 'none',
    },
  }
}

function makeUser(): User {
  return {
    id: 'usr_test',
    name: 'Test User',
    title: '',
    email: 'test@example.com',
    password: 'x',
    status: 'Active',
    roleIds: ['role_test'],
    businessUnitIds: ['bu_root'],
  }
}

function makeRisk(): Risk {
  const score: Score = { impact: 3, likelihood: 3 }
  return {
    id: 'risk_test', ref: 'ENT-001', title: 'Test risk', type: 'Current',
    categoryId: 'cat_01', businessUnitId: 'bu_root', riskOwnerId: 'usr_test',
    originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
    status: 'Draft', responseType: 'Mitigate', outlook: 'Stable',
    cause: 'A cause.', event: 'An event.', consequence: 'A consequence.',
    statusNarrative: '',
    inherent: { ...score }, residual: { ...score }, target: { ...score },
    controls: [], actions: [],
    acceptance: {
      rationale: '', initiatorId: '', approverId: '',
      approvalDate: '', validUntil: '', reviewDate: '',
    },
    custom: {}, history: [], audit: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeValidState(overrides: Partial<AppState> = {}): AppState {
  return {
    schemaVersion: 8,
    users: [makeUser()],
    roles: [makeRole()],
    categories: [
      { id: 'cat_01', level1En: 'Operational', level1Ka: '', level2En: 'Cyber Security', level2Ka: '', active: true },
    ],
    businessUnits: [
      { id: 'bu_root', code: 'ENT', nameEn: 'Enterprise', nameKa: '', parentId: null, active: true },
    ],
    customAttributes: [],
    matrix: makeMatrix(),
    risks: [],
    savedViews: [],
    dashboards: [],
    reportTemplates: [],
    auditEvents: [],
    branding: { clientLogo: null },
    ssoConfig: {
      enabled: false, providerName: '', entityId: '', metadataUrl: '',
      acsUrl: '', emailAttribute: 'email', roleAttribute: 'groups', roleMappings: '',
    },
    // Site content is not under test here; the validator only checks it is an
    // object, and the migration repair restores a full default when empty.
    siteContent: {} as AppState['siteContent'],
    ...overrides,
  }
}

describe('derived values are not persisted', () => {
  it('keeps score and rating off Score and Risk', () => {
    expect([scoreOmitsScore, scoreOmitsRating, riskOmitsScore, riskOmitsRating]).toEqual([
      true, true, true, true,
    ])
  })

  it('describes an assessment with impact and likelihood only', () => {
    const score: Score = { impact: 4, likelihood: 5 }
    expect(Object.keys(score).sort()).toEqual(['impact', 'likelihood'])
  })
})

describe('validateAppState', () => {
  it('accepts a well-formed state', () => {
    const result = validateAppState(makeValidState())
    expect(result.ok ? [] : result.errors).toEqual([])
  })

  it('accepts a state containing a fully-specified risk', () => {
    const result = validateAppState(makeValidState({ risks: [makeRisk()] }))
    expect(result.ok ? [] : result.errors).toEqual([])
  })

  it('rejects a non-object root', () => {
    for (const value of [null, 42, 'state', [], undefined]) {
      expect(validateAppState(value).ok).toBe(false)
    }
  })

  it('reports every missing collection by name', () => {
    const result = validateAppState({ schemaVersion: 8 })
    expect(result.ok).toBe(false)
    if (result.ok) return

    for (const key of ['users', 'roles', 'categories', 'risks', 'auditEvents']) {
      expect(result.errors.some((error) => error.startsWith(`${key}:`))).toBe(true)
    }
  })

  it('rejects a role missing a module permission', () => {
    const state = makeValidState()
    delete (state.roles[0].permissions as Record<string, unknown>).administration

    const result = validateAppState(state)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes('roles[0].permissions'))).toBe(true)
    }
  })

  it('rejects an incomplete matrix', () => {
    const state = makeValidState()
    state.matrix.cells = state.matrix.cells.slice(0, 24)

    const result = validateAppState(state)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes('missing cell'))).toBe(true)
    }
  })

  it('rejects an out-of-range score', () => {
    const risk = makeRisk()
    risk.inherent = { impact: 9, likelihood: 1 } as unknown as Score

    const result = validateAppState(makeValidState({ risks: [risk] }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes('risks[0].inherent'))).toBe(true)
    }
  })

  it('rejects a risk missing cause, event or consequence', () => {
    const risk = makeRisk()
    risk.cause = '   '
    risk.consequence = ''

    const result = validateAppState(makeValidState({ risks: [risk] }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes('risks[0].cause'))).toBe(true)
      expect(result.errors.some((error) => error.includes('risks[0].consequence'))).toBe(true)
    }
  })

  it('rejects an action with progress outside 0-100', () => {
    const risk = makeRisk()
    risk.actions = [
      {
        id: 'act_1', title: 'Do the thing', description: '', deliverable: '',
        ownerId: 'usr_test', dueDate: '2026-06-01', status: 'In Progress',
        priority: 'Medium', progress: 140, notes: '',
      },
    ]

    const result = validateAppState(makeValidState({ risks: [risk] }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes('actions[0].progress'))).toBe(true)
    }
  })

  it('rejects a user with no role or no business unit scope', () => {
    const noRole = makeUser()
    noRole.id = 'usr_a'
    noRole.roleIds = []

    const noScope = makeUser()
    noScope.id = 'usr_b'
    noScope.businessUnitIds = []

    const result = validateAppState(makeValidState({ users: [noRole, noScope] }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes('users[0].roleIds'))).toBe(true)
      expect(result.errors.some((error) => error.includes('users[1].businessUnitIds'))).toBe(true)
    }
  })
})

describe('parseImportableState', () => {
  it('rejects malformed JSON without throwing', () => {
    const result = parseImportableState('{ not valid json')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]).toContain('invalid JSON')
    }
  })

  it('rejects a payload missing risks', () => {
    const result = parseImportableState(JSON.stringify({ users: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain('risks: expected an array')
    }
  })

  it('rejects a payload missing users', () => {
    const result = parseImportableState(JSON.stringify({ risks: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContain('users: expected an array')
    }
  })

  it('accepts a minimal payload with both arrays', () => {
    expect(parseImportableState(JSON.stringify({ risks: [], users: [] })).ok).toBe(true)
  })

  /*
   * A legacy v7 backup must survive the import gate so migration can run.
   * The gate is deliberately permissive; full canonical validation applies
   * only after migration (ARCHITECTURE.md §4.2).
   */
  it('accepts a legacy v7 export and unwraps the nested state', () => {
    const result = parseImportableState(JSON.stringify(legacyBaseline))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const state = result.value as Record<string, unknown>
    expect(state.version).toBe(7)
    expect(Array.isArray(state.risks)).toBe(true)
    expect(Array.isArray(state.users)).toBe(true)
  })

  it('does not satisfy canonical validation until migration runs', () => {
    const gate = parseImportableState(JSON.stringify(legacyBaseline))
    expect(gate.ok).toBe(true)
    if (!gate.ok) return

    // The raw v7 shape uses `version`, `attributes`, `globalAudit`,
    // `savedFilters` and `sso`, and names category, business unit and user
    // fields differently — so canonical validation must reject it here.
    // `src/data/migration` is what closes the gap; that the migrated result
    // *does* validate is asserted in migration.test.ts.
    expect(validateAppState(gate.value).ok).toBe(false)
  })
})

describe('validateImportableState', () => {
  it('accepts a bare state object as well as a wrapped export', () => {
    expect(validateImportableState({ risks: [], users: [] }).ok).toBe(true)
    expect(validateImportableState({ state: { risks: [], users: [] } }).ok).toBe(true)
  })
})
