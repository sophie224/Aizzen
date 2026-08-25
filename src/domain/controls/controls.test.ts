import { describe, expect, it } from 'vitest'
import type {
  AccessContext,
} from '../permissions/index.ts'
import type {
  BusinessUnit,
  ControlConfig,
  ControlDeficiency,
  ControlRiskLink,
  PermissionSet,
  RegisterControl,
  Role,
  User,
} from '../types/index.ts'
import {
  availableColumns,
  createDefaultControlConfig,
  FRAMEWORK_PACKAGES,
  importTemplateCsv,
  linkedControls,
  moveColumn,
  neutraliseCell,
  nextControlRef,
  nextDeficiencyRef,
  orderedColumns,
  parseCsv,
  planControlImport,
  riskViewCustomColumns,
  scaleColor,
  scaleLabel,
  searchControls,
  toCsv,
  visibleControls,
} from './index.ts'

/*
 * Control Register domain rules (CR-2026).
 *
 * The invariants worth protecting: sequence numbering that framework imports
 * cannot disturb, OU scoping that reuses the platform's hierarchy, scale
 * labels that survive an administrator's rename, and an import that reports
 * every bad row instead of writing some of them.
 */

const permissions = (level: 'none' | 'read' | 'edit'): PermissionSet => ({
  dashboard: level, register: level, risks: level, controls: level,
  actions: level, reports: level, audit: level, administration: 'none',
})

const UNITS: BusinessUnit[] = [
  { id: 'bu_root', code: 'ENT', nameEn: 'Enterprise', nameKa: '', parentId: null, active: true },
  { id: 'bu_tech', code: 'TECH', nameEn: 'Technology', nameKa: '', parentId: 'bu_root', active: true },
  { id: 'bu_sec', code: 'SEC', nameEn: 'Security', nameKa: '', parentId: 'bu_tech', active: true },
  { id: 'bu_fin', code: 'FIN', nameEn: 'Finance', nameKa: '', parentId: 'bu_root', active: true },
]

const ROLE: Role = {
  id: 'role_custom', nameEn: 'Control steward', nameKa: '', description: '',
  system: false, permissions: permissions('edit'),
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'usr_1', name: 'Control Steward', title: 'Steward', email: 'steward@erm.local',
    password: 'x', status: 'Active', roleIds: ['role_custom'], businessUnitIds: ['bu_tech'],
    ...overrides,
  }
}

function contextFor(user: User): AccessContext {
  return { user, roles: [ROLE], businessUnits: UNITS }
}

function makeControl(overrides: Partial<RegisterControl> = {}): RegisterControl {
  return {
    id: 'ctl_1', ref: '0001', source: 'Manual', frameworkId: null, frameworkVersion: '',
    businessUnitId: 'bu_tech', name: 'Quarterly access review', objective: 'Review privileged access',
    ownerId: 'usr_1', effectiveness: 'effective', maturity: 'defined', assurance: 'medium',
    evidence: [], custom: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('sequential identifiers (FR-CR-03, FR-CD-03)', () => {
  it('starts at 0001 and increments', () => {
    expect(nextControlRef([])).toBe('0001')
    expect(nextControlRef([makeControl({ ref: '0001' })])).toBe('0002')
  })

  it('never reuses a number that has been issued', () => {
    const controls = [makeControl({ ref: '0001' }), makeControl({ id: 'ctl_2', ref: '0002' })]
    // 0002 is deleted; the next control must still be 0003.
    expect(nextControlRef([controls[0]])).toBe('0002')
    expect(nextControlRef(controls)).toBe('0003')
  })

  it('ignores framework identifiers, which keep their own UID', () => {
    const controls = [
      makeControl({ ref: 'A.5.1', source: 'Framework' }),
      makeControl({ id: 'ctl_2', ref: 'GV.OC', source: 'Framework' }),
      makeControl({ id: 'ctl_3', ref: '0007' }),
    ]
    expect(nextControlRef(controls)).toBe('0008')
  })

  it('numbers findings independently of controls', () => {
    const findings = [{ ref: '0001' }, { ref: '0002' }] as ControlDeficiency[]
    expect(nextDeficiencyRef(findings)).toBe('0003')
  })
})

describe('OU visibility (FR-CR-08, QA-14)', () => {
  const controls = [
    makeControl({ id: 'ctl_tech', businessUnitId: 'bu_tech' }),
    makeControl({ id: 'ctl_sec', businessUnitId: 'bu_sec' }),
    makeControl({ id: 'ctl_fin', businessUnitId: 'bu_fin' }),
  ]

  it('shows a unit and its descendants, never a sibling', () => {
    const visible = visibleControls(contextFor(makeUser()), controls).map((control) => control.id)
    expect(visible).toEqual(['ctl_tech', 'ctl_sec'])
  })

  it('shows nothing to a user scoped to another branch', () => {
    const user = makeUser({ id: 'usr_2', businessUnitIds: ['bu_fin'] })
    const visible = visibleControls(contextFor(user), controls).map((control) => control.id)
    expect(visible).toEqual(['ctl_fin'])
  })

  it('shows nothing at all without controls: read', () => {
    const readless: Role = { ...ROLE, permissions: permissions('none') }
    const context: AccessContext = { user: makeUser(), roles: [readless], businessUnits: UNITS }
    expect(visibleControls(context, controls)).toEqual([])
  })

  it('hides an out-of-scope control from a risk it is linked to', () => {
    const links: ControlRiskLink[] = [
      { id: 'lnk_1', riskId: 'risk_1', controlId: 'ctl_tech', createdAt: '', actorId: 'usr_1' },
      { id: 'lnk_2', riskId: 'risk_1', controlId: 'ctl_fin', createdAt: '', actorId: 'usr_1' },
    ]
    const linked = linkedControls(contextFor(makeUser()), { controls, controlRiskLinks: links }, 'risk_1')
    expect(linked.map((control) => control.id)).toEqual(['ctl_tech'])
  })
})

describe('configurable scales (FR-CR-09, QA-08)', () => {
  it('renames a level without touching stored records', () => {
    const config: ControlConfig = createDefaultControlConfig()
    const control = makeControl({ effectiveness: 'effective' })

    config.effectiveness = config.effectiveness.map((level) =>
      level.key === 'effective' ? { ...level, labelEn: 'Fully operating', color: '#123456' } : level,
    )

    // The stored key is untouched; only what the screen prints changes.
    expect(control.effectiveness).toBe('effective')
    expect(scaleLabel(config, 'effectiveness', control.effectiveness, 'en')).toBe('Fully operating')
    expect(scaleColor(config, 'effectiveness', control.effectiveness)).toBe('#123456')
  })

  it('falls back to English when the Georgian label is blank', () => {
    const config = createDefaultControlConfig()
    config.assurance = [{ key: 'high', labelEn: 'High', labelKa: '', color: '#000000' }]
    expect(scaleLabel(config, 'assurance', 'high', 'ka')).toBe('High')
  })

  it('renders a removed level as its stored key rather than a blank', () => {
    const config = createDefaultControlConfig()
    config.effectiveness = config.effectiveness.filter((level) => level.key !== 'effective')
    expect(scaleLabel(config, 'effectiveness', 'effective', 'en')).toBe('effective')
  })
})

describe('custom columns and column order (FR-CR-07, FR-CR-11)', () => {
  const config = (() => {
    const base = createDefaultControlConfig()
    base.customColumns = [
      { id: 'col_owner_dept', register: 'control', labelEn: 'Owning department', labelKa: '', type: 'text', options: [], showInRiskView: true, active: true },
      { id: 'col_internal', register: 'control', labelEn: 'Internal note', labelKa: '', type: 'text', options: [], showInRiskView: false, active: true },
      { id: 'col_retired', register: 'control', labelEn: 'Retired', labelKa: '', type: 'text', options: [], showInRiskView: true, active: false },
      { id: 'col_finding', register: 'deficiency', labelEn: 'Source', labelKa: '', type: 'text', options: [], showInRiskView: false, active: true },
    ]
    return base
  })()

  it('offers active columns for the register they belong to', () => {
    const ids = availableColumns(config, 'control').map((column) => column.id)
    expect(ids).toContain('col_owner_dept')
    expect(ids).toContain('col_internal')
    expect(ids).not.toContain('col_retired')
    expect(ids).not.toContain('col_finding')
  })

  it('exposes only the ticked column to the risk-side view (QA-10)', () => {
    expect(riskViewCustomColumns(config).map((column) => column.id)).toEqual(['col_owner_dept'])
  })

  it('keeps a saved order and appends columns added since', () => {
    const preferences = [{ id: 'p1', userId: 'usr_1', register: 'control' as const, columnIds: ['name', 'ref'] }]
    expect(orderedColumns(preferences, 'usr_1', 'control', ['ref', 'name', 'owner'])).toEqual([
      'name', 'ref', 'owner',
    ])
  })

  it('ignores a stale preference rather than hiding a column', () => {
    const preferences = [{ id: 'p1', userId: 'usr_1', register: 'control' as const, columnIds: ['gone', 'name'] }]
    expect(orderedColumns(preferences, 'usr_1', 'control', ['ref', 'name'])).toEqual(['name', 'ref'])
  })

  it('keeps another user’s order to themselves (QA-11)', () => {
    const preferences = [{ id: 'p1', userId: 'usr_other', register: 'control' as const, columnIds: ['name', 'ref'] }]
    expect(orderedColumns(preferences, 'usr_1', 'control', ['ref', 'name'])).toEqual(['ref', 'name'])
  })

  it('moves a column to the position of its drop target', () => {
    expect(moveColumn(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(moveColumn(['a', 'b'], 'a', 'a')).toEqual(['a', 'b'])
  })
})

describe('type-ahead control lookup (FR-CD-04)', () => {
  const controls = [
    makeControl({ id: 'c1', ref: '0001', name: 'Access review' }),
    makeControl({ id: 'c2', ref: 'A.5.15', name: 'Access control' }),
    makeControl({ id: 'c3', ref: '0002', name: 'Backup restore test', objective: 'Restore access' }),
  ]

  it('ranks an identifier or name prefix above a mid-string hit', () => {
    expect(searchControls(controls, 'access').map((control) => control.id)).toEqual(['c1', 'c2', 'c3'])
    expect(searchControls(controls, 'A.5').map((control) => control.id)).toEqual(['c2'])
  })

  it('returns everything, capped, for an empty term', () => {
    expect(searchControls(controls, '  ')).toHaveLength(3)
    expect(searchControls(controls, '', 2)).toHaveLength(2)
  })
})

describe('framework packages (FR-CR-02)', () => {
  it('ships the five libraries the change request names', () => {
    expect(FRAMEWORK_PACKAGES.map((entry) => entry.id)).toEqual([
      'iso27001', 'nistCsf2', 'iso31000', 'nis2', 'sox',
    ])
  })

  it('carries a version and unique identifiers per package', () => {
    for (const entry of FRAMEWORK_PACKAGES) {
      expect(entry.version).not.toBe('')
      expect(entry.controls.length).toBeGreaterThan(0)
      const uids = entry.controls.map((control) => control.uid)
      expect(new Set(uids).size).toBe(uids.length)
    }
  })
})

describe('bulk import (FR-CR-06, QA-04, QA-05)', () => {
  const config = createDefaultControlConfig()
  const users: User[] = [makeUser({ id: 'usr_owner', email: 'owner@erm.local' })]
  const baseContext = {
    businessUnits: UNITS,
    users,
    config,
    controls: [makeControl({ id: 'ctl_existing', ref: '0001' })],
    allowedBusinessUnitIds: ['bu_tech', 'bu_sec'],
  }

  const header = 'Control ID,Organization,Control Name,Control Objective,Control Owner,Control Effectiveness,Control Maturity,Assurance Level'

  it('parses quoted CSV with embedded commas and newlines', () => {
    const rows = parseCsv('a,b\n"one, two","line\nbreak"')
    expect(rows).toEqual([['a', 'b'], ['one, two', 'line\nbreak']])
  })

  it('plans creates and updates from a valid file', () => {
    const csv = [
      header,
      ',TECH,New control,Objective,owner@erm.local,Effective,Defined,High',
      '0001,TECH,Renamed control,,,,,',
    ].join('\n')

    const plan = planControlImport(parseCsv(csv), baseContext)
    expect(plan.fileIssues).toEqual([])
    expect(plan.created).toBe(1)
    expect(plan.updated).toBe(1)
    expect(plan.rejected).toBe(0)
    expect(plan.rows[0].values?.ownerId).toBe('usr_owner')
    expect(plan.rows[0].values?.effectiveness).toBe('effective')
    expect(plan.rows[1].targetId).toBe('ctl_existing')
  })

  it('reports every faulty row and writes none of them', () => {
    const csv = [
      header,
      ',TECH,,Missing name,,,,',
      ',NOPE,Unknown unit,,,,,',
      ',TECH,Bad owner,,ghost@erm.local,,,',
      ',TECH,Bad level,,,Sort of effective,,',
      ',FIN,Out of scope,,,,,',
    ].join('\n')

    const plan = planControlImport(parseCsv(csv), baseContext)
    expect(plan.created).toBe(0)
    expect(plan.rejected).toBe(5)
    expect(plan.rows.every((row) => row.action === 'reject')).toBe(true)

    const messages = plan.rows.flatMap((row) => row.issues.map((issue) => `${issue.column}: ${issue.message}`))
    expect(messages).toContain('Control Name: Required.')
    expect(messages.some((message) => message.includes('Unknown business unit'))).toBe(true)
    expect(messages.some((message) => message.includes('No user with email'))).toBe(true)
    expect(messages.some((message) => message.includes('not a configured level'))).toBe(true)
    expect(messages).toContain('Organization: Outside your access scope.')
  })

  it('rejects a duplicate Control ID inside one file', () => {
    const csv = [header, '0001,TECH,First,,,,,', '0001,TECH,Second,,,,,'].join('\n')
    const plan = planControlImport(parseCsv(csv), baseContext)
    expect(plan.rejected).toBe(1)
  })

  it('refuses a file that is missing a mandatory column', () => {
    const plan = planControlImport(parseCsv('Control Name\nSomething'), baseContext)
    expect(plan.fileIssues[0]).toContain('Organization')
    expect(plan.rows).toEqual([])
  })
})

describe('spreadsheet safety (SEC-04)', () => {
  it('neutralises a value that a spreadsheet would evaluate', () => {
    expect(neutraliseCell('=cmd|calc')).toBe("'=cmd|calc")
    expect(neutraliseCell('+1')).toBe("'+1")
    expect(neutraliseCell('-1')).toBe("'-1")
    expect(neutraliseCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(neutraliseCell('Quarterly review')).toBe('Quarterly review')
  })

  it('neutralises on export and quotes what needs quoting', () => {
    expect(toCsv([['=HYPERLINK("x")', 'a,b']])).toBe('"\'=HYPERLINK(""x"")","a,b"')
  })

  it('ships a template carrying every documented column', () => {
    expect(importTemplateCsv('TECH').split('\r\n')[0]).toBe(
      'Control ID,Organization,Control Name,Control Objective,Control Owner,Control Effectiveness,Control Maturity,Assurance Level',
    )
  })
})
