import type { AppState } from '../../domain/types/index.ts'
import { SCHEMA_VERSION } from '../../domain/types/index.ts'
import { validateAppState, validateImportableState } from '../../domain/validation/app-state.ts'
import { isRecord } from '../../domain/validation/guards.ts'
import { createSeedState } from '../seed/index.ts'
import { isLegacyV7Shape, migrateLegacyV7Shape } from './legacy-v7.ts'
import {
  repairBusinessUnitTree,
  repairDefaults,
  repairMatrix,
  repairRisks,
  repairRoles,
  repairSavedViews,
  repairSuperAdminUser,
  repairUserScopes,
  type RepairNotes,
} from './repair.ts'

export interface MigrationResult {
  readonly state: AppState
  /** Human-readable reconciliation notes, one per repair applied. */
  readonly notes: RepairNotes
}

export type MigrationOutcome =
  | { readonly ok: true; readonly result: MigrationResult }
  | { readonly ok: false; readonly errors: string[] }

/** Collections that must exist as arrays before repair can run. */
const ARRAY_COLLECTIONS = [
  'users',
  'roles',
  'categories',
  'businessUnits',
  'customAttributes',
  'risks',
  'savedViews',
  'matrixVersions',
  'dashboards',
  'dashboardViews',
  'dashboardLayouts',
  'reportTemplates',
  'auditEvents',
] as const

function ensureCollections(state: Record<string, unknown>): void {
  for (const key of ARRAY_COLLECTIONS) {
    if (!Array.isArray(state[key])) state[key] = []
  }
  if (!isRecord(state.siteContent)) state.siteContent = {}
  if (!isRecord(state.ssoConfig)) state.ssoConfig = createSeedState().ssoConfig
  if (!isRecord(state.branding)) state.branding = { clientLogo: null }
}

/**
 * Migrates any accepted payload to the current schema and repairs it.
 *
 * The pass is **idempotent**: migrating already-current state yields a
 * structurally identical result, which is what makes it safe to run on every
 * load (ARCHITECTURE.md §4.1).
 *
 * It never intentionally deletes valid risk data. Risk IDs, references,
 * scores, controls, actions, history and audit events are all preserved.
 */
export function migrateState(raw: unknown): MigrationOutcome {
  const gate = validateImportableState(raw)
  if (!gate.ok) return { ok: false, errors: gate.errors }

  // Work on a deep clone so a failed migration cannot corrupt the input.
  const cloned: unknown = structuredClone(gate.value)
  if (!isRecord(cloned)) return { ok: false, errors: ['root: expected a JSON object'] }

  const shaped = isLegacyV7Shape(cloned) ? migrateLegacyV7Shape(cloned) : { ...cloned }
  shaped.schemaVersion = SCHEMA_VERSION
  ensureCollections(shaped)

  const state = shaped as unknown as AppState
  const notes: RepairNotes = []

  // Order matters: the tree is repaired before scopes that reference it, and
  // roles before the super-admin user that must hold one.
  repairRoles(state, notes)
  repairBusinessUnitTree(state, notes)
  repairSuperAdminUser(state, notes)
  repairUserScopes(state, notes)
  repairRisks(state, notes)
  repairSavedViews(state, notes)
  repairDefaults(state, notes)
  repairMatrix(state, notes)

  const validated = validateAppState(state)
  if (!validated.ok) return { ok: false, errors: validated.errors }

  return { ok: true, result: { state: validated.value, notes } }
}

export { isLegacyV7Shape, migrateLegacyV7Shape } from './legacy-v7.ts'
export * from './repair.ts'
