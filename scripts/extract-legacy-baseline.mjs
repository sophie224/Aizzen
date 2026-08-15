/*
 * M0 baseline capture.
 *
 * Runs the legacy app.html seed factory in isolation and emits the same
 * payload the app's Data Tools -> "Export full JSON backup" produces, so the
 * fixture is byte-comparable with a real browser export.
 *
 * Only two fragments of app.html are needed: the small header block defining
 * ERM.modules / ERM.uid / ERM.todayIso, and the seed namespace itself. Neither
 * touches the DOM, React or localStorage.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

const REPO = process.cwd()
const source = readFileSync(`${REPO}/app.html`, 'utf8').split('\n')

// 1-based inclusive line ranges, located by grep against app.html.
const slice = (from, to) => source.slice(from - 1, to).join('\n')

const headerBlock = slice(534, 801) // ERM helpers: modules, uid, todayIso, scoreValue, ...
const seedBlock = slice(1912, 2395) // ERM.createSeedState and its default* factories

const context = createContext({ console })
runInContext(`${headerBlock}\n${seedBlock}\nglobalThis.__ERM = ERM;`, context)

const ERM = context.__ERM
if (typeof ERM?.createSeedState !== 'function') {
  throw new Error('createSeedState was not defined by the extracted blocks')
}

/*
 * The legacy uid() draws on Date.now() and Math.random(), so audit-event IDs
 * differ on every run. Everything else in the seed is hard-coded. Pin the
 * generator to a counter so the fixture is byte-stable and M3 can assert exact
 * equality after migration; the IDs are opaque, and cross-references between
 * globalAudit and risk.audit stay consistent because both read the same call.
 */
let uidCounter = 0
ERM.uid = (prefix) => `${prefix}_baseline_${String(++uidCounter).padStart(4, '0')}`

const state = ERM.createSeedState()

// Mirrors the export wrapper at app.html:2457.
const payload = {
  exportedAt: '2026-01-05T10:00:00.000Z', // pinned, so the fixture is stable across runs
  app: 'AIZEN Risk & Compliance',
  schemaVersion: 7,
  state,
}

mkdirSync(`${REPO}/fixtures`, { recursive: true })
writeFileSync(`${REPO}/fixtures/legacy-state.json`, `${JSON.stringify(payload, null, 2)}\n`)

const count = (key) => (Array.isArray(state[key]) ? state[key].length : 'n/a')
const nested = (key) =>
  state.risks.reduce((total, risk) => total + (Array.isArray(risk[key]) ? risk[key].length : 0), 0)

console.log(
  JSON.stringify(
    {
      schemaVersion: state.version,
      users: count('users'),
      roles: count('roles'),
      categories: count('categories'),
      businessUnits: count('businessUnits'),
      attributes: count('attributes'),
      risks: count('risks'),
      dashboards: count('dashboards'),
      reportTemplates: count('reportTemplates'),
      savedFilters: count('savedFilters'),
      globalAudit: count('globalAudit'),
      matrixCells: state.matrix.cells.length,
      controls: nested('controls'),
      actions: nested('actions'),
      historyItems: nested('history'),
      riskAuditEvents: nested('audit'),
      riskRefs: state.risks.map((risk) => risk.ref),
    },
    null,
    2,
  ),
)
