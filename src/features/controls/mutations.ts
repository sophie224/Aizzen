import type { AppDataStore } from '../../data/app-data-store.ts'
import { nextControlRef, nextDeficiencyRef } from '../../domain/controls/index.ts'
import type {
  ControlDeficiency,
  ControlEvidence,
  ControlFrameworkId,
  RegisterControl,
} from '../../domain/types/index.ts'

/*
 * Every write the two registers perform (CR-2026 §7.3, SEC-10).
 *
 * Centralised so that each create, update and delete goes through the ONE
 * mutation transaction and lands in the audit trail with actor, entity and a
 * readable summary — the change request makes that non-negotiable, and a
 * component writing state directly would bypass it.
 *
 * IDs and timestamps are generated at this edge; the domain layer stays
 * deterministic.
 */

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function now(): string {
  return new Date().toISOString()
}

export interface ControlDraft {
  businessUnitId: string
  name: string
  objective: string
  ownerId: string
  effectiveness: string
  maturity: string
  assurance: string
  evidence: ControlEvidence[]
  custom: Record<string, string | number>
}

export function blankEvidence(): ControlEvidence {
  return { id: newId('cev'), title: '', reference: '', note: '', addedAt: now() }
}

/** Creates a control, issuing the next sequential Control ID (FR-CR-03). */
export async function createControl(
  store: AppDataStore,
  actorId: string,
  draft: ControlDraft,
): Promise<string> {
  const id = newId('ctl')
  const stamp = now()

  await store.update({
    mutate: (next) => {
      const control: RegisterControl = {
        id,
        ref: nextControlRef(next.controls),
        source: 'Manual',
        frameworkId: null,
        frameworkVersion: '',
        ...draft,
        createdAt: stamp,
        updatedAt: stamp,
      }
      next.controls.push(control)
    },
    audit: (next) => {
      const created = next.controls.find((control) => control.id === id)
      return {
        actorId,
        action: 'control.created',
        entityType: 'Control',
        entityId: id,
        summary: `${created?.ref ?? ''} ${draft.name}`.trim(),
      }
    },
  })

  return id
}

export async function updateControl(
  store: AppDataStore,
  actorId: string,
  controlId: string,
  draft: ControlDraft,
  changes: string[],
): Promise<void> {
  await store.update({
    mutate: (next) => {
      const target = next.controls.find((control) => control.id === controlId)
      if (!target) return

      // `ref`, `source` and the framework stamp are deliberately not writable:
      // the Control ID is read-only after creation (§5.2).
      target.businessUnitId = draft.businessUnitId
      target.name = draft.name
      target.objective = draft.objective
      target.ownerId = draft.ownerId
      target.effectiveness = draft.effectiveness
      target.maturity = draft.maturity
      target.assurance = draft.assurance
      target.evidence = draft.evidence
      target.custom = draft.custom
      target.updatedAt = now()
    },
    audit: (next) => {
      const target = next.controls.find((control) => control.id === controlId)
      return {
        actorId,
        action: 'control.updated',
        entityType: 'Control',
        entityId: controlId,
        summary: `${target?.ref ?? ''} ${draft.name}`.trim(),
        changes,
      }
    },
  })
}

/**
 * Deletes a control together with the findings and risk links that reference
 * it, so no record is left pointing at something that no longer exists.
 */
export async function deleteControl(
  store: AppDataStore,
  actorId: string,
  control: RegisterControl,
): Promise<void> {
  await store.update({
    mutate: (next) => {
      next.controls = next.controls.filter((candidate) => candidate.id !== control.id)
      next.controlDeficiencies = next.controlDeficiencies.filter(
        (finding) => finding.controlId !== control.id,
      )
      next.controlRiskLinks = next.controlRiskLinks.filter(
        (link) => link.controlId !== control.id,
      )
    },
    audit: {
      actorId,
      action: 'control.deleted',
      entityType: 'Control',
      entityId: control.id,
      summary: `${control.ref} ${control.name}`.trim(),
    },
  })
}

/** Imports a framework package into one organisational unit (FR-CR-02). */
export async function importFrameworkControls(
  store: AppDataStore,
  actorId: string,
  options: {
    frameworkId: ControlFrameworkId
    frameworkLabel: string
    version: string
    businessUnitId: string
    controls: ReadonlyArray<{ uid: string; name: string; objective: string }>
    defaults: { effectiveness: string; maturity: string; assurance: string }
  },
): Promise<{ imported: number; skipped: number }> {
  const stamp = now()
  let imported = 0
  let skipped = 0

  await store.update({
    mutate: (next) => {
      // Re-importing must not duplicate: a framework UID is unique per unit.
      const present = new Set(
        next.controls
          .filter((control) => control.businessUnitId === options.businessUnitId)
          .map((control) => control.ref.toLowerCase()),
      )

      options.controls.forEach((seed, index) => {
        if (present.has(seed.uid.toLowerCase())) {
          skipped += 1
          return
        }
        imported += 1
        next.controls.push({
          id: `ctl_${options.frameworkId}_${Date.now().toString(36)}_${String(index)}`,
          ref: seed.uid,
          source: 'Framework',
          frameworkId: options.frameworkId,
          frameworkVersion: options.version,
          businessUnitId: options.businessUnitId,
          name: seed.name,
          objective: seed.objective,
          ownerId: '',
          effectiveness: options.defaults.effectiveness,
          maturity: options.defaults.maturity,
          assurance: options.defaults.assurance,
          evidence: [],
          custom: {},
          createdAt: stamp,
          updatedAt: stamp,
        })
      })
    },
    audit: {
      actorId,
      action: 'control.framework_imported',
      entityType: 'Control',
      entityId: options.businessUnitId,
      summary: `${options.frameworkLabel} ${options.version}`,
    },
  })

  return { imported, skipped }
}

export interface ImportCommitRow {
  action: 'create' | 'update'
  targetId: string | null
  values: {
    businessUnitId: string
    name: string
    objective: string
    ownerId: string
    effectiveness: string
    maturity: string
    assurance: string
  }
}

/** Applies the accepted rows of a validated upload in one transaction (FR-CR-06). */
export async function applyControlImport(
  store: AppDataStore,
  actorId: string,
  rows: readonly ImportCommitRow[],
): Promise<void> {
  const stamp = now()

  await store.update({
    mutate: (next) => {
      rows.forEach((row, index) => {
        if (row.action === 'update' && row.targetId) {
          const target = next.controls.find((control) => control.id === row.targetId)
          if (!target) return
          Object.assign(target, row.values, { updatedAt: stamp })
          return
        }

        next.controls.push({
          id: `ctl_upload_${Date.now().toString(36)}_${String(index)}`,
          ref: nextControlRef(next.controls),
          source: 'Upload',
          frameworkId: null,
          frameworkVersion: '',
          ...row.values,
          evidence: [],
          custom: {},
          createdAt: stamp,
          updatedAt: stamp,
        })
      })
    },
    audit: {
      actorId,
      action: 'control.bulk_imported',
      entityType: 'Control',
      entityId: 'bulk',
      summary: `${String(rows.filter((row) => row.action === 'create').length)} created, ${String(
        rows.filter((row) => row.action === 'update').length,
      )} updated`,
    },
  })
}

export interface DeficiencyDraft {
  businessUnitId: string
  controlId: string
  description: string
  classification: string
  remediationOwnerId: string
  remediationDescription: string
  targetDate: string
  custom: Record<string, string | number>
}

export async function createDeficiency(
  store: AppDataStore,
  actorId: string,
  draft: DeficiencyDraft,
): Promise<string> {
  const id = newId('cdf')
  const stamp = now()

  await store.update({
    mutate: (next) => {
      const finding: ControlDeficiency = {
        id,
        ref: nextDeficiencyRef(next.controlDeficiencies),
        ...draft,
        createdAt: stamp,
        updatedAt: stamp,
      }
      next.controlDeficiencies.push(finding)
    },
    audit: (next) => {
      const created = next.controlDeficiencies.find((finding) => finding.id === id)
      return {
        actorId,
        action: 'control_deficiency.created',
        entityType: 'ControlDeficiency',
        entityId: id,
        summary: `${created?.ref ?? ''} ${draft.description.slice(0, 60)}`.trim(),
      }
    },
  })

  return id
}

export async function updateDeficiency(
  store: AppDataStore,
  actorId: string,
  deficiencyId: string,
  draft: DeficiencyDraft,
  changes: string[],
): Promise<void> {
  await store.update({
    mutate: (next) => {
      const target = next.controlDeficiencies.find((finding) => finding.id === deficiencyId)
      if (!target) return
      Object.assign(target, draft, { updatedAt: now() })
    },
    audit: (next) => {
      const target = next.controlDeficiencies.find((finding) => finding.id === deficiencyId)
      return {
        actorId,
        action: 'control_deficiency.updated',
        entityType: 'ControlDeficiency',
        entityId: deficiencyId,
        summary: `${target?.ref ?? ''} ${draft.description.slice(0, 60)}`.trim(),
        changes,
      }
    },
  })
}

export async function deleteDeficiency(
  store: AppDataStore,
  actorId: string,
  deficiency: ControlDeficiency,
): Promise<void> {
  await store.update({
    mutate: (next) => {
      next.controlDeficiencies = next.controlDeficiencies.filter(
        (finding) => finding.id !== deficiency.id,
      )
    },
    audit: {
      actorId,
      action: 'control_deficiency.deleted',
      entityType: 'ControlDeficiency',
      entityId: deficiency.id,
      summary: deficiency.ref,
    },
  })
}

/**
 * Replaces the set of controls linked to a risk (FR-CR-04).
 *
 * The risk record itself is never touched — only the join collection — which
 * is what keeps this change additive for the Risk Register.
 */
export async function setRiskControlLinks(
  store: AppDataStore,
  actorId: string,
  riskId: string,
  controlIds: readonly string[],
  /** Ids the acting user may link; anything else is ignored (SEC-01). */
  permittedControlIds: readonly string[],
): Promise<void> {
  const stamp = now()
  const wanted = controlIds.filter((id) => permittedControlIds.includes(id))

  await store.update({
    mutate: (next) => {
      const others = next.controlRiskLinks.filter((link) => link.riskId !== riskId)
      const existing = next.controlRiskLinks.filter((link) => link.riskId === riskId)

      // Links the user cannot see are preserved untouched: an out-of-scope
      // control must not be silently unlinked by someone who cannot see it.
      const invisible = existing.filter((link) => !permittedControlIds.includes(link.controlId))
      const kept = existing.filter((link) => wanted.includes(link.controlId))
      const added = wanted
        .filter((controlId) => !existing.some((link) => link.controlId === controlId))
        .map((controlId) => ({
          id: newId('clk'),
          riskId,
          controlId,
          createdAt: stamp,
          actorId,
        }))

      next.controlRiskLinks = [...others, ...invisible, ...kept, ...added]
    },
    audit: {
      actorId,
      action: 'control.risk_links_updated',
      entityType: 'Risk',
      entityId: riskId,
      summary: `${String(wanted.length)} control(s) linked`,
    },
  })
}
