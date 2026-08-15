import { describe, expect, it } from 'vitest'
import baseline from '../../../fixtures/legacy-state.json'
import { STORAGE_KEY } from '../types/app-state.ts'
import { parseImportableState, validateAppState } from './app-state.ts'

/*
 * M0 baseline characterisation.
 *
 * `fixtures/legacy-state.json` is the frozen legacy dataset extracted from the
 * v7 `app.html` build. It defines what "no regression" means for the refactor.
 *
 * The counts below are the contract M3's migration must preserve exactly:
 * migrating v7 -> v8 may rename keys and repair references, but it may never
 * lose a risk, control, action, history item or audit event
 * (ARCHITECTURE.md §4.1).
 */

const state = baseline.state

const EXPECTED = {
  schemaVersion: 7,
  users: 8,
  roles: 7,
  categories: 38,
  businessUnits: 7,
  attributes: 3,
  risks: 8,
  dashboards: 1,
  reportTemplates: 1,
  savedFilters: 0,
  globalAudit: 4,
  matrixCells: 25,
  controls: 6,
  actions: 10,
  historyItems: 13,
  riskAuditEvents: 3,
} as const

const RISK_REFS = ['IT-001', 'IT-002', 'PPL-001', 'IT-003', 'LRC-001', 'IT-004', 'IT-005', 'LRC-002']

function sumNested(key: 'controls' | 'actions' | 'history' | 'audit'): number {
  return state.risks.reduce((total, risk) => total + risk[key].length, 0)
}

describe('legacy baseline fixture', () => {
  it('is a v7 export with a nested state payload', () => {
    expect(baseline.schemaVersion).toBe(EXPECTED.schemaVersion)
    expect(baseline.app).toBe('AIZEN Risk & Compliance')
    expect(state.version).toBe(EXPECTED.schemaVersion)
  })

  it('carries non-empty risks and users', () => {
    expect(state.risks.length).toBeGreaterThan(0)
    expect(state.users.length).toBeGreaterThan(0)
  })

  it('records the top-level collection counts M3 must preserve', () => {
    expect({
      users: state.users.length,
      roles: state.roles.length,
      categories: state.categories.length,
      businessUnits: state.businessUnits.length,
      attributes: state.attributes.length,
      risks: state.risks.length,
      dashboards: state.dashboards.length,
      reportTemplates: state.reportTemplates.length,
      savedFilters: state.savedFilters.length,
      globalAudit: state.globalAudit.length,
      matrixCells: state.matrix.cells.length,
    }).toEqual({
      users: EXPECTED.users,
      roles: EXPECTED.roles,
      categories: EXPECTED.categories,
      businessUnits: EXPECTED.businessUnits,
      attributes: EXPECTED.attributes,
      risks: EXPECTED.risks,
      dashboards: EXPECTED.dashboards,
      reportTemplates: EXPECTED.reportTemplates,
      savedFilters: EXPECTED.savedFilters,
      globalAudit: EXPECTED.globalAudit,
      matrixCells: EXPECTED.matrixCells,
    })
  })

  it('records the nested child counts M3 must preserve', () => {
    expect({
      controls: sumNested('controls'),
      actions: sumNested('actions'),
      historyItems: sumNested('history'),
      riskAuditEvents: sumNested('audit'),
    }).toEqual({
      controls: EXPECTED.controls,
      actions: EXPECTED.actions,
      historyItems: EXPECTED.historyItems,
      riskAuditEvents: EXPECTED.riskAuditEvents,
    })
  })

  it('pins the risk references, which migration must not renumber', () => {
    expect(state.risks.map((risk) => risk.ref)).toEqual(RISK_REFS)
  })

  it('keeps risk-scoped audit events cross-referenced to the global trail', () => {
    const globalIds = new Set(state.globalAudit.map((event) => event.id))
    const scopedIds = state.risks.flatMap((risk) => risk.audit.map((event) => event.id))

    expect(scopedIds.length).toBe(EXPECTED.riskAuditEvents)
    expect(scopedIds.every((id) => globalIds.has(id))).toBe(true)
  })

  it('stores only impact and likelihood per assessment, never a score or rating', () => {
    for (const risk of state.risks) {
      for (const assessment of [risk.inherent, risk.residual, risk.target]) {
        expect(Object.keys(assessment).sort()).toEqual(['impact', 'likelihood'])
      }
    }
  })

  it('uses the storage key the refactor must retain', () => {
    expect(STORAGE_KEY).toBe('erm-risk-management-v3-state')
  })
})

describe('legacy baseline against the current contract', () => {
  it('passes the permissive import gate', () => {
    const result = parseImportableState(JSON.stringify(baseline))
    expect(result.ok).toBe(true)
  })

  /*
   * Deliberately asserts FAILURE. The v7 shape uses `version`, `attributes`,
   * `globalAudit`, `savedFilters` and `sso`, and names category, business unit
   * and user fields differently. When M3's migration lands, this expectation
   * flips to `true` — that flip is the signal migration works.
   */
  it('does not yet satisfy canonical v8 validation', () => {
    expect(validateAppState(state).ok).toBe(false)
  })

  it('exposes exactly the v7 key names migration has to rename', () => {
    const keys = Object.keys(state)

    for (const legacyKey of ['version', 'attributes', 'globalAudit', 'savedFilters', 'sso']) {
      expect(keys).toContain(legacyKey)
    }
    for (const canonicalKey of ['schemaVersion', 'customAttributes', 'auditEvents', 'savedViews']) {
      expect(keys).not.toContain(canonicalKey)
    }
  })
})
