import { describe, expect, it } from 'vitest'
import baseline from '../../../fixtures/legacy-state.json'
import type { AppState } from '../../domain/types/index.ts'
import { validateAppState } from '../../domain/validation/app-state.ts'
import { createSeedState } from '../seed/index.ts'
import { migrateState } from './index.ts'
import { DEFAULT_REGISTER_COLUMNS } from './repair.ts'

/** Migrates and fails loudly with the validation errors if it did not work. */
function migrate(raw: unknown): { state: AppState; notes: string[] } {
  const outcome = migrateState(raw)
  if (!outcome.ok) throw new Error(`migration failed: ${outcome.errors.slice(0, 5).join('; ')}`)
  return { state: outcome.result.state, notes: outcome.result.notes }
}

const BASELINE_COUNTS = {
  users: 8,
  roles: 7,
  categories: 38,
  businessUnits: 7,
  customAttributes: 3,
  risks: 8,
  controls: 6,
  actions: 10,
  historyItems: 13,
  riskAuditEvents: 3,
  auditEvents: 4,
  matrixCells: 25,
}

const BASELINE_REFS = ['IT-001', 'IT-002', 'PPL-001', 'IT-003', 'LRC-001', 'IT-004', 'IT-005', 'LRC-002']

function countNested(state: AppState, key: 'controls' | 'actions' | 'history' | 'audit'): number {
  return state.risks.reduce((total, risk) => total + risk[key].length, 0)
}

describe('legacy v7 -> current migration', () => {
  it('produces state that satisfies canonical validation', () => {
    const { state } = migrate(baseline)
    expect(validateAppState(state).ok).toBe(true)
    expect(state.schemaVersion).toBe(12)
  })

  it('preserves every collection count', () => {
    const { state } = migrate(baseline)

    expect({
      users: state.users.length,
      roles: state.roles.length,
      categories: state.categories.length,
      businessUnits: state.businessUnits.length,
      customAttributes: state.customAttributes.length,
      risks: state.risks.length,
      controls: countNested(state, 'controls'),
      actions: countNested(state, 'actions'),
      historyItems: countNested(state, 'history'),
      riskAuditEvents: countNested(state, 'audit'),
      auditEvents: state.auditEvents.length,
      matrixCells: state.matrix.cells.length,
    }).toEqual(BASELINE_COUNTS)
  })

  it('preserves risk IDs and references exactly', () => {
    const { state } = migrate(baseline)

    expect(state.risks.map((risk) => risk.ref)).toEqual(BASELINE_REFS)
    expect(state.risks.map((risk) => risk.id)).toEqual(baseline.state.risks.map((risk) => risk.id))
  })

  it('preserves every assessment score unchanged', () => {
    const { state } = migrate(baseline)

    state.risks.forEach((risk, index) => {
      const original = baseline.state.risks[index]
      expect(risk.inherent).toEqual(original.inherent)
      expect(risk.residual).toEqual(original.residual)
      expect(risk.target).toEqual(original.target)
    })
  })

  it('preserves control and action IDs', () => {
    const { state } = migrate(baseline)

    const controlIds = state.risks.flatMap((risk) => risk.controls.map((control) => control.id))
    const originalControlIds = baseline.state.risks.flatMap((risk) => risk.controls.map((c) => c.id))
    expect(controlIds).toEqual(originalControlIds)

    const actionIds = state.risks.flatMap((risk) => risk.actions.map((action) => action.id))
    const originalActionIds = baseline.state.risks.flatMap((risk) => risk.actions.map((a) => a.id))
    expect(actionIds).toEqual(originalActionIds)
  })

  it('renames the top-level keys', () => {
    const { state } = migrate(baseline)
    const keys = Object.keys(state)

    for (const canonical of ['schemaVersion', 'customAttributes', 'auditEvents', 'savedViews', 'ssoConfig', 'branding']) {
      expect(keys).toContain(canonical)
    }
    for (const legacy of ['version', 'attributes', 'globalAudit', 'savedFilters', 'sso', 'clientLogo']) {
      expect(keys).not.toContain(legacy)
    }
  })

  it('renames per-record fields', () => {
    const { state } = migrate(baseline)

    expect(state.categories[0].level1En).toBe(baseline.state.categories[0].level1)
    expect(state.categories[0].level2En).toBe(baseline.state.categories[0].level2)
    expect(state.businessUnits[0].nameEn).toBe(baseline.state.businessUnits[0].name)
    expect(state.customAttributes[0].labelEn).toBe(baseline.state.attributes[0].nameEn)
    expect(state.users[0].roleIds).toEqual(baseline.state.users[0].roles)
    expect(state.roles[0].nameEn).toBe(baseline.state.roles[0].name)
  })

  it('adds the acceptance record v7 never stored', () => {
    expect('acceptance' in baseline.state.risks[0]).toBe(false)

    const { state } = migrate(baseline)
    for (const risk of state.risks) {
      expect(risk.acceptance).toEqual({
        rationale: '', initiatorId: '', approverId: '',
        approvalDate: '', validUntil: '', reviewDate: '',
      })
    }
  })

  it('drops session-local values from persisted state', () => {
    const keys = Object.keys(migrate(baseline).state)
    expect(keys).not.toContain('language')
    expect(keys).not.toContain('currentUserId')
  })

  it('moves the client logo into branding', () => {
    const { state } = migrate(baseline)
    expect(state.branding.clientLogo).toBe(baseline.state.clientLogo)
  })

  it('normalises widget and report section type slugs', () => {
    const { state } = migrate(baseline)

    const legacyWidgetTypes = new Set(
      baseline.state.dashboards.flatMap((d) => d.widgets.map((w) => w.type)),
    )
    expect(legacyWidgetTypes.has('top-risks')).toBe(true)

    for (const dashboard of state.dashboards) {
      for (const widget of dashboard.widgets) {
        expect(widget.type).not.toContain('-')
      }
    }
    for (const template of state.reportTemplates) {
      for (const section of template.sections) {
        expect(['dashboard', 'openText', 'compactRegister']).toContain(section.type)
      }
    }
  })

  it('keeps report sections pointing at dashboards that exist', () => {
    const { state } = migrate(baseline)
    const ids = new Set(state.dashboards.map((dashboard) => dashboard.id))

    for (const template of state.reportTemplates) {
      for (const section of template.sections) {
        if (section.type === 'dashboard') expect(ids.has(section.dashboardId)).toBe(true)
      }
    }
  })
})

describe('migration idempotence', () => {
  it('produces a byte-identical result when run twice', () => {
    const once = migrate(baseline).state
    const twice = migrate(once).state

    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })

  it('is a no-op on freshly seeded state', () => {
    const seeded = createSeedState()
    const migrated = migrate(seeded).state

    expect(JSON.stringify(migrated)).toBe(JSON.stringify(seeded))
  })

  it('reports no repairs for already-valid state', () => {
    expect(migrate(createSeedState()).notes).toEqual([])
  })

  it('converges after the first pass — a third run changes nothing', () => {
    const first = migrate(baseline).state
    const second = migrate(first).state
    const third = migrate(second).state

    expect(JSON.stringify(third)).toBe(JSON.stringify(second))
  })
})

describe('migration rejects unusable input', () => {
  it('rejects a non-object root', () => {
    for (const value of [null, 42, 'nope', []]) {
      expect(migrateState(value).ok).toBe(false)
    }
  })

  it('rejects a payload missing risks or users', () => {
    expect(migrateState({ users: [] }).ok).toBe(false)
    expect(migrateState({ risks: [] }).ok).toBe(false)
  })

  it('does not mutate the input payload', () => {
    const before = JSON.stringify(baseline)
    migrate(baseline)
    expect(JSON.stringify(baseline)).toBe(before)
  })
})

describe('repair: missing Super Administrator', () => {
  it('restores the role when it has been deleted', () => {
    const seeded = createSeedState()
    seeded.roles = seeded.roles.filter((role) => role.id !== 'role_super_admin')

    const { state, notes } = migrate(seeded)
    expect(state.roles.some((role) => role.id === 'role_super_admin')).toBe(true)
    expect(notes.join(' ')).toContain('Super Administrator role')
  })

  it('restores a user holding the role when none remains', () => {
    const seeded = createSeedState()
    seeded.users = seeded.users.filter((user) => !user.roleIds.includes('role_super_admin'))

    const { state, notes } = migrate(seeded)
    expect(state.users.some((user) => user.roleIds.includes('role_super_admin'))).toBe(true)
    expect(notes.join(' ')).toContain('Super Administrator user')
  })
})

describe('repair: business unit tree', () => {
  it('promotes flat units with no parentId to roots', () => {
    const seeded = createSeedState()
    seeded.businessUnits = seeded.businessUnits.map((unit) => {
      const copy = { ...unit } as Partial<typeof unit>
      delete copy.parentId
      return copy as typeof unit
    })

    const { state, notes } = migrate(seeded)
    expect(state.businessUnits.every((unit) => unit.parentId === null)).toBe(true)
    expect(notes.join(' ')).toContain('promoted to root')
  })

  it('clears a unit that is its own parent', () => {
    const seeded = createSeedState()
    seeded.businessUnits[1].parentId = seeded.businessUnits[1].id

    const { state, notes } = migrate(seeded)
    expect(state.businessUnits[1].parentId).toBeNull()
    expect(notes.join(' ')).toContain('its own parent')
  })

  it('clears a parent reference that does not resolve', () => {
    const seeded = createSeedState()
    seeded.businessUnits[2].parentId = 'bu_deleted'

    const { state, notes } = migrate(seeded)
    expect(state.businessUnits[2].parentId).toBeNull()
    expect(notes.join(' ')).toContain('does not exist')
  })

  it('breaks a cycle between two units', () => {
    const seeded = createSeedState()
    // Enterprise -> Technology -> Enterprise
    seeded.businessUnits[0].parentId = seeded.businessUnits[1].id
    seeded.businessUnits[1].parentId = seeded.businessUnits[0].id

    const { state, notes } = migrate(seeded)
    expect(notes.join(' ')).toContain('cycle')

    // No node may still reach itself through parent links.
    const byId = new Map(state.businessUnits.map((unit) => [unit.id, unit]))
    for (const unit of state.businessUnits) {
      const seen = new Set<string>([unit.id])
      let cursor = unit.parentId ? byId.get(unit.parentId) : undefined
      while (cursor) {
        expect(seen.has(cursor.id)).toBe(false)
        seen.add(cursor.id)
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined
      }
    }
  })
})

describe('repair: dangling references', () => {
  it('removes business unit IDs from user scopes when the unit is gone', () => {
    const seeded = createSeedState()
    seeded.users[0].businessUnitIds = ['bu_enterprise', 'bu_deleted']

    const { state, notes } = migrate(seeded)
    expect(state.users[0].businessUnitIds).toEqual(['bu_enterprise'])
    expect(notes.join(' ')).toContain('business unit references')
  })

  it('fills a role permission set that is missing modules', () => {
    const seeded = createSeedState()
    delete (seeded.roles[2].permissions as Record<string, unknown>).administration

    const { state, notes } = migrate(seeded)
    expect(state.roles[2].permissions.administration).toBe('none')
    expect(notes.join(' ')).toContain('module permissions')
  })
})

describe('repair: matrix configuration (CR-003)', () => {
  it('adds the configuration fields to a pre-CR-003 matrix', () => {
    const seeded = createSeedState()
    // A matrix as stored before the configuration fields existed.
    const legacy = {
      cells: seeded.matrix.cells,
      colors: seeded.matrix.colors,
      impactLabels: {
        1: { en: 'Minor', ka: 'მცირე' }, 2: { en: 'Moderate', ka: '' },
        3: { en: 'Major', ka: '' }, 4: { en: 'Severe', ka: '' }, 5: { en: 'Critical', ka: '' },
      },
      likelihoodLabels: {
        1: { en: 'Remote', ka: '', probability: '0%-5%' },
        2: { en: 'Unlikely', ka: '', probability: '6%-35%' },
        3: { en: 'Possible', ka: '', probability: '36%-65%' },
        4: { en: 'Likely', ka: '', probability: '66%-95%' },
        5: { en: 'Almost Certain', ka: '', probability: 'Once in 10 years' },
      },
    }
    seeded.matrix = legacy as unknown as AppState['matrix']

    const { state } = migrate(seeded)

    expect(state.matrix.version).toBe(1)
    expect(state.matrix.scaleNameEn).toBe('Rating')
    expect(state.matrix.levels.map((level) => level.key)).toEqual([
      'Low', 'Medium', 'High', 'Significant',
    ])
    // The legacy display band is parsed into a real percentage band…
    expect(state.matrix.likelihoodLabels[2].percentFrom).toBe(6)
    expect(state.matrix.likelihoodLabels[2].percentTo).toBe(35)
    // …and an unparseable one is preserved as the free-text value.
    expect(state.matrix.likelihoodLabels[5].percentFrom).toBeNull()
    expect(state.matrix.likelihoodLabels[5].textEn).toBe('Once in 10 years')
    // A configured name is never overwritten.
    expect(state.matrix.impactLabels[1].ka).toBe('მცირე')
  })

  it('keeps a configured matrix untouched and stays idempotent', () => {
    const seeded = createSeedState()
    seeded.matrix = {
      ...seeded.matrix,
      version: 4,
      scaleNameEn: 'Severity',
      levels: seeded.matrix.levels.map((level) =>
        level.key === 'High' ? { ...level, nameEn: 'Elevated' } : level,
      ),
    }

    const once = migrate(seeded).state
    const twice = migrate(once).state

    expect(once.matrix.version).toBe(4)
    expect(once.matrix.scaleNameEn).toBe('Severity')
    expect(twice.matrix.levels.find((level) => level.key === 'High')?.nameEn).toBe('Elevated')
    expect(JSON.stringify(twice.matrix)).toBe(JSON.stringify(once.matrix))
  })
})

describe('repair: manual risk description', () => {
  /** A risk record as stored before CR-002 added the field. */
  function riskWithoutDescription(): AppState['risks'][number] {
    return {
      id: 'risk_old', ref: 'TECH-001', title: 'Legacy record', type: 'Current',
      categoryId: 'cat_16', businessUnitId: 'bu_technology', riskOwnerId: 'usr_owner',
      originDate: '2026-01-01', reviewDate: '2027-01-01', targetDate: '2026-07-01',
      status: 'In Progress', responseType: 'Mitigate', outlook: 'Stable',
      cause: 'A cause', event: 'An event', consequence: 'A consequence', statusNarrative: '',
      inherent: { impact: 3, likelihood: 3 }, residual: { impact: 3, likelihood: 3 },
      target: { impact: 2, likelihood: 2 }, controls: [], actions: [],
      acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
      custom: {}, history: [], audit: [], updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as AppState['risks'][number]
  }

  it('adds an empty description to a risk that predates the field', () => {
    const seeded = createSeedState()
    seeded.risks = [riskWithoutDescription()]

    const { state, notes } = migrate(seeded)

    // Filled with an empty string — never back-filled from the event text.
    expect(state.risks[0].description).toBe('')
    expect(state.risks[0].event).toBe('An event')
    expect(notes.join(' ')).toContain('description')
  })

  it('leaves a stored description untouched and stays idempotent', () => {
    const seeded = createSeedState()
    seeded.risks = [{ ...riskWithoutDescription(), description: 'Written by hand.' }]

    const once = migrate(seeded).state
    const twice = migrate(once).state

    expect(once.risks[0].description).toBe('Written by hand.')
    expect(twice.risks[0].description).toBe('Written by hand.')
  })
})

describe('repair: saved views', () => {
  it('restores missing columns and view mode', () => {
    const seeded = createSeedState()
    seeded.savedViews = [
      {
        id: 'view_old', name: 'Legacy view', userId: 'usr_admin',
        search: '', filters: {}, sort: { field: 'ref', direction: 'asc' },
        visibleColumns: [], viewMode: undefined as unknown as 'compact', isDefault: false,
      },
    ]

    const { state, notes } = migrate(seeded)
    expect(state.savedViews[0].visibleColumns.length).toBeGreaterThan(0)
    expect(state.savedViews[0].viewMode).toBe('detailed')
    expect(notes.join(' ')).toContain('saved view')
  })
})

describe('repair: missing defaults', () => {
  it('restores the default dashboard, report template and site content', () => {
    const seeded = createSeedState()
    seeded.dashboards = []
    seeded.reportTemplates = []
    seeded.siteContent = {} as AppState['siteContent']

    const { state, notes } = migrate(seeded)
    expect(state.dashboards.length).toBeGreaterThan(0)
    expect(state.reportTemplates.length).toBeGreaterThan(0)
    expect(Object.keys(state.siteContent).length).toBeGreaterThan(0)
    expect(notes.join(' ')).toContain('default dashboard')
  })
})

describe('repair: compact register sections', () => {
  /** Replaces the seeded template with one compact section carrying `columns`. */
  function withColumns(columns: string[]): AppState {
    const seeded = createSeedState()
    seeded.reportTemplates = [
      {
        id: 'rpt_legacy', nameEn: 'Legacy pack', nameKa: '',
        descriptionEn: '', descriptionKa: '',
        sections: [
          {
            id: 'sec_register', type: 'compactRegister',
            titleEn: 'Register', titleKa: '', columns, filters: {},
          },
        ],
      },
    ]
    return seeded
  }

  function sectionColumns(state: AppState): string[] {
    const section = state.reportTemplates[0].sections[0]
    return section.type === 'compactRegister' ? section.columns : []
  }

  it('drops columns no renderer covers', () => {
    // `trend`, `controls` and `response` exist in the register but not in the
    // compact section, and were reachable from a v7 template.
    const { state, notes } = migrate(withColumns(['ref', 'trend', 'controls', 'response', 'status']))

    expect(sectionColumns(state)).toEqual(['ref', 'status'])
    expect(notes.join(' ')).toContain('normalised register columns')
  })

  it('falls back to the default columns when nothing survives', () => {
    const { state } = migrate(withColumns(['trend', 'controls']))
    expect(sectionColumns(state)).toEqual(DEFAULT_REGISTER_COLUMNS)
  })

  it('keeps custom attribute columns, including deactivated ones', () => {
    const seeded = createSeedState()
    const attribute = seeded.customAttributes[0]
    attribute.active = false
    const withAttribute = withColumns(['ref', attribute.id])
    withAttribute.customAttributes = seeded.customAttributes

    // Deactivation hides the field but preserves stored values, so the column
    // must survive migration rather than be repaired away.
    expect(sectionColumns(migrate(withAttribute).state)).toEqual(['ref', attribute.id])
  })

  it('leaves a valid column list untouched', () => {
    const columns = ['ref', 'title', 'residual', 'status']
    const { state, notes } = migrate(withColumns(columns))

    expect(sectionColumns(state)).toEqual(columns)
    expect(notes.join(' ')).not.toContain('normalised register columns')
  })

  it('renames the v7 column slugs on the baseline template', () => {
    // The v7 fixture stores ['number','risk','category','owner','residual',
    // 'target','status','trend'] — none of which the v8 renderer knows, which
    // is what blanked the Reports page before this pass existed.
    const { state } = migrate(baseline)
    const section = state.reportTemplates[0].sections.find(
      (candidate) => candidate.type === 'compactRegister',
    )

    expect(section?.type === 'compactRegister' && section.columns).toEqual([
      'ref', 'title', 'category', 'riskOwner', 'residual', 'target', 'status',
    ])
  })
})

describe('repair: rating matrix', () => {
  it('restores missing cells while preserving configured ones', () => {
    const seeded = createSeedState()
    // Keep a deliberately non-default rating, then delete the rest.
    const kept = seeded.matrix.cells.find((cell) => cell.impact === 1 && cell.likelihood === 1)
    if (kept) kept.rating = 'Significant'
    seeded.matrix.cells = seeded.matrix.cells.slice(0, 3)

    const { state, notes } = migrate(seeded)
    expect(state.matrix.cells).toHaveLength(25)
    expect(
      state.matrix.cells.find((cell) => cell.impact === 1 && cell.likelihood === 1)?.rating,
    ).toBe('Significant')
    expect(notes.join(' ')).toContain('missing or invalid cell')
  })

  it('restores missing colours while preserving configured ones', () => {
    const seeded = createSeedState()
    seeded.matrix.colors.Low = '#123456'
    delete (seeded.matrix.colors as Record<string, unknown>).Significant

    const { state, notes } = migrate(seeded)
    expect(state.matrix.colors.Low).toBe('#123456')
    expect(state.matrix.colors.Significant).toBe('#F32121')
    expect(notes.join(' ')).toContain('colour')
  })

  it('rebuilds the matrix entirely when it is absent', () => {
    const seeded = createSeedState()
    delete (seeded as Partial<AppState>).matrix

    const { state } = migrate(seeded)
    expect(state.matrix.cells).toHaveLength(25)
    expect(state.matrix.colors.Low).toBe('#00B050')
  })
})

describe('repair: public demo requests (schema 12)', () => {
  const request = {
    id: 'demo_1',
    submittedAt: '2026-08-17T09:30:00.000Z',
    firstName: 'Nino',
    lastName: 'Beridze',
    email: 'nino@example.com',
    jobTitle: 'Head of Risk',
    company: 'Example Bank',
    country: 'GE',
    phone: '+995 32 200 00 00',
    solutionIds: ['solution_risk'],
    message: '',
    consent: true,
    language: 'en',
    status: 'Contacted',
    handledBy: 'usr_super_admin',
    handledAt: '2026-08-17T10:00:00.000Z',
    notes: '',
  }

  it('adds the collection to state that predates it', () => {
    const seeded = createSeedState()
    delete (seeded as Partial<AppState>).demoRequests

    const { state } = migrate(seeded)
    expect(state.demoRequests).toEqual([])
  })

  it('leaves a valid request untouched', () => {
    const seeded = createSeedState()
    seeded.demoRequests = [structuredClone(request) as AppState['demoRequests'][number]]

    const { state } = migrate(seeded)
    expect(state.demoRequests).toEqual([request])
  })

  /*
   * The one collection an unauthenticated visitor can append to, so what comes
   * back off storage is treated as untrusted input rather than trusted state.
   */
  it('coerces a tampered record instead of trusting it', () => {
    const seeded = createSeedState()
    seeded.demoRequests = [
      {
        ...request,
        status: 'Archived',
        language: 'fr',
        consent: 'yes',
        solutionIds: ['solution_risk', 'solution_ghost'],
        notes: 42,
      } as unknown as AppState['demoRequests'][number],
    ]

    const { state } = migrate(seeded)
    const [repaired] = state.demoRequests

    expect(repaired.status).toBe('New')
    expect(repaired.language).toBe('en')
    expect(repaired.consent).toBe(false)
    expect(repaired.solutionIds).toEqual(['solution_risk'])
    expect(repaired.notes).toBe('')
  })

  it('drops entries that are not objects at all', () => {
    const seeded = createSeedState()
    seeded.demoRequests = [
      structuredClone(request) as AppState['demoRequests'][number],
      'nonsense' as unknown as AppState['demoRequests'][number],
    ]

    const { state, notes } = migrate(seeded)
    expect(state.demoRequests).toHaveLength(1)
    expect(notes.join(' ')).toContain('unreadable')
  })

  it('is idempotent', () => {
    const seeded = createSeedState()
    seeded.demoRequests = [structuredClone(request) as AppState['demoRequests'][number]]

    const once = migrate(seeded).state
    const twice = migrate(once).state
    expect(twice.demoRequests).toEqual(once.demoRequests)
  })
})

describe('repair: site content fields', () => {
  /*
   * Content saved before a schema step must not leave the page it feeds blank
   * — the request-demo copy arrived in 12 and every earlier record lacks it.
   */
  it('fills fields a stored record predates without touching configured ones', () => {
    const seeded = createSeedState()
    seeded.siteContent.heroTitle = 'Our own headline'
    delete (seeded.siteContent as Partial<AppState['siteContent']>).requestDemoTitle
    delete (seeded.siteContent as Partial<AppState['siteContent']>).requestDemoHighlights

    const { state, notes } = migrate(seeded)

    expect(state.siteContent.heroTitle).toBe('Our own headline')
    expect(state.siteContent.requestDemoTitle.length).toBeGreaterThan(0)
    expect(state.siteContent.requestDemoHighlights.length).toBeGreaterThan(0)
    expect(notes.join(' ')).toContain('site content')
  })

  it('keeps a field an administrator deliberately emptied', () => {
    const seeded = createSeedState()
    seeded.siteContent.contactPhone = ''

    const { state } = migrate(seeded)
    expect(state.siteContent.contactPhone).toBe('')
  })
})
